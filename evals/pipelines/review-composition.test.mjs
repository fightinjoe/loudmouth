import test from 'node:test';
import assert from 'node:assert/strict';
import { repairCaseInput, routeDetection, applyTopicRepairs, composeTopic } from './review-composition.mjs';


function fixture() {
  return { task: { language: 'ja', ability: 'basics', answers: {} }, topic: { title: 'Taking the train' }, items: [
    { handle: 'd:0', section: 'dialogue', index: 0, english: { text: 'Where is the station?', speaker: 'you' }, speaker: 'you', alternative: false,
      card: { type: 'phrase', lang: 'ja', text: '図書館はどこですか。', translation: 'Where is the station?' } },
    { handle: 'v:0', section: 'vocab', index: 0, english: 'train',
      card: { type: 'word', lang: 'ja', text: '車', translation: 'train', partOfSpeech: 'noun', senseKey: 'train', reading: [['車', 'くるま']] } },
    { handle: 'e:0', section: 'essentials', index: 0, english: 'Thank you.',
      card: { type: 'phrase', lang: 'ja', text: 'ありがとうございます。', translation: 'Thank you.' } },
    { handle: 'v:1', section: 'vocab', index: 1, english: 'station',
      card: { type: 'word', lang: 'ja', text: '駅', translation: 'station', partOfSpeech: 'noun', senseKey: 'station', reading: [['駅', 'えき']] },
      sources: [
        { snapshot: { lang: 'ja', text: '駅です。', translation: 'It is the station.' }, span: { start: 0, end: 1 } },
        { snapshot: { lang: 'ja', text: '駅に行きます。', translation: 'I am going to the station.' }, span: { start: 0, end: 1 } },
      ] },
  ] };
}
function freezeTree(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freezeTree); Object.freeze(value); }
  return value;
}
function finding(handle, overrides = {}) {
  return { handle, field: 'text', category: 'meaning', severity: 'material', origin: 'translation', reason: 'Review the intended referent.', ...overrides };
}
function detection(findings = [], overrides = {}) { return { complete: true, findings, unresolved: [], ...overrides }; }
function retained(handle, status = 'unchanged') {
  return { handle, status, reason: status === 'unresolved' ? 'The intended referent is uncertain.' : 'The original card is appropriate.', changes: [], dropSourceIndexes: [] };
}
function phraseRepair() {
  return { handle: 'd:0', status: 'repaired', reason: 'Restore the station question.', changes: [{ field: 'text', value: '駅はどこですか。' }], dropSourceIndexes: [] };
}
function wordRepair() {
  return { handle: 'v:0', status: 'repaired', reason: 'Restore train with its aligned pronunciation.', changes: [
    { field: 'text', value: '電車' }, { field: 'reading', value: [['電車', 'でんしゃ']] },
  ], dropSourceIndexes: [] };
}
function detectionOutcome(response) { return { status: 'completed', rawValid: true, response }; }
function repairOutcome(response) { return { handle: response.handle, status: 'completed', rawValid: true, applicationValid: true, response }; }

test('item-review inputs detach editable context and exclude oracle focus, diagnosis and private references', () => {
  const input = freezeTree({ ...fixture(), focus: { handle: 'v:1', field: 'reading', category: 'reading-accuracy' },
    diagnosis: 'PRIVATE DIAGNOSIS', references: { correction: 'PRIVATE ANSWER' } });
  const result = repairCaseInput(input, 'd:0');
  assert.deepEqual(result.focus, { handle: 'd:0', field: 'card', category: 'meaning' });
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  result.items[0].english.text = 'Changed context';
  result.items[3].sources[0].snapshot.text = 'Changed history';
  result.task.answers.modified = true;
  assert.equal(input.items[0].english.text, 'Where is the station?');
  assert.equal(input.items[3].sources[0].snapshot.text, '駅です。');
  assert.deepEqual(input.task.answers, {});
  assert.throws(() => repairCaseInput(input, 'foreign'), /Unknown/);
  assert.throws(() => repairCaseInput({ ...input, items: [input.items[0], input.items[0]] }, 'd:0'), /unique/);
});

test('routing deduplicates findings across fields, retains all handles in topic order, and routes false positives', () => {
  const input = freezeTree(fixture());
  const response = freezeTree(detection([
    finding('v:0'), finding('e:0'), finding('d:0'),
    finding('v:0', { field: 'reading', category: 'reading-accuracy' }), finding('v:1'),
  ]));
  assert.deepEqual(routeDetection(input, response), {
    complete: true, repairHandles: ['d:0', 'v:0', 'e:0', 'v:1'], unresolvedHandles: [],
  });
  assert.equal(response.findings.length, 5);
});

