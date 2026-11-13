---
kind: ledger
status: current
summary: Ledger of evaluation and verification results, newest first, each with a record of scope, evidence and findings.
verified: 2026-11-13
statuses: [passed, failed, mixed, informational]
---

# Evaluation results

One row per evaluation, smoke or verification run. Method lives in [evaluation guidance](index.md) and the [rubric](rubric.md); this ledger and its records hold what was observed. Raw outputs are not retained; records summarize them.

| Date | Status | Description | Details |
|---|---|---|---|
| 2026-11-13 | passed | Generation reliability API deployed (revision 00018): live gateway checks, 6-topic phrasebook in 8.2 s and 5.8 s (v4: 18.0 s), structured logs queryable; web not yet redeployed | [details](results/2026-11-13-generation-reliability-deploy.md) |
| 2026-11-13 | passed | Generation reliability, local live samples: strict schema over JSON mode, OpenRouter performance routing, 43 of 44 topics under 10 s, overruns flagged | [details](results/2026-11-13-generation-reliability-local.md) |
| 2026-11-13 | passed | v4 live release: Node 24 API, gateway and web deployed; live API checks, English-prompt spot-check and a live web creation | [details](results/2026-11-13-v4-live-release.md) |
| 2026-11-12 | passed | English-generation study: prompt candidate 4 beats the previous prompt and is adopted; reasoning and alternative models rejected | [details](results/2026-11-12-english-prompt-candidate-4.md) |
| 2026-10-29 | passed | v4 web integration verified locally against the v4 API | [details](results/2026-10-29-v4-web-verification.md) |
| 2026-10-29 | passed | v4 phrasebook local promotion smoke: real-provider requests, tests and builds | [details](results/2026-10-29-v4-local-promotion-smoke.md) |
