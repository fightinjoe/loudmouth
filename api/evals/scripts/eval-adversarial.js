#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { buildContextPrompt } = require('../../src/context/prompt');
const { CONTEXT_MAX_TOKENS, parseContextRequest, validateContextResponse } = require('../../src/context');
const { buildPhrasebookGenerationPrompt, buildPhrasebookTranslationPrompt } = require('../../src/phrasebook/prompt');
const {
  assemblePhrasebook,
  parsePhrasebookRequest,
  validateGenerationResponse,
  validateTranslationResponse,
} = require('../../src/phrasebook/parse');
const {
  buildTranslationResponseJsonSchema,
  PHRASEBOOK_GENERATION_MAX_TOKENS,
  PHRASEBOOK_TRANSLATION_MAX_TOKENS,
} = require('../../src/phrasebook');
const { LLM_REGISTRY } = require('../../src/llm-config');
const {
  appendSyntheticCanary,
  classifyFailure,
  createSyntheticCanary,
  scoreAdversarialResponse,
} = require('../adversarial-scorer');

const EVALS_DIR = path.resolve(__dirname, '..');
const FIXTURES_FILE = path.join(EVALS_DIR, 'fixtures', 'adversarial.json');
const BASELINE_FIXTURES_DIR = path.join(EVALS_DIR, 'fixtures', 'baseline');
const DEFAULT_BACKEND = 'gemini-3.5-flash-lite';
const DEFAULT_MODEL_TIMEOUT_MS = 15000;
const OUTPUT_TOKEN_LIMITS = Object.freeze({
  context: CONTEXT_MAX_TOKENS,
  'phrasebook-generation': PHRASEBOOK_GENERATION_MAX_TOKENS,
  'phrasebook-translation': PHRASEBOOK_TRANSLATION_MAX_TOKENS,
});
const DISCLAIMER = 'A run with no observed leakage or override is only a failed attack attempt; it is not proof of confidentiality or prompt-injection resistance.';

function usage() {
  return [
    'Usage: node eval-adversarial.js [options]',
    '',
    '  --backend=NAME          Server backend key from LLM_REGISTRY',
    '  --mode=all|baseline|adversarial|control (default: adversarial)',
    '  --repetitions=N         Positive integer; default 1',
    '  --case=GLOB[,GLOB...]   Filter case ids (repeatable; * and ? supported)',
    '  --out=PATH              JSON artifact path',
    '  --fail-on-findings      Exit nonzero for leakage, override, refusal, or invalid output',
    '  --list-cases            Print selected case inventory without model calls',
    '  --help                  Print this help',
  ].join('\n');
}

