'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { performPhrasebook, handlePhrasebook } = require('../phrasebook');
const { parsePhrasebookRequest, validateGenerationResponse, validateTranslationResponse, assemblePhrasebook } = require('../phrasebook/parse');
const { cardIdentity } = require('../schema');
const { computeCostUsd } = require('../pricing');

const backendName = 'gemini-3.5-flash-lite';
const generationBackendName = 'deepseek-v4.1-flash';
const input = { seed: 'a beach trip', language: 'es', ability: 'basics', answers: {}, checklist: ['Prepare', 'Prepare'] };
const first = {
  title: 'Prepare', essentials: ['Is a deposit required?', 'I rent boards.'],
  lines: [
    { speaker: 'you', text: 'I rent boards.' },
    { speaker: 'partner', text: 'Here is a board.' },
    { speaker: 'you', text: 'I will pay.' },
    { speaker: 'you', text: 'I can pay later.' },
  ], vocab: ['rent', 'board', 'deposit'],
};
const second = {
  title: 'Prepare', essentials: ['I do not eat fish.'],
  lines: [{ speaker: 'you', text: 'Is this fish?' }, { speaker: 'partner', text: 'Yes.' }],
  vocab: [],
};
const firstTranslation = {
  essentials: ['¿Se necesita un depósito?', 'Alquilo tablas.'],
  lines: ['Alquilo tablas.', 'Aquí tiene una tabla.', 'Pagaré.', 'Puedo pagar luego.'],
  vocab: [
    { target: 'alquilar', partOfSpeech: 'verb', senseKey: 'rent', source: { section: 'dialogue', index: 0, surface: 'Alquilo', occurrence: 0 } },
    { target: 'tabla', partOfSpeech: 'noun', senseKey: 'board' },
    { target: 'depósito', partOfSpeech: 'noun', senseKey: 'deposit', source: { section: 'essentials', index: 0, surface: 'depósito', occurrence: 0 } },
  ],
};
const secondTranslation = { essentials: ['No como pescado.'], lines: ['¿Es pescado?', 'Sí.'], vocab: [] };
const reply = (data, model = backendName, usage = { inputTokens: 10, outputTokens: 5 }) => ({ text: typeof data === 'string' ? data : JSON.stringify(data), model, usage });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const data = prompt => JSON.parse(prompt.input);
const run = (generate, translate, options = {}, request = input) => performPhrasebook(request, {
  [generationBackendName]: generate,
  [backendName]: translate,
}, { backendName, generationBackendName, ...options });
const normalized = topic => validateGenerationResponse(JSON.stringify({ conversations: [topic] }), [topic.title]).conversations[0];
const assemble = (topic, translation, language = 'es') => assemblePhrasebook({ seed: input.seed, language, conversations: [normalized(topic)], translations: [validateTranslationResponse(JSON.stringify(translation), topic, language)] });

function healthyGeneration(topics = [first, second]) {
  let index = 0;
  return async () => reply({ conversations: [topics[index++]] }, 'deepseek/deepseek-v4.1-flash');
}
const healthyTranslation = async prompt => reply(data(prompt).conversation.essentials[0] === first.essentials[0] ? firstTranslation : secondTranslation);

