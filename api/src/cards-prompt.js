/**
 * Builds the card generation prompt sent to every LLM.
 */
function buildCardsPrompt(lang, count, topic) {
  const langName = lang === 'zh' ? 'Mandarin Chinese' : 'Japanese';
  const readingDesc = lang === 'zh' ? 'pinyin with tone marks' : 'hiragana';
  const levelDesc = lang === 'zh' ? 'HSK 1–4' : 'JLPT N5–N3';

  return `You are a language flashcard generator. Produce exactly ${count} flashcards in ${langName} on the following topic: ${topic}

## Card selection rules

- Favor high-frequency vocabulary (${levelDesc} range unless the topic demands otherwise).
- Favor nouns, verbs, adjectives, and adverbs. Avoid function words (particles, conjunctions, pronouns, prepositions) unless the topic specifically demands them.
- Match the topic closely — every card should be directly useful in that context.
- Avoid redundancy — do not include both a verb and its nominal form unless meaningfully distinct.

## Output format

Respond with only a JSON object. Do not wrap it in markdown code fences. Schema:

{
  "cards": [
    {
      "lang": "${lang}",
      "type": "word" | "phrase" | "sentence",
      "text": "the word or phrase in ${langName} characters",
      "reading": "${readingDesc} reading — ALWAYS include",
      "translation": "clear, natural English (1–2 most common senses only)",
      "notes": "optional — grammatical notes, register, common collocations, or disambiguation (omit if not useful)",
      "example": {
        "text": "optional example sentence in ${langName}",
        "reading": "optional ${readingDesc} reading of the example",
        "translation": "optional English translation of the example"
      }
    }
  ]
}

## Rules

- \`lang\` is always "${lang}".
- \`text\` — use standard ${lang === 'zh' ? 'simplified' : 'kanji+kana as appropriate'} characters.
- \`reading\` — always include. Never omit.
- \`translation\` — clear, natural English. For words with multiple senses, give the 1–2 most common. Do not list every possible meaning.
- \`notes\` — omit the key entirely if not useful. Do not include empty strings.
- \`example\` — optional but encouraged for phrases and sentences. Omit the key entirely if not including one.
- Do NOT include \`id\` or \`importedAt\` — those are assigned by the app at import time.
- Produce exactly ${count} cards. Do not produce more or fewer.

Topic: ${topic}
`;
}

module.exports = { buildCardsPrompt };
