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
to prepare, and receives **Things to say**, **Likely exchanges** with explicit alternative responses,
**Words** in titled families, and a linear **Example conversation**, in that order for each topic.
Web opens a **Phrasebook** contents page with topic previews and an optional contextual
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
3. **Generate:** atomically commit selected topics, keeping exact repeated Things to say in the
   earliest retained topic. Every exchange response, Word-family placement and example line remains;
   canonical cards and stars are shared. Initial memberships are unstarred; cover completion never delays text saving.
4. **Prioritize:** stars belong to the current phrasebook. Starring an analysis candidate saves its
   learning target and historical evidence; unstarring retains both.
5. **Review:** use the contents page to open a topic's Things to say, Likely exchanges, titled Word
   families, and Example conversation, or open the pinned **Starred** collection. Review the current phrasebook's starred
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
- Four-section topic generation: Things to say, Likely exchanges, Words in titled families, Example conversation.
- Web contents-first browsing, topic pages, optional supplemental collections, and phrasebook-scoped
  review with reveal, direction toggle, swipe navigation, and audio. This does not establish iOS parity.
- Web phrase breakdowns with source-aligned semantic parts, contextual explanations, and dictionary
  Words; explicit stars save learning targets to the active phrasebook.
- Structured ruby rendering, versioned content exchange, and atomic full-library JSON backup/restore.

## Platform and architecture

- **Clients:** mobile-first PWA and native iOS app in one monorepo.
- **Web implementation:** strict TypeScript, with runtime validation shared with the JavaScript API
  through `@catchphrase/card-schema`.
- **Storage:** seven-table client-side IndexedDB library in fresh `loudmouth-topic-v4`; no accounts,
  sync, or server-held library. Old databases/preferences remain untouched, without migration.
- **API:** Cloud Run service in `api/`. `/context` returns questions, topic choices, and a seed-based
  illustration prompt. `/phrasebook` generates English per topic with at most four concurrent calls,
  waits for all English, then translates each complete topic in parallel. The v4 response has
  `thingsToSay`, nested `likelyExchanges` response options, titled `words` families, and linear
  `exampleConversation`; no scores, featured selection or inferred alternatives.
  Translation uses flat phrase/Word arrays and code reconstructs the nesting. The client validates
  the whole draft before committing original selected indexes. Only exact-English Things to say
  is deduplicated across retained topics; Word-family placements are never removed across topics,
  and there is no global word cap. Unselected topics never suppress retained content.
  Independent `/phrasebook-title` work freezes the available name or seed fallback at commit.
  `/phrasebook-image` generates PNGs through OpenRouter FLUX.2 Klein 4B without blocking text;
  ready PNG bytes persist with the phrasebook. Missing or failed art leaves text usable.
  This promotion does not deploy API or web; their eventual release must be coordinated. Native iOS's
  retired-route integration remains unchanged. Semantic continuation after alternative responses
  remains an unvalidated, low-priority quality warning.
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
stars. Phrase occurrences retain their own translation, topic, section, and position; exchange and
example occurrences also preserve speaker/turn metadata. Topic Word placements preserve family and
topic ordering while sharing canonical cards and phrasebook membership stars.

See [`docs/CARD_SCHEMA.md`](./CARD_SCHEMA.md) for normative contracts. Common CardBatch and breakdown
exchange remain v2; phrasebook responses and library backups are v4. The seven tables are `cards`,
`decks`, `groups`, `memberships`, `occurrences`, `provenance`, and `topicWords`.

This is a fresh-library cutover to `loudmouth-topic-v4`, with no v3 phrasebook import, conversion,
or restore path. Existing physical v3 databases and old preference keys are left untouched.
API, gateway, and web must ship together; coordinated deployment has not been performed.
Known content-quality risks remain separate work, not a linguistic acceptance claim.

## Creation quality strategy

**Fast** means time to usable content; **reliable** means complete, valid, correctly associated results,
including retries/failures; **trustworthy** means faithful meaning and learner intent, useful teaching,
and avoidance of harmful learner-facing errors. Structural validation alone is not linguistic assurance.

English generation (A), translation (B), and optional detection/repair (C) have independent offline
workflows using five shared canonical learner contexts, authored mocks, saved-response evaluation,
a proposed rubric and a subjective-review skill. Optional A→B checks exercise technical handoff.
**No accepted linguistic baseline exists.** The current v4 implementation milestone is complete;
future model/prompt comparisons need representative inputs, independently attributed review and
explicit decision criteria, not completion of retired experiments.

Useful Things to say, meaningful exchange choices and reusable Word families take priority over
ordinary example-conversation awkwardness. Meaning/safety errors, pronunciation defects and
unsupported evidence remain separate findings even when structural validation passes.

**C is optional and deferred**, not an A/B prerequisite. Repair is not implemented in production
and must not become a required serial stage before usable initial content. Any future identity,
storage or iOS/web convergence work requires its own contract and release decisions.

See the [current quality, identity, storage, and convergence plan](designs/phrasebook-quality-identity-storage-plan.md)
for current decisions and limits; [`evals/README.md`](../evals/README.md) is the tooling entrypoint.
This strategy does not authorize paid calls, prompt/model changes or deployment.

## Open decisions

- How a future in-the-moment capture mode relates to prep phrasebooks.
- Which durability and retention features earn their place without introducing scores or bookkeeping.

## References

- [`docs/CARD_SCHEMA.md`](./CARD_SCHEMA.md) — card and reading-token contract.
- [`docs/API_DESIGN.md`](./API_DESIGN.md) — shared API rules and index of endpoint-specific contracts.
- [`docs/DESIGN.md`](./DESIGN.md) and [`docs/journeys.md`](./journeys.md) — interaction design.
