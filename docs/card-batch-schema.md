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
| `reading` | string | — | Pinyin with tone marks (`zh`) or hiragana (`ja`) |
| `romanization` | string | — | Romaji or other Latin-alphabet transcription (distinct from `reading`) |
| `notes` | string | — | Grammatical notes, register, collocations, or disambiguation |
| `example` | object | — | Example sentence (see below) |

### Example object

| Field | Type | Required | Description |
|---|---|---|---|
| `text` | string | ✅ (if example present) | Example sentence in the target language |
| `reading` | string | — | Reading of the example sentence |
| `translation` | string | — | English translation of the example sentence |

## Constraints

- `id` and `importedAt` are **never** included in the batch — the app assigns them at import time.
- `reading` and `romanization` are independent optional fields. For Japanese, `reading` is hiragana; `romanization` is romaji. Both may be present simultaneously.
- Omit optional fields entirely rather than including them as empty strings or `null`.

## Example (zh)

```json
{
  "cards": [
    {
      "lang": "zh",
      "type": "word",
      "text": "菜单",
      "reading": "càidān",
      "translation": "menu"
    },
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
      "reading": "おすすめ",
      "translation": "recommendation; recommended dish",
      "notes": "Often seen on menus as おすすめ料理"
    },
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

The app validates batches via `web/app/src/js/import-parser.js`. Required per card: `lang`, `text`, `translation`. The parser accepts both the flat schema (documented here) and a legacy nested `front`/`back` schema.
