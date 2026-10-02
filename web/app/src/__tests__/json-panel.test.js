// @vitest-environment happy-dom
import {describe,it,expect} from 'vitest';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import {validateCardBatch} from '@catchphrase/card-schema';
import {toImportJson} from '../components/json-panel';
import {createDb,commitPhrasebook,toggleCardStar,getCards,getCardsByLang,importCards} from '../js/db';

const snapshot = {lang:'ja',text:'肉も魚も食べません。',translation:"I don't eat meat or fish.",reading:[['肉','にく'],['も',null],['魚','さかな'],['も',null],['食','た'],['べません。',null]]};
const source = {snapshot,span:{start:0,end:2}};
const chunk = {card:{type:'chunk',lang:'ja',text:'肉も',translation:'neither meat',source,role:'<img src=x onerror=alert(1)>',explanation:'Part of the negative listing.'}};
const word = {card:{type:'word',lang:'ja',text:'食べる',translation:'eat',partOfSpeech:'verb',senseKey:'consume-food',reading:[['食','た'],['べる',null]]},sources:[{snapshot,span:{start:4,end:9}}]};

describe('v2 content exchange',()=>{
  it('round trips saved Chunk context and Word evidence without membership stars or metadata',async()=>{
    const store = createDb({indexedDB:new IDBFactory(),IDBKeyRange});
    const card = {type:'phrase',...snapshot};
    const deck = await commitPhrasebook({name:'Dinner',lang:'ja',groups:[{
      id:'draft',title:'Dietary needs',essentials:[{id:'essential',card}],vocab:[],
      dialogue:[{id:'you',card,speaker:'you'},{id:'partner',card,speaker:'partner'}],
    }],selectedIndexes:[0]},{store});
    await toggleCardStar(deck.id,word,store);
    await toggleCardStar(deck.id,chunk,store);
    const entries = await getCards(deck.id,store);
    const json = toImportJson(entries);
    const parsed = validateCardBatch(JSON.parse(json));
    expect(parsed.cards.find(candidate=>candidate.card.type==='chunk')).toEqual(chunk);
    expect(parsed.cards.find(candidate=>candidate.card.type==='word')).toEqual(word);
    for (const candidate of parsed.cards) {
      expect(candidate).not.toHaveProperty('membership');
      expect(candidate.card).not.toHaveProperty('id');
      expect(candidate.card).not.toHaveProperty('state');
    }
    const restored = createDb({indexedDB:new IDBFactory(),IDBKeyRange});
    await importCards(parsed.cards,null,restored);
    expect(await restored.memberships.count()).toBe(0);
    const reexported = validateCardBatch(JSON.parse(toImportJson(await getCardsByLang('ja',restored))));
    expect(reexported.cards).toEqual(expect.arrayContaining(parsed.cards));
    store.close(); restored.close();
  });
  it('imports and reexports native Ukrainian without requiring readings',async()=>{
    const candidates = [
      {card:{type:'phrase',lang:'uk',text:'Де вокзал?',translation:'Where is the station?'}},
      {card:{type:'word',lang:'uk',text:'вокзал',translation:'station',partOfSpeech:'noun',senseKey:'train-station'}},
    ];
    const store = createDb({indexedDB:new IDBFactory(),IDBKeyRange});
    try {
      await importCards(candidates,null,store);
      const reexported = validateCardBatch(JSON.parse(toImportJson(await getCardsByLang('uk',store))));
      expect(reexported.cards.sort((a,b)=>a.card.type.localeCompare(b.card.type)))
        .toEqual([...candidates].sort((a,b)=>a.card.type.localeCompare(b.card.type)));
    } finally {
      store.close();
    }
  });
  it('exports repeated appearances once while merging distinct historical examples',()=>{
    const second = {...word.sources[0],snapshot:{...snapshot,translation:'No meat or fish for me.'}};
    const entry = {key:'first',cardId:'word',card:word.card,sources:word.sources};
    const batch = validateCardBatch(JSON.parse(toImportJson([entry,{...entry,key:'second',sources:[word.sources[0],second]}])));
    expect(batch.cards).toEqual([{card:word.card,sources:[word.sources[0],second]}]);
  });
});
