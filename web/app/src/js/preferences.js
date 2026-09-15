/**
 * preferences — small localStorage-backed app preferences.
 *
 * Stores ability per language after a generated phrasebook is committed.
 *
 * Follows the try/catch-wrapped localStorage pattern in panes/app.js
 * (LAST_DECK_KEY) so a private-browsing/storage-disabled environment
 * degrades to "no preference" instead of throwing.
 */

import { ABILITIES } from "./ability.js";

// Separate from historical setup preferences, which were saved before import.
const KEY_PREFIX = "loudmouth.languageAbility.";

/**
 * Returns the last ability chosen for `lang`, or undefined if none is
 * recorded yet. Unknown ability should be asked during creation.
 */
export function getLastAbility(lang) {
  try {
    const ability = localStorage.getItem(`${KEY_PREFIX}${lang}`);
    return ABILITIES.includes(ability) ? ability : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Records `ability` as the last ability used for `lang`.
 */
export function setLastAbility(lang, ability) {
  try {
    if (lang && ABILITIES.includes(ability)) localStorage.setItem(`${KEY_PREFIX}${lang}`, ability);
  } catch {
    /* ignore */
  }
}

