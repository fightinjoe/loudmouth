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
- **Details pane** (details) — an expanding phrase-card modal over a scrim on web. It explains one
  phrase and returns to the original card and content scroll position when dismissed.
- **Action pane** (action) — an optional modal bottom sheet over a scrim. It hosts new-phrasebook
  setup, guided creation, and review. At most one action pane is open.

A pane's component name identifies its fixed layer and behavior; its content name identifies what it
currently renders. For example, **creation** and **review** are content modes hosted by the same action
pane, not separate pane components.

## Navigation pane

The landing page shows the product identity, recent phrasebooks, suggested phrasebooks, and a prominent
new-phrasebook action. Returning users can start the same flow from the navigation FAB. Once the user
has phrasebooks, navigation groups them by language and offers browse views over every retained card
type. Language browsing has no inferred star state; starring and Review always require a phrasebook.

Selecting an existing phrasebook opens it in the content pane. Selecting a suggested phrasebook opens
its language-and-ability confirmation and then a read-only preview; **Save** commits that preview to the
local library.

## Guided creation

**New phrasebook** opens the full-height **Creation** action pane directly. Language selection is a
step within that pane, not a separate setup sheet. With no saved phrasebooks, the learner first sees
an unselected language radio list and must choose a language, then press **Next**, before the prompt
appears. Returning learners start at the prompt using their last confirmed creation language; if no
preference exists, the newest saved phrasebook supplies the default.

The selected language appears below the textarea. Tapping it opens the same radio list with the
current language selected. **Next** confirms the choice and returns to the preserved prompt; **Back**
cancels the pending language change. Confirmed choices are remembered in this browser independently
of phrasebook saving. Language remains immutable after the phrasebook is saved.

The creation mode is a linear flow:

```text
language (first time or change) → topic → questions → conversation checklist (generation runs) → wait if needed → phrasebook
```

Topic submission calls `/context` with `{ seed, language, ability? }` (using the remembered ability
for this language when available) and independently starts `/phrasebook-title` with `{ seed }`. 
Otherwise the client prepends "What is your language ability?" to the returned questions, with
options None, Basics, Conversational. On web, each question occupies its own action-pane page.
Language and context questions share the same grouped-row radio component with circular indicators.
Clicking a radio only selects it; **Next** advances. Context questions start unselected. Generated
questions end with an Other radio and a text box whose placeholder is "other"; typing selects it,
and Next or Enter submits nonblank, trimmed text.
Ability retains only its three supported choices. Previous and Next preserve answers, with Next
disabled until the current question has an answer. Completing the last question
starts `/phrasebook` with `{ seed, language, ability, answers, checklist }`, using the selected or
remembered enum value and excluding the ability question from `answers`. `checklist` contains all 
suggested topics. The learner selects 1–8 topics locally while generation runs; model selection 
remains server-owned.

No phrasebook data is persisted while answering questions or selecting topics, even if generation has
finished; the confirmed language preference is independent. Final Continue validates the whole v3
draft, retains selected topics by original index, and atomically saves their independent sections and
Word placements. There is no word pooling or global cap, and no duplicate text request. Back without
changes reuses work; answer or seed changes invalidate text work. Changing the confirmed language
preserves the prompt but clears context, answers, and checklist, aborts speculative work, and resolves
the remembered ability for the new language before requesting fresh context.
Confirmation shows the loading state for at least 1000 ms before saving and displaying the phrasebook,
configured by `PHRASEBOOK_MIN_LOADING_MS` in `web/app/src/components/creation-panel.ts`.
This minimum overlaps any remaining generation time rather than adding a delay after generation.
Background failure leaves the checklist usable until Continue surfaces it; retry preserves choices.
Dismissal aborts text requests and discards uncommitted results. Incomplete saves are rolled back.

Context completion starts independent seed-based cover work. Answer/checklist changes reuse it;
a new seed or dismissal before commit cancels it. Atomic text commit binds the request identity to
the saved phrasebook, after which closing creation does not cancel it. A late result updates only
that book's illustration and the visible hero, without remounting cards or resetting page, scroll,
focus, or edit state. Failed art is nonfatal. Reload marks interrupted pending art failed without
automatically restarting paid work.

Ability is saved as phrasebook metadata and remembered per language only after generation and import
succeed on final Continue. Failed saves and abandoned speculative results do not remember it. Future
creation skips this question and sends the remembered value to both endpoints. Updating it is deferred.
Historical setup preferences are not inferred or migrated to the new scale.

## Phrasebook view

On web, saved phrasebooks open **Phrasebook**, a contents page with an optional decorative 16:9
watercolor hero on plain white paper. The composition is a close-up: large objects fill the landscape
frame, with a narrow 3–5% target safety margin and no clipped objects. Long objects lie horizontally
or diagonally to use the width. Actual generated margins vary; no automatic crop is applied.
Transparency is not required. Pending art reserves its space; ready art has empty alt text and white
surrounding space; failed art shows a subdued unavailable message. Topic previews show up to three
essential English phrases and two words with POS. The final preview item is vertically clipped to
suggest more content. The white footer shows section counts and **View** with a right chevron.
The whole topic preview is clickable: phrases, heading, and footer open Essential phrases; words
open Useful words. Each destination scrolls to its section and focuses the exact topic tab.

