'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { performPhrasebook, handlePhrasebook } = require('../phrasebook');
const { parsePhrasebookRequest, validateGenerationResponse, validateTranslationResponse, assemblePhrasebook, flattenTopic } = require('../phrasebook/parse');
const { cardIdentity } = require('../schema');
const { computeCostUsd } = require('../pricing');

const backendName = 'gemini-3.5-flash-lite';
const generationBackendName = 'deepseek-v4.1-flash';
const input = { seed: 'a beach trip', language: 'es', ability: 'basics', answers: {}, checklist: ['Prepare', 'Prepare'] };
const first = {
  title: 'Prepare', thingsToSay: ['Is a deposit required?', 'I rent boards.'],
  likelyExchanges: [{ title: 'Renting', lines: [
    { speaker: 'you', text: ['I rent boards.'] },
    { speaker: 'partner', text: ['Here is a board.', 'No boards are available.'] },
    { speaker: 'you', text: ['I will pay.', 'I can pay later.'] },
  ] }],
  words: [{ title: 'Equipment and payment', items: ['rent', 'board', 'deposit'] }],
  exampleConversation: [{ speaker: 'you', text: 'Can I rent this?' }, { speaker: 'partner', text: 'Yes, pay a deposit.' }],
};
const second = {
  title: 'Prepare', thingsToSay: ['I do not eat fish.'],
  likelyExchanges: [{ title: 'Checking food', lines: [{ speaker: 'you', text: ['Is this fish?'] }, { speaker: 'partner', text: ['Yes.'] }] }],
  words: [],
  exampleConversation: [{ speaker: 'partner', text: 'Is this for you?' }, { speaker: 'you', text: 'No.' }],
};
const firstTranslation = {
  phrases: ['¿Se necesita un depósito?', 'Alquilo tablas.', 'Alquilo tablas.', 'Aquí tiene una tabla.', 'No hay tablas.', 'Pagaré.', 'Puedo pagar luego.', '¿Puedo alquilar esto?', 'Sí, pague un depósito.'],
  words: [
    { target: 'alquilar', partOfSpeech: 'verb', senseKey: 'rent', source: { phraseIndex: 2, surface: 'Alquilo', occurrence: 0 } },
    { target: 'tabla', partOfSpeech: 'noun', senseKey: 'board', source: { phraseIndex: 4, surface: 'tablas', occurrence: 0 } },
    { target: 'depósito', partOfSpeech: 'noun', senseKey: 'deposit', source: { phraseIndex: 8, surface: 'depósito', occurrence: 0 } },
  ],
};
const secondTranslation = { phrases: ['No como pescado.', '¿Es pescado?', 'Sí.', '¿Es para usted?', 'No.'], words: [] };
const reply = (data, model = backendName, usage = { inputTokens: 10, outputTokens: 5 }) => ({ text: typeof data === 'string' ? data : JSON.stringify(data), model, usage });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const data = prompt => JSON.parse(prompt.input);
const run = (generate, translate, options = {}, request = input) => performPhrasebook(request, {
  [generationBackendName]: generate,
  [backendName]: translate,
}, { backendName, generationBackendName, ...options });
const normalized = topic => validateGenerationResponse(JSON.stringify({ topics: [topic] }), [topic.title]).topics[0];
const assemble = (topic, translation, language = 'es') => assemblePhrasebook({ seed: input.seed, language, topics: [normalized(topic)], translations: [validateTranslationResponse(JSON.stringify(translation), topic, language)] });

function healthyGeneration(topics = [first, second]) {
  let index = 0;
  return async () => reply({ topics: [topics[index++]] }, 'deepseek/deepseek-v4.1-flash');
}
const healthyTranslation = async prompt => reply(data(prompt).topic.thingsToSay[0] === first.thingsToSay[0] ? firstTranslation : secondTranslation);

