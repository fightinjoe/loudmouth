import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isDeepStrictEqual as equal } from 'node:util';
import { buildEnglishPrompt, buildTranslationPrompt, normalizeEnglish, normalizeTranslation } from './production.mjs';
import { toReviewInput } from './topic-conversion.mjs';
import { buildDetectionPrompt, buildRepairPrompt, validateDetection, applyLocalizedRepair } from './review-contract.mjs';
import { repairCaseInput, routeDetection, composeTopic } from './review-composition.mjs';
import { applyRepairResponses } from './repair-application.mjs';
import { detectionSchema, repairSchema, detectionInstructions, repairInstructions } from './instructions.mjs';

const require = createRequire(import.meta.url);
const { parsePhrasebookRequest, assemblePhrasebook } = require('../../api/src/phrasebook/parse');
const productionFile = name => readFileSync(new URL(`../../api/src/phrasebook/${name}`, import.meta.url), 'utf8');
const generationTemplate = productionFile('prompt.txt');
const translationTemplate = productionFile('translate-prompt.txt');
const editableFields = new Set(['text', 'reading', 'romanization', 'partOfSpeech', 'senseKey']);
const measurements = () => ({ latencyMs: null, inputTokens: null, outputTokens: null, costUsd: null });
export const sha256 = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exact(value, keys, label) { assert(object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), `${label}: unexpected or missing fields`); }
function nonempty(value, label) { assert(typeof value === 'string' && value.trim(), `${label} must be a nonempty string`); }
function rawText(value) { assert(value !== undefined, 'Missing saved response'); return typeof value === 'string' ? value : JSON.stringify(value); }
function parsedResponse(value) { return typeof value === 'string' ? JSON.parse(value) : structuredClone(value); }
function rawInfo(value) {
  const text = rawText(value); let parsed;
  try { parsed = JSON.parse(text); } catch { /* Production parsing may accept a fenced response. */ }
  return { text, parsed, summary: { bytes: Buffer.byteLength(text), sha256: sha256(text), jsonParsed: parsed !== undefined } };
}
function normalizeA(value, task) { const raw = rawInfo(value); return { ...normalizeEnglish(raw.parsed, task, { raw: raw.text }), raw: raw.summary }; }
function normalizeB(value, task, conversation) { const raw = rawInfo(value); return { ...normalizeTranslation(raw.parsed, { task, conversation }, { raw: raw.text }), raw: raw.summary }; }
function baseInput(context, fixture) {
  const english = normalizeA(fixture.english, context.task).value.conversations[0];
  const translated = normalizeB(fixture.translation, context.task, english).value;
  const group = assemblePhrasebook({ seed: context.task.seed, language: context.task.language, conversations: [english], translations: [translated] }).groups[0];
  return toReviewInput({ task: context.task, conversation: english, group });
}
function reviewInput(context, fixture, review) {
  const input = baseInput(context, fixture);
  for (const mutation of review.mutations) {
    assert(editableFields.has(mutation.field), `Mutation cannot change immutable field ${mutation.field}`);
    const item = input.items.find(item => item.handle === mutation.handle);
    assert(item, `Unknown mutation handle ${mutation.handle}`);
    item.card[mutation.field] = structuredClone(mutation.value);
  }
  return input;
}
function location(value) { return JSON.stringify([value.handle, value.field, value.category]); }
function cardValue(items, check) { return items.find(item => item.handle === check.handle)?.card[check.field]; }
function checkExpectations(items, review) {
  return review.expected.checks.map(check => ({ ...structuredClone(check), actual: structuredClone(cardValue(items, check)), pass: equal(cardValue(items, check), check.value) }));
}
function changesBetween(before, after) {
  const changes = [];
  for (const [index, item] of before.entries()) {
    const next = after.find(candidate => candidate.handle === item.handle);
    for (const key of new Set([...Object.keys(item.card), ...Object.keys(next.card)])) {
      if (!equal(item.card[key], next.card[key])) changes.push({ handle: item.handle, field: key, path: `/items/${index}/card/${key}`, before: item.card[key], after: next.card[key] });
    }
    if (!equal(item.sources, next.sources)) changes.push({ handle: item.handle, field: 'sources', path: `/items/${index}/sources`, before: item.sources, after: next.sources });
  }
  return changes;
}
function quote(value) { const text = typeof value === 'string' ? value : JSON.stringify(value) ?? '(absent)'; return text.length > 150 ? `${text.slice(0, 147)}...` : text; }
function evidenceSummary(before, after) {
  const old = before.flatMap(item => (item.sources ?? []).map(source => ({ handle: item.handle, source })));
  const next = after.flatMap(item => (item.sources ?? []).map(source => ({ handle: item.handle, source })));
  const retained = old.filter(source => next.some(candidate => equal(source, candidate))).length;
  return { before: old.length, after: next.length, retained, removed: old.length - retained, introduced: next.filter(source => !old.some(candidate => equal(source, candidate))).length };
}
function fullConditional(input, responses) {
  const byHandle = new Map();
  for (const response of responses) { assert(!byHandle.has(response.handle), 'Duplicate repair response'); byHandle.set(response.handle, response); }
  assert([...byHandle.keys()].every(handle => input.items.some(item => item.handle === handle)), 'Unknown repair handle');
  return applyRepairResponses({ items: input.items.map(item => byHandle.get(item.handle) ?? { handle: item.handle, status: 'unchanged', changes: [], dropSourceIndexes: [] }) }, input);
}

