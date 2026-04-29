# PRD: Deck-First UI Redesign

## Problem Statement

The current app starts on a deck list home screen with language tabs, separate browse/review modes, and multi-level navigation. This adds friction to the core loop: a traveler wants to open the app and immediately see and interact with their cards—not navigate to find them. The existing UI also lacks a polished review experience: there is no swipe-to-advance, no press-to-reveal translation, and the card detail screen is disconnected from the browse list. The overall visual design does not match the intended aesthetic established in the Figma prototype.

## Solution

Redesign the app's navigation and UI to match the Figma prototype (frame 38:653), making the most recently used deck the default starting point. The app opens directly to a card list for the last-used deck. The deck title at the top is tappable and slides up the deck picker. Card review is launched by tapping any card in the list, which slides up the single-card view—a swipeable, audio-first review experience. Add/import and export controls move into the deck picker panel. The visual design adopts the new token set (beige background, white cards, Inter typography) from the prototype.

## User Stories

1. As a learner, I want the app to open directly to my last-used deck's card list, so that I can start reviewing immediately without navigating.
2. As a learner, I want to see all cards in the current deck as a scrollable list, so that I can quickly scan what's in the deck.
3. As a learner, I want each card row to display according to the deck's active template (Comprehension: text + reading; Review: text + reading + translation; Reverse: translation only), so that the list view is consistent with how I'm studying that deck.
4. As a learner, I want a play button on the right side of each card row, so that I can hear a card's reading without opening it.
5. As a learner, I want tapping a card row to open the card review view from the bottom, so that I can review it without losing my place in the list.
6. As a learner, I want the card review view to show the target-language text large and centered, so that I can focus on reading it.
7. As a learner, I want to tap the card to hear its audio reading, so that I can practice pronunciation.
8. As a learner, I want the translation area below the card to be hidden as a skeleton by default (for the Comprehension template), so that I can attempt the translation before revealing it.
9. As a learner, I want to press and hold (mousedown/touchstart) the translation area to reveal it (for the Comprehension template), and have it hide again on release (mouseup/touchend), so that I can self-test without accidentally seeing the answer.

