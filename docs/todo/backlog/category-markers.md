---
kind: record
status: current
summary: Remove or tone down the category glyphs on the phrasebook landing, explored in Figma first.
verified: 2026-11-13
---

# Category markers add visual noise

Part of the [backlog](../backlog.md).

- **What:** explore in [Figma](https://www.figma.com/design/sn5VMavDDp38gSwsRVRhcS/CatchPhrase) removing or toning down the category markers on the phrasebook landing, then implement the chosen treatment. Each category card header shows a glyph from `CATEGORIES` in `web/app/src/js/phrasebook-chapters.ts` (Aa for Words, a quotation mark for Key phrases, a double arrow for Exchanges, an ellipsis for Conversation), rendered as `.chapter-card-marker` by `renderChapterHeader` in `web/app/src/components/chapter-card.ts`.
- **Why:** owner report from using the app, 2026-11-13: the icons for the different types add too much visual noise. The [phrasebook view](../../design.md#phrasebook-view) specifies a glyph in every category card header.
- **Done when:** the owner has chosen a treatment in Figma, the web landing matches it, and the [phrasebook view](../../design.md#phrasebook-view) describes the category headers accordingly.
