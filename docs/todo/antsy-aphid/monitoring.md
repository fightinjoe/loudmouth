---
kind: record
status: current
summary: Dashboards and alerts for production errors, latency and provider spend, plus budget caps at the providers.
verified: 2026-11-12
---

# Production monitoring and spend alerts

Part of [Launch: Antsy Aphid](../antsy-aphid.md).

- **What:** dashboards and alerts for the deployed API built on its structured logs: final request outcomes by failure level, latency per route, and provider spend from logged usage; plus budget caps or alerts in the OpenRouter and Google Cloud accounts.
- **Why:** owner accepted the suggestion, 2026-11-12. The API already logs structured diagnostics with failure levels and per-request usage and cost ([structured diagnostics](../../api/operations.md#structured-diagnostics)), but no page describes alerting on them, and each phrasebook makes several paid model calls ([deployment reference](../../api/operations.md#deployment-reference)). Without alerts, failures or runaway spend are found only by checking manually.
- **Done when:** an alert fires in a test for an error-rate spike and a spend threshold, provider budget limits are set, and [API operations](../../api/operations.md) describes where to look and who is notified.
