import Dexie from 'dexie';

function createDb(options = {}) {
  const instance = new Dexie('loudmouth', options);
  instance.version(1).stores({
    cards: 'id, lang, *deckIds, createdAt',
    decks: 'id, lang, createdAt',
  });
  return instance;
}

// Singleton for production use
export const db = createDb();

// --- helpers ---

function uuid() {
  return crypto.randomUUID();
}

function isoNow() {
  return new Date().toISOString();
}

function slugify(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/**
 * Returns the system deck for the given language, creating it if absent.
 * System deck IDs: 'all-zh' | 'all-ja'
 */
export async function getOrCreateAllDeck(lang, store = db) {
  const id = `all-${lang}`;
  const existing = await store.decks.get(id);
  if (existing) return existing;

  const deck = {
    id,
    name: `All ${lang === 'zh' ? 'Chinese' : 'Japanese'} Cards`,
    lang,
    createdAt: isoNow(),
    system: true,
  };
  await store.decks.add(deck);
  return deck;
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
  const deck = { id, name, lang, createdAt: isoNow(), system: false };
  await store.decks.add(deck);
  return deck;
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
 * Imports an array of parsed card objects into the DB.
 */
export async function importCards(cards, deckId = null, store = db) {
  const langGroups = {};
  for (const card of cards) {
    (langGroups[card.lang] ??= []).push(card);
  }

  for (const [lang, group] of Object.entries(langGroups)) {
    const allDeck = await getOrCreateAllDeck(lang, store);
    for (const card of group) {
      const deckIds = [allDeck.id];
      if (deckId) deckIds.push(deckId);
      await store.cards.add({
        id: uuid(),
        createdAt: isoNow(),
        ...card,
        deckIds,
      });
    }
  }
}

export { createDb };
