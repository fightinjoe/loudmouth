---
kind: record
status: current
summary: Establish DeepSeek capacity for production load, with a load test and a bounded Gemini fallback candidate.
verified: 2026-11-12
---

# Operationalize reliable DeepSeek capacity

Part of [generation reliability](../generation-reliability.md).

- **What:** evaluate dedicated or provider-owned capacity and quotas rather than assuming an OpenRouter shared pool can sustain production traffic. Load-test increasing QPS and concurrent users with realistic per-topic fan-out plus translation; measure completed-chapter p50/p95/p99, throughput, 429s, failure levels 0/1/2, token load and cost. Bound concurrency across requests, not only per book.
- **Why:** evaluation calls hit 429s from the Relace shared pool, including six of 24 serial calls on 2026-11-12 ([evaluation record](../../evals/results/2026-11-12-english-prompt-candidate-4.md#rate-limits)). The four concurrent 429s do not establish a four-request concurrency limit or prove that our fan-out caused the rejection. Orchestration in `api/src/phrasebook/index.js` retries rate-limited calls within the endpoint budget; there is no capacity reservation or cross-request concurrency bound.
- **Mid-term candidate:** standardize English generation on DeepSeek and fall back to Gemini Flash Lite after a confirmed 429. Define bounded retry/fallback and total deadlines, preserve healthy topic results and order, validate the same output contract, and record actual backend, fallback reason, quality, latency and mixed-model cost. Verify fallback compatibility and quality; avoid retry storms or fallback for unrelated validation errors. Gemini 3.5 Flash Lite rejects disabled reasoning, so the fallback must set minimal reasoning effort explicitly ([evaluation record](../../evals/results/2026-11-12-english-prompt-candidate-4.md#studies)).
- **Done when:** a load test meets agreed latency and error targets.
