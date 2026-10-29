# Diagnostic calibration checkpoint

**Approved diagnostic sample completed: 29/29 attempts, $0.034841798 reported spend.**
Read [`findings.md`](findings.md) for reviewed outcomes and [`results.json`](results.json) for concise
measurements. This is not a model ranking, linguistic acceptance, production change or deployment.

The original [`approval-request.json`](approval-request.json) and [`bindings.json`](bindings.json)
remain assistant-authored provenance. The actual user reply “approved” is recorded separately in
[`execution-approval.json`](execution-approval.json); the original proposal was not rewritten.

## Scope and maximum spend

Five shared contexts: Chinese shoes, Japanese peanut allergy, Czech tea, Ukrainian lost bag, Spanish
pottery. One observation per selected request, serial execution, zero retries, no fallback or paid judge.

| Native stage | Attempts | Model / exact provider | Output-token limit per call | Timeout | Native reservation | Approved stage cap |
|---|---:|---|---:|---:|---:|---:|
| A — English | 5 | `deepseek/deepseek-v4.1-flash` / `relace` | 6,000 | 120s | $0.01711288 | $0.02 |
| B — fixed-English translation | 5 | `google/gemini-3.5-flash-lite` / `google-vertex/global` | 6,000 | 15s | $0.08970600 | $0.09 |
| C — detection | 12 | Same Gemini/provider | 6,000 | 60s | $0.22058580 | $0.23 |
| C — known-location repair | 7 | Same Gemini/provider | 2,000 | 60s | $0.05796980 | $0.06 |
| **Total** | **29** | | | | **$0.38537448** | **$0.40** |

These are conservative native **reservations**, not predicted actual charges or measured costs. Native
Romp bounds serialized UTF-8 request bytes at the input rate plus maximum output tokens at the output
rate, without discounts. Unknown/estimated charges retain their full per-request reservation within the
same cap; a started/uncertain/failed call consumes its attempt and cannot be replayed automatically.
The headroom does not authorize extra calls. A→B, fresh neutral-location repair calls and paid judges
are excluded.

