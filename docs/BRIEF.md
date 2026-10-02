---
name: brief
description: >
  Current product brief and technical overview for Catchphrase — a mobile-first language-preparation
  app for travelers. Load for product goals, scope, platform constraints, or monorepo context.
---

# Catchphrase — Product Brief

> Prepare language for real conversations.

Catchphrase creates bespoke, situation-specific phrasebooks through a short guided conversation. A
learner describes an upcoming situation, answers a few context questions, chooses which conversations
to prepare, and receives independent essential phrases, useful words, and a short two-sided dialogue
for each topic. Web opens a **Phrasebook** contents page with topic previews and an optional contextual
watercolor cover. Each topic has its own swipeable page; saved standalone translations, words, and
Chunks follow when present. A pinned Starred tab browses unique starred memberships; Review uses
the same phrasebook-scoped set.

## User and problem

The primary user is a traveler preparing for a specific upcoming interaction, such as dinner with a
partner's parents, a clinic visit, or a dance class. Generic courses and dictionaries provide either
too much curriculum or too little situational help. The product's job is to help the learner say and
understand what matters in that room.

The web app and API support Chinese, Japanese, Spanish, Czech, and Ukrainian.

## Product principles

- **Situation first:** teach language the learner will say, hear, point at, or choose between.
- **Teacher, not dictionary:** include the situation's real vocabulary, but omit encyclopedic topic
  knowledge.
- **Both sides of the conversation:** teach what the learner says and what other people may say back.
- **Opinionated and bounded:** generate a useful chapter, then stop; no reroll or fully editable canvas.
- **No bookkeeping:** the app files, groups, and orders content; the learner never has to curate a
  library.
- **Structured content:** Word, Chunk, and Phrase share one validated contract. `notes` is teaching
  prose only; relationships and source evidence are explicit.
- **No pressure:** no scores, streaks, pass/fail states, or fixed curriculum.

## Current experience

1. **Create:** enter a topic or situation.
2. **Clarify:** answer dynamic, topic-specific questions and check which conversations to prepare.
3. **Generate:** atomically commit selected topics, independent phrase occurrences, and topic-local
   Word placements. All initial memberships are unstarred; cover completion never delays text saving.
4. **Prioritize:** stars belong to the current phrasebook. Starring an analysis candidate saves its
   learning target and historical evidence; unstarring retains both.
5. **Review:** use the contents page to open a topic's essential phrases, two-column words, and complete
   conversation, or open the pinned **Starred** collection. Review the current phrasebook's starred
   set with reveal, direction switching, pronunciation, and swiping. Words use dictionary forms;
   Chunks retain their original source context.

Web Phrase cards support on-demand semantic breakdowns in the details layer. Opening analysis
does not save cards. Explicit target stars save Words or Chunks; Regenerate refreshes disposable
analysis without overwriting saved teaching. Character and Grammar card types remain deferred.

## Goals

- Make preparation for a known situation fast and useful.
- Generate immediately deployable, conversational language at any learner level.
- Teach both anticipated speech and likely replies.
- Make short, frequent review frictionless.
- Keep a growing library useful without turning the learner into a librarian.
- Support mobile pronunciation, especially iOS Safari.

## Non-goals and deferred work

- In-the-moment capture as a separate mode; it is not part of the prep-first core experience.
- Fixed lessons, long-term cross-topic study, scoring, streaks, or gamification.
- User accounts, cloud sync, OCR/camera input, URL import, and manual blank-form authoring.
- Whole-phrasebook regeneration, undo, or unrestricted editing.
- Spaced repetition until a useful signal exists without introducing scoring.

## Phases

### Phase 1 — Prep and review

- Guided phrasebook creation through `/context` → `/phrasebook`.
- Dynamic context questions and a checklist of the conversations to prepare.
- Topic-first generation: independent essential phrases, useful words, and complete two-sided dialogue.
- Web contents-first browsing with topic pages and optional supplemental collections; phrasebook-scoped
  review with reveal, direction toggle, swipe navigation, and audio. This does not change iOS.
- Web phrase breakdowns: source-aligned semantic parts, contextual explanations, and nested
  dictionary Words. Every distinct target can be starred into the active phrasebook's review set.

