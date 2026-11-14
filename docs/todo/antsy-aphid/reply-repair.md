---
kind: record
status: current
summary: "Keep the valid parts of an English reply: drop empty items, merge single-word families, flag repeated speakers, retry empty sections and keep the topic without a section that fails twice."
verified: 2026-11-13
---

# Repair partially invalid English replies

Part of [Launch: Antsy Aphid](../antsy-aphid.md).

- **What:** Validate English replies item by item instead of rejecting the whole reply at the first error. Empty or invalid items are dropped and flagged. A single-word family's word is merged into another family, or dropped when there is no other family. Two consecutive turns by the same speaker are kept and flagged. A section left empty or below its minimum is retried with one more full-topic call whose usable sections fill the gaps. A section that is still unusable leaves the topic without that section, flagged, instead of failing the request with 502. Replies that cannot be read at all (invalid JSON, wrong topic) still spend the retry as before.
- **Why:** Owner decisions 2026-11-13. Before this, any defect rejected the whole reply and spent the single validation retry, and two failures failed the whole phrasebook request with 502. In the 2026-11-13 local sample 4 of 48 English attempts were invalid; three were single items (a blank Things to say entry, a one-word family, an exchange with the same speaker twice) and one was an empty section ([live samples](../../evals/results/2026-11-13-generation-reliability-local.md)). Repeated speakers are legitimate: a speaker can have two consecutive things to say that should not be grouped into one response. Retrying only the failed section is tracked as [partial retry](../backlog/partial-retry.md).
- **Done when:** The parser, response schema and web app follow these rules with tests and response flags; [POST /phrasebook](../../api/phrasebook.md#model-tasks-and-raw-authoring-output) and [card schema](../../card-schema.md) document them; a live sample shows repairs and no request failing for a section.
- **Local result (2026-11-13):** implemented in `readGenerationReply` and `combineGenerationAttempts` (`api/src/phrasebook/parse.js`), `generateTopic` (`api/src/phrasebook/index.js`) and `validatePhrasebookResponse` (`api/src/schema/index.ts`); the web app stores and shows a topic with a missing section and repeated speakers (browser check). Eight live requests: 8 of 8 succeeded, no topic needed a second call, and 2 legitimate repeated speakers were kept ([live samples](../../evals/results/2026-11-13-generation-reliability-local.md#reply-repair)). Production confirmation is [production verification](production-verification.md).
