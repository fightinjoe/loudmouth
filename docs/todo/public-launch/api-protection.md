---
kind: record
status: current
summary: Protect the public API for anonymous callers: gateway admission, quotas, concurrency and spend limits, attestation and abuse-resistant robustness.
verified: 2026-11-12
---

# Protect the API for anonymous users

Part of the [public launch](../public-launch.md) milestone.

- **What:** make the API safe to serve anonymous users. Admission control at the gateway: caller authentication, anonymous per-caller quotas, global concurrency and spend limits, and app attestation. Robustness under hostile or careless traffic: request size and rate bounds on every route, bounded fan-out per request, behavior when provider capacity or the spend limit is exhausted, and abuse of free-text inputs such as image prompts.
- **Why:** the checked-in gateway configuration (`api/config/api-gateway.yaml`) defines no caller authentication or rate quotas; `api/deploy.sh` only authenticates gateway-to-Cloud-Run invocation ([API operations](../../api/operations.md#deployment-reference)). Every phrasebook request fans out into several paid model calls, so an open endpoint exposes provider spend. An iOS-only launch does not make the API private. The owner asked for robustness work for anonymous users on 2026-11-12.
- **Done when:** to be defined in detail; at minimum, the deployed gateway and backend exposure is verified, admission controls are in place, and a load or abuse test against a staging deployment shows quotas and spend limits holding before any public release.