### Phase 2 — Library durability

- Structured ruby rendering on web, including source spans and contextual review.
- Versioned content exchange and atomic full-library JSON backup/restore.

### Phase 3 — Retention

- Spaced repetition after the no-scoring/self-rating decision is resolved.

## Platform and architecture

- **Clients:** mobile-first PWA and native iOS app in one monorepo.
- **Web implementation:** strict TypeScript, with runtime validation shared with the JavaScript API
  through `@catchphrase/card-schema`.
- **Storage:** seven-table client-side IndexedDB library; no accounts, sync, or server-held library.
- **API:** Cloud Run service in `api/`. `/context` returns questions, topic choices, and a seed-based
  illustration prompt. `/phrasebook` generates English per topic with at most four concurrent calls,
  waits for all English, then translates each complete topic in parallel. The v3 response has
  independent `essentials`, `vocab`, and `dialogue`; no scores or featured selection.
  The client speculates while topics are selected, validates the whole draft, then commits original
  selected indexes without pooling or globally capping words.
  Independent `/phrasebook-title` work freezes the available name or seed fallback at commit.
  `/phrasebook-image` generates PNGs through OpenRouter FLUX.2 Klein 4B without blocking text;
  ready PNG bytes persist with the phrasebook. Missing or failed art leaves text usable.
- **Phrase analysis:** `/phrase-breakdown` receives the exact active occurrence snapshot and
  phrasebook context. The web client validates and caches the v2 analysis for the browser tab.
  Analysis is disposable; candidate stars resolve current library identities and memberships,
  never cached star state. Explicit saves preserve immutable source snapshots for Word examples
  and contextual Chunks, even after the source Phrase or phrasebook is deleted.
- **LLMs:** `PHRASEBOOK_GENERATION_BACKEND=deepseek-v4.1-flash` selects Relace-only English generation
  with reasoning disabled. `LLM_BACKEND=gemini-3.5-flash-lite` selects translation and other text endpoints;
  alternate translation values remain `g-flash`, `claude`, and `chatgpt`. Clients cannot select models.
- **Creation ability:** `none | basics | conversational`, remembered per language in this browser
  only after successful generation and library import. Unknown ability is asked during clarification.
  Remembered ability is sent to both endpoints; `/phrasebook` defaults invalid or missing values to
  `basics`. Updating a remembered ability is deferred.
- **Audio:** Web Speech API on mobile browsers. iOS Safari is the primary target; desktop audio is
  unsupported.

## Storage vocabulary and schema

**Phrasebook** is the user-facing term; `decks` remains an internal table name. All memberships in a
phrasebook share its language. Reusable cards can belong to multiple phrasebooks with independent
stars. Phrase occurrences retain their own translation, topic, section, and position; only dialogue
occurrences carry speaker/alternative state. Topic Word placements preserve each topic's ordering
while sharing canonical cards and phrasebook membership stars.

See [`docs/CARD_SCHEMA.md`](./CARD_SCHEMA.md) for normative contracts. Common CardBatch and breakdown
exchange remain v2; phrasebook responses and library backups are v3. The seven tables are `cards`,
`decks`, `groups`, `memberships`, `occurrences`, `provenance`, and `topicWords`.

This is a fresh-library cutover to `loudmouth-topic-v3`, with no old phrasebook reader, conversion,
or restore path. Existing physical databases and old preference keys are left untouched.
API, gateway, and web must ship together. The 2026-10-01 promotion is production code only:
no deployment was authorized. Known translation defects remain accepted product risk and separate
quality work, not a linguistic acceptance claim.

## Open decisions

- How a future in-the-moment capture mode relates to prep phrasebooks.
- Which durability and retention features earn their place without introducing scores or bookkeeping.

## References

- [`docs/CARD_SCHEMA.md`](./CARD_SCHEMA.md) — card and reading-token contract.
- [`docs/API_DESIGN.md`](./API_DESIGN.md) — API request, response, and model-behavior contracts.
- [`docs/DESIGN.md`](./DESIGN.md) and [`docs/journeys.md`](./journeys.md) — interaction design.
