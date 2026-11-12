---
kind: record
status: current
summary: Local verification of the integrated v4 web client (tests, build, mobile Chromium) on 2026-10-29.
verified: 2026-10-29
---

# v4 web verification (2026-10-29)

## Context

On 2026-10-29 the four-section v4 phrasebook schema (`loudmouth-topic-v4` library, v4 phrasebook responses and backups, v2 CardBatch and breakdown exchange; see [card schema](../../card-schema.md)) was integrated into the web client and API locally. This run checked that integration before any release. At the time the phrasebook view was still the continuous textbook; the topic-decks view and then the current category landing ([design](../../design.md#phrasebook-view)) replaced it later, so this run does not cover the current phrasebook view. Release state is tracked in [v4 release](../../todo/v4-release.md).

## What ran

- 130 API tests and 253 web unit tests passed. On Node 26 the web unit tests ran with `NODE_OPTIONS=--no-experimental-webstorage` (now set automatically by `vitest.config.js`).
- Strict TypeScript and the production build passed.
- All 12 mobile-Chromium Playwright cases passed.
- A separate 390 px Chromium smoke covered seeded first-time creation, a locally saved v4 four-section fixture, explicit reply alternatives, starring, and Review reveal, with no horizontal overflow or console errors.

## Limits

No paid provider calls were made. The run does not establish live generation quality, generated-art quality, iOS Safari behavior, physical-device gestures, or VoiceOver support.
