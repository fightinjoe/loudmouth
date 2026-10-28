import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { validateSchema } from '../../../../prompt-romp/src/suite.mjs';
import { normalizePosUsage as normalize, validatePosUsageCandidate, posUsageIdentity } from './policy.mjs';
import { buildPrompt } from '../../suites/repair-r1-pos-usage/adapter.mjs';

const require = createRequire(import.meta.url);
const { validateCandidate, cardIdentity } = require('../../../api/src/schema');
const schema = JSON.parse(readFileSync(new URL('../../suites/repair-r1-pos-usage/response.schema.json', import.meta.url), 'utf8'));
const unchanged = (handle, status = 'unchanged') => ({ handle, status, changes: [], dropSourceIndexes: [] });
const repair = (handle, changes, dropSourceIndexes = []) => ({ handle, status: 'repaired', reason: 'Restore the intended lexical teaching without changing its gloss.', changes, dropSourceIndexes });
const change = (field, value) => ({ field, value });
const responses = (input, replacements = []) => ({ items: input.items.map(item => replacements.find(response => response.handle === item.handle) ?? unchanged(item.handle)) });
const source = (text, start, end) => ({ snapshot: { lang: 'ja', text, translation: 'One pair and two pairs.' }, ref: { cardId: '00000000-0000-4000-8000-000000000001' }, span: { start, end } });
const example = () => ({ text: '一足', reading: [['一足', 'いっそく']], translation: 'one pair' });
function fixture() {
  return { task: { language: 'ja', ability: 'basics', seed: 'Shoe shopping' }, topic: { title: 'Shoe shopping' }, items: [
    { handle: 'e:0', section: 'essentials', index: 0, english: 'Thank you.', card: { type: 'phrase', lang: 'ja', text: 'ありがとうございます。', translation: 'Thank you.' } },
    { handle: 'd:0', section: 'dialogue', index: 0, speaker: 'you', alternative: false, english: { text: 'I want shoes.', speaker: 'you' }, card: { type: 'phrase', lang: 'ja', text: '靴が欲しいです。', translation: 'I want shoes.', formality: 'polite' } },
    { handle: 'd:1', section: 'dialogue', index: 1, speaker: 'partner', alternative: false, english: { text: 'Here you are.', speaker: 'partner' }, card: { type: 'phrase', lang: 'ja', text: 'どうぞ。', translation: 'Here you are.' } },
    { handle: 'v:0', section: 'vocab', index: 0, english: 'pair', card: { type: 'word', lang: 'ja', text: '足', reading: [['足', 'そく']], translation: 'pair', partOfSpeech: 'noun', senseKey: 'footwear-pair' }, sources: [source('一足と二足。', 1, 2), source('一足と二足。', 4, 5)] },
  ] };
}
function counterRepair() {
  return repair('v:0', [change('partOfSpeech', 'counter'), change('notes', 'Attach after a numeral to count pairs of footwear.'), change('example', example())]);
}
function spanishWord(text = 'estación', senseKey = 'station') {
  return { type: 'word', lang: 'es', text, translation: 'station', partOfSpeech: 'noun', senseKey };
}
function wordTopic(cards) {
  return { task: { language: 'es', ability: 'basics' }, topic: { title: 'Station' }, items: cards.map((card, index) => ({ handle: `v:${index}`, section: 'vocab', index, english: card.translation, card })) };
}

test('counter teaching repairs reconstruct the full topic without mutating inputs or evidence', () => {
  const input = fixture();
  const parsed = responses(input, [counterRepair()]);
  const before = structuredClone({ input, parsed });
  assert.deepEqual(validateSchema(parsed, schema), []);
  const result = normalize(parsed, input).value;
  const expected = structuredClone(input.items);
  Object.assign(expected[3].card, { partOfSpeech: 'counter', notes: counterRepair().changes[1].value, example: example() });
  assert.deepEqual(result.items, expected);
  assert.deepEqual(result.response, parsed);
  assert.equal(result.application, 'applied-in-memory');
  assert.deepEqual({ input, parsed }, before);
  // The authored teaching example does not become evidence or replace historical readings.
  assert.deepEqual(result.items[3].sources, input.items[3].sources);
  assert.deepEqual(result.items[3].card.reading, [['足', 'そく']]);
});

