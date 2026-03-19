# PRD 001 — V0 Core App: Storage, Decks, Import, Review, Browse

## Problem Statement

The prototypes have validated the two key unknowns: Web Speech API audio is viable on iOS Safari, and paste-based JSON import is workable. There is no actual app yet — only throwaway HTML experiments. The learner has no way to persistently store cards, organize them into decks, or review them across sessions. Everything discovered in the prototypes needs to be elevated into a real, installable PWA.

## Solution

Build v0 of the Loudmouth PWA in `src/` using Vite and plain JS. The app stores cards and decks in IndexedDB (via Dexie.js), provides a language-tabbed home screen showing decks, supports JSON import with deck assignment, and enables tap-to-flip card review and a flat card browse view per deck. Audio playback via Web Speech API is carried forward from the prototype.

## User Stories

1. As a learner, I want to open the app and see my decks organized by language, so that I can quickly find what I want to review.
2. As a learner, I want to swipe left and right to switch between languages on the home screen, so that I can navigate my Mandarin and Japanese decks separately without extra taps.
3. As a learner, I want to see an empty state with an import prompt when I have no cards, so that I know exactly what to do when I first open the app.
4. As a learner, I want to tap the body of a deck card to immediately start reviewing that deck, so that I can get into review with minimum taps.
5. As a learner, I want to tap a chevron on a deck card to see all cards in that deck as a list, so that I can browse rather than flip when I want to.
6. As a learner, I want to flip through cards one at a time in random order, so that I'm not just memorizing sequence.
7. As a learner, I want to tap a card to flip it from front (target language) to back (translation + notes + example), so that I can self-test my recall.
8. As a learner, I want to navigate to the previous and next card during review, so that I can move through the deck at my own pace.
9. As a learner, I want to hear the front of a card spoken aloud in the correct language, so that I can learn pronunciation without guessing.
10. As a learner, I want to paste a JSON card batch, see how many valid cards were parsed, and confirm before importing, so that I know what I'm adding before it's saved.
11. As a learner, I want every imported card to automatically be added to an "All [Language] Cards" deck, so that I always have a catch-all deck without extra steps.
12. As a learner, I want to optionally assign imported cards to a named deck during import, so that I can keep restaurant words, transit words, etc. separate.
13. As a learner, I want to pick an existing deck from a dropdown when importing, so that I can add to decks I've already created.
14. As a learner, I want to create a new named deck during import by choosing "New deck…" from the dropdown, so that I can organize new batches without leaving the import flow.
15. As a learner, I want the app to work offline after first load, so that I can review cards without a data connection while traveling.
16. As a learner, I want the app to be installable via "Add to Home Screen" on iOS Safari, so that it behaves like a native app without browser chrome.
17. As a learner, I want cards to persist across sessions, so that I don't lose my library when I close the app.
18. As a learner, I want the review counter to show my position in the deck (e.g., "3 / 12"), so that I know how much is left in a session.
19. As a learner, I want to see the card type (word / phrase / sentence) labeled on the card front, so that I know what kind of item I'm reviewing.
20. As a learner, I want the reading (pinyin / hiragana) shown on the card front below the target text, so that I can check my reading before flipping.
21. As a learner, I want to see the example sentence, its reading, and its translation on the card back when present, so that I can understand the word in context.
22. As a learner, I want the card back to show notes when present, so that I can see grammar tips or register information.
23. As a learner, I want the browse view to show all cards in a deck as a scrollable list, so that I can scan what I've imported without entering review mode.
24. As a learner, I want each row in the browse list to show the front text and translation, so that I can quickly scan my vocabulary.
25. As a learner, I want the import flow to show clear errors when the pasted JSON is malformed or missing required fields, so that I know what went wrong and can fix it.

## Implementation Decisions

### Modules

**`db.js` — Data layer (Dexie.js)**
- Owns the Dexie instance, schema declaration, and all IndexedDB reads/writes.
- Exposes async functions: `importCards(cards, deckId?)`, `getDecks(lang?)`, `getCards(deckId)`, `createDeck(name, lang)`, `getOrCreateAllDeck(lang)`.
- The "All [Language] Cards" deck (`all-zh`, `all-ja`) is created lazily on first import for that language and is never shown in the "create/select deck" dropdown.
- Deck IDs follow the schema: zero-padded counter + kebab slug (e.g. `001-restaurant-words`). The "All" decks use fixed IDs (`all-zh`, `all-ja`) outside the counter sequence.
- Card IDs are UUID v4, assigned at import time. `createdAt` is ISO 8601, shared across all cards in the same import batch.
- `deckIds` on each card always includes the All deck for the card's language, plus any optional secondary deck.

**`import-parser.js` — JSON validation**
- Pure function: `parseCardBatch(jsonString) → { cards, errors }`.
- Validates required fields (`lang`, `front.text`, `back.translation`). Filters out invalid cards; returns count of skipped.
- No side effects, no IndexedDB access.

