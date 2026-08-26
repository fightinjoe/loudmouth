---
name: fanout-design
description: >
  Deferred design for the /lookup planner + parallel-fillers fan-out — the EARNED latency/quality
  optimization behind the v0 single-call endpoint in docs/API_DESIGN.md. Load this ONLY when v0's
  measured latency or quality is unacceptable and the fan-out is being built. Not part of the v0
  contract.
status: DEFERRED — build only when v0 latency/quality demands it (see API_DESIGN.md §7.1)
---

# Fan-out design — /lookup planner + parallel fillers

> **This is deferred, earned optimization work, not the v0 design.** The shipping `/lookup` is a
> **single monolithic LLM call** (see `docs/API_DESIGN.md` §4). Build this fan-out **only if** v0's
> measured p50/p95 latency or content quality is unacceptable (API_DESIGN §2.C+D). Two sequential
> Haiku round-trips can lose to one slightly-bigger call, so the fan-out must be **measured against
> the v0 baseline**, not assumed to win. Everything here builds on the v0 contract in API_DESIGN —
> the wire shape (`LookupResponse`), caps (§2.B), seed parsing (§2.A), and validation rules (§6) are
> unchanged; only the server-side execution splits.

## What it changes

It splits the one call into a **planner** (blocks + group `{ title }` skeleton, no cards) and
**N parallel fillers** (one per group, cards only), assembled server-side. From the client it stays
one blocking `POST /lookup` returning the same `LookupResponse` — the split is invisible on the wire.

```
        parse seed → [input, context]   (API_DESIGN §2.A — unchanged)
                     │
  ┌──────────────────▼─────────────────┐
  │ PLANNER (1 call) → blocks skeleton  │  per block: { primary, groupSpecs[] }
  │   groupSpec = { title }             │  groupSpec has NO cards
  └──────────────────┬─────────────────┘
                     │  collect ALL groupSpecs (≤8 total, API_DESIGN §2.B) → Promise.all
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐   FILLERS (≤8 parallel — the ≤8-group
   │FILLER 1 │ │FILLER 2 │ │FILLER k │   total cap makes a pool unnecessary)
   │→ cards[]│ │→ cards[]│ │→ cards[]│   in: {title,input,context,deck}
   └────┬────┘ └────┬────┘ └────┬────┘
        └───────────┼───────────┘
                    ▼
     ASSEMBLE by (blockIndex, groupIndex) — NEVER by title text
     (titles collide / get rewritten by the model)
                    ▼
              200 LookupResponse
```

## Rules

- **Concurrency is bounded by construction:** ≤8 groups total (API_DESIGN §2.B) ⇒ ≤8 concurrent
  fillers, always. No `p-limit`/pool needed.
- **Assembly by index, never by title.** The planner returns blocks with ordered `groupSpecs`; fillers
  are dispatched with `(blockIndex, groupIndex)` and results reattached by those indices. Never match on
  `title` text — titles can collide or be lightly rewritten by the model.
- **Failure handling:**
  - Planner fails (LLM error or invalid skeleton) → **502**. Nothing to return without a skeleton.
  - A single filler fails → **drop that group**, keep the rest (log `(blockIndex, groupIndex, title)`).
  - Every group in a block fails → the block still returns its `primary` + `groups: []` (a bare
    translation is valid, API_DESIGN §2.B).
  - **Degradation floor:** if **> 50%** of fillers fail, still return 200 **but log a WARN** with
    `{ seed, failed/total }` so a systemic model outage is visible, not silently shipped as thin results.
- **Cross-group dedup becomes best-effort.** Fillers can't see each other's output, so
  API_DESIGN G6's "no cross-group near-duplicates" is enforced only *within* a group at fill time.
  Mitigations: the planner picks **distinct, non-overlapping titles**; a light post-assembly pass drops
  a card whose `text` already appeared in an earlier group (by group index). In v0's single call this is
  trivial (one prompt sees every group) — **losing that is part of the fan-out's cost**, weigh it
  against the latency win.

## Alternative: two-call serial plan+fill (quality-only, no parallelism)

A middle ground worth naming explicitly, distinct from the parallel fan-out above: a **plan** call
(disambiguation + group titles, same as the planner above) followed by a single **serial** fill call
that receives the full plan and generates every group's cards in one shot — not one call per group,
not parallelized.

This targets a different problem than the fan-out does. The fan-out is a **latency** bet (parallel
decode of the expensive card-generation work) that pays a **quality** cost — cross-group dedup and
cross-group coherence become best-effort, per the Rules above, because fillers can't see each other's
output. The two-call serial split is the opposite trade: it isolates the structural-planning task from
the creative-content task (each prompt gets simpler, more focused instructions, less to juggle at once)
**without** losing one-context visibility across every group, since the fill call still sees the whole
plan and writes all cards together — cross-group dedup stays exact, not best-effort. The cost is an
extra sequential round-trip, so it has **no latency upside** over v0 and likely runs slower; it only
makes sense if a v0 quality problem is diagnosed as structural-vs-creative task interference within the
single prompt specifically, not as a latency problem.

No evidence has pointed at that failure mode yet — every quality gap found via the sample-review loop
(`api/evals/lookup-sample.js` + `api/.claude/skills/prompt-review`) so far has been fixable with prompt
wording alone in the v0 single call. Treat this alternative as a fallback if that stops being true, not
as a default next step.

## Modules if built

Splits the v0 single-call modules (API_DESIGN §4 layout):

| File | Role |
|---|---|
| `src/lookup-planner-prompt.js` | `buildPlannerPrompt({ input, context, deck })` → skeleton prompt (primaries + `{ title }` groupSpecs, no cards) |
| `src/lookup-filler-prompt.js` | `buildFillerPrompt({ title, input, context, deck })` → cards-only prompt for one group |
| `src/lookup-validate.js` | split into `validatePlannerResponse(raw)` + `validateFillerResponse(raw)` (both still import shared `card-validate.js`) |
| `src/lookup.js` | orchestrator: parse seed, plan, fan-out fillers (`Promise.all`), assemble by index, apply degradation floor |

Prompt content is derived from the v0 `buildLookupPrompt` (API_DESIGN §5) — the planner keeps the
disambiguation + group-labeling instructions and drops card generation; each filler keeps the
per-group card + reading-token + G6 quality instructions and drops disambiguation.

## Validation deltas vs. v0 (API_DESIGN §6)

- `validatePlannerResponse` — same as v0 but validates `groupSpecs: [{ title }]` (no `cards`);
  clamps blocks to 4 and total groupSpecs to 8.
- `validateFillerResponse(raw)` — validates `{ cards: Card[] }` for one group; clamps to 15 cards; a
  group left with < 3 valid cards is dropped (return a typed "drop this group" sentinel to the
  orchestrator, NOT a 502). The service sets each card's `context` to the group `title`. No word/phrase
  type check (groups may mix — API_DESIGN §G2).
- The `card-validate.js` shared validator (API_DESIGN §6 T0) is reused unchanged.

## Test additions vs. v0

The v0 unit suite (API_DESIGN §9) already covers seed parse, clamps, thin-group drop, service context-set, and
card validation. The fan-out adds:

- **Assembly by index** — fillers returned out of order still attach to the right `(block, group)`.
- **Single filler failure** → that group dropped, rest intact.
- **All fillers in a block fail** → block returns `primary` + `groups: []`.
- **> 50% fillers fail** → 200 + WARN log emitted.
- **Planner invalid skeleton** → 502.

These are the CRITICAL fan-out paths — must-pass with the LLM mocked.
