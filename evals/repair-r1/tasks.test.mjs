import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSchema } from '../../../prompt-romp/src/suite.mjs';
import { modelInput, buildRepairPrompt, validateDetection, applyLocalizedRepair } from './tasks.mjs';

const repairSchema = JSON.parse(readFileSync(new URL('../suites/repair-r1-localized-repair/response.schema.json', import.meta.url), 'utf8'));

function fixture() {
  return { task: { language: 'es', ability: 'basics' }, topic: { title: 'Transport' },
    items: [{ handle: 'd:0', section: 'dialogue', english: { text: 'Where is the station?', speaker: 'you' }, speaker: 'you', alternative: false,
      card: { type: 'phrase', lang: 'es', text: '¿Dónde está el hospital?', translation: 'Where is the station?' } }],
    focus: { handle: 'd:0', field: 'text', category: 'meaning' } };
}
function patch() { return { handle: 'd:0', status: 'repaired', reason: 'Restore the station referent.', changes: [{ field: 'text', value: '¿Dónde está la estación?' }], dropSourceIndexes: [] }; }

test('localized correction preserves roles, intent and the original snapshot without echoing metadata', () => {
  const input = fixture(); const before = structuredClone(input);
  const result = applyLocalizedRepair(patch(), input);
  assert.equal(result.items[0].card.text, '¿Dónde está la estación?');
  assert.equal(result.items[0].speaker, 'you');
  assert.equal(result.items[0].alternative, false);
  assert.equal(result.items[0].card.translation, 'Where is the station?');
  assert.equal(result.semanticReview, 'not-assessed');
  assert.deepEqual(input, before);
});

test('unknown locations, repeated fields, metadata edits and partial unresolved patches cannot apply', () => {
  for (const alter of [p => { p.handle = 'd:1'; }, p => { p.changes.push(p.changes[0]); },
    p => { p.changes[0].field = 'speaker'; }, p => { p.status = 'unresolved'; },
    p => { p.changes = []; }]) {
    const value = patch(); alter(value);
    assert.throws(() => applyLocalizedRepair(value, fixture()));
  }
  const value = { ...patch(), status: 'unresolved', changes: [] };
  const input = fixture();
  assert.deepEqual(applyLocalizedRepair(value, input).items, input.items);
});

test('dependent reading mismatch rejects but missing headword reading can be repaired', () => {
  const input = fixture();
  input.items[0].card = { type: 'word', lang: 'ja', text: '駅', translation: 'station', partOfSpeech: 'noun', senseKey: 'station' };
  input.focus.field = 'reading'; input.focus.category = 'reading-romanization';
  const value = { ...patch(), changes: [{ field: 'reading', value: [['駅', 'えき']] }] };
  assert.deepEqual(applyLocalizedRepair(value, input).items[0].card.reading, [['駅', 'えき']]);
  value.changes[0].value = [['車', 'くるま']];
  assert.throws(() => applyLocalizedRepair(value, input), /concatenate/);
  value.changes[0].value = [['駅', null]];
  assert.throws(() => applyLocalizedRepair(value, input), /pronunciation/);
});

test('repair wire schema binds reading arrays and scalar values to their fields', () => {
  const readingPatch = { ...patch(), changes: [{ field: 'reading', value: [['駅', 'えき']] }] };
  assert.deepEqual(validateSchema(readingPatch, repairSchema), []);
  for (const value of ['えき', [], null]) {
    const invalid = { ...readingPatch, changes: [{ field: 'reading', value }] };
    assert(validateSchema(invalid, repairSchema).some(finding => finding.code === 'SCHEMA_INVALID' && finding.hard));
  }
  for (const [field, value] of Object.entries({ text: '駅', romanization: 'eki', partOfSpeech: 'noun', senseKey: 'station' })) {
    assert.deepEqual(validateSchema({ ...patch(), changes: [{ field, value }] }, repairSchema), []);
    for (const invalid of [[['駅', 'えき']], '', null]) {
      assert(validateSchema({ ...patch(), changes: [{ field, value: invalid }] }, repairSchema)
        .some(finding => finding.code === 'SCHEMA_INVALID' && finding.hard));
    }
  }
  for (const status of ['unchanged', 'unresolved']) {
    assert.deepEqual(validateSchema({ ...patch(), status, changes: [] }, repairSchema), []);
  }
});

