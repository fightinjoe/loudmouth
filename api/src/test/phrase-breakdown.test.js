'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  handlePhraseBreakdown,
  validatePhraseBreakdownResponse,
} = require('../phrase-breakdown');
const { translate } = require('../index');

const BACKEND = 'gemini-3.5-flash-lite';
process.env.LLM_BACKEND = BACKEND;

function makeRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}

function chunk(text, gloss = text) {
  return { text, gloss, role: 'meaning unit', explanation: `Explains ${gloss}.` };
}

function reply(data) {
  return {
    text: JSON.stringify(data),
    model: BACKEND,
    usage: { inputTokens: 120, outputTokens: 80 },
  };
}


test('rejects invalid request fields and client-selected providers before calling the model', async () => {
  const invalidBodies = [
    null,
    [],
    {},
    { language: 'fr', text: 'oui', translation: 'yes' },
    { language: 'es', text: ' ', translation: 'yes' },
    { language: 'es', text: 'sí', translation: ' ' },
    { language: 'es', text: 'x'.repeat(2001), translation: 'x' },
    { language: 'es', text: 'x', translation: 'x'.repeat(2001) },
    { language: 'es', text: 'sí', translation: 'yes', context: 4 },
    { language: 'es', text: 'sí', translation: 'yes', context: 'x'.repeat(501) },
    { language: 'es', text: 'sí', translation: 'yes', llm: 'claude' },
  ];
  for (const body of invalidBodies) {
    const res = makeRes();
    await handlePhraseBreakdown({ body }, res, { [BACKEND]: () => assert.fail('must not call provider') });
    assert.equal(res.statusCode, 400);
  }
});

test('derives ordered UTF-16 spans for repeated chunks and permits punctuation-only gaps', () => {
  const source = '哈哈，哈哈！';
  const result = validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('哈哈', 'haha'), chunk('哈哈', 'haha again')],
  }), source);

  assert.deepEqual(result.chunks.map(({ start, end, text }) => ({ start, end, text })), [
    { start: 0, end: 2, text: '哈哈' },
    { start: 3, end: 5, text: '哈哈' },
  ]);
});

test('requires ordered non-overlapping chunks and full significant-content coverage', () => {
  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('哈哈'), chunk('哈')],
  }), '哈哈'), /does not occur/);

  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('a'), chunk('c')],
  }), 'abc'), /uncovered/);

  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('A'), chunk('B')],
  }), 'A+B'), /uncovered/);
});

test('uses JavaScript UTF-16 offsets without allowing surrogate-pair splits', () => {
  const whole = validatePhraseBreakdownResponse(JSON.stringify({ chunks: [chunk('😀')] }), '😀!');
  assert.deepEqual(
    { start: whole.chunks[0].start, end: whole.chunks[0].end },
    { start: 0, end: 2 },
  );

  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('\uDE00')],
  }), '😀!'), /surrogate pair/);
});

test('validates bounded teaching fields and paired optional pattern fields', () => {
  const valid = validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('sí', 'yes')],
    pattern: {
      formula: 'sí + [statement]',
      explanation: 'Affirms the statement.',
      noteTitle: 'Register',
      note: 'Neutral in this context.',
      example: 'Sí, quiero ir.',
      exampleTranslation: 'Yes, I want to go.',
    },
  }), 'sí');
  assert.equal(valid.pattern.example, 'Sí, quiero ir.');

  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('sí')],
    pattern: { formula: 'sí', explanation: 'Affirmation.', noteTitle: 'Register' },
  }), 'sí'), /provided together/);
  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [{ ...chunk('sí'), explanation: 'x'.repeat(1001) }],
  }), 'sí'), /at most 1000/);
});

test('calls one server-selected provider and returns normalized chunks with usage', async () => {
  let calls = 0;
  const body = { language: 'cs', text: '  Děkuji. ', translation: 'Thank you.', context: 'After receiving help' };
  const res = makeRes();
  await handlePhraseBreakdown({ body }, res, {
    [BACKEND]: async () => {
      calls += 1;
      return reply({ chunks: [chunk('Děkuji', 'thank you')] });
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(calls, 1);
  assert.deepEqual(
    { start: res.body.chunks[0].start, end: res.body.chunks[0].end, text: res.body.chunks[0].text },
    { start: 2, end: 8, text: 'Děkuji' },
  );
  assert.equal(res.body.usage.totalTokens, 200);
});

test('returns 502 for provider failures and malformed provider output', async () => {
  const body = { language: 'zh', text: '谢谢。', translation: 'Thank you.' };
  for (const handler of [
    async () => { throw new Error('provider failed'); },
    async () => reply({ chunks: [chunk('不在原文')] }),
  ]) {
    const res = makeRes();
    await handlePhraseBreakdown({ body }, res, { [BACKEND]: handler });
    assert.equal(res.statusCode, 502);
  }
});

test('returns 502 and aborts a provider that exceeds the deadline', async () => {
  const res = makeRes();
  let signal;
  await handlePhraseBreakdown({
    body: { language: 'zh', text: '好。', translation: 'Okay.' },
  }, res, {
    [BACKEND]: (_prompt, options) => {
      signal = options.signal;
      return new Promise(() => {});
    },
  }, { timeoutMs: 5 });
  assert.equal(res.statusCode, 502);
  assert.equal(signal.aborted, true);
});

test('router dispatches breakdown requests with CORS and supports preflight', async () => {
  const post = makeRes();
  await translate({ method: 'POST', path: '/phrase-breakdown', body: {} }, post);
  assert.equal(post.statusCode, 400);
  assert.match(post.body.error, /language/);
  assert.equal(post.headers['Access-Control-Allow-Origin'], '*');

  const options = makeRes();
  await translate({ method: 'OPTIONS', path: '/phrase-breakdown' }, options);
  assert.equal(options.statusCode, 204);
});
