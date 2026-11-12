---
kind: record
status: current
summary: Deploy English-generation prompt candidate 4, adopted 2026-11-12, and spot-check live /phrasebook output.
verified: 2026-11-12
---

# Deploy the revised English-generation prompt

Part of the [v4 release](../v4-release.md) milestone. The prompt ships with the API, so this completes with or after the [coordinated release](coordinated-release.md).

- **What:** release `api/src/phrasebook/prompt.txt` as adopted on 2026-11-12 (prompt "candidate 4": no generic language in Things to say or Words, single-option exchange openers, no English fallback, no contractions instruction). The prompt is already in the code; only deployment and the post-deploy check remain.
- **Why:** candidate 4 scored equal or better than the previous prompt on every paired topic, with far fewer generic Things to say and no opener alternatives, at the same latency ([evaluation record](../../evals/results/2026-11-12-english-prompt-candidate-4.md#prompt-candidate-4)).
- **Known gap:** thanks addressed to hosts still appears in Things to say; it is tracked as a separate [backlog item](../backlog/host-thanks.md).
- **Done when:** deployed, and a post-deploy spot check of live `/phrasebook` output confirms the behavior above.
