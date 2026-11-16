---
kind: record
status: current
summary: The adopted English prompt still puts thanks to hosts in Things to say; fix in a future evaluated prompt iteration.
verified: 2026-11-14
---

# Keep thanks to hosts out of Things to say

Part of the [backlog](../backlog.md).

- **What:** a future English-generation prompt iteration that stops thanks addressed to hosts ("Thank you for inviting me to your home.") from appearing in Things to say, evaluated against the current prompt.
- **Why:** the rubric counts thanks to hosts as generic language (owner decision 2026-11-12, [rubric decision log](../../evals/rubric.md#decision-log)). Prompt candidate R4, adopted on 2026-11-14, names thanking a host among the phrases to keep out of Things to say, and both models still produce it in the dinner greeting topic ("Thank you for inviting me.", "Thank you so much for having us."; [evaluation record](../../evals/results/2026-11-14-english-prompt-candidate-r4.md#content-measures)).
- **Done when:** an evaluated prompt revision removes thanks to hosts from Things to say without regressing other [rubric](../../evals/rubric.md) rules, and is adopted in `api/src/phrasebook/prompt.txt`.
