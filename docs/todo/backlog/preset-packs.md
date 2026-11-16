---
kind: record
status: current
summary: Replace repair-style /context checklist topics with static preset packs; keep repair topics until replacements exist.
verified: 2026-11-14
---

# Static preset packs for repair-style topics

Part of the [backlog](../backlog.md).

- **What:** static preset packs that replace repair-style `/context` checklist topics (generic conversation repair such as asking someone to repeat or slow down). Do not remove repair topics from `/context` before the replacements exist.
- **Why:** not recorded when the item was deferred. Current fact: `/context` ([spec](../../api/context.md)) can still return repair-style checklist topics, for example "Ask to repeat or slow down" in `api/evals/fixtures/baseline/input_directions.json`.
- **Evidence (2026-11-13):** on 10 seeds, the production `/context` prompt returned courtesy or repair-only checklist items in 11 of 20 replies ([evaluation record](../../evals/results/2026-11-13-context-checklist-rule.md)). The `/context` prompt change that removes them is tracked separately in [keep courtesy and repair topics out of the checklist](context-checklist-specificity.md).
- **Done when:** to be defined.
