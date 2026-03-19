# Plan: V0 Core App

> Source PRD: [#1](https://github.com/fightinjoe/loudmouth/issues/1) — `docs/prds/001-v0-core-app.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **Routes**: Hash-based. `#home` (default), `#import`, `#review?deckId=<id>`, `#browse?deckId=<id>`
- **Render target**: Single `<div id="app">` in `index.html`. Each screen replaces its contents on navigation.
- **Schema — cards**: `id` (UUID v4), `createdAt` (ISO 8601), `lang` (`zh`|`ja`), `type`, `deckIds[]`, `front` (`text`, `reading?`), `back` (`translation`, `notes?`), `example?` (`text`, `reading?`, `translation?`)
- **Schema — decks**: `id` (fixed `all-zh`/`all-ja` for system decks; `NNN-slug` for user decks), `name`, `lang`, `createdAt`
- **System decks**: `all-zh` and `all-ja` are created lazily on first import. Every card always belongs to its language's All deck. System decks never appear in the import dropdown.
- **Deck ID format**: Zero-padded global counter + kebab slug (e.g. `001-restaurant-words`). Counter is global across all user decks.
- **Storage**: IndexedDB via Dexie.js. Indexes: `cards` on `lang` and `deckIds` (multiEntry); `decks` on `lang`.
- **Audio**: Web Speech API. `zh` → `zh-CN`, `ja` → `ja-JP`. Mobile-only; no attempt to support desktop.
- **Styling**: Design tokens (colors, radii, typography) from `prototypes/1-web-speech/index.html` carried forward. One CSS file per screen + shared `base.css`.
- **Tests**: Vitest. `import-parser` is pure functions (no browser). `db` uses `fake-indexeddb` Dexie adapter (no browser). Screen modules are not unit tested.

---

## Phase 1: Project scaffold + PWA shell

**GitHub issue**: [#2](https://github.com/fightinjoe/loudmouth/issues/2)
**User stories**: 15 (offline after first load), 16 (installable on iOS Safari)

### What to build

Scaffold the Vite project in `src/`. Wire up a hash-based router, PWA manifest, and service worker. No content yet — just a working shell that installs on iOS Safari and survives an offline reload.

### Acceptance criteria

- [x] `npm run dev` starts a local dev server
- [x] `npm run build` produces a deployable `dist/`
- [x] Hash router handles `#home`, `#import`, `#review`, `#browse` (stubs OK)
- [x] PWA manifest declares `display: standalone`
- [x] Service worker caches the app shell for offline use
- [ ] App is installable via "Add to Home Screen" on iOS Safari
- [x] Shared CSS design tokens are in `src/styles/base.css`

---

## Phase 2: Data layer + tests

**GitHub issue**: [#3](https://github.com/fightinjoe/loudmouth/issues/3)
**User stories**: 17 (cards persist across sessions)

### What to build

The Dexie.js data layer with the full IndexedDB schema and all CRUD operations. This is the only module that touches the database. Verified by a Vitest suite using `fake-indexeddb` so tests run in Node.

### Acceptance criteria

- [x] Exports: `importCards(cards, deckId?)`, `getDecks(lang?)`, `getCards(deckId)`, `createDeck(name, lang)`, `getOrCreateAllDeck(lang)`
- [x] `importCards` with no secondary deck → `deckIds` contains only the All deck
- [x] `importCards` with secondary deck → `deckIds` contains both
- [x] `getOrCreateAllDeck` called twice → exactly one system deck exists
- [x] Deck slug generation correct; counter increments across calls
- [x] `getCards` returns only cards belonging to the given deck
- [x] `getDecks` filters by language; excludes system decks from import dropdown results
- [x] All behaviour verified by Vitest + `fake-indexeddb`

---

## Phase 3: Import parser + tests

**GitHub issue**: [#4](https://github.com/fightinjoe/loudmouth/issues/4)
**User stories**: 10 (see valid card count before confirming), 25 (clear errors for bad JSON)

### What to build

A pure function `parseCardBatch(jsonString) → { cards, errors }` with no side effects. Validates required fields, skips invalid cards, reports errors. Full Vitest suite — no browser, no DB.

### Acceptance criteria

- [x] Valid JSON → correct card array, empty errors
- [x] Missing `lang`, `front.text`, or `back.translation` → card skipped, error reported
- [x] Invalid JSON string → empty cards, parse error
- [x] Mixed valid/invalid → valid returned, skip count correct
- [x] Optional fields absent → card returned without them, no error
- [x] All cases covered by Vitest tests

---

## Phase 4: Home screen — empty state

**GitHub issue**: [#5](https://github.com/fightinjoe/loudmouth/issues/5)
**User stories**: 1 (decks by language), 2 (swipe to switch language), 3 (empty state + import CTA)

### What to build

The home screen with language tabs (zh / ja), swipe-to-switch gesture, and an empty state shown when no decks exist for the active language. Reads from the data layer but renders nothing meaningful yet — that comes in Phase 6.

### Acceptance criteria

- [ ] Renders at `#home` (default route)
- [ ] Language tabs switch active language on tap
- [ ] Swipe left/right (50px threshold, no library) switches active language
- [ ] Empty state shown with explanatory copy and a link to `#import` when no decks exist

---

## Phase 5: Import flow end-to-end

**GitHub issue**: [#6](https://github.com/fightinjoe/loudmouth/issues/6)
**User stories**: 10–14 (paste, confirm, All deck, optional deck, dropdown, new deck), 25 (error handling)

### What to build

The 3-step import flow: paste JSON → confirm parsed card count + errors → assign to deck → write to DB → redirect to `#home`. Wires the parser and data layer together for the first time. After this phase, data can actually enter the system.

### Acceptance criteria

- [ ] Renders at `#import`
- [ ] Valid JSON paste shows card count; invalid shows errors and blocks progress
- [ ] Skipped-card count shown when some cards are invalid
- [ ] Deck dropdown lists user-created decks for the detected language; system decks excluded
- [ ] "New deck…" option reveals name input; creates deck on submit
- [ ] Successful import redirects to `#home`
- [ ] Every imported card has `deckIds` containing the All deck (+ optional secondary)
- [ ] Import with no secondary deck selected succeeds (All deck only)

---

## Phase 6: Home screen — populated deck list

**GitHub issue**: [#7](https://github.com/fightinjoe/loudmouth/issues/7)
**User stories**: 1 (decks by language), 4 (tap body → review), 5 (tap chevron → browse)

### What to build

Extend the home screen to show deck cards once cards have been imported. Each card has two tap targets: the body navigates to review, the right-chevron navigates to browse. The All deck appears first. Switching language tabs filters to that language's decks.

### Acceptance criteria

- [ ] Deck cards appear after import, showing name and card count
- [ ] "All [Language] Cards" deck shown first
- [ ] Tapping deck body navigates to `#review?deckId=<id>`
- [ ] Tapping chevron navigates to `#browse?deckId=<id>`
- [ ] Language tab switch shows only decks for that language
- [ ] Empty state no longer shown when decks exist

---

## Phase 7: Review screen

**GitHub issue**: [#8](https://github.com/fightinjoe/loudmouth/issues/8)
**User stories**: 6–8 (random order, flip, prev/next), 18–22 (counter, type badge, reading, example, notes)

### What to build

The tap-to-flip review screen for a given deck. Cards in random order, 3D flip animation carried from the prototype, prev/next navigation, counter, full card content rendering on both faces, keyboard shortcuts.

### Acceptance criteria

- [ ] Renders at `#review?deckId=<id>` with cards from that deck in random order
- [ ] Tap flips card (3D CSS animation, front ↔ back)
- [ ] Counter shows position (e.g. "3 / 12")
- [ ] Prev/Next navigate; Prev disabled on first card, Next on last
- [ ] Card front: type badge, target text, reading if present
- [ ] Card back: translation, notes if present, example (text + reading + translation) if present
- [ ] Keyboard shortcuts: ← prev, → next, Space/Enter flip, `p` (placeholder for audio)

---

## Phase 8: Audio playback

**GitHub issue**: [#9](https://github.com/fightinjoe/loudmouth/issues/9)
**User stories**: 9 (hear pronunciation in correct language)

### What to build

A TTS wrapper module exposing `speak(text, lang)`, `cancel()`, and `ttsAvailable`. Wired into the review screen's Play button. Carried from `prototypes/1-web-speech/index.html`. Play button hidden when TTS unavailable.

### Acceptance criteria

- [ ] zh cards speak at `zh-CN`; ja cards speak at `ja-JP`
- [ ] Button shows "Playing…" while speaking; resets on end or error
- [ ] Navigating to a new card cancels in-progress speech
- [ ] `p` keyboard shortcut triggers Play
- [ ] Play button hidden when Web Speech API unavailable

---

## Phase 9: Browse screen

**GitHub issue**: [#10](https://github.com/fightinjoe/loudmouth/issues/10)
**User stories**: 5 (tap chevron → browse), 23 (scrollable card list), 24 (front text + translation per row)

### What to build

A flat scrollable list of all cards in a deck, reached via the chevron tap on home screen deck cards. Each row shows front text and translation. Deck name as header. Back control returns to `#home`.

### Acceptance criteria

- [ ] Renders at `#browse?deckId=<id>`
- [ ] All cards for the deck shown in a scrollable list
- [ ] Each row shows front text and translation
- [ ] Deck name shown as header
- [ ] Back control navigates to `#home`
