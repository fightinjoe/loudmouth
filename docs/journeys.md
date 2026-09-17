---
name: journeys
description: >
  Current Catchphrase user journeys. Documents the retained guided-creation, phrasebook-browsing,
  suggested-phrasebook, and starred-card review flows. Defer to DESIGN.md and the Pane Protocol for
  pane vocabulary, API_DESIGN.md for endpoint contracts, and CARD_SCHEMA.md for persisted data.
---

# User journeys

> **Terminology.** **Loudmouth** is the repository's internal code name. **Catchphrase** is the public
> product name, and **phrasebook** is the user-facing collection noun.

## Pane map

| Component | Fixed behavior | Content used by these journeys |
|---|---|---|
| **Navigation pane** | Shell layer, revealed when content slides aside | Landing page, library navigation |
| **Content pane** | Main content layer; swaps screens in place | Phrasebook, browse list, suggested preview |
| **Details pane** | Expands from a phrase card over a scrim | On-demand phrase breakdown (web) |
| **Action pane** | Modal bottom sheet over a scrim | New phrasebook, creation, review |

Content names describe what a pane renders; they do not create new pane components. **Creation** and
**Review**, for example, are two modes of the action pane.

## Journey 1 — Creating a phrasebook

**One-line:** The learner chooses a language, describes an upcoming situation, answers a few targeted
questions, selects conversations to prepare, and receives a complete phrasebook.

**Panes traversed:** Navigation *(landing)* → Action *(new phrasebook → creation)* → Content
*(phrasebook)*.

### Step by step

1. **Start from navigation.**
   - In the empty state, the landing banner offers the first phrasebook.
   - Returning users start from the navigation pane's new-phrasebook FAB.
   - Both entry points open the same action-pane flow.

2. **Choose language and ability.**
   - The action pane first shows **New phrasebook** with target-language and learner-ability selects.
   - Language becomes the phrasebook's immutable target language.
   - The last ability selected for a language pre-fills that language's next phrasebook setup.
   - Continuing does not create or persist a phrasebook.

3. **Enter the situation.**
   - The action pane moves to **Creation** at full height.
   - The learner enters a situation, activity, or topic in the `Enter word, phrase, or topic` field.
   - Continue is disabled while the trimmed field is empty.
   - Submitting calls `/context` with `{ seed, language }` and shows a building state while the request
     is pending.

4. **Answer clarification questions.**
   - The action pane shows the entered situation under the language header.
   - Each dynamic question is a select whose initial value is the first returned option.
   - Answers stay in local creation state. Changing an answer invalidates earlier speculative work.
   - Continue advances to conversation selection and starts `/phrasebook` for all suggested topics.

5. **Choose conversations.**
   - The checklist presents short communicative goals returned by `/context`.
   - The endpoint's suggested checked state is preserved initially.
   - The learner may toggle items while keeping at least one and no more than eight selected.
   - Back returns to clarification questions without discarding answers or unchanged generation work.
   - Generation finishes in the background without saving or navigating away.

6. **Generate the phrasebook.**
   - Continue reuses the speculative request rather than sending another request.
   - The action pane shows `Building your phrasebook…` for at least 1000 ms after confirmation, or
     until generation finishes if longer, then starts saving the selected result.
   - Backend selection is not exposed in the client.

7. **Commit and open.**
   - Only explicit Continue plus a successful response creates the local phrasebook and imports cards.
   - Selected conversation bundles retain checklist order. The client pools their vocabulary,
     deduplicates by normalized English word, and caps at `min(24, 5 × selected topics)`.
   - The action pane closes and the new phrasebook opens in the content pane.

### State and failure rules

- Creation state is ephemeral. Dismissing aborts outstanding requests and discards uncommitted results.
- Back walks checklist → questions → topic; Back from topic dismisses creation.
- A context-request error returns to the topic stage on retry. A generation error returns to the
  checklist stage on retry and starts fresh generation. Previously entered choices remain available.
