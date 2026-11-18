import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generatePhrasebook, generatePhrasebookImage, getPhraseBreakdown, getContext, ApiError } from '../js/phrasebook-api';
import { getApiCredentials, invalidateApiCredentials } from '../js/api-identity';

vi.mock('../js/api-config', () => ({
  getApiConfiguration: () => ({apiUrl: 'https://api.example.test'}),
}));
vi.mock('../js/api-identity', () => ({
  getApiCredentials: vi.fn(),
  invalidateApiCredentials: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  getApiCredentials.mockResolvedValue({identityToken:'identity',appCheckToken:'app-check'});
});

afterEach(() => vi.unstubAllGlobals());
const usage = {model:'fixture',inputTokens:0,outputTokens:0,totalTokens:0,costUsd:null,durationMs:0};
const snapshot = {lang:'es',text:'caluroso',translation:'hot'};
function response() {
  return {schemaVersion:2,usage,flags:[],chunks:[{start:0,end:8,text:'caluroso',gloss:'hot',role:'adjective',explanation:'Describes weather.',words:[{card:{type:'word',...snapshot,partOfSpeech:'adjective',senseKey:'high-temperature'},sources:[{snapshot,span:{start:0,end:8}}]}],target:{kind:'word',index:0}}]};
}
function serve(value) { vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>value}))); }
const request = {seed:'dinner',language:'es',ability:'basics',answers:{},checklist:['Order','Pay']};
function phrasebook(titles = request.checklist) {
  let id = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++id).padStart(12,'0')}`;
  const phrase = (text,translation) => ({id:uuid(),card:{type:'phrase',lang:'es',text,translation}});
  return {schemaVersion:4,title:'Dinner',usage,flags:[],groups:titles.map(title=>({
    id:uuid(),title,
    thingsToSay:[phrase('Soy vegano.','I am vegan.')],
    likelyExchanges:[{id:uuid(),title:'Order food',lines:[
      {speaker:'you',responses:[phrase('¿Tiene verduras?','Do you have vegetables?')]},
      {speaker:'partner',responses:[phrase('Sí.','Yes.'),phrase('No.','No.')]},
    ]}],
    exampleConversation:[
      {...phrase('Hola.','Hello.'),speaker:'you'},
      {...phrase('Buenas.','Hello.'),speaker:'partner'},
    ],
    words:[],
  }))};
}

describe('content response trust boundary',()=>{
  it('rejects old phrasebook envelopes before creation can persist them',async()=>{
    serve({title:'Dinner',groups:[{title:'Order',cards:[],vocab:[]}],usage});
    await expect(generatePhrasebook({seed:'dinner',language:'es',ability:'basics',answers:{},checklist:['Order']})).rejects.toThrow(/schemaVersion/);
  });
  it('retains independent essentials and duplicate-title topics in request order',async()=>{
    serve(phrasebook(['Order','Order']));
    const result = await generatePhrasebook({...request,checklist:['Order','Order']});
    expect(result.groups.map(group=>group.thingsToSay[0].card.translation)).toEqual(['I am vegan.','I am vegan.']);
    expect(result.groups[0].id).not.toBe(result.groups[1].id);
    expect(result.groups[0].words).toEqual([]);
  });
  it.each([['Order'],['Pay','Order'],['Order','Unrequested']])('rejects a structurally valid but wrong checklist: %j',async(...titles)=>{
    serve(phrasebook(titles));
    await expect(generatePhrasebook(request)).rejects.toThrow(/checklist/);
  });
  it('rejects missing sections and retired v2 phrasebooks',async()=>{
    const missing = phrasebook();
    delete missing.groups[0].thingsToSay;
    serve(missing);
    await expect(generatePhrasebook(request)).rejects.toThrow(/thingsToSay/);
    serve({...phrasebook(),schemaVersion:2});
    await expect(generatePhrasebook(request)).rejects.toThrow(/schemaVersion/);
  });
  it('rejects missing, blank and overlong cover prompts',async()=>{
    const context = {questions:[{label:'Where?',options:['Restaurant','Cafe']}],checklist:[{label:'Order',checked:true}],imagePrompt:'A watercolor still life of a bowl and a glass.',usage};
    for (const imagePrompt of [undefined,'','x'.repeat(2001)]) {
      serve({...context,imagePrompt});
      await expect(getContext({seed:'dinner',language:'es'})).rejects.toThrow(/imagePrompt/);
    }
  });
  it('rejects remote or malformed image results instead of saving an unsafe URL',async()=>{
    const usage = {model:'fixture',costUsd:null,durationMs:1,stages:[{provider:'openrouter',model:'fixture',costUsd:null,durationMs:1}]};
    for (const dataUrl of ['https://untrusted.example/image.png','data:image/png;base64,invalid']) {
      serve({image:{dataUrl,mediaType:'image/png',width:160,height:90},usage});
      await expect(generatePhrasebookImage({prompt:'A watercolor.'})).rejects.toThrow(/image/);
    }
  });
  it('lets dismissal abort the actual image network request',async()=>{
    const controller = new AbortController();
    vi.stubGlobal('fetch',vi.fn((_url,{signal})=>new Promise((_resolve,reject)=>{
      signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
    })));
    const result = generatePhrasebookImage({prompt:'A watercolor.',signal:controller.signal});
    controller.abort();
    await expect(result).rejects.toMatchObject({name:'AbortError'});
  });
  it('accepts request-bound evidence but rejects cached or provider evidence for another interpretation',async()=>{
    serve(response());
    const result = await getPhraseBreakdown({source:{snapshot}});
    expect(result.chunks[0].words[0].card.senseKey).toBe('high-temperature');
    const wrong = response();
    wrong.chunks[0].words[0].sources = [{snapshot:{...snapshot,translation:'unrelated'},span:{start:0,end:8}}];
    serve(wrong);
    await expect(getPhraseBreakdown({source:{snapshot}})).rejects.toThrow(/snapshot/);
  });
  it('preserves HTTP failures when response bodies are malformed',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:502,json:async()=>{throw new Error('not JSON');}})));
    await expect(getContext({seed:'dinner',language:'es'})).rejects.toEqual(new ApiError('/context failed (502)',502));
  });
});

describe('protected request behavior', () => {
  it('waits for verification and sends one authenticated POST', async () => {
    let complete;
    getApiCredentials.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    serve({title:'Dinner'});
    const result = getContext({seed:'dinner',language:'es'});
    expect(fetch).not.toHaveBeenCalled();
    complete({identityToken:'fresh-identity',appCheckToken:'fresh-app'});
    await expect(result).rejects.toThrow(); // deliberately invalid context response
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].headers).toMatchObject({
      Authorization:'Bearer fresh-identity','X-Firebase-AppCheck':'fresh-app',
    });
  });
  it('never sends a POST after cancellation during credential acquisition', async () => {
    let complete;
    getApiCredentials.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    serve({});
    const controller = new AbortController();
    const result = getContext({seed:'dinner',language:'es',signal:controller.signal});
    controller.abort();
    complete({identityToken:'identity',appCheckToken:'app'});
    await expect(result).rejects.toMatchObject({name:'AbortError'});
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([401,403])('invalidates acquisition without replaying a %s POST', async status => {
    vi.stubGlobal('fetch',vi.fn(async () => ({
      ok:false,status,json:async () => { throw new Error('HTML gateway response'); },
    })));
    await expect(getContext({seed:'dinner',language:'es'})).rejects.toMatchObject({status,message:expect.stringMatching(/verified/)});
    expect(invalidateApiCredentials).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('preserves caller quota and server retry guidance without resetting identity', async () => {
    vi.stubGlobal('fetch',vi.fn(async () => ({
      ok:false,status:429,headers:new Headers({'Retry-After':'120'}),
      json:async () => ({error:'quota',code:'CALLER_QUOTA'}),
    })));
    await expect(getContext({seed:'dinner',language:'es'})).rejects.toMatchObject({
      status:429,code:'CALLER_QUOTA',retryAfterSeconds:120,message:expect.stringContaining('120 seconds'),
    });
    expect(invalidateApiCredentials).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('keeps paused guidance and retry timing', async () => {
    vi.stubGlobal('fetch',vi.fn(async () => ({
      ok:false,status:503,json:async () => ({error:'paused',code:'GENERATION_PAUSED',retryAfterSeconds:30}),
    })));
    await expect(getContext({seed:'dinner',language:'es'})).rejects.toMatchObject({
      code:'GENERATION_PAUSED',retryAfterSeconds:30,message:expect.stringMatching(/paused.*30 seconds/),
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('reports ambiguous network failure without automatic replay', async () => {
    vi.stubGlobal('fetch',vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(getContext({seed:'dinner',language:'es'})).rejects.toMatchObject({
      code:'NETWORK_UNCERTAIN',message:expect.stringContaining('may already have consumed'),
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('warns about allowance if the successful response stream fails without replay', async () => {
    vi.stubGlobal('fetch',vi.fn(async () => ({
      ok:true,status:200,json:async () => { throw new TypeError('Stream interrupted'); },
    })));
    await expect(getContext({seed:'dinner',language:'es'})).rejects.toMatchObject({
      code:'RESPONSE_UNCERTAIN',message:expect.stringContaining('may already have consumed'),
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
