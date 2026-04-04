import Dexie from 'dexie';
import { normalizeCard } from './import-parser.js';
import { DEFAULT_MODE, MODES } from './modes.js';

function createDb(options = {}) {
  const instance = new Dexie('loudmouth', options);
  instance.version(1).stores({
    cards: 'id, lang, *deckIds, createdAt',
    decks: 'id, lang, createdAt',
  });
  instance.version(2).stores({
    cards: 'id, lang, *deckIds, createdAt',
    decks: 'id, lang, createdAt',
  }).upgrade(tx => {
    return tx.cards.toCollection().modify(card => {
      if (!card.text) {
        const normalized = normalizeCard(card)
        Object.assign(card, normalized)
      }
    })
  });
  instance.version(3).stores({
    cards: 'id, lang, *deckIds, createdAt',
    decks: 'id, lang, createdAt, lastAccessedAt',
  }).upgrade(tx => {
    const modeMap = {
      'target-lang': 'comprehension',
      'reading': 'comprehension',
      'native-lang': 'reverse',
    };
    return tx.decks.toCollection().modify(deck => {
      if (modeMap[deck.mode]) {
        deck.mode = modeMap[deck.mode];
      }
    });
  });
  instance.version(4).stores({
    cards: 'id, lang, *deckIds, createdAt',
    decks: 'id, lang, createdAt, lastAccessedAt',
  }).upgrade(async tx => {
    await tx.table('cards').toCollection().modify(card => {
      card.deckIds = (card.deckIds || []).filter(id => !id.startsWith('all-'));
    });
    const systemDecks = await tx.table('decks').filter(d => d.system).toArray();
    for (const d of systemDecks) {
      await tx.table('decks').delete(d.id);
    }
  });
  instance.version(5).stores({
    cards: 'id, lang, *deckIds, createdAt',
    decks: 'id, lang, createdAt, lastAccessedAt',
  }).upgrade(tx => {
    return tx.table('decks').toCollection().modify(deck => {
      if (!deck.order) deck.order = 'default';
    });
  });
  instance.version(6).stores({
    cards: 'id, lang, *deckIds, createdAt',
    decks: 'id, lang, createdAt, lastAccessedAt',
  }).upgrade(tx => {
    return tx.table('decks').toCollection().modify(deck => {
      if (!deck.readingDisplay) deck.readingDisplay = 'reading';
    });
  });
  return instance;
}

// Singleton for production use
export const db = createDb();

// --- helpers ---

function uuid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

function isoNow() {
  return new Date().toISOString();
}