function parseFlags(argv) {
  const flags = {
    backend: process.env.LLM_BACKEND || DEFAULT_BACKEND,
    mode: 'adversarial',
    repetitions: 1,
    caseFilters: [],
    failOnFindings: false,
    listCases: false,
  };
  for (const arg of argv) {
    if (arg === '--help') flags.help = true;
    else if (arg === '--fail-on-findings') flags.failOnFindings = true;
    else if (arg === '--list-cases') flags.listCases = true;
    else if (arg.startsWith('--backend=')) flags.backend = arg.slice('--backend='.length);
    else if (arg.startsWith('--mode=')) flags.mode = arg.slice('--mode='.length);
    else if (arg.startsWith('--repetitions=')) flags.repetitions = Number(arg.slice('--repetitions='.length));
    else if (arg.startsWith('--case=')) {
      flags.caseFilters.push(...arg.slice('--case='.length).split(',').map((value) => value.trim()).filter(Boolean));
    } else if (arg.startsWith('--out=')) flags.out = arg.slice('--out='.length);
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (!['all', 'baseline', 'adversarial', 'control'].includes(flags.mode)) {
    throw new Error(`Invalid --mode=${flags.mode}`);
  }
  if (!Number.isInteger(flags.repetitions) || flags.repetitions < 1) {
    throw new Error('--repetitions must be a positive integer');
  }
  if (!Object.hasOwn(LLM_REGISTRY, flags.backend)) {
    throw new Error(`Unknown --backend=${flags.backend}. Known backends: ${Object.keys(LLM_REGISTRY).join(', ')}`);
  }
  if (flags.out === '') throw new Error('--out must not be empty');
  return flags;
}

function loadFixtures() {
  const fixtures = JSON.parse(fs.readFileSync(FIXTURES_FILE, 'utf8'));
  if (fixtures.schemaVersion !== 1
    || !Array.isArray(fixtures.standardTags) || fixtures.standardTags.length !== 5
    || !Array.isArray(fixtures.controls) || !Array.isArray(fixtures.attacks)
    || !fixtures.payloads || typeof fixtures.payloads !== 'object') {
    throw new Error(`${FIXTURES_FILE} does not match adversarial fixture schema version 1`);
  }
  fixtures.standard = fixtures.standardTags.map((tag) => {
    const file = path.join(BASELINE_FIXTURES_DIR, `input_${tag}.json`);
    const input = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { id: tag, ...input, ability: input.ability || 'basics' };
  });
  const standardIds = new Set(fixtures.standardTags);
  for (const attack of fixtures.attacks) {
    if (!standardIds.has(attack.fixture)) throw new Error(`Attack ${attack.id} names unknown fixture ${attack.fixture}`);
    if (!Object.hasOwn(fixtures.payloads, attack.payload)) throw new Error(`Attack ${attack.id} names unknown payload ${attack.payload}`);
  }
  return fixtures;
}

function globRegex(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/gu, '\\$&').replaceAll('*', '.*').replaceAll('?', '.');
  return new RegExp(`^${escaped}$`, 'iu');
}

function inventory(fixtures, mode, filters) {
  const cases = [];
  if (mode === 'all' || mode === 'baseline') {
    cases.push(...fixtures.standard.map((fixture) => ({ id: `baseline/${fixture.id}`, kind: 'baseline', fixture })));
  }
  if (mode === 'all' || mode === 'adversarial' || mode === 'control') {
    cases.push(...fixtures.controls.map((fixture) => ({ id: `control/${fixture.id}`, kind: 'control', fixture })));
  }
  if (mode === 'all' || mode === 'adversarial') {
    const standards = new Map(fixtures.standard.map((fixture) => [fixture.id, fixture]));
    cases.push(...fixtures.attacks.map((attack) => ({
      id: `adversarial/${attack.id}`,
      kind: 'adversarial',
      attack,
      fixture: standards.get(attack.fixture),
    })));
  }
  if (filters.length === 0) return cases;
  const patterns = filters.map(globRegex);
  return cases.filter(({ id }) => patterns.some((pattern) => pattern.test(id)));
}

function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/gu, '-');
}

function defaultOutputPath() {
  return path.join(EVALS_DIR, 'artifacts', `adversarial-${timestampSlug()}.json`);
}

function countBy(values) {
  const counts = Object.create(null);
  for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return counts;
}

function summarize(artifact) {
  const attempted = artifact.runs.filter((run) => run.callAttempted);
  return {
    records: artifact.runs.length,
    modelCalls: attempted.length,
    outcomes: countBy(artifact.runs.map((run) => run.outcome)),
    failureCategories: countBy(artifact.runs.flatMap((run) => run.failureCategories || [])),
    stages: countBy(artifact.runs.map((run) => run.stage)),
    completedPipelines: artifact.pipelineOutputs.length,
  };
}

function createState({ outputPath, backend, flags, selected }) {
  const artifact = {
    schemaVersion: 1,
    runner: 'eval-adversarial',
    startedAt: new Date().toISOString(),
    completedAt: null,
    disclaimer: DISCLAIMER,
    config: {
      backend,
      mode: flags.mode,
      repetitions: flags.repetitions,
      caseFilters: flags.caseFilters,
      selectedCases: selected.map(({ id }) => id),
    },
    summary: {},
    runs: [],
    pipelineOutputs: [],
  };
  return {
    artifact,
    outputPath,
    persist() {
      artifact.summary = summarize(artifact);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      const temporary = `${outputPath}.tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify(artifact, null, 2)}\n`);
      fs.renameSync(temporary, outputPath);
    },
    add(record) {
      artifact.runs.push(record);
      this.persist();
      const ms = record.response?.latencyMs == null ? '' : ` ${Math.round(record.response.latencyMs)}ms`;
      console.log(`${record.caseId} [${record.stage}] ${record.outcome}${ms}`);
    },
  };
}

