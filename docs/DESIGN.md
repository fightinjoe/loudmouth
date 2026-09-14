---
name: design
description: >
  High-level UX design for the current Catchphrase web and iOS experience. Describes the pane
  structure, guided phrasebook creation, phrasebook browsing, and starred-card review. For
  step-by-step flows see docs/journeys.md; for pane mechanics see the Pane Protocol; for card data
  shapes see docs/CARD_SCHEMA.md.
---

# Catchphrase interaction design

> **Naming.** **Loudmouth** is the internal code name used by the repository and packages.
> **Catchphrase** is the public product name. The collection noun is **phrasebook** (one word).

The product is organized around one prep-first loop: create a complete phrasebook for a situation,
star the cards worth emphasizing, and review those cards. Successful generation commits the complete
phrasebook at once.

## Information architecture

The app follows the **Pane Protocol** (`web/docs/PANE_PROTOCOL.html`). The stage has four fixed layers,
from bottom to top: **shell**, **content**, **details**, and **action**.

- **Navigation pane** (shell) — always present. It contains the landing page, recent and suggested
  phrasebooks, language-grouped library navigation, and the new-phrasebook entry point. Sliding the
  content pane right reveals it.
- **Content pane** (content) — shows the selected phrasebook or a browse list. Changing content swaps
  this pane's screen rather than adding a layer.
- **Details pane** (details) — an optional bottom-anchored card detail surface over a scrim. It can
  traverse sibling cards and returns to the same content position when dismissed.
- **Action pane** (action) — an optional modal bottom sheet over a scrim. It hosts new-phrasebook
  setup, guided creation, and review. At most one action pane is open.

A pane's component name identifies its fixed layer and behavior; its content name identifies what it
currently renders. For example, **creation** and **review** are content modes hosted by the same action
pane, not separate pane components.

## Navigation pane

The landing page shows the product identity, recent phrasebooks, suggested phrasebooks, and a prominent
new-phrasebook action. Returning users can start the same flow from the navigation FAB. Once the user
has phrasebooks, navigation groups them by language and offers browse views where needed. A dynamic
Starred collection may appear for a language with starred cards.

Selecting an existing phrasebook opens it in the content pane. Selecting a suggested phrasebook opens
its language-and-ability confirmation and then a read-only preview; **Save** commits that preview to the
local library.

## Guided creation

Creation uses two sequential action-pane modes:

1. **New phrasebook** — choose the target language and learner ability. Language is immutable for the
   resulting phrasebook. The last selected ability for a language seeds that language's next setup.
2. **Creation** — enter a situation, answer generated clarification questions, choose which suggested
   conversations to prepare, and generate the complete phrasebook.

The creation mode is a linear flow:

```text
topic → questions → conversation checklist (generation runs) → wait if needed → phrasebook
```

Topic submission calls `/context` with `{ seed, language }`. Each returned question initially uses its
first option. Advancing from questions starts `/phrasebook` with
`{ seed, language, ability: "basics", answers, checklist }`, where `checklist` contains all suggested
topics. The learner selects 1–8 topics locally while generation runs; model selection remains
server-owned.

Nothing is persisted while answering questions or selecting conversations, even if generation has
finished. Final Continue reuses the pending or ready response, keeps selected conversation bundles by
index, then pools, deduplicates, and caps their vocabulary before saving. It never starts a duplicate
request. Back without changes reuses work; changing answers or the seed invalidates it.
Confirmation shows the loading state for at least 1000 ms before saving and displaying the phrasebook,
configured by `PHRASEBOOK_MIN_LOADING_MS` in `web/app/src/components/creation-panel.js`.
This minimum overlaps any remaining generation time rather than adding a delay after generation.
Background failure leaves the checklist usable until Continue surfaces it; retry preserves choices.
Dismissal aborts outstanding requests and discards uncommitted results. Incomplete saves are rolled back.

The selected setup ability remains local phrasebook metadata. The current generation client explicitly
uses the API's `basics` ability until product behavior connects those concepts.

## Phrasebook view

A phrasebook opens in the content pane with three tabs:

- **Conversations** — generated conversation groups, in preparation order.
- **Vocab** — the pooled vocabulary group.
- **Starred** — all starred cards in the phrasebook.

Conversation cards use the speaker metadata encoded in `notes`. **YOU** cards are right-aligned and
blue-tinted; **PARTNER** cards are left-aligned and neutral. Alternative lines remain in their source
conversation. Vocabulary cards use the standard card layout.

Cards can be starred for review. Tapping a card plays its target-language pronunciation; swipe actions
expose card editing and deletion where the platform supports them. Phrasebook settings and card reorder
remain available from the phrasebook title menu. Generated group context is preserved on cards so
conversation membership survives local storage and display filtering.

The phrasebook action bar contains **Review**. Phrasebook content is not extended from this view; a new
situation starts a new guided phrasebook from navigation.

## Review

Review is a full-height action-pane mode opened from a phrasebook. Its study set is the phrasebook's
starred cards in phrasebook order, regardless of which content tab was visible. With no starred cards,
the action is unavailable.

Each review card supports:

- English-to-target or target-to-English direction, toggled for the current review session;
- hidden-answer reveal, including press-and-hold peek while the answer remains hidden;
- target-language audio, independent of the current direction;
- left/right swipe navigation.

Changing direction hides the current answer again. Moving to another card also resets reveal state.
Review does not loop and has no end-of-deck summary: navigation stops at the first and last card.
Closing review returns to the same phrasebook.

---

See `docs/journeys.md` for the retained end-to-end journeys and `docs/CARD_SCHEMA.md` for persisted card
and reading-token shapes.
