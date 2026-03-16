# Prototype 1: Web Speech API

**Question:** Is Web Speech API adequate for audio on iOS Safari and Android Chrome?

## Hypothesis

TTS pronunciation will be patchy — probably intelligible for common words but unreliable for tones, retroflex initials, and polysyllabic phrases. Likely worse on iOS Safari than Android Chrome.

## Build Plan

Reuse the flip-card review UX from prototype 2. Pre-load ~10 representative Mandarin cards covering common words, phrases, tones, and hard sounds. Add a "Play" button to the card front that calls Web Speech API with `lang="zh-CN"`.

- [ ] Scaffold from `prototypes/2-json-import/index.html` (review screen only, no import flow)
- [ ] Pre-load Mandarin test cards in JS
- [ ] Add Play button to card front; wire to `SpeechSynthesisUtterance` with `lang="zh-CN"`
- [ ] Confirm button works on both iOS Safari and Android Chrome

## Test Protocol

Open `index.html` on iOS Safari and Android Chrome. For each card, tap Play before flipping. Note:
- Does audio play at all?
- Is the pronunciation intelligible?
- Are tones audibly correct?
- Any errors, silence, or crashes?

Repeat on both platforms. No tooling needed — personal judgment call.

## Success Criteria

**Yes (proceed with confidence):** Pronunciation is intelligible on both platforms for the majority of cards, including toned syllables.
**No (needs rethinking):** Audio fails silently, is consistently wrong on tones, or is unusable on either platform.
**Ambiguous:** Works on one platform but not the other — decide based on primary device.

## Findings

**Result:** Yes
**Date:** 2026-03-16

iOS Safari TTS quality was surprisingly good — pronunciation intelligible, tones audible. Chrome Desktop was poor. Safari on Mac produced no audio at all (Web Speech API silent). Android not tested.

**Surprises:** iOS TTS quality significantly exceeded expectations — hypothesis of "patchy" was wrong for iOS.

## Status

Complete
