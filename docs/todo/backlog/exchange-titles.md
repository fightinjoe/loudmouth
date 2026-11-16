---
kind: record
status: current
summary: Review exchange titles from DeepSeek under the adopted English prompt and evaluate a change that removes people-centred titles.
verified: 2026-11-14
---

# Review DeepSeek exchange titles

Part of the [backlog](../backlog.md).

- **What:** Review exchange titles produced by DeepSeek with the adopted English prompt and, if they still fall short, evaluate a prompt or schema change that removes people-centred titles such as "They're busy" or "Your level". A change to `api/src/phrasebook/prompt.txt` needs owner approval and before-and-after evaluations (`AGENTS.md`).
- **Why:** Owner request, 2026-11-14. In the candidate R4 evaluation 18% of DeepSeek exchange titles named people ("They're busy", "They offer help", "Your level") against 4% for Gemini 3.5 Flash Lite, although the prompt asks for titles that name the moment or the choice; word-family titles did improve ([evaluation record](../../evals/results/2026-11-14-english-prompt-candidate-r4.md#content-measures)). The rubric treats people-centred titles as a minor naturalness finding ([rubric](../../evals/rubric.md#whole-topic)).
- **Done when:** The owner has reviewed a sample of DeepSeek exchange titles from the adopted prompt and either accepted them or adopted an evaluated change; the [results ledger](../../evals/results.md) records the review.
