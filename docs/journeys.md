---
kind: spec
status: current
summary: Step-by-step web user journeys — guided creation, browsing and starring a phrasebook, and starred-card Review.
sources: [web/app/src/panes/action-pane.ts, web/app/src/panes/content-pane.ts]
verified: 2026-11-12
---

# User journeys

These are the web client's journeys. Pane vocabulary is defined in [design](design.md) and the [Pane Protocol](web/pane-protocol.html), endpoint contracts in [API design](api-design.md), and persisted data in the [card schema](card-schema.md). **Catchphrase** is the product name and **phrasebook** the collection noun.

## Pane map

| Component | Fixed behavior | Content used by these journeys |
|---|---|---|
| **Navigation pane** | Shell layer, revealed when content slides aside | Landing page, library navigation |
| **Content pane** | Main content layer; swaps screens in place | Phrasebook, browse list |
| **Details pane** | Expands from a phrase card over a scrim | On-demand phrase breakdown (web) |
| **Action pane** | Modal bottom sheet over a scrim | Creation, review, settings, JSON export |

Content names describe what a pane renders; they do not create new pane components. **Creation** and **Review**, for example, are two modes of the action pane.

## Journey 1 — Creating a phrasebook

**One-line:** The learner chooses a language, describes an upcoming situation, answers a few targeted questions, selects conversations to prepare, and receives a complete phrasebook.

**Panes traversed:** Navigation *(landing)* → Action *(creation, including language selection)* → Content *(phrasebook)*.

### Step by step

1. **Start from navigation.**
   - First use offers **New phrasebook** and slowly moving, clickable example situations.
   - Returning users start from the library's creation bubble or separate creation button.
   - Every entry opens the same full-height action pane; examples preserve their seed through first-time language selection without submitting or saving automatically.

2. **Choose language when needed.**
   - With no saved phrasebooks, the pane shows an unselected language radio list. Select a language, then press **Next** to reach the prompt; selecting the radio does not advance.
   - Returning users start at the prompt with their last confirmed language. If no preference exists, the newest saved phrasebook supplies the default.
   - Confirmed language choices are remembered separately; continuing does not save a phrasebook.
   - Remembered ability is reused per language; otherwise creation asks before the context questions.

3. **Enter the situation.**
   - The selected language appears below the textarea. Tap it to choose another using the same radio list. **Next** confirms; **Back** cancels the language edit. Both preserve the typed prompt.
   - The learner describes an upcoming situation in **What are you getting ready for?**
   - Continue is disabled while the trimmed field is empty.
   - Submitting calls `/context` with `{ seed, language, ability? }` and independently requests a title. A building state remains visible while context is pending.

4. **Answer clarification questions.**
   - The action pane shows the entered situation under the language header.
   - On web, each question has its own radio-list page with no initial selection.
   - Language and context questions share the radio-list component. Clicking an item only selects it; **Next** advances. Generated questions end with an Other radio and a text box with placeholder "other"; nonblank text is submitted with Next or Enter.
   - The client-owned ability question offers only None, Basics, and Conversational.
   - Previous and Next preserve answers; Next is disabled while the current answer is empty.
   - Answers stay in local creation state. Changing an answer invalidates earlier speculative work.
   - Completing the last question advances to conversation selection and starts `/phrasebook` for all suggested topics.

5. **Choose conversations.**
   - The checklist presents short communicative goals returned by `/context`.
   - The endpoint's suggested checked state is preserved initially.
   - The learner may toggle items while keeping at least one and no more than eight selected.
   - Back returns to the last question without discarding answers or unchanged generation work.
   - Generation finishes in the background without saving or navigating away.

6. **Generate the phrasebook.**
   - Continue reuses the speculative request rather than sending another request.
   - The action pane shows `Building your phrasebook…` for at least 1000 ms after confirmation, or until generation finishes if longer, then starts saving the selected result.
   - Backend selection is not exposed in the client.

7. **Commit and open.**
   - Only explicit Continue plus a successful response creates the local phrasebook and imports cards.
   - Selected topics retain checklist order and all four sections: **Things to say**, **Likely exchanges**, **Words** in titled families, **Example conversation**. Only exact-English Things to say is deduplicated across retained topics; all exchange options, example lines and Word placements remain, without pooling or a global word cap.
   - The action pane closes and the new phrasebook opens in the content pane.

### State and failure rules

