---
kind: brief
status: current
summary: "Catchphrase product intent: users, principles, current experience, goals, scope and quality priorities."
verified: 2026-11-12
---

# Catchphrase — Product Brief

> Prepare language for real conversations.

Catchphrase creates a **personalized language textbook** for an upcoming situation through a short guided conversation. The learner answers context questions, chooses conversations to prepare, and receives **Things to say**, **Likely exchanges** with explicit alternative responses, **Words** in titled families, and a linear **Example conversation**, in that order for each topic. Its value is learning language on the learner's terms, not speaking on their behalf or imposing a fixed curriculum. Web presents an illustrated landing of category cards — Words, Key phrases, Exchanges and Conversation — each opening one sheet that gathers that category from every topic, plus supplemental saved material and a deduplicated Starred collection. Review uses the same phrasebook-scoped starred set.

## User and problem

The primary user is a traveler preparing for a specific upcoming interaction, such as dinner with a partner's parents, a clinic visit, or a dance class. Generic courses and dictionaries provide either too much curriculum or too little situational help. The product's job is to help the learner say and understand what matters in that room.

The web app and API support Chinese, Japanese, Spanish, Czech, and Ukrainian.

## Product principles

- **Situation first:** teach language the learner will say, hear, point at, or choose between.
- **Teacher, not dictionary:** include the situation's real vocabulary, but omit encyclopedic topic knowledge.
- **Both sides of the conversation:** teach what the learner says and what other people may say back.
- **Opinionated and bounded:** generate a useful chapter, then stop; no reroll or fully editable canvas.
- **No bookkeeping:** the app files, groups, and orders content; the learner never has to curate a library.
- **Structured content:** Word, Chunk, and Phrase share one validated contract. `notes` is teaching prose only; relationships and source evidence are explicit.
- **No pressure:** no scores, streaks, pass/fail states, or fixed curriculum.

## Current experience

1. **Create:** enter a topic or situation.
2. **Clarify:** answer dynamic, topic-specific questions and check which conversations to prepare.
3. **Generate:** atomically commit selected topics, keeping exact repeated Things to say in the earliest retained topic. Every exchange response, Word-family placement and example line remains; canonical cards and stars are shared. Initial memberships are unstarred; cover completion never delays text saving.
4. **Prioritize:** stars belong to the current phrasebook. Starring an analysis candidate saves its learning target and historical evidence; unstarring retains both.
5. **Review:** open a category from the phrasebook landing — Words, Key phrases (Things to say), Exchanges or Conversation — to browse it across every topic, or open **Starred**. Review the phrasebook's starred set with reveal, direction switching, pronunciation, and swiping. Words use dictionary forms; Chunks retain their original source context.

Web Phrase cards support on-demand semantic breakdowns in the details layer. Opening analysis does not save cards. Explicit target stars save Words or Chunks; Regenerate refreshes disposable analysis without overwriting saved teaching. Character and Grammar card types remain deferred.

## Goals

- Prioritize creation speed, with content quality a close second; do not add a blocking quality stage without showing that time to the first usable phrasebook stays within the current latency envelope.
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

- Guided phrasebook creation through `/context` → `/phrasebook`, with dynamic context questions and a checklist of conversations to prepare.
- Four-section topic generation: Things to say, Likely exchanges, Words in titled families, Example conversation.
- Web phrasebook landing with category cards (Words, Key phrases, Exchanges, Conversation), one chapter sheet page per category, optional supplemental collections, a Starred pane, and phrasebook-scoped review with reveal, direction toggle, swipe navigation, and audio. This does not establish iOS parity.
- Illustrated home navigation with seeded creation ideas and complete library shelves.
- Web phrase breakdowns with source-aligned semantic parts, contextual explanations, and dictionary Words; explicit stars save learning targets to the active phrasebook.
- Structured ruby rendering, versioned content exchange, and atomic full-library JSON backup/restore.

## Platform and architecture

- **Clients:** mobile-first PWA and native iOS app in one monorepo. The web app is strict TypeScript and shares runtime validation with the JavaScript API through `@catchphrase/card-schema`. Production state is in [API operations](api/operations.md#production).
- **Storage:** the library lives only in the browser (IndexedDB); there are no accounts, sync or server-held library. Tables, versions and lifecycle are in the [card schema](card-schema.md).
- **API:** a stateless Cloud Run service in `api/`. Guided creation uses `/context` → `/phrasebook`, with independent `/phrasebook-title` naming and nonblocking `/phrasebook-image` covers; `/phrase-breakdown` analyzes an existing Phrase on demand. Missing or failed cover art leaves text usable. Contracts are indexed in the [API design](api-design.md).
- **LLMs:** server-owned; clients cannot select models. Defaults live in `api/src/llm-config.js`; selectors are described in [API operations](api/operations.md#server-owned-model-selection).
- **Creation ability:** `none | basics | conversational`, remembered per language in this browser only after successful generation and library import. Unknown ability is asked during clarification. Updating a remembered ability is deferred.
- **Audio:** Web Speech API on mobile browsers. iOS Safari is the primary target; desktop audio is unsupported.

## Storage vocabulary

**Phrasebook** is the user-facing term; `decks` remains an internal table name. All memberships in a phrasebook share its language. Reusable cards can belong to multiple phrasebooks with independent stars. Phrase occurrences retain their own translation, topic, section and position; exchange and example occurrences also preserve speaker/turn metadata. Topic Word placements preserve family and topic ordering while sharing canonical cards and phrasebook membership stars. The normative contracts are in the [card schema](card-schema.md).

## Creation quality strategy

**Fast** means time to usable content; **reliable** means complete, valid, correctly associated results, including retries and failures; **trustworthy** means faithful meaning and learner intent, useful teaching, and avoidance of harmful learner-facing errors. Structural validation alone is not linguistic assurance.

Useful Things to say, meaningful exchange choices and reusable Word families take priority over ordinary example-conversation awkwardness. Meaning/safety errors, pronunciation defects and unsupported evidence remain separate findings even when structural validation passes.

English generation (A) and translation (B) are the primary quality work; detection/repair (C) is optional, exists only as offline evaluation tooling, and is not a production stage. **No accepted linguistic baseline exists.** Workflows, fixtures and rubric are in [evaluation guidance](evals/index.md); results are in the [results ledger](evals/results.md). Future identity, storage, convergence and repair ideas are in the [proposal](proposals/phrasebook-quality-plan.md).

## Open decisions

- How a future in-the-moment capture mode relates to prep phrasebooks.
- Which durability and retention features earn their place without introducing scores or bookkeeping.

## References

- [`docs/card-schema.md`](card-schema.md) — card and reading-token contract.
- [`docs/api-design.md`](api-design.md) — shared API rules and index of endpoint-specific contracts.
- [`docs/design.md`](design.md) and [`docs/journeys.md`](journeys.md) — interaction design.
