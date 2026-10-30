// @vitest-environment happy-dom
import {describe,it,expect} from 'vitest';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import {SUGGESTED_PHRASEBOOKS,pendingSuggestions} from '../js/suggested-phrasebooks';
import {createDb,commitPhrasebook,getCards,getSeededDeckIds} from '../js/db';

function draft(group) {
  return {
    id: crypto.randomUUID(), title: group.title,
    thingsToSay: group.thingsToSay.map(card => ({ id: crypto.randomUUID(), card })),
    likelyExchanges: group.likelyExchanges.map(exchange => ({
      id: crypto.randomUUID(), title: exchange.title,
      lines: exchange.lines.map(line => ({
        speaker: line.speaker,
        responses: line.responses.map(card => ({ id: crypto.randomUUID(), card })),
      })),
    })),
    words: group.words.map(family => ({ ...family, id: crypto.randomUUID() })),
    exampleConversation: group.exampleConversation.map(line => ({ ...line, id: crypto.randomUUID() })),
  };
}

describe('authored suggestions',()=>{
  it('persists every authored topic with independent essential and conversation occurrences',async()=>{
    const store = createDb({indexedDB:new IDBFactory(),IDBKeyRange});
    for (const suggestion of SUGGESTED_PHRASEBOOKS) {
      const groups = suggestion.groups.map(draft);
      const deck = await commitPhrasebook({
        name:suggestion.title,lang:suggestion.lang,seedId:suggestion.id,ability:'basics',
        groups,selectedIndexes:groups.map((_,index)=>index),
      },{store});
      const entries = await getCards(deck.id,store);
      const thingsToSay = entries.filter(entry=>entry.occurrence?.section==='thingsToSay');
      const exampleConversation = entries.filter(entry=>entry.occurrence?.section==='exampleConversation');
      expect(thingsToSay.map(entry=>entry.card.text).sort()).toEqual(groups.flatMap(group=>group.thingsToSay.map(phrase=>phrase.card.text)).sort());
      expect(exampleConversation.map(entry=>entry.card.text).sort()).toEqual(groups.flatMap(group=>group.exampleConversation.map(line=>line.card.text)).sort());
      expect(thingsToSay.every(entry=>!('speaker' in entry.occurrence))).toBe(true);
      expect(new Set([...thingsToSay,...exampleConversation].map(entry=>entry.key)).size).toBe(thingsToSay.length+exampleConversation.length);
    }
    expect(pendingSuggestions(await getSeededDeckIds(store))).toEqual([]);
    store.close();
  });
  it('saves authored Words with explicit senses unstarred and hides only the saved suggestion',async()=>{
    const store = createDb({indexedDB:new IDBFactory(),IDBKeyRange});
    const suggestion = SUGGESTED_PHRASEBOOKS.find(item=>item.id==='seed-directions-ja');
    const groups = suggestion.groups.map(draft);
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
