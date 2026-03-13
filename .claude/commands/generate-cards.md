---
name: generate-cards
description: Generates language flashcards in the Loudmouth card schema JSON format. Use when the user wants to create cards for import into the app, generate test data, or produce cards from a topic or source text.
---

# Generate Cards

Generate a set of language flashcards in the Loudmouth card schema JSON format.

## Step 1: Gather parameters

Ask the user for the following if not already provided:

1. **Language** — `zh` (Mandarin Chinese) or `ja` (Japanese)
2. **Count** — how many cards to generate (suggest 10–15 if unspecified)
3. **Topic or instruction** — freeform. Examples:
   - "useful phrases for ordering food at a restaurant"
   - "common verbs for daily routines"
   - "extract cards from the following text: ..."

If the user provides all three in their message, proceed directly to generation.

## Step 2: Generate the cards

Produce cards that are **genuinely useful for language learning**. Follow these guidelines:

### Card selection

- **Favor high-frequency vocabulary.** For Japanese, target JLPT N5–N3 range unless the topic demands otherwise. For Chinese, target HSK 1–4.
- **Favor nouns, verbs, adjectives, and adverbs.** These are the words learners need most.
- **Avoid function words** — particles (は, が, で…), conjunctions (but, and, because), pronouns (he, she, they), prepositions — unless the user specifically asks for grammar cards or the topic demands it.
- **Match the topic closely.** If the instruction is "ordering food," every card should be directly useful in that context. Do not pad with tangentially related words.
- **Avoid redundancy.** Do not include both a verb and its nominal form unless they're meaningfully distinct.
- **For extraction prompts:** Read the source text carefully and select the words or phrases most worth learning — the ones a learner would actually want to look up. Skip words that are obvious cognates, proper nouns, or already common in English.

### Card content

- `front.text` — the word or phrase as it would appear in text. Use standard simplified characters for zh; use kanji+kana as appropriate for ja.
- `front.reading` — always include for zh (pinyin with tone marks) and ja (hiragana). Do not omit.
- `back.translation` — clear, natural English. For words with multiple senses, give the 1–2 most common. Do not list every possible meaning.
- `back.notes` — optional. Use for: grammatical notes (e.g., "takes を particle"), register (e.g., "polite form"), common collocations, or disambiguation. Keep brief.
- `example` — optional but encouraged for phrases and sentences. Use natural, context-appropriate example sentences. Include reading and translation.

## Step 3: Output

Output **only** the JSON — no surrounding explanation, no markdown fences, no commentary. The output should be directly pasteable.

### Schema

```json
{
  "cards": [
    {
      "lang": "zh" | "ja",
      "type": "word" | "phrase" | "sentence",
      "front": {
        "text": "string",
        "reading": "string"
      },
      "back": {
        "translation": "string",
        "notes": "string (optional)"
      },
      "example": {
        "text": "string",
        "reading": "string (optional)",
        "translation": "string (optional)"
      }
    }
  ]
}
```

Do not include `id` or `importedAt` — those are assigned by the app at import time.

### Example output (zh, 2 cards)

```json
{
  "cards": [
    {
      "lang": "zh",
      "type": "phrase",
      "front": {
        "text": "我想点菜",
        "reading": "wǒ xiǎng diǎn cài"
      },
      "back": {
        "translation": "I'd like to order",
        "notes": "Standard phrase to get a waiter's attention when ordering"
      },
      "example": {
        "text": "服务员，我想点菜。",
        "reading": "Fúwùyuán, wǒ xiǎng diǎn cài.",
        "translation": "Waiter, I'd like to order."
      }
    },
    {
      "lang": "zh",
      "type": "word",
      "front": {
        "text": "菜单",
        "reading": "càidān"
      },
      "back": {
        "translation": "menu"
      }
    }
  ]
}
```

### Example output (ja, 2 cards)

```json
{
  "cards": [
    {
      "lang": "ja",
      "type": "phrase",
      "front": {
        "text": "注文してもいいですか",
        "reading": "ちゅうもんしてもいいですか"
      },
      "back": {
        "translation": "May I order?",
        "notes": "Polite request form; use in restaurants"
      },
      "example": {
        "text": "すみません、注文してもいいですか。",
        "reading": "すみません、ちゅうもんしてもいいですか。",
        "translation": "Excuse me, may I order?"
      }
    },
    {
      "lang": "ja",
      "type": "word",
      "front": {
        "text": "おすすめ",
        "reading": "おすすめ"
      },
      "back": {
        "translation": "recommendation; recommended dish",
        "notes": "Often seen on menus as おすすめ料理"
      }
    }
  ]
}
```
