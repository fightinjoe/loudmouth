export const ttsAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window

const LANG_MAP = { zh: 'zh-CN', ja: 'ja-JP' }

export function speak(text, lang, { onEnd, onError } = {}) {
  if (!ttsAvailable) return
  cancel()
  const utt = new SpeechSynthesisUtterance(text)
  utt.lang = LANG_MAP[lang] ?? lang
  if (onEnd) utt.addEventListener('end', onEnd)
  if (onError) utt.addEventListener('error', onError)
  window.speechSynthesis.speak(utt)
}

// Japanese uses reading (hiragana) to avoid kanji ambiguity; Chinese uses text (not pinyin)
export function ttsText(card) {
  return card.lang === 'ja' ? (card.reading || card.text) : card.text
}

export function cancel() {
  if (ttsAvailable) window.speechSynthesis.cancel()
}
