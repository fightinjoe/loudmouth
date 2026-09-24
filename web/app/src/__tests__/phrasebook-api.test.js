import { afterEach, describe, expect, it, vi } from 'vitest';
import { generatePhrasebook, getPhraseBreakdown, getContext, ApiError } from '../js/phrasebook-api';

afterEach(() => vi.unstubAllGlobals());
const usage = {model:'fixture',inputTokens:0,outputTokens:0,totalTokens:0,costUsd:null,durationMs:0};
const snapshot = {lang:'es',text:'caluroso',translation:'hot'};
function response() {
  return {schemaVersion:2,usage,chunks:[{start:0,end:8,text:'caluroso',gloss:'hot',role:'adjective',explanation:'Describes weather.',words:[{card:{type:'word',...snapshot,partOfSpeech:'adjective',senseKey:'high-temperature'},sources:[{snapshot,span:{start:0,end:8}}]}],target:{kind:'word',index:0}}]};
}
function serve(value) { vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>value}))); }

describe('content response trust boundary',()=>{
  it('rejects old phrasebook envelopes before creation can persist them',async()=>{
    serve({title:'Dinner',groups:[{title:'Order',cards:[],vocab:[]}],usage});
    await expect(generatePhrasebook({seed:'dinner',language:'es',ability:'basics',answers:{},checklist:['Order']})).rejects.toThrow(/schemaVersion/);
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