test('repair wire schema rejects unsupported POS labels without constraining free text to POS values', () => {
  for (const value of ['measure word', 'classifier', 'Noun']) {
    const candidate = { ...patch(), changes: [{ field: 'partOfSpeech', value }] };
    assert(validateSchema(candidate, repairSchema)
      .some(finding => finding.code === 'SCHEMA_INVALID' && finding.hard));
  }
  for (const value of ['numeral', 'other']) {
    assert.deepEqual(validateSchema({ ...patch(), changes: [{ field: 'partOfSpeech', value }] }, repairSchema), []);
  }
  assert.deepEqual(validateSchema({ ...patch(), changes: [{ field: 'text', value: 'classifier' }] }, repairSchema), []);
});

function wordFixture() {
  const input = fixture();
  input.items[0].card = { type: 'word', lang: 'ja', text: '駅', translation: 'station', partOfSpeech: 'noun', senseKey: 'station' };
  input.focus.field = 'reading'; input.focus.category = 'reading-romanization';
  return input;
}
function freezeTree(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeTree);
    Object.freeze(value);
  }
  return value;
}
function requestFor(input) {
  return buildRepairPrompt(input, { instructions: 'Repair only the localized issue.\n', schema: repairSchema });
}
function rejectsSchema(value, schema) {
  assert(validateSchema(value, schema).some(finding => finding.code === 'SCHEMA_INVALID' && finding.hard));
}

test('reading-focused requests reject kana headword substitution while accepting the actual token repair', () => {
  const input = freezeTree(wordFixture());
  const variant = freezeTree({ instructions: 'Repair only the localized issue.\n', schema: structuredClone(repairSchema) });
  const before = structuredClone({ input, variant });
  const request = buildRepairPrompt(input, variant);
  const substitution = { ...patch(), changes: [{ field: 'text', value: 'えき' }] };
  assert.deepEqual(validateSchema(substitution, repairSchema), []);
  rejectsSchema(substitution, request.schema);
  const correction = { ...patch(), changes: [{ field: 'reading', value: [['駅', 'えき']] }] };
  assert.deepEqual(validateSchema(correction, request.schema), []);
  assert.deepEqual(applyLocalizedRepair(correction, input).items[0].card.reading, [['駅', 'えき']]);
  assert.deepEqual(request.input.editableFields, ['reading', 'romanization']);
  assert.deepEqual({ input, variant }, before);
});

test('reading and romanization focuses permit their coupled dependency but not Word metadata', () => {
  for (const field of ['reading', 'romanization']) {
    const input = wordFixture(); input.focus.field = field;
    const request = requestFor(input);
    const correction = { ...patch(), changes: [
      { field: 'reading', value: [['駅', 'えき']] }, { field: 'romanization', value: 'eki' },
    ] };
    assert.deepEqual(validateSchema(correction, request.schema), []);
    const card = applyLocalizedRepair(correction, input).items[0].card;
    assert.deepEqual(card.reading, [['駅', 'えき']]);
    assert.equal(card.romanization, 'eki');
    for (const [field, value] of [['partOfSpeech', 'verb'], ['senseKey', 'railway station']]) {
      rejectsSchema({ ...patch(), changes: [{ field, value }] }, request.schema);
    }
    rejectsSchema({ ...patch(), changes: [{ field: 'reading', value: 'えき' }] }, request.schema);
  }
});

test('Word headword and sense focuses allow coupled text, reading, POS and sense repairs', () => {
  for (const field of ['text', 'card', 'partOfSpeech', 'senseKey']) {
    const input = wordFixture(); input.focus.field = field;
    input.items[0].card.partOfSpeech = 'verb';
    const request = requestFor(input);
    const correction = { ...patch(), changes: [
      { field: 'text', value: '停車場' }, { field: 'reading', value: [['停車場', 'ていしゃじょう']] },
      { field: 'romanization', value: 'teishajō' }, { field: 'partOfSpeech', value: 'noun' },
      { field: 'senseKey', value: 'railway-station' },
    ] };
    assert.deepEqual(validateSchema(correction, request.schema), []);
    assert.deepEqual(applyLocalizedRepair(correction, input).items[0].card, {
      type: 'word', lang: 'ja', text: '停車場', translation: 'station', partOfSpeech: 'noun',
      senseKey: 'railway-station', reading: [['停車場', 'ていしゃじょう']], romanization: 'teishajō',
    });
    rejectsSchema({ ...patch(), changes: [{ field: 'partOfSpeech', value: 'classifier' }] }, request.schema);
  }
});

