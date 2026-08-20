'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { parseTerm, parseLookupRequest } = require('../lookup-parse');
const { validateLookupResponse } = require('../lookup-validate');
const { handleLookup } = require('../lookup');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeCard(overrides = {}) {
  return {
    lang: 'ja',
    text: 'トイレ',
    translation: 'toilet',
    reading: [['トイレ', null]],
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

const VALID_BODY = { term: 'bathroom', language: 'ja' };

function happyRaw() {
  return JSON.stringify({
    blocks: [
      { card: makeCard(), groups: [{ title: 'Using the toilet', cards: [makeCard({ text: '御手洗い', translation: 'restroom' })] }] },
    ],
  });
}

// ---------------------------------------------------------------------------
// parseTerm — docs/API_DESIGN.md "term and context"
// ---------------------------------------------------------------------------

describe('parseTerm', () => {
  test('no parenthetical → empty context', () => {
    assert.deepEqual(parseTerm('dinner'), { term: 'dinner', context: '' });
  });

  test('parenthetical → term + context split on first "("', () => {
    assert.deepEqual(parseTerm('surf (v. to ride a wave)'), {
      term: 'surf',
      context: 'v. to ride a wave',
    });
  });

  test('missing closing ")" is not an error — remainder becomes context as-is', () => {
    assert.deepEqual(parseTerm('surf (v. to ride'), {
      term: 'surf',
      context: 'v. to ride',
    });
  });

  test('extra/nested parens in context are stripped, not parsed', () => {
    assert.deepEqual(parseTerm('term (b (c))'), { term: 'term', context: 'b c' });
  });

  test('second "(" is ignored as a split point; its parens are stripped like any other', () => {
    assert.deepEqual(parseTerm('a (b) (c)'), { term: 'a', context: 'b c' });
  });

  test('only a parenthetical, no term before it → empty term', () => {
    assert.deepEqual(parseTerm('(only context)'), { term: '', context: 'only context' });
  });
});

// ---------------------------------------------------------------------------
// parseLookupRequest — validation + defaults
// ---------------------------------------------------------------------------

describe('parseLookupRequest', () => {
  test('missing term → 400-worthy error', () => {
    const result = parseLookupRequest({ language: 'ja' });
    assert.match(result.error, /term/);
  });

  test('missing language → 400-worthy error', () => {
    const result = parseLookupRequest({ term: 'dinner' });
    assert.match(result.error, /language/);
  });

  test('term > 200 characters → error', () => {
    const result = parseLookupRequest({ term: 'x'.repeat(201), language: 'ja' });
    assert.match(result.error, /200/);
  });

  test('invalid enum values → error', () => {
    assert.match(parseLookupRequest({ term: 'a', language: 'fr' }).error, /language/);
    assert.match(parseLookupRequest({ term: 'a', language: 'ja', ability: 'expert' }).error, /ability/);
    assert.match(parseLookupRequest({ term: 'a', language: 'ja', formality: 'rude' }).error, /formality/);
    assert.match(parseLookupRequest({ term: 'a', language: 'ja', audience: 'boss' }).error, /audience/);
    assert.match(parseLookupRequest({ term: 'a', language: 'ja', llm: 'gpt5' }).error, /Unknown LLM/);
  });

  test('"(only context)" with no term before "(" → error', () => {
    const result = parseLookupRequest({ term: '(only context)', language: 'ja' });
    assert.match(result.error, /no term before/);
  });

  test('defaults applied per Inputs table', () => {
    const result = parseLookupRequest({ term: 'dinner', language: 'ja' });
    assert.deepEqual(result.value, {
      term: 'dinner',
      context: '',
      language: 'ja',
      ability: 'beginner',
      formality: 'polite',
      audience: 'staff',
      llm: 'google',
    });
  });

  test('explicit values override defaults', () => {
    const result = parseLookupRequest({
      term: 'dinner', language: 'zh', ability: 'advanced', formality: 'casual', audience: 'family', llm: 'claude',
    });
    assert.equal(result.value.ability, 'advanced');
    assert.equal(result.value.formality, 'casual');
    assert.equal(result.value.audience, 'family');
    assert.equal(result.value.llm, 'claude');
  });
});

// ---------------------------------------------------------------------------
// validateLookupResponse — validate + finish
// ---------------------------------------------------------------------------

describe('validateLookupResponse', () => {
  test('malformed JSON → throws', () => {
    assert.throws(() => validateLookupResponse('not json'));
  });

  test('truncated JSON → throws (max_tokens trap)', () => {
    const truncated = JSON.stringify({ blocks: [{ card: makeCard(), groups: [] }] }).slice(0, -5);
    assert.throws(() => validateLookupResponse(truncated));
  });

  test('invalid card → throws', () => {
    const raw = JSON.stringify({ blocks: [{ card: { lang: 'ja' }, groups: [] }] });
    assert.throws(() => validateLookupResponse(raw));
  });

  test('exactly 4 blocks → no trim (boundary)', () => {
    const blocks = Array.from({ length: 4 }, () => ({ card: makeCard(), groups: [] }));
    const { response, warnings } = validateLookupResponse(JSON.stringify({ blocks }));
    assert.equal(response.blocks.length, 4);
    assert.deepEqual(warnings, []);
  });

  test('> 4 blocks → trimmed to 4, keeps first 4 in order', () => {
    const blocks = Array.from({ length: 6 }, (_, i) => ({ card: makeCard({ text: `w${i}` }), groups: [] }));
    const { response, warnings } = validateLookupResponse(JSON.stringify({ blocks }));
    assert.equal(response.blocks.length, 4);
    assert.deepEqual(response.blocks.map((b) => b.card.text), ['w0', 'w1', 'w2', 'w3']);
    assert.ok(warnings.some((w) => w.includes('blocks')));
  });

  test('exactly 8 groups total → no trim (boundary)', () => {
    const groups = Array.from({ length: 8 }, (_, i) => ({ title: `g${i}`, cards: [makeCard()] }));
    const raw = JSON.stringify({ blocks: [{ card: makeCard(), groups }] });
    const { response, warnings } = validateLookupResponse(raw);
    assert.equal(response.blocks[0].groups.length, 8);
    assert.deepEqual(warnings, []);
  });

  test('> 8 groups total (shared across blocks) → trimmed to 8, keeps first 8 in order', () => {
    const groupsA = Array.from({ length: 5 }, (_, i) => ({ title: `a${i}`, cards: [makeCard()] }));
    const groupsB = Array.from({ length: 5 }, (_, i) => ({ title: `b${i}`, cards: [makeCard()] }));
    const raw = JSON.stringify({
      blocks: [
        { card: makeCard({ text: 'block-a' }), groups: groupsA },
        { card: makeCard({ text: 'block-b' }), groups: groupsB },
      ],
    });
    const { response, warnings } = validateLookupResponse(raw);
    const totalGroups = response.blocks.reduce((n, b) => n + b.groups.length, 0);
    assert.equal(totalGroups, 8);
    assert.deepEqual(response.blocks[0].groups.map((g) => g.title), ['a0', 'a1', 'a2', 'a3', 'a4']);
    assert.deepEqual(response.blocks[1].groups.map((g) => g.title), ['b0', 'b1', 'b2']);
    assert.ok(warnings.some((w) => w.includes('group budget')));
  });

  test('exactly 10 cards/group → no trim (boundary)', () => {
    const cards = Array.from({ length: 10 }, (_, i) => makeCard({ text: `c${i}` }));
    const raw = JSON.stringify({ blocks: [{ card: makeCard(), groups: [{ title: 'g', cards }] }] });
    const { response, warnings } = validateLookupResponse(raw);
    assert.equal(response.blocks[0].groups[0].cards.length, 10);
    assert.deepEqual(warnings, []);
  });

  test('> 10 cards/group → trimmed to 10, keeps first 10 in order', () => {
    const cards = Array.from({ length: 13 }, (_, i) => makeCard({ text: `c${i}` }));
    const raw = JSON.stringify({ blocks: [{ card: makeCard(), groups: [{ title: 'g', cards }] }] });
    const { response, warnings } = validateLookupResponse(raw);
    assert.equal(response.blocks[0].groups[0].cards.length, 10);
    assert.deepEqual(response.blocks[0].groups[0].cards.map((c) => c.text), cards.slice(0, 10).map((c) => c.text));
    assert.ok(warnings.some((w) => w.includes('clamped cards')));
  });

  test('empty group is dropped (no other minimum enforced)', () => {
    const raw = JSON.stringify({
      blocks: [{
        card: makeCard(),
        groups: [
          { title: 'has-cards', cards: [makeCard()] },
          { title: 'empty', cards: [] },
        ],
      }],
    });
    const { response, warnings } = validateLookupResponse(raw);
    assert.equal(response.blocks[0].groups.length, 1);
    assert.equal(response.blocks[0].groups[0].title, 'has-cards');
    assert.ok(warnings.some((w) => w.includes('dropped (empty)')));
  });

  test('context is service-set: block card gets input parenthetical, group card gets group title', () => {
    const raw = JSON.stringify({
      blocks: [{ card: makeCard(), groups: [{ title: 'Using the toilet', cards: [makeCard({ text: 'g' })] }] }],
    });
    const { response } = validateLookupResponse(raw, { context: 'v. to ride a wave' });
    assert.equal(response.blocks[0].card.context, 'v. to ride a wave');
    assert.equal(response.blocks[0].groups[0].cards[0].context, 'Using the toilet');
  });

  test('block card has no context when the input had no parenthetical', () => {
    const raw = JSON.stringify({ blocks: [{ card: makeCard(), groups: [] }] });
    const { response } = validateLookupResponse(raw, { context: '' });
    assert.equal(response.blocks[0].card.context, undefined);
  });

  test('garbage formality value (not in CARD_SCHEMA) → throws', () => {
    const raw = JSON.stringify({
      blocks: [{ card: makeCard({ formality: 'nonsense' }), groups: [] }],
    });
    assert.throws(() => validateLookupResponse(raw));
  });

  test('formality valid per CARD_SCHEMA but not a /lookup output value ("vulgar") → stripped', () => {
    const raw = JSON.stringify({
      blocks: [{ card: makeCard({ formality: 'vulgar' }), groups: [] }],
    });
    const { response, warnings } = validateLookupResponse(raw);
    assert.equal(response.blocks[0].card.formality, undefined);
    assert.ok(warnings.some((w) => w.includes('formality stripped')));
  });

  test('valid formality value on a card → kept', () => {
    const raw = JSON.stringify({ blocks: [{ card: makeCard({ formality: 'slang' }), groups: [] }] });
    const { response } = validateLookupResponse(raw);
    assert.equal(response.blocks[0].card.formality, 'slang');
  });
});

// ---------------------------------------------------------------------------
// handleLookup — route + handler
// ---------------------------------------------------------------------------

describe('handleLookup', () => {
  test('missing term/language → 400', async () => {
    const res = makeRes();
    await handleLookup({ body: { language: 'ja' } }, res, { google: async () => happyRaw() });
    assert.equal(res.statusCode, 400);
  });

  test('unknown llm → 400', async () => {
    const res = makeRes();
    await handleLookup({ body: { ...VALID_BODY, llm: 'not-a-model' } }, res, { google: async () => happyRaw() });
    assert.equal(res.statusCode, 400);
  });

  test('LLM throws → 502 "LLM request failed"', async () => {
    const res = makeRes();
    const registry = { google: async () => { throw new Error('boom'); } };
    await handleLookup({ body: VALID_BODY }, res, registry);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, 'LLM request failed');
  });

  test('LLM times out → 502 "LLM request failed" via a distinct code path from a throw', async () => {
    const res = makeRes();
    const registry = { google: () => new Promise(() => {}) }; // never resolves
    await handleLookup({ body: VALID_BODY }, res, registry, { timeoutMs: 10 });
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, 'LLM request failed');
  });

  test('truncated JSON → 502 "Invalid response from LLM"', async () => {
    const res = makeRes();
    const registry = { google: async () => happyRaw().slice(0, -5) };
    await handleLookup({ body: VALID_BODY }, res, registry);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, 'Invalid response from LLM');
  });

  test('happy path → 200 with a valid { blocks } response', async () => {
    const res = makeRes();
    const registry = { google: async () => happyRaw() };
    await handleLookup({ body: VALID_BODY }, res, registry);
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body.blocks));
    assert.equal(res.body.blocks.length, 1);
    assert.equal(res.body.blocks[0].card.text, 'トイレ');
  });

  test('picks the requested llm out of the registry', async () => {
    const res = makeRes();
    let calledWith = null;
    const registry = {
      google: async () => { throw new Error('should not be called'); },
      claude: async (prompt) => { calledWith = prompt; return happyRaw(); },
    };
    await handleLookup({ body: { ...VALID_BODY, llm: 'claude' } }, res, registry);
    assert.equal(res.statusCode, 200);
    assert.ok(typeof calledWith === 'string' && calledWith.length > 0);
  });
});
