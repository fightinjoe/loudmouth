'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { performPhrasebook, handlePhrasebook } = require('../phrasebook');
const { parsePhrasebookRequest, assemblePhrasebook, parseInlineReading } = require('../phrasebook-parse');
const { buildPhrasebookGenerationPrompt, buildPhrasebookTranslationPrompt } = require('../phrasebook-prompt');
const { buildContextPrompt } = require('../context-prompt');

const backendName = 'gemini-3.5-flash-lite';
const first = {
  title: 'Prepare',
  lines: [
    { speaker: 'you', text: 'I rent boards.' },
    { speaker: 'partner', text: 'Here is a board.' },
    { speaker: 'you', text: 'I will pay.' },
    { speaker: 'you', text: 'I can pay later.', or: true },
  ],
  vocab: ['rent', 'board', 'pay'],
};
const second = {
  title: 'Prepare',
  lines: [
    { speaker: 'you', text: 'I eat fish.' },
    { speaker: 'partner', text: 'Here is a fish.' },
    { speaker: 'you', text: 'I will pay.' },
    { speaker: 'partner', text: 'Thanks.' },
  ],
  vocab: ['eat', 'fish', 'pay'],
};
const firstTranslation = { lines: ['Alquilo tablas.', 'Aquí tiene una tabla.', 'Pagaré.', 'Puedo pagar luego.'], vocab: ['alquilar', 'tabla', 'pagar'] };
const secondTranslation = { lines: ['Como pescado.', 'Aquí tiene pescado.', 'Voy a pagar.', 'Gracias.'], vocab: ['comer', 'pescado', 'abonar'] };
const input = { seed: 'a beach trip', language: 'es', ability: 'basics', answers: {}, checklist: ['Prepare', 'Prepare'] };
const reply = (data) => ({ text: typeof data === 'string' ? data : JSON.stringify(data), model: backendName, usage: { inputTokens: 10, outputTokens: 5 } });
const run = (handler, opts = {}) => performPhrasebook(input, { [backendName]: handler }, { backendName, ...opts });
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));

test('interleaved alternatives from accepted conversations survive generation', async () => {
  const interleaved = {
    ...first,
    lines: [
      { speaker: 'you', text: 'I rent boards.' },
      { speaker: 'partner', text: 'Here is a board.' },
      { speaker: 'you', text: 'I will pay.', or: true },
      { speaker: 'partner', text: 'You can pay later.', or: true },
    ],
  };
  const result = await run(async (prompt) => {
    if (prompt.startsWith('You are the conversation generator')) return reply({ conversations: [interleaved, second] });
    return reply(prompt.includes('I rent boards.') ? firstTranslation : secondTranslation);
  });
  assert.deepEqual(JSON.parse(result.groups[0].cards[2].notes), { speaker: 'you', or: true });
  assert.deepEqual(JSON.parse(result.groups[0].cards[3].notes), { speaker: 'partner', or: true });
});

// Identical titles deliberately rule out title-keyed translation assembly.
test('out-of-order chunks preserve index, alternatives, and first vocabulary provenance', async () => {
  const finished = [];
  const result = await run(async (prompt) => {
    if (prompt.startsWith('You are the conversation generator')) return reply({ conversations: [first, second] });
    const isFirst = prompt.includes('I rent boards.');
    await pause(isFirst ? 15 : 1);
    finished.push(isFirst ? 'first' : 'second');
    return reply(isFirst ? firstTranslation : secondTranslation);
  });
  assert.deepEqual(finished, ['second', 'first']);
  assert.equal(result.groups[0].cards[0].text, 'Alquilo tablas.');
  assert.equal(result.groups[1].cards[0].text, 'Como pescado.');
  assert.deepEqual(JSON.parse(result.groups[0].cards[3].notes), { speaker: 'you', or: true });
  const pay = result.groups[2].cards.filter(c => c.translation === 'pay');
  assert.equal(pay.length, 1);
  assert.equal(pay[0].text, 'pagar');
  assert.equal(JSON.parse(pay[0].notes).source, 'Pagaré.');
  assert.equal(result.usage.inputTokens, 30);
});

test('malformed generation and a count-mismatched chunk retry without rerunning healthy chunks', async () => {
  let generationCalls = 0, firstCalls = 0, secondCalls = 0;
  const result = await run(async (prompt) => {
    if (prompt.startsWith('You are the conversation generator')) {
      return reply(++generationCalls === 1 ? '{bad' : { conversations: [first, second] });
    }
    if (prompt.includes('I rent boards.')) {
      return reply(++firstCalls === 1 ? { ...firstTranslation, lines: [] } : firstTranslation);
    }
    secondCalls++;
    return reply(secondTranslation);
  });
  assert.deepEqual([generationCalls, firstCalls, secondCalls], [2, 2, 1]);
  assert.equal(result.groups[0].cards[0].translation, 'I rent boards.');
  assert.equal(result.usage.inputTokens, 50);
  assert.equal(result.usage.outputTokens, 25);
});

