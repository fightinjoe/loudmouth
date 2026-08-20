---
name: design
description: >
  High-level UX design for the web and iOS app (public name: Catchphrase; code name: Loudmouth).
  Describes app structure, panes, and the core interaction model at the altitude needed to write an
  engineering design. Both interfaces are the same except where explicitly noted. For the end-to-end
  interaction nuance (step-by-step flows, states, copy) see `docs/journeys.md`; for pane vocabulary and
  gestures see the Pane Protocol; for data shapes see `docs/CARD_SCHEMA.md`.
---

> **Naming.** **Loudmouth** is the internal code name (repo, packages, identifiers). **Catchphrase** is
> the public product name used in all user-facing copy. The collection noun is **phrasebook** (one word).

### Information Architecture

This app organizes its UI according to the **Pane Protocol** (`web/docs/PANE_PROTOCOL.html`), the source of truth for pane vocabulary, the layer stack, state, transitions, and gestures; this doc describes the product-level design on top of it. Terms — *pane*, *layer*, *scrim*, *handle* — carry their protocol meanings. For how iOS maps this protocol onto SwiftUI, see `ios/ARCHITECTURE.md`.

**High-level app structure (Phase 1):** No tab bar. The app is a stage with four fixed **layers**, bottom to top: **shell** < **content** < **details** < **action** (Pane Protocol, Rule 8). A **pane** lives in exactly one layer:

- **Navigation pane** (shell layer) — fixed, always present, revealed by sliding the content pane sideways.
- **Content pane** (content layer) — shown by default; slides right to reveal the navigation pane. Its content changes based on the phrasebook selected. Switching between content screens (a phrasebook, a browse view, the landing page) swaps what the content pane renders — it does not add a layer.
- **Details pane** (details layer) — optional; bottom-anchored surface over a scrim showing one term's full detail. Not full-height. A horizontal swipe inside traverses to the previous/next sibling term without dismissing; a back affordance or scrim click closes it and returns to the content pane.
- **Action pane** (action layer) — optional; a bottom-anchored, modal surface over a **scrim**, contextual to the pane beneath it. At most one is open at a time; it always wins z-order. It can be dismissed by swiping down, tapping the scrim, or an explicit close. The action pane is not a single screen but a **host for several content modes** and a small internal navigation stack (see *Action pane* below).

### Pane naming — component vs. content

Every pane has a **component name** (its fixed identity, layer, and behavior) and a **content name** (which screen it is currently rendering). One component hosts many content modes — e.g. the action pane hosts *Input*, *Translation*, *Group*, *New-phrasebook*, and *Review* content. Don't conflate the two.

### Navigation pane

Navigation between phrasebooks (shell layer). It shows a **Recent** section (most-recently-viewed phrasebooks) and a **Suggested phrasebooks** section of curated, static seed collections the user can preview and add. A per-language organization applies once the user has phrasebooks: a section per language, up to a handful each, with an `All ${language} phrasebooks` link into a browse list in the content pane when there are more. If any term is starred for a language, a dynamic **Starred** phrasebook appears at the top of that language's section. The landing page (logo, tagline, Recent, Suggested) is the navigation pane's default content; its empty state swaps only the call-to-action copy.

### Content pane — phrasebook view

The primary content mode: all terms for one phrasebook. Header: a **menu** button (left; slides the content pane aside to reveal the navigation pane — swiping right from the left edge does the same), the phrasebook **title** (center; tapping it opens a menu with **Edit terms**), and no add button. **Edit terms** switches the term list into a drag-to-reorder mode.

Terms are shown grouped. Each saved term carries an optional **group context** (e.g. "Ordering at a restaurant") that determines its section; terms with no context render in an **untitled group** at the top with no header. **Ordering differs by section:** the untitled top section (standalone look-up terms) is **newest-first** (a new look-up term prepends to the top); within every **named** group, order is **oldest-first** (newest on the bottom). (Reconciles DESIGN's group-order rule with journeys.md J3's "new term appears at the top.")

