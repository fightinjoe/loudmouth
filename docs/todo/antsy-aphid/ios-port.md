---
kind: record
status: current
summary: Port the web phrasebook experience to the native iOS app and test it on devices against the v4 API.
verified: 2026-11-15
---

# Port the web experience to iOS

Part of [Launch: Antsy Aphid](../antsy-aphid.md).

- **What:** bring the native iOS app (`ios/Loudmouth/`) to the web experience: guided creation through `/context` → `/phrasebook` with title and cover requests, the phrasebook landing and category sheets, phrase breakdown, stars and starred Review, and the v4 library and backup contracts in the [card schema](../../card-schema.md). Every request goes through `APIClient` with Firebase identity and App Check ([protected requests](../../ios/architecture.md#protected-requests)). Test it on physical devices against the v4 API. Inventory drift first, as the [convergence proposal](../../proposals/phrasebook-quality-plan.md#iosweb-convergence) describes; a source inventory and a proposed execution sequence are in the [beta delivery plan](../../proposals/beta-delivery-plan.md#native-ios-a-contract-and-storage-migration-before-polish).
- **Why:** owner request, 2026-11-12. The iOS app is a pre-redesign deck-and-card client. Its Translation and Generate cards actions called the retired `/translate` and `/generate-cards` routes, which the v4 API does not serve; those calls are removed and the entry points show an update-required notice ([iOS architecture](../../ios/architecture.md#current-state)), so the app cannot generate until the port lands.
- **Done when:** the iOS app completes guided creation, browsing, breakdown and Review against a deployed, protected v4 API on a physical device ([native acceptance](api-protection.md#native-acceptance)), and intentional differences from web are documented in the [iOS architecture](../../ios/architecture.md) page.