test('incomplete detection blocks all repairs, even when it includes repairable findings', () => {
  const input = fixture();
  const response = detection([finding('d:0')], { complete: false });
  assert.deepEqual(routeDetection(input, response), {
    complete: false, repairHandles: [], unresolvedHandles: input.items.map(item => item.handle),
  });
  const result = composeTopic(input, detectionOutcome(response), []);
  assert.equal(result.status, 'detection-incomplete');
  assert.equal(result.complete, false);
  assert.equal(result.application, 'original-retained');
  assert.deepEqual(result.items, input.items);
});

test('English-origin and explicit unresolved handles block translation findings regardless of finding order', () => {
  const input = fixture();
  const findings = [finding('d:0'), finding('v:0'), finding('v:1'),
    finding('d:0', { field: 'english', category: 'source-ambiguity', origin: 'english' }),
    finding('e:0', { field: 'english', origin: 'english' })];
  for (const ordered of [findings, findings.toReversed()]) {
    assert.deepEqual(routeDetection(input, detection(ordered, { unresolved: [{ handle: 'v:0', reason: 'Intended sense is uncertain.' }] })), {
      complete: true, repairHandles: ['v:1'], unresolvedHandles: ['d:0', 'v:0', 'e:0'],
    });
  }
});

test('unknown or duplicate findings and unresolved locations cannot route, including incomplete detection', () => {
  for (const complete of [true, false]) {
    for (const response of [
      detection([finding('foreign')], { complete }),
      detection([finding('d:0'), finding('d:0')], { complete }),
      detection([], { complete, unresolved: [{ handle: 'foreign', reason: 'Uncertain.' }] }),
      detection([], { complete, unresolved: [{ handle: 'd:0', reason: 'Uncertain.' }, { handle: 'd:0', reason: 'Still uncertain.' }] }),
    ]) assert.throws(() => routeDetection(fixture(), response), /Unknown|Duplicate|duplicate/);
  }
});

test('complete no-findings detection assembles the unchanged topic without semantic approval', () => {
  const input = freezeTree(fixture());
  const result = composeTopic(input, detectionOutcome(detection()), []);
  assert.equal(result.status, 'assembled');
  assert.equal(result.complete, true);
  assert.equal(result.application, 'original-retained');
  assert.equal(result.semanticReview, 'not-assessed');
  assert.deepEqual(result.repairHandles, []);
  assert.deepEqual(result.unresolvedHandles, []);
  assert.deepEqual(result.items, input.items);
  result.items[0].card.text = 'Detached output';
  assert.equal(input.items[0].card.text, '図書館はどこですか。');
});

test('topic assembly enforces exact unique target and response membership before applying patches', () => {
  const input = freezeTree(fixture());
  for (const [handles, responses] of [
    [['d:0', 'd:0'], [phraseRepair(), phraseRepair()]],
    [['foreign'], [retained('foreign')]],
    [['d:0'], []],
    [[], [phraseRepair()]],
    [['d:0'], [phraseRepair(), phraseRepair()]],
    [['d:0'], [retained('v:0')]],
    [['d:0', 'v:0'], [phraseRepair(), retained('foreign')]],
  ]) assert.throws(() => applyTopicRepairs(input, handles, responses));
  const empty = applyTopicRepairs(input, [], []);
  assert.deepEqual(empty, { items: input.items, application: 'original-retained', unresolvedHandles: [] });
});

test('coupled repairs assemble in original order and preserve readonly context, untargeted cards and source snapshots', () => {
  const input = freezeTree(fixture());
  const responses = freezeTree([wordRepair(), phraseRepair()]);
  const before = structuredClone({ input, responses });
  const result = applyTopicRepairs(input, ['d:0', 'v:0'], responses);
  assert.equal(result.application, 'applied-in-memory');
  assert.deepEqual(result.items.map(item => item.handle), input.items.map(item => item.handle));
  assert.equal(result.items[0].card.text, '駅はどこですか。');
  assert.deepEqual(result.items[1].card, { ...input.items[1].card, text: '電車', reading: [['電車', 'でんしゃ']] });
  assert.deepEqual(result.items[0].english, input.items[0].english);
  assert.equal(result.items[0].speaker, 'you');
  assert.equal(result.items[0].alternative, false);
  assert.equal(result.items[0].index, 0);
  assert.equal(result.items[0].card.translation, input.items[0].card.translation);
  assert.deepEqual(result.items.slice(2), input.items.slice(2));
  assert.deepEqual({ input, responses }, before);
  result.items[3].sources[0].snapshot.text = 'Detached history';
  result.items[1].card.reading[0][1] = 'Detached reading';
  assert.equal(input.items[3].sources[0].snapshot.text, '駅です。');
  assert.equal(responses[0].changes[1].value[0][1], 'でんしゃ');
});