test('duplicate titles remain distinct and out-of-order topics retain all independent sections', async () => {
  let next = 0;
  let completedGeneration = 0;
  const finished = [];
  const result = await run(async () => {
    const index = next++;
    await pause(index === 0 ? 15 : 1);
    completedGeneration++;
    return reply({ conversations: [[first, second][index]] }, 'deepseek/deepseek-v4.1-flash');
  }, async prompt => {
    assert.equal(completedGeneration, 2, 'translation waits for the complete English stage');
    const isFirst = data(prompt).conversation.essentials[0] === first.essentials[0];
    await pause(isFirst ? 15 : 1);
    finished.push(isFirst ? 0 : 1);
    return reply(isFirst ? firstTranslation : secondTranslation);
  });
  assert.deepEqual(finished, [1, 0]);
  assert.equal(result.schemaVersion, 3);
  assert.notEqual(result.groups[0].id, result.groups[1].id);
  assert.deepEqual(result.groups.map(group => group.essentials.map(item => item.card.text)), [firstTranslation.essentials, secondTranslation.essentials]);
  assert.deepEqual(result.groups[0].dialogue.map(item => item.card.text), firstTranslation.lines);
  assert.equal(result.groups[0].dialogue[3].alternative, true);
  assert.equal(Object.hasOwn(result.groups[0].essentials[0], 'speaker'), false);
  assert.notEqual(result.groups[0].essentials[1].id, result.groups[0].dialogue[0].id);
  assert.equal(cardIdentity(result.groups[0].essentials[1].card), cardIdentity(result.groups[0].dialogue[0].card));
  assert.deepEqual(result.groups[1].vocab, []);
  assert.deepEqual(result.flags, []);
  const evidence = result.groups[0].vocab[2].sources[0];
  assert.equal(evidence.ref.occurrenceId, result.groups[0].essentials[0].id);
  assert.deepEqual(evidence.span, { start: 16, end: 24 });
  assert.equal(result.groups[0].vocab[0].sources[0].ref.occurrenceId, result.groups[0].dialogue[0].id);
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
    return reply({ conversations: [{ ...second, title }] });
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
      return reply({ conversations: [[first, second][generated++]] });
    }
    return healthyTranslation(prompt);
  } }, { backendName, generationBackendName: backendName });
  assert.equal(generated, 2);
  assert.equal(result.groups[1].essentials[0].card.text, secondTranslation.essentials[0]);
});

test('invalid generation and translation retry only their logical topic', async () => {
  const request = { ...input, checklist: ['First', 'Second'] };
  const counts = { First: 0, Second: 0, firstTranslation: 0, secondTranslation: 0 };
  const result = await run(async prompt => {
    const title = data(prompt).checklist[0];
    if (++counts[title] === 1 && title === 'First') return reply('{bad');
    return reply({ conversations: [{ ...(title === 'First' ? first : second), title }] });
  }, async prompt => {
    if (data(prompt).conversation.title === 'First') {
      return reply(++counts.firstTranslation === 1 ? { ...firstTranslation, essentials: [] } : firstTranslation);
    }
    counts.secondTranslation++;
    return reply(secondTranslation);
  }, {}, request);
  assert.deepEqual(counts, { First: 2, Second: 1, firstTranslation: 2, secondTranslation: 1 });
  assert.equal(result.usage.inputTokens, 60);
});

test('only valid independent-list overflow is clamped, never a corrupt tail or dialogue', () => {
  const topic = { ...first, essentials: Array.from({ length: 9 }, (_, i) => `Essential ${i}`), vocab: Array.from({ length: 11 }, (_, i) => `Word ${i}`) };
  const generated = validateGenerationResponse(JSON.stringify({ conversations: [topic] }), [first.title]);
  assert.equal(generated.failureLevel, 1);
  assert.deepEqual(generated.conversations[0].essentials, topic.essentials.slice(0, 8));
  assert.deepEqual(generated.conversations[0].vocab, topic.vocab.slice(0, 10));
  for (const invalid of [
    { ...topic, essentials: [...topic.essentials, ''] },
    { ...topic, vocab: [...topic.vocab, 1] },
    { ...first, essentials: [] },
    { ...first, vocab: undefined },
    { ...first, lines: Array(11).fill(first.lines[0]) },
    { ...first, lines: [first.lines[0], first.lines[2]] },
    { ...first, lines: [{ ...first.lines[0], or: true }, first.lines[1]] },
    { ...first, lines: [{ ...first.lines[0], alternative: true }, first.lines[1]] },
    { ...first, title: 'Other' },
    { ...first, featuredPhraseIds: [] },
  ]) assert.throws(() => validateGenerationResponse(JSON.stringify({ conversations: [invalid] }), [first.title]));
  assert.throws(() => validateGenerationResponse('```json\n' + JSON.stringify({ conversations: [first] }) + '\n```', [first.title]));
});

