// @vitest-environment happy-dom
import {describe,it,expect} from 'vitest';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import {validateCandidate} from '@catchphrase/card-schema';
import {SUGGESTED_PHRASEBOOKS,pendingSuggestions} from '../js/suggested-phrasebooks';
import {createDb,commitPhrasebook,getCards,getSeededDeckIds} from '../js/db';

describe('authored suggestions',()=>{
  it('uses valid common cards in explicit groups, including ungrouped translations',()=>{
    const ids = new Set();
    for (const suggestion of SUGGESTED_PHRASEBOOKS) {
      expect(ids.has(suggestion.id)).toBe(false);
      ids.add(suggestion.id);
      for (const group of suggestion.groups) {
        for (const phrase of group.phrases) validateCandidate({card:phrase});
        for (const candidate of group.vocab) validateCandidate(candidate);
      }
    }
    expect(SUGGESTED_PHRASEBOOKS[0].groups.map(group=>group.title)).toEqual([undefined,'General greetings','Questions']);
  });
  it('saves authored Words with explicit senses unstarred and hides only the saved suggestion',async()=>{
    const store = createDb({indexedDB:new IDBFactory(),IDBKeyRange});
    const suggestion = SUGGESTED_PHRASEBOOKS.find(item=>item.id==='seed-directions-ja');
    const groups = suggestion.groups.map(group=>({...group,id:crypto.randomUUID(),phrases:group.phrases.map(card=>({id:crypto.randomUUID(),card}))}));
    const deck = await commitPhrasebook({name:suggestion.title,lang:suggestion.lang,ability:'basics',seedId:suggestion.id,groups,selectedIndexes:groups.map((_,index)=>index)},{store});
    const entries = await getCards(deck.id,store);
    expect(entries.filter(entry=>entry.card.type==='word').map(entry=>entry.card.senseKey)).toEqual(['right-direction','left-direction']);
    expect(entries.every(entry=>entry.membership.starredAt===null)).toBe(true);
    expect(deck).not.toHaveProperty('generation');
    expect(pendingSuggestions(await getSeededDeckIds(store)).map(item=>item.id)).not.toContain(suggestion.id);
    store.close();
  });
});