Each stored Group has one topic tab and horizontally sliding page, identified by Group ID rather
than title, including when titles duplicate. Each topic contains **Essential phrases**, **Useful
words**, and **Conversation** in that order: full-bleed white essential rows with bottom borders;
two-column Word tiles; gray-100 learner/gray-50 partner dialogue bubbles. Essentials are independently
generated occurrences, not ranked dialogue excerpts. Equal text can retain different meanings and
presentation in different sections.

Supplemental **Translations**, **Words**, and **Chunks** pages follow topics when unplaced entries
exist. Topic Word placements are not duplicated into the supplemental Words page.
A fixed leftmost **Starred** tab is always present, including at zero. It shows a solid blue star
and the exact unique-membership count, without a visible label; its accessible name is “Starred, N
cards.” **Review** appears only on Starred and is disabled when the phrasebook study set is empty.
This web navigation does not change iOS.

The title and tab row remain above the independently scrolling pages. Topic tabs fit their title text
with 16 px horizontal padding on each side, inside a scroller to the right of Starred. The pinned tab
uses an intrinsic count width, 12 px side padding, and a 6 px star/count gap. Its divider and trailing
shadow fade over 180 ms only while the topic strip's actual offset is positive. At rest, the row is one
white surface. The first topic anchors left beside Starred, the last anchors right, and interior
selections center within the **full tab-row viewport**, including the pinned width, clamped to the
available scroll range. A single topic anchors left; oversized titles follow the same boundary rules.
Clicking or keyboard-selecting with arrows or Home/End, without looping, animates tabs and pages for
280 ms with cubic ease-out. Starred expands and fades in over 360 ms on initial phrasebook
presentation; count changes do not replay its entrance. Count/font/viewport changes
coordinate width and scroll compensation before paint, retaining alignment or a manually scrolled
offset. Direct pointer, touch, and wheel input interrupt selection motion; selecting Starred stops
strip motion without moving it. Reduced motion skips transitions and settles in-flight geometry.
Inward horizontal pointer drags starting in
the card list's 50 px left/right gutters advance one page beyond 45 px, for both flicks and long
drags. The left gutter selects the previous page, or reveals navigation on the first page; the right
gutter selects the next page. Shorter or cancelled drags snap back. Interior drags do not page.
Vertical scrolling stays native, and each page retains its own position. Offscreen pages are inert.
Edit mode disables paging drags and retains active-page reorder and card editing.

The visual reference is `explorations/phrasebook-navigation/PHRASEBOOK_EXPLORATION.html`: white
surfaces, Roboto Condensed headings and tabs, and Manrope card text. Word and conversation bubbles
have 16 px corners and 8 px gaps; essential and Starred rows have square edges and bottom borders.
Each Phrase occurrence supplies its own translation, topic, section, and position; repeated
occurrences may share a durable Phrase without sharing presentation state.
Only dialogue supplies speaker state. Learner speech is right-aligned gray-100, partner speech
left-aligned gray-50, with text left-aligned on both. “or” appears only between adjacent same-speaker
dialogue lines in the same topic.
Starring changes white/gray-50 cards to blue-50 and gray-100 learner cards to blue-100. Unstarring
restores the original surface. Membership changes never affect another phrasebook.

Starred is a white, full-bleed collection in saved entry order (the same order as Review), not
reconstructed dialogue or a copy of essentials. Each membership appears once; a repeated Phrase
uses its first saved occurrence and translation. All card types use essential-row styling here,
without blue backgrounds. Word definitions and full highlighted Chunk source snapshots remain
available, along with audio, details, editing, and star actions. Starring updates every occurrence
without changing the active page. Opening Starred leaves the topic strip in place.
Unstarring removes only the collection row, never the saved card, membership, or evidence. Removing
a focused row moves focus to the next star, or the preceding star at the end. Removing the last
star leaves Starred selected, shows its empty state, and focuses the pinned Starred tab.
Count changes are announced without moving focus; topic tab identity survives membership updates.
The adopted web reference is `explorations/starred-access/STARRED_ACCESS.html`; iOS remains unchanged.

Card text places English above the target language without changing either line's typography.
Japanese displays one target form according to the phrasebook's reading setting: original Japanese
script with available furigana, or romaji using the same target-text styling. If a card has no romaji,
it retains Japanese script and available furigana. Chinese ruby pinyin is unchanged. The standalone
`explorations/card-styling/CARD_EXPLORATION.html` also demonstrates this order and Japanese selection.
Compact Word cards show their optional definition below the target and any standalone reading,
using smaller (13 px), muted text with an 8 px separation. Definitions wrap within the card and
remain literal text. Absent definitions add no empty row; Phrase and Chunk cards do not display
this compact definition line. This adopts the Word-definition hierarchy from the same exploration
without changing the existing English/target typography or adding usage notes and examples.

