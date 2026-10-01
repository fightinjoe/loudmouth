# API and developer tooling

- Add an app developer mode that displays API response diagnostics, including
  `vocab-source-missing` flags for generated vocabulary without resolved phrase evidence. Do not
  expose these diagnostics in the normal learner experience.
- Evaluate removing formatting, normalization, and stripping instructions from the phrasebook
  translation prompt and moving deterministic transformations into endpoint code. Obtain initial
  approval before editing prompt `*.txt` files, then run before-and-after regression evaluations for
  output behavior, latency, and token usage.
- Operationalize a reliable, scalable DeepSeek endpoint before higher-QPS rollout. Evaluate
  dedicated/provider-owned capacity and quotas rather than assuming an OpenRouter shared pool
  can sustain production traffic. Load-test increasing QPS and concurrent users with realistic
  per-topic fan-out plus translation; measure completed-chapter p50/p95/p99, throughput, 429s,
  failure levels 0/1/2, token load, and cost. Bound concurrency across requests, not only per book.
  The observed four concurrent 429s reported Relace `upstream_provider_shared_pool`; they do not
  establish a four-request concurrency limit or prove that our fan-out caused the rejection.
  Mid-term candidate: standardize English generation on DeepSeek and fall back to Gemini Flash
  Lite after a confirmed 429. Define bounded retry/fallback and total deadlines, preserve healthy
  topic results/order, validate the same output contract, and record actual backend, fallback
  reason, quality, latency, and mixed-model cost. Verify fallback compatibility/quality and avoid
  retry storms or fallback for unrelated validation errors. Deferred: no backend switch or
  cross-model fallback is implemented by the current failure-level change.