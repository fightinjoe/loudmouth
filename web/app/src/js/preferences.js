/**
 * preferences — small localStorage-backed app preferences.
 *
 * Currently: "last ability used" per language, which pre-fills the ability
 * select in New-phrasebook mode for a language the learner has used before.
 * See docs/journeys.md 'Ability field (phrasebook-level, cross-journey)':
 * "The last ability chosen for a given language is remembered app-wide and
 * pre-fills the ability select the next time a new phrasebook is created
 * for that same language."
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

// --- Look-up HISTORY (per phrasebook) ---
//
// docs/journeys.md Journey 1 step 3: "a HISTORY of recent look-ups shows
// below VIBE" when the Input field is empty. Scoped per-phrasebook (not
// global) since re-running a past look-up makes sense in the context of the
// phrasebook you're adding to.

const HISTORY_PREFIX = "loudmouth.lookupHistory.";
const HISTORY_MAX = 10;

export function getLookupHistory(deckId) {
  try {
    const raw = localStorage.getItem(`${HISTORY_PREFIX}${deckId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Records `term` as the most recent look-up for `deckId`. De-dupes (moves an
 * existing entry to the front rather than repeating it) and caps at
 * HISTORY_MAX, dropping the oldest.
 */
export function addLookupHistory(deckId, term) {
  try {
    if (!deckId || !term) return;
    const existing = getLookupHistory(deckId).filter((t) => t !== term);
    const next = [term, ...existing].slice(0, HISTORY_MAX);
    localStorage.setItem(`${HISTORY_PREFIX}${deckId}`, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

// --- First-run coach-mark dismissal ---
//
// docs/journeys.md Journey 1 key detail 6: dismissible call-outs ("Tap to
// save…", "View other related words…") are first-run onboarding, not
// permanent chrome — global (not per-phrasebook), dismissed once for good.

const COACH_PREFIX = "loudmouth.coachDismissed.";

export function isCoachDismissed(key) {
  try {
    return localStorage.getItem(`${COACH_PREFIX}${key}`) === "1";
  } catch {
    return false;
  }
}

export function dismissCoach(key) {
  try {
    localStorage.setItem(`${COACH_PREFIX}${key}`, "1");
  } catch {
    /* ignore */
  }
}
