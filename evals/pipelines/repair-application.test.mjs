import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRepairResponses as apply } from './repair-application.mjs';

function fixture() {
  return { task: { language: 'es', ability: 'basics' }, topic: { title: 'Transport' }, items: [
    { handle: 'd:0', section: 'exampleConversation', index: 0, speaker: 'you',
      english: { text: 'Where is the station?', speaker: 'you' },
      card: { type: 'phrase', lang: 'es', text: '¿Dónde está el hospital?', translation: 'Where is the station?' } },
    { handle: 'v:0', section: 'words', index: 0, english: 'station',
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
  const before = structuredClone({ input, parsed });
  const result = apply(parsed, input);
  assert.deepEqual(result.items, input.items);
  assert.equal(result.application, 'original-retained');
  assert.deepEqual(result.unresolvedHandles, ['v:0']);
  assert.deepEqual({ input, parsed }, before);
});

test('an empty unchanged reason does not block a valid field repair or mutate read-only context', () => {
  const input = fixture();
  const parsed = { items: [repair(), { ...retained('v:0'), reason: '' }] };
  const before = structuredClone({ input, parsed });
  const expected = structuredClone(input.items);
  expected[0].card.text = '¿Dónde está la estación?';
  assert.deepEqual(apply(parsed, input).items, expected);
  assert.deepEqual({ input, parsed }, before);
});

test('field edits and source-only removals still require a bounded nonblank reason', () => {
  for (const change of [repair(), { ...retained('v:0'), status: 'repaired', reason: 'Remove unrelated train evidence.', dropSourceIndexes: [1] }]) {
    for (const reason of [undefined, '', '   ', 'x'.repeat(1001)]) {
      const invalid = { ...change };
      if (reason === undefined) delete invalid.reason; else invalid.reason = reason;
      const parsed = { items: [invalid, retained(change.handle === 'd:0' ? 'v:0' : 'd:0')] };
      assert.throws(() => apply(parsed, fixture()));
    }
  }
});

test('explained source-only removal preserves the card and remaining historical evidence', () => {
  const input = fixture();
  const parsed = { items: [retained('d:0'), { ...retained('v:0'), status: 'repaired', reason: 'Train occurrence does not support station.', dropSourceIndexes: [1] }] };
  const before = structuredClone(input);
  const result = apply(parsed, input);
  assert.equal(result.application, 'applied-in-memory');
  assert.deepEqual(result.items[1].card, input.items[1].card);
  assert.deepEqual(result.items[1].sources, [input.items[1].sources[0]]);
  assert.deepEqual(input, before);
});

test('no-change statuses cannot smuggle edits or source removal through the ignored-reason path', () => {
  for (const status of ['unchanged', 'unresolved']) {
    assert.throws(() => apply(response({ ...repair(), status }), fixture()));
    assert.throws(() => apply({ items: [retained('d:0'), { ...retained('v:0', status), dropSourceIndexes: [1] }] }, fixture()));
  }
});

test('complete unique membership is required even when every reason is omitted', () => {
  for (const items of [[retained('d:0')], [retained('d:0'), retained('d:0')], [retained('d:0'), retained('foreign')]]) {
    assert.throws(() => apply({ items }, fixture()));
  }
});

test('a later invalid repair prevents any result and leaves original cards and responses unchanged', () => {
  const input = fixture();
  const parsed = { items: [repair(), { ...retained('v:0'), status: 'repaired', reason: 'Invalid evidence index.', dropSourceIndexes: [2] }] };
  const before = structuredClone({ input, parsed });
  assert.throws(() => apply(parsed, input));
  assert.deepEqual({ input, parsed }, before);
});
