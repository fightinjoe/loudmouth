---
kind: record
status: current
summary: Move planned work from the docs/todo ledgers to an issue tracker after the first launch.
verified: 2026-11-14
---

# Move todo tracking to an issue tracker

Part of the [backlog](../backlog.md).

- **What:** Choose an issue tracker, migrate the open todos, milestones and records in docs/todo into it, and retire the todo ledgers, scripts/todo.mjs and the todo parts of the wiki conventions and skills, keeping release notes and decisions in the wiki.
- **Why:** Owner decision, 2026-11-14: the long-term intent is an issue tracker, but while plans change quickly a text tracker in the wiki is more flexible, so the move waits until after the launch. Planned work is tracked today as ledgers in docs/todo, edited with `scripts/todo.mjs` and checked by `scripts/check-docs.mjs` ([todo lifecycle](../../wiki.md#todo-lifecycle)).
- **Open questions:** Which tracker, and whether release notes are generated from it.
- **Done when:** Open todos live in the chosen tracker, docs/todo is removed or reduced to a pointer, and the wiki conventions, AGENTS.md and the todo skills describe the tracker.
