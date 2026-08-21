# iOS Architecture — Pane Protocol conformance

The Loudmouth iOS app organizes its UI according to the **Pane Protocol**, the
same source of truth the web app uses: [`web/docs/PANE_PROTOCOL.html`](../web/docs/PANE_PROTOCOL.html).
Product-level UX (navigation structure, action panes, interaction states) is
described in [`docs/DESIGN.md`](../docs/DESIGN.md), which states that "both
interfaces are the same except where explicitly noted." This document maps the
protocol's vocabulary onto the SwiftUI implementation so the two platforms use
one shared mental model.

Read the Pane Protocol glossary first. The terms *pane*, *layer*, *scrim*, and
*handle* below carry the precise meanings defined there.

## The four layers

The app is a stage with four fixed layers, bottom to top:
**shell → content → details → action** (Pane Protocol Rule 8). A pane lives in
exactly one layer. iOS composes these with `ZStack`, `.offset`, and `.sheet` —
there is **no `NavigationStack`** in the deck→card path; nothing is pushed.

| Layer | Pane | iOS type | Presentation mechanism |
|-------|------|----------|------------------------|
| **shell** | Navigation pane | `DeckListView.navigationPane` | Bottom of a `ZStack`; **never moves**. Lists decks grouped by language; revealed when the content pane slides aside. No scrim (full-height content simply slides aside). |
| **content** | Content pane | `CardListView` (hosted in `DeckListView.contentPane`) | Layered over the nav pane with `.offset(x:)`, driven by a body-level `DragGesture`. Peeks ~80px when open. Swapping deck/lang/starred changes what it renders — it does not add a layer. |
| **details** | Details pane | `CardDetailsView` (+ `CardDetailsViewModel`) | Bottom-anchored surface over a scrim, presented by the content pane as a `.transition(.move(edge: .bottom))` overlay. Not full-height. Horizontal swipe traverses to the previous/next **sibling** card (`viewModel.prev()` / `viewModel.next()`); back chevron, scrim tap, or swipe-down dismisses. |
| **action** | Action panes | `TranslationView`, `GenerateCardsView`, `DeckSettingsView`, `CardEditView`, `AddCardsView` | Bottom-anchored modal `.sheet`s. At most one open at a time; always wins the z-order above the details pane. |

## Vocabulary

The Pane Protocol settles the vocabulary: **pane** is the universal noun; the
four layers are **shell / content / details / action**. iOS code follows suit —
`navigationPane`, `contentPane`, `CardDetailsView`, and the `.sheet`-presented
**action panes**. Avoid "screen", "drawer", "modal", or "review" as synonyms
for these surfaces. (SwiftUI's own `.sheet` presentation API keeps its framework
name; that is the OS primitive, not our vocabulary.)

Note: the source files still live under `ios/Loudmouth/Screens/` for historical
reasons. The folder name predates the protocol; the types inside it are named
per the protocol.

## Behavioral conformance to DESIGN.md

- **Navigation pane** — deck list with Recent + per-language sections, starred
  deck, and the bottom-left add button that opens the Generate cards action pane.
- **Content pane** — deck view with back affordance (reveals the nav pane),
  title menu (Settings / Edit cards), and the "+" add button that opens the
  Translation action pane.
- **Details pane** — tapping a card row opens it; horizontal swipe traverses
  siblings without dismissing; returns to the same content-pane position.
- **Translation vs. Generate** are separate action panes with distinct entry
  points, exactly as DESIGN.md specifies. The Translation pane's language label
  is display-only; language is fixed at deck creation.

## Known gaps

The "All ${language} decks" overflow link, the "Add cards" text-input entry
point for Generate, and edit-mode reorder drag are not yet implemented on
iOS.
