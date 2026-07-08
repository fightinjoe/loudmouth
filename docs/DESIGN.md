---
name: design
description: >
  Outline of the UX design for the web and iOS app. Both interfaces are the same except where explicitly noted.
---

### Information Architecture

This app organizes its UI according to the **Pane Protocol** (`web/docs/PANE_PROTOCOL.html`). That document is the source of truth for pane vocabulary, the layer stack, state, transitions, and gestures; this doc describes the product-level design that sits on top of it. Terms used here — *pane*, *layer*, *scrim*, *handle* — carry the precise meanings defined in the protocol glossary.

**High level app structure (Phase 1):** No tab bar. The app is a stage with four fixed **layers**, bottom to top: **shell** < **content** < **details** < **action** (see Pane Protocol, Rule 8). A **pane** lives in exactly one layer:

- **Navigation pane** (shell layer) — fixed in place, always present, revealed by sliding the content pane sideways.
- **Content pane** (content layer) — shown by default; slides off to the right to reveal the navigation pane underneath. Its content changes based on the deck selected in the navigation pane. Navigating between content screens (a deck, a browse view, the empty state) swaps what the content pane renders — it does not add a layer.
- **Details pane** (details layer) — optional; sits over the content pane to show one card's full detail view. A horizontal swipe inside the details pane traverses to the previous or next sibling card without dismissing; a back affordance closes the layer and returns to the content pane. There is no scrim behind the details pane.
- **Action pane** (action layer) — optional; a bottom-anchored, modal surface that slides up over a **scrim**. Contextual to the pane beneath it, opened by an action such as translating, generating cards, or editing settings. At most one action pane is open at a time; it always wins the z-order.

**Navigation pane:** This pane (shell layer) allows for navigation between different content in the app. The content to navigate between are different card decks. It has a "Recent" section which lists the last 3 decks that have been viewed, and a section for each language for which at least one deck exists. Each language section shows up to 5 decks (most recently created). If there are more than 5 decks for a langauge, a `All ${language} decks` link appears. Clicking this link brings up the all-decks list in the content pane. If any card has been starred for a given langauge, then the dynamic "starred" deck appears at the top of the section for the language the deck belongs to. The navigation pane can be seen here: https://www.figma.com/design/sn5VMavDDp38gSwsRVRhcS/Loudmouth?node-id=106-1189&t=glPczHFNXaQtaweV-11

**Deck view (content pane):** The deck is a mode of the content pane that shows all of the cards for a given deck. In the header on the left is a menu button (clicking it slides the content pane out of the way to reveal the navigation pane — swiping right from the left edge of the content pane also has the same effect) and on the right is an add button (clicking it opens the action pane with an interface for translating a word/phrase and adding a card to the deck). Between both buttons is the title of the deck. Clicking on the title reveals a menu of two options: "Settings" and "Edit cards". Settings opens the action pane with the form fields for editing the deck, and "Edit cards" changes the cards in the content pane so that they can be dragged to be reordered. The "add button" changes to a "confirm button" that saves the changes. Additionally, a text input appears at the bottom of the content pane with the placeholder text "Add cards". Clicking on it opens the action pane with content for contextual card generation. Mocks for the deck view can be seen here: https://www.figma.com/design/sn5VMavDDp38gSwsRVRhcS/Loudmouth?node-id=189-9779&t=glPczHFNXaQtaweV-11

**Details pane:** Tapping a card row in the content pane opens the details pane (details layer) over the content pane, showing that card's full detail view. Swiping left or right inside the details pane traverses to the next or previous sibling card in the deck without dismissing — the pane stays open, only the card changes. A back affordance closes the pane and returns to the content pane in the same scroll position and selection. The details pane has no scrim.

**Translation vs. Generate are separate action panes:**
- **Translation action pane** = single word/phrase → one or more result cards (ambiguous word sense → multiple results). **Entry point: "+" add button in the content pane header (top-right)** — tapping it opens the Translation action pane. Its header always shows the deck's fixed language.
- **Generate cards action pane** = placeholder context prompt ("greetings for morning/afternoon/evening") → batch of cards added to the deck. **Entry point: "Add cards" text input (bottom of the content pane)**. Also auto-opens for new/empty decks, which can be created by clicking the "+" add button on the bottom-left of the navigation pane. When opened for a new/empty deck, there is a language selector below the textarea. The empty state experience is here: https://www.figma.com/design/sn5VMavDDp38gSwsRVRhcS/Loudmouth?node-id=189-9780&t=glPczHFNXaQtaweV-11

**Language pair:** The "🇯🇵 Japanese" header in the Translation action pane is a display-only label showing the current deck's fixed language (flag + language name). It is NOT tappable and has no picker. Language is fixed at deck creation via the Generate cards action pane's language selector. There is no way to reach the Translation action pane without being inside a specific deck, and all cards in a deck share the same language.

### Interaction States — Translation action pane

