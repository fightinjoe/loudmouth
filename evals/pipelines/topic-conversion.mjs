import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parsePhrasebookRequest } = require('../../api/src/phrasebook/parse');
const { validateCandidate } = require('../../api/src/schema');

const sections = [
  ['essentials', 'essentials', 'e', 'phrase'],
  ['dialogue', 'lines', 'd', 'phrase'],
  ['vocab', 'vocab', 'v', 'word'],
];

// Evaluation only. Preserve the assembled production topic, including historical
// evidence refs and occurrence IDs; the existing reviewer projection hides IDs.
export function toReviewInput({ task, conversation, group }) {
  const parsed = parsePhrasebookRequest(task);
  assert(!parsed.error, parsed.error);
  assert.equal(task.checklist.length, 1, 'Collection requests contain exactly one topic');
  assert.equal(conversation.title, task.checklist[0], 'English topic does not match the request');
  assert.equal(group.title, conversation.title, 'Assembled topic does not match English');
  const topic = structuredClone(group);
  const items = [];
  for (const [section, englishSection, prefix, type] of sections) {
    assert(Array.isArray(group[section]) && Array.isArray(conversation[englishSection]), `Missing ${section}`);
    assert.equal(group[section].length, conversation[englishSection].length, `${section} count differs from English`);
    delete topic[section];
    group[section].forEach((entry, index) => {
      const english = conversation[englishSection][index];
      assert.equal(entry.card.type, type, `${section} has the wrong card type`);
      assert.equal(entry.card.lang, task.language, `${section} has the wrong language`);
      assert.equal(entry.card.translation, section === 'dialogue' ? english.text : english, `${section} changed English intent`);
      validateCandidate({ card: entry.card, ...(entry.sources ? { sources: entry.sources } : {}) });
      if (section === 'dialogue') {
        assert.equal(entry.speaker, english.speaker, 'Dialogue speaker changed');
        assert.equal(entry.alternative, english.alternative, 'Dialogue alternative changed');
      }
      for (const key of ['handle', 'section', 'index', 'english']) assert(!Object.hasOwn(entry, key), `Reserved evaluation field: ${key}`);
      items.push({ ...structuredClone(entry), handle: `${prefix}:${index}`, section, index, english: structuredClone(english) });
    });
  }
  const input = { task: structuredClone(task), topic, items };
  assert.deepEqual(fromReviewInput(input), group, 'Topic conversion must be lossless');
  return input;
}

function fromReviewInput(input) {
  const group = structuredClone(input.topic);
  const remaining = new Set(input.items);
  for (const [section, , prefix] of sections) {
    group[section] = input.items.filter(item => item.section === section).map((item, index) => {
      assert.equal(item.index, index, `${section} indexes are missing, duplicated or reordered`);
      assert.equal(item.handle, `${prefix}:${index}`, `${section} handle does not match its index`);
      remaining.delete(item);
      const { handle, section: ignoredSection, index: ignoredIndex, english, ...entry } = item;
      return structuredClone(entry);
    });
  }
  assert.equal(remaining.size, 0, 'Unknown topic section');
  return group;
}
