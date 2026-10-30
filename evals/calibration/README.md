# Current calibration preparation

This directory retains reusable, offline preparation tooling, not a completed run or approval.
Past requests, approvals, model/provider bindings, results and findings have been deleted. No
historical authorization carries forward, and no retained artifact demonstrates current quality.

## Inspect the current request plan

From the repository root:

```bash
bun evals/pipelines/cli.mjs validate
bun evals/pipelines/cli.mjs calibration --plan --json
```

The plan uses the current authored phrasebook v4 fixtures and production A/B request builders.
C detection and known-location repair use the optional offline review contracts. B is pinned to
authored English rather than live A output; known-location C repair is oracle-assisted, not an
end-to-end detector-gated repair measurement. Fixture expectations are not linguistic certification.
See [evaluation guidance](../README.md) for scope and reporting boundaries.

## Materialize native inputs without dispatch

```bash
node evals/calibration/prepare.mjs \
  --destination evals/.runs/new-calibration \
  --bindings /absolute/path/to/new-bindings.json
```

The destination must be a **new** directory under `evals/.runs/` or `.prompt-romp/`. Existing
runs are never overwritten. Supply fresh bindings; no dated provider or pricing file is retained.
The bindings JSON has exactly four group keys: `a`, `b`, `cDetection`, and `cRepair`.
Each group contains:

- `model`: nonempty model identifier.
- `provider`: nonempty provider identifier.
- `maxOutputTokens`: positive integer output cap.
- `pricing`: `inputPerMillion` and `outputPerMillion` (finite nonnegative numbers),
  `currency` (`USD`), `source` (nonempty string), and `date` (`YYYY-MM-DD`).
- Optional `timeoutMs`: positive integer; defaults to 120000 for A and 60000 for the other groups.
- Optional `settings`: generation settings, excluding model, routing, request-formatting,
  credentials, headers, and output-limit overrides.

`prepare.mjs` creates four native suite inputs with exact requests, prompt instructions, schemas,
fixture/rubric/dependency hashes, adapter, pricing/settings and proposal metadata. `adapter.mjs`
asserts that variant instructions match the frozen request and returns that request; it never
substitutes fixture answers. `materialization.json` records generated paths and proposed native
init, note and plan commands. It explicitly reports `approved: false` and `dispatch: false`.

Materialization does not initialize native experiments, authorize a budget, or call a provider.
Inspect the native prepared plans and obtain fresh explicit human authorization for the exact
scope and spending cap before any paid execution. Preparation is not production transport parity,
independent review, or proof that a model/provider binding is currently available.