export function loadFixtures({ contextsPath = new URL('../fixtures/contexts.json', import.meta.url), casesPath = new URL('../fixtures/pipeline-cases.json', import.meta.url) } = {}) {
  const contextText = readFileSync(contextsPath, 'utf8');
  const caseText = readFileSync(casesPath, 'utf8');
  const fixtures = { contexts: JSON.parse(contextText), cases: JSON.parse(caseText), hashes: { contexts: sha256(contextText), fixtures: sha256(caseText) } };
  validateFixtures(fixtures);
  return fixtures;
}

export function validateFixtures(fixtures) {
  exact(fixtures.contexts, ['version', 'status', 'contexts'], 'Contexts');
  exact(fixtures.cases, ['version', 'status', 'cases'], 'Cases');
  assert.equal(fixtures.contexts.version, 1, 'Unsupported contexts version');
  assert.equal(fixtures.cases.version, 1, 'Unsupported cases version');
  assert.equal(fixtures.contexts.status, 'proposed');
  assert.equal(fixtures.cases.status, 'proposed-not-linguistically-certified');
  assert(Array.isArray(fixtures.contexts.contexts) && Array.isArray(fixtures.cases.cases), 'Fixture arrays required');
  const contexts = fixtures.contexts.contexts;
  const cases = fixtures.cases.cases;
  const contextIds = contexts.map(context => context.id);
  assert(contextIds.length > 0 && contextIds.every(id => typeof id === 'string' && id.trim()) && new Set(contextIds).size === contextIds.length, 'Canonical contexts need unique nonempty IDs');
  assert.deepEqual(cases.map(fixture => fixture.id).sort(), [...contextIds].sort(), 'Cases must match canonical context IDs exactly');
  let unresolved = 0;
  for (const context of contexts) {
    exact(context, ['id', 'kind', 'task', 'reviewFocus'], 'Context');
    assert(['ordinary', 'challenge'].includes(context.kind), 'Unknown context kind');
    assert(Array.isArray(context.reviewFocus) && context.reviewFocus.length, 'Review focus required');
    context.reviewFocus.forEach(value => nonempty(value, 'Review focus'));
    exact(context.task, ['seed', 'language', 'ability', 'answers', 'checklist'], 'Canonical production task');
    const task = parsePhrasebookRequest(context.task);
    assert(!task.error, task.error);
    assert.equal(context.task.checklist.length, 1, 'Exactly one topic required');
    const fixture = cases.find(fixture => fixture.id === context.id);
    exact(fixture, ['id', 'english', 'translation', 'reviews'], 'Pipeline case');
    const baseline = baseInput(context, fixture);
    assert(Array.isArray(fixture.reviews) && fixture.reviews.length >= 2, 'Control and defect reviews required');
    assert.equal(new Set(fixture.reviews.map(review => review.id)).size, fixture.reviews.length, 'Duplicate review ID');
    assert(fixture.reviews.some(review => review.kind === 'correct-control'), 'Missing correct control');
    assert(fixture.reviews.some(review => review.kind === 'defect'), 'Missing known defect');
    for (const review of fixture.reviews) {
      exact(review, ['id', 'kind', 'mutations', 'expectedFindings', 'mockDetection', 'repairs', 'expected', 'note'], 'Review');
      nonempty(review.id, 'Review ID'); nonempty(review.note, 'Review provenance note');
      assert(['correct-control', 'defect', 'unresolved'].includes(review.kind), 'Unknown review kind');
      assert(Array.isArray(review.mutations) && Array.isArray(review.expectedFindings) && Array.isArray(review.repairs), 'Review arrays required');
      const mutated = new Set();
      for (const mutation of review.mutations) {
        exact(mutation, ['handle', 'field', 'value'], 'Mutation');
        const key = JSON.stringify([mutation.handle, mutation.field]); assert(!mutated.has(key), 'Duplicate mutation'); mutated.add(key);
      }
      const input = reviewInput(context, fixture, review);
      for (const finding of review.expectedFindings) {
        exact(finding, ['handle', 'field', 'category'], 'Expected finding');
        validateDetection({ complete: true, findings: [{ ...finding, severity: 'material', origin: 'translation', reason: 'Validate the proposed fixture location.' }], unresolved: [] }, input);
      }
      assert.equal(new Set(review.expectedFindings.map(location)).size, review.expectedFindings.length, 'Duplicate expected finding');
      validateDetection(review.mockDetection, input);
      const repairHandles = new Set();
      for (const repair of review.repairs) {
        exact(repair, ['focus', 'response'], 'Fixture repair');
        assert(!repairHandles.has(repair.focus.handle), 'Duplicate fixture repair handle'); repairHandles.add(repair.focus.handle);
        applyLocalizedRepair(repair.response, { ...input, focus: repair.focus });
      }
      exact(review.expected, ['outcome', 'checks'], 'Expected outcome');
      assert(['clean', 'repaired', 'unresolved'].includes(review.expected.outcome), 'Unknown expected outcome');
      assert(Array.isArray(review.expected.checks), 'Expected checks must be an array');
      for (const check of review.expected.checks) {
        exact(check, ['handle', 'field', 'value'], 'Expected check');
        assert(input.items.some(item => item.handle === check.handle) && (editableFields.has(check.field) || check.field === 'translation'), 'Unknown expected check location');
      }
      if (review.kind === 'correct-control') {
        assert.equal(review.mutations.length, 0, 'Control must not mutate baseline');
        assert.equal(review.expectedFindings.length, 0, 'Control must not expect defects');
        assert.equal(review.expected.outcome, 'clean', 'Control must expect clean');
        assert(equal(input.items, baseline.items) || input.items.every((item, index) => equal(item.card, baseline.items[index].card)), 'Control changed baseline cards');
      }
      if (review.kind === 'defect') assert(review.expectedFindings.length > 0, 'Known defect needs a finding');
      if (review.kind === 'unresolved') { unresolved++; assert.equal(review.expected.outcome, 'unresolved'); }
      const result = evaluateReview(input, review, { id: review.id, detection: review.mockDetection, repairs: review.repairs });
      assert(result.structural.pass, `${context.id}/${review.id}: ${result.errors.join('; ')}`);
      assert(result.fixtureExpectation.pass, `${context.id}/${review.id}: mock does not satisfy authored expectation`);
    }
  }
  assert(unresolved > 0, 'An unresolved ambiguity fixture is required');
  return { valid: true, contexts: contexts.length, reviews: cases.reduce((sum, fixture) => sum + fixture.reviews.length, 0), provenance: 'authored-proposed-fixtures', linguisticCertification: false };
}

