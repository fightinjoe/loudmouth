---
kind: record
status: current
summary: "Future option: when one section of an English reply is unusable, ask the model for that section only; compare with the current full-topic merging retry."
verified: 2026-11-13
---

# Retry only the failed section of an English reply

Part of the [backlog](../backlog.md).

- **What:** When one section of an English generation reply is unusable (for example empty Likely exchanges), ask the model to regenerate only that section, given the accepted rest of the topic, instead of regenerating the whole topic. Compare it with the current merging approach (a second full-topic call whose usable sections fill the gaps in the first) on latency, cost, section quality and coherence with the rest of the topic. This needs new prompt text, so it needs owner approval and before-and-after evaluations.
- **Why:** Owner request 2026-11-13: unclear whether it will be necessary, but worth tracking. Today a section-level failure regenerates the whole topic (one extra full call, about 3–5 s and the same cost again), and only the failed sections of the second reply are used ([reply repair](../generation-reliability/reply-repair.md)). In the 2026-11-13 local sample one of 48 English attempts had an empty section ([live samples](../../evals/results/2026-11-13-generation-reliability-local.md)).
- **Open questions:** Is the section-level failure rate in production high enough to justify a prompt change?
- **Done when:** A comparison of partial retry against merging is recorded as an evaluation result, and the owner decides whether to adopt partial retry.