function slugify(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/**
 * Returns the next zero-padded deck counter string (e.g. '003').
 */
async function nextDeckCounter(store) {
  const userDecks = await store.decks.filter(d => !d.system).toArray();
  if (userDecks.length === 0) return '001';
  const max = userDecks.reduce((m, d) => {
    const n = parseInt(d.id.split('-')[0], 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return String(max + 1).padStart(3, '0');
}

/**
 * Creates a user deck with an ID like '001-restaurant-words'.
 */
export async function createDeck(name, lang, store = db) {
  const counter = await nextDeckCounter(store);
  const id = `${counter}-${slugify(name)}`;
  const deck = { id, name, lang, createdAt: isoNow(), system: false, mode: DEFAULT_MODE, order: 'default', readingDisplay: 'reading' };
  await store.decks.add(deck);
  return deck;
}

/**
 * Updates the study mode for a deck.
 */
export async function updateDeckMode(deckId, mode, store = db) {
  await store.decks.update(deckId, { mode });
}

/**
 * Updates the card order setting for a deck ('default', 'random', or 'reverse').
 */
export async function updateDeckOrder(deckId, order, store = db) {
  await store.decks.update(deckId, { order });
}

export async function updateDeckName(deckId, name, store = db) {
  await store.decks.update(deckId, { name });
}

/**
 * Updates the reading display setting for a deck ('reading' or 'romanization').
 */
export async function updateDeckReadingDisplay(deckId, readingDisplay, store = db) {
  await store.decks.update(deckId, { readingDisplay });
}

/**
 * Stamps the current time as lastAccessedAt on the given deck.
 */
export async function updateDeckAccessTime(deckId, store = db) {
  await store.decks.update(deckId, { lastAccessedAt: isoNow() });
}

/**
 * Returns the n most recently accessed decks, sorted newest first.
 * Falls back to createdAt for decks without lastAccessedAt.
 */
export async function getRecentDecks(n, store = db) {
  const all = await store.decks.toArray();
  return all
    .sort((a, b) => {
      const ta = a.lastAccessedAt ?? a.createdAt;
      const tb = b.lastAccessedAt ?? b.createdAt;
      return tb < ta ? -1 : tb > ta ? 1 : 0;
    })
    .slice(0, n);
}

/**
 * Returns decks for the given language.
 * By default excludes system decks (for import dropdown).
 */
export async function getDecks(lang, { includeSystem = false } = {}, store = db) {
  let col = lang ? store.decks.where('lang').equals(lang) : store.decks.toCollection();
  const results = await col.toArray();
  return includeSystem ? results : results.filter(d => !d.system);
}

/**
 * Returns all cards belonging to the given deck.
 */
export async function getCards(deckId, store = db) {
  return store.cards.where('deckIds').equals(deckId).toArray();
}

/**
 * Returns all cards for the given language, regardless of deck.
 */
export async function getCardsByLang(lang, store = db) {
  return store.cards.where('lang').equals(lang).toArray();
}

/**
 * Applies a deck's order setting to an array of cards.
 * 'default' preserves createdAt insertion order, 'reverse' reverses it, 'random' shuffles.
 */
export function applyCardOrder(cards, order) {
  const sorted = [...cards].sort((a, b) => {
    if (a.createdAt < b.createdAt) return -1;
    if (a.createdAt > b.createdAt) return 1;
    return (a.importIndex ?? 0) - (b.importIndex ?? 0);
  });
  if (order === 'reverse') return sorted.reverse();
  if (order === 'random') {
    for (let i = sorted.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    }
    return sorted;
  }
  return sorted;
}

/**
 * Imports an array of parsed card objects into the DB.
 */
export async function importCards(cards, deckId = null, store = db) {
  const now = isoNow();
  for (let i = 0; i < cards.length; i++) {
    await store.cards.add({
      id: uuid(),
      createdAt: now,
      importIndex: i,
      ...cards[i],
      deckIds: deckId ? [deckId] : [],
    });
  }
}

/**
 * Returns distinct lang values that have at least one card.
 */
export async function getLangs(store = db) {
  const cards = await store.cards.toArray();
  return [...new Set(cards.map(c => c.lang))].sort();
}

/**
 * Removes a deckId from a card's deckIds array without deleting the card.
 */
export async function removeCardFromDeck(cardId, deckId, store = db) {
  const card = await store.cards.get(cardId);
  if (!card) return;
  const deckIds = card.deckIds.filter(id => id !== deckId);
  await store.cards.update(cardId, { deckIds });
}

/**
 * Permanently deletes a card from IndexedDB.
 */
export async function deleteCard(cardId, store = db) {
  await store.cards.delete(cardId);
}

/**
 * Updates editable fields of a card.
 */
export async function updateCard(cardId, fields, store = db) {
  const allowed = ['text', 'translation', 'reading', 'romanization', 'notes', 'example', 'lang'];
  const update = {};
  for (const key of allowed) {
    if (key in fields) update[key] = fields[key];
  }
  await store.cards.update(cardId, update);
}

/**
 * Deletes a deck and all cards that belong to it.
 * Cards shared with other decks have the deckId removed instead of being deleted.
 */
export async function deleteDeck(deckId, store = db) {
  const cards = await store.cards.where('deckIds').equals(deckId).toArray();
  for (const card of cards) {
    await store.cards.delete(card.id);
  }
  await store.decks.delete(deckId);
}

/**
 * Exports all cards and user decks as a plain JS object suitable for JSON serialization.
 * System decks are excluded — they are re-created automatically on import.
 */
export async function exportAllData(store = db) {
  const cards = await store.cards.toArray();
  const decks = await store.decks.filter(d => !d.system).toArray();
  return { cards, decks };
}

/**
 * Restores a full export. Existing data is cleared first.
 * Cards are normalized to flat schema before insert.
 * User decks are inserted as-is; system decks are re-created on demand.
 */
export async function restoreAllData(data, store = db) {
  await store.cards.clear();
  await store.decks.clear();

  const { cards = [], decks = [] } = data;

  // Restore user decks first
  for (const deck of decks) {
    await store.decks.add(deck);
  }

  // Normalize and restore cards, stripping any legacy all-{lang} deckIds
  for (const card of cards) {
    const normalized = normalizeCard(card);
    normalized.deckIds = (normalized.deckIds || []).filter(id => !id.startsWith('all-'));
    await store.cards.add(normalized);
  }
}

export { createDb };

