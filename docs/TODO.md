# TODO

## Inconsistencies

- [ ] **iOS card schema is defined in multiple places** — `Card.swift` (SwiftData model), `ImportService.swift` (`CardInput`/`CardInputExample`), and `BackupService.swift` (`CardBackup`) each independently declare the card shape. A single canonical definition should be the source of truth.
- [ ] **`example` storage shape differs between iOS and web** — The web app stores `example` as a nested object `{ text, reading, translation }` on the card. iOS flattens it into three top-level fields on the `Card` model: `exampleText`, `exampleReading`, `exampleTranslation`. These should be reconciled so both platforms use the same shape (nested object preferred, matching the batch schema).
- [ ] **LLM:** make sure that `google` is the default LLM for all API requests

## Design migration

The items below track gaps between `DESIGN.md` and the current web/iOS implementations.

### Information Architecture

- [x] **Web: content pane slides right to reveal nav pane** — Current web impl uses a left drawer that overlays the content. DESIGN.md specifies the content pane slides *off to the right*, revealing the nav pane underneath (not an overlay). Refactor `deck-view.js` drawer animation so the main content translates right instead of a side drawer sliding over it.
- [x] **Web: nav pane ADD FAB (bottom-left)** — DESIGN.md calls for a `+` FAB pinned to the bottom-left of the navigation pane that creates a new deck and immediately opens the Generate Cards action pane. The current web `+` button in the drawer opens the paste-JSON import sheet instead. Replace with a FAB that calls `/generate-cards` (see `api/README.md`) and creates a deck from the result.
- [x] **iOS: ADD FAB on nav pane (bottom-left)** — Same as above; the iOS nav pane `+` button currently opens `AddCardsView` (paste JSON). Replace with a FAB that opens the Generate Cards sheet (not the paste-JSON import).
- [ ] **Web: deck title tap menu ("Settings" / "Edit cards")** — DESIGN.md specifies tapping the deck title in the header reveals a two-item menu: "Settings" (slides up deck-settings action pane) and "Edit cards" (enters reorder mode). Not present in current web implementation.
- [ ] **iOS: deck title tap menu** — Same as above; not present in current iOS implementation.
- [ ] **Web: "All ${language} decks" overflow link** — When a language section has more than 5 decks, show an "All Japanese decks" (etc.) link. Tapping it shows a full deck-list pane for that language. Current web nav drawer shows all decks; add the 5-deck cap + overflow link.
- [ ] **iOS: "All ${language} decks" overflow link** — Same cap-at-5 + overflow link needed on the iOS deck list pane.

### Translation action pane

The current web/iOS implementations have a "press to reveal translation" card-review interaction, but **not** the standalone Translation bottom sheet described in DESIGN.md. The following items build that sheet.

- [ ] **Web: Translation action pane (bottom sheet)** — Create a new bottom-sheet component (white card, 40px top-radius, scrim over deck screen) triggered by the `+` FAB in the deck header. Header: back FAB (left) + non-tappable language label (right). Body: large multi-line text input (32px Roboto Flex Light, `--text-body`). "Translate" pill button bottom-right. Wire to `POST /translate` (see `api/README.md`). Display skeleton rows while in-flight, then result cards with reading/CJK text/English/play icon.
- [ ] **Web: Translation result cards layout** — Each result card row: reading (ruby, 14px `--text-caption`) above CJK text (24px `--text-body`), English meaning (14px `--text-caption`) below. Top card `border-radius: 20px 20px 0 0`; bottom card `0 0 20px 20px`; middle cards no radius. "Swipe or tap to add card" hint above the list.
- [ ] **Web: Swipe-to-add on translation result cards** — Top card is swipeable: drag reveals green ✓ (add) on left, red × (dismiss) + blue ✏ (edit) on right. Swipe right past threshold or tap → card added to current deck and removed from list. After all cards are added/dismissed, sheet returns to empty state.
- [ ] **Web: Translation pane error states** — Timeout (504): "Could not generate — try again. [↻]". Rate-limited (429): "Try again in 60 seconds." Network error: "No connection." Empty result: "No result — try rephrasing. [↻]".
- [ ] **Web: Deck with no language set edge case** — If the deck has no language set, show "🌐 Set language" pill that opens Generate Cards sheet for language selection instead of Translation sheet.
- [ ] **iOS: Translation action pane (bottom sheet)** — Equivalent of the above web Translation sheet. Triggered by `+` FAB in deck header. Wire to `POST /translate`. Show skeleton while loading, then result cards. Swipe/tap to add card to current deck.
- [ ] **iOS: Translation result card swipe-to-add** — Same interaction as web: swipe right to add, swipe left to dismiss/edit. After last card, return to empty state.
- [ ] **iOS: Translation pane error states** — Same error states as web.

