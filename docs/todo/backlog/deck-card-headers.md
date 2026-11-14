---
kind: record
status: current
summary: Explore two-line headings or wider landing deck cards in Figma so topic and group titles are not cut off, then implement the choice.
verified: 2026-11-13
---

# Deck card headings are cut off

Part of the [backlog](../backlog.md).

- **What:** explore in [Figma](https://www.figma.com/design/sn5VMavDDp38gSwsRVRhcS/CatchPhrase) how the phrasebook landing's deck cards look with two-line headings, slightly wider cards, or both, then implement the chosen option in the web app. The heading is `.deck-card-label`, rendered by `renderDeckCard` and `renderConversationCard` in `web/app/src/components/chapter-card.ts`: the topic title on Key phrases and Conversation cards, the family or exchange title on Words and Exchanges cards.
- **Why:** owner report from using the app, 2026-11-13: topic and group headings get cut off too easily. `.deck-card-label` is a single line ending in an ellipsis (`white-space: nowrap` and `text-overflow: ellipsis` in `web/app/src/styles/textbook-content.css`) on deck cards `min(196px, 62vw)` wide, as the [phrasebook view](../../design.md#phrasebook-view) specifies.
- **Open questions:** Two-line headings, wider cards or both; whether a heading still truncates after two lines.
- **Done when:** the owner has picked a variant in Figma, the web deck cards match it, and the [phrasebook view](../../design.md#phrasebook-view) states the new heading and card-width rules.
