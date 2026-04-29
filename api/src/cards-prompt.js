/**
 * Builds the card generation prompt sent to every LLM.
 */
function buildCardsPrompt(lang, count, topic) {
  const langName = lang === 'zh' ? 'Mandarin Chinese' : 'Japanese';
  const levelDesc = lang === 'zh' ? 'HSK 1–4' : 'JLPT N5–N3';

  const readingDesc = lang === 'zh'
    ? `an array of ReadingToken pairs, one per character. Each token is [base, annotation] where base is the character and annotation is its tone-marked pinyin. Example for 菜单: [["菜","cài"],["单","dān"]]`
    : `an array of ReadingToken pairs. Each token is [base, annotation|null]. Kanji get a hiragana annotation; kana and katakana use null. Example for 注文: [["注","ちゅう"],["文","もん"]]  Example for おすすめ: [["おすすめ",null]]`;

  const readingExample = lang === 'zh'
    ? `[["菜","cài"],["单","dān"]]`
    : `[["注","ちゅう"],["文","もん"],["してもいいですか",null]]`;

  const exampleReadingExample = lang === 'zh'
    ? `[["我","wǒ"],["想","xiǎng"],["点","diǎn"],["菜","cài"]]`
    : `[["すみません、",null],["注","ちゅう"],["文","もん"],["してもいいですか。",null]]`;

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
      "reading": ${readingExample},
      "translation": "clear, natural English (1–2 most common senses only)",
      "notes": "optional — grammatical notes, register, common collocations, or disambiguation (omit if not useful)",
      "example": {
        "text": "optional example sentence in ${langName}",
        "reading": ${exampleReadingExample},
        "translation": "optional English translation of the example"
      }
    }
  ]
}

## Rules

- \`lang\` is always "${lang}".
- \`text\` — use standard ${lang === 'zh' ? 'simplified' : 'kanji+kana as appropriate'} characters.
- \`reading\` — ALWAYS include. Must be a ReadingToken array: ${readingDesc}
- \`translation\` — clear, natural English. For words with multiple senses, give the 1–2 most common. Do not list every possible meaning.
- \`notes\` — omit the key entirely if not useful. Do not include empty strings.
- \`example\` — optional but encouraged for phrases and sentences. If included, \`example.reading\` must also be a ReadingToken array in the same format. Omit the key entirely if not including one.
- Do NOT include \`id\` or \`importedAt\` — those are assigned by the app at import time.
- Produce exactly ${count} cards. Do not produce more or fewer.

Topic: ${topic}
`;
}

module.exports = { buildCardsPrompt };
