---
name: brief
description: >
  Current product brief and technical overview for Catchphrase — a mobile-first language-preparation
  app for travelers. Load for product goals, scope, platform constraints, or monorepo context.
---

# Catchphrase — Product Brief

> Prepare language for real conversations.

Catchphrase creates bespoke, situation-specific phrasebooks through a short guided conversation. A
learner describes an upcoming situation, answers a few context questions, chooses communicative
goals, and receives a complete phrasebook with useful vocabulary, phrases, and a two-sided example
dialogue. The learner reviews it in short sessions and expands it without filing or reorganizing
content.

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
- **Thin schema:** prove new structured content in `notes` before promoting it to a card field.
- **No pressure:** no scores, streaks, pass/fail states, or fixed curriculum.

## Current experience

1. **Create:** enter a topic or situation.
2. **Clarify:** answer dynamic, topic-specific questions and review a checklist of communicative goals.
3. **Generate:** commit a complete, multi-section phrasebook in one step.
4. **Prioritize:** star cards as bounded binary emphasis; generation is not a per-card save flow.
5. **Review:** reveal cards manually, switch direction, play pronunciation, and swipe through a
   phrasebook without scoring.
6. **Expand:** choose a bounded "give me more, here" action:
   - group → more cards in that group's context;
   - phrasebook → a new section, with a typing fallback for a specific request;
   - card → decomposition into component words and grammar, with worthwhile words promoted to cards.

Expansion is menu-first, deduplicated against existing content, auto-filed through `context`, and
never a reroll. Difficulty and explanation depth are requested per card, not selected as initial
phrasebook settings.

## Goals

- Make preparation for a known situation fast and useful.
- Generate immediately deployable, conversational language at any learner level.
- Teach both anticipated speech and likely replies.
- Make short, frequent review frictionless.
- Let phrasebooks grow without turning the learner into a librarian.
- Support mobile pronunciation, especially iOS Safari.

## Non-goals and deferred work

- In-the-moment capture as a separate mode; it is not part of the prep-first core experience.
- Fixed lessons, long-term cross-topic study, scoring, streaks, or gamification.
- User accounts, cloud sync, OCR/camera input, URL import, and manual blank-form authoring.
- Whole-phrasebook regeneration, undo, or unrestricted editing.
- Spaced repetition until a useful signal exists without introducing scoring.
- Furigana ruby rendering until the mobile behavior is validated.

## Phases

### Phase 1 — Prep and review

- Guided phrasebook creation through `/textbook`.
- Dynamic context questions and communicative-goal checklist.
- Complete phrasebook generation with sections, vocabulary, phrases, and example conversation.
- Starred-card priority view, flip review, direction toggle, swipe navigation, audio, and browse/search.
- Bounded expansion for groups, phrasebooks, and card decomposition.

### Phase 2 — Library durability

- Furigana/ruby rendering after mobile prototype validation.
- JSON export as protection against client-side storage eviction.

### Phase 3 — Retention

- Spaced repetition after the no-scoring/self-rating decision is resolved.

## Platform and architecture

- **Clients:** mobile-first PWA and native iOS app in one monorepo.
- **Storage:** client-side IndexedDB for the library; no accounts, sync, or server-held library.
- **API:** Cloud Run service in `api/`. `/textbook` handles guided creation in two calls; `/lookup`
  remains the stateless translation primitive for supporting lookup/expansion flows. Both reuse the
  same LLM registry, card validation, reading normalization, CORS, and error conventions.
- **LLMs:** `google`, `claude`, or `chatgpt`, selected by the caller in the prototype.
- **Audio:** Web Speech API on mobile browsers. iOS Safari is the primary target; desktop audio is
  unsupported.

## Storage vocabulary and schema

**Phrasebook** is the user-facing term. The existing internal IndexedDB names `decks` and `deckIds[]`
are retained as implementation names; they must not appear in UI copy. All cards in a phrasebook share
one language. A card may belong to multiple phrasebooks.

See [`docs/CARD_SCHEMA.md`](./CARD_SCHEMA.md) for the authoritative card and reading-token schema.
Internal card metadata is `id`, `createdAt`, and `deckIds[]`; phrasebook metadata includes `id`,
`name`, `lang`, `createdAt`, `formality`, `audience`, and `readingDisplay` where applicable.

## Open decisions

- How much content auto-commit plus repeated expansion should add before the phrasebook feels crowded.
- Where promoted decomposition words should appear.
- The structured shape of decomposition data stored in `notes`.
- The bounded UI for per-card easier/more-advanced requests.
- Whether and how declined creation goals persist as an expansion suppression set.
- How a future in-the-moment mode relates to prep phrasebooks.

## References

- [`docs/CARD_SCHEMA.md`](./CARD_SCHEMA.md) — card and reading-token contract.
- [`docs/API_DESIGN.md`](./API_DESIGN.md) — API request, response, and model-behavior contracts.
- [`docs/DESIGN.md`](./DESIGN.md) and [`docs/journeys.md`](./journeys.md) — interaction design.
- [`docs/designs/prep-pivot-and-phrasebook-expansion.md`](./designs/prep-pivot-and-phrasebook-expansion.md) — design rationale and unresolved expansion questions.
