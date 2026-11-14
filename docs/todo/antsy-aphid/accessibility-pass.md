---
kind: record
status: current
summary: "Run the physical-device accessibility checks the design page lists as outstanding: VoiceOver, thumb reach, iOS Safari gestures."
verified: 2026-11-12
---

# Device accessibility pass

Part of [Launch: Antsy Aphid](../antsy-aphid.md).

- **What:** test the web app (and the iOS app once ported) on physical phones with VoiceOver, enlarged text and one-handed reach, including iOS Safari gesture conflicts with long press and swipes, and fix what fails.
- **Why:** owner accepted the suggestion, 2026-11-12. The [phrasebook view](../../design.md#phrasebook-view) states that physical-device thumb reach, VoiceOver and iOS Safari gesture behavior require their own checks, and no result for them is recorded in the [results ledger](../../evals/results.md).
- **Done when:** the checks are recorded as a row in the [results ledger](../../evals/results.md), blocking failures are fixed, and remaining limits are stated on the [design](../../design.md) page.
