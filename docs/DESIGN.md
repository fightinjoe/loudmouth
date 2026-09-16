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

1. **New phrasebook** — choose the target language. Language is immutable for the resulting phrasebook.
2. **Creation** — enter a situation, answer generated clarification questions, choose which suggested
   conversations to prepare, and generate the complete phrasebook.

The creation mode is a linear flow:

```text
topic → questions → conversation checklist (generation runs) → wait if needed → phrasebook
```

Topic submission calls `/context` with `{ seed, language, ability? }` (using the remembered ability
for this language when available) and independently starts `/phrasebook-title` with `{ seed }`. 
Otherwise the client prepends "What is your language ability?" to the returned questions, with 
options None, Basics, Conversational. Each question initially uses its first option. Advancing 
starts `/phrasebook` with `{ seed, language, ability, answers, checklist }`, using the selected or 
remembered enum value and excluding the ability question from `answers`. `checklist` contains all 
suggested topics. The learner selects 1–8 topics locally while generation runs; model selection 
remains server-owned.

Nothing is persisted while answering questions or selecting conversations, even if generation has
finished. Final Continue reuses the pending or ready response, keeps selected conversation bundles by
index, then pools, deduplicates, and caps their vocabulary before saving. It never starts a duplicate
request. Back without changes reuses work; changing answers or the seed invalidates it.
Confirmation shows the loading state for at least 1000 ms before saving and displaying the phrasebook,
configured by `PHRASEBOOK_MIN_LOADING_MS` in `web/app/src/components/creation-panel.js`.
This minimum overlaps any remaining generation time rather than adding a delay after generation.
Background failure leaves the checklist usable until Continue surfaces it; retry preserves choices.
Dismissal aborts outstanding requests and discards uncommitted results. Incomplete saves are rolled back.

Ability is saved as phrasebook metadata and remembered per language only after generation and import
succeed on final Continue. Failed saves and abandoned speculative results do not remember it. Future
creation skips this question and sends the remembered value to both endpoints. Updating it is deferred.
Historical setup preferences are not inferred or migrated to the new scale.

## Phrasebook view

On web, a phrasebook uses one tab and horizontally sliding page per conversation (`context`), followed
by **Vocab** (`type: "word"`, regardless of provenance). Context-less phrases occupy a
**Translations** page, newest-first; named conversations preserve saved card order. There is no
separate Starred tab: stars remain persistent card controls and **Review** uses the starred study set.
This web navigation does not change iOS.

Tabs fit their title text with 16 px horizontal padding on each side; the strip clips partially
visible tabs at the viewport edges. The first selection anchors left, the last anchors right, and
interior selections center. Clicking or keyboard-selecting with arrows or Home/End, without looping,
animates tabs and pages for 280 ms with cubic ease-out. Inward horizontal pointer drags starting in
the card list's 50 px left/right gutters advance one page beyond 45 px, for both flicks and long
drags. The left gutter selects the previous page, or reveals navigation on the first page; the right
gutter selects the next page. Shorter or cancelled drags snap back. Interior drags do not page.
Vertical scrolling stays native, and each page retains its own position. Offscreen pages are inert;
resizing realigns immediately, and reduced motion disables animation. Edit mode disables paging
drags and retains active-page reorder and card editing.

The visual reference is `explorations/phrasebook-navigation/PHRASEBOOK_EXPLORATION.html`: white
surfaces, Roboto Condensed headings and tabs, and Manrope card text. Borderless cards have 16 px
corners and 8 px gaps. Conversation cards use the speaker metadata encoded in `notes`: learner speech
is right-aligned blue (`#dbefff`), partner speech is left-aligned neutral (`#f9fafb`), and text remains
left-aligned on both sides. Alternatives from `notes.or` display an “or” separator and retain their
speaker's color. Conversation pages omit repeated headings, counts, and speaker labels. Stars change
only their icon, not card backgrounds; vocabulary remains neutral.

Card text places English above the target language without changing either line's typography.
Japanese displays one target form according to the phrasebook's reading setting: original Japanese
script with available furigana, or romaji using the same target-text styling. If a card has no romaji,
it retains Japanese script and available furigana. Chinese ruby pinyin is unchanged. The standalone
`explorations/card-styling/CARD_EXPLORATION.html` also demonstrates this order and Japanese selection.

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
