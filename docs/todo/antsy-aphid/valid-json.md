---
kind: record
status: current
summary: Stop invalid JSON from DeepSeek English generation with a strict structure-only schema and a retry for truncated replies.
verified: 2026-11-15
---

# Enforce valid JSON for English generation

Part of [Launch: Antsy Aphid](../antsy-aphid.md).

- **What:** `callDeepSeek` (`api/src/llms/openrouter.js`) sends OpenRouter `response_format` with a strict JSON schema from `buildGenerationResponseJsonSchema` (`api/src/phrasebook/index.js`). Since prompt R4 (2026-11-14) the schema describes one untitled topic and caps each list at the size the prompt asks for; the parser still keeps and flags [count overruns](count-overruns.md) from a provider that ignores the caps (owner decisions 2026-11-13 and 2026-11-15). Gemini receives the same schema as `responseJsonSchema`. `require_parameters: true` limits routing to providers that support the schema. A completed reply that is empty or cut off at the 6,000-token limit spends the existing validation retry instead of failing the request.
- **Why:** the 2026-11-11 interleaved prompt tests produced two invalid replies, both a one-item `text` array closed with the wrong bracket ([evaluation record](../../evals/results/2026-11-12-english-prompt-candidate-4.md#invalid-json)). Until this change, `callDeepSeek` sent no `response_format`. Local live samples on 2026-11-13 compared the strict schema with JSON mode (`json_object`). JSON mode stopped syntax errors but not shape errors, including a misplaced bracket inside a string. The strict schema produced no invalid JSON, and its failures were confined to providers now in `ignore` ([live samples](../../evals/results/2026-11-13-generation-reliability-local.md)). Evaluations report invalid JSON and its likely cause but do not count it as a prompt regression (owner decision 2026-11-12, [rubric](../../evals/rubric.md#outcome-classes)).
- **Done when:** invalid JSON cannot reach `english.validate`, or is recovered within the existing retry budget, verified on a live sample. Verified locally on 2026-11-13: 0 invalid JSON in 48 end-to-end attempts, and the 4 shape failures were all recovered by the retry. Further evidence: in evaluation, DeepSeek returned no invalid JSON and no unknown keys in 127 calls with a schema, against 2 invalid replies in 84 calls without one ([reframing study](../../evals/results/2026-11-13-english-prompt-reframing.md), [candidate R3](../../evals/results/2026-11-13-english-prompt-candidate-r3.md), [candidate R4](../../evals/results/2026-11-14-english-prompt-candidate-r4.md)), and none in 60 generation calls of the 2026-11-15 [adversarial eval](../../evals/results/2026-11-15-adversarial-english-contract.md). Production confirmation is [production verification](production-verification.md).
