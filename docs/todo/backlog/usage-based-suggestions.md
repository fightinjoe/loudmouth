---
kind: record
status: current
summary: "Future work: tailor suggested situations and phrasebooks to what the learner has used the app for, mixing suggested activities and conversation starters."
verified: 2026-11-13
---

# Suggested phrasebooks based on use

Part of the [backlog](../backlog.md#future-work), under future work.

- **What:** once a learner has used the app, tailor its suggestions to them instead of showing a fixed list. Suggestions cover both example situations (the starting point for a new phrasebook) and fixed phrasebooks (owner, 2026-11-13). Tailored suggestions follow from what the learner has already prepared and mix suggested activities with conversation starters: a learner who created "surf vacation in Costa Rica" might be offered "small talk with local vendors" or "ordering specials at local restaurants". The fixed suggestions this builds on are the Suggestions list of example situations in the [updated creation flow](creation-flow-figma.md).
- **Why:** owner request, 2026-11-13. Current facts: authored suggested phrasebooks were removed from the app on 2026-11-12 ([decisions](../../decisions.md)), so nothing is suggested today; the [updated creation flow](creation-flow-figma.md) Figma design reintroduces a fixed Suggestions list of situations; the library and any usage history live only on the device, with no accounts or server-held library ([brief](../../brief.md#platform-and-architecture)).
- **Open questions:** how example situations and fixed phrasebooks relate and where each appears (owner: still to be figured out, 2026-11-13); which usage signals drive tailoring (situations created, topics chosen, phrases starred or reviewed, language); whether tailored suggestions are generated on the device or by an API call, since sending library contents to the server changes the [privacy](../antsy-aphid/privacy.md) disclosures.
- **Done when:** a learner with phrasebooks in their library sees suggested situations and phrasebooks derived from that use, a new learner still sees the fixed suggestions, and [design](../../design.md) and [journeys](../../journeys.md) describe where suggestions appear and what drives them.
