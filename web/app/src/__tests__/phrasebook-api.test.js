import { afterEach, describe, expect, it, vi } from 'vitest';
import { generatePhrasebook, generatePhrasebookImage, getPhraseBreakdown, getContext, ApiError } from '../js/phrasebook-api';

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
  return {schemaVersion:3,title:'Dinner',usage,flags:[],groups:titles.map(title=>({
    id:uuid(),title,
    essentials:[phrase('Soy vegano.','I am vegan.')],
    dialogue:[
      {...phrase('Hola.','Hello.'),speaker:'you'},
      {...phrase('Buenas.','Hello.'),speaker:'partner'},
    ],
    vocab:[],
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
    expect(result.groups.map(group=>group.essentials[0].card.translation)).toEqual(['I am vegan.','I am vegan.']);
    expect(result.groups[0].id).not.toBe(result.groups[1].id);
    expect(result.groups[0].vocab).toEqual([]);
  });
  it.each([['Order'],['Pay','Order'],['Order','Unrequested']])('rejects a structurally valid but wrong checklist: %j',async(...titles)=>{
    serve(phrasebook(titles));
    await expect(generatePhrasebook(request)).rejects.toThrow(/checklist/);
  });
  it('rejects missing sections and retired v2 phrasebooks',async()=>{
    const missing = phrasebook();
    delete missing.groups[0].essentials;
    serve(missing);
    await expect(generatePhrasebook(request)).rejects.toThrow(/essentials/);
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
