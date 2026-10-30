import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parsePhrasebookRequest } = require('../../api/src/phrasebook/parse');
const { validateCandidate } = require('../../api/src/schema');

// Evaluation handles retain e/d/v for authored review locations; x identifies an
// exchange response. These are review-local identities, not production card IDs.
export function toReviewInput({ task, topic: english, group }) {
  const parsed = parsePhrasebookRequest(task);
  assert(!parsed.error, parsed.error);
  assert.equal(task.checklist.length, 1, 'Collection requests contain exactly one topic');
  assert.equal(english.title, task.checklist[0], 'English topic does not match the request');
  assert.equal(group.title, english.title, 'Assembled topic does not match English');
  const topic = structuredClone(group);
  const items = [];
  function add(entry, source, section, handle, index, location = {}) {
    const type = section === 'words' ? 'word' : 'phrase';
    assert.equal(entry.card.type, type, `${section} has the wrong card type`);
    assert.equal(entry.card.lang, task.language, `${section} has the wrong language`);
    assert.equal(entry.card.translation, typeof source === 'string' ? source : source.text, `${section} changed English intent`);
    validateCandidate({ card: entry.card, ...(entry.sources ? { sources: entry.sources } : {}) });
    if (section === 'exampleConversation') assert.equal(entry.speaker, source.speaker, 'Example speaker changed');
    for (const key of ['handle', 'section', 'index', 'english', 'location']) assert(!Object.hasOwn(entry, key), `Reserved evaluation field: ${key}`);
    items.push({ ...structuredClone(entry), handle, section, index, english: structuredClone(source), location });
  }
  function sameCount(actual, expected, section) {
    assert(Array.isArray(actual) && Array.isArray(expected), `Missing ${section}`);
    assert.equal(actual.length, expected.length, `${section} count differs from English`);
  }
  sameCount(group.thingsToSay, english.thingsToSay, 'thingsToSay');
  group.thingsToSay.forEach((entry, index) => add(entry, english.thingsToSay[index], 'thingsToSay', `e:${index}`, index));
  delete topic.thingsToSay;
  sameCount(group.likelyExchanges, english.likelyExchanges, 'likelyExchanges');
  group.likelyExchanges.forEach((exchange, exchangeIndex) => {
    const source = english.likelyExchanges[exchangeIndex];
    assert.equal(exchange.title, source.title, 'Exchange title changed');
    sameCount(exchange.lines, source.lines, 'Exchange turns');
    exchange.lines.forEach((line, turnIndex) => {
      const turn = source.lines[turnIndex];
      assert.equal(line.speaker, turn.speaker, 'Exchange speaker changed');
      sameCount(line.responses, turn.text, 'Exchange responses');
      line.responses.forEach((entry, responseIndex) => add(entry, turn.text[responseIndex], 'likelyExchanges', `x:${exchangeIndex}:${turnIndex}:${responseIndex}`, responseIndex, { exchangeIndex, turnIndex }));
      delete topic.likelyExchanges[exchangeIndex].lines[turnIndex].responses;
    });
  });
  sameCount(group.words, english.words, 'words');
  let wordIndex = 0;
  group.words.forEach((family, familyIndex) => {
    const source = english.words[familyIndex];
    assert.equal(family.title, source.title, 'Word family title changed');
    sameCount(family.items, source.items, 'Word family items');
    family.items.forEach((entry, index) => add(entry, source.items[index], 'words', `v:${wordIndex++}`, index, { familyIndex }));
    delete topic.words[familyIndex].items;
  });
  sameCount(group.exampleConversation, english.exampleConversation, 'exampleConversation');
  group.exampleConversation.forEach((entry, index) => add(entry, english.exampleConversation[index], 'exampleConversation', `d:${index}`, index));
  delete topic.exampleConversation;
  const input = { task: structuredClone(task), topic, items };
  assert.deepEqual(fromReviewInput(input), group, 'Topic conversion must be lossless');
  return input;
}

export function fromReviewInput(input) {
  const group = structuredClone(input.topic);
  const remaining = new Set(input.items);
  let wordIndex = 0;
  function entries(section, prefix, location = {}) {
    return input.items.filter(item => item.section === section && Object.keys(location).every(key => item.location[key] === location[key])).map((item, index) => {
      assert.equal(item.index, index, `${section} indexes are missing, duplicated or reordered`);
      assert.deepEqual(item.location, location, `${section} location is invalid`);
      assert.equal(item.handle, `${prefix}:${section === 'words' ? wordIndex++ : index}`, `${section} handle does not match its index`);
      remaining.delete(item);
      const { handle, section: ignoredSection, index: ignoredIndex, english, location: ignoredLocation, ...entry } = item;
      return structuredClone(entry);
    });
  }
  group.thingsToSay = entries('thingsToSay', 'e');
  group.likelyExchanges.forEach((exchange, exchangeIndex) => exchange.lines.forEach((line, turnIndex) => {
    line.responses = entries('likelyExchanges', `x:${exchangeIndex}:${turnIndex}`, { exchangeIndex, turnIndex });
  }));
  group.words.forEach((family, familyIndex) => { family.items = entries('words', 'v', { familyIndex }); });
  group.exampleConversation = entries('exampleConversation', 'd');
  assert.equal(remaining.size, 0, 'Unknown topic section or location');
  return group;
}