- The client never exposes a partly generated or partly imported phrasebook.
- The ability selected during setup is stored with the phrasebook. The generation call currently uses
  `basics` explicitly.

## Journey 2 — Browsing and prioritizing a phrasebook

**One-line:** The learner opens a phrasebook, browses conversations and vocabulary, and stars the cards
they want in the review set.

**Panes traversed:** Navigation *(library)* → Content *(phrasebook)*, optionally Details *(card)*.

### Step by step

1. **Open a phrasebook.** Selecting a recent or language-grouped phrasebook opens its content pane.
2. **Browse tabs.**
   - Each named conversation has its own tab, followed by **Vocab**.
   - Context-less phrases occupy **Translations** when present.
   - Stars mark the review set; there is no separate Starred tab.
3. **Read a conversation.** Speaker metadata renders learner and partner lines on opposite sides.
   Alternatives remain in the same conversation group.
4. **Use a card.** On web, tapping a phrase opens its breakdown. Select a phrase part or use
   **SHOW ALL** to inspect every explanation; optional patterns include notes and another example.
   The source stays visible during generation and errors, with Retry after a failure.
5. **Listen or prioritize.** Explicit audio buttons pronounce phrases; vocabulary still plays on tap.
   The star affordance changes the review set without opening details.
6. **Return or maintain content.** Close, Escape, or the scrim returns to the original card and scroll
   position. Editing and deletion remain in edit mode; the phrasebook title menu exposes settings
   and reorder. Opening another pane dismisses the breakdown rather than stacking task interfaces.

### Key rules

- Group membership comes from each generated card's `context` and survives persistence.
- Conversation order and vocabulary separation come from the generated groups; the learner is not
  asked to file generated cards.
- Starring is bounded binary emphasis, not a score or progress state.
- The phrasebook's only bottom action is **Review**. Extending an existing phrasebook is not part of the
  current flow.

## Journey 3 — Reviewing starred cards

**One-line:** The learner reviews only the cards they starred, reveals answers, changes direction,
listens to pronunciation, and swipes through the finite set.

**Panes traversed:** Content *(phrasebook)* → Action *(review)* → Content *(same phrasebook)*.

### Entry

The learner taps **Review** from a phrasebook with at least one starred card. The current content tab
does not change the study set: Review always receives every starred card in phrasebook order. When
there are no starred cards, Review is unavailable.

### Review states

1. **Prompt.** The first card opens with its answer hidden. The header shows the current prompt
   language and a direction toggle.
2. **Reveal.** The eye control keeps the answer visible. Pressing and holding the hidden-answer area
   peeks at the answer only until release.
3. **Direction.** The direction control switches English→target and target→English for the current
   session. Switching direction hides the answer again.
4. **Audio.** The sound action always speaks the target-language side, regardless of display direction
   or reveal state.
5. **Navigate.** Swipe left for the next card and right for the previous card. A newly reached card
   starts hidden.
6. **Finish or close.** The deck does not loop and has no summary screen. Swiping beyond either boundary
   does nothing. Closing the action pane returns to the same phrasebook.

### Key rules

- Review neither scores nor mutates card mastery.
- Direction is session state and resets when Review is reopened.
- Card ordering follows the phrasebook's stored order.
- Empty phrasebooks and phrasebooks without starred cards never open an unusable review session.

## Journey 4 — Saving a suggested phrasebook

**One-line:** The learner selects a suggested collection, confirms language and ability, previews the
complete phrasebook, and explicitly saves it.

**Panes traversed:** Navigation *(suggested list)* → Action *(confirmation)* → Content *(preview → saved
phrasebook)*.

### Step by step

1. Select a suggested phrasebook from the landing page or suggested browse list.
2. Confirm the target language and learner ability in the action pane.
3. Open the fully populated read-only preview in the content pane.
4. Tap **Save** in the preview header to commit it to the local library.
5. Continue in the normal phrasebook view with the same tabs, starring, details, and Review behavior.

Dismissing before **Save** leaves the library unchanged. A preview is transient and does not behave as
a partially created phrasebook.
