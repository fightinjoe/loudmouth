/**
 * Content pane — deck loader.
 *
 * Pure-ish async helper. Reads IndexedDB and synthesizes deck objects for
 * the virtual lang:* browse deck. Called from the content pane's
 * effect subscriber after `content/select-deck` fires.
 */
import {
  db,
  getCards,
  getCardsByLang,
  applyCardOrder,
} from "../js/db.js";
import { DEFAULT_MODE } from "../js/modes.js";
import { LANG_NAMES } from "../js/lang.js";

export async function loadDeckData(deckId) {
  if (!deckId) return { deck: null, cards: [] };

  if (deckId.startsWith("lang:")) {
    const lang = deckId.split(":")[1];
    const cards = await getCardsByLang(lang);
    const langName = LANG_NAMES[lang] ?? lang.toUpperCase();
    return {
      deck: { id: deckId, name: `All ${langName} Cards`, lang, mode: DEFAULT_MODE, order: "default", system: true },
      cards,
    };
  }

  const deck = await db.decks.get(deckId);
  if (!deck) return { deck: null, cards: [] };
  let cards = await getCards(deckId);
  cards = applyCardOrder(cards, deck.order || "default", deck.cardOrder || null);
  return { deck, cards };
}
