'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { parseTextbookRequest } = require('../textbook-parse');
const { validateTextbookQuestionsResponse, validateTextbookGenerateResponse } = require('../textbook-validate');
const { buildTextbookQuestionsPrompt, buildTextbookGeneratePrompt } = require('../textbook-prompt');
const { handleTextbook } = require('../textbook');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeCard(overrides = {}) {
  return {
    lang: 'es',
    text: '¿Bailas?',
    translation: 'Wanna dance?',
    reading: [['¿Bailas?', null]],
    ...overrides,
  };
}

function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

const VALID_QUESTIONS_BODY = { topic: 'salsa dancing', language: 'es' };
const VALID_GENERATE_BODY = {
  topic: 'salsa dancing',
  language: 'es',
  context: { answers: { 'Salsa scene': 'Latin America (neutral)' }, checklist: ['Ask someone to dance'] },
};

function happyQuestionsRaw() {
  return JSON.stringify({
    questions: [
      { label: 'Salsa scene', options: ['Latin America (neutral)', 'Cuban style'], default: 'Latin America (neutral)' },
    ],
    checklist: [
      { label: 'Ask someone to dance', checked: true },
      { label: 'Dance/step vocabulary', checked: false },
    ],
  });
}

function happyGenerateRaw() {
  return JSON.stringify({
    groups: [
      { title: 'Ask someone to dance', cards: [makeCard()] },
    ],
  });
}

// Wraps raw model text in the wrapper contract shape ({ text, model, usage })
// that src/llms/*.js now return and the handlers consume.
function reply(text, usage = { inputTokens: 12, outputTokens: 34 }) {
  return { text, model: 'test-model', usage };
}

// ---------------------------------------------------------------------------
// parseTextbookRequest — validation + defaults + call-mode branching
// ---------------------------------------------------------------------------

describe('parseTextbookRequest', () => {
  test('missing topic → error', () => {
    const result = parseTextbookRequest({ language: 'es' });
    assert.match(result.error, /topic/);
  });

  test('missing language → error', () => {
    const result = parseTextbookRequest({ topic: 'salsa dancing' });
    assert.match(result.error, /language/);
  });

  test('topic > 200 characters → error', () => {
    const result = parseTextbookRequest({ topic: 'x'.repeat(201), language: 'es' });
    assert.match(result.error, /200/);
  });

  test('invalid enum values → error', () => {
    assert.match(parseTextbookRequest({ topic: 'a', language: 'fr' }).error, /language/);
    assert.match(parseTextbookRequest({ topic: 'a', language: 'es', ability: 'expert' }).error, /ability/);
    assert.match(parseTextbookRequest({ topic: 'a', language: 'es', llm: 'gpt5' }).error, /Unknown LLM/);
  });

  test('context absent → mode "questions", defaults applied', () => {
    const result = parseTextbookRequest({ topic: 'salsa dancing', language: 'es' });
    assert.deepEqual(result.value, {
      topic: 'salsa dancing',
      language: 'es',
      ability: 'beginner',
      llm: 'google',
      mode: 'questions',
    });
  });

  test('context present as an object → mode "generate", context passed through', () => {
    const context = { answers: { a: 'b' }, checklist: ['x'] };
    const result = parseTextbookRequest({ topic: 'salsa dancing', language: 'es', context });
    assert.equal(result.value.mode, 'generate');
    assert.deepEqual(result.value.context, context);
  });

  test('context present but not an object (string/array/null) → error', () => {
    assert.match(parseTextbookRequest({ topic: 'a', language: 'es', context: 'oops' }).error, /context/);
    assert.match(parseTextbookRequest({ topic: 'a', language: 'es', context: ['oops'] }).error, /context/);
    assert.match(parseTextbookRequest({ topic: 'a', language: 'es', context: null }).error, /context/);
  });

  test('explicit values override defaults', () => {
    const result = parseTextbookRequest({ topic: 'a', language: 'zh', ability: 'advanced', llm: 'claude' });
    assert.equal(result.value.ability, 'advanced');
    assert.equal(result.value.llm, 'claude');
  });
});

