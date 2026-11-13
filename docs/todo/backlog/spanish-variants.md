---
kind: record
status: current
summary: Support Spanish (Latin America) and Spanish (Spain) as separate content languages.
verified: 2026-11-13
---

# Spanish variants

Part of the [backlog](../backlog.md).

- **What:** Replace the single Spanish content language with two variants, Spanish (Latin America) and Spanish (Spain), as drawn in the language picker of Figma section 1304:33600 (frame 'change language', node 1324:23317, as of 2026-11-13 listing Chinese, Czech, Japanese, Spanish (Latin America), Spanish (Spain)). This spans the shared schema language list (`api/src/schema/index.ts` `LANGS`), the web language tables (`web/app/src/js/lang.ts` `CONTENT_LANGUAGES`, `LANG_NAMES`, `LANG_FLAGS`), the iOS client, generation and translation prompts, and how existing `es` phrasebooks and remembered preferences map onto a variant. Prompt edits need owner approval and before-and-after evaluations (AGENTS.md).
- **Why:** Owner request, 2026-11-13, while implementing the Figma creation flow: the picker shows two Spanish variants but the API and clients accept only one `es` language, so the creation flow shipped with the current five languages (Chinese, Czech, Japanese, Spanish, Ukrainian).
- **Open questions:** Whether existing `es` phrasebooks map to one variant or stay a third, legacy Spanish; whether Ukrainian stays in the picker.
- **Done when:** Learners can create phrasebooks in either Spanish variant on web and iOS, generation and translation follow the chosen variant, existing Spanish phrasebooks still open, and design.md, card-schema.md and the API pages describe the language set.
