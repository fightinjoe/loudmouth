---
kind: spec
status: current
summary: Native iOS client — current state, protected request layer, and how its SwiftUI views map onto the Pane Protocol layers.
sources: [ios/Loudmouth/ContentView.swift, ios/Loudmouth/LoudmouthApp.swift, ios/Loudmouth/Screens, ios/Loudmouth/Services, ios/Loudmouth/Components/OnlineGenerationUnavailableView.swift]
verified: 2026-11-15
---

# iOS architecture

## Current state

The native iOS app (`ios/Loudmouth/`) is a deck-and-card client from before the phrasebook redesign. It has none of the web client's guided creation, phrasebook view, phrase breakdown, or starred Review; the web [design](../design.md) does not describe it. Its former Translation and Generate cards actions called retired API routes; those implementations and their unauthenticated transports are removed, and both entry points now show an update-required notice ([behavior](#behavior)). Saved-card reading, review and import are local and do not depend on Firebase credentials. Production state is in [API operations](../api/operations.md#production); the port to the web experience is tracked in [iOS port](../todo/antsy-aphid/ios-port.md).

## Protected requests

The app carries the request layer that the API's [protection](../api-design.md#api-protection) requires, but no screen calls it yet: it is the transport the port must use, and adding it does not complete the port.

- `APIIdentity` (`ios/Loudmouth/Services/APIIdentity.swift`) installs the App Check provider factory before programmatic Firebase configuration at app startup (`ios/Loudmouth/LoudmouthApp.swift`). Missing or invalid build inputs leave Firebase unconfigured and generation unavailable without blocking SwiftData or the library. No `GoogleService-Info.plist` is used.
- Anonymous sign-in and token acquisition are actor-owned, start only on a protected request, share in-flight work and reuse the persisted identity. A quota failure does not sign the caller out. A caller can cancel its 15-second credential wait without cancelling another caller's shared sign-in.
- App Check uses strict App Attest with no DeviceCheck fallback. A device without App Attest cannot generate but keeps its local content. Only a `DEBUG` build configured for staging can use the debug provider.
- `APIClient` (`ios/Loudmouth/Services/APIClient.swift`) accepts only `/context`, `/phrasebook-title`, `/phrasebook`, `/phrase-breakdown` and `/phrasebook-image`. It attaches `Authorization: Bearer` and `X-Firebase-AppCheck`, rejects redirects, uses a 270-second request deadline and never automatically replays a paid POST. Verification, quota, retry-after, paused and ambiguous-network outcomes map to controlled messages; tokens, request bodies and raw server errors are not logged.

Build inputs, bundle identifiers, the Firebase SDK pin and the debug-provider restriction are in [iOS development](development.md).

## Pane Protocol mapping

The iOS UI follows the layer model of the [Pane Protocol](../web/pane-protocol.html). Read its glossary first: *pane*, *layer*, *scrim*, and *handle* below carry the meanings defined there.

The app is a stage with four fixed layers, bottom to top: **shell → content → details → action** (Pane Protocol Rule 8). A pane lives in exactly one layer. iOS composes these with `ZStack`, `.offset`, and `.sheet` — there is **no `NavigationStack`** in the deck→card path; nothing is pushed (`ios/Loudmouth/ContentView.swift`). Some action panes use a `NavigationStack` internally for their own toolbar.

| Layer | Pane | iOS type | Presentation mechanism |
|-------|------|----------|------------------------|
| **shell** | Navigation pane | `DeckListView.navigationPane` | Bottom of a `ZStack`; **never moves**. Lists decks grouped by language; revealed when the content pane slides aside. No scrim (full-height content simply slides aside). |
| **content** | Content pane | `CardListView` (hosted in `DeckListView.contentPane`) | Layered over the nav pane with `.offset(x:)`, driven by a body-level `DragGesture`. Peeks ~80px when open. Swapping deck/lang/starred changes what it renders — it does not add a layer. |
| **details** | Details pane | `CardDetailsView` (+ `CardDetailsViewModel`) | Bottom-anchored surface over a scrim, presented by the content pane as a `.transition(.move(edge: .bottom))` overlay. Not full-height. Horizontal swipe traverses to the previous/next **sibling** card (`viewModel.prev()` / `viewModel.next()`); back chevron, scrim tap, or swipe-down dismisses. |
| **action** | Action panes | `OnlineGenerationUnavailableView`, `DeckSettingsView`, `CardEditView`, `AddCardsView` | Bottom-anchored modal `.sheet`s. At most one open at a time; always wins the z-order above the details pane. |

## Vocabulary

**Pane** is the universal noun; the four layers are **shell / content / details / action**. iOS code follows suit — `navigationPane`, `contentPane`, `CardDetailsView`, and the `.sheet`-presented **action panes**. Avoid "screen", "drawer", "modal", or "review" as synonyms for these surfaces. (SwiftUI's own `.sheet` presentation API keeps its framework name; that is the OS primitive, not our vocabulary.)

The source files live under `ios/Loudmouth/Screens/`; the folder name predates the protocol, but the types inside it are named per the protocol.

## Behavior

- **Navigation pane** — deck list with Recent and per-language sections (each with a ★ Starred row when stars exist), and the bottom-left add button that opens the update-required notice.
- **Content pane** — deck view with a back affordance (reveals the nav pane), a title menu (Settings / Edit cards), and a "+" button that opens the update-required notice.
- **Details pane** — tapping a card row opens it; horizontal swipe traverses siblings without dismissing; it returns to the same content-pane position.
- **Update-required notice** — `OnlineGenerationUnavailableView` (`ios/Loudmouth/Components/OnlineGenerationUnavailableView.swift`) replaces the former Translation and Generate cards action panes. It reads "Update required for online generation. Saved content is still available.", sends no request and changes no saved content.