test('new POS validates only through P1, keeps its true value and never loosens the old contract', () => {
  const card = { ...fixture().items[3].card, partOfSpeech: 'counter' };
  const before = structuredClone(card);
  assert.throws(() => validateCandidate({ card }));
  assert.equal(validatePosUsageCandidate({ card }).card, card);
  assert.deepEqual(card, before);
  const chinese = { ...card, lang: 'zh', text: '双', reading: [['双', 'shuāng']], partOfSpeech: 'classifier' };
  assert.equal(validatePosUsageCandidate({ card: chinese }).card, chinese);
  for (const invalid of [{ ...card, lang: 'es' }, { ...card, partOfSpeech: 'classifier' }, { ...chinese, partOfSpeech: 'counter' }, { ...card, type: 'phrase' }]) {
    assert.throws(() => validatePosUsageCandidate({ card: invalid }));
  }
});

test('shared identity normalization is retained, true POS differs, notes and examples do not change identity', () => {
  const noun = fixture().items[3].card;
  const counter = { ...noun, partOfSpeech: 'counter' };
  assert.equal(posUsageIdentity(noun), cardIdentity(noun));
  assert.notEqual(posUsageIdentity(noun), posUsageIdentity(counter));
  assert.equal(JSON.parse(posUsageIdentity(counter))[3], 'counter');
  assert.equal(posUsageIdentity(counter), posUsageIdentity({ ...counter, notes: 'Counts pairs of footwear.', example: example() }));
  assert.equal(posUsageIdentity(spanishWord(' estación ')), posUsageIdentity(spanishWord('estacio\u0301n')));
});

test('all originals validate even when unchanged or unresolved', () => {
  for (const status of ['unchanged', 'unresolved']) {
    for (const mutate of [
      input => { input.items[3].card.reading = [['足', null]]; },
      input => { input.items[3].card.reading = [['一足', 'いっそく']]; },
      input => { delete input.items[3].card.reading; },
      input => { input.items[0].card.unexpected = true; },
      input => { input.items[3].sources[0].span.end = 100; },
      input => { input.items[3].card.notes = ''; },
    ]) {
      const input = fixture(); mutate(input);
      assert.throws(() => normalize(responses(input, [unchanged('v:0', status)]), input));
    }
  }
});

test('original structural defects cannot be hidden by replacing the invalid field', () => {
  const input = fixture();
  input.items[3].card.reading = [['一足', 'いっそく']];
  assert.throws(() => normalize(responses(input, [repair('v:0', [change('reading', [['足', 'そく']])])]), input));
});

test('original ordinary examples follow shared optional translation but new teaching requires it', () => {
  const input = wordTopic([{ ...spanishWord(), example: { text: 'La estación.' } }]);
  assert.deepEqual(normalize(responses(input), input).value.items, input.items);
  const parsed = responses(input, [repair('v:0', [change('example', { text: 'Una estación.' })])]);
  assert.throws(() => normalize(parsed, input));
  assert(validateSchema(parsed, schema).some(finding => finding.hard));
  const bound = { ...fixture().items[3].card, partOfSpeech: 'counter', example: { text: '一足', reading: [['一足', 'いっそく']] } };
  assert.throws(() => validatePosUsageCandidate({ card: bound }));
});

