---
kind: record
status: current
summary: Review how finely /context splits broad seeds such as directions into topics, where narrow siblings make chapters overlap.
verified: 2026-11-14
---

# Review /context topic granularity for broad seeds

Part of the [backlog](../backlog.md).

- **What:** Review how finely `/context` splits broad seeds such as "asking directions" into topics ("Ask where a place is", "Understand distance", "Understand left and right") and evaluate a checklist rule or example that gives each topic its own subject. Editing `api/src/context/prompt.txt` needs owner approval and a before-and-after evaluation (`AGENTS.md`).
- **Why:** Owner observation, 2026-11-14: on generic topics such as directions DeepSeek becomes too verbose, while its coverage and usefulness are clearly better on specific topics such as surfing and meeting in-laws. In the candidate R4 review DeepSeek's remaining losses to Gemini 3.5 Flash Lite were mostly directions topics, where it spilled into sibling chapters (20 to 23 other-chapter findings against 5 to 7) ([evaluation record](../../evals/results/2026-11-14-english-prompt-candidate-r4.md#blind-review)).
- **Done when:** A review of `/context` checklists for broad seeds is recorded in the [results ledger](../../evals/results.md), with either an adopted prompt change or a decision to leave granularity as it is.