test('a missing opening quote retries the Japanese chunk without repairing its content', async () => {
  const conversation = {
    title: 'Ask about hidden ingredients',
    lines: [
      { speaker: 'you', text: 'Does it contain fish stock?' },
      { speaker: 'partner', text: 'Yes, it does.' },
      { speaker: 'partner', text: 'No, it does not.', or: true },
      { speaker: 'you', text: 'Is meat stock used?' },
      { speaker: 'partner', text: 'Yes, it is chicken stock.' },
      { speaker: 'partner', text: 'No, it is vegetable stock.', or: true },
    ],
    vocab: ['stock', 'fish', 'meat', 'ingredient', 'contain'],
  };
  const translated = {
    lines: [
      '魚[さかな]の出汁[だし]が入[はい]っていますか？',
      'はい、入[はい]っていますよ。',
      'いいえ、入[はい]っていませんよ。',
      '肉[にく]の出汁[だし]は使[つか]われていますか？',
      'はい、鶏[とり]ガラ出汁[だし]です。',
      'いいえ、野菜[やさい]出汁[だし]です。',
    ],
    vocab: ['出汁[だし]', '魚[さかな]', '肉[にく]', '具[ぐ]材[ざい]', '含[ふく]む'],
  };
  const malformed = JSON.stringify(translated).replace('"魚', '魚');
  let translationCalls = 0;
  const result = await performPhrasebook(
    { ...input, language: 'ja', checklist: [conversation.title] },
    { [backendName]: async (prompt) => {
      if (prompt.startsWith('You are the conversation generator')) {
        return reply({ conversations: [conversation] });
      }
      return reply(++translationCalls === 1 ? malformed : translated);
    } },
    { backendName },
  );
  assert.equal(translationCalls, 2);
  assert.equal(result.groups[0].cards[0].text, '魚の出汁が入っていますか？');
  assert.deepEqual(result.groups[0].cards[0].reading, [
    ['魚', 'さかな'], ['の', null], ['出汁', 'だし'], ['が', null],
    ['入', 'はい'], ['っていますか？', null],
  ]);
  assert.equal(result.groups[0].cards[5].translation, 'No, it is vegetable stock.');
});

test('exhausted malformed chunk fails the whole request and cancels unfinished siblings', async () => {
  let siblingAborted = false;
  await assert.rejects(run(async (prompt, { signal }) => {
    if (prompt.startsWith('You are the conversation generator')) return reply({ conversations: [first, second] });
    if (prompt.includes('I rent boards.')) return reply('{bad');
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => {
      siblingAborted = true;
      reject(signal.reason);
    }, { once: true }));
  }), error => error.status === 502);
  assert.equal(siblingAborted, true);
});

test('429 retry recovers but cannot reset the logical call deadline', async () => {
  let attempts = 0;
  const result = await run(async (prompt) => {
    if (++attempts === 1) throw Object.assign(new Error('quota'), { status: 429 });
    if (prompt.startsWith('You are the conversation generator')) return reply({ conversations: [first, second] });
    return reply(prompt.includes('I rent boards.') ? firstTranslation : secondTranslation);
  }, { retryDelaysMs: [1] });
  assert.equal(result.groups[1].cards[0].text, 'Como pescado.');
  let calls = 0;
  await assert.rejects(run(async () => {
    calls++;
    throw Object.assign(new Error('quota'), { status: 429 });
  }, { timeoutMs: 10, retryDelaysMs: [100] }), error => error.status === 502);
  assert.equal(calls, 1);
});

test('client disconnect after its request body is read cancels generation', async () => {
  const req = new EventEmitter();
  req.body = input;
  const res = new EventEmitter();
  res.status = () => res;
  res.json = () => res;
  res.writableEnded = false;
  let aborted = false;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const pending = handlePhrasebook(req, res, { [backendName]: async (_, { signal }) => {
    started();
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => {
      aborted = true;
      reject(signal.reason);
    }, { once: true }));
  } }, { backendName });
  await ready;
  res.emit('close');
  await pending;
  assert.equal(aborted, true);
  assert.equal(res.listenerCount('close'), 0);
});

test('ruby normalization and kana romanization preserve target text', () => {
  assert.deepEqual(parseInlineReading('食[た]べる[bad]。'), { text: '食べる。', reading: [['食', 'た'], ['べる。', null]] });
  const result = assemblePhrasebook({ seed: 'eat', language: 'ja', conversations: [{ ...first, title: 'Eat' }], translations: [{ lines: ['食[た]べます。', 'はい。', '払[はら]います。', '後[あと]で払[はら]います。'], vocab: ['借[か]りる', '板[いた]', '払[はら]う'] }] });
  const card = result.groups[0].cards[0];
  assert.equal(card.text, '食べます。');
  assert.match(card.romanization, /^tabemasu/);
  assert.equal(card.reading.map(t => t[0]).join(''), card.text);
  assert.equal(JSON.parse(result.groups[1].cards[0].notes).source, card.text);
});

test('raw replacement syntax and template markers stay literal in client text', () => {
  const seed = '$& {{LANGUAGE}}';
  const prompt = buildPhrasebookGenerationPrompt({ ...input, seed });
  assert.ok(prompt.includes('SITUATION: ' + seed));
  assert.ok(buildContextPrompt({ seed, language: 'ja' }).includes('SEED: ' + seed));
  const translated = buildPhrasebookTranslationPrompt({ seed, language: 'ja', conversation: { ...first, title: '$& {{LINES}}' } });
  assert.ok(translated.includes(seed));
  assert.ok(translated.includes('$& {{LINES}}'));
  const parsed = parsePhrasebookRequest({ ...input, answers: JSON.parse('{"__proto__":"literal answer"}') });
  assert.equal(parsed.value.answers.__proto__, 'literal answer');
});
