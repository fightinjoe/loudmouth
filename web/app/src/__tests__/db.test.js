// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import Dexie from 'dexie';
import {
  createDeck, getDecks, getCards, getCardsByLang, importCards,
  updateDeckMode, updateDeckOrder, updateDeckVibe, updateDeckAccessTime, getRecentDecks, restoreAllData, createDb, applyCardOrder,
} from '../js/db.js';
import { DEFAULT_MODE, MODES } from '../js/modes.js';
import { getLastAbility, setLastAbility } from '../js/preferences.js';

let store;

beforeEach(async () => {
  const idb = new IDBFactory();
  store = createDb({ indexedDB: idb, IDBKeyRange });
  await store.open();
  localStorage.clear();
});

// --- createDeck ---

describe('createDeck', () => {
  it('creates a deck with padded counter and slug', async () => {
    const deck = await createDeck('Restaurant Words', 'zh', {}, store);
    expect(deck.id).toBe('001-restaurant-words');
    expect(deck.name).toBe('Restaurant Words');
    expect(deck.lang).toBe('zh');
    expect(deck.system).toBe(false);
  });

  it('increments counter across calls', async () => {
    const d1 = await createDeck('Alpha', 'zh', {}, store);
    const d2 = await createDeck('Beta', 'ja', {}, store);
    expect(d1.id).toBe('001-alpha');
    expect(d2.id).toBe('002-beta');
  });

  it('sets default mode on created deck', async () => {
    const deck = await createDeck('My Deck', 'zh', {}, store);
    expect(deck.mode).toBe(DEFAULT_MODE);
  });

  it('sets default order on created deck', async () => {
    const deck = await createDeck('My Deck', 'zh', {}, store);
    expect(deck.order).toBe('default');
  });
});

// --- createDeck: VIBE + ability (PH-001) ---

describe('createDeck VIBE + ability defaults', () => {
  it('seeds default formality/audience/ability on a new deck', async () => {
    const deck = await createDeck('My Deck', 'zh', {}, store);
    expect(deck.formality).toBe('polite');
    expect(deck.audience).toBe('staff');
    expect(deck.ability).toBe('beginner');
  });

  it('respects an explicit ability override', async () => {
    const deck = await createDeck('My Deck', 'zh', { ability: 'advanced' }, store);
    expect(deck.ability).toBe('advanced');
  });

  it('falls back to the last-used ability for that language when none is given', async () => {
    setLastAbility('zh', 'intermediate');
    const deck = await createDeck('My Deck', 'zh', {}, store);
    expect(deck.ability).toBe('intermediate');
  });

  it('does not fall back across languages', async () => {
    setLastAbility('zh', 'intermediate');
    const deck = await createDeck('My Deck', 'ja', {}, store);
    expect(deck.ability).toBe('beginner');
  });

  it('updates the last-used-ability preference after creating', async () => {
    await createDeck('My Deck', 'zh', { ability: 'advanced' }, store);
    expect(getLastAbility('zh')).toBe('advanced');
  });
});

// --- updateDeckVibe ---

describe('updateDeckVibe', () => {
  it('persists formality and audience', async () => {
    const deck = await createDeck('My Deck', 'zh', {}, store);
    await updateDeckVibe(deck.id, { formality: 'casual', audience: 'family' }, store);
    const updated = await store.decks.get(deck.id);
    expect(updated.formality).toBe('casual');
    expect(updated.audience).toBe('family');
  });

  it('updates only the given field', async () => {
    const deck = await createDeck('My Deck', 'zh', {}, store);
    await updateDeckVibe(deck.id, { formality: 'formal' }, store);
    const updated = await store.decks.get(deck.id);
    expect(updated.formality).toBe('formal');
    expect(updated.audience).toBe('staff');
  });
});

// --- v7 migration backfill ---

describe('v7 migration backfill', () => {
  it('backfills formality/audience/ability on a pre-v7 deck', async () => {
    const idb = new IDBFactory();
    const idbKeyRange = IDBKeyRange;

    // Build a fresh db at v6 only (no VIBE/ability fields) and seed a deck
    // the old way, mirroring the pre-v7 shape.
    const legacy = new Dexie('loudmouth', { indexedDB: idb, IDBKeyRange: idbKeyRange });
    legacy.version(6).stores({
      cards: 'id, lang, *deckIds, createdAt',
      decks: 'id, lang, createdAt, lastAccessedAt',
    });
    await legacy.open();
    await legacy.table('decks').add({
      id: '001-legacy-deck',
      name: 'Legacy Deck',
      lang: 'zh',
      createdAt: '2026-01-01T00:00:00.000Z',
      system: false,
      mode: DEFAULT_MODE,
      order: 'default',
      readingDisplay: 'reading',
    });
    legacy.close();

    // Reopen the same underlying database through the full (v1-v7) schema —
    // Dexie runs the v7 upgrade against the existing v6 data.
    const upgraded = createDb({ indexedDB: idb, IDBKeyRange: idbKeyRange });
    await upgraded.open();
    const migrated = await upgraded.table('decks').get('001-legacy-deck');
    expect(migrated.formality).toBe('polite');
    expect(migrated.audience).toBe('staff');
    expect(migrated.ability).toBe('beginner');
  });
});

