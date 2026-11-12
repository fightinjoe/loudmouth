---
kind: record
status: current
summary: Add caller admission control (gateway auth, anonymous quotas, global concurrency and spend limits, attestation) before any public release.
verified: 2026-11-12
---

# API caller admission control

Part of the [backlog](../backlog.md).

- **What:** caller admission control for the public API: gateway authentication, anonymous quotas, global concurrency and spend limits, and app attestation.
- **Why:** the checked-in gateway configuration (`api/config/api-gateway.yaml`) defines no caller authentication or rate quotas; `api/deploy.sh` only authenticates gateway-to-Cloud-Run invocation ([API operations](../../api/operations.md#deployment-reference)). Every phrasebook request fans out into several paid model calls, so an open endpoint exposes provider spend. An iOS-only launch does not make the API private.
- **Done when:** to be defined in detail; at minimum, the deployed gateway and backend exposure is verified and admission controls are in place before any public release.
