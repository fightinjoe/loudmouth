---
name: card-schema
description: >
  The Loudmouth card batch schema — the interchange format between external generators
  (AI tools, the /generate-cards API) and the app. Load this doc when generating cards,
  validating card JSON, building import/export logic, or writing prompts that produce cards.
---

# Card Batch Schema

The card batch format is the interchange format between external generators (AI tools, the `/generate-cards` API) and the app. Cards are imported as a JSON batch; the app assigns `id` and `importedAt` at import time.

## Batch envelope

```json
{
  "cards": [ ...card objects... ]
}
```

## Card object

| Field | Type | Required | Description |
|---|---|---|---|
| `lang` | `"zh"` \| `"ja"` | ✅ | Language code |
| `text` | string | ✅ | Word or phrase in the target language |
| `translation` | string | ✅ | English translation (1–2 most common senses) |
| `type` | `"word"` \| `"phrase"` \| `"sentence"` | — | Card type |
| `reading` | `ReadingToken[]` | — | Structured phonetic reading (see below) |
| `romanization` | string | — | Latin-alphabet transcription (romaji for `ja`; optional, primarily useful for Japanese) |
| `notes` | string | — | Grammatical notes, register, collocations, or disambiguation |
| `example` | object | — | Example sentence (see below) |

## Reading tokens

`reading` is an array of `ReadingToken` values, where each token represents one unit of the text:

- **Annotated token** `[base, annotation]` — a pair where `base` is the written form and `annotation` is its phonetic reading. Use when the character(s) need a reading.
- **Unannotated token** `[base, null]` — a pair where the base needs no annotation (e.g. kana, alphabetic characters, katakana).

**By language:**

- **`zh`** — every character gets a tone-marked pinyin annotation: `[["菜", "cài"], ["单", "dān"]]`
- **`ja`** — kanji get hiragana annotations; kana and katakana use `null`: `[["食", "た"], ["べる", null]]`. Katakana words are a single unannotated token: `[["スイッチ", null]]`
- **Other scripts** — a single unannotated token containing the full word, e.g. `[["Praha", null]]`

The app renders `reading` as ruby text (e.g. `<ruby>菜<rt>cài</rt></ruby>`). `romanization` is a separate optional field for Latin-alphabet transcription and is independent of `reading`.

## Constraints

- `id` and `importedAt` are **never** included in the batch — the app assigns them at import time.
- `reading` and `romanization` are independent optional fields. For Japanese, `reading` contains annotated tokens (hiragana over kanji); `romanization` is romaji. Both may be present simultaneously.
- Omit optional fields entirely rather than including them as empty arrays, empty strings, or `null`.

## Example (zh)

```json
{
  "cards": [
    {
      "lang": "zh",
      "type": "word",
      "text": "菜单",
      "reading": [["菜", "cài"], ["单", "dān"]],
      "translation": "menu"
    },
    {
      "lang": "zh",
      "type": "phrase",
      "text": "我想点菜",
      "reading": [["我", "wǒ"], ["想", "xiǎng"], ["点", "diǎn"], ["菜", "cài"]],
      "translation": "I'd like to order",
      "notes": "Standard phrase to get a waiter's attention when ordering",
      "example": {
        "text": "服务员，我想点菜。",
        "reading": [["服", "fú"], ["务", "wù"], ["员", "yuán"], ["，", null], ["我", "wǒ"], ["想", "xiǎng"], ["点", "diǎn"], ["菜", "cài"], ["。", null]],
        "translation": "Waiter, I'd like to order."
      }
    }
  ]
}
```

## Example (ja)

```json
{
  "cards": [
    {
      "lang": "ja",
      "type": "word",
      "text": "おすすめ",
      "reading": [["おすすめ", null]],
      "translation": "recommendation; recommended dish",
      "notes": "Often seen on menus as おすすめ料理"
    },
    {
      "lang": "ja",
      "type": "phrase",
      "text": "注文してもいいですか",
      "reading": [["注", "ちゅう"], ["文", "もん"], ["してもいいですか", null]],
      "translation": "May I order?",
      "notes": "Polite request form; use in restaurants",
      "example": {
        "text": "すみません、注文してもいいですか。",
        "reading": [["すみません、", null], ["注", "ちゅう"], ["文", "もん"], ["してもいいですか。", null]],
        "translation": "Excuse me, may I order?"
      }
    }
  ]
}
```

## URI import encoding

To import cards via URL (the preferred mobile path), base64url-encode the compact JSON and append it to the app URL:

```
https://loudmouth-gilt.vercel.app/#deck?cards=<base64url-encoded-batch-json>
```

Base64url encoding: standard base64, then replace `+` with `-`, `/` with `_`, strip trailing `=` padding.

## Validation

Required per card: `lang`, `text`, `translation`. All other fields optional.
