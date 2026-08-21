/**
 * Static, hand-curated SUGGESTED PHRASEBOOKS seed list (docs/journeys.md
 * Journey 2). Real seed content is blocked on finalizing the generation API
 * (docs/BRIEF.md 'Suggested phrasebooks' Open Question, resolved as
 * "placeholder for now") — this list and its term content are a **placeholder**,
 * just enough to exercise the preview -> confirm -> save flow end to end.
 * Replace with real curated content once the generation API lands; do not
 * treat this data as production copy.
 *
 * Every suggestion's `terms` follow the CARD_SCHEMA.md term shape (minus
 * id/createdAt, assigned at import time like any other import).
 */
export const SUGGESTED_PHRASEBOOKS = [
  {
    id: "seed-greetings-ja",
    emoji: "👋",
    title: "Greetings",
    lang: "ja",
    terms: [
      { lang: "ja", type: "phrase", text: "こんにちは", translation: "hello", reading: [["こんにちは", null]] },
      { lang: "ja", type: "phrase", text: "おはようございます", translation: "good morning", reading: [["おはようございます", null]], context: "General greetings" },
      { lang: "ja", type: "phrase", text: "こんばんは", translation: "good evening", reading: [["こんばんは", null]], context: "General greetings" },
      { lang: "ja", type: "phrase", text: "お元気ですか", translation: "how are you?", reading: [["お", null], ["元", "げん"], ["気", "き"], ["ですか", null]], context: "Questions" },
    ],
  },
  {
    id: "seed-directions-ja",
    emoji: "🧭",
    title: "Directions",
    lang: "ja",
    terms: [
      { lang: "ja", type: "word", text: "右", translation: "right", reading: [["右", "みぎ"]] },
      { lang: "ja", type: "word", text: "左", translation: "left", reading: [["左", "ひだり"]] },
      { lang: "ja", type: "phrase", text: "まっすぐ行ってください", translation: "please go straight", reading: [["まっすぐ", null], ["行", "い"], ["ってください", null]] },
    ],
  },
  {
    id: "seed-restaurant-ja",
    emoji: "🍜",
    title: "Eating at a restaurant",
    lang: "ja",
    terms: [
      { lang: "ja", type: "word", text: "メニュー", translation: "menu", reading: [["メニュー", null]] },
      { lang: "ja", type: "phrase", text: "注文してもいいですか", translation: "may I order?", reading: [["注", "ちゅう"], ["文", "もん"], ["してもいいですか", null]] },
      { lang: "ja", type: "phrase", text: "お会計お願いします", translation: "check, please", reading: [["お", null], ["会", "かい"], ["計", "けい"], ["お願いします", null]] },
    ],
  },
  {
    id: "seed-exclamations-ja",
    emoji: "🗣️",
    title: "Exclamations",
    lang: "ja",
    terms: [
      { lang: "ja", type: "phrase", text: "すごい", translation: "amazing!", reading: [["すごい", null]] },
      { lang: "ja", type: "phrase", text: "頑張って", translation: "good luck!", reading: [["頑", "がん"], ["張", "ば"], ["って", null]] },
    ],
  },
];

/**
 * Returns the suggested phrasebooks not yet added (see db.js `getSeededDeckIds`).
 */
export function pendingSuggestions(seededDeckIds) {
  return SUGGESTED_PHRASEBOOKS.filter((s) => !seededDeckIds.has(s.id));
}