Rates verified from public OpenRouter endpoint metadata on **2026-10-28**:
- [Relace endpoint](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash-20260910/endpoints): **$0.07 input / $0.50 output per million tokens**.
- [Google Vertex global endpoint](https://openrouter.ai/api/v1/models/google/gemini-3.5-flash-lite-20260721/endpoints): **$0.30 input / $2.50 output per million tokens**, reasoning at the same output rate. Non-flex, non-priority route.

A explicitly disables reasoning. B/C explicitly request minimal reasoning; its tokens are included in
the output limit/reservation. Production B calls Vertex directly without that explicit setting, whereas
calibration uses OpenRouter's Vertex route. This is not exact production-transport or latency parity.
Observed canonical model slugs are recorded in the package; the callable model IDs are aliases and are
not guaranteed immutable revisions.

## Finalized sample and review limits

C contains **5 correct controls, 6 authored defects and 1 unscored uncertainty probe**. Known-location
requests comprise 6 proposed corrections and 1 leave-unchanged probe; the location is supplied, not
credited to the detector. Compared with the earlier 27-call proposal, one detection and one repair
request were added to isolate pronunciation:

- **Reading-only defect:** written `有大一码的吗？` asks for a larger size, but its authored reading
  says `xiǎo` (smaller) where written `大` requires `dà`. Expected correction changes only
  `/items/2/card/reading`, preserving written text, English and source records. Proposed severity follows
  the changed spoken meaning, not a blanket rule that incorrect ruby fails a topic.
- **Chinese keep/hold uncertainty:** whether `保管` is suitable for asking a shop to hold shoes before
  purchase is not an established error. Accept either a clean or uncertain **leave-unchanged** judgment.
  Do not count failure to mention this proposed concern as a missed defect or credit a rewrite as a fix.

Independent assistant review covered all five contexts; it was neither blind nor qualified native-
speaker adjudication. No clear factual inconsistency required rewriting the original fixture text.
Remaining review questions include whether shoe essentials should explicitly say “all day,” and whether
Czech `černý` in `černý čaj` needs a more specific meaning identifier than `black-color`. These are
review questions, not confirmed failures. All linguistic labels remain proposed.

## Prepared native plans and stop rules

Working root: `.prompt-romp/calibration-2026-10-28-r1/` (Git-ignored). Four native experiments and
prepared plans exist there; exact IDs, suite revisions, hashes and caps are in the approval package.
Actual human brief and execution approvals were recorded after the user's “approved” reply, bound to
the exact suite revisions and four prepared-plan hashes. Each plan was executed once, without resume.
No final linguistic acceptance, cleanup approval or permission for another paid sample is implied.

1. Recheck model aliases, exact provider metadata, capabilities and prices immediately before dispatch.
   Any drift requires a new plan and approval; never silently substitute a route or model.
2. Execute A, B, C detection, then C known-location repair **one stage at a time**. Inspect each completed
   stage before starting the next. Stop before the next stage on provider/transport error, unsupported
   schema, uncertain start/unknown charge, plan drift or a reported charge above its reservation; request
   direction. Semantic/linguistic findings are calibration evidence, not authorization for another call.
3. Native per-stage caps reserve every started call and stop further dispatch on a reported overrun.
   No retries, paid judging, resumed attempts or scope expansion are implied by approving this package.
4. Review actual outputs independently, record uncertainties and version expectations when needed.
   Commit concise findings/selected regressions, never raw responses or native histories.

**Billing limitation:** caps rely on frozen rates and provider-honored output limits. They are not a
provider billing guarantee; ancillary charges and hidden upstream work cannot be independently bounded.
A provider/schema capability listing is not a successful live request. One observation per case cannot
establish reliability rates, latency percentiles or a general model ranking.

## Reusable preparation and observed verification

`prepare.mjs` only materializes native suite inputs under a new ignored destination; it implements no
provider client, accounting ledger or resume policy. `adapter.mjs` replays one exact frozen request
through native Romp, checking its prompt instructions rather than substituting fixture answers.
Language-specific B instructions are frozen in a case-keyed JSON prompt bundle.

Observed offline verification:
- Native init, assistant proposal notes and bounded `run --plan --save-plan` for all four stages;
  all four saved plans subsequently loaded with `run --prepared ... --plan` without dispatch.
- Current C CLI smoke: 12 cases, 5 unchanged controls / 6 proposed fixes / 1 uncertainty probe;
  56/56 source records retained across cases. Quality and provider-performance metrics remain unassessed.
- The formerly failing uncertainty scenario now accepts a clean, unchanged reply with zero false
  missed-defect labels; regression also rejects an unjustified known-location change.
- Calibration-checkpoint behavior suite: **46 pass, 0 fail** (`bun test evals/pipelines`).
- Actual saved-response CLI smoke: A reports 4/5 parser passes, B 5/5; C reports six incomplete
  detector-gated cases and the hold-probe preservation failure. These observed failures were retained,
  not replaced with mocks. B assembled-card inspection distinguishes raw annotations from normalized data.

Current decision: review the cited findings before any separately approved comparison. In particular,
C recognized all six authored defects but declared incomplete coverage on each, preventing every
detector-gated correction; known-location success is not end-to-end success. Production remains unchanged.

## Subsequent offline reconciliation

The current evaluator uses proposed rubric **1.2** and clarified evaluation-only C detection guidance.
See [C reconciliation](../README.md#c-reconciliation--proposed-rubric-12) for the JSON-field cutover,
separate attribution/severity diagnostics and observed replay results. That offline checkpoint passed
**49 tests**. Historical measurements, `results.json`, approvals and execution-time hashes remain
unchanged; findings presentation was later clarified. The offline work alone produced no new provider calls.

## Completed detection-only recalibration

[`c-recalibration-request.json`](c-recalibration-request.json) freezes **12 C detection calls / $0.23
maximum**, with native conservative reservations of **$0.227289**. Same five contexts: five controls,
six authored defects and one unscored keep/hold probe. Gemini/provider/settings/schema and inputs
match the saved detector baseline; revised detection instructions and proposed rubric 1.2 are explicit.

Fresh native plan: `d8be6a10366201c5cb347dd2b8c87deffc0ac9ed9ca9cd9547d6987d38f123fe`.
Before dispatch, public provider metadata was rechecked with no observed drift, saved-plan reload
passed, and native zero-run status was confirmed. The user's subsequent **“approved”** reply authorized
this exact scope and cap; [`c-recalibration-approval.json`](c-recalibration-approval.json) records that
authorization separately without rewriting the originally unapproved proposal.

**12/12 calls completed, $0.0132374 reported spend, zero errors or unknown charges.** Both detector
sets were reassessed under the same proposed rubric 1.2. Exact authored attribution improved **2→5/6**,
severity disagreements **4→0**, and coverage-complete defect reviews **0→2/6**. Four incomplete reviews
still block correction, including the severe-allergy denial. Two independent assistant reviews support
recognition of all six defects, not qualified linguistic/medical certification or production acceptance.

See [`c-recalibration-findings.md`](c-recalibration-findings.md) and
[`c-recalibration-results.json`](c-recalibration-results.json) for per-case outcomes and measured
cost/token/latency differences. Reusing saved oracle-assisted patches yields only two counterfactual
repairs; the historical hold-probe patch failure remains separate. No fresh repair, A/B or judge calls,
retries, fallback or deployment. The consumed authorization does not permit additional spending.

**Current disposition: C is optional and deferred.** Its
[process and unresolved status](c-recalibration-findings.md#status-deferred-optional-investigation)
are retained without further reconciliation. The [dated A/B working log](../baseline/log-findings-2026-10-28.md)
reuses these ten historical A/B observations alongside **20 newly completed calls**, with
**$0.029976204 reported spend / $0.22 approved maximum**. The exact
[request](../baseline/approval-request.json), [actual approval](../baseline/execution-approval.json)
and [measured receipts](../baseline/collection-results.json) remain separate. Three observations per
case form only a limited five-context reference, not final acceptance or product-wide confidence.
C does not gate A/B; this consumed authorization permits no additional spending.

