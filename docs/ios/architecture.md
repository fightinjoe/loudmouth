---
kind: spec
status: current
summary: Native iOS client — current state, and how its SwiftUI views map onto the Pane Protocol layers.
sources: [ios/Loudmouth/ContentView.swift, ios/Loudmouth/Screens, ios/Loudmouth/Services]
verified: 2026-11-12
---

# iOS architecture

## Current state

The native iOS app (`ios/Loudmouth/`) is a deck-and-card client from before the phrasebook redesign. It translates and generates cards through retired API routes (`/translate` in `ios/Loudmouth/Screens/Translation/TranslationView.swift`, `/generate-cards` in `ios/Loudmouth/Screens/GenerateCards/GenerateCardsView.swift`) and has none of the web client's guided creation, phrasebook view, phrase breakdown, or starred Review; the web [design](../design.md) does not describe it. What happens to iOS is tracked in [v4 release](../todo/v4-release.md).

## Pane Protocol mapping

The iOS UI follows the layer model of the [Pane Protocol](../web/pane-protocol.html). Read its glossary first: *pane*, *layer*, *scrim*, and *handle* below carry the meanings defined there.

The app is a stage with four fixed layers, bottom to top: **shell → content → details → action** (Pane Protocol Rule 8). A pane lives in exactly one layer. iOS composes these with `ZStack`, `.offset`, and `.sheet` — there is **no `NavigationStack`** in the deck→card path; nothing is pushed (`ios/Loudmouth/ContentView.swift`). Some action panes use a `NavigationStack` internally for their own toolbar.

| Layer | Pane | iOS type | Presentation mechanism |
|-------|------|----------|------------------------|
| **shell** | Navigation pane | `DeckListView.navigationPane` | Bottom of a `ZStack`; **never moves**. Lists decks grouped by language; revealed when the content pane slides aside. No scrim (full-height content simply slides aside). |
| **content** | Content pane | `CardListView` (hosted in `DeckListView.contentPane`) | Layered over the nav pane with `.offset(x:)`, driven by a body-level `DragGesture`. Peeks ~80px when open. Swapping deck/lang/starred changes what it renders — it does not add a layer. |
| **details** | Details pane | `CardDetailsView` (+ `CardDetailsViewModel`) | Bottom-anchored surface over a scrim, presented by the content pane as a `.transition(.move(edge: .bottom))` overlay. Not full-height. Horizontal swipe traverses to the previous/next **sibling** card (`viewModel.prev()` / `viewModel.next()`); back chevron, scrim tap, or swipe-down dismisses. |
| **action** | Action panes | `TranslationView`, `GenerateCardsView`, `DeckSettingsView`, `CardEditView`, `AddCardsView` | Bottom-anchored modal `.sheet`s. At most one open at a time; always wins the z-order above the details pane. |

## Vocabulary

**Pane** is the universal noun; the four layers are **shell / content / details / action**. iOS code follows suit — `navigationPane`, `contentPane`, `CardDetailsView`, and the `.sheet`-presented **action panes**. Avoid "screen", "drawer", "modal", or "review" as synonyms for these surfaces. (SwiftUI's own `.sheet` presentation API keeps its framework name; that is the OS primitive, not our vocabulary.)

The source files live under `ios/Loudmouth/Screens/`; the folder name predates the protocol, but the types inside it are named per the protocol.

## Behavior

- **Navigation pane** — deck list with Recent and per-language sections (each with a ★ Starred row when stars exist), and the bottom-left add button that opens the Generate cards action pane.
- **Content pane** — deck view with a back affordance (reveals the nav pane), a title menu (Settings / Edit cards), and a "+" button that opens the Translation action pane.
- **Details pane** — tapping a card row opens it; horizontal swipe traverses siblings without dismissing; it returns to the same content-pane position.
- **Translation** and **Generate cards** are separate action panes with distinct entry points. The Translation pane's language label is display-only; language is fixed at deck creation.