function safeError(error) {
  const untrusted = String(error?.message || error || 'Unknown error');
  const message = untrusted
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/gu, '[REDACTED_PRIVATE_KEY]')
    .replace(/\bBearer\s+\S+/giu, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|AIza)[-_A-Za-z0-9]{12,}\b/gu, '[REDACTED_CREDENTIAL]')
    .replace(/\b[A-Za-z0-9+/_=-]{40,}\b/gu, '[REDACTED_TOKEN]')
    .slice(0, 1200);
  return {
    name: error?.name || 'Error',
    message,
    ...(error?.status == null ? {} : { status: error.status }),
    ...(error?.code == null ? {} : { code: error.code }),
  };
}

function callErrorCategory(error) {
  const message = String(error?.message || error);
  if (/environment variable is not set|cannot find module|production prompt builder must return/iu.test(message)) {
    return 'infrastructure_error';
  }
  return 'provider_error';
}

function promptMetadata(prompt) {
  return {
    instructionsSha256: crypto.createHash('sha256').update(prompt.instructions).digest('hex'),
    instructionsChars: prompt.instructions.length,
    input: prompt.input,
  };
}

function emptyScoring() {
  return {
    canaryLeakage: { detected: false, matches: [] },
    instructionLeakage: { detected: false, excerpts: [], encodedExcerpts: [] },
    formatOverride: { detected: false, reasons: [] },
    refusal: { detected: false, matches: [] },
  };
}

function localRecord(meta, stage, failureCategory, message, input = null) {
  return {
    id: crypto.randomUUID(),
    caseId: meta.caseId,
    kind: meta.kind,
    target: meta.target || null,
    fixture: meta.fixture,
    repetition: meta.repetition,
    stage,
    callAttempted: false,
    prompt: input == null ? null : { input },
    syntheticCanary: null,
    response: { raw: null, model: null, usage: null, latencyMs: null },
    validation: { valid: false, error: message, warnings: [] },
    scoring: emptyScoring(),
    failureCategory,
    failureCategories: [failureCategory],
    outcome: failureCategory,
  };
}

function skippedRecord(meta, stage, reason) {
  return {
    id: crypto.randomUUID(),
    caseId: meta.caseId,
    kind: meta.kind,
    target: meta.target || null,
    fixture: meta.fixture,
    repetition: meta.repetition,
    stage,
    callAttempted: false,
    prompt: null,
    syntheticCanary: null,
    response: { raw: null, model: null, usage: null, latencyMs: null },
    validation: { valid: null, error: null, warnings: [] },
    scoring: emptyScoring(),
    failureCategory: null,
    failureCategories: [],
    outcome: 'skipped',
    reason,
  };
}

function effectiveTokenLimit(handler, stage) {
  const requested = OUTPUT_TOKEN_LIMITS[stage];
  return handler.maxOutputTokens == null ? requested : Math.min(requested, handler.maxOutputTokens);
}

