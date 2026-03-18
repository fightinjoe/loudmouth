# Language Flashcards — Product Brief

> A mobile-first travel companion for capturing useful language in context and reviewing it in short bursts throughout the day.

## Problem

When traveling, you encounter useful words and phrases constantly — at restaurants, shops, transit. Existing tools are built for long-term study, not rapid capture and same-day recall. Anki is too heavy; Duolingo has a fixed curriculum. There's no lightweight tool optimized for the traveler's rhythm: pick up new language in the moment, review it in 5-minute windows between activities, repeat throughout the day.

## Solution

A mobile-first web app where cards are generated externally (by AI) and imported as JSON. The learner captures vocabulary from the day, then reviews in short, frictionless sessions — optimized for multiple 5-minute check-ins, not hour-long study. Cards can be flipped through in review mode or browsed as a list. No scoring, no curriculum — just the language you're actually encountering.

## Users

**Primary:** The developer/author — a traveler studying Chinese (Mandarin) and Japanese who wants to capture and quickly recall useful language during trips. Success is practical: remembering words and phrases when you need them in context.

## Goals

- **Import** - Import AI-generated card batches quickly and without friction on mobile
- **Review** - Review cards in short, frequent sessions (optimized for 5-minute check-ins)
- **Browse** - Browse the card library as a list, not only by flipping through review mode
- **Low friction** - Minimum taps to start a review; as smooth as possible
- **Audio** - Play audio pronunciation for cards (mobile browsers)

## Non-Goals

- **Scoring** - No external measurement of progress (tests, scores, pass/fail)
- **AI generation** - Card generation is done externally; out of scope
- **Accounts/sync** - No user accounts or cloud sync
- **Native app** - Web only for now
- **Spaced repetition** - Deferred — lower priority, see Open Questions
- **In-app card creation** - No creating cards from scratch inside the app

## Key Differentiators

- **Travel-first:** Designed for the rhythm of a trip — capture language in the moment, review between activities
- **Content control (Anki-like):** The learner decides exactly what cards exist, via JSON import
- **Frictionless review (Duolingo-like):** Minimum taps to start reviewing; optimized for 5-minute windows
- **No gamification:** No streaks, points, or pressure — just cards

## Reference Apps

**Anki**

- Keep: Full control over card content; import-based workflow; deck organization
- Reject: Complex setup; desktop-first UX; steep learning curve
- Expected patterns: Deck selection before review; card flip on tap

**Duolingo / Babbel**

- Keep: Session feels light and bounded; easy to start a review; mobile-first interactions
- Reject: Fixed curriculum; gamification; no content ownership; no import

## Assumptions

- Pasting a JSON blob on mobile is acceptable UX for import (untested on mobile — proceeding with paste as the import mechanism)
- Random card order is sufficient for initial review sessions
- The travel use case is the primary frame — long-term cross-topic study is explicitly not the goal
- The Library Schema can be extended later to support spaced repetition without a breaking change

## Open Questions

- [x] 🟢 **Is Web Speech API adequate for audio on iOS Safari and Android Chrome?** — ✅ Resolved: viable on iOS Safari (quality exceeded expectations). Silent on macOS Safari, poor on Chrome Desktop. Build audio as a mobile-first feature; don't rely on desktop browsers.
- [x] 🟢 **Is paste-based JSON import actually usable on mobile?** — ✅ Schema and tooling validated. Mobile paste UX untested but unblocked; proceeding with paste as import mechanism. See `prototypes/2-json-import/`.
- [ ] 🟡 **What does the list/browse view look like, and how are cards organized?** The app needs a way to peruse cards as a list, not only via flip review. How cards are grouped is unresolved — likely multiple layers (import batch, trip, context/topic). The right grouping model shapes the data structure and UX significantly. Needs PRD.
- [ ] 🟡 **Should the app support deriving new cards from existing ones?** A card for "soup" could generate "I like soup", "do you have soup?", etc. — natural combinations that expand practice without AI re-involvement. Scope and UX unclear. Is this in-app, or always done externally?
- [ ] 🟡 **Furigana as ruby text** — does `reading` render as plain text below the card, or as ruby annotation above kanji? Ruby rendering is a meaningful UI challenge on mobile, especially cross-browser.
- [ ] 🟡 **How does spaced repetition get added without a self-rating signal?** Lower priority — not needed for travel use case. The tension between "no scoring" and "SR as a future goal" must be resolved before SR can be designed. Deferred until core is built.

