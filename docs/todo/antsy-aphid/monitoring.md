---
kind: record
status: current
summary: Dashboards and alerts for production errors, latency and provider spend, plus budget caps at the providers.
verified: 2026-11-15
---

# Production monitoring and spend alerts

Part of [Launch: Antsy Aphid](../antsy-aphid.md).

- **What:** dashboards and alerts for the deployed API built on its structured logs: final request outcomes by failure level, latency per route, and provider spend from logged usage; plus budget caps or alerts in the OpenRouter and Google Cloud accounts. For admission, provision what the repository already scripts ([monitoring, alerts and invoice budget](../../api/operations.md#monitoring-alerts-and-invoice-budget)): the minute monitor job, the 50% and 80% admission alerts, overshoot, ledger-failure, stale-reservation and heartbeat alerts, and the separate cloud-invoice budget alert. Name the budget, privacy and incident owners and confirm the email notification channel with a received test notification. Measure Firebase anonymous signup volume and reCAPTCHA assessments and cost in their own consoles, and audit signup quotas, existing Logging sinks and `_Default` retention.
- **Why:** owner accepted the suggestion, 2026-11-12. The API already logs structured diagnostics with failure levels and per-request usage and cost ([structured diagnostics](../../api/operations.md#structured-diagnostics)), but nothing is provisioned to alert on them, and each phrasebook makes several paid model calls. Without alerts, failures or runaway spend are found only by checking manually. The [protection decision](../../decisions/2026-11-04-api-protection.md#questions-considered) left operating ownership open.
- **Done when:** an alert fires in a test for an error-rate spike and a spend threshold, the admission alerts and the monitor heartbeat have been observed delivering to the confirmed channel, provider budget limits are set, the owners are named, and [API operations](../../api/operations.md) describes where to look and who is notified.
- **Alert gaps (audit, 2026-11-15):** `api/scripts/provision-protection-monitoring.js` defines no alert for uncertain reservations (cost unknown after concurrency was released) or for pricing validity. `PRICING_VERIFIED_AT` expires after 30 days and then every request is refused with 503, visible only through the generic ledger-failure alert.