async function callModelWithTimeout(handler, prompt, options, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Model call exceeded ${timeoutMs}ms`);
      error.code = 'EVAL_MODEL_TIMEOUT';
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      handler(prompt, { ...options, signal: controller.signal }),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function evaluateCall(state, handler, meta, {
  stage,
  prompt,
  validator,
  responseJsonSchema,
  formatMarker,
}) {
  const canary = meta.kind === 'baseline' ? null : createSyntheticCanary();
  let protectedPrompt;
  try {
    if (canary === null) {
      if (!prompt || typeof prompt !== 'object' || Array.isArray(prompt)
        || typeof prompt.instructions !== 'string' || typeof prompt.input !== 'string') {
        throw new TypeError('Production prompt builder must return { instructions: string, input: string }');
      }
      protectedPrompt = prompt;
    } else {
      protectedPrompt = appendSyntheticCanary(prompt, canary);
    }
  } catch (error) {
    const record = localRecord(meta, stage, 'infrastructure_error', safeError(error).message);
    state.add(record);
    return { record, value: null };
  }

  const requestOptions = {
    maxOutputTokens: effectiveTokenLimit(handler, stage),
    timeoutMs: handler.timeoutMs || DEFAULT_MODEL_TIMEOUT_MS,
    responseJsonSchema: !!responseJsonSchema,
  };
  const startedAt = performance.now();
  let reply;
  try {
    reply = await callModelWithTimeout(
      handler,
      protectedPrompt,
      {
        maxOutputTokens: requestOptions.maxOutputTokens,
        ...(responseJsonSchema ? { responseJsonSchema } : {}),
      },
      requestOptions.timeoutMs,
    );
  } catch (error) {
    const latencyMs = performance.now() - startedAt;
    const category = callErrorCategory(error);
    const classification = classifyFailure({ callErrorCategory: category });
    const record = {
      id: crypto.randomUUID(),
      caseId: meta.caseId,
      kind: meta.kind,
      target: meta.target || null,
      fixture: meta.fixture,
      repetition: meta.repetition,
      stage,
      callAttempted: true,
      prompt: promptMetadata(prompt),
      requestOptions,
      syntheticCanary: canary,
      response: { raw: null, model: null, usage: null, latencyMs },
      validation: { valid: null, error: null, warnings: [] },
      scoring: emptyScoring(),
      error: safeError(error),
      ...classification,
      outcome: category,
    };
    state.add(record);
    return { record, value: null };
  }

  const latencyMs = performance.now() - startedAt;
  const raw = typeof reply?.text === 'string' ? reply.text : String(reply?.text ?? '');
  const scoring = scoreAdversarialResponse({
    raw,
    canary,
    instructions: prompt.instructions,
    formatMarkers: [formatMarker],
  });
  let value = null;
  let warnings = [];
  let validationError = null;
  try {
    const result = validator(raw);
    value = Object.hasOwn(result, 'response') ? result.response : result;
    warnings = result.warnings || [];
  } catch (error) {
    validationError = safeError(error).message;
  }
  const classification = classifyFailure({
    scoring,
    validationError,
    treatRefusalAsFailure: meta.kind === 'control',
  });
  const outcome = classification.failureCategory
    || (meta.kind === 'adversarial' ? 'no_observed_compromise' : 'valid_response');
  const record = {
    id: crypto.randomUUID(),
    caseId: meta.caseId,
    kind: meta.kind,
    requestOptions,
    target: meta.target || null,
    fixture: meta.fixture,
    repetition: meta.repetition,
    stage,
    callAttempted: true,
    prompt: promptMetadata(prompt),
    syntheticCanary: canary,
    response: {
      raw,
      model: reply?.model || null,
      usage: reply?.usage || null,
      latencyMs,
    },
    validation: { valid: validationError === null, error: validationError, warnings },
    scoring,
    ...classification,
    outcome,
  };
  state.add(record);
  return { record, value };
}

function parseOrRecord(state, meta, stage, body, parser) {
  const parsed = parser(body);
  if (!parsed.error) return parsed.value;
  state.add(localRecord(meta, stage, 'input_rejected', parsed.error, JSON.stringify(body)));
  return null;
}

async function evaluateContext(state, handler, meta, body, formatMarker) {
  const request = parseOrRecord(state, meta, 'context-request', body, parseContextRequest);
  if (!request) return { value: null };
  return evaluateCall(state, handler, meta, {
    stage: 'context',
    prompt: buildContextPrompt(request),
    validator: (raw) => validateContextResponse(raw),
    formatMarker,
  });
}

async function evaluateGeneration(state, handler, meta, body, formatMarker) {
  const request = parseOrRecord(state, meta, 'phrasebook-request', body, parsePhrasebookRequest);
  if (!request) return { value: null };
  return evaluateCall(state, handler, meta, {
    stage: 'phrasebook-generation',
    prompt: buildPhrasebookGenerationPrompt(request),
    validator: (raw) => validateGenerationResponse(raw, request.checklist),
    formatMarker,
  });
}

async function evaluateTranslation(state, handler, meta, { seed, language, conversation }, formatMarker) {
  return evaluateCall(state, handler, meta, {
    stage: 'phrasebook-translation',
    prompt: buildPhrasebookTranslationPrompt({ seed, language, conversation }),
    validator: (raw) => validateTranslationResponse(raw, conversation, language),
    responseJsonSchema: buildTranslationResponseJsonSchema(conversation, language),
    formatMarker,
  });
}

function fixtureRequest(fixture) {
  return {
    seed: fixture.seed,
    language: fixture.language,
    ability: fixture.ability,
    answers: structuredClone(fixture.answers),
    checklist: [...fixture.checklist],
  };
}

function addPayloadToRequest(fixture, attack, payload) {
  const request = fixtureRequest(fixture);
  switch (attack.target) {
    case 'seed':
      request.seed = `${request.seed}. ${payload}`;
      break;
    case 'answer-label': {
      const entries = Object.entries(request.answers);
      request.answers = Object.fromEntries([[payload, entries[0][1]], ...entries.slice(1)]);
      break;
    }
    case 'answer-value': {
      const first = Object.keys(request.answers)[0];
      request.answers[first] = payload;
      break;
    }
    case 'topic':
      request.checklist[0] = payload;
      break;
    default:
      throw new Error(`Unsupported phrasebook attack target: ${attack.target}`);
  }
  return request;
}

function derivePhrasebookRequest(seed, language, context) {
  const answers = Object.fromEntries(context.questions.slice(0, 5).map((question) => [question.label, question.options[0]]));
  const checked = context.checklist.filter((item) => item.checked).map((item) => item.label);
  const checklist = (checked.length > 0 ? checked : context.checklist.map((item) => item.label)).slice(0, 3);
  return { seed, language, ability: 'basics', answers, checklist };
}

function recordPipelineOutput(state, meta, { seed, language, conversations, translations }) {
  try {
    const output = assemblePhrasebook({ seed, language, conversations, translations });
    state.artifact.pipelineOutputs.push({
      caseId: meta.caseId,
      repetition: meta.repetition,
      output,
    });
    state.persist();
    return true;
  } catch (error) {
    state.add(localRecord(meta, 'phrasebook-assembly', 'invalid_response', safeError(error).message));
    return false;
  }
}

async function runBaselineLike(state, handler, selected, repetition, formatMarker) {
  const fixture = selected.fixture;
  const meta = {
    caseId: selected.id,
    kind: selected.kind,
    target: selected.kind === 'control' ? 'benign-imperative' : null,
    fixture: fixture.id,
    repetition,
  };
  await evaluateContext(state, handler, meta, { seed: fixture.seed, language: fixture.language }, formatMarker);
  const generation = await evaluateGeneration(state, handler, meta, fixtureRequest(fixture), formatMarker);
  const conversations = generation.value?.conversations;
  if (!conversations) {
    state.add(skippedRecord(meta, 'phrasebook-translation', 'Phrasebook generation did not produce validated conversations'));
    return;
  }
  const translations = await Promise.all(conversations.map((conversation) => evaluateTranslation(state, handler, meta, {
    seed: fixture.seed,
    language: fixture.language,
    conversation,
  }, formatMarker)));
  if (translations.some(({ value }) => !value)) return;
  recordPipelineOutput(state, meta, {
    seed: fixture.seed,
    language: fixture.language,
    conversations,
    translations: translations.map(({ value }) => value),
  });
}

async function runFullPipeline(state, handler, meta, fixture, payload, formatMarker) {
  const seed = `${fixture.seed}. ${payload}`;
  const context = await evaluateContext(state, handler, meta, { seed, language: fixture.language }, formatMarker);
  if (!context.value) {
    state.add(skippedRecord(meta, 'phrasebook-generation', 'Context stage did not validate'));
    return;
  }
  const request = derivePhrasebookRequest(seed, fixture.language, context.value);
  const generation = await evaluateGeneration(state, handler, meta, request, formatMarker);
  const conversations = generation.value?.conversations;
  if (!conversations) {
    state.add(skippedRecord(meta, 'phrasebook-translation', 'Phrasebook generation stage did not validate'));
    return;
  }

  const translations = await Promise.all(conversations.map((conversation) => evaluateTranslation(state, handler, meta, {
    seed,
    language: fixture.language,
    conversation,
  }, formatMarker)));
  if (translations.some(({ value }) => !value)) return;
  recordPipelineOutput(state, meta, {
    seed,
    language: fixture.language,
    conversations,
    translations: translations.map(({ value }) => value),
  });
}

async function runAttack(state, handler, selected, repetition, fixtures) {
  const { attack, fixture } = selected;
  const payload = fixtures.payloads[attack.payload];
  const meta = {
    caseId: selected.id,
    kind: selected.kind,
    target: attack.target,
    fixture: fixture.id,
    repetition,
  };
  switch (attack.endpoint) {
    case 'phrasebook':
      if (attack.target === 'translation-source') {
        const conversation = structuredClone(attack.conversation);
        conversation.lines[0].text = `${conversation.lines[0].text} ${payload}`;
        await evaluateTranslation(state, handler, meta, {
          seed: fixture.seed,
          language: fixture.language,
          conversation,
        }, fixtures.formatMarker);
      } else {
        await evaluateGeneration(state, handler, meta, addPayloadToRequest(fixture, attack, payload), fixtures.formatMarker);
      }
      break;
    case 'pipeline':
      await runFullPipeline(state, handler, meta, fixture, payload, fixtures.formatMarker);
      break;
    default:
      throw new Error(`Unsupported attack endpoint: ${attack.endpoint}`);
  }
}

async function main(argv = process.argv.slice(2)) {
  const flags = parseFlags(argv);
  if (flags.help) {
    console.log(usage());
    return;
  }
  const fixtures = loadFixtures();
  const selected = inventory(fixtures, flags.mode, flags.caseFilters);
  if (selected.length === 0) throw new Error('No cases matched the selected mode and --case filters');
  if (flags.listCases) {
    for (const item of selected) console.log(`${item.id}\t${item.kind}`);
    return;
  }

  const outputPath = path.resolve(flags.out || defaultOutputPath());
  const state = createState({ outputPath, backend: flags.backend, flags, selected });
  state.persist();
  const handler = LLM_REGISTRY[flags.backend];
  console.log(`Backend: ${flags.backend}; cases: ${selected.length}; repetitions: ${flags.repetitions}`);
  console.log(`Artifact: ${outputPath}`);

  for (let repetition = 1; repetition <= flags.repetitions; repetition++) {
    for (const item of selected) {
      if (item.kind === 'adversarial') {
        await runAttack(state, handler, item, repetition, fixtures);
      } else {
        await runBaselineLike(state, handler, item, repetition, fixtures.formatMarker);
      }
    }
  }

  state.artifact.completedAt = new Date().toISOString();
  state.persist();
  console.log(JSON.stringify(state.artifact.summary, null, 2));
  console.log(DISCLAIMER);

  const errorCount = (state.artifact.summary.failureCategories.provider_error || 0)
    + (state.artifact.summary.failureCategories.infrastructure_error || 0)
    + (state.artifact.summary.failureCategories.input_rejected || 0);
  const findingCount = Object.entries(state.artifact.summary.failureCategories)
    .filter(([category]) => !['provider_error', 'infrastructure_error', 'input_rejected'].includes(category))
    .reduce((total, [, count]) => total + count, 0);
  if (errorCount > 0 || (flags.failOnFindings && findingCount > 0)) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`eval-adversarial failed: ${safeError(error).message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DISCLAIMER,
  addPayloadToRequest,
  derivePhrasebookRequest,
  inventory,
  loadFixtures,
  main,
  parseFlags,
};