9a. As a learner, I want the Reverse template card to show the translation large and centered, so that I can practice producing the target language from native input.
9b. As a learner, I want the Review template card to show the target text, reading, and translation all visible at once (both in list and single view), so that I can study all fields together without any hidden areas.
10. As a learner, I want to swipe a card left to advance to the next card, so that I can move through the deck fluidly.
11. As a learner, I want to swipe a card right to go to the previous card, so that I can go back if I need more time on a card.
12. As a learner, I want a back button in the card review view to dismiss it and return to the card list, so that I can stop reviewing at any point.
13. As a learner, I want tapping the deck title at the top to open the deck picker panel sliding up from the bottom, so that I can switch decks without deep navigation.
14. As a learner, I want the deck picker to show a "Most recent" section at the top with the 2 most recently accessed or added decks, so that I can quickly switch between frequently used decks.
15. As a learner, I want the deck picker to show all remaining decks grouped by language below the "Most recent" section, so that I can find any deck.
16. As a learner, I want each deck row to show the deck name, a relative timestamp ("2 days ago"), a flag emoji for language, and card count, so that I can identify decks quickly.
17. As a learner, I want tapping a deck in the picker to close the picker and switch the card list to that deck, so that switching decks is a single tap.
18. As a learner, I want a back button in the deck picker header to close the picker and return to the card list, so that I can cancel without switching decks.
19. As a learner, I want an add button in the deck picker header to open the add-cards panel, so that I can import new cards from within the deck context.
20. As a learner, I want the add-cards panel to allow pasting a JSON card batch, so that I can import AI-generated cards.
21. As a learner, I want the add-cards panel to offer a download backup button, so that I can export my full library as insurance against data loss.
22. As a learner, I want the add-cards panel to offer an import backup button, so that I can restore a previously exported library.
23. As a learner, I want all panel transitions (deck picker, card review, add-cards) to slide up from the bottom, so that the navigation feels native and spatial.
24. As a learner, I want the deck picker to slide out to the bottom when dismissed, so that the animation is consistent with opening.
25. As a learner, I want the app to remember the last-used deck across sessions, so that relaunching the app returns me to where I left off.
26. As a learner, I want the card list to update immediately after importing new cards, so that I can see my new cards without navigating away and back.
27. As a learner, I want the app background to use the beige (#f5f5f0) color and card rows to be white, so that the app has a calm, legible aesthetic.
28. As a learner, I want the deck title in the header to be tappable with a visible cursor, so that I understand it is interactive.
29. As a learner, I want the card review to start from the card I tapped in the list, not always from the first card, so that I can jump to a specific card.
30. As a learner, I want swipe gestures on the card to feel responsive (move with my finger before animating away), so that the interaction feels physical.

## Implementation Decisions

### Navigation Architecture

- The app has one main screen: the **Deck View** (card list for the active deck). This replaces the current home/browse split.
- Three panels slide up over the Deck View: **Deck Picker**, **Card Review**, and **Add Cards**. All panels animate in from the bottom using CSS transitions or the Web Animations API.
- The hash-based router is preserved but the route map is simplified: `#deck?id=...` becomes the primary route, with `#deck` (no id) falling back to the last-used deck or the first available deck.
- The `#home`, `#browse`, `#review`, `#card`, `#import`, and `#export` routes are replaced or repurposed.
- Last-used deck ID is persisted in `localStorage` (simple key-value; no IndexedDB needed for a single scalar).

### Deck View (card list)

- Header: invisible spacer | tappable deck title | settings/gear icon button (right).
- Card rows: 64px tall, white background, rounded corners, 6px gap between rows.
- Row content is rendered per the deck's active template (see Card Templates below).
- Tapping the row body (not the play button) opens Card Review starting at that card's index.
- Tapping the play button calls TTS with the card's `reading` field (falling back to `text`), consistent with the existing TTS module.
- The deck title in the header, when tapped, opens the Deck Picker panel.

### Deck Picker Panel

- Slides up from the bottom to cover the Deck View entirely.
- Header: back button (left) | "Language decks" title (center) | add button (right).
- Content: "Most recent" section (top 2 decks by `lastAccessedAt` or `createdAt`), then one section per language with all decks for that language.
- Section headers use small-caps uppercase 13px caption style.
- Deck rows: same 64px row format; left = name + relative timestamp; right = flag emoji + card count.
- Tapping a deck row: updates `lastAccessedAt` on the deck, stores the deck ID in `localStorage`, closes the picker, renders the Deck View for the new deck.
- The deck schema gains a `lastAccessedAt` field (ISO 8601, nullable). Updated whenever a deck is selected.

### Card Templates

Three templates control what is shown on a card both in the list row and in the single-card review panel. The template is set per-deck and stored on the deck record.


| Template          | List row                                                                                | Single card                                      | Translation area                              |
| ----------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------- |
| **Comprehension** | Target text (18px bold) + reading (13px caption) on left; play button right             | Target text (40px bold) + reading (16px caption) | Skeleton by default; press-and-hold to reveal |
| **Review**        | Target text + reading inline on same line; translation caption below; play button right | Target text (40px bold) + reading (16px caption) | Translation always visible (no skeleton)      |
| **Reverse**       | Translation text only on left; play button right                                        | Translation text only (40px bold, centered)      | No translation area (translation is the card) |


- The `Comprehension` template replaces the old `Reading` / `target-lang` mode.
- The `Review` template is new — it shows all three fields (text, reading, translation) simultaneously.
- The `Reverse` template replaces the old `Production` / `native-lang` mode.
- The existing `mode` field on the deck record is renamed/remapped: `target-lang` → `comprehension`, `reading` → `comprehension` (merged), `native-lang` → `reverse`; `review` is added as a new value. Dexie version bump required; migration maps old values.

### Card Review Panel

- Slides up from the bottom to cover the Deck View.
- Header: back button (left) | deck name title (center) | settings/gear icon (right).
- Center area: single card (white, 240px tall, rounded corners) + translation area below.
- Card content is rendered according to the deck's active template (see Card Templates above).
- Tapping the card triggers TTS using `card.reading` (falling back to `card.text`).
- **Comprehension template:** Translation area below the card is rendered as two gray skeleton rectangles. On `mousedown`/`touchstart` the actual translation text replaces the skeleton. On `mouseup`/`touchend` the skeleton returns.
- **Review template:** Translation area is always visible with no interaction needed.
- **Reverse template:** No separate translation area; the card itself shows the translation. The target text and reading are hidden in this view (press-to-reveal is out of scope for this PRD).
- Swipe left on the card → next card (with leftward slide animation). Swipe right → previous card (rightward slide animation). Swipe detection uses `touchstart`/`touchend` delta; minimum swipe distance threshold (~50px) to avoid accidental triggers.
- The card in the review panel moves with the swipe in real time (translate X) then either completes the transition or snaps back.
- The card index is initialized from the tapped row's position in the list.
- At first/last card: swipe in the direction that has no more cards is ignored (no wrap-around).

### Add Cards Panel

- Slides up from the bottom, triggered by the add button in the Deck Picker header.
- Contains: JSON paste textarea + import button (Step 1), deck select/create (Step 2), download backup button, import backup file input.
- This is a reorganization of the existing import (`#import`) and export (`#export`) screens into a single panel.
- After successful import, the add panel and deck picker dismiss, and the Deck View reloads for the updated (or newly created) deck.

### Visual Design Tokens

- Background: `#f5f5f0` (beige-100)
- Card/row background: `#ffffff`
- Body text: `#0f182a` (fg-body)
- Caption text: `#64718b` (fg-caption)
- Accent/active: `#2d6a4f` (green-600)
- Border: `#cbd2e1` (gray-300)
- Fonts: Inter for Latin; Noto Sans JP / Noto Sans SC for CJK characters (system fallback chain acceptable if web fonts not loaded)
- These tokens replace any ad-hoc color values in the existing stylesheets.

### Modules to Build or Modify

- `**db.js`** — add `lastAccessedAt` field to deck schema; add `updateDeckAccessTime(deckId)` method; add `getRecentDecks(n)` method; migrate `mode` values from old names to new template names; bump Dexie schema version.
- `**screens/deck-view.js**` (new, replaces `home.js` + `browse.js`) — renders the active deck's card list; manages Deck Picker and Card Review panels; owns the swipe gesture logic; owns the press-to-reveal logic.
- `**screens/deck-picker.js**` (new, replaces deck-selection part of `home.js`) — renders the deck list panel; handles deck switching and access time updates.
- `**screens/card-review.js**` (new, replaces `review.js` + `card.js`) — renders the single-card review panel; manages swipe state; manages press-to-reveal state; calls TTS.
- `**screens/add-cards.js**` (new, replaces `import.js` + `export.js`) — renders the add/import/export panel.
- `**router.js**` — simplify route map to `#deck` as primary route; remove deprecated routes or redirect them.
- `**styles/**` — update/replace screen-specific CSS with new design tokens and panel/animation styles; shared panel animation class.
- `**tts.js**` — no changes needed; interface is stable.
- `**import-parser.js**` — no changes needed.

### Data Schema Changes

- `decks` table: add `lastAccessedAt` (ISO 8601 string | null). Nullable so existing records are valid. Dexie version bump required; migration sets existing rows to `null`.
- `decks.mode` values renamed: `target-lang` → `comprehension`, `reading` → `comprehension` (merged), `native-lang` → `reverse`; `review` added as a new valid value. Migration remaps existing rows.
- `localStorage`: `loudmouth.lastDeckId` — stores the string ID of the most recently active deck.

### Panel Animation Contract

- All panels use the same CSS class-based animation: a `panel` base class with `translateY(100%)` initial transform; a `pane--open` class that transitions to `translateY(0)` using `transition: transform 300ms ease`.
- Panels are rendered into a fixed overlay container stacked above the main Deck View.
- Closing a panel removes `pane--open`, waits for the transition to end, then removes the element from the DOM.

## Testing Decisions

**What makes a good test:** Tests should exercise externally observable behavior — what a user or calling module can see — not internal implementation details. For data layer modules, that means testing the result of operations (what records exist, what the return value is) not how they achieve it. For UI behavior, tests verify that the correct state transitions happen in response to events.

**Modules to test:**

- `**db.js`** additions — `updateDeckAccessTime`, `getRecentDecks`: test that access times are stored correctly and that `getRecentDecks(2)` returns the 2 most recently updated decks sorted correctly. Prior art: existing Dexie tests in the project (if any); otherwise follows the pattern of `import-parser.test.js` or similar unit tests.
- `**import-parser.js**` — no new tests needed (no changes).
- **Swipe gesture logic** — if extracted into a standalone `swipe.js` utility that takes a DOM element and callbacks, it can be tested by simulating `touchstart`/`touchend` events with synthetic coordinates. Prior art: none in this project; standard DOM event simulation.
- **Press-to-reveal logic** — if extracted into a standalone utility, test that the reveal state changes on `mousedown`/`touchstart` and resets on `mouseup`/`touchend`.

**Out of scope for testing:** CSS animations, TTS invocation (Web Speech API), panel open/close sequencing (visual/timing behavior).

## Out of Scope

- Spaced repetition, scoring, or any progress tracking.
- The `#card` individual card detail screen as a standalone route (replaced by the Card Review panel).
- In-app template switching UI (the Settings panel shown in Figma node 38:741 is out of scope; template is set via the deck settings gear, which is non-functional in this PRD).
- Furigana/ruby text rendering.
- Multi-device sync or cloud backup.
- Any changes to the card data schema (text, reading, translation fields).
- Deck creation outside of the import flow (creating an empty deck with no cards).
- Search or filter within the card list.
- In-app card editing.

## Further Notes

### Figma References

All visual implementation should be verified against the Figma file: **`https://www.figma.com/design/sn5VMavDDp38gSwsRVRhcS/Loudmouth`**

| What | Node ID | URL |
|---|---|---|
| Home screen (Deck View + all panels) | `38:653` | https://www.figma.com/design/sn5VMavDDp38gSwsRVRhcS/Loudmouth?node-id=38-653 |
| Card component (all templates × list/single) | `27:69` | https://www.figma.com/design/sn5VMavDDp38gSwsRVRhcS/Loudmouth?node-id=27-69 |

Node `38:653` contains all four panels stacked vertically in the prototype: the Deck View, the Settings panel (out of scope), the Deck Picker panel, and the Card Review panel. Node `27:69` contains the Card component in all six variants (3 templates × list/single).
- The three card templates are `Comprehension` (target text + reading, translation hidden/skeleton), `Review` (all fields always visible), and `Reverse` (translation only, for production practice). These replace the old `target-lang`, `reading`, and `native-lang` mode names.
- `Comprehension` is the default template for new decks.
- Relative timestamps ("2 days ago", "1 week ago") displayed in deck rows should be computed from `lastAccessedAt` (falling back to `createdAt`) using a simple relative-time formatter. No external library needed.
- The `docs/cards.dinner.json` file in the repo provides a real card batch for manual testing.