function select(fixtures, contextId) {
  const contexts = fixtures.contexts.contexts.filter(context => contextId === undefined || context.id === contextId);
  assert(contexts.length, `Unknown context filter: ${contextId}`);
  return contexts.map(context => ({ context, fixture: fixtures.cases.cases.find(fixture => fixture.id === context.id) }));
}
function englishRequest(context) { return buildEnglishPrompt(context.task, { instructions: generationTemplate }); }
function translationRequest(context, conversation) { return buildTranslationPrompt({ task: context.task, conversation }, { instructions: translationTemplate }); }
function detectionRequest(input) { return { ...buildDetectionPrompt(input, { instructions: detectionInstructions }), schema: structuredClone(detectionSchema) }; }
function repairRequest(input, focus) { return buildRepairPrompt({ ...input, focus }, { instructions: repairInstructions, schema: repairSchema }); }
function requestEntry(stage, contextId, request, extras = {}) {
  return { stage, contextId, ...extras, request, hashes: { prompt: sha256(request.instructions), input: sha256(request.input), schema: request.schema === null ? null : sha256(request.schema) } };
}

export function prepareRequests(fixtures, pipeline, { contextId } = {}) {
  assert(['a', 'b', 'c'].includes(pipeline), 'Prepare supports a, b or c');
  assert(contextId !== undefined, 'Prepare requires --context ID');
  const [{ context, fixture }] = select(fixtures, contextId);
  const requests = [];
  if (pipeline === 'a') requests.push(requestEntry('a', context.id, englishRequest(context)));
  if (pipeline === 'b') requests.push(requestEntry('b', context.id, translationRequest(context, normalizeA(fixture.english, context.task).value.conversations[0]), { englishSource: 'fixed-authored-fixture' }));
  if (pipeline === 'c') for (const review of fixture.reviews) {
    const input = reviewInput(context, fixture, review);
    requests.push(requestEntry('c-detection', context.id, detectionRequest(input), { reviewId: review.id }));
    for (const repair of review.repairs) requests.push(requestEntry('c-known-location-repair', context.id, repairRequest(input, repair.focus), { reviewId: review.id, oracleAssisted: true }));
  }
  return { version: 1, mode: 'prepare-only', destination: 'native Romp', dispatch: false, approved: false, executionReady: false, model: null, provider: null, fixtureHashes: fixtureHashes(fixtures), contextSha256: sha256(context.task), dependencyHashes: dependencyHashes(), requests, note: 'No requests executed. C localized requests are a separate known-location experiment, not detector-gated observations. For actual detector-selected handles use prepareDetectedRepairs.' };
}