test('duplicate titles remain distinct and out-of-order topics retain all independent sections', async () => {
  let next = 0;
  let completedGeneration = 0;
  const finished = [];
  const result = await run(async () => {
    const index = next++;
    await pause(index === 0 ? 15 : 1);
    completedGeneration++;
    return reply({ topics: [[first, second][index]] }, 'deepseek/deepseek-v4.1-flash');
  }, async prompt => {
    assert.equal(completedGeneration, 2, 'translation waits for the complete English stage');
    const isFirst = data(prompt).topic.thingsToSay[0] === first.thingsToSay[0];
    await pause(isFirst ? 15 : 1);
    finished.push(isFirst ? 0 : 1);
    return reply(isFirst ? firstTranslation : secondTranslation);
  });
  assert.deepEqual(finished, [1, 0]);
  assert.equal(result.schemaVersion, 4);
  const group = result.groups[0];
  assert.notEqual(group.id, result.groups[1].id);
  assert.deepEqual(result.groups.map(group => group.thingsToSay.map(item => item.card.text)), [firstTranslation.phrases.slice(0, 2), secondTranslation.phrases.slice(0, 1)]);
  assert.deepEqual(group.likelyExchanges[0].lines.map(line => line.responses.map(item => item.card.text)), [
    ['Alquilo tablas.'], ['Aquí tiene una tabla.', 'No hay tablas.'], ['Pagaré.', 'Puedo pagar luego.'],
  ]);
  assert.deepEqual(group.exampleConversation.map(item => item.card.text), firstTranslation.phrases.slice(7));
  assert.notEqual(group.thingsToSay[1].id, group.likelyExchanges[0].lines[0].responses[0].id);
  assert.equal(cardIdentity(group.thingsToSay[1].card), cardIdentity(group.likelyExchanges[0].lines[0].responses[0].card));
  assert.deepEqual(result.groups[1].words, []);
  assert.deepEqual(result.flags, []);
  assert.equal(group.words[0].items[0].sources[0].ref.occurrenceId, group.likelyExchanges[0].lines[0].responses[0].id);
  assert.equal(group.words[0].items[1].sources[0].ref.occurrenceId, group.likelyExchanges[0].lines[1].responses[1].id);
  assert.equal(group.words[0].items[2].sources[0].ref.occurrenceId, group.exampleConversation[1].id);
  assert.equal(result.usage.inputTokens, 40);
});

test('eight topics use at most four indexed generation workers with no early translation', async () => {
  const topics = Array.from({ length: 8 }, (_, index) => ({ ...second, title: `Topic ${index}` }));
  let active = 0, maximum = 0, finished = 0;
  const result = await run(async prompt => {
    const title = data(prompt).checklist[0];
    active++;
    maximum = Math.max(maximum, active);
    await pause(title === 'Topic 0' ? 15 : 1);
    active--;
    finished++;
    return reply({ topics: [{ ...second, title }] });
  }, async () => {
    assert.equal(finished, 8);
    return reply(secondTranslation);
  }, {}, { ...input, checklist: topics.map(topic => topic.title) });
  assert.equal(maximum, 4);
  assert.deepEqual(result.groups.map(group => group.title), topics.map(topic => topic.title));
});

test('Gemini generation uses the same per-topic contract without a batch fallback', async () => {
  let generated = 0;
  const result = await performPhrasebook(input, { [backendName]: async prompt => {
    const task = data(prompt);
    if (task.checklist) {
      assert.equal(task.checklist.length, 1);
      return reply({ topics: [[first, second][generated++]] });
    }
    return healthyTranslation(prompt);
  } }, { backendName, generationBackendName: backendName });
  assert.equal(generated, 2);
  assert.equal(result.groups[1].thingsToSay[0].card.text, secondTranslation.phrases[0]);
});

