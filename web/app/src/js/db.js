import Dexie from "dexie";
import { DEFAULT_MODE, MODES } from "./modes.js";
import { getLastAbility, setLastAbility } from "./preferences.js";

// VIBE + ability defaults per docs/API_DESIGN.md's /lookup Inputs table —
// authoritative over the Casual/Strangers/None values shown in the Figma
// mocks (docs/journeys.md 'Defaults note').
const DEFAULT_FORMALITY = "polite";
const DEFAULT_AUDIENCE = "staff";
const DEFAULT_ABILITY = "beginner";

function createDb(options = {}) {
  const instance = new Dexie("loudmouth", options);

  // v1 — initial schema
  instance.version(1).stores({
    cards: "id, lang, *deckIds, createdAt",
    decks: "id, lang, createdAt",
  });

  // v2 — card schema migration: legacy front/back shape → flat text/translation shape
  instance
    .version(2)
    .stores({
      cards: "id, lang, *deckIds, createdAt",
      decks: "id, lang, createdAt",
    })
    .upgrade(() => {});

  // v3 — deck mode rename: old mode names → study/review/reverse vocabulary;
  //      added lastAccessedAt index on decks for recents ordering
  instance
    .version(3)
    .stores({
      cards: "id, lang, *deckIds, createdAt",
      decks: "id, lang, createdAt, lastAccessedAt",
    })
    .upgrade((tx) => {
      const modeMap = {
        "target-lang": "comprehension",
        reading: "comprehension",
        "native-lang": "reverse",
      };
      return tx.decks.toCollection().modify((deck) => {
        if (modeMap[deck.mode]) {
          deck.mode = modeMap[deck.mode];
        }
      });
    });

  // v4 — removed virtual all-{lang} system decks; strip orphaned all-* deckIds from cards
  instance
    .version(4)
    .stores({
      cards: "id, lang, *deckIds, createdAt",
      decks: "id, lang, createdAt, lastAccessedAt",
    })
    .upgrade(async (tx) => {
      await tx
        .table("cards")
        .toCollection()
        .modify((card) => {
          card.deckIds = (card.deckIds || []).filter(
            (id) => !id.startsWith("all-"),
          );
        });
      const systemDecks = await tx
        .table("decks")
        .filter((d) => d.system)
        .toArray();
      for (const d of systemDecks) {
        await tx.table("decks").delete(d.id);
      }
    });

  // v5 — added deck.order field ('default' | 'random' | 'reverse')
  instance
    .version(5)
    .stores({
      cards: "id, lang, *deckIds, createdAt",
      decks: "id, lang, createdAt, lastAccessedAt",
    })
    .upgrade((tx) => {
      return tx
        .table("decks")
        .toCollection()
        .modify((deck) => {
          if (!deck.order) deck.order = "default";
        });
    });

  // v6 — added deck.readingDisplay field ('reading' | 'romanization')
  instance
    .version(6)
    .stores({
      cards: "id, lang, *deckIds, createdAt",
      decks: "id, lang, createdAt, lastAccessedAt",
    })
    .upgrade((tx) => {
      return tx
        .table("decks")
        .toCollection()
        .modify((deck) => {
          if (!deck.readingDisplay) deck.readingDisplay = "reading";
        });
    });

  // v7 — added deck-level VIBE (formality/audience, mutable) and ability
  //      (immutable after creation) fields for the /lookup phrasebook flow.
  //      See docs/journeys.md 'VIBE model' + 'Ability field'.
  instance
    .version(7)
    .stores({
      cards: "id, lang, *deckIds, createdAt",
      decks: "id, lang, createdAt, lastAccessedAt",
    })
    .upgrade((tx) => {
      return tx
        .table("decks")
        .toCollection()
        .modify((deck) => {
          if (!deck.formality) deck.formality = DEFAULT_FORMALITY;
          if (!deck.audience) deck.audience = DEFAULT_AUDIENCE;
          if (!deck.ability) deck.ability = DEFAULT_ABILITY;
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
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function isoNow() {
  return new Date().toISOString();
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/**
 * Returns the next zero-padded deck counter string (e.g. '003').
 */
async function nextDeckCounter(store) {
  const userDecks = await store.decks.filter((d) => !d.system).toArray();
  if (userDecks.length === 0) return "001";
  const max = userDecks.reduce((m, d) => {
    const n = parseInt(d.id.split("-")[0], 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return String(max + 1).padStart(3, "0");
}

/**
 * Creates a user deck with an ID like '001-restaurant-words'.
 *
 * `ability` is immutable after creation (like `lang`) — pass it explicitly
 * to override the per-language "last ability used" preference, which is
 * otherwise read as the default and updated to whatever ability is used
 * here. `formality`/`audience` (VIBE) are mutable and always seeded at
 * their app-wide defaults (Polite/Staff) — see docs/journeys.md 'VIBE model'.
 *
 * `seedId`, when given, marks the deck as created from a static suggested
 * phrasebook (docs/journeys.md Journey 2) — used to dedupe an already-added
 * suggestion out of the SUGGESTED list. See `getSeededDeckIds`.
 */
export async function createDeck(name, lang, { ability, seedId } = {}, store = db) {
  const counter = await nextDeckCounter(store);
  const id = `${counter}-${slugify(name)}`;
  const resolvedAbility = ability || getLastAbility(lang) || DEFAULT_ABILITY;
  const deck = {
    id,
    name,
    lang,
    createdAt: isoNow(),
    system: false,
    mode: DEFAULT_MODE,
    order: "default",
    readingDisplay: "reading",
    formality: DEFAULT_FORMALITY,
    audience: DEFAULT_AUDIENCE,
    ability: resolvedAbility,
    ...(seedId ? { seedId } : {}),
  };
  await store.decks.add(deck);
  setLastAbility(lang, resolvedAbility);
  return deck;
}

/**
 * Returns the Set of `seedId`s already materialized as real decks — used to
 * filter an already-added suggestion out of the SUGGESTED list (docs/journeys.md
 * Journey 2 key detail 3: "Suggested list dedupes on add").
 */
export async function getSeededDeckIds(store = db) {
  const decks = await store.decks.filter((d) => !!d.seedId).toArray();
  return new Set(decks.map((d) => d.seedId));
}

/**
 * Updates a deck's VIBE (formality/audience). Mutable, unlike `ability`
 * and `lang`, which are set once at creation and never change.
 */
export async function updateDeckVibe(deckId, { formality, audience }, store = db) {
  const fields = {};
  if (formality !== undefined) fields.formality = formality;
  if (audience !== undefined) fields.audience = audience;
  await store.decks.update(deckId, fields);
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
export async function updateDeckReadingDisplay(
  deckId,
  readingDisplay,
  store = db,
) {
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
export async function getDecks(
  lang,
  { includeSystem = false } = {},
  store = db,
) {
  let col = lang
    ? store.decks.where("lang").equals(lang)
    : store.decks.toCollection();
  const results = await col.toArray();
  return includeSystem ? results : results.filter((d) => !d.system);
}

/**
 * Returns all cards belonging to the given deck.
 */
export async function getCards(deckId, store = db) {
  return store.cards.where("deckIds").equals(deckId).toArray();
}

/**
 * Returns all cards for the given language, regardless of deck.
 */
export async function getCardsByLang(lang, store = db) {
  return store.cards.where("lang").equals(lang).toArray();
}

/**
 * Toggles the starred state of a card.
 * Sets state.starredAt to the current ISO time if not starred, null if already starred.
 * Returns true if the card is now starred, false if now unstarred.
 */
export async function toggleCardStar(cardId, store = db) {
  const card = await store.cards.get(cardId);
  if (!card) return false;
  const nowStarred = !card.state?.starredAt;
  await store.cards.update(cardId, {
    state: { ...(card.state || {}), starredAt: nowStarred ? isoNow() : null },
  });
  return nowStarred;
}

/**
 * Applies a deck's order setting to an array of cards.
 * 'default' preserves createdAt insertion order, 'reverse' reverses it, 'random' shuffles.
 * If deck.cardOrder (an array of card IDs) is set, it takes precedence over the order setting.
 */
export function applyCardOrder(cards, order, cardOrder = null) {
  if (cardOrder && cardOrder.length > 0) {
    const byId = new Map(cards.map((c) => [c.id, c]));
    const ordered = cardOrder.map((id) => byId.get(id)).filter(Boolean);
    const remaining = cards.filter((c) => !cardOrder.includes(c.id));
    return [...ordered, ...remaining];
  }
  const sorted = [...cards].sort((a, b) => {
    if (a.createdAt < b.createdAt) return -1;
    if (a.createdAt > b.createdAt) return 1;
    return (a.importIndex ?? 0) - (b.importIndex ?? 0);
  });
  if (order === "reverse") return sorted.reverse();
  if (order === "random") {
    for (let i = sorted.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    }
    return sorted;
  }
  return sorted;
}

/**
 * Persists a custom card order for a deck as an array of card IDs.
 */
export async function updateDeckCardOrder(deckId, cardIds, store = db) {
  await store.decks.update(deckId, { cardOrder: cardIds });
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
 * Saves a single term card to a phrasebook, committing immediately (no
 * staging/approval step) — used by the /lookup save (🔖) action. Unlike
 * `importCards`, returns the persisted card (with its assigned id/createdAt)
 * so the caller can reflect it in UI state right away.
 */
export async function saveTermCard(card, deckId, store = db) {
  const saved = {
    id: uuid(),
    createdAt: isoNow(),
    ...card,
    deckIds: deckId ? [deckId] : [],
  };
  await store.cards.add(saved);
  return saved;
}

/**
 * Returns distinct lang values that have at least one card.
 */
export async function getLangs(store = db) {
  const cards = await store.cards.toArray();
  return [...new Set(cards.map((c) => c.lang))].sort();
}

/**
 * Removes a deckId from a card's deckIds array without deleting the card.
 */
export async function removeCardFromDeck(cardId, deckId, store = db) {
  const card = await store.cards.get(cardId);
  if (!card) return;
  const deckIds = card.deckIds.filter((id) => id !== deckId);
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
  const allowed = [
    "text",
    "translation",
    "reading",
    "romanization",
    "notes",
    "example",
    "lang",
  ];
  const update = {};
  for (const key of allowed) {
    if (key in fields) update[key] = fields[key];
  }
  await store.cards.update(cardId, update);
}

/**
 * Deletes a deck and all cards that belong to it.
 *
 * NOTE: This is not atomic. If an error occurs mid-loop, some cards will have
 * been deleted while others remain, leaving the deck record intact. Dexie does
 * not provide a transaction API that spans the full operation here. In practice
 * this is acceptable: orphaned cards cause no visible harm and are excluded from
 * all UI queries (which filter by deckIds). A future migration can sweep them.
 */
export async function deleteDeck(deckId, store = db) {
  const cards = await store.cards.where("deckIds").equals(deckId).toArray();
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
  const decks = await store.decks.filter((d) => !d.system).toArray();
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

  for (const card of cards) {
    card.deckIds = (card.deckIds || []).filter((id) => !id.startsWith("all-"));
    await store.cards.add(card);
  }
}

export { createDb };
