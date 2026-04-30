---
name: design
description: >
  Outline of the UX design for the web and iOS app. Both interfaces are the same except where explicitly noted.
---

### Information Architecture

**High level app structure (Phase 1):** No tab bar. Two main, stacked panes. The bottom navigation pane (fixed in place), and the top content pane. The content pane is shown by default, but will slide off to the right to reveal the navigation pane. The content pane content changes based on items clicked on the navigation pane. Additionally, there is a contextual action pane that slides up from the bottom. This is contextual to the content on the pane showing on the screen and appears when clicking an action on that pane, such as translating, generating cards, reviewing individual cards, editing settings, etc.

**Navigation pane:** This pane allows for navigation between different content in the app. The content to navigate between are different card decks. It has a "Recent" section which lists the last 3 decks that have been viewed, and a section for each language for which at least one deck exists. Each language section shows up to 5 decks (most recently created). If there are more than 5 decks for a langauge, a `All ${language} decks` link appears. Clicking this link brinks in the deck pane, showing the list of all decks. If any card has been starred for a given langauge, then the dynamic "starred" deck appears at the top of the section for the language the deck belongs to. The navigation pane can be seen here: https://www.figma.com/design/sn5VMavDDp38gSwsRVRhcS/Loudmouth?node-id=106-1189&t=glPczHFNXaQtaweV-11

**Deck pane:** This pane shows all of the cards for a given deck. In the header of the deck on the left is a menu button (clicking it slides the deck panel out of the way revealing the navigation panel - swiping right from the left edge of the content pane also has the same effect) and on the right is an add button (clicking it brings up the action pane with an interface for translating and a card to the deck). Between both buttons is the title of the deck. Clicking on the title reveals a menu of two options: "Settings" and "Edit cards". Settings slides up the action pane with the form fields for editing the deck, and "Edit cards" changes the cards on the deck pane so that they can be dragged to be reordered. The "add button" changes to a "confirm button" that saves the changes. Additionally, a text input appears at the bottom of the screen with the placeholder text "Add cards". Clicking on it slides up the action pane with content for contextual card generation. Mocks for the Deck Pane can be seen here: https://www.figma.com/design/sn5VMavDDp38gSwsRVRhcS/Loudmouth?node-id=189-9779&t=glPczHFNXaQtaweV-11

**Translation vs. Generate are separate entry points:**
- **Translation action pane** = single word/phrase → one or more result cards (ambiguous word sense → multiple results). Surfaced in the action pane. **Entry point: "+" FAB in the Content pane header (top-right)** — tapping it slides up the Translation sheet. This header of the translation action pane always shows the deck's fixed language and doubles.
- **Generate cards** = placeholder context prompt ("greetings for morning/afternoon/evening") → batch of cards added to the deck. **Entry point: "Add cards" text input (bottom)**. Also auto-opens for new/empty decks, which can be created by clicking the "+" add FAB on the bottom-left of the navigation pane. When opened for a new/empty deck, there is a language selector below the textarea. The empty state experience is here: https://www.figma.com/design/sn5VMavDDp38gSwsRVRhcS/Loudmouth?node-id=189-9780&t=glPczHFNXaQtaweV-11

**Language pair:** The "🇯🇵 Japanese" header in the Translation sheet is a display-only label showing the current deck's fixed language (flag + language name). It is NOT tappable and has no picker. Language is fixed at deck creation via the Generate cards sheet language selector. There is no way to reach the Translation tray without being inside a specific deck, and all cards in a deck share the same language.

### Interaction States — Translation action pane

The Translation action pane is a bottom sheet (white card, 40px top-radius, sits above a scrim over the Deck screen). It is triggered by tapping the "+" FAB in the header of the content pane. The translation action pane header shows a back FAB (left) and the deck's fixed language label (e.g. "🇯🇵 Japanese") — display only, not tappable.

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

**Swipe to add (top card):** The top card is swipeable. Reveal on drag: green ✓ (add) left-side, red × (dismiss) + blue ✏ (edit) right-side. Swipe right past threshold → card added to current deck and removed from list. Tap the card row → same as swipe-right (add immediately). After all cards added/dismissed, sheet returns to empty state.

**"Translate" pill (re-translate):** Floats bottom-right of the result area, grayed. Tapping clears results and re-runs translation with the current input. This is NOT a "new word" button — it's a retry/re-run for the same input.

**After add:** Card slides out of the list. If more cards remain, the list updates. When the last card is added or dismissed, the input clears and sheet returns to empty state, ready for the next word.

**Error — timeout (504):** Skeleton resolves to: `Could not generate — try again. [↻]`
**Error — rate limited (429):** Same, with "Try again in 60 seconds."
**Error — network:** "No connection." No retry button.
**Empty result (0 valid cards):** "No result — try rephrasing." with ↻ retry.
**Edge: deck with no language set** (e.g. legacy data migration): language pill shows "🌐 Set language" — tapping opens Generate cards sheet (not Translation sheet) so user can set the language first.

**Dismissal:** The action pane can be dismissed by swiping down

### Generate Cards action pane

This can be triggered in two ways:

1. From the Navigation Pane by clicking the ADD FAB in the bottom left. This slides in the Content Pane with the Generate Cards action pane already exposed. Clicking GENERATE calls the `/generate-cards` API, then based on the response creates an appropriately named deck with the cards appended.
2. By clicking into the "Add cards" text input at the bottom of the content pane when in "edit" mode. Clicking GENERATE calls the `/generate-cards` API, and adds the cards returned in the response to the current deck

Layout: bottom sheet, same beige/white motif as Translation sheet (40px top-radius, `--bg-primary` background on inner card).

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

**Dismissal:** The action pane can be dismissed by swiping down