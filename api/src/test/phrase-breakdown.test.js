'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  handlePhraseBreakdown,
  validatePhraseBreakdownResponse,
} = require('../phrase-breakdown');
const { buildPhraseBreakdownPrompt } = require('../phrase-breakdown/prompt');
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

function request(lang, text, translation, fields = {}) {
  return {
    schemaVersion: 2,
    source: { snapshot: { lang, text, translation }, ...fields.source },
    ...(fields.context === undefined ? {} : { context: fields.context }),
  };
}

function word(surface, text, translation, fields = {}) {
  return {
    surface,
    occurrence: fields.occurrence ?? 0,
    text,
    translation,
    partOfSpeech: fields.partOfSpeech ?? 'expression',
    senseKey: fields.senseKey ?? 'example-concept',
    ...(fields.reading === undefined ? {} : { reading: fields.reading }),
    ...(fields.romanization === undefined ? {} : { romanization: fields.romanization }),
  };
}

function chunk(text, words = [], equivalentWordIndex = null, fields = {}) {
  return {
    text,
    gloss: fields.gloss ?? text,
    role: fields.role ?? 'meaning unit',
    explanation: fields.explanation ?? `Explains ${text}.`,
    equivalentWordIndex,
    words,
  };
}

function reply(data, model = BACKEND) {
  return {
    text: JSON.stringify(data),
    model,
    usage: { inputTokens: 120, outputTokens: 80 },
  };
}

test('rejects old, malformed, unknown, and client-selected request fields before calling the model', async () => {
  const invalidBodies = [
    null,
    [],
    {},
    { language: 'es', text: 'sí', translation: 'yes' },
    request('es', 'sí', 'yes', { source: { extra: true } }),
    { ...request('es', 'sí', 'yes'), schemaVersion: 1 },
    { ...request('es', 'sí', 'yes'), llm: 'claude' },
    request('es', 'sí', 'yes', { context: { speaker: 'narrator' } }),
    request('es', 'sí', 'yes', { context: { groupTitle: 'x'.repeat(501) } }),
    request('es', 'sí', 'yes', {
      context: { generation: { seed: 'meal', ability: 'expert', answers: {} } },
    }),
  ];
  for (const body of invalidBodies) {
    const res = makeRes();
    await handlePhraseBreakdown({ body }, res, {
      [BACKEND]: () => assert.fail('must not call provider'),
    });
    assert.equal(res.statusCode, 400);
  }
});

test('sends only the exact source snapshot and active context to the model', () => {
  const body = request('ja', '猫です。', 'It is a cat.', {
    source: { ref: { cardId: 'card-1', occurrenceId: 'occurrence-1' } },
    context: {
      generation: { seed: 'pets', ability: 'basics', answers: { Audience: 'friends' } },
      groupTitle: 'Introductions',
      speaker: 'partner',
    },
  });
  const prompt = buildPhraseBreakdownPrompt(body);
  const task = JSON.parse(prompt.input);
  assert.deepEqual(task, { source: body.source.snapshot, context: body.context });
  assert.equal(prompt.input.includes('card-1'), false);
  assert.equal(prompt.input.includes('occurrence-1'), false);
  assert.equal(Object.hasOwn(task, 'schemaVersion'), false);
});

test('derives ordered UTF-16 chunk and repeated-word spans using explicit occurrences', () => {
  const body = request('zh', '哈哈，哈哈！', 'Ha ha, ha ha!');
  const reading = [['哈哈', 'hā hā']];
  const result = validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [
      chunk('哈哈', [word('哈哈', '哈哈', 'ha ha', {
        partOfSpeech: 'expression', senseKey: 'laughter', reading,
      })], 0),
      chunk('哈哈', [word('哈哈', '哈哈', 'ha ha', {
        partOfSpeech: 'expression', senseKey: 'laughter', reading,
      })], 0),
    ],
  }), body);

  assert.deepEqual(result.chunks.map(({ start, end, text }) => ({ start, end, text })), [
    { start: 0, end: 2, text: '哈哈' },
    { start: 3, end: 5, text: '哈哈' },
  ]);
  assert.deepEqual(result.chunks.map((value) => value.words[0].sources[0].span), [
    { start: 0, end: 2 },
    { start: 3, end: 5 },
  ]);
  assert.deepEqual(result.chunks.map((value) => value.target), [
    { kind: 'word', index: 0 },
    { kind: 'word', index: 0 },
  ]);

  const overlaps = validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('哈哈', [
      word('哈', '哈', 'ha', {
        occurrence: 0, partOfSpeech: 'interjection', senseKey: 'laugh-syllable',
        reading: [['哈', 'hā']],
      }),
      word('哈', '哈', 'ha', {
        occurrence: 1, partOfSpeech: 'interjection', senseKey: 'laugh-syllable',
        reading: [['哈', 'hā']],
      }),
    ])],
  }), request('zh', '哈哈', 'Ha ha'));
  assert.deepEqual(overlaps.chunks[0].words.map((value) => value.sources[0].span), [
    { start: 0, end: 1 },
    { start: 1, end: 2 },
  ]);
});

