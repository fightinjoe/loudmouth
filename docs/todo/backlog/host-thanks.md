---
kind: record
status: current
summary: Prompt candidate 4 still puts thanks to hosts in Things to say; fix in a future evaluated prompt iteration.
verified: 2026-11-12
---

# Keep thanks to hosts out of Things to say

Part of the [backlog](../backlog.md).

- **What:** a future English-generation prompt iteration that stops thanks addressed to hosts ("Thank you for inviting me to your home.") from appearing in Things to say, evaluated against the current prompt.
- **Why:** prompt candidate 4, adopted on 2026-11-12, still produces it ([evaluation record](../../evals/results/2026-11-12-english-prompt-candidate-4.md#prompt-candidate-4)); the rubric counts it as generic language (owner decision 2026-11-12, [rubric decision log](../../evals/rubric.md#decision-log)).
- **Done when:** an evaluated prompt revision removes thanks to hosts from Things to say without regressing other [rubric](../../evals/rubric.md) rules, and is adopted in `api/src/phrasebook/prompt.txt`.
