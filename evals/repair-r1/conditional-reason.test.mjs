import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSchema } from '../../../prompt-romp/src/suite.mjs';
import { normalizeConditionalReason as normalize } from './conditional-reason.mjs';

const schema = JSON.parse(readFileSync(new URL('../suites/repair-r1-conditional-reason/response.schema.json', import.meta.url), 'utf8'));
function fixture() {
  return { task: { language: 'es', ability: 'basics' }, topic: { title: 'Transport' }, items: [
    { handle: 'd:0', section: 'dialogue', index: 0, speaker: 'you', alternative: false,
      english: { text: 'Where is the station?', speaker: 'you' },
      card: { type: 'phrase', lang: 'es', text: '¿Dónde está el hospital?', translation: 'Where is the station?' } },
    { handle: 'v:0', section: 'vocab', index: 0, english: 'station',
      card: { type: 'word', lang: 'es', text: 'estación', translation: 'station', partOfSpeech: 'noun', senseKey: 'station' },
      sources: [
        { snapshot: { lang: 'es', text: 'La estación.', translation: 'The station.' }, span: { start: 3, end: 11 } },
        { snapshot: { lang: 'es', text: 'El tren.', translation: 'The train.' }, span: { start: 3, end: 7 } },
      ] },
  ] };
}
const retained = (handle, status = 'unchanged') => ({ handle, status, changes: [], dropSourceIndexes: [] });
const repair = () => ({ handle: 'd:0', status: 'repaired', reason: 'Restore the intended station.', changes: [{ field: 'text', value: '¿Dónde está la estación?' }], dropSourceIndexes: [] });
const response = first => ({ items: [first, retained('v:0')] });

test('no-change explanations are optional and unresolved items remain explicitly unresolved', () => {
  const input = fixture();
  const parsed = { items: [retained('d:0'), { ...retained('v:0', 'unresolved'), reason: '' }] };
  assert.deepEqual(validateSchema(parsed, schema), []);
  const before = structuredClone({ input, parsed });
  const result = normalize(parsed, input).value;
  assert.deepEqual(result.items, input.items);
  assert.equal(result.application, 'original-retained');
  assert.deepEqual(result.unresolvedHandles, ['v:0']);
  assert.deepEqual(result.response, parsed);
  assert.deepEqual({ input, parsed }, before);
});

test('an empty unchanged reason does not block a valid field repair or mutate read-only context', () => {
  const input = fixture();
  const parsed = { items: [repair(), { ...retained('v:0'), reason: '' }] };
  assert.deepEqual(validateSchema(parsed, schema), []);
  const before = structuredClone({ input, parsed });
  const expected = structuredClone(input.items);
  expected[0].card.text = '¿Dónde está la estación?';
  assert.deepEqual(normalize(parsed, input).value.items, expected);
  assert.deepEqual({ input, parsed }, before);
});

test('field edits and source-only removals still require a bounded nonblank reason', () => {
  for (const change of [repair(), { ...retained('v:0'), status: 'repaired', reason: 'Remove unrelated train evidence.', dropSourceIndexes: [1] }]) {
    for (const reason of [undefined, '', '   ', 'x'.repeat(1001)]) {
      const invalid = { ...change };
      if (reason === undefined) delete invalid.reason; else invalid.reason = reason;
      const parsed = { items: [invalid, retained(change.handle === 'd:0' ? 'v:0' : 'd:0')] };
      assert.throws(() => normalize(parsed, fixture()));
      if (reason !== '   ') assert(validateSchema(parsed, schema).some(finding => finding.hard));
    }
  }
});

test('explained source-only removal preserves the card and remaining historical evidence', () => {
  const input = fixture();
  const parsed = { items: [retained('d:0'), { ...retained('v:0'), status: 'repaired', reason: 'Train occurrence does not support station.', dropSourceIndexes: [1] }] };
  assert.deepEqual(validateSchema(parsed, schema), []);
  const before = structuredClone(input);
  const result = normalize(parsed, input).value;
  assert.equal(result.application, 'applied-in-memory');
  assert.deepEqual(result.items[1].card, input.items[1].card);
  assert.deepEqual(result.items[1].sources, [input.items[1].sources[0]]);
  assert.deepEqual(input, before);
});

test('no-change statuses cannot smuggle edits or source removal through the ignored-reason path', () => {
  for (const status of ['unchanged', 'unresolved']) {
    assert.throws(() => normalize(response({ ...repair(), status }), fixture()));
    assert.throws(() => normalize({ items: [retained('d:0'), { ...retained('v:0', status), dropSourceIndexes: [1] }] }, fixture()));
  }
});

test('complete unique membership is required even when every reason is omitted', () => {
  for (const items of [[retained('d:0')], [retained('d:0'), retained('d:0')], [retained('d:0'), retained('foreign')]]) {
    assert.throws(() => normalize({ items }, fixture()));
  }
});

test('a later invalid repair prevents any result and leaves original cards and responses unchanged', () => {
  const input = fixture();
  const parsed = { items: [repair(), { ...retained('v:0'), status: 'repaired', reason: 'Invalid evidence index.', dropSourceIndexes: [2] }] };
  const before = structuredClone({ input, parsed });
  assert.throws(() => normalize(parsed, input));
  assert.deepEqual({ input, parsed }, before);
});
