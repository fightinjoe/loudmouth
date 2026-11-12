---
kind: record
status: current
summary: Keep English generation per topic under 10 s through provider policy and timeouts.
verified: 2026-11-12
---

# Make English-generation latency meet the target

Part of [generation reliability](../generation-reliability.md).

- **What:** keep English generation per topic under 10 s (3 s ideal, 6 s acceptable). Options: a faster or ordered list of providers for DeepSeek v4.1 Flash, a per-call timeout aligned with the target, and the 429 handling in [DeepSeek capacity](deepseek-capacity.md).
- **Why:** per-topic latency on the pinned provider rose from 2.2–4.0 s (2026-11-02) to as much as 39.4 s (2026-11-11) because its output speed collapsed, while other providers served the same prompt faster in a same-window probe ([evaluation record](../../evals/results/2026-11-12-english-prompt-candidate-4.md#latency)). Providers serve different quantizations, so content quality must be checked before switching. Production pins Relace with no fallback and a 120 s timeout (`callDeepSeek` and `DEEPSEEK_TIMEOUT_MS` in `api/src/llms/openrouter.js`).
- **Done when:** repeated probes at different times of day justify a provider policy, its output quality is spot-checked against the [rubric](../../evals/rubric.md), and production meets the target under realistic load.
