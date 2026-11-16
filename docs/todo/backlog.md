---
kind: ledger
status: current
summary: "Backlog of decided work without a milestone: creation-flow redesign, Spanish variants, phrasebook artwork, breakdown improvements, preset packs, /context checklist topics, exchange titles, placeholders, diagnostics mode, changing a remembered ability, dependency upkeep, DeepSeek load testing, translation thinking level, the Flash Lite injection leak, prompt follow-ups, deck card headings, category markers, chapter-sheet swipe, Review entry point and Japanese romaji cards; future work holds usage-based suggestions, partial retry of English sections and moving todos to an issue tracker after the launch."
verified: 2026-11-14
statuses:
  - open
  - in-progress
  - blocked
  - done
---

# Backlog

Decided work not yet assigned to a milestone.

| Date       | Status | Description                                                                                                      | Details                                          |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 2026-11-15 | open | **Security: injection leak on Flash Lite**<br>Stop Flash Lite English generation from copying instruction content into a chapter when the seed asks for it | [details](backlog/flash-lite-injection-leak.md) |
| 2026-11-15 | open | **API: translation thinking level**<br>Set minimal reasoning on the Gemini Flash Lite translation call in `/phrasebook`, as English generation does | [details](backlog/translation-minimal-reasoning.md) |
| 2026-11-14 | open | **Content: /context topics**<br>Review topic granularity for broad seeds such as directions, where narrow sibling topics overlap | [details](backlog/context-topic-granularity.md) |
| 2026-11-14 | open | **Content: /context topics**<br>Adopt the checklist rule that keeps courtesy and repair topics out of `/context` | [details](backlog/context-checklist-specificity.md) |
| 2026-11-14 | open | **Content: exchange titles**<br>Review DeepSeek exchange titles and try removing people-centred ones | [details](backlog/exchange-titles.md) |
| 2026-11-13 | open | **API: Japanese romaji cards**<br>One topic's Japanese Key phrases came back romanized instead of in kanji and kana | [details](backlog/japanese-romanized-text.md) |
| 2026-11-13 | open | **UX: Review entry point**<br>Show the Review starred cards button only in the Starred chapter sheet | [details](backlog/review-in-starred.md) |
| 2026-11-13 | open | **UX: Chapter sheet swipe**<br>Close the chapter sheet that lists cards (Words, Key phrases and so on) with a swipe down | [details](backlog/chapter-sheet-swipe.md) |
| 2026-11-13 | open | **UI: Category markers**<br>Remove or tone down the Words, Key phrases, Exchanges and Conversation glyphs on the phrasebook landing | [details](backlog/category-markers.md) |
| 2026-11-13 | open | **UI: Deck card headings**<br>Explore two-line headings or wider deck cards in Figma so topic and group titles stop truncating | [details](backlog/deck-card-headers.md) |
| 2026-11-13 | open | **API: DeepSeek load testing**<br>Load-test English generation and plan provider capacity and concurrency limits | [details](backlog/deepseek-load-testing.md) |
| 2026-11-13 | open | **Content: Spanish variants**<br>Offer Spanish (Latin America) and Spanish (Spain) as separate languages | [details](backlog/spanish-variants.md) |
| 2026-11-12 | open   | **UI: Phrasebook tiles**<br>Tile generator and color picker for phrasebook background artwork                    | [details](backlog/phrasebook-artwork.md)         |
| 2026-11-12 | open   | **UX: phrase breakdown**<br>Review and improve phrase breakdown design and content, and extend it to Words       | [details](backlog/breakdown-review.md)           |
| 2026-11-12 | open   | **UX: Language ability**<br>Let learners change the ability remembered for a language                            | [details](backlog/update-ability.md)             |
| 2026-11-12 | open   | **Content: static phrasebooks**<br>Static preset packs to replace repair-style `/context` topics                 | [details](backlog/preset-packs.md)               |
| 2026-11-12 | open   | **Content: phrasebook polish**<br>Keep thanks to hosts out of Things to say in a future English prompt iteration | [details](backlog/host-thanks.md)                |
| 2026-11-12 | open   | **Content: placeholders**<br>Placeholder support for learner-supplied proper nouns                               | [details](backlog/proper-noun-placeholders.md)   |
| 2026-11-12 | open   | **Content: streamline prompts**<br>Evaluate moving deterministic shaping out of the translation prompt           | [details](backlog/translation-prompt-shaping.md) |
| 2026-11-12 | open   | **Eval: show API response flags**<br>Developer diagnostics mode showing API response flags                       | [details](backlog/developer-diagnostics.md)      |
| 2026-11-13 | done   | ~~**UI: Phrasebook creation flow**<br>Implement the updated phrasebook creation flow from Figma~~ | [details](backlog/creation-flow-figma.md)        |
| 2026-11-13 | done   | ~~**NPM install scripts**<br>Decide which blocked npm install scripts to allow and commit the setting~~ | [details](backlog/npm-install-scripts.md)        |
| 2026-11-13 | done   | ~~**NPM cleanup**<br>Update web development tooling flagged by npm audit and deprecation warnings~~ | [details](backlog/web-dev-dependencies.md)       |

## Future work

| Date       | Status | Description                                                                                          | Details                                       |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 2026-11-14 | open | **Tooling: Issue tracker**<br>Move todo tracking from the wiki to an issue tracker after the launch | [details](backlog/issue-tracker.md) |
| 2026-11-13 | open | **API: partial retry**<br>Regenerate only a failed section of an English reply, compared with the merging approach | [details](backlog/partial-retry.md) |
| 2026-11-13 | open   | **UX: Personalized suggestions**<br>Tailor suggested situations and phrasebooks to the learner's use | [details](backlog/usage-based-suggestions.md) |