### Generate Cards action pane

Neither web nor iOS currently has an in-app Generate Cards flow. The current import is paste-JSON only.

- [ ] **Web: Generate Cards action pane (bottom sheet)** — Create bottom sheet matching DESIGN.md layout: title "Add cards" (centered, 24px), back chevron left, instruction label "Share a situation or context" (14px muted), multi-line textarea (124px, 20px inner padding, `border-radius: 20px`, inset shadow), language selector (flag + name + ▲▼, bottom-left), Generate button (bottom-right, `border-radius: 100px`). Wire to `POST /generate-cards` (see `api/README.md`). On success, add returned cards to the current deck and close the sheet. For new/empty decks show a language selector.
- [ ] **Web: Generate Cards — entry point from "Add cards" text input** — In deck edit mode, show a text input at the bottom of the content pane with placeholder "Add cards". Tapping it slides up the Generate Cards action pane. This replaces (or supplements) the current paste-JSON import for adding cards to an existing deck.
- [ ] **Web: Generate Cards — auto-open for new/empty decks** — When a new/empty deck is created (via nav pane ADD FAB), the Generate Cards sheet opens automatically. Include a language selector below the textarea in this context.
- [ ] **iOS: Generate Cards action pane (bottom sheet)** — Equivalent of the above web Generate Cards sheet. Wire to `POST /generate-cards`. On success, add cards to deck and close. Auto-open for new/empty decks with language selector.
- [ ] **iOS: Generate Cards — "Add cards" text input entry point** — In deck edit mode, add "Add cards" text input at bottom of card list. Tapping it opens the Generate Cards sheet.

### Deck pane / content pane header

- [ ] **Web: `+` FAB moves to header top-right (Translation entry)** — Per DESIGN.md, the deck header has a `+` FAB on the **right** that opens the Translation sheet (not the existing import panel). The existing import flow should be accessible from elsewhere (e.g., deck settings or a separate route).
- [ ] **iOS: `+` FAB moves to header top-right (Translation entry)** — Same as above.
- [ ] **Web: Edit cards mode — reorder drag** — DESIGN.md describes an "Edit cards" mode where cards can be dragged to reorder. When active, the add button becomes a "confirm" button, and the "Add cards" input appears at the bottom. Not currently implemented in web.
- [ ] **iOS: Edit cards mode — reorder drag** — Same reorder mode not yet implemented on iOS.

### Dismissal

- [ ] **Web: all action panes dismissible by swipe-down** — DESIGN.md specifies swipe-down dismissal for Translation and Generate Cards action panes. Verify and implement consistent swipe-down-to-dismiss across all bottom sheets in the web app.
- [ ] **iOS: all action panes dismissible by swipe-down** — Same; verify Generate Cards and Translation sheets support swipe-down-to-dismiss (standard iOS sheet behavior, but confirm it is wired correctly once those sheets are built).

## Improvements

- [ ] Add support for the following languages in a way that is shared across web, ios, and api: Japanese, Chinese, Czech, Spanish, French, and German
- [ ] Expand the generate card API to pass in existing words so duplicates aren't created
- [ ] Add "suggested title" to the response when generating cards. The title should be as short as possible, and prepended with an emoji if an appropriate one exists