export function prepareDetectedRepairs(input, detection) {
  const route = routeDetection(input, parsedResponse(detection));
  return { route, requests: route.repairHandles.map(handle => ({ handle, request: repairRequest(input, repairCaseInput(input, handle).focus) })) };
}

export function prepareComposedTranslation(fixtures, contextId, englishResponse) {
  const [{ context }] = select(fixtures, contextId);
  const normalized = normalizeA(englishResponse, context.task);
  return requestEntry('b', context.id, translationRequest(context, normalized.value.conversations[0]), {
    englishSource: 'actual-a-output', englishSha256: sha256(normalized.value.conversations[0]),
  });
}

export function evaluateReview(input, review, saved, { provenance = 'saved-response' } = {}) {
  const errors = []; let detection; let detectionValid = false;
  try { detection = parsedResponse(saved?.detection); validateDetection(detection, input); detectionValid = true; } catch (error) { errors.push(`Detection: ${error.message}`); }
  const expected = new Set(review.expectedFindings.map(location));
  const actual = new Set(detectionValid ? detection.findings.map(location) : []);
  const matches = review.expectedFindings.filter(finding => actual.has(location(finding)));
  const misses = review.expectedFindings.filter(finding => !actual.has(location(finding)));
  const falseAlarms = detectionValid ? detection.findings.filter(finding => !expected.has(location(finding))) : [];
  const repairs = []; const seen = new Set();
  if (!Array.isArray(saved?.repairs)) errors.push('Repairs must be an array');
  for (const repair of Array.isArray(saved?.repairs) ? saved.repairs : []) {
    let response; let raw; const handle = repair?.focus?.handle;
    try {
      exact(repair, ['focus', 'response'], 'Saved repair');
      assert(!seen.has(handle), 'Duplicate saved repair handle'); seen.add(handle);
      raw = rawInfo(repair.response).summary;
      response = parsedResponse(repair.response);
      applyLocalizedRepair(response, { ...input, focus: repair.focus });
      repairs.push({ handle, focus: structuredClone(repair.focus), status: 'completed', rawValid: true, applicationValid: true, response, raw });
    } catch (error) { errors.push(`Repair ${handle ?? '(unknown)'}: ${error.message}`); repairs.push({ handle, focus: repair?.focus, status: 'failed', rawValid: false, applicationValid: false, response, raw, error: error.message }); }
  }
  let known = { items: structuredClone(input.items), application: 'original-retained', unresolvedHandles: input.items.map(item => item.handle), error: null };
  try {
    assert(repairs.every(repair => repair.status === 'completed'), 'A known-location patch failed; retain the whole original topic');
    const required = new Set(review.repairs.map(repair => repair.focus.handle));
    assert([...required].every(handle => repairs.some(repair => repair.handle === handle)), 'Missing known-location repair response');
    known = fullConditional(input, repairs.map(repair => repair.response));
  } catch (error) { known.error = error.message; errors.push(`Known-location composition: ${error.message}`); }
  const route = detectionValid ? routeDetection(input, detection) : { repairHandles: [], unresolvedHandles: input.items.map(item => item.handle) };
  let effective;
  try {
    effective = composeTopic(input, { status: detectionValid ? 'completed' : 'failed', rawValid: detectionValid, response: detection }, repairs.filter(repair => route.repairHandles.includes(repair.handle)));
  } catch (error) {
    effective = { status: 'invalid-repair', items: structuredClone(input.items), application: 'original-retained', repairHandles: route.repairHandles, unresolvedHandles: input.items.map(item => item.handle), complete: false, error: error.message };
  }
  if (effective.error) errors.push(`Detector-gated composition: ${effective.error}`);
  const applied = changesBetween(input.items, effective.items);
  const proposed = repairs.flatMap(repair => (Array.isArray(repair.response?.changes) ? repair.response.changes : []).map(change => ({ handle: repair.handle, field: change?.field, value: change?.value })));
  const checks = checkExpectations(effective.items, review);
  const outcome = !effective.complete || !checks.every(check => check.pass) ? 'unresolved' : applied.length ? 'repaired' : 'clean';
  const expectedLocations = new Set([...review.expected.checks, ...review.mutations].map(check => JSON.stringify([check.handle, check.field])));
  const unexpected = applied.filter(change => !expectedLocations.has(JSON.stringify([change.handle, change.field])));
  const knownChecks = checkExpectations(known.items, review);
  const knownChanges = changesBetween(input.items, known.items);
  const knownOutcome = known.error || known.unresolvedHandles.length || !knownChecks.every(check => check.pass) ? 'unresolved' : knownChanges.length ? 'repaired' : 'clean';
  const sample = input.items.find(item => review.expectedFindings.some(finding => finding.handle === item.handle)) ?? input.items[0];
  const example = { handle: sample.handle, path: `/items/${input.items.indexOf(sample)}/card/text`, english: quote(sample.card.translation), target: quote(sample.card.text) };
  return {
    id: review.id, kind: review.kind, note: review.note,
    structural: { pass: errors.length === 0, immutableEnglishIntent: effective.items.every((item, index) => equal(item.english, input.items[index].english) && item.card.translation === input.items[index].card.translation) }, errors,
    detection: { valid: detectionValid, raw: saved?.detection === undefined ? null : rawInfo(saved.detection).summary, complete: detectionValid ? detection.complete : false, findings: detectionValid ? detection.findings : [], matches, misses, falseAlarms, unresolved: detectionValid ? detection.unresolved : [], interpretation: 'Matches are against authored fixture locations, not independent linguistic truth.' },
    knownLocationRepair: { oracleAssisted: true, outcome: knownOutcome, application: known.application, error: known.error ?? null, checks: knownChecks, unresolvedHandles: known.unresolvedHandles, changedFields: knownChanges.length, correctControlChangedItems: review.kind === 'correct-control' ? new Set(knownChanges.map(change => change.handle)).size : 0 },
    proposedRepairs: repairs.map(repair => ({ handle: repair.handle, requestFocus: repair.focus, status: repair.status, raw: repair.raw ?? null, reason: repair.response?.reason ?? null, proposedFieldEdits: Array.isArray(repair.response?.changes) ? repair.response.changes.length : 0, proposedSourceRemovals: Array.isArray(repair.response?.dropSourceIndexes) ? repair.response.dropSourceIndexes.length : 0, error: repair.error ?? null })),
    responseInventory: { detectionResponsesSupplied: saved?.detection === undefined ? 0 : 1, localizedRepairResponsesSupplied: repairs.length, independentNeutralRepairResponsesSupplied: 0 },
    effective: {
      evidence: provenance === 'mock' ? 'mock-workflow-proof' : 'counterfactual-composition-check',
      independentModelObservation: false,
      interpretation: 'Reuse supplied localized patches only to check detector-gated routing and atomic application offline. Known-location and neutral handle-only repair prompts differ; these reused patches are not observations from a fresh neutral request. Separate approved native Romp calls are required to measure that behavior.',
      status: effective.status, outcome, application: effective.application, complete: effective.complete,
      selectedHandles: effective.repairHandles, unresolvedHandles: effective.unresolvedHandles,
      proposedFieldEdits: proposed.length, appliedFieldEdits: applied.filter(change => change.field !== 'sources').length,
      proposedSourceRemovals: repairs.reduce((sum, repair) => sum + (Array.isArray(repair.response?.dropSourceIndexes) ? repair.response.dropSourceIndexes.length : 0), 0),
      correctControlChangedItems: review.kind === 'correct-control' ? new Set(applied.map(change => change.handle)).size : 0,
      sourceEvidence: evidenceSummary(input.items, effective.items),
      introducedDamage: { structural: applied.some(change => !editableFields.has(change.field) && change.field !== 'sources'), rejectedInvalidProposal: repairs.some(repair => repair.status !== 'completed'), unexpectedFieldChanges: unexpected.map(change => ({ path: change.path, before: quote(change.before), after: quote(change.after) })), linguistic: null },
      examples: applied.slice(0, 6).map(change => ({ path: change.path, english: quote(input.items.find(item => item.handle === change.handle).card.translation), before: quote(change.before), after: quote(change.after), reason: repairs.find(repair => repair.handle === change.handle)?.response?.reason ?? null })),
    },
    example,
    fixtureExpectation: { expectedOutcome: review.expected.outcome, actualOutcome: outcome, checks, pass: outcome === review.expected.outcome && checks.every(check => check.pass) },
  };
}

