---
kind: record
status: current
summary: Adopt the evaluated /context checklist rule against courtesy and repair topics, sequenced with preset packs.
verified: 2026-11-14
---

# Keep courtesy and repair topics out of the /context checklist

Part of the [backlog](../backlog.md).

- **What:** Add the evaluated checklist rule to `api/src/context/prompt.txt` so `/context` stops offering topics that belong to every conversation (getting attention, greeting, thanking, saying goodbye, apologizing, asking to repeat or clarify), and decide what happens to the greetings and goodbyes that remain in social seeds. Editing the prompt needs owner approval and a before-and-after evaluation (`AGENTS.md`). Sequence it with [preset packs](preset-packs.md), which must exist before repair topics are removed.
- **Why:** Owner request, 2026-11-14, to fix generic topics as far upstream as possible. Such topics are the weakest in English generation: under the adopted prompt, generic Things to say and Words concentrate in "Get someone's attention" ([candidate R4 record](../../evals/results/2026-11-14-english-prompt-candidate-r4.md#content-measures)). A one-rule candidate cut courtesy or repair-only checklist items from 16 in 11 of 20 replies to 5 in 4 of 20, with validity, size and latency unchanged ([evaluation record](../../evals/results/2026-11-13-context-checklist-rule.md)).
- **Open questions:** Should the rule ship before preset packs exist? The preset-pack record says repair topics stay until the replacements exist.
- **Done when:** `/context` no longer returns courtesy or repair-only checklist items on the evaluation seeds, the change is recorded in the [results ledger](../../evals/results.md), and [POST /context](../../api/context.md) describes the rule.
