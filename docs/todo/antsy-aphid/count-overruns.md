---
kind: record
status: current
summary: Keep every count overrun in English generation and flag it; remove all trimming and count-based rejection.
verified: 2026-11-15
---

# Tolerate and flag count overruns in English generation

Part of [Launch: Antsy Aphid](../antsy-aphid.md).

- **What:** English generation never trims or rejects content for being too long. Every item is kept, and anything over the limit for its section is flagged with section, topic, received count and limit: a `count-overrun` entry in the response's `flags`, logged as a `phrasebook_flag` event (owner approval 2026-11-13). The parser (`readGenerationReply` in `api/src/phrasebook/parse.js`) and the final response check (`validatePhrasebookResponse` in `api/src/schema/index.ts`, which the web app installs as `@catchphrase/card-schema`) both drop these maximums. Minimum counts and types are still enforced, with defects repaired as in [reply repair](reply-repair.md). `prompt.txt` keeps its current targets (changing it needs owner approval). Flag limits, approved by the owner 2026-11-13:

  | Section | Flag when more than |
  |---|---|
  | Things to say | 8 |
  | Likely exchanges per topic | 4 |
  | Turns per exchange | 6 |
  | Alternate responses per turn | 3 |
  | Example conversation lines | 12 |
  | Words per topic | 18 (10 until 2026-11-15) |

- **Why:** owner decision 2026-11-13, replacing the 2026-11-12 plan to trim modest overruns. The owner's view per section, explicitly subjective: more Words is generally better, a trade-off between their value and tokens; exchanges and conversations running one or two turns long are fine if that completes the exchange; alternates beyond two are worth least because most are boolean, a third is sometimes useful, and an exchange with more alternates is harder to read. Today the parser trims Things to say and Words and rejects the other overruns, which uses up the validation retry. Five-turn exchanges were rejected on 2026-11-02 (three surfing topics) and 2026-11-11 (two candidate replies) ([evaluation record](../../evals/results/2026-11-12-english-prompt-candidate-4.md#parser-rejections)). There are no users yet, so the response contract can change without backward compatibility (owner, 2026-11-13).
- **Since 2026-11-15:** the Words limit is 18, the three families of six that prompt R4 asks for, and the response schema sent to the provider caps every list, so overruns now come only from a provider that ignores the schema (owner decision, [decisions](../../decisions.md)).
- **Done when:** overruns in every section above are kept and flagged, and none are trimmed or rejected; tests cover a flagged overrun in each section; the web app displays longer exchanges, conversations and alternate lists, checked in a browser; [POST /phrasebook](../../api/phrasebook.md) and [card schema](../../card-schema.md) state the flag limits and that maximums are no longer enforced.
