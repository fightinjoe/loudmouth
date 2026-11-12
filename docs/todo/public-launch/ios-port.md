---
kind: record
status: current
summary: Port the web phrasebook experience to the native iOS app and test it on devices against the v4 API.
verified: 2026-11-12
---

# Port the web experience to iOS

Part of the [public launch](../public-launch.md) milestone.

- **What:** bring the native iOS app (`ios/Loudmouth/`) to the web experience: guided creation through `/context` → `/phrasebook` with title and cover requests, the phrasebook landing and category sheets, phrase breakdown, stars and starred Review, and the v4 library and backup contracts in the [card schema](../../card-schema.md). Test it on physical devices against the v4 API. Inventory drift first, as the [convergence proposal](../../proposals/phrasebook-quality-plan.md#iosweb-convergence) describes.
- **Why:** owner request, 2026-11-12. The iOS app is a pre-redesign deck-and-card client that calls the retired `/translate` and `/generate-cards` routes, which the v4 API does not serve ([iOS architecture](../../ios/architecture.md#current-state)), so it stops working once v4 deploys.
- **Done when:** the iOS app completes guided creation, browsing, breakdown and Review against a deployed v4 API on a physical device, intentional differences from web are documented in the [iOS architecture](../../ios/architecture.md) page, and the retired-route calls are gone.