test('maximum independent section sizes survive translation and assembly', () => {
  const topic = { title: 'Maximum', essentials: Array.from({ length: 8 }, (_, i) => `Need ${i}`), vocab: Array.from({ length: 10 }, (_, i) => `Word ${i}`), lines: Array.from({ length: 10 }, (_, i) => ({ speaker: i % 2 ? 'partner' : 'you', text: `Line ${i}` })) };
  const translation = { essentials: topic.essentials.map((_, i) => `Necesito ${i}`), lines: topic.lines.map((_, i) => `Línea ${i}`), vocab: topic.vocab.map((_, i) => ({ target: `palabra ${i}`, partOfSpeech: 'noun', senseKey: `word-${i}` })) };
  const group = assemble(topic, translation).groups[0];
  assert.deepEqual(group.essentials.map(item => item.card.translation), topic.essentials);
  assert.deepEqual(group.vocab.map(item => item.card.text), translation.vocab.map(item => item.target));
  assert.deepEqual(group.dialogue.map(item => item.card.translation), topic.lines.map(item => item.text));
});

test('source hints resolve exactly within the named section or are dropped with one unresolved flag', () => {
  for (const source of [
    { section: 'essentials', index: 1, surface: 'depósito', occurrence: 0 },
    { section: 'dialogue', index: 0, surface: 'depósito', occurrence: 0 },
    { section: 'essentials', index: 0, surface: 'depósito', occurrence: 1 },
    { section: 'essentials', index: 0, surface: 'depósito[x]', occurrence: 0 },
    { section: 'essentials', index: 0, surface: ' ', occurrence: 0 },
    { section: 'essentials', index: 0, surface: 'depósito', occurrence: 0, extra: true },
    { lineIndex: 0, surface: 'depósito', occurrence: 0 },
    null,
  ]) {
    const translation = structuredClone(firstTranslation);
    translation.vocab[2].source = source;
    const result = assemble(first, translation);
    assert.equal(Object.hasOwn(result.groups[0].vocab[2], 'sources'), false);
    assert.deepEqual(result.flags, [{ code: 'vocab-source-missing', groupIndex: 0, vocabIndex: 2, reason: 'unresolved' }]);
  }
  const withoutSource = structuredClone(firstTranslation);
  delete withoutSource.vocab[2].source;
  assert.deepEqual(assemble(first, withoutSource).flags, []);
});

test('overlapping sources count every exact target occurrence and never split surrogate pairs', () => {
  const topic = { ...second, essentials: ['Laugh.'], vocab: ['laugh'] };
  const translated = { essentials: ['哈[hā]哈[hā]哈[hā]！'], lines: ['你[nǐ]好[hǎo]！', '好[hǎo]！'], vocab: [{ target: '哈[hā]哈[hā]', partOfSpeech: 'verb', senseKey: 'laugh', source: { section: 'essentials', index: 0, surface: '哈哈', occurrence: 1 } }] };
  const candidate = assemble(topic, translated, 'zh').groups[0].vocab[0];
  assert.deepEqual(candidate.sources[0].span, { start: 1, end: 3 });
  assert.equal(candidate.sources[0].snapshot.text, '哈哈哈！');
  const split = { ...translated, essentials: ['😀a'], vocab: [{ target: 'a', partOfSpeech: 'noun', senseKey: 'letter', source: { section: 'essentials', index: 0, surface: '\ude00a', occurrence: 0 } }] };
  assert.equal(assemble(topic, split).flags[0].reason, 'unresolved');
});

test('strict translations reject old fields, mismatched sections and invalid dictionary readings', () => {
  for (const invalid of [
    { ...firstTranslation, essentials: [] }, { ...firstTranslation, lines: [] },
    { ...firstTranslation, vocab: [] }, { ...firstTranslation, lineScores: [5, 5, 5, 5] },
    { ...firstTranslation, essentialsRomanizations: ['bad'] },
    { ...firstTranslation, vocab: [{ target: 'tabla' }, ...firstTranslation.vocab.slice(1)] },
  ]) assert.throws(() => validateTranslationResponse(JSON.stringify(invalid), first, 'es'));
  const invalidHan = { essentials: ['はい。'], lines: ['はい。', 'いいえ。'], vocab: [{ target: '食べる', partOfSpeech: 'verb', senseKey: 'eat' }] };
  assert.throws(() => validateTranslationResponse(JSON.stringify(invalidHan), { ...second, vocab: ['eat'] }, 'ja'), /annotate every dictionary-form Han/);
});