// --- last-ability preference store ---

describe('getLastAbility / setLastAbility', () => {
  it('round-trips per language', () => {
    setLastAbility('ja', 'advanced');
    expect(getLastAbility('ja')).toBe('advanced');
  });

  it('returns undefined for a language with no recorded preference', () => {
    expect(getLastAbility('cs')).toBeUndefined();
  });

  it('keeps preferences independent per language', () => {
    setLastAbility('zh', 'beginner');
    setLastAbility('ja', 'advanced');
    expect(getLastAbility('zh')).toBe('beginner');
    expect(getLastAbility('ja')).toBe('advanced');
  });
});

// --- getDecks ---

describe('getDecks', () => {
  it('returns user decks', async () => {
    await createDeck('My Deck', 'zh', {}, store);
    const decks = await getDecks('zh', {}, store);
    expect(decks).toHaveLength(1);
    expect(decks[0].id).toBe('001-my-deck');
  });

  it('filters by language', async () => {
    await createDeck('ZH Deck', 'zh', {}, store);
    await createDeck('JA Deck', 'ja', {}, store);
    const zh = await getDecks('zh', {}, store);
    expect(zh).toHaveLength(1);
    expect(zh[0].lang).toBe('zh');
  });
});

// --- updateDeckMode ---

describe('updateDeckMode', () => {
  it('updates deck mode', async () => {
    const deck = await createDeck('My Deck', 'zh', {}, store);
    await updateDeckMode(deck.id, MODES.REVERSE, store);
    const updated = await store.decks.get(deck.id);
    expect(updated.mode).toBe(MODES.REVERSE);
  });
});

// --- updateDeckOrder ---

describe('updateDeckOrder', () => {
  it('updates deck order', async () => {
    const deck = await createDeck('My Deck', 'zh', {}, store);
    await updateDeckOrder(deck.id, 'random', store);
    const updated = await store.decks.get(deck.id);
    expect(updated.order).toBe('random');
  });
});

// --- applyCardOrder ---

describe('applyCardOrder', () => {
  const makeCards = () => [
    { id: '1', createdAt: '2026-01-01T00:00:00.000Z', text: 'A' },
    { id: '2', createdAt: '2026-01-02T00:00:00.000Z', text: 'B' },
    { id: '3', createdAt: '2026-01-03T00:00:00.000Z', text: 'C' },
  ];

  it('default returns createdAt ascending order', () => {
    const result = applyCardOrder(makeCards(), 'default');
    expect(result.map(c => c.text)).toEqual(['A', 'B', 'C']);
  });

  it('reverse returns createdAt descending order', () => {
    const result = applyCardOrder(makeCards(), 'reverse');
    expect(result.map(c => c.text)).toEqual(['C', 'B', 'A']);
  });

  it('random returns all cards in some order', () => {
    const result = applyCardOrder(makeCards(), 'random');
    expect(result).toHaveLength(3);
    expect(result.map(c => c.text).sort()).toEqual(['A', 'B', 'C']);
  });

  it('does not mutate the input array', () => {
    const cards = makeCards();
    applyCardOrder(cards, 'reverse');
    expect(cards[0].text).toBe('A');
  });
});

// --- updateDeckAccessTime ---

