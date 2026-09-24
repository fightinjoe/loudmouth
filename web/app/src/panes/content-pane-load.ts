import { db, getCards, getCardsByLang, getGroups } from "../js/db";
import { LANG_NAMES, isContentLanguage } from "../js/lang";
import { DEFAULT_MODE } from "../js/modes";
import type { ContentLoadResult, SystemLanguageDeck } from "./content-pane";

/**
 * Loads a durable phrasebook or synthesizes the read-only language-library
 * view. Entry order is already authoritative in the persistence queries.
 */
export async function loadDeckData(deckId: string | null): Promise<ContentLoadResult> {
  if (!deckId) return { deck: null, cards: [], groups: [] };

  if (deckId.startsWith("lang:")) {
    const lang = deckId.slice("lang:".length);
    if (!isContentLanguage(lang)) return { deck: null, cards: [], groups: [] };
    const cards = await getCardsByLang(lang);
    const deck: SystemLanguageDeck = {
      id: `lang:${lang}`,
      name: `All ${LANG_NAMES[lang]} Cards`,
      lang,
      mode: DEFAULT_MODE,
      order: "default",
      readingDisplay: "reading",
      system: true,
    };
    return { deck, cards, groups: [] };
  }

  const deck = await db.decks.get(deckId);
  if (!deck) return { deck: null, cards: [], groups: [] };
  const [cards, groups] = await Promise.all([
    getCards(deckId),
    getGroups(deckId),
  ]);
  return { deck, cards, groups };
}