test('phrase requests omit Word-only fields while retaining text and pronunciation dependencies', () => {
  for (const field of ['text', 'card']) {
    const input = fixture(); input.focus.field = field;
    const request = requestFor(input);
    assert.deepEqual(validateSchema(patch(), request.schema), []);
    for (const [field, value] of [['reading', [['¿Dónde está la estación?', null]]], ['romanization', 'donde']]) {
      assert.deepEqual(validateSchema({ ...patch(), changes: [{ field, value }] }, request.schema), []);
    }
    for (const [field, value] of [['partOfSpeech', 'noun'], ['senseKey', 'station']]) {
      rejectsSchema({ ...patch(), changes: [{ field, value }] }, request.schema);
    }
  }
  for (const field of ['partOfSpeech', 'senseKey']) {
    const input = fixture(); input.focus.field = field;
    rejectsSchema(patch(), requestFor(input).schema);
  }
});

test('evidence and English-side focuses allow source omission without card edits', () => {
  for (const field of ['sources', 'english', 'translation']) {
    const input = fixture(); input.focus.field = field;
    input.items[0].sources = [
      { snapshot: { lang: 'es', text: 'El hospital.', translation: 'The hospital.' }, span: { start: 3, end: 11 } },
    ];
    const before = structuredClone(input);
    const request = requestFor(input);
    const omission = { ...patch(), changes: [], dropSourceIndexes: [0] };
    assert.deepEqual(request.input.editableFields, []);
    assert.deepEqual(validateSchema(omission, request.schema), []);
    assert.equal(Object.hasOwn(applyLocalizedRepair(omission, input).items[0], 'sources'), false);
    assert.deepEqual(input, before);
    rejectsSchema({ ...omission, dropSourceIndexes: [1] }, request.schema);
    for (const [field, value] of [
      ['text', 'estación'], ['reading', [['estación', null]]], ['romanization', 'estacion'],
      ['partOfSpeech', 'noun'], ['senseKey', 'station'],
    ]) rejectsSchema({ ...omission, changes: [{ field, value }] }, request.schema);
  }
});

test('localized request schemas reject foreign handles and absent sources and keep abstention controls', () => {
  for (const field of ['text', 'reading', 'sources', 'english', 'translation']) {
    const input = fixture(); input.focus.field = field;
    const schema = requestFor(input).schema;
    for (const status of ['unchanged', 'unresolved']) {
      const control = { ...patch(), status, changes: [] };
      assert.deepEqual(validateSchema(control, schema), []);
      assert.deepEqual(applyLocalizedRepair(control, input).items, input.items);
      rejectsSchema({ ...control, handle: 'd:1' }, schema);
      rejectsSchema({ ...control, dropSourceIndexes: [0] }, schema);
    }
  }
});

test('source omission never rewrites remaining historical evidence', () => {
  const input = fixture();
  input.items[0].card = { type: 'word', lang: 'es', text: 'estación', translation: 'station', partOfSpeech: 'noun', senseKey: 'station' };
  input.items[0].sources = [{ snapshot: { lang: 'es', text: 'La estación.', translation: 'The station.' }, span: { start: 3, end: 11 } },
    { snapshot: { lang: 'es', text: 'Una estación.', translation: 'A station.' }, span: { start: 4, end: 12 } }];
  const value = { ...patch(), changes: [], dropSourceIndexes: [0] };
  const result = applyLocalizedRepair(value, input);
  assert.deepEqual(result.items[0].sources, [input.items[0].sources[1]]);
  assert.equal(input.items[0].sources.length, 2);
  assert.throws(() => applyLocalizedRepair({ ...value, dropSourceIndexes: [0, 0] }, input), /duplicate/);
});

test('detection rejects duplicate or unlocatable findings and keeps abstention explicit', () => {
  const input = fixture();
  const finding = { handle: 'd:0', field: 'text', category: 'meaning', severity: 'material', origin: 'translation', reason: 'Hospital replaces station.' };
  const result = validateDetection({ complete: false, findings: [finding], unresolved: [] }, input);
  assert.equal(result.complete, false);
  assert.throws(() => validateDetection({ ...result, findings: [finding, finding] }, input), /Duplicate/);
  assert.throws(() => validateDetection({ ...result, findings: [{ ...finding, handle: 'd:2' }] }, input), /Unknown/);
});

test('model-facing projection cannot leak answer annotations or localization into detection', () => {
  const input = { ...fixture(), expectations: { correction: 'SECRET ANSWER' }, annotations: ['SECRET ANSWER'] };
  const detection = modelInput(input);
  assert.equal(Object.hasOwn(detection, 'focus'), false);
  assert.equal(JSON.stringify(detection).includes('SECRET ANSWER'), false);
  assert.equal(detection.items[0].speaker, 'you');
  assert.deepEqual(modelInput(input, true).focus, input.focus);
});