function fixtureHashes(fixtures) { return fixtures.hashes ?? { contexts: sha256(fixtures.contexts), fixtures: sha256(fixtures.cases) }; }
function dependencyHashes() {
  const paths = [
    '../../api/src/phrasebook/prompt.js', '../../api/src/phrasebook/parse.js', '../../api/src/phrasebook/index.js',
    '../../api/src/phrasebook/prompt.txt', '../../api/src/phrasebook/translate-prompt.txt',
    '../../api/src/phrasebook/reading-rules-ja.txt', '../../api/src/phrasebook/reading-rules-zh.txt',
    '../../api/src/schema/index.ts', '../../api/src/reading.js', '../../api/src/ability.js',
    './production.mjs', './topic-conversion.mjs',
    './review-contract.mjs', './review-composition.mjs', './repair-application.mjs',
    './contracts/detection.schema.json', './contracts/localized-repair.schema.json',
    './instructions.mjs', './runner.mjs', '../rubric.json',
  ];
  return Object.fromEntries(paths.map(path => [path, sha256(readFileSync(new URL(path, import.meta.url), 'utf8'))]));
}
function rubricReference() {
  const text = readFileSync(new URL('../rubric.json', import.meta.url), 'utf8');
  return { path: 'evals/rubric.json', version: JSON.parse(text).version, sha256: sha256(text), scores: null, status: 'pending subjective review' };
}
function stageResult(stage, callback) {
  try { return { stage, status: 'passed', structural: true, ...callback(), providerMeasurements: measurements() }; }
  catch (error) { return { stage, status: 'failed', structural: false, error: error.message, providerMeasurements: measurements() }; }
}
function normalizeSummary(result) { return { raw: result.raw, normalized: { failureLevel: result.value.failureLevel, changes: result.changes, flags: result.value.flags ?? [] } }; }

