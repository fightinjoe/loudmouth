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
3. **Generate:** atomically commit selected topics, keeping exact repeated essentials and vocabulary
   in the earliest retained topic. Related words and all dialogue remain. Initial memberships are
   unstarred; cover completion never delays text saving.
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

- Prioritize creation speed, with content quality a close second; do not add a blocking quality stage
  without showing that time to the first usable phrasebook stays within the current latency envelope.
- Generate immediately deployable, conversational language at any learner level.
- Teach both anticipated speech and likely replies.
- Make short, frequent review frictionless.
- Keep a growing library useful without turning the learner into a librarian.
- Support mobile pronunciation, especially iOS Safari.

## Non-goals and deferred work

- In-the-moment capture as a separate mode; it is not part of the prep-first core experience.
- Fixed lessons, long-term cross-topic study, scoring, streaks, or gamification.
- User accounts, cloud sync, OCR/camera input, URL import, and manual blank-form authoring.
- Whole-phrasebook regeneration, undo, and user editing of card content.
- Spaced repetition until a useful signal exists without introducing scoring.

## Implemented capabilities

- Guided phrasebook creation through `/context` → `/phrasebook`, with dynamic context questions and
  a checklist of conversations to prepare.
- Topic-first generation: independent essential phrases, useful words, and complete two-sided dialogue.
- Web contents-first browsing, topic pages, optional supplemental collections, and phrasebook-scoped
  review with reveal, direction toggle, swipe navigation, and audio. This does not establish iOS parity.
- Web phrase breakdowns with source-aligned semantic parts, contextual explanations, and dictionary
  Words; explicit stars save learning targets to the active phrasebook.
- Structured ruby rendering, versioned content exchange, and atomic full-library JSON backup/restore.

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
  selected indexes with exact cross-topic deduplication and no global word cap. Unselected topics
  never suppress retained content; duplicate dialogue and related vocabulary remain.
  Independent `/phrasebook-title` work freezes the available name or seed fallback at commit.
  `/phrasebook-image` generates PNGs through OpenRouter FLUX.2 Klein 4B without blocking text;
  ready PNG bytes persist with the phrasebook. Missing or failed art leaves text usable.
- **Phrase analysis:** `/phrase-breakdown` receives the exact active occurrence snapshot and
  phrasebook context. The web client validates and caches the v2 analysis for the browser tab.
  Analysis is disposable; candidate stars resolve current library identities and memberships,
  never cached star state. Explicit saves preserve immutable source snapshots for Word examples
  and contextual Chunks, even after the source Phrase or phrasebook is deleted.
- **LLMs:** checked-in defaults in `api/src/llm-config.js` are
  `PHRASEBOOK_GENERATION_BACKEND=deepseek-v4.1-flash` (DeepSeek V4.1 Flash, Relace-only,
  reasoning disabled) and `LLM_BACKEND=gemini-3.5-flash-lite` (Gemini 3.5 Flash Lite for translation
  and other text endpoints). Generation also accepts Gemini 3.5 Flash Lite; alternate translation
  values are `g-flash`, `claude`, and `chatgpt`. Clients cannot select models. Deployed revision and
  environment overrides have not been verified; these defaults do not establish live configuration.
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

## Creation quality strategy

**Fast** means time to usable content; **reliable** means complete, valid, correctly associated results,
including retries/failures; **trustworthy** means faithful meaning and learner intent, useful teaching,
and avoidance of harmful learner-facing errors. Structural validation alone is not linguistic assurance.

R1 evaluates English generation (A), translation (B), and detection/optional repair (C) independently
using shared canonical learner contexts and qualitative review. Useful English essentials have the
highest content priority; ordinary dialogue awkwardness is lower impact than material meaning/safety
errors. Improve initial output before presuming a runtime reviewer is needed. Repair is not implemented
and remains optional; it must not become a required serial stage before usable initial content.

At the cleanup checkpoint, the new offline A/B/C workflows are still pending. The ordered plan is
cleanup/commit → offline implementation/proof/commit → separately approved paid calibration/commit →
comparisons. R2 identity/schema follows quality findings; R3 storage follows R2. iOS/web convergence
is an independent contract/catch-up track, not implied feature parity.

See the [current quality, identity, storage, and convergence plan](designs/phrasebook-quality-identity-storage-plan.md)
for gates, review priorities, schema-grounded terms and historical caveats; the planned
[`evals/README.md`](../evals/README.md) will be the tooling entrypoint. No production prompt changes,
new paid calls, deployment or API/card contract changes are authorized by this strategy.

## Open decisions

- How a future in-the-moment capture mode relates to prep phrasebooks.
- Which durability and retention features earn their place without introducing scores or bookkeeping.

## References

- [`docs/CARD_SCHEMA.md`](./CARD_SCHEMA.md) — card and reading-token contract.
- [`docs/API_DESIGN.md`](./API_DESIGN.md) — API request, response, and model-behavior contracts.
- [`docs/DESIGN.md`](./DESIGN.md) and [`docs/journeys.md`](./journeys.md) — interaction design.