test('invalid generation and translation retry only their logical topic', async () => {
  const request = { ...input, checklist: ['First', 'Second'] };
  const counts = { First: 0, Second: 0, firstTranslation: 0, secondTranslation: 0 };
  const result = await run(async prompt => {
    const title = data(prompt).checklist[0];
    if (++counts[title] === 1 && title === 'First') return reply('{bad');
    return reply({ topics: [{ ...(title === 'First' ? first : second), title }] });
  }, async prompt => {
    if (data(prompt).topic.title === 'First') {
      return reply(++counts.firstTranslation === 1 ? { ...firstTranslation, phrases: [] } : firstTranslation);
    }
    counts.secondTranslation++;
    return reply(secondTranslation);
  }, {}, request);
  assert.deepEqual(counts, { First: 2, Second: 1, firstTranslation: 2, secondTranslation: 1 });
  assert.equal(result.usage.inputTokens, 60);
});

test('valid independent overflow clamps family order without singletons, while malformed tails reject', () => {
  const family = (count, title) => ({ title, items: Array.from({ length: count }, (_, i) => `${title} ${i}`) });
  const topic = { ...first, thingsToSay: Array.from({ length: 9 }, (_, i) => `Need ${i}`), words: [family(6, 'A'), family(3, 'B'), family(4, 'C')] };
  const generated = validateGenerationResponse(JSON.stringify({ topics: [topic] }), [first.title]);
  assert.equal(generated.failureLevel, 1);
  assert.deepEqual(generated.topics[0].thingsToSay, topic.thingsToSay.slice(0, 8));
  assert.deepEqual(generated.topics[0].words, topic.words.slice(0, 2));
  assert.deepEqual(normalized({ ...topic, words: [family(6, 'A'), family(7, 'B')] }).words, [family(6, 'A'), family(4, 'B')]);
  for (const invalid of [
    { ...topic, thingsToSay: [...topic.thingsToSay, ''] },
    { ...topic, words: [...topic.words, { title: 'Bad', items: ['valid', 1] }] },
    { ...topic, words: [...topic.words, { title: 'Bad', items: ['single'] }] },
    { ...first, thingsToSay: [] }, { ...first, words: undefined },
    { ...first, exampleConversation: Array(11).fill(first.exampleConversation[0]) },
    { ...first, exampleConversation: [first.exampleConversation[0], first.exampleConversation[0]] },
    { ...first, likelyExchanges: [{ ...first.likelyExchanges[0], lines: [{ speaker: 'you', text: ['A'] }, { speaker: 'you', text: ['B'] }] }] },
    { ...first, likelyExchanges: [{ ...first.likelyExchanges[0], lines: [{ speaker: 'you', text: ['A', 'B', 'C', 'D'] }, { speaker: 'partner', text: ['E'] }] }] },
    { ...first, title: 'Other' }, { ...first, featuredPhraseIds: [] },
  ]) assert.throws(() => validateGenerationResponse(JSON.stringify({ topics: [invalid] }), [first.title]));
});

test('continuations with semantic branch mismatches remain non-blocking', () => {
  const topic = structuredClone(first);
  topic.likelyExchanges[0].lines[2].text = ['When will boards be available again?'];
  assert.deepEqual(normalized(topic).likelyExchanges, topic.likelyExchanges);
});

test('maximum sections preserve every option and family member through translation', () => {
  const topic = {
    title: 'Maximum', thingsToSay: Array.from({ length: 8 }, (_, i) => `Need ${i}`),
    words: [{ title: 'Choices', items: Array.from({ length: 10 }, (_, i) => `Word ${i}`) }],
    likelyExchanges: Array.from({ length: 4 }, (_, exchange) => ({ title: `Exchange ${exchange}`, lines: Array.from({ length: 4 }, (_, turn) => ({ speaker: turn % 2 ? 'partner' : 'you', text: Array.from({ length: 3 }, (_, option) => `Response ${exchange} ${turn} ${option}`) })) })),
    exampleConversation: Array.from({ length: 10 }, (_, i) => ({ speaker: i % 2 ? 'partner' : 'you', text: `Line ${i}` })),
  };
  const source = flattenTopic(topic);
  const translated = { phrases: source.phrases.map((_, i) => `Frase ${i}`), words: source.words.map((_, i) => ({ target: `palabra ${i}`, partOfSpeech: 'noun', senseKey: `word-${i}` })) };
  const group = assemble(topic, translated).groups[0];
  const phrases = [...group.thingsToSay, ...group.likelyExchanges.flatMap(exchange => exchange.lines.flatMap(line => line.responses)), ...group.exampleConversation];
  assert.deepEqual(phrases.map(item => item.card.translation), source.phrases);
  assert.deepEqual(phrases.map(item => item.card.text), translated.phrases);
  assert.deepEqual(group.words[0].items.map(item => item.card.text), translated.words.map(item => item.target));
});