test('shared exact-field, string limits, evidence language and candidate checks remain effective', () => {
  const valid = { card: spanishWord() };
  for (const candidate of [
    { ...valid, unexpected: true },
    { card: { ...valid.card, unexpected: true } },
    { card: { ...valid.card, notes: 'x'.repeat(2001) } },
    { card: { ...valid.card, senseKey: 'x'.repeat(121) } },
    { card: { ...valid.card, senseKey: 'Not a key' } },
    { ...valid, sources: [] },
    { ...valid, sources: [source('一足と二足。', 1, 2)] },
  ]) assert.throws(() => validatePosUsageCandidate(candidate));
});

test('example replacement is complete and atomic, with shared nested validation and CJK reading rules', () => {
  const invalid = [
    null, {}, { translation: 'one pair' },
    { ...example(), translation: '' }, { ...example(), translation: 'x'.repeat(2001) },
    { ...example(), text: 'x'.repeat(2001) }, { ...example(), romanization: ' ' },
    { ...example(), reading: [['足', 'そく']] }, { ...example(), reading: [['一足', null]] },
    { text: '一足', translation: 'one pair' }, { ...example(), reading: [['一足', '']] },
    { ...example(), reading: [['一足', 'いっそく', 'extra']] }, { ...example(), notes: 'Hidden extra field.' },
  ];
  for (const value of invalid) {
    const input = fixture();
    const parsed = responses(input, [repair('v:0', [change('example', value)])]);
    const before = structuredClone({ input, parsed });
    assert.throws(() => normalize(parsed, input));
    assert.deepEqual({ input, parsed }, before);
  }
});

test('aligned reading fixes preserve dictionary versus example pronunciation and source snapshots', () => {
  const input = fixture();
  input.items[3].card.reading = [['足', 'あし']];
  input.items[3].card.example = { ...example(), reading: [['一足', 'いちそく']] };
  const parsed = responses(input, [repair('v:0', [change('reading', [['足', 'そく']]), change('example', example())])]);
  const result = normalize(parsed, input).value;
  assert.deepEqual(result.items[3].card.reading, [['足', 'そく']]);
  assert.deepEqual(result.items[3].card.example.reading, [['一足', 'いっそく']]);
  assert.deepEqual(result.items[3].sources, input.items[3].sources);
});

test('headword text changes require its own aligned reading, not a copied occurrence reading', () => {
  const input = fixture();
  input.items[3].card.text = '食べません'; input.items[3].card.reading = [['食', 'た'], ['べません', null]];
  input.items[3].card.partOfSpeech = 'verb'; input.items[3].card.senseKey = 'eat'; input.items[3].card.translation = 'eat';
  const textOnly = responses(input, [repair('v:0', [change('text', '食べる')])]);
  assert.throws(() => normalize(textOnly, input));
  const result = normalize(responses(input, [repair('v:0', [change('text', '食べる'), change('reading', [['食', 'た'], ['べる', null]])])]), input).value;
  assert.equal(result.items[3].card.text, '食べる');
  assert.deepEqual(result.items[3].sources, input.items[3].sources);
});

test('notes and examples are Word-only; all metadata, glosses, English and evidence are not patch fields', () => {
  const input = fixture();
  for (const field of ['notes', 'example', 'partOfSpeech', 'senseKey']) {
    assert.throws(() => normalize(responses(input, [repair('d:0', [change(field, field === 'example' ? example() : 'noun')])]), input));
  }
  for (const field of ['translation', 'english', 'lang', 'type', 'definition', 'formality', 'sources', 'speaker', 'section', 'handle', 'reading.0', 'example.text']) {
    assert.throws(() => normalize(responses(input, [repair('v:0', [change(field, 'changed')])]), input));
  }
  for (const field of ['sources', 'english', 'card', 'speaker', 'section']) {
    assert.throws(() => normalize(responses(input, [{ ...counterRepair(), [field]: 'changed' }]), input));
  }
});