// ---------------------------------------------------------------------------
// validateTextbookQuestionsResponse — call 1 validate + finish
// ---------------------------------------------------------------------------

describe('validateTextbookQuestionsResponse', () => {
  test('malformed JSON → throws', () => {
    assert.throws(() => validateTextbookQuestionsResponse('not json'));
  });

  test('truncated JSON → throws (max_tokens trap)', () => {
    const truncated = happyQuestionsRaw().slice(0, -5);
    assert.throws(() => validateTextbookQuestionsResponse(truncated));
  });

  test('missing questions/checklist → throws', () => {
    assert.throws(() => validateTextbookQuestionsResponse(JSON.stringify({ checklist: [{ label: 'x', checked: true }] })));
    assert.throws(() => validateTextbookQuestionsResponse(JSON.stringify({ questions: [{ label: 'x', options: ['a'], default: 'a' }] })));
  });

  test('question.default not in question.options → throws', () => {
    const raw = JSON.stringify({
      questions: [{ label: 'Scene', options: ['a', 'b'], default: 'c' }],
      checklist: [{ label: 'x', checked: true }],
    });
    assert.throws(() => validateTextbookQuestionsResponse(raw));
  });

  test('exactly 6 questions → no trim (boundary)', () => {
    const questions = Array.from({ length: 6 }, (_, i) => ({ label: `q${i}`, options: ['a'], default: 'a' }));
    const raw = JSON.stringify({ questions, checklist: [{ label: 'x', checked: true }] });
    const { response, warnings } = validateTextbookQuestionsResponse(raw);
    assert.equal(response.questions.length, 6);
    assert.deepEqual(warnings, []);
  });

  test('> 6 questions → trimmed to 6, keeps first 6 in order', () => {
    const questions = Array.from({ length: 9 }, (_, i) => ({ label: `q${i}`, options: ['a'], default: 'a' }));
    const raw = JSON.stringify({ questions, checklist: [{ label: 'x', checked: true }] });
    const { response, warnings } = validateTextbookQuestionsResponse(raw);
    assert.equal(response.questions.length, 6);
    assert.deepEqual(response.questions.map((q) => q.label), ['q0', 'q1', 'q2', 'q3', 'q4', 'q5']);
    assert.ok(warnings.some((w) => w.includes('questions')));
  });

  test('exactly 8 checklist items → no trim (boundary)', () => {
    const checklist = Array.from({ length: 8 }, (_, i) => ({ label: `c${i}`, checked: false }));
    const raw = JSON.stringify({ questions: [{ label: 'q', options: ['a'], default: 'a' }], checklist });
    const { response, warnings } = validateTextbookQuestionsResponse(raw);
    assert.equal(response.checklist.length, 8);
    assert.deepEqual(warnings, []);
  });

  test('> 8 checklist items → trimmed to 8, keeps first 8 in order', () => {
    const checklist = Array.from({ length: 11 }, (_, i) => ({ label: `c${i}`, checked: false }));
    const raw = JSON.stringify({ questions: [{ label: 'q', options: ['a'], default: 'a' }], checklist });
    const { response, warnings } = validateTextbookQuestionsResponse(raw);
    assert.equal(response.checklist.length, 8);
    assert.deepEqual(response.checklist.map((c) => c.label), ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']);
    assert.ok(warnings.some((w) => w.includes('checklist')));
  });

  test('checklist item.checked coerced to boolean (non-true → false)', () => {
    const raw = JSON.stringify({
      questions: [{ label: 'q', options: ['a'], default: 'a' }],
      checklist: [{ label: 'x', checked: 'yes' }, { label: 'y' }],
    });
    const { response } = validateTextbookQuestionsResponse(raw);
    assert.equal(response.checklist[0].checked, false);
    assert.equal(response.checklist[1].checked, false);
  });
});

// ---------------------------------------------------------------------------
// validateTextbookGenerateResponse — call 2 validate + finish
// ---------------------------------------------------------------------------

describe('validateTextbookGenerateResponse', () => {
  test('malformed JSON → throws', () => {
    assert.throws(() => validateTextbookGenerateResponse('not json'));
  });

  test('truncated JSON → throws (max_tokens trap)', () => {
    const truncated = happyGenerateRaw().slice(0, -5);
    assert.throws(() => validateTextbookGenerateResponse(truncated));
  });

  test('missing groups → throws', () => {
    assert.throws(() => validateTextbookGenerateResponse(JSON.stringify({})));
  });

  test('invalid card → throws', () => {
    const raw = JSON.stringify({ groups: [{ title: 'g', cards: [{ lang: 'es' }] }] });
    assert.throws(() => validateTextbookGenerateResponse(raw));
  });

  test('exactly 8 groups → no trim (boundary)', () => {
    const groups = Array.from({ length: 8 }, (_, i) => ({ title: `g${i}`, cards: [makeCard()] }));
    const { response, warnings } = validateTextbookGenerateResponse(JSON.stringify({ groups }));
    assert.equal(response.groups.length, 8);
    assert.deepEqual(warnings, []);
  });

  test('> 8 groups → trimmed to 8, keeps first 8 in order', () => {
    const groups = Array.from({ length: 10 }, (_, i) => ({ title: `g${i}`, cards: [makeCard()] }));
    const { response, warnings } = validateTextbookGenerateResponse(JSON.stringify({ groups }));
    assert.equal(response.groups.length, 8);
    assert.deepEqual(response.groups.map((g) => g.title), ['g0', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7']);
    assert.ok(warnings.some((w) => w.includes('groups')));
  });

  test('exactly 15 cards/group → no trim (boundary)', () => {
    const cards = Array.from({ length: 15 }, (_, i) => makeCard({ text: `c${i}` }));
    const raw = JSON.stringify({ groups: [{ title: 'g', cards }] });
    const { response, warnings } = validateTextbookGenerateResponse(raw);
    assert.equal(response.groups[0].cards.length, 15);
    assert.deepEqual(warnings, []);
  });

  test('> 15 cards/group → trimmed to 15, keeps first 15 in order', () => {
    const cards = Array.from({ length: 18 }, (_, i) => makeCard({ text: `c${i}` }));
    const raw = JSON.stringify({ groups: [{ title: 'g', cards }] });
    const { response, warnings } = validateTextbookGenerateResponse(raw);
    assert.equal(response.groups[0].cards.length, 15);
    assert.deepEqual(response.groups[0].cards.map((c) => c.text), cards.slice(0, 15).map((c) => c.text));
    assert.ok(warnings.some((w) => w.includes('clamped cards')));
  });

  test('empty group is dropped (no other minimum enforced)', () => {
    const raw = JSON.stringify({
      groups: [
        { title: 'has-cards', cards: [makeCard()] },
        { title: 'empty', cards: [] },
      ],
    });
    const { response, warnings } = validateTextbookGenerateResponse(raw);
    assert.equal(response.groups.length, 1);
    assert.equal(response.groups[0].title, 'has-cards');
    assert.ok(warnings.some((w) => w.includes('dropped (empty)')));
  });

  test('context is service-set from the group title on every card (never model-emitted)', () => {
    const raw = JSON.stringify({
      groups: [{ title: 'Ask someone to dance', cards: [makeCard({ context: 'ignored-if-model-sent-it' })] }],
    });
    const { response } = validateTextbookGenerateResponse(raw);
    assert.equal(response.groups[0].cards[0].context, 'Ask someone to dance');
  });

  test('garbage formality value (not in CARD_SCHEMA) → throws', () => {
    const raw = JSON.stringify({ groups: [{ title: 'g', cards: [makeCard({ formality: 'nonsense' })] }] });
    assert.throws(() => validateTextbookGenerateResponse(raw));
  });

  test('formality valid per CARD_SCHEMA but not a /textbook output value ("vulgar") → stripped', () => {
    const raw = JSON.stringify({ groups: [{ title: 'g', cards: [makeCard({ formality: 'vulgar' })] }] });
    const { response, warnings } = validateTextbookGenerateResponse(raw);
    assert.equal(response.groups[0].cards[0].formality, undefined);
    assert.ok(warnings.some((w) => w.includes('formality stripped')));
  });

  test('Japanese kana readings never get ruby and adjacent unannotated tokens are merged', () => {
    const raw = JSON.stringify({
      groups: [{
        title: 'Dance/step vocabulary',
        cards: [makeCard({
          lang: 'ja',
          text: '踊りましょう',
          reading: [['踊', 'おど'], ['り', null], ['ま', null], ['し', null], ['ょ', null], ['う', null]],
        })],
      }],
    });
    const { response } = validateTextbookGenerateResponse(raw);
    assert.deepEqual(response.groups[0].cards[0].reading, [['踊', 'おど'], ['りましょう', null]]);
  });
  test('top-level title present → returned trimmed', () => {
    const raw = JSON.stringify({ title: '  Salsa Social Dancing  ', groups: [{ title: 'g', cards: [makeCard()] }] });
    const { response, warnings } = validateTextbookGenerateResponse(raw);
    assert.equal(response.title, 'Salsa Social Dancing');
    assert.deepEqual(warnings, []);
  });

  test('missing title → omitted (no key, no warning), groups still returned', () => {
    const { response, warnings } = validateTextbookGenerateResponse(happyGenerateRaw());
    assert.equal('title' in response, false);
    assert.equal(response.groups.length, 1);
    assert.deepEqual(warnings, []);
  });

  test('over-length title → clamped to 60 chars with a warning', () => {
    const longTitle = 'A'.repeat(75);
    const raw = JSON.stringify({ title: longTitle, groups: [{ title: 'g', cards: [makeCard()] }] });
    const { response, warnings } = validateTextbookGenerateResponse(raw);
    assert.equal(response.title.length, 60);
    assert.ok(warnings.some((w) => w.includes('title')));
  });

  test('non-string title → ignored (omitted) with a warning, not a throw', () => {
    const raw = JSON.stringify({ title: 123, groups: [{ title: 'g', cards: [makeCard()] }] });
    const { response, warnings } = validateTextbookGenerateResponse(raw);
    assert.equal('title' in response, false);
    assert.ok(warnings.some((w) => w.includes('title')));
  });
});

// ---------------------------------------------------------------------------
// prompt builders — sanity checks that key rules made it into the text
// ---------------------------------------------------------------------------

describe('prompt builders', () => {
  test('buildTextbookQuestionsPrompt includes the topic, caps, and reuses ability description', () => {
    const prompt = buildTextbookQuestionsPrompt({ topic: 'salsa dancing', language: 'es', ability: 'beginner' });
    assert.match(prompt, /salsa dancing/);
    assert.match(prompt, /Hard cap: 6 questions/);
    assert.match(prompt, /Hard cap: 8 items/);
    assert.match(prompt, /Learner ability: beginner/);
  });

  test('buildTextbookGeneratePrompt embeds context, allows reshape, and adds an example-conversation group', () => {
    const prompt = buildTextbookGeneratePrompt({
      topic: 'salsa dancing',
      language: 'es',
      ability: 'beginner',
      context: { answers: { 'Salsa scene': 'Cuban style' }, checklist: ['Ask someone to dance', 'Dance/step vocabulary'] },
    });
    assert.match(prompt, /Salsa scene: Cuban style/);
    assert.match(prompt, /- Ask someone to dance/);
    assert.match(prompt, /- Dance\/step vocabulary/);
    assert.match(prompt, /you may reshape/);
    assert.match(prompt, /Teach both voices/);
    assert.match(prompt, /Teach the situation's real vocabulary as WORDS/);
    assert.match(prompt, /FLOOR as well as a ceiling/);
    assert.match(prompt, /genuine two-sided exchange/);
    assert.match(prompt, /Example conversation/);
    assert.match(prompt, /"speaker":"you"/);
  });

  test('buildTextbookGeneratePrompt reuses /lookup gender-collapse rule for gendered languages', () => {
    const prompt = buildTextbookGeneratePrompt({
      topic: 'dinner with parents', language: 'es', ability: 'beginner', context: { answers: {}, checklist: ['Small talk'] },
    });
    assert.match(prompt, /Default to the MASCULINE form/);
  });
});

// ---------------------------------------------------------------------------
// handleTextbook — route + handler, both call modes
// ---------------------------------------------------------------------------

describe('handleTextbook', () => {
  test('missing topic/language → 400', async () => {
    const res = makeRes();
    await handleTextbook({ body: { language: 'es' } }, res, { google: async () => happyQuestionsRaw() });
    assert.equal(res.statusCode, 400);
  });

  test('unknown llm → 400', async () => {
    const res = makeRes();
    await handleTextbook({ body: { ...VALID_QUESTIONS_BODY, llm: 'not-a-model' } }, res, { google: async () => happyQuestionsRaw() });
    assert.equal(res.statusCode, 400);
  });

  test('context not an object → 400', async () => {
    const res = makeRes();
    await handleTextbook({ body: { ...VALID_QUESTIONS_BODY, context: 'oops' } }, res, { google: async () => happyQuestionsRaw() });
    assert.equal(res.statusCode, 400);
  });

  test('LLM throws → 502 "LLM request failed"', async () => {
    const res = makeRes();
    const registry = { google: async () => { throw new Error('boom'); } };
    await handleTextbook({ body: VALID_QUESTIONS_BODY }, res, registry);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, 'LLM request failed');
  });

  test('LLM times out → 502 "LLM request failed" via a distinct code path from a throw', async () => {
    const res = makeRes();
    const registry = { google: () => new Promise(() => {}) }; // never resolves
    await handleTextbook({ body: VALID_QUESTIONS_BODY }, res, registry, { timeoutMs: 10 });
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, 'LLM request failed');
  });

  test('truncated JSON → 502 "Invalid response from LLM"', async () => {
    const res = makeRes();
    const registry = { google: async () => reply(happyQuestionsRaw().slice(0, -5)) };
    await handleTextbook({ body: VALID_QUESTIONS_BODY }, res, registry);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, 'Invalid response from LLM');
  });

  test('call 1 (no context) happy path → 200 with { questions, checklist } and usage', async () => {
    const res = makeRes();
    const registry = { google: async () => reply(happyQuestionsRaw()) };
    await handleTextbook({ body: VALID_QUESTIONS_BODY }, res, registry);
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body.questions));
    assert.ok(Array.isArray(res.body.checklist));
    assert.equal(res.body.questions[0].label, 'Salsa scene');
    assert.deepEqual(res.body.usage, {
      model: 'test-model',
      inputTokens: 12,
      outputTokens: 34,
      totalTokens: 46,
      costUsd: null,
    });
  });

  test('call 2 (context present) happy path → 200 with { groups }', async () => {
    const res = makeRes();
    const registry = { google: async () => reply(happyGenerateRaw()) };
    await handleTextbook({ body: VALID_GENERATE_BODY }, res, registry);
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body.groups));
    assert.equal(res.body.groups.length, 1);
    assert.equal(res.body.groups[0].cards[0].context, 'Ask someone to dance');
  });

  test('call 2 surfaces the model title through to the 200 body', async () => {
    const res = makeRes();
    const raw = JSON.stringify({ title: 'Salsa Social Dancing', groups: [{ title: 'Ask someone to dance', cards: [makeCard()] }] });
    const registry = { google: async () => reply(raw) };
    await handleTextbook({ body: VALID_GENERATE_BODY }, res, registry);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.title, 'Salsa Social Dancing');
  });

  test('picks the requested llm out of the registry', async () => {
    const res = makeRes();
    let calledWith = null;
    const registry = {
      google: async () => { throw new Error('should not be called'); },
      claude: async (prompt) => { calledWith = prompt; return reply(happyQuestionsRaw()); },
    };
    await handleTextbook({ body: { ...VALID_QUESTIONS_BODY, llm: 'claude' } }, res, registry);
    assert.equal(res.statusCode, 200);
    assert.ok(typeof calledWith === 'string' && calledWith.length > 0);
  });

  test('passes a provider-specific output-token cap to Claude generation', async () => {
    const res = makeRes();
    let options;
    const claude = async (prompt, opts) => {
      options = opts;
      return reply(happyGenerateRaw());
    };
    claude.maxOutputTokens = 8192;
    await handleTextbook({ body: { ...VALID_GENERATE_BODY, llm: 'claude' } }, res, { claude });
    assert.equal(res.statusCode, 200);
    assert.equal(options.maxOutputTokens, 8192);
  });

});
