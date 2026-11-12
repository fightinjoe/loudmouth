---
kind: record
status: current
summary: Trim modest count overruns in English generation with a warning instead of rejecting the reply.
verified: 2026-11-12
---

# Treat small count overruns as warnings in the English parser

Part of [generation reliability](../generation-reliability.md).

- **What:** align `validateGenerationResponse` (`api/src/phrasebook/parse.js`) with the evaluation policy: modest overruns (for example five exchange turns where four are allowed) should be trimmed with a warning (failure level 1), not rejected. Keep rejecting gross overruns (an order of magnitude over the limit) and wrong types.
- **Why:** the parser already trims Things to say and Words with a level-1 warning, but throws when exchanges, turns or response options exceed their bounds, spending the validation retry. Five-turn exchanges were rejected on 2026-11-02 (three surfing topics) and 2026-11-11 (two candidate replies) ([evaluation record](../../evals/results/2026-11-12-english-prompt-candidate-4.md#parser-rejections)). Owner decision 2026-11-12: extra turns or words are a warning; failure only when output is about 10x the limit ([rubric](../../evals/rubric.md#outcome-classes)).
- **Done when:** the parser and [POST /phrasebook](../../api/phrasebook.md) document the trimming rule; tests cover a small overrun (trimmed, level 1) and a gross overrun (rejected).
