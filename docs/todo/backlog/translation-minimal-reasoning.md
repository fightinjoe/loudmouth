---
kind: record
status: current
summary: Set minimal reasoning on the /phrasebook translation call to Gemini 3.5 Flash Lite, matching English generation, and measure latency and translation quality before and after.
verified: 2026-11-15
---

# Set minimal reasoning on the translation call

Part of the [backlog](../backlog.md).

- **What:** Pass `reasoning: 'minimal'` on the `/phrasebook` translation call (`translateTopic` in `api/src/phrasebook/index.js`), as the English-generation call already does, so Gemini 3.5 Flash Lite runs translation at the minimal thinking level instead of the model default. Compare latency, output tokens, cost and translation output before and after on representative topics in more than one language, including one with readings (`zh` or `ja`), because translation carries readings and alternative forms that less thinking could affect.
- **Why:** Owner request, 2026-11-15. The Gemini adapter (`api/src/llms/genai.js`) sets a thinking level only when the caller asks for minimal reasoning, and only English generation asks. In the local adoption check translation was the slower stage in one of three runs: 5.8 to 5.9 s per topic against 2.2 to 2.4 s for generation, and 2.5 to 2.8 s in the other two runs ([adoption check](../../evals/results/2026-11-14-english-contract-adoption-check.md)). Whether the thinking level explains that spread is not established: on English generation, 18 Flash Lite calls with minimal thinking averaged 2.3 s against 2.6 s for 18 with the default level ([adversarial eval](../../evals/results/2026-11-15-adversarial-english-contract.md#the-schema-preserving-attack-on-its-own)), so the gain may be small.
- **Done when:** The translation call sets minimal reasoning, a before-and-after comparison of latency and translation output is recorded in the [results ledger](../../evals/results.md), and [POST /phrasebook](../../api/phrasebook.md) and [operations](../../api/operations.md) describe the setting.
