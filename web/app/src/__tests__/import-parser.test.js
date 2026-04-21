import { describe, it, expect } from 'vitest';
import { parseCardBatch, normalizeCard } from '../js/import-parser.js';

// New flat schema fixture
const valid = (overrides = {}) => ({
  lang: 'zh',
  type: 'word',
  text: '你好',
  reading: 'nǐ hǎo',
  translation: 'Hello',
  notes: 'Common greeting',
  example: { text: '你好吗', reading: 'nǐ hǎo ma', translation: 'How are you?' },
  ...overrides,
});

// Old nested schema fixture (backward compat)
const validOld = (overrides = {}) => ({
  lang: 'zh',
  type: 'word',
  front: { text: '你好', reading: 'nǐ hǎo' },
  back: { translation: 'Hello', notes: 'Common greeting' },
  example: { text: '你好吗', reading: 'nǐ hǎo ma', translation: 'How are you?' },
  ...overrides,
});

const batch = (cards) => JSON.stringify({ cards });

// --- normalizeCard ---

describe('normalizeCard', () => {
  it('returns flat card unchanged', () => {
    const card = valid()
    expect(normalizeCard(card)).toEqual(card)
  })

  it('migrates old front/back schema to flat', () => {
    const result = normalizeCard(validOld())
    expect(result.text).toBe('你好')
    expect(result.reading).toBe('nǐ hǎo')
    expect(result.translation).toBe('Hello')
    expect(result.notes).toBe('Common greeting')
    expect(result.front).toBeUndefined()
    expect(result.back).toBeUndefined()
  })
})

// --- invalid JSON ---

describe('invalid JSON string', () => {
  it('returns empty cards and a parse error', () => {
    const result = parseCardBatch('not json');
    expect(result.cards).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/Invalid JSON/i);
  });

  it('handles empty string', () => {
    const result = parseCardBatch('');
    expect(result.cards).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });
});

// --- missing cards array ---

describe('missing cards array', () => {
  it('returns error when top-level is not an object with cards', () => {
    const result = parseCardBatch(JSON.stringify([{ lang: 'zh' }]));
    expect(result.cards).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it('returns error when cards key is missing', () => {
    const result = parseCardBatch(JSON.stringify({ items: [] }));
    expect(result.cards).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });
});

// --- required field validation ---

describe('missing required fields', () => {
  it('skips card missing lang and reports error', () => {
    const result = parseCardBatch(batch([{ text: '你好', translation: 'Hello' }]));
    expect(result.cards).toHaveLength(0);
    expect(result.errors[0]).toMatch(/lang/);
  });

  it('skips card missing text and reports error', () => {
    const result = parseCardBatch(batch([{ lang: 'zh', translation: 'Hello' }]));
    expect(result.cards).toHaveLength(0);
    expect(result.errors[0]).toMatch(/text/);
  });

  it('skips card missing translation and reports error', () => {
    const result = parseCardBatch(batch([{ lang: 'zh', text: '你好' }]));
    expect(result.cards).toHaveLength(0);
    expect(result.errors[0]).toMatch(/translation/);
  });

  it('reports all missing fields in one error', () => {
    const result = parseCardBatch(batch([{}]));
    expect(result.errors[0]).toMatch(/lang/);
    expect(result.errors[0]).toMatch(/text/);
    expect(result.errors[0]).toMatch(/translation/);
  });
});

// --- valid cards (new flat schema) ---

describe('valid JSON (flat schema)', () => {
  it('returns correct card array with empty errors', () => {
    const result = parseCardBatch(batch([valid()]));
    expect(result.cards).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it('preserves required fields', () => {
    const result = parseCardBatch(batch([valid()]));
    const card = result.cards[0];
    expect(card.lang).toBe('zh');
    expect(card.text).toBe('你好');
    expect(card.translation).toBe('Hello');
  });
});

// --- backward compat: old front/back schema ---

describe('backward compat (old front/back schema)', () => {
  it('parses old schema and returns flat card', () => {
    const result = parseCardBatch(batch([validOld()]));
    expect(result.cards).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    const card = result.cards[0]
    expect(card.text).toBe('你好')
    expect(card.translation).toBe('Hello')
    expect(card.front).toBeUndefined()
    expect(card.back).toBeUndefined()
  })

  it('preserves optional fields from old schema', () => {
    const result = parseCardBatch(batch([validOld()]));
    const card = result.cards[0]
    expect(card.reading).toBe('nǐ hǎo')
    expect(card.notes).toBe('Common greeting')
    expect(card.type).toBe('word')
    expect(card.example.text).toBe('你好吗')
  })

  it('skips old-schema card missing front.text', () => {
    const result = parseCardBatch(batch([{ lang: 'zh', front: {}, back: { translation: 'Hello' } }]));
    expect(result.cards).toHaveLength(0);
    expect(result.errors[0]).toMatch(/text/);
  });
})

// --- optional fields ---

describe('optional fields', () => {
  it('card without optional fields returns without them, no error', () => {
    const minimal = { lang: 'zh', text: '你好', translation: 'Hello' };
    const result = parseCardBatch(batch([minimal]));
    expect(result.cards).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    const card = result.cards[0];
    expect(card.type).toBeUndefined();
    expect(card.reading).toBeUndefined();
    expect(card.romanization).toBeUndefined();
    expect(card.notes).toBeUndefined();
    expect(card.example).toBeUndefined();
  });

  it('preserves type when present', () => {
    const result = parseCardBatch(batch([valid()]));
    expect(result.cards[0].type).toBe('word');
  });

  it('preserves reading when present', () => {
    const result = parseCardBatch(batch([valid()]));
    expect(result.cards[0].reading).toBe('nǐ hǎo');
  });

  it('preserves romanization when present', () => {
    const result = parseCardBatch(batch([valid({ romanization: 'ni hao' })]));
    expect(result.cards[0].romanization).toBe('ni hao');
  });

  it('romanization is independent of reading — card can have both', () => {
    const card = valid({ reading: 'nǐ hǎo', romanization: 'ni hao' });
    const result = parseCardBatch(batch([card]));
    expect(result.cards[0].reading).toBe('nǐ hǎo');
    expect(result.cards[0].romanization).toBe('ni hao');
  });

  it('preserves notes when present', () => {
    const result = parseCardBatch(batch([valid()]));
    expect(result.cards[0].notes).toBe('Common greeting');
  });

  it('preserves example fields when present', () => {
    const result = parseCardBatch(batch([valid()]));
    const ex = result.cards[0].example;
    expect(ex.text).toBe('你好吗');
    expect(ex.reading).toBe('nǐ hǎo ma');
    expect(ex.translation).toBe('How are you?');
  });
});

// --- mixed valid/invalid ---

describe('mixed valid and invalid cards', () => {
  it('returns valid cards and skips invalid ones', () => {
    const cards = [
      valid(),
      { lang: 'ja', translation: 'test' }, // missing text
      valid({ lang: 'ja', text: 'こんにちは', translation: 'Hello' }),
    ];
    const result = parseCardBatch(batch(cards));
    expect(result.cards).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
  });

  it('error message includes 1-based card index', () => {
    const cards = [valid(), { text: 'x', translation: 'x' }];
    const result = parseCardBatch(batch(cards));
    expect(result.errors[0]).toMatch(/Card 2/);
  });

  it('skip count equals errors length', () => {
    const cards = [
      valid(),
      {},
      {},
      valid({ lang: 'ja', text: 'A', translation: 'B' }),
    ];
    const result = parseCardBatch(batch(cards));
    expect(result.cards).toHaveLength(2);
    expect(result.errors).toHaveLength(2);
  });
});
