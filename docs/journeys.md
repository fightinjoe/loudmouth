---
name: journeys
description: >
  User journeys captured from the new CatchPhrase Figma interface. Each journey documents
  the end-to-end flow through the panes, the visible UI at each step, and the implementation
  details Claude Code will need to build it. Source of truth for interaction intent; defer to
  DESIGN.md / PANE_PROTOCOL for pane vocabulary and to CARD_SCHEMA for data shapes.
---

# User Journeys

Journeys are documented from the Figma file [CatchPhrase](https://www.figma.com/design/sn5VMavDDp38gSwsRVRhcS/CatchPhrase). Each captures one end-to-end path a user takes. Frames are read left→right as sequential steps.

> **Terminology note (resolved).** **Loudmouth** is the internal code name (repo, packages, code identifiers). **Catchphrase** is the public/product name used in all user-facing copy and docs; the Figma "CatchPhrase" camel-case is logo styling only. The collection noun is **phrasebook** (one word) everywhere. (DESIGN.md updated to match.)

> **Pane naming — two levels.** Every "pane" has a **component name** and a **content name**, and they must not be conflated:
> - **Component name** = the container's identity, layer, and behavior — fixed regardless of what it shows. There are three components (per `DESIGN.md` / Pane Protocol): the **navigation pane** (shell layer, revealed by sliding content aside), the **content pane** (content layer, slides sideways, swaps content without adding a layer), and the **action pane** (action layer, bottom-anchored over a scrim, modal, drag-down to dismiss, hosts a sequential push/pop stack).
> - **Content name** = which screen/mode the component is currently rendering. One component hosts many content modes.
>
> | Component | Behavior (fixed) | Content modes seen in these journeys |
> |---|---|---|
> | **Action pane** | bottom-anchored, over scrim, modal, drag-down to dismiss, push/pop stack | *Input*, *Translation*, *Group*, *New-phrasebook* ("Language & ability") |
> | **Content pane** | content layer, slides sideways to reveal nav, swaps without adding a layer | *Phrasebook view*, *Browse/all-list* |
> | **Navigation pane** | shell layer, fixed, revealed by sliding content aside | *Landing page* |
>
> So "Input pane / Translation pane / Group pane" below are **three content modes of the one action-pane component**, not three separate components. Where a heading names a content mode, the component is the action pane unless stated otherwise.

---

## Journey 1 — Creating a phrasebook

**Figma:** section `Creating a phrasebook` ([node 507-14014](https://www.figma.com/design/sn5VMavDDp38gSwsRVRhcS/CatchPhrase?node-id=507-14014)) — 10 frames.

**One-line:** From an empty landing page, the user creates a new phrasebook, looks up a word ("dinner"), explores AI-clustered related groups branching off that word, curates terms into the phrasebook by starring them, and lands in the finished phrasebook view.

**Panes traversed** (component → content mode): Navigation pane *(landing)* → **Action pane** *(new-phrasebook → input → translation → group)* → Content pane *(phrasebook view)*.

### Action-pane content stack (applies to this whole journey)

Within the **action pane** (one component — bottom-anchored, over scrim, drag-down to dismiss), the look-up experience is a **sequential stack of three content modes**, not three separate panes. "Back" pops one step in the stack.

1. **Input** (content mode) — takes a word/phrase to translate (the "Enter word or phrase" field + VIBE settings + a HISTORY of recent look-ups). **Back in Input mode dismisses the whole action pane.**
2. **Translation** (content mode) — shows the primary translation for the input term, plus related groups (the find-related clusters). **Back → Input.**
3. **Group** (content mode) — shows the full contents of one group. **Back → Translation.**

**🔍 Magnifying-glass action (re-seed).** Tapping the 🔍 on any term card in **Translation** or **Group** mode pops the stack back to **Input** and sets the input value to the tapped card's text **plus the source group name in parentheses** — e.g. tapping 🔍 on "I'll have this one" inside the *Ordering at a restaurant* group sets the input to `I'll have this one (ordering at a restaurant)`. This is the "start a new, more specific look-up from this card" affordance. (Figma: section `Changing the search phrase`, [node 588-3896](https://www.figma.com/design/sn5VMavDDp38gSwsRVRhcS/CatchPhrase?node-id=588-3896).)

*Implementation:* One action-pane component that internally holds a small content stack (push/pop), not three sibling modals. The 🔍 action is "pop to root + prefill" — clears the stack down to Input mode and mutates the input value, carrying the group name as parenthetical context so the next translation is biased by it. Back semantics differ by stack depth (dismiss the pane at root vs. pop a level), so the current content mode / depth must be tracked.

### Save model & basket badge (applies across the action stack)

- **Saving is immediate, no approval step.** Tapping a term's 🔖 bookmark commits that term to the phrasebook right then (fill red + card tint). It's basket-*like* in that it accumulates, but nothing is "checked out" — there is no staged/pending state to confirm.
- **The header badge counts terms added since this action pane opened** (session-scoped delta, not the phrasebook's total size). It appears once ≥1 term is saved and persists across all content modes (Translation, Group) at whatever depth.
- **Tapping the badge is the "done" escape hatch:** it dismisses the entire action pane (all stack levels at once) and lands on the phrasebook's Content-pane view. **Swiping the action pane down does the same.** This is the badge's real value — a one-tap return to the phrasebook instead of pressing back through each stack level.

*Implementation:* Because saves commit live, the badge is a simple session counter (increment on each new save; reset when the action pane is next opened). Both the badge tap and the drag-down dismissal must fully unwind the content stack and route to the phrasebook view — not just pop one level.

### VIBE model (Input mode)

- **VIBE = the tone of the translation.** It is the label for a group of two settings: **Formality** (e.g. Casual) and **Audience** (e.g. Strangers). Together they read as a sentence, e.g. "Casual conversation with strangers."
- **Scope: per-phrasebook default.** VIBE is stored on the phrasebook, not per look-up. Changing it in the Input pane updates the phrasebook's default so it carries to future translations — it is not a throwaway one-time override.
- **Expand/collapse behavior:** shown **expanded on a phrasebook's first translation** (the two labeled selects, as in step 3). On **subsequent** look-ups it renders **collapsed** to a single summary line ("Casual conversation with strangers"), tappable to expand and edit. (Collapsed form visible in the `Changing the search phrase` mock, node 588-3896.)
- **Distinct from "Your ability."** VIBE (tone of output) is a separate concept from the phrasebook's *Your ability* field (learner proficiency, set in New-phrasebook mode). Don't merge them.

*Implementation:* Persist `formality` and `audience` on the phrasebook; seed them at creation. **Shipped
default: Polite / Staff** — reconciled with `docs/API_DESIGN.md`'s Inputs defaults; the mocks in this
doc show Casual/Strangers, but the API contract's defaults take precedence over the mock screenshots.
The Input pane reads and writes those same fields. Track a per-phrasebook "has translated before" flag
(or infer from term count) to decide expanded vs. collapsed on open.

### Ability field (phrasebook-level, cross-journey)

Set in the action pane's New-phrasebook / Confirm mode (Journeys 1 & 2). Rules:

- **Values:** **None / Beginner / Intermediate / Advanced**. **Shipped default: Beginner** —
  reconciled with `docs/API_DESIGN.md`'s `ability` default; the New-phrasebook mock shows None, but the
  API contract's default takes precedence over the mock screenshot.
- **Immutable after creation.** Like **language**, ability is chosen once when the phrasebook is created and cannot be changed afterward. (Neither field is editable in phrasebook settings.)
- **Biases generation now.** Ability is fed into translation and find-related to tune difficulty of the output (not just stored metadata). Lower ability → simpler/more-supported output; higher → more advanced. Exact effect defined by the generation API.
- **App-wide default per language.** The last ability chosen for a given language is remembered app-wide and pre-fills the ability select the next time a new phrasebook is created **for that same language**.
- **Distinct from VIBE.** Ability = learner proficiency (affects difficulty). VIBE = tone of output. Separate fields.

*Implementation:* Persist `ability` (+ the immutable `language`) on the phrasebook; both are write-once at creation. Store a per-language "last ability used" app preference to seed the default. Pass `ability` to the translate / find-related calls.

### Step-by-step

**1. Landing page — empty state** (`Navigation pane - empty state`, 568:15849)
- Shell layer. Logo "CatchPhrase" (blue, large) + tagline "Collect the language you need, avoid the rest!".
- Blue CTA banner: **"No phrasebooks / Create your first!"** with a **"New phrasebook"** pill on the right.
- "SUGGESTED PHRASEBOOKS" section with a "View all" link and a list of suggested phrasebook rows, each `emoji + title`, a subtitle count ("6 phrases", "13 words & phrases"), and a "View" pill:
  - 👋 Greetings — 6 phrases
  - 🧭 Directions — 13 words & phrases
  - 🍜 Eating at a restaurant — 23 words & phrases
  - 🗣️ Exclamations — 5 phrases
- *Implementation:* The empty state and the populated landing page share the same `Landing page` component; only the CTA banner copy differs. Suggested phrasebooks are a **static, hand-curated seed list** (same for everyone, not personalized/generated). **For now, ship them as a placeholder** — real seed content is blocked on finalizing the generation API. Tapping a suggested row's "View" runs the preview-then-add flow in [Journey 2](#journey-2--adding-a-suggested-phrasebook). Row subtitle pluralizes and switches between "phrases" / "words & phrases" based on content composition.

**2. Action pane · New-phrasebook mode** (`Navigation pane - creating new phrasebook`, 565:14931)
- Tapping "New phrasebook" raises the **action pane** in **New-phrasebook mode** (the "Language & ability" content) over a **scrim** dimming the landing page. Partial-height sheet (~350px), not full-height. (This is the same action-pane component as the look-up stack, in a different content mode — it is not part of the input→translation→group stack.)
- Header: **"New phrasebook"** + subtitle "Create a collection for the language you want to catch and learn".
- Two `Select` rows in a settings group:
  - **Language** → Japanese (dropdown; options include the app's supported languages)
  - **Your ability** → None (dropdown; mock shows None — **shipped default is Beginner**, see Ability field below)
- Primary button: **"Create your first phrasebook"** (full-width, blue). Copy is first-run specific ("your first").
- *Implementation:* Two selects, both open a `Menu` overlay (see repeated `Menu`/`Menu option` instances in metadata). "Your ability" is a field now in DESIGN.md — learner proficiency, values **None / Beginner / Intermediate / Advanced**, **distinct from VIBE** (translation tone, set later in the Input pane). See [Ability field](#ability-field-phrasebook-level-cross-journey) for its full rules (immutable, biases generation, per-language default). **Language** is the phrasebook's fixed language, also immutable after creation. VIBE (formality/audience) is **not** set on this sheet — it defaults to **Polite / Staff** (mock shows Casual/Strangers; shipped default follows `docs/API_DESIGN.md`) and is first surfaced expanded on the first translation.
- > **⚠️ Prototype-branch caveat (not a retroactive product decision).** On the `textbook-guided-creation`
  > exploration branch, tapping "Create your first phrasebook" (or the returning-user "New phrasebook" CTA)
  > hands off to the new **Journey 5 — Guided phrasebook creation ("Textbook")** action-pane content instead
  > of Input mode (step 3 below). Step 3 onward — the manual Input→Translation→Group stack — is therefore
  > **not reachable from phrasebook creation on this branch**; it remains fully documented here and fully
  > implemented in code because [Journey 3](#journey-3--adding-terms-to-an-existing-phrasebook) ("Add" on
  > an existing phrasebook) still uses it verbatim, unchanged. This is an explicit, branch-scoped UX
  > exploration, not an edit to the shipped product's decided flow — see Journey 5 for the replacement.

**3. Action pane · Input mode — empty** (`Action pane - translate (empty)`, 436:6726) — *stack level 1*
- After creating, the app drops the user into the action pane in **Input mode** (level 1 of the content stack; bottom-anchored over scrim; content pane / landing dimmed behind).
- Header: back chevron (left) + **"🇯🇵 Japanese"** language label (display-only per DESIGN). **Back here dismisses the whole action pane.**
- Large placeholder input: **"Enter word or phrase"** (32px light).
- **"VIBE"** settings group with two selects (see [VIBE model](#vibe-model-input-mode) above):
  - **Formality** → Casual
  - **Audience** → Strangers (mock value — **shipped default is Staff**, see VIBE model above)
- *Implementation:* This is stack level 1 — Input mode. A fresh phrasebook opens here with VIBE **expanded** (this is the phrasebook's *first* translation). When the field is empty a **HISTORY** section of recent look-ups shows below VIBE (see the `Changing the search phrase` mock, where HISTORY lists "dinner"). No keyboard until focused.

**4. Action pane · Input mode — filled / typing** (`Action pane - translate (filled)`, 581:7724) — *stack level 1*
- User types **"dinner"**. Input now shows the term (large) with an **× clear** affordance on the right.
- iOS keyboard is up. VIBE group (Formality: Casual, Audience: Strangers as shown in the mock — shipped defaults are Polite/Staff, see VIBE model above) remains above the keyboard.
- *Implementation:* **Submission is the keyboard's return/Go key** — there is no on-screen "Translate" pill. The look-up fires **only on explicit return** (no live/debounced firing while typing). This **superseded** DESIGN.md's earlier explicit-Translate-pill / "No 'Go' key submission" rule (DESIGN.md now reflects return-key submit). History (`History` frame, hidden in metadata) exists as a component — recent look-ups appear when the field is empty (the HISTORY section from step 3).

**5. Action pane · Translation mode — loading** (`Action pane - translate (loading)`, 581:7937) — *stack level 2*
- Header collapses to just the queried term in quotes: **"dinner"** (back chevron left).
- Three stacked skeleton term cards with spinners (staggered opacity — top card solid white/active, lower cards progressively faded).
- *Implementation:* Skeleton is **3 term cards**, not shimmer rows. Staggered fade suggests results stream in top-first. Card height ~206px each.

**6. Action pane · Translation mode — results** (`Action pane - translate ("dinner")`, 436:6834) — *stack level 2*
- Header: **"dinner"** in quotes. **Back → Input mode.**
- **Primary result term card** (the direct translation):
  - English headword **dinner**, POS gloss "(noun) Evening meal"
  - Divider, then CJK **晩ご飯** (blue) + reading **Ban gohan**
  - Action row: 🔊 play (left) · 🔖 bookmark/save · 🔍 search · ⋯ overflow (right). **The 🔍 re-seeds a new look-up: pops to Input mode and prefills the input with this card's text (see Action-pane content stack above).**
- Two **call-out chips** below the card (dismissible, each with ×):
  - **"Tap to save to your phrasebook"** (coach mark pointing at the save/bookmark action)
  - **"View other related words and phrases"** (coach mark for the groups below)
- **Related phrase/word groups** (the "choose your own adventure" mechanic — see the [find-related skill](../.claude/commands/find-related.md)):
  - **MENU BASICS** — tag "📱 5 words" — list: menu (メニュー), water (水), check / bill (お会計 …)
  - **ORDERING AT A RESTAURANT** — tag "📱 5 phrases" — list: "Table for one, please", "Can I see the menu?" …
  - Additional groups scroll below (metadata shows 4 `Phrase group` instances).
- *Implementation:* This is the key new mechanic. A look-up returns **(1)** a primary term and **(2)** N clustered groups of related content, biased by the phrasebook's deck context. Each group has: a title, a count tag (`{n} words` / `{n} phrases`), a device/deck icon, and 3 preview rows (English + CJK). Groups are the branch points — tapping a group re-runs find-related seeded by it (narrower next set). Group card shows a **"Rectangle 1"** overlay at the bottom (likely a "view all / N more" fade-gradient affordance).

**7. Action pane · Translation mode — term saved** (`Action pane - translate with selection ("dinner")`, 581:8064) — *stack level 2*
- Same as step 6 but the primary **dinner** card is now **highlighted (cream/yellow tint)** and its bookmark icon is **filled red** = saved.
- A **badge "1"** appears top-right of the header — a live count of terms added to the phrasebook **since this action pane was opened** (see [Save model & basket badge](#save-model--basket-badge-applies-across-the-action-stack) above).
- The first call-out ("Tap to save…") is now gone; only "View other related words and phrases" remains.
- *Implementation:* Saving a term = tap the bookmark → **commits the term to the phrasebook immediately** (no approval step). Visual: card tint + filled red bookmark + increment the header basket badge. Coach-mark call-outs dismiss as their action is completed.

**8. Action pane · Group mode** (`Action pane - group ("ordering at a restaurant")`, 436:6937) — *stack level 3*
- Tapping a group (e.g. "Ordering at a restaurant") **pushes** Group mode (level 3). **Back → Translation mode.**
- Header: **"Ordering at a restaurant"** (back chevron left; header counter badge "1" persists).
- Full list of the group's terms as individual term cards, each: English (top) → divider → CJK (blue) + reading → action row (🔊 · 🔖 · 🔍 · ⋯). **The 🔍 on a card re-seeds a look-up: pops to Input mode with the input prefilled as `card text (ordering at a restaurant)` — card text plus this group's name in parentheses (see Action-pane content stack above).**
  - "Table for one, please" — 一人です — Hitori desu
  - "Can I see the menu?" — メニューを見てもいいですか？ — menuwo miteii desuka?
  - "I'll have this one" — これにします — koreni shimasu
  - "Check please!" …
- *Implementation:* Group detail = expanded flat list of that cluster's terms (each individually saveable). Note per metadata this view can itself render nested "Suggested terms" / more branch groups (hidden frames `Frame 39`), i.e. drilling into a group can surface further groups — the recursive branch. The earlier `Action pane - group with selection` variant (581:8576) is the same view with terms saved.

**9. Action pane · Group mode — multi-select** (`Action pane - group with selection`, 581:8576) — *stack level 3*
- Two term cards now tinted cream with **filled red bookmarks** ("Can I see the menu?" and "I'll have this one" saved).
- Header basket badge now reads **"3"** (dinner + these two), unchanged by which content mode you're in.
- *Implementation:* Confirms save is per-term and committed live, and the badge counts across the whole look-up→groups exploration (session delta), not per content mode. Tapping it here would dismiss straight to the phrasebook (see Save model & basket badge above).

**10. Content pane · Phrasebook view** (`Content pane - Dinner phrasebook`, 606:6499)
- Exiting the action pane lands the user in the **content pane** rendering the **Phrasebook view** for the new **"Dinner phrasebook"**.
- Header: ☰ menu (left) + **"Dinner phrasebook"** title (center). (Per DESIGN: menu slides content pane aside to reveal nav pane; tapping title → Edit terms.)
- Terms rendered as list rows (light-blue term cards): English (with 🔊 on the row) → CJK (blue) + reading:
  - **dinner** — 晩ご飯 — Ban gohan
  - Section label **"ORDERING AT A RESTAURANT"** groups subsequent terms:
    - "Can I see the menu?" — メニューを見てもいいですか？ — Menyuwo mitemoiidesuka?
    - "I'll have this one" — これにします — Korenishimasu
- Bottom **action bar** with two actions: **+ Add** and **⧉ Review**. (A FAB variant exists but is hidden in this frame.) This bottom bar is the **only** term-adding entry point — the old header "+" add button and bottom "Add terms" input are **removed** (DESIGN.md updated to match).
- *Implementation:* Saved terms carry their source-group as a **section grouping** in the phrasebook (the "ORDERING AT A RESTAURANT" header). The standalone look-up term ("dinner") sits ungrouped at top. Bottom action bar = **Add** (→ opens the action pane in **Input mode**, i.e. the Journey 1 look-up stack — see [Journey 3](#journey-3--adding-terms-to-an-existing-phrasebook)) and **Review** (→ the action pane's Review content mode — see [Journey 4](#journey-4--reviewing-a-phrasebook)). The header title still opens the Edit-terms menu (per DESIGN; Settings deferred — no mocks yet), but there is no header "+". Term rows here differ visually from the details-pane term cards (blue-tinted, inline play) — this is the phrasebook list-row treatment.

### Key implementation details & decisions (Journey 1)

1. **Ability field (resolved).** "Your ability" = None / Beginner / Intermediate / Advanced;
   **immutable after creation** (like language), **biases generation now**, and **defaults to
   Beginner** on a phrasebook's first-ever use of a language, then to the last value used **per
   language** app-wide on subsequent phrasebooks of that language. Now documented in DESIGN.md. See
   [Ability field](#ability-field-phrasebook-level-cross-journey).
2. **find-related is the spine of this journey.** The related-groups + drill-in mechanic (steps 6–9) is the "choose your own adventure" loop already prototyped in `/find-related`. Groups are deck-context-biased clusters, split words vs. phrases, each re-seedable. Build must wire look-up → find-related → group detail → (recursive) find-related.
3. **Save model (resolved).** Saving is per-term via 🔖 and **commits live to the phrasebook — no staging/approval**. The header **basket badge** counts terms added since the action pane opened; **tapping it (or swiping the pane down) dismisses the whole stack straight to the phrasebook**. See [Save model & basket badge](#save-model--basket-badge-applies-across-the-action-stack).
4. **Grouping persists into the phrasebook.** Terms saved from a group land under that group's section header in the finished phrasebook; the primary look-up term is ungrouped. Data model needs an optional `group`/`section` on saved terms.
5. **Look-up submits on keyboard return (resolved).** No on-screen Translate pill; fires only on explicit return, no debounced/live firing. Superseded DESIGN.md's old explicit-pill / no-return-key rule (DESIGN.md updated).
6. **Coach-mark call-outs** ("Tap to save…", "View other related words…") are dismissible (×) and auto-dismiss once their action is performed — first-run onboarding, not permanent chrome.
7. **Two term-row treatments.** Action-pane result cards (white/cream, full action row) vs. phrasebook list rows (blue-tinted, inline 🔊 only). These are distinct components.
8. **Bottom action bar (resolved).** Phrasebook actions = **Add + Review** in a bottom bar. The old header "+" add button and bottom "Add terms" input are **removed** — bottom bar is the sole add entry point. **Add** opens the Input-mode look-up stack ([Journey 3](#journey-3--adding-terms-to-an-existing-phrasebook)); **Review** opens the action pane's Review content mode ([Journey 4](#journey-4--reviewing-a-phrasebook)). Header title menu (Edit terms) stays; Settings deferred (no mocks yet). (DESIGN.md updated to match.)

### Open questions (Journey 1)

- ~~**Naming:** resolved — Loudmouth = code name, Catchphrase = public name, "phrasebook" (one word).~~ (DESIGN.md updated.)
- ~~Does a freshly-created phrasebook open into the look-up pane or Generate?~~ Resolved: it opens into the **input pane** (level 1 of the sequential 3-pane action stack: input → translation → group). (DESIGN.md updated — Generate removed, independent-panes model replaced.)
- ~~What does the header counter badge tap into?~~ Resolved: live "added since opened" basket counter; tapping it (or drag-down) dismisses the whole action pane to the phrasebook. Saves commit immediately (no approval).
- ~~Are VIBE settings per-phrasebook, per-lookup, or both? How do they relate to "Your ability"?~~ Resolved: **VIBE = translation tone** (Formality + Audience), a **per-phrasebook default** editable in the Input pane (expanded on first translation, collapsed after). **Distinct** from "Your ability" (learner proficiency). See [VIBE model](#vibe-model-input-mode).
- ~~Are suggested phrasebooks static or generated?~~ Resolved: **static, hand-curated seed** (not personalized). **Placeholder for now** — real content blocked on the generation API. "View" runs a preview-then-Save flow, documented in [Journey 2](#journey-2--adding-a-suggested-phrasebook).

---

## Journey 2 — Adding a suggested phrasebook

**Figma:** section `Viewing suggested phrasebook` ([node 602-5393](https://www.figma.com/design/sn5VMavDDp38gSwsRVRhcS/CatchPhrase?node-id=602-5393)) — 4 frames.

**One-line:** From the landing page, the user taps "View" on a **suggested** phrasebook (e.g. Greetings), confirms language/ability, previews the pre-filled phrasebook read-only, and taps **Save** to add it to their library — after which it moves out of Suggested and into Recent.

**Panes traversed** (component → content mode): Navigation pane *(landing)* → **Action pane** *(New-phrasebook / confirm mode)* → Content pane *(Phrasebook view — preview/unsaved)* → Navigation pane *(landing, updated)*.

> **Note (placeholder).** Suggested phrasebooks are static seed content and currently a **placeholder** (see Journey 1). This journey documents the intended interaction; the actual seed data lands once the generation API is finalized.

### Step-by-step

**1. Landing page — filled** (`Navigation pane - filled`, 592:5594)
- Populated landing: **RECENT** list (up to N phrasebooks, "View all") above **SUGGESTED PHRASEBOOKS** ("View all"). Each row: emoji + title + "{lang} · {n} words & phrases" subtitle + chevron/View.
- User taps a suggested row (e.g. **👋 Greetings**) — row highlights.

**2. Action pane · Confirm mode** (`Navigation pane - viewing suggested phrasebook`, 602:4991)
- Tapping "View" raises the **action pane** over a scrim in a **confirm variant of New-phrasebook mode** (same "Language & ability" component, confirm-specific copy).
- Header: **""Greetings" phrasebook"** + subtitle "Save and modify a collection for the language you want to catch and learn".
- **Language** → Japanese · **Your ability** → None (mock value — **shipped default is Beginner**; both editable before adding).
- Primary button: **"View "Greetings" phrasebook"**.
- *Implementation:* Reuses the New-phrasebook action-pane content (Language + Your ability selects); only header/subtitle/button copy differ. Lets the user set their ability (and confirm language) before the phrasebook is materialized. This is a distinct content mode from a blank New-phrasebook because it is seeded by the chosen suggestion.

**3. Content pane · Phrasebook view — preview (unsaved)** (`Content pane - Greetings phrasebook`, 602:4692)
- Opens the phrasebook **pre-filled but not yet in the library**. Header: back/menu (left) + emoji + title **"Greetings"** (center) + a **blue "Save" pill** (right) — the Save pill is the tell that this is an unsaved preview.
- Terms shown grouped under section titles, e.g. **"General greetings"** (Hello — こんにちわ — konnichiwa; Good morning — おはようございます — ohayo gozaimasu; Good evening — こんばんわ — konbanwa) and **"Questions"** (How are you? — お元気ですか …).
- Bottom Add/Review action bar present.
- *Implementation:* The Save pill (top-right) replaces the normal saved-phrasebook header affordance and is the commit action. Terms carry their seed group as section headers (same grouping model as Journey 1's saved-from-group terms). Until Save, the phrasebook is a preview — it should not appear in Recent and Add/Review may be inert or disabled (confirm).

**4. Landing page — newly added** (`Navigation pane - newly added phrasebook`, 602:5189)
- After **Save**, "Greetings" is now a real phrasebook: it appears **at the top of RECENT** (highlighted), and its subtitle count reflects the full seed ("Japanese · 10 words & phrases").
- **It is removed from the SUGGESTED list** (Greetings gone; Directions / Eating at a restaurant / Exclamations remain).
- *Implementation:* Saving migrates the item from the suggested-seed list into the user's real library; the suggested list must exclude already-added titles. Recent ordering puts the just-added phrasebook first.

### Key implementation details & decisions (Journey 2)

1. **Two-step confirm.** Suggested → **Confirm action pane** (language/ability) → **read-only preview with Save pill** → committed. Save is explicit here, unlike Journey 1's live per-term saves.
2. **Unsaved-preview state.** A phrasebook can exist in a *previewed-but-unsaved* state, signaled by the header **Save** pill. Needs a transient/unsaved model distinct from library phrasebooks.
3. **Suggested list dedupes on add.** Once added, the suggestion disappears from Suggested and the item is a normal Recent phrasebook.
4. **Component reuse.** Confirm mode reuses the New-phrasebook "Language & ability" action-pane content with different copy.

### Open questions (Journey 2)

- In the unsaved preview, are **Add / Review** (bottom bar) active, or disabled until Save?
- Can the user **edit terms** in the preview before saving, or is it strictly read-only until added?
- What seeds the **subtitle counts** on suggested rows before content exists (placeholder numbers)?
- ~~Does "Your ability" chosen here affect seeded content or is it metadata only?~~ Resolved: it **biases generation** (difficulty), is **immutable after creation**, and defaults per-language. See [Ability field](#ability-field-phrasebook-level-cross-journey). (Open sub-point: for a *suggested* phrasebook whose seed is placeholder, when does ability re-bias the already-authored content?)

---

## Journey 3 — Adding terms to an existing phrasebook

**Figma:** section `Adding another phrase` ([node 581-9586](https://www.figma.com/design/sn5VMavDDp38gSwsRVRhcS/CatchPhrase?node-id=581-9586)) — 7 frames (read low-x → high-x = start → end: phrasebook → Add/empty → filled → loading → translation → translation w/ selection → phrasebook with new addition).

**One-line:** From an existing phrasebook, the user taps **Add**, which opens the same look-up stack as Journey 1 (Input → Translation → Group), looks up a new phrase, saves a term, and returns to the phrasebook with it added at the top.

**Panes traversed** (component → content mode): Content pane *(phrasebook)* → **Action pane** *(input → translation → group)* → Content pane *(phrasebook, updated)*.

This is **Journey 1's look-up stack entered from an existing phrasebook** rather than a freshly created one. The [Action-pane content stack](#action-pane-content-stack-applies-to-this-whole-journey), [Save model & basket badge](#save-model--basket-badge-applies-across-the-action-stack), and [VIBE model](#vibe-model-input-mode) all apply unchanged. Only the differences are noted here.

### Step-by-step (differences from Journey 1)

1. **Content pane · Phrasebook** — user taps **Add** in the bottom action bar.
2. **Action pane · Input mode** — opens with the field empty, **VIBE collapsed** to its summary line (e.g. "Polite conversation with staff" — shipped default; the mock shows "Casual conversation with strangers") because this phrasebook has translated before, and **HISTORY** populated (e.g. "dinner"). User types **"Do you do takeout?"** and hits **return** to submit.
3. **Translation mode — loading → results** — primary term (テイクアウトはできますか？ / reading) plus related groups, e.g. **ASKING ABOUT TAKEOUT** (5 phrases: "Can I get this to go?" これは持ち帰りできますか？, "Is delivery available?" 配達は可能ですか？, "Do you have a to-go box?" …) and **TAKEOUT WORDS** (5 words: takeout テイクアウト, delivery, 配送, to go …).
4. **Save** — 🔖 the primary term → cream tint + filled red bookmark + header basket badge "1". Live-commits to this phrasebook.
5. **Return to phrasebook** (`Content pane - Dinner phrasebook with new addition`, 485:13461) — the new term appears **at the top** of the phrasebook (under a "Translations" section), above the pre-existing grouped terms. (Reached via back, the basket badge, or drag-down.)

### Key details (Journey 3)

1. **Add == look-up stack.** No separate "add term" UI; Add just opens Input mode. Everything in Journey 1's stack applies.
2. **Newly added term lands at the top.** New standalone look-up terms are prepended (newest-first) under a "Translations" section; group-sourced terms still carry their group section.
3. **VIBE starts collapsed** here (phrasebook has prior translations), unlike Journey 1's expanded first-run state.

### Open questions (Journey 3)

- Ordering: are ungrouped look-up terms always newest-first at the top, and do group-sourced saves append to their existing section or also float up?

---

## Journey 4 — Reviewing a phrasebook

**Figma:** section `Review` ([node 592-5540](https://www.figma.com/design/sn5VMavDDp38gSwsRVRhcS/CatchPhrase?node-id=592-5540)) — 4 frames (3 review states + the phrasebook entry point).

**One-line:** From a phrasebook, the user taps **Review** to enter the action pane's flashcard (Review) mode, flips cards between prompt and answer, controls the reveal, plays audio, and can flip the translation direction (English↔target).

**Panes traversed** (component → content mode): Content pane *(phrasebook)* → **Action pane** *(Review mode)* over the dimmed content pane.

### Structure

Review is a **content mode of the action pane** (bottom-anchored surface over a scrim dimming the phrasebook), rendered at near-full height. It is a standalone mode, not part of the look-up stack. Layout top→bottom:
- **Header** — × close (top-right) + a **direction toggle** (top-right area) showing the current prompt→answer direction and language (e.g. "English ⇅").
- **Review controls** bar (above the card).
- **Flashcard** — centered card. Front = prompt side; the answer side is hidden until revealed (skeleton placeholder shown), then shows CJK + reading (or English, depending on direction).
- **Review controls** bar (below the card) — includes a **reveal/hide** eye toggle (👁️‍🗨️) with the answer language label, and a **🔊 audio** control.

### Step-by-step

1. **Content pane · Phrasebook** — user taps **Review** in the bottom action bar.
2. **Review — prompt (answer hidden)** (`592:5236`) — card shows the prompt (e.g. English "Do you do takeout?"); answer area is a skeleton. Bottom controls: 👁️‍🗨️ reveal + "Japanese" label (left), 🔊 (right).
3. **Review — revealed** (`592:5417`) — answer shown (テイクアウトはできますか？ + reading テイクアウトわできますか？). The header direction icon updates.
4. **Review — reversed direction** (`485:13531`) — the direction toggle flips prompt/answer: now the **Japanese** side is the prompt and **English** is the answer. Confirms direction is user-toggleable mid-session.

### Key details (Journey 4)

1. **Action-pane content mode (standalone).** Review is a content mode of the action pane — not part of the look-up stack; × closes back to the phrasebook.
2. **Direction toggle.** Prompt→answer direction is switchable (English→target ↔ target→English) via the header control, affecting which side is hidden.
3. **Manual reveal.** The answer is hidden behind a skeleton until the user reveals it (eye toggle) — a flashcard self-test loop, consistent with BRIEF's "no scoring" review.
4. **Per-card audio.** 🔊 plays the target-language pronunciation.
5. **Uses a shared `Flashcard` + `Review controls` component** (per metadata) — build these as reusable pieces.

### Open questions (Journey 4)

- How does the user **advance** between cards — swipe, tap, or a next control? (Not evident in the 3 static frames.)
- Is there an **end-of-deck** state / session summary, or does it loop?
- Does the direction toggle persist as a **per-phrasebook default** (like VIBE) or reset each session?
- Which subset is reviewed — the whole phrasebook, a section, or a starred subset?

---

## Journey 5 — Guided phrasebook creation ("Textbook")

> **⚠️ Prototype-branch exploration.** This journey exists only on the `textbook-guided-creation`
> branch, as an alternate take on phrasebook creation. On this branch it **replaces** Journey 1's
> manual look-up as the creation path — there is no branching UI, by explicit decision, for this
> prototype. Journey 1's Input→Translation→Group stack remains fully implemented and documented
> because [Journey 3](#journey-3--adding-terms-to-an-existing-phrasebook) still uses it verbatim
> for adding terms to an *existing* phrasebook — only the *creation* hand-off changes here.

**Figma:** section `Section 1` ([node 784-20897](https://www.figma.com/design/sn5VMavDDp38gSwsRVRhcS/CatchPhrase?node-id=784-20897)) — 8 frames, read left→right (`769:16909` → `768:14167`).

**One-line:** From New-phrasebook mode, instead of a manual look-up the user types one **topic**
("salsa dancing"), answers a handful of AI-generated **context questions** and reviews an
AI-suggested **checklist** of sub-goals, then taps submit once more to get a **fully-populated,
multi-section phrasebook** in one shot — no per-card curation.

**Panes traversed** (component → content mode): Navigation pane *(landing)* → **Action pane**
*(new-phrasebook → textbook: topic entry → context+checklist → generating)* → Content pane
*(finished, multi-section phrasebook view)*.

### The `textbook` content mode (applies to this whole journey)

A new content mode of the **action pane** component, a sibling of `lookup` / `new-phrasebook` /
`review` (not a variant of the existing look-up stack). Internally linear, not a push/pop stack
like Journey 1's: **topic entry → context questions + checklist → generating → done** (closing
straight into the phrasebook — "done" has no visible 4th frame of its own). There is no back-and-
forth branching once the topic is submitted; the whole flow is a straight line to a generated
phrasebook.

**Submit affordance is a forward chevron, not return-key.** The topic-entry screen shows a `>`
button, distinct from Journey 1's Input mode, which fires only on the keyboard's return key with
no on-screen button (see Journey 1's "Look-up submits on keyboard return" resolved decision). This
new pane does **not** inherit that rule — it is a deliberate deviation, confirmed during design.

### Save model (applies to this whole journey)

**No staging, no per-card save, no preview/Save-pill gate.** Unlike Journey 1 (save per-term via
🔖) and Journey 2 (preview-then-explicit-Save), the whole generated phrasebook — every section,
every card — is **committed immediately** the moment generation succeeds. The user lands directly
in the finished, populated phrasebook view. There is no undo and no regenerate: once generation
completes, the context question answers and checklist selections are **discarded entirely** — not
retained on the deck, not logged to history, not recoverable.

### Step-by-step

**1. Landing page — empty state** (`Navigation pane - empty state`, 769:16909)
- Same landing page as Journey 1's step 1 — logo, tagline, "No phrasebooks / Create your first!"
  CTA banner with "New phrasebook" pill, SUGGESTED PHRASEBOOKS section. Unchanged.

**2. Action pane · New-phrasebook mode** (unchanged from Journey 1 step 2)
- Same Language + Your ability selects, same "Create your first phrasebook" button. See Journey 1
  step 2 for the full breakdown — nothing about this sheet changes. Only what happens **after**
  tapping the create button differs (see caveat above and step 3 below).

**3. Action pane · Textbook mode — topic entry, empty** (`Navigation pane - empty state`, 769:17068)
- Header: back chevron (left) + **"🇯🇵 Japanese"** language label (display-only, same as Journey 1's
  Input header) + an (initially hidden/opacity-0) trailing action slot.
- Large placeholder input: **"Enter word, phrase, or topic"** — note the copy explicitly includes
  "topic", broader than Journey 1's "Enter word or phrase".
- **HISTORY** section below (recent topics), same visual treatment as Journey 1's Input-mode
  history — reuses the same `History item` component.
- No VIBE settings on this screen — VIBE (formality/audience) is not surfaced in the Textbook flow
  at all; only the topic and language feed generation. `/textbook` is level-independent and takes no
  `ability` (removed 2026-09-01) — the New-phrasebook ability selector is not passed to this flow.
- *Implementation:* This is stack-position 1 of the linear flow. Reuses the Input-mode field/
  history visual pattern from `lookup-panel.js`, but the placeholder copy and submit affordance
  differ (see below).

**4. Action pane · Textbook mode — topic entry, filled** (`Navigation pane - empty state`, 769:17306)
- User types **"salsa dancing"**. The header's trailing action slot becomes a visible **✕ clear**
  button (same position/role as Journey 1's clear affordance).
- A **forward chevron `>`** appears bottom-right of the input, replacing Journey 1's implicit
  return-key-only submit. Tapping it (not pressing return) submits the topic.
- *Implementation:* `/textbook`'s first call (no `context`) fires on chevron tap:
  `{ topic, language }`.

**5. Action pane · Textbook mode — context questions + checklist** (`Navigation pane - empty state`, 769:17816)
- Header unchanged (back chevron + language label + ✕ clear); topic text now shown read-only above
  a divider (`salsa dancing`).
- A stack of **dynamic `Select` rows**, each labeled and pre-filled with a default value — in the
  mock: **"Salsa scene" → "Latin America (neutral)"**, **"Main setting" → "Social dancing at a
  club / social"**, **"Your role & gender" → "Man, leading"**, **"Your Spanish level" →
  "Near-zero / survival"**. These are **not a fixed field set** — the model authors however many
  questions (and whatever labels/options) make sense for the given topic; four is just this
  example's count.
- A forward chevron `>` at the bottom submits.
- *Implementation:* This whole screen's content — every question's label + options + default,
  reused `Select/Default` markup already established in `new-phrasebook-panel.js`/
  `lookup-panel.js`'s VIBE selects — comes from the **same `/textbook` response** as the checklist
  in the next frame. They render together (this doc splits them into two Figma-frame steps only
  because the mock's checklist frame, node `782:19808`, is a distinct screenshot — in the actual
  response and likely the actual UI they are one payload, possibly one scrollable screen).

**6. Action pane · Textbook mode — checklist** (`Navigation pane - empty state`, 782:19808)
- Below the (now presumably collapsed or scrolled-past) context questions, a **Checklist**
  component appears: label **"What do you most want to ask someone to do?"**, followed by a group
  of checkable items, some pre-checked by default:
  - ✅ "Ask someone to dance & the etiquette" (checked)
  - "Communicate on the floor (lead/follow, restart)" (unchecked)
  - "Compliments & thanks after a dance" (unchecked)
  - "Dance/step vocabulary" (unchecked)
- Forward chevron `>` submits.
- *Implementation:* Checklist items are AI-suggested candidate **group/section titles** for the
  generated phrasebook — checked items become the sections that actually get generated. No item
  text entry, no regenerate action (confirmed: no undo/redo on this flow) — simple check/uncheck
  only, reusing a plain checkbox-row list (no existing checklist component in the codebase; keep
  it minimal). On final submit, `/textbook`'s second call fires with `context` populated —
  `{ topic, language, context: { answers: {...}, checklist: [...checked labels...] } }`
  (exact shape is an implementation detail of the API contract, not fixed here).

**7. Action pane · Textbook mode — generating**
- Not present as a distinct mock frame — the transition from submitting the checklist to landing
  in the finished phrasebook has no dedicated Figma screenshot. Implement a loading state here
  (e.g. adapting Journey 1's `renderSkeleton` staggered-card treatment, reframed as "building your
  phrasebook" rather than "looking up a term") rather than a blank pause, since generation over
  multiple sections is likely to take longer than a single `/lookup` call.

**8. Content pane · Phrasebook view — finished** (`Content pane - Dinner phrasebook`, 768:14167)
- On generation success, the action pane closes straight into the **content pane**, landing on the
  brand-new, fully-populated phrasebook — no intermediate preview, no Save pill (unlike Journey
  2). Header: ☰ menu (left) + title **"Salsa Dancing 💃"** (center, topic-derived, emoji included)
  + ⚙️ settings icon (right) — note this header has **both** the ☰ menu and a trailing action,
  unlike Journey 1's finished-phrasebook header which shows only ☰ + title.
- Terms are rendered as **multiple named, collapsed sections**, each behaving like an accordion
  row rather than Journey 1's always-expanded flat/grouped list:
  - **CORE WORDS** — preview rows (e.g. *de nada — you're welcome*, *con gusto — my pleasure*, …)
    + a footer row **"10 words"** with a **View** expand toggle (chevron).
  - **GREETINGS & ASKING TO DANCE** — preview rows (*¡Hola! ¿Cómo estás? — Hi! How are you?*,
    *¿Bailas? — Wanna dance?*, …) + **"7 phrases" · View**.
  - **COMPLIMENTS & THANKS AFTER A DANCE** — further section, visible at the bottom of the
    screenshot, cut off (confirms more sections scroll below).
- Bottom **action bar**: same **+ Add** / **⧉ Review** pair as Journey 1's finished phrasebook —
  Add still opens the (unchanged) Journey 1 look-up stack for adding one more term the normal way,
  Review still opens the Journey 4 flashcard mode. Neither action is Textbook-specific.
- *Implementation:* Section = one checked checklist item's generated group, same underlying
  mechanism as Journey 1's "grouping persists into the phrasebook" (point 4 in that journey's key
  details) — each generated card's `context` field is set to its section's title before commit, so
  the **existing** phrasebook-view section-header rendering picks it up with no changes needed.
  The only new UI here is the **collapsed-by-default, expand-to-View** section treatment — Journey
  1's sections render always-expanded; this multi-section, likely-large result instead defaults
  every section to collapsed with a count + View toggle, given a Textbook phrasebook can plausibly
  contain many more cards up front than a hand-curated one.

### Key implementation details & decisions (Journey 5)

1. **New `textbook` action-pane content mode**, sibling to `lookup`/`new-phrasebook`/`review` —
   internally linear (topic → questions+checklist → generating → done), not a push/pop stack.
2. **`/textbook` is a new, separate endpoint from `/lookup`** (not a mode flag on `/lookup`) — see
   `docs/API_DESIGN.md`. One route, two calls distinguished by the presence/absence of a `context`
   request field: absent → return context questions + checklist; present → bulk-generate the full
   phrasebook.
3. **Forward-chevron submit**, not return-key — a deliberate, scoped deviation from Journey 1's
   resolved return-key-only rule; applies only within this new content mode.
4. **Context questions are fully dynamic per topic** — arbitrary label/options/default per
   question, AI-authored, no fixed schema in the client. The client renders whatever the API
   returns using the existing `Select` markup pattern.
5. **Checklist and context questions are generated together**, in `/textbook`'s first call — one
   LLM response, not two separate calls for questions vs. checklist.
6. **Checked checklist items become the generated phrasebook's section titles** — same `context`-
   field mechanism Journey 1 already uses for group-sourced saves; no new data model needed.
7. **Direct commit, no preview, no undo.** Generation success immediately creates the deck and
   imports every card — reuses the existing `createDeck` + `importCards` helpers (`db.js`), not
   the per-card `saveTermCard` path Journey 1 uses. The intermediate question/checklist state is
   discarded once generation succeeds — nothing about it is persisted.
8. **Collapsed-by-default sections** in the resulting phrasebook view — new UI, since a
   Textbook-generated phrasebook is expected to hold substantially more cards up front than a
   freshly hand-curated one.
9. **Journey 1 stays intact for Journey 3.** The manual look-up stack, its component, and its data
   flow are unchanged — Journey 5 only redirects the *creation* hand-off; adding a term to an
   existing phrasebook still opens the unchanged Journey 1 stack.

### Open questions (Journey 5)

- Exact `/textbook` response field names for questions/checklist/generated groups are not fixed by
  this doc — see `docs/API_DESIGN.md` for the authoritative contract once implemented.
- Whether context questions and the checklist render as one continuous scrollable screen or two
  separate sub-steps within the `textbook` mode is a UI-implementation choice; the Figma mock's two
  separate frames (`769:17816`, `782:19808`) may just be two scroll positions of one screen rather
  than two navigable steps — confirm during implementation.
- No dedicated "generating" mock frame exists — the loading treatment during the (likely
  multi-section, possibly slower) bulk-generate call is an implementation choice, not a traced
  design.
- Whether/how a failed generation (LLM error, timeout) is surfaced — no error-state mock exists for
  this flow, unlike Journey 1's `renderTranslationFrame` error branch.
