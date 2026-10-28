import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
const require = createRequire(import.meta.url);
const { validateCandidate } = require('../../api/src/schema');

const fields = new Set(['text', 'reading', 'romanization', 'partOfSpeech', 'senseKey']);
const findingFields = new Set(['card', 'text', 'translation', 'reading', 'romanization', 'partOfSpeech', 'senseKey', 'sources', 'english']);
const categories = new Set(['meaning', 'spelling-grammar', 'reading-romanization', 'headword-pos', 'evidence', 'reading-accuracy', 'reading-coverage', 'evidence-adequacy', 'dictionary-sense', 'safety-quantifier', 'medical-safety', 'source-ambiguity', 'dialogue-flow']);
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exact(value, keys, label) {
  assert(object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), `${label}: unexpected or missing fields`);
}
function reason(value) { assert(typeof value === 'string' && value.trim() && value.length <= 1000, 'A bounded specific reason is required'); }
function entries(input) {
  assert(Array.isArray(input.items) && input.items.length, 'Topic items are required');
  const map = new Map(input.items.map(item => [item.handle, item]));
  assert(map.size === input.items.length, 'Input handles must be unique');
  return map;
}

// Explicit projection: case expectations, labels and provenance never enter the request.
export function modelInput(input, localized = false) {
  const map = entries(input);
  const items = input.items.map(item => ({
    handle: item.handle, section: item.section, english: item.english,
    ...structuredClone(item.card),
    ...(item.speaker ? { speaker: item.speaker } : {}),
    ...(item.alternative !== undefined ? { alternative: item.alternative } : {}),
    ...(item.sources ? { sources: item.sources.map((source, index) => ({ index, snapshot: source.snapshot, span: source.span })) } : {}),
  }));
  const payload = { context: structuredClone(input.task), title: input.topic.title, items };
  if (localized) {
    exact(input.focus, ['handle', 'field', 'category'], 'Focus');
    assert(map.has(input.focus.handle) && findingFields.has(input.focus.field) && categories.has(input.focus.category), 'Invalid localized focus');
    payload.focus = structuredClone(input.focus);
  }
  return payload;
}
export function buildDetectionPrompt(input, variant) { return { instructions: variant.instructions, input: modelInput(input) }; }
export function buildRepairPrompt(input, variant) {
  const payload = modelInput(input, true);
  const item = input.items.find(item => item.handle === input.focus.handle);
  const focus = input.focus.field;
  const editableFields = ['reading', 'romanization'].includes(focus)
    ? ['reading', 'romanization']
    : ['card', 'text'].includes(focus) || (item.card.type === 'word' && ['partOfSpeech', 'senseKey'].includes(focus))
      ? [...fields].filter(field => item.card.type === 'word' || !['partOfSpeech', 'senseKey'].includes(field))
      : [];
  const schema = structuredClone(variant.schema);
  schema.properties.handle.enum = [input.focus.handle];
  const changes = schema.properties.changes;
  if (editableFields.length) {
    changes.items.anyOf = changes.items.anyOf.filter(branch => {
      branch.properties.field.enum = branch.properties.field.enum.filter(field => editableFields.includes(field));
      return branch.properties.field.enum.length > 0;
    });
  } else {
    // Keep a valid item schema even though no card-field patch is permitted.
    changes.maxItems = 0;
  }
  const omissions = schema.properties.dropSourceIndexes;
  if (item.sources?.length) omissions.items.enum = item.sources.map((_, index) => index);
  else omissions.maxItems = 0;
  payload.editableFields = editableFields;
  return { instructions: variant.instructions, input: payload, schema };
}

export function validateDetection(value, input) {
  exact(value, ['complete', 'findings', 'unresolved'], 'Detection');
  assert(typeof value.complete === 'boolean' && Array.isArray(value.findings) && Array.isArray(value.unresolved), 'Invalid detection envelope');
  const map = entries(input); const seen = new Set(); const unresolved = new Set();
  for (const item of value.findings) {
    exact(item, ['handle', 'field', 'category', 'severity', 'origin', 'reason'], 'Finding');
    assert(map.has(item.handle) && findingFields.has(item.field) && categories.has(item.category), 'Unknown detection location or category');
    assert(['minor', 'material', 'critical'].includes(item.severity) && ['english', 'translation'].includes(item.origin), 'Invalid severity or origin');
    reason(item.reason);
    const key = JSON.stringify([item.handle, item.field, item.category]);
    assert(!seen.has(key), 'Duplicate detection finding'); seen.add(key);
  }
  for (const item of value.unresolved) {
    exact(item, ['handle', 'reason'], 'Unresolved item'); reason(item.reason);
    assert(map.has(item.handle) && !unresolved.has(item.handle), 'Unknown or duplicate unresolved item'); unresolved.add(item.handle);
  }
  return value;
}

export function applyLocalizedRepair(value, input) {
  exact(value, ['handle', 'status', 'reason', 'changes', 'dropSourceIndexes'], 'Repair');
  modelInput(input, true);
  assert(value.handle === input.focus.handle, 'Repair must address exactly the requested handle');
  assert(['unchanged', 'repaired', 'unresolved'].includes(value.status), 'Unknown repair status'); reason(value.reason);
  assert(Array.isArray(value.changes) && Array.isArray(value.dropSourceIndexes), 'Changes and source omissions must be arrays');
  const before = entries(input).get(value.handle);
  const after = structuredClone(before);
  if (value.status !== 'repaired') {
    assert(value.changes.length === 0 && value.dropSourceIndexes.length === 0, 'Unchanged/unresolved cannot carry a partial patch');
    return { response: value, items: structuredClone(input.items), application: 'original-retained', semanticReview: 'not-assessed' };
  }
  const changed = new Set();
  for (const change of value.changes) {
    exact(change, ['field', 'value'], 'Field change');
    assert(fields.has(change.field) && !changed.has(change.field), 'Unknown or duplicate repair field'); changed.add(change.field);
    assert(!isDeepStrictEqual(before.card[change.field], change.value), 'Do not echo unchanged fields');
    assert(!['partOfSpeech', 'senseKey'].includes(change.field) || before.card.type === 'word', 'Word-only field on phrase');
    // Field deletion is intentionally not part of this diagnostic protocol.
    assert(change.value !== null, 'Field deletion is not supported; report unresolved');
    after.card[change.field] = structuredClone(change.value);
  }
  const dropped = new Set();
  for (const index of value.dropSourceIndexes) {
    assert(Number.isSafeInteger(index) && index >= 0 && index < (before.sources?.length ?? 0) && !dropped.has(index), 'Invalid or duplicate source index');
    dropped.add(index);
  }
  if (dropped.size) {
    after.sources = before.sources.filter((_, index) => !dropped.has(index)).map(source => structuredClone(source));
    if (!after.sources.length) delete after.sources;
  }
  assert(changed.size || dropped.size, 'Repaired status needs a real change');
  // Structural reading alignment is checked below. Pronunciation and evidence sense
  // still need independent semantic review; do not demand copies of unchanged fields.
  validateCandidate({ card: after.card, ...(after.sources ? { sources: after.sources } : {}) });
  if (after.card.type === 'word' && ['ja', 'zh'].includes(after.card.lang)) {
    assert(Array.isArray(after.card.reading), 'Generated CJK Word requires reading');
    assert(after.card.reading.every(([base, annotation]) => !/\p{Script=Han}/u.test(base) || typeof annotation === 'string'), 'Han headword segments require pronunciation');
  }
  return { response: value, items: input.items.map(item => item.handle === value.handle ? after : structuredClone(item)), application: 'applied-in-memory', semanticReview: 'not-assessed' };
}
