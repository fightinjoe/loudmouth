# Content-quality evaluation

**Goal: fast, reliable, trustworthy initial content.** Runtime review/repair is optional.

Current direction: [quality plan](../docs/designs/phrasebook-quality-identity-storage-plan.md).
The cleanup checkpoint retains reusable validators/adapters and selected examples; the next checkpoint
adds independently runnable A (English), B (translation), C (detection/optional repair) and A→B workflows.
No paid calibration or comparative model/prompt study is authorized by this cleanup.

## What belongs here

- `fixtures/regressions.json`: six concise historical lessons with concrete examples, provenance and uncertainty.
- `repair-r1/{tasks,composition,conditional-reason}.mjs`: reusable reviewer projection and validated patch application.
- `repair-r1/naturalistic/{collection,conversion}.mjs`: adapters to unchanged production prompts/parsers and topic conversion.
- `repair-r1/pos-usage/policy.mjs`: explicitly experimental counter/classifier and teaching-field policy; **not production approval**.
- Retained `suites/*/response.schema.json`: contracts used by these helpers/tests, not executable old experiments.
- Tests exercise validator boundaries, atomic rejection, correct controls and immutable source evidence.

These helpers are retained for reuse, not an instruction to select their architecture or protocol.
The production API/card contracts remain authoritative. Subjective fixture judgements are proposed,
not native-speaker certification; uncertain cases cannot become definitive pass/fail labels silently.

## Cleanup and Git boundary

The user explicitly chose deletion rather than archival on 2026-10-28:

| Retain in Git | Delete; never commit |
|---|---|
| Reusable source/contracts/tests, small authored fixtures, rubrics, concise findings and current guidance | `.prompt-romp/` working experiments/imports/cutover artifacts |
| Selected regression examples with provenance and caveats | `evals/failures/` raw captures and duplicated historical `evals/corpora/` releases |
| Human-readable decision/review summaries | Old experiment directories, approvals, plans, raw responses, logs, receipts and snapshot verifiers |

Historical evidence was distilled, **not archived**. Old runs are no longer replayable or resumable;
concise lessons cannot substitute for raw evidence or establish current model rankings/error rates.
All old paid approvals are retired, not reusable budgets. Prior unknown charges are not proven zero
by deleting logs; the latest narrow continuation ledger retained $1.03511475 of unknown reservations
across its historical-naturalistic/authored-POS scope, not a complete project billing reconciliation.
No production code, production prompt, library data, API-local evals or unrelated design work is deleted.

Keep future runtime payloads ephemeral and Git-ignored. A deliberately selected, reviewed fixture is
not a log: include only the input/expected behavior necessary to explain a regression, not a full run.
Do not append experiment diaries or automatically persist every intermediate representation.

## Review vocabulary

- **English meaning / gloss:** e.g. `card.translation = "pair"`; learner-facing English, not a new field.
- **Meaning identifier / sense:** e.g. `card.senseKey = "drinking-cup"`; distinguishes meanings, not teaching prose.
- **Repair explanation / reason:** e.g. a proposal explaining why a field should change; not saved card teaching.
- **Usage teaching:** existing `card.notes` / `card.example`; support varies by producer/repair contract.

Every review sample should show the actual English/target text, schema path, proposed change and user impact.
