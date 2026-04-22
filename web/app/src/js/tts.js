export const ttsAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window

// Maps app lang codes to BCP-47 locale tags required by SpeechSynthesisUtterance.
// Langs not listed here fall through using the app code as-is.
const LANG_MAP = { zh: 'zh-CN', ja: 'ja-JP' }

/**
 * Speaks the given text using the Web Speech API.
 * No-ops if speechSynthesis is unavailable (non-mobile browsers).
 * Cancels any in-progress utterance before starting a new one.
 *
 * @param {string}   text             The text to speak.
 * @param {string}   lang             App language code (e.g. 'ja', 'zh', 'es').
 * @param {Object}   [opts]
 * @param {Function} [opts.onEnd]     Called when the utterance finishes naturally.
 * @param {Function} [opts.onError]   Called if the utterance encounters a speech error.
 */
export function speak(text, lang, { onEnd, onError } = {}) {
  if (!ttsAvailable) return
  cancel()
  const utt = new SpeechSynthesisUtterance(text)
  utt.lang = LANG_MAP[lang] ?? lang
  if (onEnd) utt.addEventListener('end', onEnd)
  if (onError) utt.addEventListener('error', onError)
  window.speechSynthesis.speak(utt)
}

/**
 * Returns the text string that should be spoken for a card.
 *
 * Japanese uses the reading field (hiragana) rather than the text field (kanji)
 * to avoid ambiguous kanji pronunciation. All other languages use text directly.
 *
 * @param {Object} card
 * @returns {string}
 */
export function ttsText(card) {
  return card.lang === 'ja' ? (card.reading || card.text) : card.text
}

/**
 * Cancels any currently-playing utterance.
 */
export function cancel() {
  if (ttsAvailable) window.speechSynthesis.cancel()
}
