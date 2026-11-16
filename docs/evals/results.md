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
| 2026-11-15 | mixed | Adversarial eval of the adopted English-generation prompt and contract against the previous ones, DeepSeek and Gemini 3.5 Flash Lite: no leak or override on DeepSeek, invalid replies gone on both, one schema-preserving attack leaks the synthetic canary on Flash Lite in 12 of 24 calls against 3 of 21 before | [details](results/2026-11-15-adversarial-english-contract.md) |
| 2026-11-14 | passed | Local adoption check for the English-generation contract (prompt R4, enforced schema, 24-Word bound, speaker-order warning, DeepSeek with Flash Lite fallback): API, evals and web suites pass; three live local requests succeed, including Flash Lite on Vertex and a simulated-429 fallback | [details](results/2026-11-14-english-contract-adoption-check.md) |
| 2026-11-14 | passed | English-generation candidate R4 (usefulness first) on DeepSeek and Gemini 3.5 Flash Lite, 21 topics: preferred over R3 on both models and over the previous prompt on every DeepSeek topic, DeepSeek still ahead of Flash Lite; adopted with its reply contract | [details](results/2026-11-14-english-prompt-candidate-r4.md) |
| 2026-11-13 | passed | Generation reliability API deployed (revision 00018): live gateway checks, 6-topic phrasebook in 8.2 s and 5.8 s (v4: 18.0 s), structured logs queryable; web not yet redeployed | [details](results/2026-11-13-generation-reliability-deploy.md) |
| 2026-11-13 | passed | Generation reliability, local live samples: strict schema over JSON mode, OpenRouter performance routing, 43 of 44 topics under 10 s, overruns flagged | [details](results/2026-11-13-generation-reliability-local.md) |
| 2026-11-13 | informational | Blind re-review of saved candidate R3 English outputs under the owner's proposed dimension order (usefulness first): DeepSeek R3 still preferred over Flash Lite R3, usefulness even between them, R3's larger sizes lower usefulness on DeepSeek | [details](results/2026-11-13-english-rereview-usefulness-first.md) |
| 2026-11-13 | mixed | English-generation candidate R3 on DeepSeek, Gemini 3.5 Flash Lite and Qwen3.8 Flash, 21 topics: preferred over the production prompt on every model, rule regressions gone, Flash Lite about level with production DeepSeek and behind DeepSeek on the same prompt, Words overruns grow; not adopted | [details](results/2026-11-13-english-prompt-candidate-r3.md) |
| 2026-11-13 | informational | /context checklist rule against courtesy and repair topics, 10 seeds on Gemini 3.5 Flash Lite: such items fall from 16 to 5 with validity, size and latency unchanged; not adopted | [details](results/2026-11-13-context-checklist-rule.md) |
| 2026-11-13 | mixed | English-generation prompt reframing: two candidates versus the production prompt on DeepSeek, Gemini 3.5 Flash Lite and Qwen3.8 Flash, 21 topics; candidates preferred within each model, generic language and English fallback regress, Flash Lite still behind production DeepSeek; nothing adopted | [details](results/2026-11-13-english-prompt-reframing.md) |
| 2026-11-13 | informational | English-generation diagnostic: Gemini 3.5 Flash Lite versus production DeepSeek on 12 baseline topics, unchanged prompt; Flash Lite output is about half the size and mirrors the prompt's JSON skeleton | [details](results/2026-11-13-flash-lite-english-diagnostic.md) |
| 2026-11-13 | informational | Open-weight flash-tier screen for English generation (Qwen3.8 Flash, GLM-5.3 Flash, MiniMax M3.1 Flash, Gemma 4 31B, Mistral Small 4) against DeepSeek; only Qwen comes close, none adopted | [details](results/2026-11-13-open-weight-flash-screen.md) |
| 2026-11-13 | failed | English-generation model comparison: Gemini 4 Hydrogen versus production DeepSeek on 12 baseline topics; Hydrogen not adopted (coverage gaps, ~3× latency, ~40× cost) | [details](results/2026-11-13-hydrogen-english-model-comparison.md) |
| 2026-11-13 | passed | v4 live release: Node 24 API, gateway and web deployed; live API checks, English-prompt spot-check and a live web creation | [details](results/2026-11-13-v4-live-release.md) |
| 2026-11-12 | passed | English-generation study: prompt candidate 4 beats the previous prompt and is adopted; reasoning and alternative models rejected | [details](results/2026-11-12-english-prompt-candidate-4.md) |
| 2026-10-29 | passed | v4 web integration verified locally against the v4 API | [details](results/2026-10-29-v4-web-verification.md) |
| 2026-10-29 | passed | v4 phrasebook local promotion smoke: real-provider requests, tests and builds | [details](results/2026-10-29-v4-local-promotion-smoke.md) |
