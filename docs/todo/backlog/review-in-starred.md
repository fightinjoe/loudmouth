---
kind: record
status: current
summary: Move the Review starred cards button from the phrasebook landing into the Starred chapter sheet.
verified: 2026-11-13
---

# Review starred cards only from the Starred sheet

Part of the [backlog](../backlog.md).

- **What:** remove the **Review starred cards** tray from the phrasebook landing and offer it only inside the Starred chapter sheet. The tray is rendered by `content-pane-render.ts` (`textbook-review-bar`, action `content/review`) under `web/app/src/panes` on every stored phrasebook, disabled when nothing is starred.
- **Why:** owner report from using the app, 2026-11-13: the button should only be on the Starred pane. [Review](../../design.md#review) is specified as opened from the landing tray, and the Starred chapter sheet exists only when the phrasebook has stars, so moving the button there also removes the disabled state.
- **Open questions:** Where in the Starred sheet the button sits (header, above the Words and Phrases tabs, or at the end of the list) and whether it reviews both tabs or only the visible one.
- **Done when:** the landing has no Review tray, the Starred sheet opens Review with the same study set and order, tests cover the new entry point, and [Review](../../design.md#review), the [phrasebook view](../../design.md#phrasebook-view) and [journeys](../../journeys.md) describe it.