test('no deletion, duplicate fields, unchanged echoes or repaired no-ops are accepted', () => {
  const input = fixture();
  const invalidChanges = [[], [change('notes', null)], [change('example', null)], [change('reading', null)],
    [change('text', '足')], [change('partOfSpeech', 'noun')],
    [change('notes', 'Usage.'), change('notes', 'Different usage.')], [change('notes', '')], [change('notes', ' ')],
    [{ field: 'notes', value: 'Usage.', extra: true }], [{ field: 'notes' }]];
  for (const changes of invalidChanges) assert.throws(() => normalize(responses(input, [repair('v:0', changes)]), input));
});

test('conditional reasons are raw and optional only for no-change statuses', () => {
  const input = fixture();
  const parsed = responses(input, [unchanged('v:0', 'unresolved'), { ...unchanged('e:0'), reason: '' }]);
  const result = normalize(parsed, input).value;
  assert.deepEqual(result.items, input.items);
  assert.equal(result.application, 'original-retained');
  assert.deepEqual(result.unresolvedHandles, ['v:0']);
  assert.deepEqual(result.response, parsed);
  assert.deepEqual(validateSchema(parsed, schema), []);
  for (const reason of [undefined, '', ' ', 12, 'x'.repeat(1001)]) {
    const response = { ...counterRepair(), reason };
    if (reason === undefined) delete response.reason;
    const invalid = responses(input, [response]);
    assert.throws(() => normalize(invalid, input));
    assert(validateSchema(invalid, schema).some(finding => finding.hard));
  }
  for (const status of ['unchanged', 'unresolved']) {
    assert.throws(() => normalize(responses(input, [{ ...counterRepair(), status }]), input));
    assert.throws(() => normalize(responses(input, [{ ...unchanged('v:0', status), dropSourceIndexes: [0] }]), input));
    assert.throws(() => normalize(responses(input, [{ ...unchanged('v:0', status), reason: null }]), input));
  }
});

test('membership is complete and unique independent of response ordering', () => {
  const input = fixture();
  const valid = responses(input); valid.items.reverse();
  assert.deepEqual(normalize(valid, input).value.items, input.items);
  for (const parsed of [
    { items: valid.items.slice(1) }, { items: [...valid.items, unchanged('foreign')] },
    { items: valid.items.map((item, index) => index === 0 ? unchanged('foreign') : item) },
    { items: valid.items.map((item, index) => index === 0 ? valid.items[1] : item) },
    { ...valid, extra: true }, { items: null },
  ]) assert.throws(() => normalize(parsed, input));
  for (const handle of ['', undefined, 'd:0']) {
    const malformed = fixture(); malformed.items[3].handle = handle;
    assert.throws(() => normalize(responses(malformed), malformed));
  }
});

test('source-only repair selects exact repeated occurrences and preserves remaining bytes', () => {
  const input = fixture();
  const parsed = responses(input, [repair('v:0', [], [0])]);
  const before = structuredClone(input);
  const result = normalize(parsed, input).value;
  assert.deepEqual(result.items[3].card, input.items[3].card);
  assert.deepEqual(result.items[3].sources, [input.items[3].sources[1]]);
  assert.deepEqual(input, before);
  const last = normalize(responses(input, [repair('v:0', [], [0, 1])]), input).value;
  assert(!Object.hasOwn(last.items[3], 'sources'));
  for (const indexes of [[0, 0], [-1], [2], [0.5], ['0']]) {
    assert.throws(() => normalize(responses(input, [repair('v:0', [], indexes)]), input));
  }
});

test('UTF-16 evidence offsets cannot split surrogate pairs', () => {
  const card = spanishWord();
  const evidence = { snapshot: { lang: 'es', text: '😀 estación', translation: 'station' }, span: { start: 3, end: 11 } };
  assert.equal(validatePosUsageCandidate({ card, sources: [evidence] }).sources[0], evidence);
  assert.throws(() => validatePosUsageCandidate({ card, sources: [{ ...evidence, span: { start: 1, end: 2 } }] }));
});

