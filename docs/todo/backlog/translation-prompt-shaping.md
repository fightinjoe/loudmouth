---
kind: record
status: current
summary: Evaluate moving formatting, normalization and stripping instructions from the translation prompt into endpoint code.
verified: 2026-11-12
---

# Move deterministic shaping out of the translation prompt

Part of the [backlog](../backlog.md).

- **What:** evaluate removing formatting, normalization and stripping instructions from the phrasebook translation prompt (`api/src/phrasebook/translate-prompt.txt`) and moving deterministic transformations into endpoint code. Obtain approval before editing prompt `*.txt` files, then run before-and-after regression evaluations for output behavior, latency and token usage.
- **Why:** not recorded when the item was added.
- **Done when:** the before-and-after evaluation is recorded in the [results ledger](../../evals/results.md) and, if adopted, the deterministic transformations live in endpoint code instead of the prompt.