test('invalid source indexes and surfaces drop only evidence and flag flattened word indexes', () => {
  for (const source of [
    { phraseIndex: 1, surface: 'depósito', occurrence: 0 },
    { phraseIndex: 99, surface: 'depósito', occurrence: 0 },
    { phraseIndex: -1, surface: 'depósito', occurrence: 0 },
    { phraseIndex: 0.5, surface: 'depósito', occurrence: 0 },
    { phraseIndex: 0, surface: 'depósito', occurrence: 1 },
    { phraseIndex: 0, surface: 'depósito[x]', occurrence: 0 },
    { phraseIndex: 0, surface: ' ', occurrence: 0 },
    { phraseIndex: 0, surface: 'depósito', occurrence: 0, extra: true }, null,
  ]) {
    const translation = structuredClone(firstTranslation);
    translation.words[2].source = source;
    const result = assemble(first, translation);
    assert.equal(Object.hasOwn(result.groups[0].words[0].items[2], 'sources'), false);
    assert.deepEqual(result.flags, [{ code: 'vocab-source-missing', groupIndex: 0, wordIndex: 2, reason: 'unresolved' }]);
  }
  const withoutSource = structuredClone(firstTranslation);
  delete withoutSource.words[2].source;
  assert.deepEqual(assemble(first, withoutSource).flags, []);
});

test('overlapping source matches are counted and UTF-16 surrogate boundaries are protected', () => {
  const topic = { ...second, thingsToSay: ['Laugh.'], words: [{ title: 'Reactions', items: ['laugh', 'cry'] }] };
  const translated = { phrases: ['哈[hā]哈[hā]哈[hā]！', '你[nǐ]好[hǎo]！', '好[hǎo]！', '你[nǐ]好[hǎo]！', '好[hǎo]！'], words: [{ target: '哈[hā]哈[hā]', partOfSpeech: 'verb', senseKey: 'laugh', source: { phraseIndex: 0, surface: '哈哈', occurrence: 1 } }, { target: '哭[kū]', partOfSpeech: 'verb', senseKey: 'cry' }] };
  assert.deepEqual(assemble(topic, translated, 'zh').groups[0].words[0].items[0].sources[0].span, { start: 1, end: 3 });
  const split = structuredClone(translated);
  split.phrases[0] = '😀a';
  split.words[0].source = { phraseIndex: 0, surface: '\ude00a', occurrence: 0 };
  assert.equal(assemble(topic, split, 'zh').flags[0].reason, 'unresolved');
});

test('strict translations reject count mismatch, unknown fields and incomplete dictionary readings', () => {
  for (const invalid of [
    { ...firstTranslation, phrases: [] }, { ...firstTranslation, words: [] },
    { ...firstTranslation, lineScores: [5] }, { ...firstTranslation, essentials: [] },
    { ...firstTranslation, phraseRomanizations: ['bad'] },
    { ...firstTranslation, words: [{ target: 'tabla' }, ...firstTranslation.words.slice(1)] },
  ]) assert.throws(() => validateTranslationResponse(JSON.stringify(invalid), first, 'es'));
  const invalidHan = { phrases: Array(5).fill('はい。'), words: [{ target: '食べる', partOfSpeech: 'verb', senseKey: 'eat' }, { target: 'のむ', partOfSpeech: 'verb', senseKey: 'drink' }] };
  assert.throws(() => validateTranslationResponse(JSON.stringify(invalidHan), { ...second, words: [{ title: 'Actions', items: ['eat', 'drink'] }] }, 'ja'), /annotate every dictionary-form Han/);
});

