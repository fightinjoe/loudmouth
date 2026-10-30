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

The web navigation uses an illustrated-paper direction: a fixed foreground speech-bubble title,
slab typography, contextual artwork, and quiet reading surfaces.
Catchphrase is a personal language textbook for preparation and learning, not live translation.

First use offers **New phrasebook** and clickable example situations. Examples move slowly,
pause for focus, hover, touch, or manual scrolling, and stay static under reduced motion.
Selecting an example seeds the real creation flow; it does not generate or save automatically.
Returning users see every retained phrasebook in a two-row horizontal shelf, ordered by most
recent access/creation, plus language-grouped navigation and a separate creation action.
Counts describe unique saved cards. Ready illustrations belong to their actual phrasebooks;
missing, failed, and pending artwork uses neutral frog paper. Language browsing has no inferred
star state; starring and Review always require a phrasebook.

Selecting a phrasebook opens its content pane. Language browsing retains every card type.
Suggested phrasebooks still support language/ability confirmation, read-only preview, and explicit
**Save** through their existing entry points.

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

Creation shares the paper/frog background, white speech-bubble heading, slab chapter title,
white choice/input surfaces, and blue primary actions. Headers and footer controls remain outside
the independently scrolling body. The situation prompt asks what the learner is getting ready for,
not for a dictionary lookup. A seeded example survives first-time language selection and later
language edits. Initialization, questions, checklist, generation, cancellation, and retry use the
same visual language without changing request, preference, or atomic-save semantics.

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

Web phrasebooks are continuous, situation-specific textbooks. The fixed foreground title contains
library navigation, settings, editing controls, and the target language; the body scrolls vertically
under it. There are no topic tabs, paged panels, or edge swipes that compete with horizontal shelves.
The expandable **In this phrasebook** contents and **Starred** shortcut jump to stable chapter IDs.
This web adoption does not change native iOS.

Each Group is a chapter, ordered by stored Group position and identified by Group ID even when
titles duplicate. Chapters contain **Essential vocab**, **Key phrases**, and **Conversation**:
two-row horizontal Word and independent essential-phrase shelves, then sequential dialogue.
Shelves fill top-to-bottom before advancing a column; native touch scrolling, desktop dragging,
and focused Arrow/Home/End navigation reveal further items. Long text wraps rather than clipping.
Dialogue is never reordered into shelves: learner and partner lines retain their side and sequence,
with “or” between adjacent same-speaker alternatives in the same topic.

Supplemental **Translations**, **Words**, and **Chunks** follow when unplaced entries exist.
Topic Word placements are not copied into supplemental Words. A final **Starred** chapter is always
available, including its empty state. It contains each starred membership once in saved entry order,
the same order as Review; repeated Phrases use their first saved occurrence and translation.
The persistent **Review starred cards** action is available throughout the textbook and disabled
when there are no stars.

The backdrop repeats saved contextual artwork and fades into warm ivory reading paper. The approved
image prompt requests vintage hand-drawn spot illustrations in a whimsical tossed repeat, imperfect
rubber-stamp/block-print texture, coordinated greens, and situation-specific motifs. The 16:9 PNG
contract is unchanged. Seamless edge matching is a generation instruction, not a validated property.
Existing saved images are reused without automatic regeneration. Missing, pending, and failed
artwork uses frog paper; ready completion changes only the backdrop and library thumbnail,
without remounting cards or resetting scroll, focus, or editing.

Typography uses Hepta Slab titles, Roboto Condensed section labels, and Manrope language cards.
White rounded cards sit on paper; pale green edge-attached labels separate learning sections.
Target language and any reading precede English. Japanese displays script with available furigana
or romaji according to the phrasebook reading setting; absent romaji retains script.
Chinese pinyin remains ruby-aligned. Word definitions remain smaller optional teaching text.
Chunk cards show the full immutable source with its saved span highlighted.

Stars are independent 44px targets and update every occurrence of a membership without changing
another phrasebook. Unstarring keeps the saved card and evidence. Live counts are announced;
removing a focused Starred row restores focus to a remaining row, its chapter, or the Starred
shortcut rather than losing it.

Tapping a card speaks it. Phrase details open on a 500ms hold, right-click, or Shift+F10/Context Menu;
movement, scrolling, cancellation, or navigation cancels the hold and never also plays audio.
Editing changes shelves into vertical lists and keeps reorder within a single topic/section bucket.
Entry identities, occurrences, Word placements, membership stars, and persistence contracts are
unchanged. Preview **Save**, settings, card editing/deletion, source details, and language browsing
remain functional; language-wide browsing has no star/review controls without a phrasebook.

Browser verification covers the adopted web surface; physical-device thumb reach, VoiceOver,
and iOS Safari gesture behavior require their own checks. Very long titles with enlarged text
remain a hierarchy stress case. A new situation starts guided creation from navigation rather
than extending an existing phrasebook.

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
