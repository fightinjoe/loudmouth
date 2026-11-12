---
kind: record
status: current
summary: Reduce the risk of browsers evicting the IndexedDB library: persistent storage, home-screen install, backup reminders.
verified: 2026-11-12
---

# Protect the browser library from eviction

Part of the [public launch](../public-launch.md) milestone.

- **What:** reduce the chance that a learner loses their library to browser storage eviction: request persistent storage, encourage installing the PWA to the home screen, and decide whether to remind learners to export a backup. Accounts and sync stay out of scope unless the [brief](../../brief.md#open-decisions) decision on durability changes.
- **Why:** owner accepted the suggestion, 2026-11-12. The library lives only in the browser's IndexedDB, with no accounts or sync ([brief](../../brief.md#platform-and-architecture)); the only recovery is a manual JSON backup ([card schema](../../card-schema.md#namespace-isolation-and-backup)). The web app never calls `navigator.storage.persist()`. WebKit's published policy can delete script-written storage for sites not used for seven days unless they are installed to the home screen (not yet verified for this app).
- **Done when:** the app requests persistent storage and handles a refusal, the chosen install and backup prompts ship, eviction behavior on iOS Safari is checked on a device, and the [card schema](../../card-schema.md) states the durability guarantees.