export function evaluateResponses(fixtures, pipeline, saved, { contextId, provenance = 'saved-response' } = {}) {
  assert(['a', 'b', 'c', 'ab'].includes(pipeline), 'Unknown pipeline');
  exact(saved, ['version', 'responses'], 'Saved response document');
  assert.equal(saved.version, 1, 'Unsupported saved response version');
  assert(Array.isArray(saved.responses), 'Saved responses must be an array');
  const allIds = new Set(fixtures.contexts.contexts.map(context => context.id));
  const rows = new Map();
  for (const row of saved.responses) {
    assert(object(row) && Object.keys(row).every(key => ['contextId', 'english', 'translation', 'reviews'].includes(key)), 'Unknown saved response field');
    assert(allIds.has(row.contextId), `Unknown saved context: ${row.contextId}`);
    assert(!rows.has(row.contextId), `Duplicate saved context: ${row.contextId}`); rows.set(row.contextId, row);
  }
  const results = [];
  for (const { context, fixture } of select(fixtures, contextId)) {
    const row = rows.get(context.id); assert(row, `Missing saved responses for ${context.id}`);
    const stages = []; let english;
    if (pipeline === 'a' || pipeline === 'ab') stages.push(stageResult('a', () => {
      const normalized = normalizeA(row.english, context.task); english = normalized.value.conversations[0];
      return { ...normalizeSummary(normalized), counts: { essentials: english.essentials.length, vocab: english.vocab.length, dialogue: english.lines.length }, example: { path: '/conversations/0/essentials/0', english: quote(english.essentials[0]) } };
    }));
    if (pipeline === 'b' || pipeline === 'ab') {
      if (pipeline === 'b') english = normalizeA(fixture.english, context.task).value.conversations[0];
      stages.push(stageResult('b', () => {
        assert(english, 'A failed; B is blocked, not evaluated against a replacement fixture');
        const request = translationRequest(context, english);
        const normalized = normalizeB(row.translation, context.task, english);
        const assembled = assemblePhrasebook({ seed: context.task.seed, language: context.task.language, conversations: [english], translations: [normalized.value] });
        toReviewInput({ task: context.task, conversation: english, group: assembled.groups[0] });
        return { ...normalizeSummary(normalized), englishSource: pipeline === 'ab' ? 'actual-a-output' : 'fixed-authored-fixture', englishSha256: sha256(english), requestInputSha256: sha256(request.input), assembledCards: assembled.groups[0].essentials.length + assembled.groups[0].dialogue.length + assembled.groups[0].vocab.length, example: { path: '/groups/0/essentials/0/card', english: quote(assembled.groups[0].essentials[0].card.translation), target: quote(assembled.groups[0].essentials[0].card.text) } };
      }));
    }
    if (pipeline === 'c') stages.push(stageResult('c', () => {
      assert(Array.isArray(row.reviews), 'Saved C reviews must be an array');
      const reviews = new Map();
      for (const review of row.reviews) {
        exact(review, ['id', 'detection', 'repairs'], 'Saved C review');
        assert(fixture.reviews.some(expected => expected.id === review.id), `Unknown saved review ${review.id}`);
        assert(!reviews.has(review.id), 'Duplicate saved review'); reviews.set(review.id, review);
      }
      const evaluated = fixture.reviews.map(review => { assert(reviews.has(review.id), `Missing saved review ${review.id}`); return evaluateReview(reviewInput(context, fixture, review), review, reviews.get(review.id), { provenance }); });
      return { status: evaluated.every(review => review.structural.pass) ? 'passed' : 'failed', structural: evaluated.every(review => review.structural.pass), reviews: evaluated };
    }));
    results.push({ contextId: context.id, language: context.task.language, kind: context.kind, reviewFocus: context.reviewFocus, stages });
  }
  return {
    version: 1, pipeline, provenance, quality: 'pending subjective review', rubric: rubricReference(),
    fixtureStatus: fixtures.cases.status, fixtureHashes: fixtureHashes(fixtures),
    observations: { providerExecuted: false, linguisticCertification: false, subjectiveScores: null, providerMeasurements: measurements() },
    coverage: { contexts: results.length, ordinary: results.filter(result => result.kind === 'ordinary').length, challenge: results.filter(result => result.kind === 'challenge').length, interpretation: 'Deliberately authored challenge sampling is not production defect prevalence.' },
    structuralPass: results.every(result => result.stages.every(stage => stage.structural)),
    fixtureExpectationsPass: pipeline === 'c' ? results.every(result => result.stages.every(stage => stage.reviews?.every(review => review.fixtureExpectation.pass))) : null,
    results,
  };
}