**`tts.js` — Text-to-speech wrapper**
- Wraps `SpeechSynthesisUtterance`. Exposes `speak(text, lang)` and `cancel()`.
- Handles the `onend`/`onerror` lifecycle. Returns a promise or fires a callback so the caller can update button state.
- Detects TTS support at module load; exports `ttsAvailable` boolean.

**`router.js` — Hash-based screen switcher**
- Listens to `hashchange`. Maps hash fragments to screen render functions.
- Screens: `#home`, `#import`, `#review?deckId=…`, `#browse?deckId=…`.
- Passes parsed query params to each screen function.

**Screen modules** (`screen-home.js`, `screen-import.js`, `screen-review.js`, `screen-browse.js`)
- Each exports a single `render(params)` function that writes into a shared `#app` container.
- No shared mutable state between screens — each render is self-contained.
- Screen-home: renders language tabs (zh / ja), deck list per active language, empty state if no decks. Swipe left/right switches active language tab.
- Screen-import: 3-step flow — paste textarea → parse + confirm card count → deck assignment (All auto-assigned; dropdown for optional secondary deck with "New deck…" option) → import to DB → redirect to home.
- Screen-review: random-ordered card queue for a deck; flip animation; prev/next navigation; Play button; keyboard shortcuts (← → Space/Enter p) carried from prototype.
- Screen-browse: flat scrollable list of cards for a deck, front text + translation per row.

### Architecture

- Entry point: `src/main.js` initializes Dexie, registers the service worker, and calls `router.js`.
- All screens render into a single `<div id="app">` in `index.html`.
- CSS lives in `src/styles/` — one file per screen plus a shared `base.css`. Design tokens (colors, radii, typography) carried from the prototype's `:root` variables.
- Vite config outputs to `dist/` for Vercel deployment.
- Service worker (via `vite-plugin-pwa` or a hand-written `sw.js`) caches the app shell for offline use.
- PWA manifest declares `display: standalone`, correct icons, and `lang` metadata.

### Data Model (carried from BRIEF.md, no changes)

- `cards` table: `id`, `createdAt`, `lang`, `type`, `deckIds[]`, `front`, `back`, `example`.
- `decks` table: `id`, `name`, `lang`, `createdAt`.
- Dexie indexes: `cards` indexed on `lang`, `deckIds` (multiEntry); `decks` indexed on `lang`.

### Swipe Gesture (home screen language tabs)

- Implemented with `touchstart`/`touchend` delta detection — no library.
- Threshold: 50px horizontal delta to trigger tab change.
- Also navigable via tab buttons rendered above the deck list.

## Testing Decisions

**What makes a good test here:** Test the module's external contract — inputs and outputs — not internal implementation. Do not test which Dexie methods were called; test what data is in the DB after an operation, or what the parser returns given a specific input.

**`import-parser.js`**
- Input: valid JSON string → returns correct card array with no errors.
- Input: JSON missing `lang` → card is skipped, error reported.
- Input: JSON missing `front.text` → card is skipped, error reported.
- Input: JSON missing `back.translation` → card is skipped, error reported.
- Input: completely invalid JSON → returns empty cards array, parse error.
- Input: mix of valid and invalid cards → valid cards returned, invalid skipped, error count correct.
- Input: optional fields (`reading`, `notes`, `example`) absent → card returned without them, no error.

**`db.js`**
- `importCards` with no secondary deck → cards stored with only the All deck ID in `deckIds`.
- `importCards` with a secondary deck ID → cards stored with both deck IDs in `deckIds`.
- `getOrCreateAllDeck('zh')` called twice → only one `all-zh` deck exists.
- `createDeck('Restaurant words', 'ja')` → deck ID is `001-restaurant-words`, slug correct.
- `createDeck` called twice → counter increments correctly (second deck is `002-…`).
- `getCards(deckId)` → returns only cards that include that deckId in their `deckIds` array.
- `getDecks('zh')` → returns only zh decks, excluding ja decks.
- All deck (`all-zh`) → excluded from results of `getDecks` used for the import dropdown.

**Test tooling:** Vitest (compatible with Vite). Dexie's `fake-indexeddb` adapter for in-memory DB in Node.

## Out of Scope

- Search within browse view (deferred to a future PRD).
- Furigana ruby text rendering (prototype planned but not blocking v0).
- JSON export / library backup (Phase 2).
- Multi-deck assignment at import time beyond one optional secondary deck.
- Spaced repetition or any self-rating signal.
- Desktop audio support (Web Speech API audio is mobile-only by design).
- In-app card creation from scratch.
- Any backend, user accounts, or cross-device sync.

## Further Notes

- The visual design language (color tokens, card flip animation, button styles) should be carried directly from `prototypes/1-web-speech/index.html` to keep continuity and avoid re-doing design work.
- The import flow UX can be refined in a future PRD once the paste-on-mobile experience is tested end-to-end on the real app.
- PWA installability must not regress — any change to the service worker or manifest should be deliberate.
- The "All [Language] Cards" deck is a system deck: it cannot be renamed, deleted, or selected as the optional secondary deck during import.
