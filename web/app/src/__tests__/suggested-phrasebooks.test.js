// @vitest-environment happy-dom
import {describe,it,expect} from 'vitest';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import {SUGGESTED_PHRASEBOOKS,pendingSuggestions} from '../js/suggested-phrasebooks';
import {createDb,commitPhrasebook,getCards,getSeededDeckIds} from '../js/db';

describe('authored suggestions',()=>{
  it('persists every authored topic with independent essential and conversation occurrences',async()=>{
    const store = createDb({indexedDB:new IDBFactory(),IDBKeyRange});
    for (const suggestion of SUGGESTED_PHRASEBOOKS) {
      const groups = suggestion.groups.map(group=>({
        ...group,id:crypto.randomUUID(),
        essentials:group.essentials.map(card=>({id:crypto.randomUUID(),card})),
        dialogue:group.dialogue.map(line=>({...line,id:crypto.randomUUID()})),
      }));
      const deck = await commitPhrasebook({
        name:suggestion.title,lang:suggestion.lang,seedId:suggestion.id,ability:'basics',
        groups,selectedIndexes:groups.map((_,index)=>index),
      },{store});
      const entries = await getCards(deck.id,store);
      const essentials = entries.filter(entry=>entry.occurrence?.section==='essentials');
      const dialogue = entries.filter(entry=>entry.occurrence?.section==='dialogue');
      expect(essentials.map(entry=>entry.card.text).sort()).toEqual(groups.flatMap(group=>group.essentials.map(phrase=>phrase.card.text)).sort());
      expect(dialogue.map(entry=>entry.card.text).sort()).toEqual(groups.flatMap(group=>group.dialogue.map(line=>line.card.text)).sort());
      expect(essentials.every(entry=>!('speaker' in entry.occurrence))).toBe(true);
      expect(new Set([...essentials,...dialogue].map(entry=>entry.key)).size).toBe(essentials.length+dialogue.length);
    }
    expect(pendingSuggestions(await getSeededDeckIds(store))).toEqual([]);
    store.close();
  });
  it('saves authored Words with explicit senses unstarred and hides only the saved suggestion',async()=>{
    const store = createDb({indexedDB:new IDBFactory(),IDBKeyRange});
    const suggestion = SUGGESTED_PHRASEBOOKS.find(item=>item.id==='seed-directions-ja');
    const groups = suggestion.groups.map(group=>({
      ...group,id:crypto.randomUUID(),
      essentials:group.essentials.map(card=>({id:crypto.randomUUID(),card})),
      dialogue:group.dialogue.map(line=>({...line,id:crypto.randomUUID()})),
    }));
    const deck = await commitPhrasebook({name:suggestion.title,lang:suggestion.lang,ability:'basics',seedId:suggestion.id,groups,selectedIndexes:groups.map((_,index)=>index)},{store});
    const entries = await getCards(deck.id,store);
    const [savedGroup] = await store.groups.where('deckId').equals(deck.id).toArray();
    expect(entries.filter(entry=>entry.card.type==='word').map(entry=>entry.card.senseKey)).toEqual(['right-direction','left-direction']);
    expect(entries.filter(entry=>entry.wordPlacement).map(entry=>entry.wordPlacement.groupId))
      .toEqual([savedGroup.id,savedGroup.id]);
    expect(entries.every(entry=>entry.membership.starredAt===null)).toBe(true);
    expect(deck).not.toHaveProperty('generation');
    expect(pendingSuggestions(await getSeededDeckIds(store)).map(item=>item.id)).not.toContain(suggestion.id);
    store.close();
  });
});