## Prototype Map

- [x] 🟢 **Is Web Speech API adequate on mobile?** → ✅ Answered — iOS Safari quality is good. macOS Safari: silent. Chrome Desktop: poor. Audio is viable as a mobile-first feature. See `prototypes/1-web-speech/`.
- [x] 🟢 **Is paste-based JSON import usable on mobile?** → ✅ Complete — card schema and `/generate-cards` tooling validated. Mobile paste gesture not tested; proceeding with paste. See `prototypes/2-json-import/`.
- [ ] 🟡 **Furigana ruby text rendering** → Build a minimal HTML page rendering Japanese cards with ruby annotations. Test on iOS Safari and Android Chrome. Learn: whether native ruby rendering is sufficient or a custom component is needed.
- [ ] 🟡 **List/browse view and card organization** → Build a minimal list view prototype exploring grouping models (by batch, trip, context). Learn: what grouping structure feels natural and what data model it requires.

## Features & Phases

### Phase 1: Core — Import, review, audio
- **JSON import** - Paste a card batch JSON blob; app assigns IDs and timestamps on import
- **Flip review** - Tap-to-flip card review with random order; no scoring
- **Audio playback** - Web Speech API TTS on mobile (iOS Safari primary target)

### Phase 2: Library — Browse and organize
- **List/browse view** - Peruse cards as a list, grouped by import batch or context; UX to be prototyped
- **Furigana ruby text** - Render Japanese readings as ruby annotations above kanji (pending prototype)

### Phase 3: Retention — Smarter review
- **Spaced repetition** - Deferred; requires resolving the no-self-rating tension before design can begin

## Technical Notes

- **Platform:** Mobile-first PWA or responsive web app — audio feature is iOS Safari only; desktop audio support is out of scope
- **Audio:** Web Speech API with `lang="zh-CN"` / `lang="ja-JP"`. Do not attempt to support macOS Safari or Chrome Desktop for audio.
- **Storage:** Client-side only; IndexedDB likely (localStorage insufficient for library scale)
- **No backend** required in initial version
- **Library Schema** will need a `reviewHistory` or equivalent field for future SR support — worth designing the extension point now even if unused
- **Session log** is a separate data structure from the card Library

### Card Batch Schema (import format)

Validated in `prototypes/2-json-import/`. `id` and `importedAt` are never present in the batch — assigned by the app at import time.

```json
{
  "cards": [
    {
      "lang": "zh | ja",
      "type": "word | phrase | sentence",
      "front": {
        "text": "string",
        "reading": "string (optional — pinyin for zh, hiragana for ja)"
      },
      "back": {
        "translation": "string",
        "notes": "string (optional)"
      },
      "example": {
        "text": "string",
        "reading": "string (optional)",
        "translation": "string (optional)"
      }
    }
  ]
}
```

**Required per card:** `lang`, `front.text`, `back.translation`. All other fields optional.

### Library Schema (internal storage)

```json
{
  "version": "1",
  "cards": [
    {
      "id": "uuid-v4",
      "importedAt": "ISO 8601 timestamp",
      "lang": "zh | ja",
      "type": "word | phrase | sentence",
      "front": { "text": "string", "reading": "string (optional)" },
      "back": { "translation": "string", "notes": "string (optional)" },
      "example": { "text": "string", "reading": "string (optional)", "translation": "string (optional)" }
    }
  ]
}
```

All cards from the same paste share the same `importedAt` — this is how import batches are associated.

## Out of Scope (for now)

- Spaced repetition (deferred — lower priority, not needed for travel use case)
- Long-term cross-topic language study (not the goal)
- OCR / camera input
- URL import
- User accounts, cloud sync
- Native app
- In-app card creation from scratch
- Furigana ruby text rendering (prototype candidate, not blocking PRD)

