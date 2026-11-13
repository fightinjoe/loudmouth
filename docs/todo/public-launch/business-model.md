---
kind: record
status: current
summary: "Brainstorm the business model: who pays, for what, and whether it covers per-phrasebook model cost."
verified: 2026-11-12
---

# Brainstorm the business model

Part of the [public launch](../public-launch.md) milestone.

- **What:** brainstorm and compare business models (for example free with limits, one-time purchase, subscription, per-phrasebook credits), checked against the [product principles](../../brief.md#product-principles) (no pressure, no bookkeeping) and against actual cost per phrasebook. The API already reports `costUsd` per response (`api/src/pricing.js`), which gives the cost side.
- **Why:** owner request, 2026-11-12. Every phrasebook makes several paid model calls plus an image call, and the free-usage limits in [API protection](api-protection.md) depend on what the model allows anonymous users to do.
- **Done when:** a short comparison of the options with measured cost per phrasebook is recorded, and the chosen direction is logged in [decisions](../../decisions.md).
