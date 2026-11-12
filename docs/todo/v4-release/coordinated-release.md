---
kind: record
status: current
summary: Release the v4 phrasebook API, gateway and web together and confirm a live end-to-end phrasebook creation.
verified: 2026-11-12
---

# Coordinated API, gateway and web release

Part of the [v4 release](../v4-release.md) milestone, whose page holds the current release status.

- **What:** the v4 phrasebook API and web work requires a coordinated release: the web client calls v4 routes and response shapes that only the v4 API and gateway configuration serve, so the three must be deployed together. Native iOS is unchanged and not part of this release.
- **Why:** the v4 code is complete and was verified locally on 2026-10-29 ([results ledger](../../evals/results.md)), but deployment has not been performed.
- **Done when:** API, gateway and web are deployed together and a live end-to-end phrasebook creation succeeds.
