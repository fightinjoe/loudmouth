---
kind: record
status: current
summary: "Implement the updated phrasebook creation flow from Figma: suggestions, thinking state, ability question and topic checklist."
verified: 2026-11-13
---

# Updated creation flow from Figma

Part of the [backlog](../backlog.md).

- **What:** implement the updated web creation flow designed in [Figma, section 1304:33600](https://www.figma.com/design/sn5VMavDDp38gSwsRVRhcS/CatchPhrase?node-id=1304-33600). As of 2026-11-12 the section holds six phone frames of the Create Phrasebook pane: situation entry with a **Suggestions** list of example situations, the same entry with a submit action once text is typed, a "Thinking about the situation..." waiting state, a "What is your language ability?" step with three options and back/next buttons, and a "Which topics should be included?" checklist with back/next buttons.
- **Why:** owner request, 2026-11-12. The current flow is specified in [guided creation](../../design.md#guided-creation); the open [phrasebook creation exploration](../../explorations/index.md) covers the same pane and should be marked adopted or superseded when this lands.
- **Decided 2026-11-13 (owner):** `/context`'s generated questions stay, each as its own card after the ability question; language selection becomes the header dropdown, expanded on Japanese on first run; the five Figma suggestions submit directly; the ability option reads "Basic"; topic Back/Create sit inside the card (a mock error in the topics frame). Spanish variants are a separate [backlog todo](spanish-variants.md).
- **Done when:** the web creation pane matches the Figma frames, [design](../../design.md#guided-creation) and [journeys](../../journeys.md) describe the new flow, and request, preference and atomic-save behavior is unchanged unless the owner decides otherwise.