test('Japanese romanizations remain aligned across every phrase and family with per-array fallback', () => {
  const topic = { ...second, thingsToSay: ['I eat.'], words: [{ title: 'Actions', items: ['eat', 'drink'] }] };
  const japanese = { phrases: ['食[た]べます。', 'はい。', 'いいえ。', 'はい。', 'いいえ。'], words: [{ target: '食[た]べる', partOfSpeech: 'verb', senseKey: 'eat' }, { target: '飲[の]む', partOfSpeech: 'verb', senseKey: 'drink' }], phraseRomanizations: ['Tabemasu.', 'Hai.', 'Iie.', 'Hai.', 'Iie.'], wordRomanizations: ['taberu', 'nomu'] };
  const good = assemble(topic, japanese, 'ja').groups[0];
  assert.equal(good.thingsToSay[0].card.romanization, 'Tabemasu.');
  assert.equal(good.likelyExchanges[0].lines[0].responses[0].card.romanization, 'Hai.');
  assert.equal(good.words[0].items[1].card.romanization, 'nomu');
  const shifted = assemble(topic, { ...japanese, phraseRomanizations: ['WRONG'] }, 'ja').groups[0];
  assert.deepEqual(shifted.exampleConversation.map(item => item.card.romanization), ['Hai.', 'Iie.']);
  assert.equal(shifted.thingsToSay[0].card.romanization, 'Tabemasu.');
  const unreadable = assemble(topic, { ...japanese, phrases: ['私です。', ...japanese.phrases.slice(1)], phraseRomanizations: ['私です', ...japanese.phraseRomanizations.slice(1)] }, 'ja').groups[0];
  assert.equal(unreadable.thingsToSay[0].card.text, '私です。');
  assert.equal(Object.hasOwn(unreadable.thingsToSay[0].card, 'romanization'), false);
});

test('native Ukrainian cards preserve Cyrillic without fabricated readings', () => {
  const result = assemble(second, { phrases: ['Я не їм риби.', 'Це риба?', 'Так.', 'Це вам?', 'Ні.'], words: [] }, 'uk');
  assert.equal(result.groups[0].thingsToSay[0].card.text, 'Я не їм риби.');
  assert.equal(Object.hasOwn(result.groups[0].thingsToSay[0].card, 'reading'), false);
  assert.equal(Object.hasOwn(result.groups[0].exampleConversation[0].card, 'romanization'), false);
});

test('exhausted generation prevents all translation and cancels outstanding topic calls', async () => {
  let calls = 0, translated = 0, cancelled = false;
  await assert.rejects(run(async (_prompt, { signal }) => {
    if (++calls !== 2) return reply('{bad');
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { cancelled = true; reject(signal.reason); }, { once: true }));
  }, async () => { translated++; return reply(secondTranslation); }), error => error.status === 502);
  assert.equal(translated, 0);
  assert.equal(cancelled, true);
});

test('exhausted translation fails the whole request and cancels unfinished siblings', async () => {
  let cancelled = false;
  await assert.rejects(run(healthyGeneration(), async (prompt, { signal }) => {
    if (data(prompt).topic.thingsToSay[0] === first.thingsToSay[0]) return reply('{bad');
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { cancelled = true; reject(signal.reason); }, { once: true }));
  }), error => error.status === 502);
  assert.equal(cancelled, true);
});

test('429 backoff recovers without resetting the logical call deadline', async () => {
  let attempts = 0;
  const request = { ...input, checklist: [second.title] };
  const result = await run(async () => {
    if (++attempts === 1) throw Object.assign(new Error('quota'), { status: 429 });
    return reply({ topics: [second] });
  }, async () => reply(secondTranslation), { retryDelaysMs: [1] }, request);
  assert.equal(attempts, 2);
  assert.equal(result.groups[0].likelyExchanges[0].lines[1].responses[0].card.text, 'Sí.');
  attempts = 0;
  await assert.rejects(run(async () => {
    attempts++;
    throw Object.assign(new Error('quota'), { status: 429 });
  }, healthyTranslation, { timeoutMs: 10, retryDelaysMs: [100] }, request), error => error.status === 502);
  assert.equal(attempts, 1);
});

