---
kind: record
status: current
summary: Confirm per-topic latency by provider, invalid-JSON rate, retries, overrun flags and failure levels in production after the fixes ship.
verified: 2026-11-13
---

# Verify latency and JSON fixes in production

Part of [generation reliability](../generation-reliability.md). Unblocked 2026-11-13: [valid JSON](valid-json.md) and [provider routing](provider-routing.md) are deployed ([deployment record](../../evals/results/2026-11-13-generation-reliability-deploy.md)). The live web must be redeployed before web traffic can be measured.

- **What:** after those ship, confirm in production: per-topic English generation under 10 s, broken down by provider; invalid-JSON rate; retries; count-overrun flags; failure levels. Compare against the v4 baseline, which pinned Relace: 18.0 s and 8.0 s requests, 10.6 s and 7.8 s generation stage ([v4 live release](../../evals/results/2026-11-13-v4-live-release.md)). Record the results as an evaluation result.
- **Why:** the fixes are only verified by local probes and samples until they run on live traffic. Owner decision 2026-11-13: keep this blocked until the fixes ship; v4 changed neither the JSON handling nor the provider pin.
- **Done when:** measured on live traffic or an agreed production smoke test.
