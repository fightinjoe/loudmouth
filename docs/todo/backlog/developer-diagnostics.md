---
kind: record
status: current
summary: Developer-only mode in the app that shows API response diagnostics such as vocab-source-missing flags.
verified: 2026-11-12
---

# Developer diagnostics mode

Part of the [backlog](../backlog.md).

- **What:** an app developer mode that displays API response diagnostics, including `vocab-source-missing` flags for generated vocabulary without resolved phrase evidence. Not shown in the normal learner experience.
- **Why:** not recorded when the item was added. Current fact: `/phrasebook` already returns `vocab-source-missing` flags (`api/src/phrasebook/parse.js`), and no client view displays response flags.
- **Done when:** a developer mode in the web app shows each response's diagnostics, including `vocab-source-missing` flags, and the normal learner view shows none of them.
