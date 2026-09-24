import type { Lang } from "@catchphrase/card-schema";
import type { Ability } from "./library-types";
import { isAbility } from "./ability";

export const LAST_DECK_KEY = "loudmouth-card-v2.lastDeckId";
export const LANGUAGE_ABILITY_PREFIX = "loudmouth-card-v2.languageAbility.";
export const PHRASE_BREAKDOWN_CACHE_PREFIX = "loudmouth-card-v2.phrase-breakdown.v1:";


export function getLastDeckId(): string | null {
  try {
    return localStorage.getItem(LAST_DECK_KEY);
  } catch {
    return null;
  }
}

export function setLastDeckId(deckId: string | null): void {
  try {
    if (deckId) localStorage.setItem(LAST_DECK_KEY, deckId);
    else localStorage.removeItem(LAST_DECK_KEY);
  } catch {
    // Storage-disabled environments have no durable preference.
  }
}

export function getLastAbility(lang: Lang): Ability | undefined {
  try {
    const ability = localStorage.getItem(`${LANGUAGE_ABILITY_PREFIX}${lang}`);
    return isAbility(ability) ? ability : undefined;
  } catch {
    return undefined;
  }
}

export function setLastAbility(lang: Lang, ability: Ability): void {
  try {
    if (isAbility(ability)) {
      localStorage.setItem(`${LANGUAGE_ABILITY_PREFIX}${lang}`, ability);
    }
  } catch {
    // Storage-disabled environments have no durable preference.
  }
}
