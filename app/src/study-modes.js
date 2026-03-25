export const STUDY_MODES = {
  TARGET_LANG: 'target-lang',
  READING: 'reading',
  NATIVE_LANG: 'native-lang',
}

export const MODE_LABELS = {
  'target-lang': 'Comprehension',
  'reading': 'Reading',
  'native-lang': 'Production',
}

/**
 * Returns { front, back } strings for the given card and study mode.
 * @param {object} card - flat card schema
 * @param {string} mode - one of STUDY_MODES values
 * @returns {{ front: string, back: string }}
 */
export function applyMode(card, mode) {
  switch (mode) {
    case STUDY_MODES.READING:
      return { front: card.text, back: card.reading || '' }
    case STUDY_MODES.NATIVE_LANG:
      return {
        front: card.translation,
        back: card.reading ? `${card.text} (${card.reading})` : card.text,
      }
    case STUDY_MODES.TARGET_LANG:
    default:
      return { front: card.text, back: card.translation }
  }
}
