---
kind: record
status: current
summary: Confirm per-topic latency, invalid-JSON rate, retries and failure levels in production after the fixes ship.
verified: 2026-11-12
---

# Verify latency and JSON fixes in production

Part of [generation reliability](../generation-reliability.md). Blocked until [valid JSON](valid-json.md) and [latency](english-latency.md) ship.

- **What:** after the latency and JSON items ship, confirm in production: per-topic English generation under 10 s, invalid-JSON rate, retry and failure levels.
- **Why:** the fixes are only verified by local probes and samples until they run on live traffic.
- **Done when:** measured on live traffic or an agreed production smoke test.
