---
kind: record
status: current
summary: Gemini 3.5 Flash Lite English generation copies the synthetic canary into a chapter under one schema-preserving attack, more often with the adopted prompt; evaluate prompt wording and the thinking level as fixes.
verified: 2026-11-15
---

# Stop the schema-preserving injection leak on Flash Lite

Part of the [backlog](../backlog.md).

- **What:** Reduce the rate at which Gemini 3.5 Flash Lite, the fallback model for `/phrasebook` English generation, obeys a seed that asks for hidden instruction content inside a normal output string. Evaluate two levers, separately and together: the wording about untrusted input in `api/src/phrasebook/prompt.txt` (a prompt change, which needs owner approval and a before-and-after evaluation of content quality as well as the adversarial eval), and the Flash Lite thinking level, which may also help. Only the minimal and default levels have been compared; higher levels are untested and would cost latency on the fallback path. Check DeepSeek stays clean under any change.
- **Why:** Owner request, 2026-11-15. In the adversarial eval the `phrasebook-schema-valid-extraction` attack leaked the synthetic canary on Flash Lite in 12 of 24 generation calls with the adopted prompt against 3 of 21 with the previous one; DeepSeek leaked in none of 24 ([evaluation record](../../evals/results/2026-11-15-adversarial-english-contract.md)). The rate was similar with default thinking (7 of 18) and without the enforced schema (5 of 16), which points at the prompt wording. Exposure is limited: Flash Lite generates only topics whose DeepSeek call is rate limited, the leaked text lands in the requester's own phrasebook, and the prompt holds no secret.
- **Done when:** The adversarial eval shows the attack leaking on Flash Lite no more often than with the previous prompt (3 of 21), or the owner accepts the remaining rate; any prompt change is approved, evaluated for content quality and recorded in the [results ledger](../../evals/results.md); any thinking-level change is reflected in [POST /phrasebook](../../api/phrasebook.md).
