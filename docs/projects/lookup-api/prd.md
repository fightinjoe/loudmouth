# PRD: /lookup API

## Problem Statement

The legacy generation endpoints (`POST /translate`, `POST /generate-cards`) do blind, context-free
generation — no disambiguation, no thematic clustering, no tunable register/difficulty/audience. Both
are known to have failed on quality. They have 4 live callers, all in throwaway prototype clients
(`web/app/src/components/{translation-panel.js,generate-cards-panel.js}`,
`ios/Loudmouth/Screens/{Translation,GenerateCards}/*View.swift`), and are being retired.

## Solution

Build `/lookup`, a single endpoint that takes a term + tuning options (`language`, `ability`,
`formality`, `audience`, `llm`) and returns disambiguated **translation blocks** (a primary card plus
thematically clustered **related groups** of cards) in one deterministic request/response cycle.

**Full contract is canonical in [`docs/API_DESIGN.md`](../../API_DESIGN.md)** — read that for exact
I/O shapes, the model prompt spec (Model behavior), worked examples, and the complete test coverage
table. This PRD exists only to drive `tasks.json`; do not duplicate the contract here.

This project is **backend + eval only**. Client rebuild against `/lookup` (web, then iOS) is a separate
project: [`docs/projects/phrasebook-lookup-ux/`](../phrasebook-lookup-ux/prd.md).

## User Stories

1. As the app (client), I want to call `/lookup` with a term + options and get back translation blocks
   with related groups, so I can show a learner a disambiguated primary translation plus thematically
   clustered related phrases in one call.
2. As a developer, I want `/lookup` to reject malformed or oversized input with a `400` before any model
   call, so invalid requests never spend LLM cost.
3. As a developer, I want a deterministic post-processing layer that enforces the block/group/card caps
   and sets service-owned fields (`context`), so the client never receives an out-of-contract shape.
4. As a QA engineer, I want an eval harness that checks structural invariants, reading-token correctness,
   and conversational quality pre-deploy, so regressions are caught before they reach learners.

## Implementation Decisions

All decisions (latency/token budgets, trim order, backend-shared prompt, defaults) are recorded in
`docs/API_DESIGN.md` — treat that document as authoritative. Notable ones relevant to task scoping:

- v0 is a single model call (no planner/fan-out) — see API_DESIGN.md's deferred `docs/FANOUT_DESIGN.md`.
- `maxOutputTokens`: 20000. Request timeout: 15s. Target p50: <4s.
- Existing code under `api/src/` predates this contract restructure and is **not** treated as a starting
  point for this task list — TS-001–004 below implement fresh against the current contract rather than
  patching stale code.