test('client disconnect cancels the generation queue and removes response listeners', async () => {
  const req = new EventEmitter(); req.body = input;
  const res = new EventEmitter(); res.status = () => res; res.json = () => res; res.writableEnded = false;
  let cancelled = 0, started;
  const ready = new Promise(resolve => { started = resolve; });
  const pending = handlePhrasebook(req, res, {
    [generationBackendName]: async (_prompt, { signal }) => {
      started();
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { cancelled++; reject(signal.reason); }, { once: true }));
    }, [backendName]: healthyTranslation,
  }, { backendName, generationBackendName });
  await ready;
  res.emit('close');
  await pending;
  assert.equal(cancelled, 2);
  assert.equal(res.listenerCount('close'), 0);
});

test('the overall deadline aborts work and unknown timeout charges are not reported as zero', async (t) => {
  const logs = [];
  t.mock.method(console, 'log', entry => logs.push(entry));
  let cancelled = 0;
  await assert.rejects(run(async (_prompt, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { cancelled++; reject(signal.reason); }, { once: true })), healthyTranslation, { deadlineMs: 10 }), error => error.status === 502);
  assert.equal(cancelled, 2);
  assert.equal(logs.find(entry => entry.route === 'phrasebook:failed').costUsd, null);
});

test('mixed-model usage sums each reported or estimated price independently', async () => {
  const result = await run(async () => reply({ topics: [second] }, 'deepseek/deepseek-v4.1-flash', { inputTokens: 100, outputTokens: 50, costUsd: 0.01 }), async () => reply(secondTranslation), {}, { ...input, checklist: [second.title] });
  assert.equal(result.usage.model, 'deepseek/deepseek-v4.1-flash + gemini-3.5-flash-lite');
  assert.equal(result.usage.inputTokens, 110);
  assert.equal(result.usage.outputTokens, 55);
  assert.equal(result.usage.costUsd, 0.01 + computeCostUsd(backendName, { inputTokens: 10, outputTokens: 5 }));
  const unknown = await run(async () => reply({ topics: [second] }, 'unknown'), async () => reply(secondTranslation), {}, { ...input, checklist: [second.title] });
  assert.equal(unknown.usage.costUsd, null);
});

test('failed replies retain their actual usage across bounded rate-limit retry', async () => {
  let calls = 0;
  const result = await run(async () => {
    if (++calls === 1) throw Object.assign(new Error('rate limited'), { status: 429, reply: { model: 'deepseek/deepseek-v4.1-flash', usage: { inputTokens: 3, outputTokens: 2, costUsd: 0.02 } } });
    return reply({ topics: [second] }, 'deepseek/deepseek-v4.1-flash', { inputTokens: 10, outputTokens: 5, costUsd: 0.01 });
  }, async () => reply(secondTranslation), { retryDelaysMs: [1] }, { ...input, checklist: [second.title] });
  assert.equal(result.usage.inputTokens, 23);
  assert.equal(result.usage.costUsd, 0.03 + computeCostUsd(backendName, { inputTokens: 10, outputTokens: 5 }));
});

test('request parsing bounds topics while preserving safe answer keys and ability normalization', () => {
  const answers = JSON.parse('{"__proto__":"literal answer"}');
  const parsed = parsePhrasebookRequest({ ...input, answers, ability: 'advanced' });
  assert.equal(parsed.value.answers.__proto__, 'literal answer');
  assert.equal(parsed.value.ability, 'basics');
  for (const checklist of [[], Array(9).fill('Topic'), [' '], ['a'.repeat(121)]]) assert.ok(parsePhrasebookRequest({ ...input, checklist }).error);
  for (const ability of ['none', 'basics', 'conversational']) assert.equal(parsePhrasebookRequest({ ...input, ability }).value.ability, ability);
  assert.ok(parsePhrasebookRequest({ ...input, llm: 'client-choice' }).error);
});