export function runMock(fixtures, pipeline, options = {}) {
  const saved = { version: 1, responses: select(fixtures, options.contextId).map(({ context, fixture }) => ({ contextId: context.id, english: fixture.english, translation: fixture.translation, reviews: fixture.reviews.map(review => ({ id: review.id, detection: review.mockDetection, repairs: review.repairs })) })) };
  return evaluateResponses(fixtures, pipeline, saved, { ...options, provenance: 'mock' });
}

export function calibrationPlan(fixtures) {
  const requests = [];
  for (const { context, fixture } of select(fixtures)) {
    requests.push(requestEntry('a', context.id, englishRequest(context)));
    requests.push(requestEntry('b', context.id, translationRequest(context, normalizeA(fixture.english, context.task).value.conversations[0])));
    for (const review of fixture.reviews) {
      const input = reviewInput(context, fixture, review);
      requests.push(requestEntry('c-detection', context.id, detectionRequest(input), { reviewId: review.id }));
      for (const repair of review.repairs) {
        const finding = review.mockDetection.findings.find(candidate => location(candidate) === location(repair.focus));
        const materialFinding = finding?.origin === 'translation' && ['material', 'critical'].includes(finding.severity);
        requests.push(requestEntry('c-known-location-repair', context.id, repairRequest(input, repair.focus), {
          reviewId: review.id, oracleAssisted: true, materialFinding,
          purpose: materialFinding ? 'localized-correction' : 'unresolved-intent-abstention-probe',
        }));
      }
    }
  }
  const counts = Object.fromEntries(['a', 'b', 'c-detection', 'c-known-location-repair'].map(stage => [stage, requests.filter(request => request.stage === stage).length]));
  const manifest = requests.map(({ request, ...entry }) => ({ ...entry, provider: null, model: null, modelRevision: null, pricing: null, maxOutputTokens: null }));
  const hashes = fixtureHashes(fixtures);
  const dependencies = dependencyHashes();
  return {
    version: 1, mode: 'proposed-single-baseline-freeze', approved: false, executionReady: false, dispatch: false,
    destination: 'native Romp', model: null, provider: null,
    schemaBinding: 'Per-request schema hashes; A uses production prompt-only JSON (schema=null).',
    promptHashes: { a: sha256(generationTemplate), bTemplate: sha256(translationTemplate), readingRulesJa: sha256(productionFile('reading-rules-ja.txt')), readingRulesZh: sha256(productionFile('reading-rules-zh.txt')), cDetection: sha256(detectionInstructions), cRepair: sha256(repairInstructions) },
    ...hashes, dependencyHashes: dependencies, rubric: rubricReference(),
    contextHashes: Object.fromEntries(fixtures.contexts.contexts.map(context => [context.id, sha256(context.task)])),
    planSha256: sha256({ hashes, dependencies, manifest }), counts, totalCalls: requests.length,
    maximumAutomaticRetries: 0, paidJudgeCalls: 0, providerMeasurements: measurements(), budgetUsd: null, paidLedger: null,
    comparisons: 'deferred',
    detectorGatedLiveEvaluation: { status: 'not-observed-not-in-this-plan', independentNeutralRepairCalls: null, offlinePatchReuse: 'counterfactual-composition-check-only', requirement: 'Measure neutral handle-only repair behavior with separate explicitly approved native Romp requests; do not count known-location replies as those observations.' },
    blockers: ['Obtain user approval of the proposed rubric, priorities and representative fixture/report sample.', 'Bind exact native Romp provider/model/revision and pricing for every call.', 'Bind output-token limits, timeout, retry policy, cost ceiling, unknown-charge reserve and stop rules to this exact native Romp plan before paid approval.', 'This proposal is not approval and does not authorize execution.'],
    manifest,
    note: 'Five A calls and five standalone B calls pinned to authored English; C detection for every review case and six known-location replies: five material translation corrections plus one unresolved-intent abstention probe. The latter must not invent learner intent or change immutable English. All C reply slots required by saved-response evaluation are accounted for; no mock reply fills a missing paid observation. A/B quality and all C judgments require independent linguistic review. No retry or paid judge.',
  };
}

export function createReviewInput(fixtures, contextId, reviewId) {
  const [{ context, fixture }] = select(fixtures, contextId);
  const review = fixture.reviews.find(review => review.id === reviewId);
  assert(review, `Unknown review filter: ${reviewId}`);
  return reviewInput(context, fixture, review);
}
