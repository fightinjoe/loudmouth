/**
 * preferences — small localStorage-backed app preferences.
 *
 * Stores the last ability used per language so New-phrasebook mode can
 * pre-fill the ability select for returning learners.
 *
 * Follows the try/catch-wrapped localStorage pattern in panes/app.js
 * (LAST_DECK_KEY) so a private-browsing/storage-disabled environment
 * degrades to "no preference" instead of throwing.
 */

const KEY_PREFIX = "loudmouth.lastAbility.";

/**
 * Returns the last ability chosen for `lang`, or undefined if none is
 * recorded yet (callers should fall back to the app-wide default).
 */
export function getLastAbility(lang) {
  try {
    return localStorage.getItem(`${KEY_PREFIX}${lang}`) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Records `ability` as the last ability used for `lang`.
 */
export function setLastAbility(lang, ability) {
  try {
    if (lang && ability) localStorage.setItem(`${KEY_PREFIX}${lang}`, ability);
  } catch {
    /* ignore */
  }
}

