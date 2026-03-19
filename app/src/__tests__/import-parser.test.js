import { describe, it, expect } from 'vitest';
import { parseCardBatch } from '../import-parser.js';

const valid = (overrides = {}) => ({
  lang: 'zh',
  type: 'word',
  front: { text: '你好', reading: 'nǐ hǎo' },
  back: { translation: 'Hello', notes: 'Common greeting' },
  example: { text: '你好吗', reading: 'nǐ hǎo ma', translation: 'How are you?' },
  ...overrides,
});

const batch = (cards) => JSON.stringify({ cards });

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
    const result = parseCardBatch(batch([{ front: { text: '你好' }, back: { translation: 'Hello' } }]));
    expect(result.cards).toHaveLength(0);
    expect(result.errors[0]).toMatch(/lang/);
  });

  it('skips card missing front.text and reports error', () => {
    const result = parseCardBatch(batch([{ lang: 'zh', front: {}, back: { translation: 'Hello' } }]));
    expect(result.cards).toHaveLength(0);
    expect(result.errors[0]).toMatch(/front\.text/);
  });

  it('skips card missing back.translation and reports error', () => {
    const result = parseCardBatch(batch([{ lang: 'zh', front: { text: '你好' }, back: {} }]));
    expect(result.cards).toHaveLength(0);
    expect(result.errors[0]).toMatch(/back\.translation/);
  });

  it('reports all missing fields in one error', () => {
    const result = parseCardBatch(batch([{}]));
    expect(result.errors[0]).toMatch(/lang/);
    expect(result.errors[0]).toMatch(/front\.text/);
    expect(result.errors[0]).toMatch(/back\.translation/);
  });
});

// --- valid cards ---

describe('valid JSON', () => {
  it('returns correct card array with empty errors', () => {
    const result = parseCardBatch(batch([valid()]));
    expect(result.cards).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it('preserves required fields', () => {
    const result = parseCardBatch(batch([valid()]));
    const card = result.cards[0];
    expect(card.lang).toBe('zh');
    expect(card.front.text).toBe('你好');
    expect(card.back.translation).toBe('Hello');
  });
});

// --- optional fields ---

describe('optional fields', () => {
  it('card without optional fields returns without them, no error', () => {
    const minimal = { lang: 'zh', front: { text: '你好' }, back: { translation: 'Hello' } };
    const result = parseCardBatch(batch([minimal]));
    expect(result.cards).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    const card = result.cards[0];
    expect(card.type).toBeUndefined();
    expect(card.front.reading).toBeUndefined();
    expect(card.back.notes).toBeUndefined();
    expect(card.example).toBeUndefined();
  });

  it('preserves type when present', () => {
    const result = parseCardBatch(batch([valid()]));
    expect(result.cards[0].type).toBe('word');
  });

  it('preserves front.reading when present', () => {
    const result = parseCardBatch(batch([valid()]));
    expect(result.cards[0].front.reading).toBe('nǐ hǎo');
  });

  it('preserves back.notes when present', () => {
    const result = parseCardBatch(batch([valid()]));
    expect(result.cards[0].back.notes).toBe('Common greeting');
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
      { lang: 'ja', front: {}, back: { translation: 'test' } }, // missing front.text
      valid({ lang: 'ja', front: { text: 'こんにちは' }, back: { translation: 'Hello' } }),
    ];
    const result = parseCardBatch(batch(cards));
    expect(result.cards).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
  });

  it('error message includes 1-based card index', () => {
    const cards = [valid(), { front: { text: 'x' }, back: { translation: 'x' } }];
    const result = parseCardBatch(batch(cards));
    expect(result.errors[0]).toMatch(/Card 2/);
  });

  it('skip count equals errors length', () => {
    const cards = [
      valid(),
      {},
      {},
      valid({ lang: 'ja', front: { text: 'A' }, back: { translation: 'B' } }),
    ];
    const result = parseCardBatch(batch(cards));
    expect(result.cards).toHaveLength(2);
    expect(result.errors).toHaveLength(2);
  });
});