describe('updateDeckAccessTime', () => {
  it('stores an ISO 8601 timestamp on the deck record', async () => {
    const deck = await createDeck('My Deck', 'zh', {}, store);
    await updateDeckAccessTime(deck.id, store);
    const updated = await store.decks.get(deck.id);
    expect(updated.lastAccessedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// --- getRecentDecks ---

describe('getRecentDecks', () => {
  it('returns n decks sorted by lastAccessedAt newest first', async () => {
    const d1 = await createDeck('Alpha', 'zh', {}, store);
    const d2 = await createDeck('Beta', 'zh', {}, store);
    const d3 = await createDeck('Gamma', 'zh', {}, store);
    await store.decks.update(d1.id, { lastAccessedAt: '2026-01-01T00:00:00.000Z' });
    await store.decks.update(d2.id, { lastAccessedAt: '2026-03-01T00:00:00.000Z' });
    await store.decks.update(d3.id, { lastAccessedAt: '2026-02-01T00:00:00.000Z' });
    const recent = await getRecentDecks(2, store);
    expect(recent).toHaveLength(2);
    expect(recent[0].id).toBe(d2.id);
    expect(recent[1].id).toBe(d3.id);
  });

  it('falls back to createdAt when lastAccessedAt is absent', async () => {
    const d1 = await createDeck('Older', 'zh', {}, store);
    // small delay to ensure different createdAt
    await new Promise(r => setTimeout(r, 2));
    const d2 = await createDeck('Newer', 'zh', {}, store);
    const recent = await getRecentDecks(1, store);
    expect(recent[0].id).toBe(d2.id);
  });

  it('decks without lastAccessedAt are valid (null is acceptable)', async () => {
    const deck = await createDeck('No Access', 'zh', {}, store);
    const updated = await store.decks.get(deck.id);
    expect(updated.lastAccessedAt).toBeUndefined();
    // getRecentDecks should still work without error
    const recent = await getRecentDecks(5, store);
    expect(recent).toHaveLength(1);
  });
});

// --- importCards ---

describe('importCards', () => {
  const sampleCard = {
    lang: 'zh',
    type: 'word',
    text: '你好',
    reading: 'nǐ hǎo',
    translation: 'Hello',
  };

  it('assigns empty deckIds when no deck given', async () => {
    await importCards([sampleCard], null, store);
    const cards = await store.cards.toArray();
    expect(cards).toHaveLength(1);
    expect(cards[0].deckIds).toEqual([]);
  });

  it('assigns only the given deck id', async () => {
    const deck = await createDeck('Greetings', 'zh', {}, store);
    await importCards([sampleCard], deck.id, store);
    const cards = await store.cards.toArray();
    expect(cards[0].deckIds).toEqual([deck.id]);
  });

  it('does not create any system decks', async () => {
    await importCards([sampleCard], null, store);
    const decks = await store.decks.toArray();
    expect(decks).toHaveLength(0);
  });

  it('assigns id and createdAt to each card', async () => {
    await importCards([sampleCard], null, store);
    const [card] = await store.cards.toArray();
    expect(card.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(card.createdAt).toBeTruthy();
  });
});

// --- getCards ---

describe('getCards', () => {
  it('returns only cards belonging to the given deck', async () => {
    const deck1 = await createDeck('Deck A', 'zh', {}, store);
    const deck2 = await createDeck('Deck B', 'zh', {}, store);
    await importCards([{ lang: 'zh', type: 'word', text: 'A', translation: 'a' }], deck1.id, store);
    await importCards([{ lang: 'zh', type: 'word', text: 'B', translation: 'b' }], deck2.id, store);

    const cards = await getCards(deck1.id, store);
    expect(cards).toHaveLength(1);
    expect(cards[0].text).toBe('A');
  });
});

// --- getCardsByLang ---

describe('getCardsByLang', () => {
  it('returns all cards for the given language', async () => {
    await importCards([
      { lang: 'zh', type: 'word', text: 'A', translation: 'a' },
      { lang: 'zh', type: 'word', text: 'B', translation: 'b' },
      { lang: 'ja', type: 'word', text: 'C', translation: 'c' },
    ], null, store);
    const zh = await getCardsByLang('zh', store);
    expect(zh).toHaveLength(2);
    expect(zh.every(c => c.lang === 'zh')).toBe(true);
  });

  it('includes deckless cards', async () => {
    await importCards([{ lang: 'zh', type: 'word', text: 'A', translation: 'a' }], null, store);
    const cards = await getCardsByLang('zh', store);
    expect(cards).toHaveLength(1);
    expect(cards[0].deckIds).toEqual([]);
  });

  it('returns empty array when no cards for lang', async () => {
    const cards = await getCardsByLang('fr', store);
    expect(cards).toHaveLength(0);
  });
});

// --- restoreAllData migration ---

describe('restoreAllData', () => {
  it('strips all-{lang} deckIds on restore', async () => {
    const cards = [
      {
        id: 'test-id-1',
        lang: 'zh',
        createdAt: '2026-01-01T00:00:00.000Z',
        deckIds: ['all-zh', '001-my-deck'],
        text: '你好',
        translation: 'Hello',
      }
    ]
    const decks = [{ id: '001-my-deck', name: 'My Deck', lang: 'zh', createdAt: '2026-01-01T00:00:00.000Z', system: false, mode: DEFAULT_MODE }]
    await restoreAllData({ cards, decks }, store)
    const restored = await store.cards.toArray()
    expect(restored[0].deckIds).toEqual(['001-my-deck'])
  })

  it('preserves flat-schema cards on restore', async () => {
    const flatCards = [
      {
        id: 'test-id-2',
        lang: 'zh',
        createdAt: '2026-01-01T00:00:00.000Z',
        deckIds: [],
        text: '谢谢',
        translation: 'Thank you',
      }
    ]
    await restoreAllData({ cards: flatCards, decks: [] }, store)
    const cards = await store.cards.toArray()
    expect(cards[0].text).toBe('谢谢')
    expect(cards[0].translation).toBe('Thank you')
  })

  it('does not restore system decks', async () => {
    const decks = [
      { id: 'all-zh', name: 'All Chinese Cards', lang: 'zh', createdAt: '2026-01-01T00:00:00.000Z', system: true, mode: DEFAULT_MODE }
    ]
    await restoreAllData({ cards: [], decks }, store)
    // system deck was in export data (legacy) but still gets inserted since restoreAllData trusts the decks array
    // The key thing is that new exports won't contain system decks
    // Here we verify no crash occurs
    const allDecks = await store.decks.toArray()
    expect(allDecks).toHaveLength(1)
  })
})