test('Japanese romanizations remain section-aligned with per-array fallback', () => {
  const topic = { ...second, essentials: ['I eat.'], vocab: ['eat'] };
  const japanese = { essentials: ['食[た]べます。'], lines: ['はい。', 'いいえ。'], vocab: [{ target: '食[た]べる', partOfSpeech: 'verb', senseKey: 'eat' }], essentialsRomanizations: ['Tabemasu.'], lineRomanizations: ['Hai.', 'Iie.'], vocabRomanizations: ['taberu'] };
  const good = assemble(topic, japanese, 'ja').groups[0];
  assert.equal(good.essentials[0].card.romanization, 'Tabemasu.');
  assert.equal(good.dialogue[0].card.romanization, 'Hai.');
  assert.equal(good.vocab[0].card.romanization, 'taberu');
  const shifted = assemble(topic, { ...japanese, lineRomanizations: ['WRONG'] }, 'ja').groups[0];
  assert.deepEqual(shifted.dialogue.map(item => item.card.romanization), ['Hai.', 'Iie.']);
  assert.equal(shifted.essentials[0].card.romanization, 'Tabemasu.');
  const unreadable = assemble(topic, { ...japanese, essentials: ['私です。'], essentialsRomanizations: ['私です'] }, 'ja').groups[0];
  assert.equal(unreadable.essentials[0].card.text, '私です。');
  assert.equal(Object.hasOwn(unreadable.essentials[0].card, 'romanization'), false);
});

test('native Ukrainian cards preserve Cyrillic without fabricated readings', () => {
  const result = assemble(second, { essentials: ['Я не їм риби.'], lines: ['Це риба?', 'Так.'], vocab: [] }, 'uk');
  assert.equal(result.groups[0].essentials[0].card.text, 'Я не їм риби.');
  assert.equal(Object.hasOwn(result.groups[0].essentials[0].card, 'reading'), false);
  assert.equal(Object.hasOwn(result.groups[0].dialogue[0].card, 'romanization'), false);
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
    if (data(prompt).conversation.essentials[0] === first.essentials[0]) return reply('{bad');
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { cancelled = true; reject(signal.reason); }, { once: true }));
  }), error => error.status === 502);
  assert.equal(cancelled, true);
});

test('429 backoff recovers without resetting the logical call deadline', async () => {
  let attempts = 0;
  const request = { ...input, checklist: [second.title] };
  const result = await run(async () => {
    if (++attempts === 1) throw Object.assign(new Error('quota'), { status: 429 });
    return reply({ conversations: [second] });
  }, async () => reply(secondTranslation), { retryDelaysMs: [1] }, request);
  assert.equal(attempts, 2);
  assert.equal(result.groups[0].dialogue[1].card.text, 'Sí.');
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
  const result = await run(async () => reply({ conversations: [second] }, 'deepseek/deepseek-v4.1-flash', { inputTokens: 100, outputTokens: 50, costUsd: 0.01 }), async () => reply(secondTranslation), {}, { ...input, checklist: [second.title] });
  assert.equal(result.usage.model, 'deepseek/deepseek-v4.1-flash + gemini-3.5-flash-lite');
  assert.equal(result.usage.inputTokens, 110);
  assert.equal(result.usage.outputTokens, 55);
  assert.equal(result.usage.costUsd, 0.01 + computeCostUsd(backendName, { inputTokens: 10, outputTokens: 5 }));
  const unknown = await run(async () => reply({ conversations: [second] }, 'unknown'), async () => reply(secondTranslation), {}, { ...input, checklist: [second.title] });
  assert.equal(unknown.usage.costUsd, null);
});

test('failed replies retain their actual usage across bounded rate-limit retry', async () => {
  let calls = 0;
  const result = await run(async () => {
    if (++calls === 1) throw Object.assign(new Error('rate limited'), { status: 429, reply: { model: 'deepseek/deepseek-v4.1-flash', usage: { inputTokens: 3, outputTokens: 2, costUsd: 0.02 } } });
    return reply({ conversations: [second] }, 'deepseek/deepseek-v4.1-flash', { inputTokens: 10, outputTokens: 5, costUsd: 0.01 });
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
