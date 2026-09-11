'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { parseContextRequest, validateContextResponse, handleContext } = require('../context');
const { buildContextPrompt } = require('../context-prompt');

const SUPPORTED_LLMS = ['google', 'g-flash', 'claude', 'chatgpt'];

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

function validModelOutput() {
  return JSON.stringify({
    questions: [
      { label: 'What is your dancing ability?', options: ['Complete beginner', 'Intermediate dancer'] },
      { label: 'Who are you going with?', options: ['Going solo', 'With a date or partner', 'With a group of friends'] },
    ],
    checklist: [
      { label: 'Ask someone to dance', checked: true },
      { label: 'Chat between songs', checked: true },
      { label: 'Say goodbye politely', checked: false },
    ],
  });
}

function makeRegistry(text = validModelOutput()) {
  return {
    google: async () => ({ text, model: 'gemini-3.5-flash-lite', usage: { inputTokens: 800, outputTokens: 200 } }),
  };
}

describe('parseContextRequest', () => {
  test('accepts a valid request and applies the default llm', () => {
    const parsed = parseContextRequest({ seed: 'salsa dancing in Austin, TX', language: 'es' }, SUPPORTED_LLMS);
    assert.deepEqual(parsed, { value: { seed: 'salsa dancing in Austin, TX', language: 'es', llm: 'google' } });
  });

  test('trims the seed', () => {
    const parsed = parseContextRequest({ seed: '  feeling sick  ', language: 'zh' }, SUPPORTED_LLMS);
    assert.equal(parsed.value.seed, 'feeling sick');
  });

  test('rejects a missing or empty seed', () => {
    assert.ok(parseContextRequest({ language: 'es' }, SUPPORTED_LLMS).error);
    assert.ok(parseContextRequest({ seed: '   ', language: 'es' }, SUPPORTED_LLMS).error);
  });

  test('rejects a seed over 200 characters', () => {
    const parsed = parseContextRequest({ seed: 'x'.repeat(201), language: 'es' }, SUPPORTED_LLMS);
    assert.match(parsed.error, /200/);
  });

  test('rejects an unsupported language', () => {
    const parsed = parseContextRequest({ seed: 'surf vacation', language: 'fr' }, SUPPORTED_LLMS);
    assert.ok(parsed.error);
    assert.deepEqual(parsed.supported, ['zh', 'ja', 'es', 'cs']);
  });

  test('rejects an unknown llm', () => {
    const parsed = parseContextRequest({ seed: 'surf vacation', language: 'es', llm: 'grok' }, SUPPORTED_LLMS);
    assert.ok(parsed.error);
    assert.deepEqual(parsed.supported, SUPPORTED_LLMS);
  });

  test('rejects a non-object body', () => {
    assert.ok(parseContextRequest(null, SUPPORTED_LLMS).error);
    assert.ok(parseContextRequest([], SUPPORTED_LLMS).error);
  });
});

describe('buildContextPrompt', () => {
  test('substitutes every seed and language placeholder', () => {
    const prompt = buildContextPrompt({ seed: 'asking directions', language: 'cs' });
    assert.ok(prompt.includes('asking directions'));
    assert.ok(prompt.includes('Czech'));
    assert.ok(!prompt.includes('{{SEED}}'));
    assert.ok(!prompt.includes('{{LANGUAGE}}'));
  });
});

describe('validateContextResponse', () => {
  test('accepts valid output', () => {
    const { response, warnings } = validateContextResponse(validModelOutput());
    assert.equal(response.questions.length, 2);
    assert.equal(response.checklist.length, 3);
    assert.deepEqual(warnings, []);
  });

  test('rejects non-JSON and non-object output', () => {
    assert.throws(() => validateContextResponse('not json'));
    assert.throws(() => validateContextResponse('[]'));
  });

  test('rejects missing or empty questions/checklist', () => {
    assert.throws(() => validateContextResponse(JSON.stringify({ questions: [], checklist: [{ label: 'x', checked: true }] })));
    assert.throws(() => validateContextResponse(JSON.stringify({ questions: [{ label: 'q', options: ['a', 'b'] }], checklist: [] })));
  });

  test('rejects a question with fewer than 2 options', () => {
    const bad = JSON.stringify({
      questions: [{ label: 'q', options: ['only one'] }],
      checklist: [{ label: 'x', checked: true }],
    });
    assert.throws(() => validateContextResponse(bad));
  });

  test('rejects a non-boolean checked', () => {
    const bad = JSON.stringify({
      questions: [{ label: 'q', options: ['a', 'b'] }],
      checklist: [{ label: 'x', checked: 'yes' }],
    });
    assert.throws(() => validateContextResponse(bad));
  });

  test('clamps overflow questions, options, and checklist items with warnings', () => {
    const overflow = JSON.stringify({
      questions: Array.from({ length: 7 }, (_, i) => ({
        label: `q${i}`,
        options: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      })),
      checklist: Array.from({ length: 10 }, (_, i) => ({ label: `c${i}`, checked: true })),
    });
    const { response, warnings } = validateContextResponse(overflow);
    assert.equal(response.questions.length, 5);
    assert.equal(response.questions[0].options.length, 5);
    assert.equal(response.checklist.length, 8);
    assert.ok(warnings.length > 0);
  });
});

describe('handleContext', () => {
  test('returns 200 with questions, checklist, and usage', async () => {
    const res = makeRes();
    await handleContext({ body: { seed: 'salsa dancing in Austin, TX', language: 'es' } }, res, makeRegistry());
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.questions.length, 2);
    assert.equal(res.body.checklist.length, 3);
    assert.equal(res.body.usage.model, 'gemini-3.5-flash-lite');
    assert.equal(res.body.usage.totalTokens, 1000);
  });

  test('returns 400 before any model call on invalid input', async () => {
    let called = false;
    const registry = { google: async () => { called = true; } };
    const res = makeRes();
    await handleContext({ body: { language: 'es' } }, res, registry);
    assert.equal(res.statusCode, 400);
    assert.equal(called, false);
  });

  test('returns 502 on invalid model output', async () => {
    const res = makeRes();
    await handleContext(
      { body: { seed: 'feeling sick', language: 'zh' } },
      res,
      makeRegistry('this is not json'),
    );
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, 'Invalid response from LLM');
  });

  test('returns 502 on model failure', async () => {
    const registry = { google: async () => { throw new Error('boom'); } };
    const res = makeRes();
    await handleContext({ body: { seed: 'feeling sick', language: 'zh' } }, res, registry);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, 'LLM request failed');
  });

  test('returns 502 on timeout', async () => {
    const registry = { google: () => new Promise(() => {}) };
    const res = makeRes();
    await handleContext({ body: { seed: 'feeling sick', language: 'zh' } }, res, registry, { timeoutMs: 20 });
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, 'LLM request failed');
  });
});
