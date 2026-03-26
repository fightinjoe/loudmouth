import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import Dexie from 'dexie';
import {
  getOrCreateAllDeck, createDeck, getDecks, getCards, importCards,
  updateDeckMode, updateDeckAccessTime, getRecentDecks, restoreAllData, createDb,
} from '../db.js';

let store;

beforeEach(async () => {
  const idb = new IDBFactory();
  store = createDb({ indexedDB: idb, IDBKeyRange });
  await store.open();
});

// --- getOrCreateAllDeck ---

describe('getOrCreateAllDeck', () => {
  it('creates the all-zh deck on first call', async () => {
    const deck = await getOrCreateAllDeck('zh', store);
    expect(deck.id).toBe('all-zh');
    expect(deck.lang).toBe('zh');
    expect(deck.system).toBe(true);
  });

  it('returns the same deck on second call (no duplicates)', async () => {
    await getOrCreateAllDeck('zh', store);
    await getOrCreateAllDeck('zh', store);
    const all = await store.decks.where('id').equals('all-zh').toArray();
    expect(all).toHaveLength(1);
  });

  it('creates separate decks per language', async () => {
    await getOrCreateAllDeck('zh', store);
    await getOrCreateAllDeck('ja', store);
    const all = await store.decks.toArray();
    expect(all).toHaveLength(2);
  });

  it('sets default mode on system deck', async () => {
    const deck = await getOrCreateAllDeck('zh', store);
    expect(deck.mode).toBe('comprehension');
  });
});

// --- createDeck ---

describe('createDeck', () => {
  it('creates a deck with padded counter and slug', async () => {
    const deck = await createDeck('Restaurant Words', 'zh', store);
    expect(deck.id).toBe('001-restaurant-words');
    expect(deck.name).toBe('Restaurant Words');
    expect(deck.lang).toBe('zh');
    expect(deck.system).toBe(false);
  });

  it('increments counter across calls', async () => {
    const d1 = await createDeck('Alpha', 'zh', store);
    const d2 = await createDeck('Beta', 'ja', store);
    expect(d1.id).toBe('001-alpha');
    expect(d2.id).toBe('002-beta');
  });

  it('sets default mode on created deck', async () => {
    const deck = await createDeck('My Deck', 'zh', store);
    expect(deck.mode).toBe('comprehension');
  });
});

// --- getDecks ---

describe('getDecks', () => {
  it('excludes system decks by default', async () => {
    await getOrCreateAllDeck('zh', store);
    await createDeck('My Deck', 'zh', store);
    const decks = await getDecks('zh', {}, store);
    expect(decks).toHaveLength(1);
    expect(decks[0].id).toBe('001-my-deck');
  });

  it('includes system decks when requested', async () => {
    await getOrCreateAllDeck('zh', store);
    await createDeck('My Deck', 'zh', store);
    const decks = await getDecks('zh', { includeSystem: true }, store);
    expect(decks).toHaveLength(2);
  });

  it('filters by language', async () => {
    await createDeck('ZH Deck', 'zh', store);
    await createDeck('JA Deck', 'ja', store);
    const zh = await getDecks('zh', {}, store);
    expect(zh).toHaveLength(1);
    expect(zh[0].lang).toBe('zh');
  });
});

// --- updateDeckMode ---

describe('updateDeckMode', () => {
  it('updates deck mode', async () => {
    const deck = await createDeck('My Deck', 'zh', store);
    await updateDeckMode(deck.id, 'reverse', store);
    const updated = await store.decks.get(deck.id);
    expect(updated.mode).toBe('reverse');
  });
});

// --- updateDeckAccessTime ---

