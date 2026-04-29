---
name: generate-cards
description: Generates language flashcards in the Loudmouth card schema JSON format. Use when the user wants to create cards for import into the app, generate test data, or produce cards from a topic or source text.
---

# Generate Cards

Generate a set of language flashcards in the Loudmouth card batch schema. See [`docs/CARD_SCHEMA.md`](../../../docs/CARD_SCHEMA.md) for the full schema reference.

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
- **Avoid function words** — particles (は, が, で…), conjunctions, pronouns, prepositions — unless the user specifically asks for grammar cards or the topic demands it.
- **Match the topic closely.** If the instruction is "ordering food," every card should be directly useful in that context. Do not pad with tangentially related words.
- **Avoid redundancy.** Do not include both a verb and its nominal form unless they're meaningfully distinct.
- **For extraction prompts:** Read the source text carefully and select the words or phrases most worth learning. Skip obvious cognates, proper nouns, or words already common in English.

### Card content

- `text` — the word or phrase as it would appear in text. Use standard simplified characters for zh; kanji+kana as appropriate for ja.
- `reading` — optional. Always included for non-roman languages. Structured array of `[base, annotation|null]` pairs (see schema). For zh: every character gets tone-marked pinyin. For ja: kanji get hiragana; kana/katakana use `null`.
- `translation` — clear, natural English. For words with multiple senses, give the 1–2 most common.
- `romanization` — optional. Romaji for ja; omit if not useful.
- `notes` — optional. Use for grammatical notes, register, common collocations, or disambiguation. Keep brief.
- `example` — optional but encouraged for phrases and sentences. Include `reading` tokens and translation.

## Step 3: Preview and approval

Present a numbered preview list — only `text` and `translation` — like this:

```
1. 菜单 — menu
2. 我想点菜 — I'd like to order
3. ...
```

Ask the user: **"Any changes? (or type 'ok' to generate)"**

The user may:
- Approve all cards ("ok", "looks good", "generate", etc.) → proceed to Step 4
- Request changes → apply, re-display the updated preview, and ask again

Repeat until the user approves.

## Step 4: Output

Produce the final JSON, then generate two import links and display the raw JSON for troubleshooting.

### 4a: Build the import links

1. Serialize the card batch JSON to a compact string (no extra whitespace).
2. Base64url-encode it: standard base64, then replace `+` with `-`, `/` with `_`, and strip trailing `=` padding.
3. Produce two links:

```
**Import (production):**
https://loudmouth-gilt.vercel.app/#deck?cards=<encoded>

**Import (local):**
http://localhost:8000/#deck?cards=<encoded>
```

### 4b: Show the raw JSON

After the links, display the full JSON in a fenced code block for troubleshooting.
