---
kind: record
status: current
summary: Stop invalid JSON from DeepSeek English generation, preferably with provider-enforced schema output.
verified: 2026-11-12
---

# Enforce valid JSON for English generation

Part of [generation reliability](../generation-reliability.md).

- **What:** stop invalid JSON from DeepSeek English generation. First check whether the provider path can enforce the output schema (OpenRouter `response_format` with a JSON schema on the pinned provider). If not, evaluate our own fix, such as a targeted retry or a narrow, logged repair.
- **Why:** the 2026-11-11 interleaved prompt tests produced two invalid replies, both a one-item `text` array closed with the wrong bracket ([evaluation record](../../evals/results/2026-11-12-english-prompt-candidate-4.md#invalid-json)). Today `callDeepSeek` in `api/src/llms/openrouter.js` sends no `response_format`, so nothing enforces the schema (`english.call` in [POST /phrasebook](../../api/phrasebook.md)), and `validateGenerationResponse` in `api/src/phrasebook/parse.js` throws on unparsable JSON. Until fixed, evaluations report invalid JSON and its likely cause but do not count it as a prompt regression (owner decision 2026-11-12, [rubric](../../evals/rubric.md#outcome-classes)).
- **Done when:** invalid JSON cannot reach `english.validate`, or is recovered within the existing retry budget, verified on a live sample.
