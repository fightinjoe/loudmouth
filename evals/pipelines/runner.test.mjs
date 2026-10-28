import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFixtures, validateFixtures, prepareRequests, evaluateResponses, runMock, createReviewInput, evaluateReview } from './runner.mjs';

function fixture() { return loadFixtures(); }
function savedEnglish(fixtures, contextId = 'tea-cs') {
  const item = fixtures.cases.cases.find(item => item.id === contextId);
  return { version: 1, responses: [{ contextId, english: structuredClone(item.english), translation: structuredClone(item.translation) }] };
}

test('prepared review requests never disclose private answers or fixture judgment', () => {
  const fixtures = fixture();
  const secret = 'PRIVATE_EXPECTED_ANSWER_DO_NOT_SHOW';
  const item = fixtures.cases.cases.find(item => item.id === 'tea-cs');
  for (const review of item.reviews) {
    review.note = secret;
    review.expected.checks = [{ handle: 'e:0', field: 'text', value: secret }];
    for (const repair of review.repairs) repair.response.reason = secret;
    review.mockDetection = { privateAnswer: secret };
  }
  const prepared = prepareRequests(fixtures, 'c', { contextId: 'tea-cs' });
  assert.equal(JSON.stringify(prepared.requests).includes(secret), false);
});

test('composed B consumes changed A, rather than the fixed standalone English', () => {
  const fixtures = fixture();
  const saved = savedEnglish(fixtures);
  saved.responses[0].english.conversations[0].essentials.push('Please bring a glass of water too.');
  const composed = evaluateResponses(fixtures, 'ab', saved, { contextId: 'tea-cs' });
  assert.equal(composed.results[0].stages[0].status, 'passed');
  assert.equal(composed.results[0].stages[1].status, 'failed');
  const standalone = evaluateResponses(fixtures, 'b', saved, { contextId: 'tea-cs' });
  assert.equal(standalone.results[0].stages[0].status, 'passed');
  saved.responses[0].translation.essentials.push('Přineste prosím také sklenici vody.');
  const corrected = evaluateResponses(fixtures, 'ab', saved, { contextId: 'tea-cs' });
  assert.equal(corrected.structuralPass, true);
});

test('malformed translation fails as a whole, never reports assembled partial success', () => {
  const fixtures = fixture();
  const saved = savedEnglish(fixtures);
  saved.responses[0].translation.lines.pop();
  const result = evaluateResponses(fixtures, 'b', saved, { contextId: 'tea-cs' });
  const stage = result.results[0].stages[0];
  assert.equal(result.structuralPass, false);
  assert.equal(stage.status, 'failed');
  assert.equal(Object.hasOwn(stage, 'assembledCards'), false);
});

test('a failed required C patch atomically retains the original topic despite another valid repair', () => {
  const fixtures = fixture();
  const item = fixtures.cases.cases.find(item => item.id === 'tea-cs');
  const review = item.reviews.find(review => review.kind === 'defect');
  const input = createReviewInput(fixtures, item.id, review.id);
  const baseline = structuredClone(input);
  const detection = structuredClone(review.mockDetection);
  detection.findings.push({ handle: 'd:0', field: 'text', category: 'meaning', severity: 'material', origin: 'translation', reason: 'Restore a material dialogue meaning error.' });
  const repairs = [...structuredClone(review.repairs), { focus: { handle: 'd:0', field: 'text', category: 'meaning' }, response: { handle: 'd:0', status: 'repaired', reason: 'Forbidden attempt to alter the English source.', changes: [{ field: 'translation', value: 'A different intent.' }], dropSourceIndexes: [] } }];
  const result = evaluateReview(input, review, { id: review.id, detection, repairs });
  assert.equal(result.structural.pass, false);
  assert.equal(result.effective.application, 'original-retained');
  assert.equal(result.effective.appliedFieldEdits, 0);
  assert.equal(result.knownLocationRepair.changedFields, 0);
  assert(result.effective.proposedFieldEdits > 0);
  assert.deepEqual(input, baseline);
});

test('a translation patch cannot rewrite immutable English intent', () => {
  const fixtures = fixture();
  const item = fixtures.cases.cases.find(item => item.id === 'tea-cs');
  const review = item.reviews.find(review => review.kind === 'defect');
  const input = createReviewInput(fixtures, item.id, review.id);
  const repairs = structuredClone(review.repairs);
  repairs[0].response.changes = [{ field: 'translation', value: 'Forget the original learner request.' }];
  const original = input.items.find(item => item.handle === repairs[0].focus.handle).card.translation;
  const result = evaluateReview(input, review, { id: review.id, detection: review.mockDetection, repairs });
  assert.equal(result.effective.application, 'original-retained');
  assert.equal(result.structural.immutableEnglishIntent, true);
  assert.equal(input.items.find(item => item.handle === repairs[0].focus.handle).card.translation, original);
});

test('unknown fixture identity and unknown context filter fail explicitly', () => {
  const fixtures = fixture();
  assert.throws(() => runMock(fixtures, 'a', { contextId: 'not-a-context' }), /Unknown context filter/);
  const malformed = structuredClone(fixtures);
  malformed.cases.cases[0].id = 'foreign-fixture';
  assert.throws(() => validateFixtures(malformed), /Cases must match canonical context IDs/);
});

test('an unestablished language concern accepts no correction without inventing a missed defect', () => {
  const fixtures = fixture();
  const item = fixtures.cases.cases.find(item => item.id === 'shoes-zh');
  const review = item.reviews.find(review => review.kind === 'unresolved');
  const input = createReviewInput(fixtures, item.id, review.id);
  const repairs = review.repairs.map(repair => ({
    focus: repair.focus,
    response: { handle: repair.focus.handle, status: 'unchanged', reason: 'No confident correction is justified.', changes: [], dropSourceIndexes: [] },
  }));
  const saved = { id: review.id, detection: { complete: true, findings: [], unresolved: [] }, repairs };
  const accepted = evaluateReview(input, review, saved);
  assert.equal(accepted.structural.pass, true);
  assert.equal(accepted.fixtureExpectation.pass, true);
  assert.deepEqual(accepted.detection.misses, []);
  assert.deepEqual(accepted.detection.falseAlarms, []);
  const changed = structuredClone(saved);
  changed.repairs[0].response = {
    handle: repairs[0].focus.handle, status: 'repaired', reason: 'An unjustified pronunciation change.',
    changes: [{ field: 'reading', value: [['可以帮我保管这双鞋吗', 'kěyǐ bāng wǒ bǎoguǎn zhè shuāng xiá ma'], ['？', null]] }],
    dropSourceIndexes: [],
  };
  const rejected = evaluateReview(input, review, changed);
  assert.equal(rejected.knownLocationRepair.changedFields, 1);
  assert.equal(rejected.fixtureExpectation.pass, false);
});