test('source omissions use original indices and do not rewrite remaining historical snapshots', () => {
  const candidate = fixture();
  candidate.items[3].sources[0] = {
    snapshot: { lang: 'ja', text: '図書館です。', translation: 'It is the library.' },
    span: { start: 0, end: 3 },
  };
  const input = freezeTree(candidate);
  const omission = { ...retained('v:1'), status: 'repaired', reason: 'The library occurrence does not support station.', dropSourceIndexes: [0] };
  const result = applyTopicRepairs(input, ['v:1', 'd:0'], [omission, phraseRepair()]);
  assert.deepEqual(result.items[3].sources, [input.items[3].sources[1]]);
  assert.deepEqual(result.items[3].card, input.items[3].card);
  assert.equal(input.items[3].sources.length, 2);
  assert.throws(() => applyTopicRepairs(input, ['v:1'], [{ ...omission, dropSourceIndexes: [2] }]), /source index/);
});

test('an invalid coupled patch rolls back the whole topic rather than publishing an earlier repair', () => {
  const input = freezeTree(fixture());
  const invalid = { ...wordRepair(), changes: [{ field: 'text', value: '電車' }] };
  assert.throws(() => applyTopicRepairs(input, ['d:0', 'v:0'], [phraseRepair(), invalid]), /concatenate/);
  const result = composeTopic(input, detectionOutcome(detection([finding('d:0'), finding('v:0')])), [repairOutcome(phraseRepair()), repairOutcome(invalid)]);
  assert.equal(result.status, 'invalid-repair');
  assert.equal(result.application, 'original-retained');
  assert.equal(result.complete, false);
  assert.match(result.error, /concatenate/);
  assert.deepEqual(result.items, input.items);
  assert.deepEqual(result.unresolvedHandles, ['d:0', 'v:0']);
});

test('metadata patches and partial unresolved responses cannot bypass strict localized application', () => {
  for (const response of [
    { ...phraseRepair(), changes: [{ field: 'translation', value: 'Where is the library?' }] },
    { ...phraseRepair(), speaker: 'them' },
    { ...phraseRepair(), status: 'unresolved' },
    { ...phraseRepair(), changes: [] },
    { ...phraseRepair(), changes: [phraseRepair().changes[0], phraseRepair().changes[0]] },
  ]) assert.throws(() => applyTopicRepairs(fixture(), ['d:0'], [response]));
});

test('unchanged and unresolved item reviews retain originals and report unresolved handles in topic order', () => {
  const input = fixture();
  const result = applyTopicRepairs(input, ['v:1', 'v:0', 'd:0'], [retained('v:1', 'unresolved'), retained('d:0'), retained('v:0', 'unresolved')]);
  assert.equal(result.application, 'original-retained');
  assert.deepEqual(result.items, input.items);
  assert.deepEqual(result.unresolvedHandles, ['v:0', 'v:1']);
});

test('failed, raw-invalid, absent or malformed detection never receives clean-topic credit', () => {
  const input = fixture();
  for (const outcome of [
    undefined,
    { ...detectionOutcome(detection()), status: 'failed' },
    { ...detectionOutcome(detection()), rawValid: false },
    { status: 'completed', rawValid: true },
    detectionOutcome({ complete: true, findings: [] }),
    detectionOutcome(detection([finding('foreign')])),
  ]) {
    const result = composeTopic(input, outcome, []);
    assert.equal(result.status, 'invalid-detection');
    assert.equal(result.complete, false);
    assert.equal(typeof result.error, 'string');
    assert.deepEqual(result.items, input.items);
    assert.deepEqual(result.repairHandles, []);
    assert.deepEqual(result.unresolvedHandles, input.items.map(item => item.handle));
  }
});

