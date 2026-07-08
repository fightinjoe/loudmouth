# TODO

## Inconsistencies

- [ ] **iOS card schema is defined in multiple places** — `Card.swift` (SwiftData model), `ImportService.swift` (`CardInput`/`CardInputExample`), and `BackupService.swift` (`CardBackup`) each independently declare the card shape. A single canonical definition should be the source of truth.
- [ ] **`example` storage shape differs between iOS and web** — The web app stores `example` as a nested object `{ text, reading, translation }` on the card. iOS flattens it into three top-level fields on the `Card` model: `exampleText`, `exampleReading`, `exampleTranslation`. These should be reconciled so both platforms use the same shape (nested object preferred, matching the batch schema).
- [ ] **iOS: `AddCardsView` (import + backup/restore) has no entry point** — `DeckListViewModel.showAddCards` is declared and `DeckListView` presents `AddCardsView` as a `.sheet` when it's true, but nothing in the UI ever sets `showAddCards = true`, so JSON import (a core Phase-1 feature per `BRIEF.md`) and backup/restore (the only user of `BackupService`) are unreachable in the app. Wire up a trigger — e.g. an "Import / Backup" affordance in the navigation pane — that sets `showAddCards = true`.

## Design migration

The items below track gaps between `DESIGN.md` and the current web/iOS implementations.

### Information Architecture

- [ ] **Web: "All ${language} decks" overflow link** — When a language section has more than 5 decks, show an "All Japanese decks" (etc.) link. Tapping it shows a full deck-list pane for that language. Current web nav drawer shows all decks; add the 5-deck cap + overflow link.
- [ ] **iOS: "All ${language} decks" overflow link** — Same cap-at-5 + overflow link needed on the iOS deck list pane.

### Translation action pane

The current web/iOS implementations have a "press to reveal translation" card-review interaction, but **not** the standalone Translation bottom sheet described in DESIGN.md. The following items build that sheet.

- [ ] **Web: Deck with no language set edge case** — If the deck has no language set, show "🌐 Set language" pill that opens Generate Cards sheet for language selection instead of Translation sheet.

### Generate Cards action pane

Neither web nor iOS currently has an in-app Generate Cards flow. The current import is paste-JSON only.

- [ ] **Web: Generate Cards — entry point from "Add cards" text input** — In deck edit mode, show a text input at the bottom of the content pane with placeholder "Add cards". Tapping it slides up the Generate Cards action pane. This replaces (or supplements) the current paste-JSON import for adding cards to an existing deck.
- [ ] **Web: Generate Cards — auto-open for new/empty decks** — When a new/empty deck is created (via nav pane ADD FAB), the Generate Cards sheet opens automatically. Include a language selector below the textarea in this context.
- [ ] **iOS: Generate Cards — "Add cards" text input entry point** — In deck edit mode, add "Add cards" text input at bottom of card list. Tapping it opens the Generate Cards sheet.

### Deck pane / content pane header

- [ ] **Web: Edit cards mode — reorder drag** — DESIGN.md describes an "Edit cards" mode where cards can be dragged to reorder. When active, the add button becomes a "confirm" button, and the "Add cards" input appears at the bottom. Not currently implemented in web.
- [ ] **iOS: Edit cards mode — reorder drag** — Same reorder mode not yet implemented on iOS.

## Improvements

- [ ] Add support for the following languages in a way that is shared across web, ios, and api: Japanese, Chinese, Czech, Spanish, French, and German
- [ ] Expand the generate card API to pass in existing words so duplicates aren't created
- [ ] Add "suggested title" to the response when generating cards. The title should be as short as possible, and prepended with an emoji if an appropriate one exists
- [ ] Add suggested decks when there are none

## Bugs