A bottom **action bar** with two actions is the phrasebook's control surface:

- **Add** — opens the action pane at **Input mode** (the look-up stack below) to translate and add terms.
- **Review** — opens the action pane's **Review mode**.

There is no header "+" add button and no "Add terms" text input; the bottom bar is the sole term-adding entry point.

### Details pane

Tapping a term row opens the details pane (details layer) — a bottom-anchored surface over a scrim showing that term's full detail. Not full-height. Swiping left/right traverses sibling terms without dismissing; a back affordance or scrim click returns to the content pane at the same scroll position.

### Action pane

The action pane is a **surface that hosts content modes** — bottom-anchored, modal over a scrim, dismissible by swipe-down or scrim tap. It is the single surface for capturing language and for reviewing it. Its content modes:

- The **look-up stack** — *Input → Translation → Group*, a sequential stack where "back" pops one step.
- **New-phrasebook** — a standalone mode (not part of any stack).
- **Review** — a standalone mode (not part of any stack).

There is no separate "translate" vs. "generate" pane — one look-up flow, augmented by AI-clustered related content.

**Look-up stack modes:**

1. **Input** — a word/phrase field, the **VIBE** settings, and a **History** of recent look-ups. Submitting (keyboard **return** — there is no on-screen submit button) advances to Translation. Back here dismisses the pane.
2. **Translation** — the primary translation for the input, plus **related groups**: AI-clustered sets of related words/phrases, biased by the phrasebook's context (the "find-related" mechanic). Back → Input.
3. **Group** — the full contents of one related group. Back → Translation.

**New-phrasebook mode** — reached from the navigation pane (creating a new phrasebook) or from a suggested phrasebook (a confirm variant). Sets the phrasebook's **language** and the learner's **ability**.

**Review mode** — see [Review mode](#review-mode) below.

**Saving.** Each result card has a bookmark that **commits the term to the phrasebook immediately** (no staging/approval). A header badge counts terms added since the pane opened and doubles as a one-tap return to the phrasebook. A card's **🔍** re-seeds a fresh look-up from that card (popping back to Input with the card's text prefilled, plus the source group name as parenthetical context).

**Deferred creation.** Choosing language/ability and running look-ups does **not** create a phrasebook. It is persisted only when the **first term is saved**. Before that, dismissing returns to the navigation pane with nothing created — there are no drafts. (For suggested phrasebooks, the creation commit is the preview's **Save** action instead.)

**Language & ability.** Both are set at creation and are **immutable** thereafter (cannot be changed once the phrasebook exists). Language is the phrasebook's fixed target language; the "🇯🇵 Japanese" header label elsewhere is display-only. **Ability** (None / Beginner / Intermediate / Advanced) is the learner's proficiency and **biases generation**; the last ability used for a language becomes that language's default. **VIBE** (Formality + Audience) is the *tone* of the translation — a separate, editable per-phrasebook default surfaced in Input mode.

### Suggested phrasebooks

Curated, static seed collections shown in the navigation pane. Tapping one opens a confirm sheet (language/ability), then a **read-only preview** of the fully-populated phrasebook with a **Save** action; Save is the creation commit, after which it moves from Suggested into the user's library. Suggested content is fully context-grouped, and there is a distinct pre-authored seed per `{language, ability}` pairing. (Seed content is a placeholder pending the generation API.)

### Review mode

A flashcard content mode of the **action pane**, entered from a phrasebook's **Review** action, covering the whole phrasebook at once. Cards flip between prompt and answer with a manual reveal; a direction toggle flips prompt↔answer (target ↔ English), and per-card audio plays the target pronunciation. **Swipe left/right** advances/reverses through the deck. The deck **does not loop** and has no end-of-deck summary — it hard-stops at the first and last card. Review settings (e.g. direction) persist per phrasebook.

---

See `docs/journeys.md` for the detailed step-by-step flows, interaction states, exact copy, and open questions behind each of the above.
