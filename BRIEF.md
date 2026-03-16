# Language Flashcards — Product Brief

> A mobile-first web app for a self-directed language learner to import AI-generated flashcards and review them in focused, bounded sessions.

## Problem

Language learning requires consistent, deliberate exposure to vocabulary and phrases in context. Existing tools either offer too much friction (Anki's complex card management and setup) or too little control (Duolingo's fixed curriculum). There's no lightweight tool that combines learner control over content with the smoothness of modern review UX.

## Solution

A mobile-first web app where cards are generated externally (by AI) and imported as JSON. The learner browses their library, assembles review sessions, and flips through cards. Sessions are bounded by card count or time and loop back to the start of the deck if the end is reached early. No scoring, no curriculum — just deliberate exposure to content the learner chose.

## Users

**Primary:** The developer/author — a self-directed language learner studying Chinese (Mandarin) and Japanese for personal enrichment. No external tests or metrics. Success is subjective: feeling more familiar with content over time.

## Goals

- Import AI-generated card batches quickly and without friction, even on mobile
- Review cards in bounded sessions (by count or time), looping when the deck ends early
- Organize cards into decks and browse by import batch or deck
- Track study sessions (when, how long, how many cards) — for awareness, not stats
- Feel as smooth and low-friction as Duolingo or Babbel during review

## Non-Goals

- External measurement of progress (tests, scores, pass/fail)
- AI card generation (done externally, out of scope)
- User accounts or cloud sync
- Native app (web only for now)
- Spaced repetition (deferred — see Open Questions)
- In-app card creation

## Key Differentiators

- **Content control (Anki-like):** The learner decides exactly what cards exist and how they're organized, via JSON import
- **Review UX (Duolingo-like):** Sessions are smooth, bounded, and low-friction — no configuration overhead before starting
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
- Manual deck assignment after import is acceptable (vs. tagging at import time)
- Random card order is sufficient for initial review sessions
- Session tracking without self-rating is valuable on its own
- The Library Schema can be extended later to support spaced repetition without a breaking change

## Open Questions

- 🟢 **Is Web Speech API adequate for audio on iOS Safari and Android Chrome?** — ✅ Resolved: viable on iOS Safari (quality exceeded expectations). Silent on macOS Safari, poor on Chrome Desktop. Build audio as a mobile-first feature; don't rely on desktop browsers.
- 🟢 **Is paste-based JSON import actually usable on mobile?** — ✅ Schema and tooling validated. Mobile paste UX untested but unblocked; proceeding with paste as import mechanism. See `prototypes/2-json-import/`.
- 🟡 **How does spaced repetition get added without a self-rating signal?** The current model has no mechanism for the learner to signal recall quality. SR requires this. The tension between "no scoring" and "SR as a secondary goal" must be resolved before SR can be designed.
- 🟡 **What does session tracking capture exactly?** At minimum: date, duration, card count, deck/batch reviewed. The data model should be defined before building.
- 🟡 **Furigana as ruby text** — does `reading` render as plain text below the card, or as ruby annotation above kanji? Ruby rendering is a meaningful UI challenge on mobile, especially cross-browser.
- 🟢 **Does the card schema cover all zh/ja card types?** Hand-write 10–15 real cards across both languages to stress-test edge cases.

## Prototype Map

1. **Is Web Speech API adequate on mobile?** → ✅ Answered — iOS Safari quality is good. macOS Safari: silent. Chrome Desktop: poor. Audio is viable as a mobile-first feature. See `prototypes/1-web-speech/`.
2. **Is paste-based JSON import usable on mobile?** → ✅ Complete — card schema and `/generate-cards` tooling validated. Mobile paste gesture not tested; proceeding with paste. See `prototypes/2-json-import/`.
3. **Furigana ruby text rendering** → Build a minimal HTML page rendering Japanese cards with ruby annotations. Test on iOS Safari and Android Chrome. Learn: whether native ruby rendering is sufficient or a custom component is needed.

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

- Spaced repetition (deferred pending SR/scoring tension resolution)
- OCR / camera input
- URL import
- User accounts, cloud sync
- Native app
- In-app card creation
- Furigana ruby text rendering (prototype candidate, not blocking PRD)

