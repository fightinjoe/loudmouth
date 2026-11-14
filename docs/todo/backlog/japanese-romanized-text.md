---
kind: record
status: current
summary: A Japanese phrasebook returned one topic's Key phrases in romaji instead of kanji and kana; detect and recover such translations.
verified: 2026-11-13
---

# Japanese cards returned in romaji

Part of the [backlog](../backlog.md).

- **What:** find why one topic's Japanese Things to say (shown as Key phrases) came back as romaji in the card `text`, and stop such cards from being accepted: detect Japanese cards whose `text` contains no kana or kanji and recover through the existing translation retry, or fail the topic. Any change to `api/src/phrasebook/translate-prompt.txt` or `api/src/phrasebook/reading-rules-ja.txt` needs owner approval and before-and-after evaluations (`AGENTS.md`).
- **Why:** owner report from using the app, 2026-11-13; the seed and response were not kept. Nothing checks that a Japanese card's `text` is in Japanese script: `checkLanguage` in `api/src/schema/index.ts` only requires `romanization` to be Latin, and the kanji-reading check only fires when the text contains Han characters, so an all-romaji translation passes validation. The Japanese reading rules ask for both `target` text and separate romanizations ([POST /phrasebook](../../api/phrasebook.md)), which makes swapping the two a plausible model error.
- **Open questions:** Whether a romaji topic retries translation, is dropped with a flag, or fails the request; whether the same check applies to Chinese and Ukrainian (Cyrillic).
- **Done when:** a Japanese card whose `text` has no kana or kanji is never returned silently: a deterministic test covers detection and recovery, the behavior and its flag or failure level are described on [POST /phrasebook](../../api/phrasebook.md), and a live Japanese sample shows no romaji `text`.
