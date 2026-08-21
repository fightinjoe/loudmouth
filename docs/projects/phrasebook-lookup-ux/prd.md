# PRD: Phrasebook Look-up UX

## Problem Statement

The current app's card-adding flow (paste-JSON import; a planned but unbuilt Generate Cards sheet) does
not match the CatchPhrase Figma redesign's core loop. The redesign replaces both with a single
**look-up mechanic**: a learner types a term, sees a disambiguated primary translation plus AI-clustered
related phrase groups, and curates a phrasebook by exploring a nested Input → Translation → Group stack
("choose your own adventure"). This flow is wired to the new `/lookup` API
([`docs/projects/lookup-api/`](../lookup-api/prd.md)) and introduces phrasebook-level settings — VIBE
(formality/audience) and an immutable per-phrasebook `ability`/`language` — that the current data model
(web IndexedDB, iOS SwiftData) does not have.

## Solution

Build the action-pane look-up stack and its four supporting journeys exactly as specified in
[`docs/journeys.md`](../../journeys.md) (Figma-grounded; treat it as canonical for interaction detail —
this PRD summarizes, journeys.md is the source of truth), wired to `/lookup`:

- **Journey 1** — creating a phrasebook via a fresh look-up (Input → Translation → Group).
- **Journey 2** — adding a static suggested phrasebook via a preview/confirm flow.
- **Journey 3** — adding terms to an existing phrasebook (same stack, different entry point).
- **Journey 4** — reviewing a phrasebook (flashcard flip, direction toggle, audio) — does not call
  `/lookup`, included because it's part of the same Figma pass and shares the action-pane component.

**Sequencing:** build and validate on **web first**; port the settled interaction model to **iOS** using
the web implementation as reference, rather than building both from spec in parallel.

**Defaults note:** `docs/journeys.md` and `docs/API_DESIGN.md` originally disagreed on VIBE/ability
defaults (mocks showed Casual/Strangers/None; the API contract specifies Polite/Staff/Beginner).
Resolved during planning — **the API contract's defaults are authoritative**; `journeys.md` has been
patched to note this. Build against Polite/Staff/Beginner, not what the mock screenshots show.

**Known open questions.** `journeys.md` itself still lists unresolved Figma-level questions for Journey 2
(is Add/Review active in an unsaved preview? are preview terms editable? how are suggested-row subtitle
counts seeded pre-content?) and Journey 4 (card-advance mechanism, end-of-deck state, whether the
direction toggle persists per-phrasebook, which subset is reviewed). These are implementation-time
decisions, not blockers to task creation — flagged per task below.

**Current state (as of this review).** `/lookup` is fully built and evaluated (lookup-api's LK-001–005
all pass). `web/app/` has zero `/lookup` wiring — its action pane only implements the legacy
`translation`/`generate`/`settings`/`card-edit`/`json` kinds against the retired `/translate` and
`/generate-cards` endpoints. Per this PRD's owner: web/ is stale and broken relative to `journeys.md`
and breaking changes are acceptable. **PH-000** (new) deletes the legacy generation UI and its API
routes up front so the rebuild isn't built alongside dead code; JSON/URI import
(`json-panel.js`/`card-edit-panel.js`/`add-cards-panel.js`/`deck-picker.js`) is untouched — it's a
separate, still-open secondary capture path per `docs/BRIEF.md` Open Questions, not superseded by
`journeys.md`.

## User Stories

### Journey 1 — Creating a phrasebook

1. As a user creating a new phrasebook, I want to set language and ability once at creation, so
   translations are pre-tuned to my level (values: Beginner/Intermediate/Advanced/None, default
   Beginner; both immutable after creation).
2. As a user, I want to type a term into the Input pane and submit via keyboard return, so I can look it
   up without a separate "Translate" button.
3. As a user, I want VIBE (Formality + Audience) settings that default to Polite/Staff and persist as my
   phrasebook's default tone, so translations match how I actually talk.
4. As a user, I want VIBE to show expanded on my phrasebook's first translation and collapsed to a
   one-line summary after that, so repeat look-ups aren't cluttered.
5. As a user, I want a primary translation card plus AI-clustered related groups after a look-up, so I
   can explore beyond the literal translation.
6. As a user, I want to tap a group to drill into its full term list, so I can browse everything in that
   theme.
7. As a user, I want to tap 🔖 on any term card to save it to my phrasebook immediately (no approval
   step), so curating feels fast.
8. As a user, I want a live basket badge counting terms saved since I opened the look-up, so I know my
   progress without leaving the flow.
9. As a user, I want tapping the basket badge (or swiping the action pane down) to jump straight to my
   phrasebook, so I don't have to back out of every stack level.
10. As a user, I want tapping 🔍 on any term card to start a new, narrower look-up seeded from that
    card's text plus its group name, so I can chain explorations without retyping.
11. As a user, I want Back to pop one level of the look-up stack, so navigation feels predictable.
12. As a user, I want terms I save from a group to keep that group as a labeled section in my finished
    phrasebook, so I can see where each term came from.
13. As a user, I want dismissible first-run coach marks pointing at the save/related-groups actions, so
    I learn the mechanic without permanent clutter.

### Journey 2 — Suggested phrasebooks

14. As a user, I want to browse a static, hand-curated list of suggested phrasebooks on the landing
    page, so I have a fast starting point.
15. As a user, I want to preview a suggested phrasebook's pre-filled terms (grouped by section) before
    committing, so I know what I'm getting.
16. As a user, I want to confirm/edit language and ability before a suggested phrasebook is added, so
    the content matches my level.
17. As a user, I want an explicit Save action on the preview screen, so adding a suggested phrasebook is
    a deliberate choice, not accidental.
18. As a user, I want a saved suggested phrasebook to move from Suggested into Recent and disappear from
    Suggested, so I don't see duplicates.

### Journey 3 — Adding terms to an existing phrasebook

19. As a user with an existing phrasebook, I want tapping Add to open the same look-up stack, so adding
    terms feels identical to creating a phrasebook.
20. As a user, I want the Input pane to open with VIBE collapsed and my recent HISTORY populated when my
    phrasebook has translated before, so repeat use is fast.
21. As a user, I want a newly saved standalone term to appear at the top of my phrasebook under a
    "Translations" section, so recent additions are easy to find.

### Journey 4 — Reviewing a phrasebook

22. As a user, I want to tap Review to enter a flashcard mode showing my phrasebook's terms one at a
    time, so I can self-test.
23. As a user, I want the answer side hidden until I manually reveal it, so review stays active recall,
    not passive reading.
24. As a user, I want to toggle the review direction mid-session, so I can practice both recall
    directions.
25. As a user, I want to play audio pronunciation for the current card, so I can hear correct
    pronunciation during review.

## Implementation Decisions

See `docs/journeys.md` for full interaction detail (pane vocabulary, stack push/pop semantics, exact
copy). See `docs/CARD_SCHEMA.md` for the `context` field already defined for group provenance. This PRD
does not duplicate either — `tasks.json` slices reference specific journeys.md sections directly.