The Translation action pane (action layer) is a bottom-anchored modal surface (white card, 40px top-radius) that slides up over a scrim covering the content pane. It is triggered by tapping the "+" add button in the header of the content pane. Its header shows a back button (left) and the deck's fixed language label (e.g. "🇯🇵 Japanese") — display only, not tappable.

**Empty:** Large text input area (32px Roboto Flex Light, `--text-body`), placeholder in `--text-secondary`. "Translate" pill button bottom-right, grayed (`--gray-400` bg, `--gray-400` text).

**Typing:** Multi-line text area (grows with content). "Translate" pill activates when field is non-empty (`--bg-accent` bg, `--fg-emphasis` text, drop-shadow). No "Go" key submission — user taps "Translate" explicitly.

**Loading (~500ms–2s):** Skeleton card row(s) with shimmer appear in the result area below a "Swipe or tap to add card" hint. "Translate" pill grays out while in-flight.

**Result (success):** Card list appears below the "Swipe or tap to add card" hint. Each result card row:
```
┌─────────────────────────────────────────────┐
│  [reading]          CJK text       [▶ play] │
│  English meaning                            │
└─────────────────────────────────────────────┘
```
- Top card: `border-radius: 20px 20px 0 0`; bottom card: `border-radius: 0 0 20px 20px`; middle cards: no radius
- CJK text: 24px `--text-body`, Roboto Flex + Noto Sans JP
- Reading (ruby): 14px `--text-caption`, above each character column
- English meaning: 14px `--text-caption`, below the character row
- Play icon: 24px, right-aligned, `--text-caption`
- Multiple results when input is ambiguous by sense (noun vs. verb etc.) — controlled by the translation API skill rules

**Swipe to add (top card):** The top card is swipeable. Reveal on drag: green ✓ (add) left-side, red × (dismiss) + blue ✏ (edit) right-side. Swipe right past threshold → card added to current deck and removed from list. Tap the card row → same as swipe-right (add immediately). After all cards added/dismissed, the action pane returns to empty state.

**"Translate" pill (re-translate):** Floats bottom-right of the result area, grayed. Tapping clears results and re-runs translation with the current input. This is NOT a "new word" button — it's a retry/re-run for the same input.

**After add:** Card slides out of the list. If more cards remain, the list updates. When the last card is added or dismissed, the input clears and the action pane returns to empty state, ready for the next word.

**Error — timeout (504):** Skeleton resolves to: `Could not generate — try again. [↻]`
**Error — rate limited (429):** Same, with "Try again in 60 seconds."
**Error — network:** "No connection." No retry button.
**Empty result (0 valid cards):** "No result — try rephrasing." with ↻ retry.
**Edge: deck with no language set** (e.g. legacy data migration): language pill shows "🌐 Set language" — tapping opens the Generate cards action pane (not the Translation action pane) so the user can set the language first.

**Dismissal:** The action pane can be dismissed by swiping down, clicking the scrim, or an explicit close action.

### Generate Cards action pane

The Generate cards action pane (action layer) can be triggered in two ways:

1. From the navigation pane by clicking the add button in the bottom left. This brings up the content pane with the Generate cards action pane already open. Clicking GENERATE calls the `/generate-cards` API, then based on the response creates an appropriately named deck with the cards appended.
2. By clicking into the "Add cards" text input at the bottom of the content pane when in "edit" mode. Clicking GENERATE calls the `/generate-cards` API, and adds the cards returned in the response to the current deck

Layout: bottom-anchored modal surface over a scrim, same beige/white motif as the Translation action pane (40px top-radius, `--bg-primary` background on inner card).

```
┌─── Add cards ──────────────────── [+] ───┐
│  Share a situation or context            │
│  ┌────────────────────────────────────┐  │
│  │  Greetings for morning, afternoon… │  │
│  └────────────────────────────────────┘  │
│  🇯🇵 Japanese  ▲▼        [  Generate  ]   │
└──────────────────────────────────────────┘
```

- Title: "Add cards" (not "Generate"), centered, 24px, back-chevron left
- Instruction label: "Share a situation or context", 14px `--bg-secondary` (muted), centered above input
- Input: multi-line textarea, 124px tall, 20px inner padding, inset shadow (`inset 0 1px 4px rgba(0,0,0,0.15)`), `--bg-surface` (white) or `--beige-100` background, `border-radius: 20px` (verify exact shade from Figma — `--beige-50` does not exist in token system)
- Placeholder: 16px `--gray-300` (muted)
- Language selector: flag emoji + language name + ▲▼ sort icon (unfold), bottom-left
- Generate button: bottom-right, `border-radius: 100px`
  - Disabled (empty input): `--border-default` bg (gray-300), `--text-tertiary` text (gray-400) — `--tint-black-100` not in token system, use closest semantic equivalent
  - Enabled (filled): `--bg-accent` bg, `--fg-emphasis` text, `drop-shadow: 0 4px 5px rgba(0,0,0,0.15)`

After Generate: the action pane closes after generation completes. (No inline preview in this flow — the generated cards land directly in the deck.)

**Dismissal:** The action pane can be dismissed by swiping down, clicking the scrim, or an explicit close action.