test('an invalid late repair prevents any partial output or mutation', () => {
  const input = fixture();
  const parsed = responses(input, [repair('e:0', [change('text', 'どうもありがとうございます。')]), repair('v:0', [change('example', { ...example(), reading: [['足', 'そく']] })])]);
  const before = structuredClone({ input, parsed });
  assert.throws(() => normalize(parsed, input));
  assert.deepEqual({ input, parsed }, before);
});

test('identity collision rejects distinct originals even if notes or source placements differ', () => {
  const input = wordTopic([spanishWord('estación'), spanishWord('parada')]);
  const parsed = responses(input, [repair('v:1', [change('text', ' estación '), change('notes', 'A distinct placement does not make a distinct lexical identity.')])]);
  const before = structuredClone(input);
  assert.throws(() => normalize(parsed, input), /identity collision/);
  assert.deepEqual(input, before);
});

test('two simultaneous repairs cannot converge on one previously absent identity', () => {
  const input = wordTopic([spanishWord('estación'), spanishWord('parada')]);
  const parsed = responses(input, input.items.map(item => repair(item.handle, [change('text', 'terminal')])));
  assert.throws(() => normalize(parsed, input), /identity collision/);
});

test('preexisting repeated canonical Words remain valid with no changes or teaching-only changes', () => {
  const input = wordTopic([spanishWord('estación'), spanishWord('estacio\u0301n')]);
  assert.deepEqual(normalize(responses(input), input).value.items, input.items);
  const parsed = responses(input, [repair('v:1', [change('notes', 'A railway station.')])]);
  const result = normalize(parsed, input).value;
  assert.equal(result.items[1].card.notes, 'A railway station.');
  assert.equal(posUsageIdentity(result.items[0].card), posUsageIdentity(result.items[1].card));
});

test('true POS and sense identities keep homographs distinct but new POS collapse is rejected', () => {
  const input = fixture();
  const duplicate = structuredClone(input.items[3]);
  duplicate.handle = 'v:1'; duplicate.index = 1; duplicate.card.partOfSpeech = 'counter';
  input.items.push(duplicate);
  assert.deepEqual(normalize(responses(input), input).value.items, input.items);
  assert.throws(() => normalize(responses(input, [counterRepair()]), input), /identity collision/);
  const senses = wordTopic([spanishWord('talla', 'clothing-size'), { ...spanishWord('talla', 'carve'), partOfSpeech: 'verb' }]);
  assert.deepEqual(normalize(responses(senses), senses).value.items, senses.items);
});

test('ordinary European teaching repairs need no obligatory ruby and preserve native characters', () => {
  for (const [lang, text, repaired] of [['es', 'rojas', 'rojo'], ['cs', 'boty', 'bota'], ['uk', 'черевики', 'черевик']]) {
    const input = wordTopic([{ ...spanishWord(text), lang }]);
    input.task.language = lang;
    const result = normalize(responses(input, [repair('v:0', [change('text', repaired), change('notes', 'Dictionary headword; the example shows the contextual form.'), change('example', { text, translation: 'Contextual form.' })])]), input).value;
    assert.equal(result.items[0].card.text, repaired);
    assert(!Object.hasOwn(result.items[0].card, 'reading'));
  }
});

test('adapter sends only the public topic and never annotations or proposed responses', () => {
  const input = { ...fixture(), id: 'private-case', familyId: 'private-family', annotations: [{ rationale: 'private diagnosis' }], exampleResponse: { items: [counterRepair()] }, focus: { handle: 'v:0', field: 'partOfSpeech', category: 'headword-pos' } };
  const prompt = buildPrompt(input, { instructions: 'Approved caller-supplied instructions.' });
  const serialized = JSON.stringify(prompt.input);
  for (const privateValue of ['private-case', 'private-family', 'private diagnosis', 'exampleResponse', 'annotations']) {
    assert(!serialized.includes(privateValue), `Private review data leaked: ${privateValue}`);
  }
});
