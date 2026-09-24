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
to prepare, and receives a phrasebook of several short two-sided conversations plus the key vocabulary
drawn from them. The learner reviews it in short sessions. On web, each conversation has its own
swipeable tab/page, followed by saved Chunks and Vocab. Review uses only that phrasebook's stars.

## User and problem

The primary user is a traveler preparing for a specific upcoming interaction, such as dinner with a
partner's parents, a clinic visit, or a dance class. Generic courses and dictionaries provide either
too much curriculum or too little situational help. The product's job is to help the learner say and
understand what matters in that room.

Initial product languages are Chinese and Japanese. The API also supports Spanish and Czech.

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
3. **Generate:** commit the selected conversations, their occurrences, and pooled vocabulary in one
   atomic operation. All initial memberships are unstarred.
4. **Prioritize:** stars belong to the current phrasebook. Starring an analysis candidate saves its
   learning target and historical evidence; unstarring retains both.
5. **Review:** browse occurrence-based conversation tabs, optional **Chunks**, and **Vocab**, then
   review the current phrasebook's starred set with reveal, direction switching, pronunciation, and
   swiping. Words use dictionary forms; Chunks retain their original source context.

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
- Complete phrasebook generation: several short two-sided conversations plus a vocabulary group.
- Web occurrence-based conversation tabs followed by saved Chunks and Vocab; phrasebook-scoped
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
- **Storage:** six-table client-side IndexedDB library; no accounts, sync, or server-held library.
- **API:** Cloud Run service in `api/`. `/context` returns setup questions and conversation choices;
  `/phrasebook` generates English conversations, translates each conversation in parallel, and returns
  conversation bundles with per-topic vocabulary. The web client starts generation after questions,
  while topics are being selected, then filters bundles and pools vocabulary locally on final Continue.
  An independent `/phrasebook-title` call runs alongside context setup, generating a short English
  name without delaying creation. The client freezes that name or the seed fallback when saving.
  Cards, usage accounting, and provider adapters are shared.
- **Phrase analysis:** `/phrase-breakdown` receives the exact active occurrence snapshot and
  phrasebook context. The web client validates and caches the v2 analysis for the browser tab.
  Analysis is disposable; candidate stars resolve current library identities and memberships,
  never cached star state. Explicit saves preserve immutable source snapshots for Word examples
  and contextual Chunks, even after the source Phrase or phrasebook is deleted.
- **LLMs:** server-selected with `LLM_BACKEND`, default `gemini-3.5-flash-lite`; clients cannot
  select a backend. Alternate server values are `g-flash`, `claude`, and `chatgpt`.
- **Creation ability:** `none | basics | conversational`, remembered per language in this browser
  only after successful generation and library import. Unknown ability is asked during clarification.
  Remembered ability is sent to both endpoints; `/phrasebook` defaults invalid or missing values to
  `basics`. Updating a remembered ability is deferred.
- **Audio:** Web Speech API on mobile browsers. iOS Safari is the primary target; desktop audio is
  unsupported.

## Storage vocabulary and schema

**Phrasebook** is the user-facing term; `decks` remains an internal table name. All memberships in a
phrasebook share its language. Reusable cards can belong to multiple phrasebooks with independent
stars. Phrase occurrences retain their own translation, speaker, group, and position.

See [`docs/CARD_SCHEMA.md`](./CARD_SCHEMA.md) for the normative v2 content, identity, persistence,
provenance, and backup contracts. Content contains no library metadata. The six tables are `cards`,
`decks`, `groups`, `memberships`, `occurrences`, and `provenance`.

This is a hard cutover: web startup deletes the old `loudmouth` database and legacy app-owned
preferences, without migration. New data uses `loudmouth-card-v2`; old-format imports and backups
are rejected. API and web must ship together.

## Open decisions

- How a future in-the-moment capture mode relates to prep phrasebooks.
- Which durability and retention features earn their place without introducing scores or bookkeeping.

## References

- [`docs/CARD_SCHEMA.md`](./CARD_SCHEMA.md) — card and reading-token contract.
- [`docs/API_DESIGN.md`](./API_DESIGN.md) — API request, response, and model-behavior contracts.
- [`docs/DESIGN.md`](./DESIGN.md) and [`docs/journeys.md`](./journeys.md) — interaction design.