describe('updateDeckAccessTime', () => {
  it('stores an ISO 8601 timestamp on the deck record', async () => {
    const deck = await createDeck('My Deck', 'zh', store);
    await updateDeckAccessTime(deck.id, store);
    const updated = await store.decks.get(deck.id);
    expect(updated.lastAccessedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// --- getRecentDecks ---

describe('getRecentDecks', () => {
  it('returns n decks sorted by lastAccessedAt newest first', async () => {
    const d1 = await createDeck('Alpha', 'zh', store);
    const d2 = await createDeck('Beta', 'zh', store);
    const d3 = await createDeck('Gamma', 'zh', store);
    await store.decks.update(d1.id, { lastAccessedAt: '2026-01-01T00:00:00.000Z' });
    await store.decks.update(d2.id, { lastAccessedAt: '2026-03-01T00:00:00.000Z' });
    await store.decks.update(d3.id, { lastAccessedAt: '2026-02-01T00:00:00.000Z' });
    const recent = await getRecentDecks(2, store);
    expect(recent).toHaveLength(2);
    expect(recent[0].id).toBe(d2.id);
    expect(recent[1].id).toBe(d3.id);
  });

  it('falls back to createdAt when lastAccessedAt is absent', async () => {
    const d1 = await createDeck('Older', 'zh', store);
    // small delay to ensure different createdAt
    await new Promise(r => setTimeout(r, 2));
    const d2 = await createDeck('Newer', 'zh', store);
    const recent = await getRecentDecks(1, store);
    expect(recent[0].id).toBe(d2.id);
  });

  it('decks without lastAccessedAt are valid (null is acceptable)', async () => {
    const deck = await createDeck('No Access', 'zh', store);
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

  it('assigns only the all deck when no secondary deck given', async () => {
    await importCards([sampleCard], null, store);
    const cards = await store.cards.toArray();
    expect(cards).toHaveLength(1);
    expect(cards[0].deckIds).toEqual(['all-zh']);
  });

  it('assigns both all deck and secondary deck', async () => {
    const deck = await createDeck('Greetings', 'zh', store);
    await importCards([sampleCard], deck.id, store);
    const cards = await store.cards.toArray();
    expect(cards[0].deckIds).toContain('all-zh');
    expect(cards[0].deckIds).toContain(deck.id);
  });

  it('auto-creates the all deck if not yet existing', async () => {
    await importCards([sampleCard], null, store);
    const allDeck = await store.decks.get('all-zh');
    expect(allDeck).toBeDefined();
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
    const deck1 = await createDeck('Deck A', 'zh', store);
    const deck2 = await createDeck('Deck B', 'zh', store);
    await importCards([{ lang: 'zh', type: 'word', text: 'A', translation: 'a' }], deck1.id, store);
    await importCards([{ lang: 'zh', type: 'word', text: 'B', translation: 'b' }], deck2.id, store);

    const cards = await getCards(deck1.id, store);
    expect(cards).toHaveLength(1);
    expect(cards[0].text).toBe('A');
  });

  it('returns all-deck cards', async () => {
    await importCards([{ lang: 'zh', type: 'word', text: 'A', translation: 'a' }], null, store);
    const cards = await getCards('all-zh', store);
    expect(cards).toHaveLength(1);
  });
});

// --- restoreAllData migration ---

describe('restoreAllData', () => {
  it('normalizes old-schema cards on restore', async () => {
    const oldCards = [
      {
        id: 'test-id-1',
        lang: 'zh',
        createdAt: '2026-01-01T00:00:00.000Z',
        deckIds: ['all-zh'],
        front: { text: '你好', reading: 'nǐ hǎo' },
        back: { translation: 'Hello', notes: 'greeting' },
      }
    ]
    await restoreAllData({ cards: oldCards, decks: [] }, store)
    const cards = await store.cards.toArray()
    expect(cards).toHaveLength(1)
    expect(cards[0].text).toBe('你好')
    expect(cards[0].reading).toBe('nǐ hǎo')
    expect(cards[0].translation).toBe('Hello')
    expect(cards[0].notes).toBe('greeting')
    expect(cards[0].front).toBeUndefined()
    expect(cards[0].back).toBeUndefined()
  })

  it('preserves flat-schema cards on restore', async () => {
    const flatCards = [
      {
        id: 'test-id-2',
        lang: 'zh',
        createdAt: '2026-01-01T00:00:00.000Z',
        deckIds: ['all-zh'],
        text: '谢谢',
        translation: 'Thank you',
      }
    ]
    await restoreAllData({ cards: flatCards, decks: [] }, store)
    const cards = await store.cards.toArray()
    expect(cards[0].text).toBe('谢谢')
    expect(cards[0].translation).toBe('Thank you')
  })
})
