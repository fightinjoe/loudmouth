---
kind: record
status: current
summary: Let learners change the creation ability remembered per language; today it can only be set once.
verified: 2026-11-12
---

# Change a remembered ability

Part of the [backlog](../backlog.md).

- **What:** a way for the learner to change the ability (none, basics, conversational) remembered for a language, so later creation sends the new value to `/context` and `/phrasebook`.
- **Why:** owner accepted the suggestion, 2026-11-12. Once a language has a remembered ability, creation skips the question and there is no way to change it; updating it is listed as deferred in [guided creation](../../design.md#guided-creation). A learner who improves keeps getting content for their old level.
- **Done when:** the learner can change the remembered ability for a language, the next creation uses it, and [guided creation](../../design.md#guided-creation) and [journeys](../../journeys.md) describe where the control lives.