test('missing and failed selected repairs retain the entire original topic with explicit incompleteness', () => {
  const input = fixture();
  const detected = detectionOutcome(detection([finding('v:0'), finding('d:0')]));
  for (const outcomes of [
    [], [repairOutcome(phraseRepair())],
    [repairOutcome(phraseRepair()), { ...repairOutcome(wordRepair()), status: 'failed' }],
  ]) {
    const result = composeTopic(input, detected, outcomes);
    assert.equal(result.status, 'repair-incomplete');
    assert.equal(result.complete, false);
    assert.equal(result.application, 'original-retained');
    assert.equal(typeof result.error, 'string');
    assert.deepEqual(result.items, input.items);
    assert.deepEqual(result.unresolvedHandles, ['d:0', 'v:0']);
  }
});

test('invalid repair flags, missing payload and swapped payload handles cannot be assembled', () => {
  const input = fixture();
  const detected = detectionOutcome(detection([finding('d:0'), finding('v:0')]));
  for (const invalid of [
    { ...repairOutcome(wordRepair()), rawValid: false },
    { ...repairOutcome(wordRepair()), applicationValid: false },
    { ...repairOutcome(wordRepair()), applicationValid: undefined },
    { ...repairOutcome(wordRepair()), response: undefined },
    { ...repairOutcome(wordRepair()), response: phraseRepair() },
  ]) {
    const result = composeTopic(input, detected, [repairOutcome(phraseRepair()), invalid]);
    assert.equal(result.status, 'invalid-repair');
    assert.equal(result.complete, false);
    assert.equal(result.application, 'original-retained');
    assert.equal(typeof result.error, 'string');
    assert.deepEqual(result.items, input.items);
  }
  const swapped = composeTopic(input, detected, [
    { ...repairOutcome(phraseRepair()), response: wordRepair() },
    { ...repairOutcome(wordRepair()), response: phraseRepair() },
  ]);
  assert.equal(swapped.status, 'invalid-repair');
  assert.deepEqual(swapped.items, input.items);
});

test('extra and duplicate outcomes are coordinator errors, not ignorable model failures', () => {
  const input = fixture();
  const detected = detectionOutcome(detection([finding('d:0')]));
  assert.throws(() => composeTopic(input, detected, [repairOutcome(phraseRepair()), repairOutcome(phraseRepair())]), /Duplicate/);
  assert.throws(() => composeTopic(input, detected, [repairOutcome(phraseRepair()), repairOutcome(retained('e:0'))]), /Extra/);
  assert.throws(() => composeTopic(input, detectionOutcome(detection()), [repairOutcome(phraseRepair())]), /Extra/);
  assert.throws(() => composeTopic(input, detectionOutcome(detection([finding('d:0')], { complete: false })), [repairOutcome(phraseRepair())]), /Extra/);
  assert.throws(() => composeTopic(input, { status: 'failed' }, [repairOutcome(phraseRepair())]), /Extra/);
});

test('successful composition merges repairs, blocked handles and item abstentions without claiming full coverage', () => {
  const input = freezeTree(fixture());
  const detected = freezeTree(detectionOutcome(detection([
    finding('v:0'), finding('d:0'), finding('e:0', { origin: 'english', field: 'english' }),
  ], { unresolved: [{ handle: 'v:1', reason: 'Source interpretation is uncertain.' }] })));
  const outcomes = freezeTree([repairOutcome(retained('v:0', 'unresolved')), repairOutcome(phraseRepair())]);
  const result = composeTopic(input, detected, outcomes);
  assert.equal(result.status, 'assembled');
  assert.equal(result.application, 'applied-in-memory');
  assert.equal(result.complete, false);
  assert.equal(result.semanticReview, 'not-assessed');
  assert.deepEqual(result.repairHandles, ['d:0', 'v:0']);
  assert.deepEqual(result.unresolvedHandles, ['v:0', 'e:0', 'v:1']);
  assert.equal(result.items[0].card.text, '駅はどこですか。');
  assert.deepEqual(result.items.slice(1), input.items.slice(1));
});

test('all successful selected reviews yield complete structural assembly, including a false-positive unchanged review', () => {
  const input = fixture();
  const detected = detectionOutcome(detection([finding('e:0'), finding('v:0'), finding('d:0')]));
  const result = composeTopic(input, detected, [repairOutcome(retained('e:0')), repairOutcome(wordRepair()), repairOutcome(phraseRepair())]);
  assert.equal(result.status, 'assembled');
  assert.equal(result.complete, true);
  assert.equal(result.application, 'applied-in-memory');
  assert.deepEqual(result.unresolvedHandles, []);
  assert.deepEqual(result.items[1].card.reading, [['電車', 'でんしゃ']]);
  assert.deepEqual(result.items[2], input.items[2]);
});