- Phrasebook creation state is ephemeral. Dismissing aborts outstanding requests and discards uncommitted results; the confirmed language preference survives.
- Back walks checklist → individual questions in reverse → topic; Back from topic dismisses creation. Back from language editing returns to the unchanged prompt; from first-time language selection it dismisses.
- Changing the confirmed language clears prior context/answers/checklist and aborts speculative work, while preserving the prompt. Submitting it requests fresh context with the new language and ability.
- A context-request error returns to the topic stage on retry. A generation error returns to the checklist stage on retry and starts fresh generation. Previously entered choices remain available.
- The client never exposes a partly generated or partly imported phrasebook.
- The selected or remembered ability is sent to generation and stored with the phrasebook. Ability is remembered for the language only after a successful commit.
- The v4 web library starts in a fresh namespace; older databases/preferences are untouched, not migrated ([card schema](card-schema.md#namespace-isolation-and-backup)).

## Journey 2 — Browsing and prioritizing a phrasebook

**One-line:** The learner opens a phrasebook, browses conversations and vocabulary, and stars the cards they want in the review set.

**Panes traversed:** Navigation *(library)* → Content *(phrasebook landing → chapter sheet)*, optionally Details *(card)*.

### Step by step

1. **Open a phrasebook.** Selecting a recent or language-grouped phrasebook opens its illustrated landing, as does completing creation. The bubble title collapses to a slim bar as the landing scrolls.
2. **Choose a category.**
   - A **Starred** card leads the landing once the phrasebook has stars; it is absent at zero.
   - Each category with content — **Words**, **Key phrases**, **Exchanges**, **Conversation** — has one card with its glyph and count. Words and Exchanges rows hold one card per family or exchange, headed by its title and clustered by topic; Key phrases and Conversation rows hold one card per topic, headed by the topic title, including topics with equal titles. Swipe or drag a row sideways while the landing scrolls vertically.
   - Unplaced entries appear as supplemental **Translations**, **Words**, or **Chunks** cards after the categories.
   - **Review starred cards** stays in the landing's tray and is disabled until the phrasebook has stars.
3. **Open the chapter sheet.** A category header opens that category from the top; a deck card opens it scrolled to that family, exchange, or topic, briefly highlighting an exchange. The category is one page covering every topic: Words and Exchanges sections are headed by family or exchange title with the topic underneath, Key phrases and Conversation sections by topic, and headings stay pinned while their section scrolls. The sheet title is a chapter menu for switching to Starred, another category, or a collection without closing the sheet. Back, the scrim, or Escape returns to the landing.
4. **Read an exchange or example.** Exchanges read top to bottom: learner turns left on gray, partner turns right on white. Each titled exchange has explicit response options within a turn, separated by “or”; Example conversation is a separate linear sequence without alternative separators.
5. **Use a card.** On web, tapping a card in the sheet speaks it. Long-press a phrase for 500 ms to open its breakdown; right-click or Shift+F10 provides the same action. Select a phrase part or use **SHOW ALL** to inspect every explanation; optional patterns include notes and another example. The source stays visible during generation and errors, with Retry after a failure.
6. **Prioritize.** The star affordance changes the review set without opening details or speaking. Starred cards take the phrasebook accent tint; the Starred sheet deduplicates memberships in Review order under **Words** and **Phrases** tabs, remembering the tab for this phrasebook during the session, and each row's **In context ›** opens its category at that card.
7. **Return or maintain content.** Close, Escape, or the scrim returns to the original card and scroll position. Settings open from the title bar; **Reorder cards** sits in the chapter sheet header. Neither edits card content. Reorder stays within one topic's section, one exchange turn's response options, or one Word family, and closing the sheet discards an unsaved reorder. Opening another pane dismisses the breakdown rather than stacking task interfaces.

### Key rules

- Occurrences retain group, section, speaker when applicable, and translation through persistence. Exchange options retain exchange ID and turn index; Word placements retain family ownership. Exchange/family titles and ordering survive reload and backup.
- Conversation order and titled Word families come from generated groups; the learner is not asked to file generated cards. Shared Words keep their placements in every topic/family.
- Starring is bounded binary emphasis, not a score or progress state.
- **Review starred cards** remains available from the landing and is disabled without stars. Extending an existing phrasebook is not part of the current flow.

## Journey 3 — Reviewing starred cards

**One-line:** The learner reviews only the cards they starred, reveals answers, changes direction, listens to pronunciation, and swipes through the finite set.

**Panes traversed:** Content *(phrasebook)* → Action *(review)* → Content *(same phrasebook)*.

### Entry

The learner taps **Review starred cards** in the phrasebook landing's tray with at least one starred card. Review receives every starred card in phrasebook order. At zero, the Starred card disappears from the landing and Review is disabled. Removing the final star does not navigate away; an open Starred sheet shows its empty state.

### Review states

1. **Prompt.** The first card opens with its answer hidden. The header shows the current prompt language and a direction toggle.
2. **Reveal.** The eye control keeps the answer visible. Pressing and holding the hidden-answer area peeks at the answer only until release.
3. **Direction.** The direction control switches English→target and target→English for the current session. Switching direction hides the answer again.
4. **Audio.** The sound action always speaks the target-language side, regardless of display direction or reveal state.
5. **Navigate.** Swipe left for the next card and right for the previous card. A newly reached card starts hidden.
6. **Finish or close.** The deck does not loop and has no summary screen. Swiping beyond either boundary does nothing. Closing the action pane returns to the same phrasebook.

### Key rules

- Review neither scores nor mutates card mastery.
- Direction is session state and resets when Review is reopened.
- Card ordering follows the phrasebook's stored order.
- Empty phrasebooks and phrasebooks without starred cards never open an unusable review session.
