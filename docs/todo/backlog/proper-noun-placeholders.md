---
kind: record
status: current
summary: Design a placeholder token for learner-supplied proper nouns that survives generation, translation and card assembly.
verified: 2026-11-12
---

# Placeholder support for proper nouns

Part of the [backlog](../backlog.md).

- **What:** design a placeholder token for names the learner supplies (a specific landmark, street, person). Needs a syntax distinct from reading brackets, translation passthrough, a code check that translated phrases keep the same tokens, reading/romanization passthrough, and client rendering.
- **Why:** the owner wants placeholders for proper nouns (2026-11-11). Today card assembly removes any `[...]` text in every language (`stripStrayBrackets` in `api/src/reading.js`), so a translated "Where is [a landmark]?" would lose the placeholder silently. The production prompt already produced one unprompted ("I'm [name], [partner]'s partner.", 2026-11-12). Until then, evaluations neither avoid nor penalize placeholders ([rubric decision log](../../evals/rubric.md#decision-log)).
- **Done when:** a token survives English generation, translation and card assembly end to end, and the English prompt allows it only for learner-supplied proper nouns, with negative-control topics showing no overuse.
