---
kind: record
status: current
summary: Let a downward swipe close the chapter sheet that lists a phrasebook's cards, as the shared bottom sheet already allows.
verified: 2026-11-13
---

# Swipe down to close the chapter sheet

Part of the [backlog](../backlog.md).

- **What:** add swipe-down dismissal to the chapter sheet (`renderChapterSheet` in `web/app/src/components/chapter-sheet.ts`), closing it exactly as Back does (`content/close-chapter`). The shared bottom sheet already dismisses on a downward swipe from its handle or header (`wireSwipeDownDismiss` in `web/app/src/components/bottom-sheet.ts`, 80 px threshold); reuse that behavior rather than writing a second gesture.
- **Why:** owner report from using the app, 2026-11-13 (the owner called it the action pane; in code the card lists are the content pane's chapter sheet, and the action pane hosts creation, review, settings and export). The chapter sheet is its own modal rather than a shared bottom sheet and closes only with Back, the scrim or Escape ([phrasebook view](../../design.md#phrasebook-view)). Its body scrolls vertically and the Starred pager swipes horizontally, so the new gesture must not take over either.
- **Open questions:** Whether the swipe starts only from the sheet header, as in the shared bottom sheet, or also from the body when it is scrolled to the top.
- **Done when:** a downward swipe closes the chapter sheet and returns focus as Back does, body scrolling and the Starred pager still work, a test covers the gesture, and the [phrasebook view](../../design.md#phrasebook-view) lists swipe down among the ways to close the sheet.
