import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';

const require = createRequire(import.meta.url);
const { validateCandidate, cardIdentity } = require('../../../api/src/schema');
const editableFields = new Set(['text', 'reading', 'romanization', 'partOfSpeech', 'senseKey', 'notes', 'example']);
const wordFields = new Set(['partOfSpeech', 'senseKey', 'notes', 'example']);
const responseFields = new Set(['handle', 'status', 'reason', 'changes', 'dropSourceIndexes']);
const cjk = new Set(['ja', 'zh']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function exact(value, keys, label) {
  assert(object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), `${label}: unexpected or missing fields`);
}

function translatedExample(example) {
  assert(typeof example?.translation === 'string' && example.translation.trim(), 'A teaching example requires an English translation');
}

function alignedCjkReading(form, label) {
  // Shared validation checks exact token/base alignment and token shape first.
  assert(Array.isArray(form.reading), `${label} requires reading`);
  assert(form.reading.every(([base, annotation]) => !/\p{Script=Han}/u.test(base) || typeof annotation === 'string'), `${label} Han segments require pronunciation`);
}

function sharedProjection(card) {
  const extended = card?.partOfSpeech === 'counter' || card?.partOfSpeech === 'classifier';
  if (!extended) return card;
  assert(card.type === 'word' && ((card.lang === 'ja' && card.partOfSpeech === 'counter')
    || (card.lang === 'zh' && card.partOfSpeech === 'classifier')), 'Extended POS is limited to Japanese counters and Chinese classifiers');
  // Evaluation-only projection: preserve every field and validate against the shared
  // Card contract using an accepted enum value. Never change the actual card or its
  // identity, and never relax the production schema or persist this projection.
  return { ...card, partOfSpeech: 'noun' };
}

export function validatePosUsageCandidate(candidate) {
  const projected = sharedProjection(candidate?.card);
  validateCandidate(projected === candidate?.card ? candidate : { ...candidate, card: projected });
  const card = candidate.card;
  if (cjk.has(card.lang)) {
    if (card.type === 'word') alignedCjkReading(card, 'CJK Word');
    if (Object.hasOwn(card, 'example')) alignedCjkReading(card.example, 'CJK example');
  }
  if (['counter', 'classifier'].includes(card.partOfSpeech) && Object.hasOwn(card, 'example')) translatedExample(card.example);
  return candidate;
}

export function posUsageIdentity(card) {
  validatePosUsageCandidate({ card });
  const identity = cardIdentity(sharedProjection(card));
  if (card.type !== 'word') return identity;
  // Retain shared NFC/trim identity normalization, but retain the true P1 POS.
  const parts = JSON.parse(identity);
  parts[3] = card.partOfSpeech;
  return JSON.stringify(parts);
}

function candidate(item) {
  return { card: item.card, ...(Object.hasOwn(item, 'sources') ? { sources: item.sources } : {}) };
}

function rejectNewCollisions(originals, output) {
  const originsByIdentity = new Map();
  for (let index = 0; index < output.length; index += 1) {
    if (output[index].card.type !== 'word') continue;
    const identity = posUsageIdentity(output[index].card);
    const originalIdentity = posUsageIdentity(originals[index].card);
    const origin = originsByIdentity.get(identity);
    // Repeating one canonical Word in different placements is legal. Distinct
    // original identities may not collapse into one output identity, even if both
    // items were repaired or have different translations/notes/source occurrences.
    assert(origin === undefined || origin === originalIdentity, 'Repair induces a Word identity collision');
    originsByIdentity.set(identity, originalIdentity);
  }
}

export function normalizePosUsage(parsed, input) {
  exact(parsed, ['items'], 'Topic response');
  assert(Array.isArray(input?.items) && input.items.length, 'Topic items are required');
  const handles = input.items.map(item => item.handle);
  const available = new Set(handles);
  assert(handles.every(handle => typeof handle === 'string' && handle.length) && available.size === handles.length, 'Input handles must be nonempty and unique');
  // Validate originals too: unchanged/unresolved cannot bypass evaluation policy.
  for (const item of input.items) validatePosUsageCandidate(candidate(item));
  assert(Array.isArray(parsed.items) && parsed.items.length === handles.length, 'Exactly one response per original handle is required');
  const byHandle = new Map();
  for (const response of parsed.items) {
    assert(object(response) && Object.keys(response).every(key => responseFields.has(key))
      && ['handle', 'status', 'changes', 'dropSourceIndexes'].every(key => Object.hasOwn(response, key)), 'Unexpected or missing response fields');
    assert(available.has(response.handle) && !byHandle.has(response.handle), 'Unknown or duplicate response handle');
    assert(['unchanged', 'repaired', 'unresolved'].includes(response.status), 'Unknown repair status');
    assert(Array.isArray(response.changes) && Array.isArray(response.dropSourceIndexes), 'Changes and source omissions must be arrays');
    if (response.status === 'repaired') {
      assert(typeof response.reason === 'string' && response.reason.trim() && response.reason.length <= 1000, 'A bounded specific reason is required for repairs');
    } else {
      assert(response.changes.length === 0 && response.dropSourceIndexes.length === 0, 'Unchanged/unresolved cannot carry a partial patch');
      assert(!Object.hasOwn(response, 'reason') || typeof response.reason === 'string', 'Optional reason must be a string');
    }
    byHandle.set(response.handle, response);
  }
  // Every patch starts from its original. No result is returned unless all complete
  // repaired candidates and the final identity set validate; failures are atomic.
  const items = input.items.map(before => {
    const response = byHandle.get(before.handle);
    const after = structuredClone(before);
    if (response.status !== 'repaired') return after;
    const changed = new Set();
    for (const change of response.changes) {
      exact(change, ['field', 'value'], 'Field change');
      assert(editableFields.has(change.field) && !changed.has(change.field), 'Unknown or duplicate repair field');
      assert(!wordFields.has(change.field) || before.card.type === 'word', 'Word-only field on non-Word');
      assert(change.value !== null && change.value !== undefined, 'Field deletion is not supported; report unresolved');
      assert(!isDeepStrictEqual(before.card[change.field], change.value), 'Do not echo unchanged fields');
      if (change.field === 'example') translatedExample(change.value);
      changed.add(change.field);
      after.card[change.field] = structuredClone(change.value);
    }
    const dropped = new Set();
    for (const index of response.dropSourceIndexes) {
      assert(Number.isSafeInteger(index) && index >= 0 && index < (before.sources?.length ?? 0) && !dropped.has(index), 'Invalid or duplicate source index');
      dropped.add(index);
    }
    if (dropped.size) {
      after.sources = before.sources.filter((_, index) => !dropped.has(index)).map(source => structuredClone(source));
      if (!after.sources.length) delete after.sources;
    }
    assert(changed.size || dropped.size, 'Repaired status needs a real change');
    validatePosUsageCandidate(candidate(after));
    return after;
  });
  rejectNewCollisions(input.items, items);
  return {
    value: {
      response: parsed,
      items,
      application: parsed.items.some(response => response.status === 'repaired') ? 'applied-in-memory' : 'original-retained',
      unresolvedHandles: handles.filter(handle => byHandle.get(handle).status === 'unresolved'),
    },
    changes: [{ path: '', reason: 'Apply evaluation-only P1 POS/usage repairs atomically with conditional reasons, full shared-Card validation through explicit enum projection, immutable translations/metadata/evidence, and simulated true-POS identity collision checks. Structural validity is not linguistic approval.' }],
  };
}