Cards can be starred for review when they have a membership in the active phrasebook. Tapping any
card speaks it: Phrases use their pronunciation, Words their dictionary headword, and Chunks the
full preserved source snapshot. Phrase breakdown opens on a 500 ms long press, right-click, or
Shift+F10/Context Menu key while the card is focused. Movement, scrolling, cancellation, or navigation
cancels the hold; its release never also plays audio. Stars remain independent tap targets.
There is no card speaker icon or visible Explore phrase link. Chunk rows render their full source
with the saved span highlighted rather than presenting an isolated fragment. In edit mode, entry-keyed card taps open
the editor. Word tiles become one column; reorder stays inside one topic/section bucket and updates
placements or occurrences, never canonical card identity. Contents and Starred have no reorder
overlay. Phrasebook settings remain available from the title menu. Language browsing remains
separate, with no star or review control without a phrasebook.

The phrasebook action bar contains **Review** only while Starred is selected. Phrasebook content is
not extended from this view; a new situation starts a new guided phrasebook from navigation.

## Phrase breakdown (web)

The reference is `explorations/phrase-breakdown/PHRASE_BREAKDOWN.html`. The existing details layer
hosts the expanding-card interaction; it is not a fifth layer or an action-pane mode. A geometric
copy grows from the card over 400 ms without scaling text. The original row stays in place but hidden,
preserving conversation geometry and scroll. Closing reverses to it. Reduced motion skips animation.
The modal has 12 px side margins within the 480 px app width, 36 px vertical margins, and 20 px corners.
Close remains bottom-right while the body scrolls.

English precedes the source phrase; ruby stays above the characters. Japanese reading mode does not
also show romaji. Selecting a semantic chunk shows its contextual English meaning, exact source
fragment with available readings, role, and explanation. Selected text, underline, and explanation
share blue emphasis. **SHOW ALL** highlights every chunk and displays explanations in source order;
**SHOW SELECTED** restores the last individual selection. Selecting a chunk exits all-mode.
The count and toggle follow the explanations; a single-part phrase has no toggle. Reopening resets
selection and detail scroll. Each API chunk displays its nested dictionary-form Words and exactly one
primary target: either an equivalent Word or a distinct contextual Chunk. Candidate controls resolve
the current phrasebook's durable membership state when details opens and after every toggle; the
analysis cache never supplies card IDs or star state. With no active phrasebook, analysis remains
available but save controls are unavailable.

Opening calls `/phrase-breakdown` with the exact occurrence snapshot, source references, and only the
active phrasebook context. The source remains visible during loading and errors; **Retry** makes a new
request after failure. **Regenerate** bypasses the cache while retaining the current analysis if the
new request fails. Valid teaching and candidates are cached in tab-scoped sessionStorage under the
serialized versioned request. Editing the request source or context therefore cannot reuse stale
analysis. Opening, closing, retrying, regenerating, and cache clearing make no durable library writes;
only an explicit successful star action saves or reuses a card and membership. Closing aborts the
client request and late results are ignored.

The conversation is inert while details is open. Focus enters Close; Tab stays within the modal.
Close, Escape, or the scrim dismiss and restore focus to the original card without scrolling.
Opening an action pane or navigating/replacing content releases details immediately, without a
delayed focus restoration that could interrupt the next pane. There is no sibling traversal or
drag-to-dismiss in this variant. Native iOS behavior is unchanged.

## Review

Review is a full-height action-pane mode opened from a phrasebook. Its study set contains one joined
entry per starred membership in phrasebook display order; a repeated Phrase uses that phrasebook's
first occurrence. Default order preserves that list, while the saved reverse or random setting is
applied once when the review session opens. With no starred memberships, the action is unavailable.

Each target keeps its own review contract:

- A **Phrase** uses the chosen occurrence's translation, so a shared Phrase in another phrasebook
  cannot change its interpretation.
- A **Word** presents its dictionary headword, own reading, and sense translation as the primary
  target. After reveal, a collapsible **Source examples** section shows full preserved snapshots with
  the encountered span highlighted and the historical source translation. Current-phrasebook
  examples come first, followed by the remaining examples chronologically. No evidence means no
  source section.
- A **Chunk** always uses its full original-script source snapshot. English-to-target shows the
  contextual gloss and masks only the selected span with a constant blank; reveal restores and
  highlights it without leaking ruby from a partially cut reading token. Target-to-English highlights
  the span immediately but keeps the gloss hidden until reveal. Role, explanation, and full source
  translation appear after reveal, and audio speaks the full source phrase rather than the fragment.

All targets support a session-only direction toggle, hidden-answer reveal, press-and-hold peek,
direction-independent target audio, and left/right swipe navigation. Changing direction or moving to
another entry hides the answer again. Review does not loop and has no end-of-deck summary: navigation
stops at the first and last entry. Closing returns to the same phrasebook. Source snapshots remain
usable after their parent Phrase, occurrence, or phrasebook is edited or deleted.

---

See `docs/journeys.md` for the retained end-to-end journeys and `docs/CARD_SCHEMA.md` for persisted card
and reading-token shapes.