test('requires complete ordered meaningful coverage and rejects surrogate-pair splits', () => {
  const spanish = request('es', 'abc', 'abc');
  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('a'), chunk('c')],
  }), spanish), /uncovered/);
  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('a'), chunk('a')],
  }), request('es', 'a', 'a')), /does not occur/);

  const emoji = request('ja', '😀!', 'Smile!');
  const valid = validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('😀', [word('😀', '😀', 'smile', {
      partOfSpeech: 'expression', senseKey: 'smile-symbol', reading: [['😀', null]],
    })], 0)],
  }), emoji);
  assert.deepEqual(
    { start: valid.chunks[0].start, end: valid.chunks[0].end },
    { start: 0, end: 2 },
  );
  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('\uDE00')],
  }), emoji), /surrogate pair/);
  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('😀', [word('\uDE00', '\uDE00', 'bad', {
      partOfSpeech: 'other', senseKey: 'invalid-half', reading: [['\uDE00', null]],
    })])],
  }), emoji), /surrogate pair/);
});

test('removes source-aligned punctuation-only chunks but never turns them into targets', () => {
  const punctuation = (text) => ({
    text,
    gloss: '',
    role: '',
    explanation: '',
    equivalentWordIndex: null,
    words: [],
  });
  const result = validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('Hola'), punctuation(','), chunk('mundo'), punctuation('!')],
  }), request('es', 'Hola,mundo!', 'Hello, world!'));
  assert.deepEqual(result.chunks.map(({ start, end, text }) => ({ start, end, text })), [
    { start: 0, end: 4, text: 'Hola' },
    { start: 5, end: 10, text: 'mundo' },
  ]);

  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [{ ...punctuation('!'), words: [word('!', '!', 'exclamation')] }],
  }), request('es', '!', 'Exclamation')), /punctuation-only/);
  assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [punctuation('!?')],
  }), request('es', '!?', 'Punctuation')), /at least one meaningful chunk/);
});

test('assembles a Word target only for explicit same-form lexical equivalence', () => {
  const body = request('es', 'caluroso', 'hot');
  const result = validatePhraseBreakdownResponse(JSON.stringify({
    chunks: [chunk('caluroso', [word('caluroso', 'caluroso', 'hot', {
      partOfSpeech: 'adjective', senseKey: 'high-temperature',
    })], 0, { gloss: 'hot', role: 'adjective', explanation: 'Describes warm weather.' })],
  }), body);
  assert.deepEqual(result.chunks[0].target, { kind: 'word', index: 0 });
  assert.equal(result.chunks[0].words[0].card.type, 'word');
  assert.deepEqual(result.chunks[0].words[0].sources[0], {
    snapshot: body.source.snapshot,
    span: { start: 0, end: 8 },
  });

  const differentDictionaryForm = JSON.stringify({
    chunks: [chunk('caluroso', [word('caluroso', 'calor', 'heat', {
      partOfSpeech: 'noun', senseKey: 'heat',
    })], 0)],
  });
  assert.throws(
    () => validatePhraseBreakdownResponse(differentDictionaryForm, body),
    /same normalized lexical target/,
  );
});

test('keeps inflection and attached particles as Chunk targets beside dictionary Words', () => {
  const body = request('ja', '肉も魚も食べません。', 'I do not eat meat or fish.');
  const raw = {
    chunks: [
      chunk('肉も', [word('肉', '肉', 'meat', {
        partOfSpeech: 'noun', senseKey: 'animal-flesh-food', reading: [['肉', 'にく']],
      })], null, { gloss: 'meat either', role: 'negative-list item' }),
      chunk('魚も', [word('魚', '魚', 'fish', {
        partOfSpeech: 'noun', senseKey: 'fish-food', reading: [['魚', 'さかな']],
      })], null, { gloss: 'fish either', role: 'negative-list item' }),
      chunk('食べません', [word('食べません', '食べる', 'eat', {
        partOfSpeech: 'verb', senseKey: 'consume-food',
        reading: [['食', 'た'], ['べる', null]],
      })], null, { gloss: 'do not eat', role: 'negative polite predicate' }),
    ],
  };
  const result = validatePhraseBreakdownResponse(JSON.stringify(raw), body);
  assert.deepEqual(result.chunks.map((value) => value.target.kind), ['chunk', 'chunk', 'chunk']);
  assert.equal(result.chunks[2].words[0].card.text, '食べる');
  assert.equal(result.chunks[2].words[0].card.romanization, 'taberu');
  assert.deepEqual(result.chunks[2].words[0].sources[0].span, { start: 4, end: 9 });
  assert.equal(result.chunks[2].target.card.text, '食べません');
  assert.equal(Object.hasOwn(result.chunks[2].target.card, 'reading'), false);
  assert.deepEqual(result.chunks[2].target.card.source.snapshot, body.source.snapshot);

  const falselyEquivalent = structuredClone(raw);
  falselyEquivalent.chunks[2].equivalentWordIndex = 0;
  assert.throws(
    () => validatePhraseBreakdownResponse(JSON.stringify(falselyEquivalent), body),
    /same normalized lexical target/,
  );
  falselyEquivalent.chunks[0].equivalentWordIndex = 0;
  assert.throws(
    () => validatePhraseBreakdownResponse(JSON.stringify(falselyEquivalent), body),
    /surface covers the chunk/,
  );
});

