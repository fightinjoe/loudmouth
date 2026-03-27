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

## Step 3: Preview and approval

Present a numbered preview list — only `front.text` and `back.translation` — like this:

```
1. 菜单 — menu
2. 我想点菜 — I'd like to order
3. ...
```

Ask the user: **"Any changes? (or type 'ok' to generate)"**

The user may:
- Approve all cards ("ok", "looks good", "generate", etc.) → proceed to Step 4
- Request changes to specific cards ("swap #3 for X", "drop #5", "add a card for Y") → apply changes, re-display the updated preview, and ask again

Repeat this loop until the user approves.

## Step 4: Output

Produce the final JSON, then generate two import links and display the raw JSON for troubleshooting.

### 4a: Build the import links

1. Serialize the card batch JSON to a compact string (no extra whitespace).
2. Base64url-encode it: standard base64, then replace `+` with `-`, `/` with `_`, and strip trailing `=` padding.
3. Produce two links:

```
**Import (production):**
https://loudmouth-gilt.verce.app/#deck?cards=<encoded>

**Import (local):**
http://localhost:8000/#deck?cards=<encoded>
```

### 4b: Show the raw JSON

After the links, display the full JSON in a fenced code block for troubleshooting:

```json
{ ... }
```

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
      "text": "我想点菜",
      "reading": "wǒ xiǎng diǎn cài",
      "translation": "I'd like to order",
      "notes": "Standard phrase to get a waiter's attention when ordering",
      "example": {
        "text": "服务员，我想点菜。",
        "reading": "Fúwùyuán, wǒ xiǎng diǎn cài.",
        "translation": "Waiter, I'd like to order."
      }
    },
    {
      "lang": "zh",
      "type": "word",
      "text": "菜单",
      "reading": "càidān",
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
      "text": "注文してもいいですか",
      "reading": "ちゅうもんしてもいいですか",
      "translation": "May I order?",
      "notes": "Polite request form; use in restaurants",
      "example": {
        "text": "すみません、注文してもいいですか。",
        "reading": "すみません、ちゅうもんしてもいいですか。",
        "translation": "Excuse me, may I order?"
      }
    },
    {
      "lang": "ja",
      "type": "word",
      "text": "おすすめ",
      "reading": "おすすめ",
      "translation": "recommendation; recommended dish",
      "notes": "Often seen on menus as おすすめ料理"
    }
  ]
}
```
