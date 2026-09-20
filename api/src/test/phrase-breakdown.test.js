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

function chunk(text, gloss = text, learningItems = []) {
  return {
    text,
    gloss,
    role: 'meaning unit',
    explanation: `Explains ${gloss}.`,
    learningItems,
  };
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

test('derives ordered UTF-16 spans and keeps learning items in their exact source chunk', () => {
  const source = '哈哈，哈哈！';
  const result = validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [
      chunk('哈哈', 'haha', [{
        surface: '哈哈',
        text: '哈哈',
        meaning: 'ha ha',
        reading: 'hā hā',
      }]),
      chunk('哈哈', 'haha again', []),
    ],
  }), source, 'zh');

  assert.deepEqual(result.chunks.map(({ start, end, text }) => ({ start, end, text })), [
    { start: 0, end: 2, text: '哈哈' },
    { start: 3, end: 5, text: '哈哈' },
  ]);
  assert.deepEqual(result.chunks[0].learningItems, [{
    surface: '哈哈',
    text: '哈哈',
    meaning: 'ha ha',
    reading: 'hā hā',
  }]);
  assert.deepEqual(result.chunks[1].learningItems, []);
});

test('requires ordered non-overlapping chunks and full significant-content coverage', () => {
  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('哈哈'), chunk('哈')],
  }), '哈哈', 'zh'), /does not occur/);

  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('a'), chunk('c')],
  }), 'abc', 'es'), /uncovered/);

  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('A'), chunk('B')],
  }), 'A+B', 'es'), /uncovered/);
});

test('uses JavaScript UTF-16 offsets without allowing surrogate-pair splits', () => {
  const whole = validatePhraseBreakdownResponse(JSON.stringify({ chunks: [chunk('😀')] }), '😀!', 'ja');
  assert.deepEqual(
    { start: whole.chunks[0].start, end: whole.chunks[0].end },
    { start: 0, end: 2 },
  );

  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('\uDE00')],
  }), '😀!', 'ja'), /surrogate pair/);
});

test('removes source-aligned punctuation-only chunks but rejects teaching items on them', () => {
  const result = validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [
      chunk('Hola'),
      { text: ',', gloss: '', role: '', explanation: '', learningItems: [] },
      chunk('mundo'),
      { text: '!', learningItems: [] },
    ],
  }), 'Hola,mundo!', 'es');

  assert.deepEqual(result.chunks.map(({ start, end, text }) => ({ start, end, text })), [
    { start: 0, end: 4, text: 'Hola' },
    { start: 5, end: 10, text: 'mundo' },
  ]);
  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [
      chunk('Hola'),
      { text: '!', learningItems: [{ surface: '!', text: '!', meaning: 'exclamation' }] },
    ],
  }), 'Hola!', 'es'), /punctuation-only and cannot have learning items/);
  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [
      chunk('Hola'),
      { text: '?', learningItems: [] },
    ],
  }), 'Hola!', 'es'), /does not occur/);
  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [{ text: '!?', learningItems: [] }],
  }), '!?', 'es'), /at least one meaningful chunk/);
});

test('validates learning-item bounds, source association, and legacy response fields', () => {
  const item = { surface: 'sí', text: ' sí ', meaning: ' yes ' };
  const valid = validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('sí', 'yes', [item, item])],
  }), 'sí', 'es');
  assert.deepEqual(valid.chunks[0].learningItems, [
    { surface: 'sí', text: 'sí', meaning: 'yes' },
    { surface: 'sí', text: 'sí', meaning: 'yes' },
  ]);

  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('sí', 'yes', [{ ...item, surface: 'no' }])],
  }), 'sí', 'es'), /exact substring/);
  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('sí', 'yes', [{ ...item, surface: ' sí' }])],
  }), 'sí', 'es'), /surrounding whitespace/);
  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('sí', 'yes', Array.from({ length: 33 }, () => item))],
  }), 'sí', 'es'), /at most 32/);
  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [{ ...chunk('sí'), explanation: 'x'.repeat(1001) }],
  }), 'sí', 'es'), /at most 1000/);
  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('sí')],
    pattern: { formula: 'sí', explanation: 'Affirmation.' },
  }), 'sí', 'es'), /pattern.*not allowed/);
  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('sí')],
    learningItems: [],
  }), 'sí', 'es'), /must be nested/);
  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('sí', 'yes', [{ ...item, chunkIndex: 0 }])],
  }), 'sí', 'es'), /chunkIndex is not allowed/);
});

test('requires readings for Japanese and Chinese and forbids them for Spanish and Czech', () => {
  const base = { surface: '猫', text: '猫', meaning: 'cat' };
  const japanese = validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('猫', 'cat', [{ ...base, reading: ' ねこ ' }])],
  }), '猫', 'ja');
  assert.equal(japanese.chunks[0].learningItems[0].reading, 'ねこ');

  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('猫', 'cat', [base])],
  }), '猫', 'ja'), /reading.*required for ja/);
  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('猫', 'cat', [{ ...base, reading: ' ' }])],
  }), '猫', 'zh'), /reading.*non-empty string/);
  for (const language of ['es', 'cs']) {
    assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
      chunks: [chunk('sí', 'yes', [{
        surface: 'sí',
        text: 'sí',
        meaning: 'yes',
        reading: 'si',
      }])],
    }), 'sí', language), new RegExp(`reading.*omitted for ${language}`));
  }
});

test('calls one server-selected provider and returns nested learning items with usage', async () => {
  let calls = 0;
  const body = {
    language: 'cs',
    text: '  Děkuji. ',
    translation: 'Thank you.',
    context: 'After receiving help',
  };
  const res = makeRes();
  await handlePhraseBreakdown({ body }, res, {
    [BACKEND]: async () => {
      calls += 1;
      return reply({
        chunks: [chunk('Děkuji', 'thank you', [{
          surface: 'Děkuji',
          text: 'děkovat',
          meaning: 'to thank',
        }])],
      });
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(calls, 1);
  assert.deepEqual(
    {
      start: res.body.chunks[0].start,
      end: res.body.chunks[0].end,
      text: res.body.chunks[0].text,
    },
    { start: 2, end: 8, text: 'Děkuji' },
  );
  assert.deepEqual(res.body.chunks[0].learningItems, [{
    surface: 'Děkuji',
    text: 'děkovat',
    meaning: 'to thank',
  }]);
  assert.equal(Object.hasOwn(res.body, 'pattern'), false);
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