test('validates model Word occurrence, sense, reading, and exact field boundaries', () => {
  const body = request('ja', '猫です', 'It is a cat');
  const validWord = word('猫', '猫', 'cat', {
    partOfSpeech: 'noun', senseKey: 'domestic-cat', reading: [['猫', 'ねこ']],
  });
  const valid = { chunks: [chunk('猫です', [validWord])] };

  for (const mutate of [
    (value) => { value.chunks[0].words[0].occurrence = 1; },
    (value) => { value.chunks[0].words[0].surface = ' 猫'; },
    (value) => { value.chunks[0].words[0].senseKey = 'Cat'; },
    (value) => { value.chunks[0].words[0].reading = [['猫', 'ねこ'], ['x', null]]; },
    (value) => { delete value.chunks[0].words[0].reading; },
    (value) => { value.chunks[0].words[0].snapshot = body.source.snapshot; },
    (value) => { value.chunks[0].learningItems = []; },
  ]) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    assert.throws(() => validatePhraseBreakdownResponse(JSON.stringify(invalid), body));
  }
});

test('calls one provider, preserves request evidence, validates the final v2 wire response, and reports usage', async () => {
  const body = request('cs', '  Děkuji. ', 'Thank you.', {
    source: { ref: { cardId: 'phrase-card', occurrenceId: 'phrase-occurrence' } },
    context: { groupTitle: 'After receiving help', speaker: 'you' },
  });
  const res = makeRes();
  let task;
  await handlePhraseBreakdown({ body }, res, {
    [BACKEND]: async (prompt) => {
      task = JSON.parse(prompt.input);
      return reply({
        chunks: [chunk('Děkuji', [word('Děkuji', 'děkovat', 'to thank', {
          partOfSpeech: 'verb', senseKey: 'express-gratitude',
        })], null, { gloss: 'thank you', role: 'thanks' })],
      });
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.schemaVersion, 2);
  assert.equal(res.body.usage.totalTokens, 200);
  assert.deepEqual(task, { source: body.source.snapshot, context: body.context });
  assert.deepEqual(res.body.chunks[0].words[0].sources[0], {
    snapshot: body.source.snapshot,
    ref: body.source.ref,
    span: { start: 2, end: 8 },
  });
  assert.deepEqual(res.body.chunks[0].target.card.source, {
    snapshot: body.source.snapshot,
    ref: body.source.ref,
    span: { start: 2, end: 8 },
  });
});

test('returns 502 for provider failures, malformed output, invalid usage, and timeouts', async () => {
  const body = request('zh', '谢谢。', 'Thank you.');
  const validOutput = {
    chunks: [chunk('谢谢', [word('谢谢', '谢谢', 'thank you', {
      partOfSpeech: 'expression', senseKey: 'express-gratitude', reading: [['谢谢', 'xiè xie']],
    })], 0)],
  };
  for (const handler of [
    async () => { throw new Error('provider failed'); },
    async () => reply({ chunks: [chunk('不在原文')] }),
    async () => reply(validOutput, null),
  ]) {
    const res = makeRes();
    await handlePhraseBreakdown({ body }, res, { [BACKEND]: handler });
    assert.equal(res.statusCode, 502);
  }

  const timedOut = makeRes();
  let signal;
  await handlePhraseBreakdown({ body }, timedOut, {
    [BACKEND]: (_prompt, options) => {
      signal = options.signal;
      return new Promise(() => {});
    },
  }, { timeoutMs: 5 });
  assert.equal(timedOut.statusCode, 502);
  assert.equal(signal.aborted, true);
});

test('router dispatches v2 breakdown requests with CORS and supports preflight', async () => {
  const post = makeRes();
  await translate({ method: 'POST', path: '/phrase-breakdown', body: {} }, post);
  assert.equal(post.statusCode, 400);
  assert.match(post.body.error, /schemaVersion/);
  assert.equal(post.headers['Access-Control-Allow-Origin'], '*');

  const options = makeRes();
  await translate({ method: 'OPTIONS', path: '/phrase-breakdown' }, options);
  assert.equal(options.statusCode, 204);
});
