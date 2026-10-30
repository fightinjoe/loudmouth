import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFixtures, validateFixtures, prepareRequests, evaluateResponses, runMock, createReviewInput, evaluateReview } from './runner.mjs';
import { toReviewInput, fromReviewInput } from './topic-conversion.mjs';
import { modelInput, applyLocalizedRepair } from './review-contract.mjs';

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
  saved.responses[0].english.topics[0].thingsToSay.push('Please bring a glass of water too.');
  const composed = evaluateResponses(fixtures, 'ab', saved, { contextId: 'tea-cs' });
  assert.equal(composed.results[0].stages[0].status, 'passed');
  assert.equal(composed.results[0].stages[1].status, 'failed');
  const standalone = evaluateResponses(fixtures, 'b', saved, { contextId: 'tea-cs' });
  assert.equal(standalone.results[0].stages[0].status, 'passed');
  saved.responses[0].translation.phrases.splice(5, 0, 'Přineste prosím také sklenici vody.');
  for (const word of saved.responses[0].translation.words) {
    if (word.source?.phraseIndex >= 5) word.source.phraseIndex++;
  }
  const corrected = evaluateResponses(fixtures, 'ab', saved, { contextId: 'tea-cs' });
  assert.equal(corrected.structuralPass, true);
});

test('malformed translation fails as a whole, never reports assembled partial success', () => {
  const fixtures = fixture();
  const saved = savedEnglish(fixtures);
  saved.responses[0].translation.phrases.pop();
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
  assert.deepEqual(accepted.detection.unmatchedExpectations, []);
  assert.deepEqual(accepted.detection.unmatchedPredictions, []);
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

test('wrong-field attribution remains unmatched without automatic semantic credit or repair', () => {
  const fixtures = fixture();
  const item = fixtures.cases.cases.find(item => item.id === 'tea-cs');
  const review = item.reviews.find(review => review.kind === 'defect');
  const input = createReviewInput(fixtures, item.id, review.id);
  const detection = structuredClone(review.mockDetection);
  detection.complete = false;
  detection.findings[0].field = 'translation';
  detection.findings[0].severity = 'critical';
  const result = evaluateReview(input, review, { id: review.id, detection, repairs: review.repairs });
  assert.deepEqual(result.detection.exactMatches, []);
  assert.deepEqual(result.detection.unmatchedExpectations, review.expectedFindings);
  assert.deepEqual(result.detection.unmatchedPredictions, detection.findings);
  assert.equal(result.detection.attributionCandidates[0].fieldMatches, false);
  assert.equal(result.detection.attributionCandidates[0].categoryMatches, true);
  assert.equal(result.detection.attributionCandidates[0].severityMatches, false);
  assert.equal(result.detection.semanticRecognition, null);
  assert.equal(result.knownLocationRepair.outcome, 'repaired');
  assert.equal(result.effective.status, 'detection-incomplete');
  assert.equal(result.effective.appliedFieldEdits, 0);
  assert.equal(result.effective.outcome, 'unresolved');
});

test('an allowed reading category variant is an attribution candidate, not an exact match', () => {
  const fixtures = fixture();
  const item = fixtures.cases.cases.find(item => item.id === 'shoes-zh');
  const review = item.reviews.find(review => review.id === 'shoes-zh-reading-defect');
  const input = createReviewInput(fixtures, item.id, review.id);
  const detection = structuredClone(review.mockDetection);
  detection.findings[0].category = 'reading-accuracy';
  const result = evaluateReview(input, review, { id: review.id, detection, repairs: review.repairs });
  assert.equal(result.detection.valid, true);
  assert.deepEqual(result.detection.exactMatches, []);
  assert.equal(result.detection.unmatchedExpectations[0].category, 'reading-romanization');
  assert.equal(result.detection.unmatchedPredictions[0].category, 'reading-accuracy');
  assert.equal(result.detection.attributionCandidates[0].fieldMatches, true);
  assert.equal(result.detection.attributionCandidates[0].categoryMatches, false);
  assert.equal(result.detection.semanticRecognition, null);
  assert.equal(result.effective.outcome, 'repaired');
});

test('a finding on another handle is not paired with an authored defect', () => {
  const fixtures = fixture();
  const item = fixtures.cases.cases.find(item => item.id === 'tea-cs');
  const review = item.reviews.find(review => review.kind === 'defect');
  const input = createReviewInput(fixtures, item.id, review.id);
  const detection = structuredClone(review.mockDetection);
  detection.findings.push({ ...detection.findings[0], handle: 'd:0', reason: 'An additional allegation requiring independent review.' });
  const result = evaluateReview(input, review, { id: review.id, detection, repairs: review.repairs });
  assert.deepEqual(result.detection.exactMatches, review.expectedFindings);
  assert.deepEqual(result.detection.unmatchedExpectations, []);
  assert.deepEqual(result.detection.unmatchedPredictions.map(finding => finding.handle), ['d:0']);
  assert.deepEqual(result.detection.attributionCandidates.map(candidate => candidate.predicted.handle), ['e:0']);
});

test('review conversion preserves exchange alternatives, family boundaries and source evidence', () => {
  const fixtures = fixture();
  const original = createReviewInput(fixtures, 'tea-cs', 'tea-cs-correct');
  const group = fromReviewInput(original);
  const english = structuredClone(fixtures.cases.cases.find(item => item.id === 'tea-cs').english.topics[0]);
  const option = structuredClone(group.thingsToSay[0]);
  option.id = 'review-alternative';
  group.likelyExchanges[0].lines[0].responses.push(option);
  english.likelyExchanges[0].lines[0].text.push(english.thingsToSay[0]);
  const family = group.words[0];
  group.words = [
    { ...family, title: 'First family', items: family.items.slice(0, 2) },
    { ...family, id: 'review-family-two', title: 'Second family', items: family.items.slice(2) },
  ];
  const words = english.words[0].items;
  english.words = [{ title: 'First family', items: words.slice(0, 2) }, { title: 'Second family', items: words.slice(2) }];
  const input = toReviewInput({ task: original.task, topic: english, group });
  assert.deepEqual(fromReviewInput(input), group);
  const projected = modelInput(input);
  const alternatives = projected.items.filter(item => item.handle.startsWith('x:0:0:'));
  assert.deepEqual(alternatives.map(item => [item.speaker, item.turnIndex, item.responseIndex]), [['you', 0, 0], ['you', 0, 1]]);
  assert.equal(projected.items.find(item => item.handle === 'v:2').familyTitle, 'Second family');
  assert.deepEqual(input.items.find(item => item.handle === 'v:2').sources, original.items.find(item => item.handle === 'v:2').sources);
  const repaired = applyLocalizedRepair({
    handle: 'x:0:0:1', status: 'repaired', reason: 'Replace only this authored alternative.',
    changes: [{ field: 'text', value: 'Prosím.' }], dropSourceIndexes: [],
  }, { ...input, focus: { handle: 'x:0:0:1', field: 'text', category: 'meaning' } });
  const rebuilt = fromReviewInput({ ...input, items: repaired.items });
  assert.equal(rebuilt.likelyExchanges[0].lines[0].responses[1].card.text, 'Prosím.');
  assert.deepEqual(rebuilt.likelyExchanges[0].lines[0].responses[0], group.likelyExchanges[0].lines[0].responses[0]);
  assert.deepEqual(rebuilt.words, group.words);
  assert.deepEqual(rebuilt.exampleConversation, group.exampleConversation);
});

test('review conversion rejects relocated responses rather than silently losing them', () => {
  const input = createReviewInput(fixture(), 'tea-cs', 'tea-cs-correct');
  input.items.find(item => item.handle === 'x:0:0:0').location.turnIndex = 99;
  assert.throws(() => fromReviewInput(input), /Unknown topic section or location/);
});
