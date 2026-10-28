# Content-quality evaluation

**Goal: fast, reliable, trustworthy initial content.** Runtime review/repair is optional.
[Current strategy](../docs/designs/phrasebook-quality-identity-storage-plan.md) ·
[Proposed rubric](rubric.json) · [Subjective-review skill](../.agents/skills/content-quality-evaluation/SKILL.md)

## Three independent pipelines

| Command lane | Frozen input → output | What it measures |
|---|---|---|
| `a` — English | Canonical learner request → essentials, useful vocabulary and two-sided dialogue | Structural completeness plus independently reviewed usefulness/fit |
| `b` — translation | **Fixed authored English** and canonical context → target-language topic | Fidelity, readings, dictionary forms/meanings and evidence; independent of candidate A |
| `c` — detection/optional repair | Fixed bilingual topic, correct controls and deliberately injected defects → findings and proposed/applied repairs | Detection misses/false alarms; known-location repair separately from counterfactual detector-gated composition |
| `ab` — composed check | Canonical request → **actual A output** → translation | Integration/association and whole-topic outcome; never silently substitutes B's fixed English |

These are evaluation workflows, not required runtime API calls. A/B reuse unchanged production
prompts and parsers; C reuses validated local patch/composition contracts. There is no second
provider/accounting runner: paid execution belongs exclusively to native `../prompt-romp`.
No production prompt changes, model switch, paid calls or deployment are authorized by these scripts.

Saved localized replies reused under detector-gated routing are explicitly **counterfactual composition
checks**, not independent observations from a different neutral repair prompt. Fresh neutral-request
behavior requires separately approved native calls; it is not measured by the calibration inventory below.

## Offline proof and representative review sample

Actual CLI smoke covered all five contexts in A/B/C/AB and saved-response imports. Mock C produced
five unchanged controls, five repaired defects and one unresolved case, retaining 52/52 source records
across the eleven review cases. An added sixth A essential with stale five-essential B was rejected;
the composed path did not substitute fixed fixture English. **Quality remains unassessed.**

Selected `shoes-zh` example: the learner usually wears European size 39, wants a larger size if tight,
and has not specified a hold duration or purchase commitment.

| Authored case | Actual field/text | Mock result, not a linguistic verdict |
|---|---|---|
| Correct control | `/items/0/card/text`: `我平时穿欧码三十九号。` | Unchanged; 4/4 source records retained |
| Injected wrong size | English: “I usually wear European size 39.”; target: `我平时穿欧码三十八号。` (38) | Restore `三十九号` (39) and aligned `card.reading`; frozen English/evidence unchanged |
| Debatable keep/hold wording | `/items/4/card/text`: `可以帮我保管这双鞋吗？` | Retain and flag unresolved safekeeping-versus-sales-reservation intent; not a definitive error/synonym judgment |

The repair **reason** explains restoring size 39 and aligned pinyin; it is not saved usage teaching.
This sample, the proposed rubric and relative priorities are the next selective human review gate.

## Discover fixtures and run offline

Use Bun; this workstation's default Node binary has a known missing dynamic-library dependency.
From the repository root:

```sh
bun evals/pipelines/cli.mjs validate
bun evals/pipelines/cli.mjs run a --mock
bun evals/pipelines/cli.mjs run b --mock
bun evals/pipelines/cli.mjs run c --mock
bun evals/pipelines/cli.mjs run ab --mock
bun evals/pipelines/cli.mjs run c --mock --context shoes-zh --json
```

No credentials, network or default output files. Markdown goes to stdout; `--json` emits structured
results. Unknown commands/options/context IDs and invalid inputs fail rather than silently reducing
coverage. Mock provenance is explicit; provider latency, token usage and cost are **not measured**,
not zero. Fixture checks prove workflow behavior, not multilingual correctness or provider reliability.

- [`fixtures/contexts.json`](fixtures/contexts.json): the one canonical learner-context registry.
  IDs: `shoes-zh`, `allergy-ja`, `tea-cs`, `lost-bag-uk`, `pottery-es`. Every lane uses these IDs.
  Each entry contains the exact singleton-topic `/phrasebook` request and ordinary/challenge label.
- [`fixtures/pipeline-cases.json`](fixtures/pipeline-cases.json): authored complete English and
  translation payloads; C controls, defects, unresolved cases, mock replies and explicit expected checks.
  B pins this authored English; C derives its baseline from the same normalized bilingual topic.
- [`fixtures/regressions.json`](fixtures/regressions.json): six distilled historical regression lessons,
  including inflected evidence, wrong occurrence selection, ambiguous intent and output-contract errors.

**All subjective examples and expectations are assistant-proposed, not approved gold labels or
native-speaker certification.** Exposed development cases are not unseen holdouts. Deliberate challenge
frequencies must not be presented as production error prevalence. Current authored English is a
proposed calibration control, not an independently reviewed baseline yet.

## Prepare real requests without dispatch

```sh
bun evals/pipelines/cli.mjs prepare a --context shoes-zh
bun evals/pipelines/cli.mjs prepare b --context shoes-zh
bun evals/pipelines/cli.mjs prepare c --context shoes-zh
bun evals/pipelines/cli.mjs calibration --plan
```

Preparation emits model-independent requests and provenance/hashes, not provider calls or permission
to execute. A uses the production English prompt; B uses production translation instructions/schema
and fixed English. C exposes detection and **separate known-location repair** requests. The latter
is oracle-assisted capability measurement, not proof that a detector would find those locations.
Do not feed answer expectations, mutation descriptions or proposed corrections into model-visible input.

Programmatic helpers in `pipelines/runner.mjs` support actual staged collection without a new provider
runner: `prepareComposedTranslation(fixtures, contextId, englishResponse)` prepares B from real A;
`createReviewInput(fixtures, contextId, reviewId)` provides the exact C baseline; and
`prepareDetectedRepairs(input, detection)` prepares neutral requests for actual detected handles.
Use `loadFixtures()` for the shared registry. These helpers prepare only; native Romp owns dispatch.

The calibration plan proposes a small baseline sample and call inventory. It is **not execution-ready**
until the user approves the rubric/priorities/sample, current exact model/provider configurations and
prices are bound to a native Romp plan, and the exact call cap, timeout, retry policy, dollar cap,
unknown-charge reserve and stop rules receive explicit approval. Old approvals/unused budgets are retired.
No automatic paid judges, retries, resumed experiments or conditional expansion are implied.

The current inventory is **27 proposed calls**: 5 A, 5 fixed-English B, 11 C detection, and 6
known-location replies (5 material corrections plus 1 unresolved-intent abstention probe). It includes
all reply slots required for saved C evaluation; a missing paid reply must never be filled by a mock.
No independent neutral repair calls, paid judges or retries are included. The manifest hashes each
request/context/schema and relevant source/rubric dependencies; configuration/pricing/budget are unbound.

## Evaluate saved responses

After separately approved collection by native Romp, export only the selected responses into an
ignored local workspace, then use the same validators/reporting without redispatching anything:

```sh
bun evals/pipelines/cli.mjs evaluate a --input evals/.runs/selected.json --context shoes-zh
bun evals/pipelines/cli.mjs evaluate b --input evals/.runs/selected.json --context shoes-zh
bun evals/pipelines/cli.mjs evaluate c --input evals/.runs/selected.json --context shoes-zh --json
bun evals/pipelines/cli.mjs evaluate ab --input evals/.runs/selected.json --context shoes-zh
```

The input is `{ "version": 1, "responses": [...] }`. Each row has `contextId` and the fields needed
for its lane: `english`, `translation`, or `reviews`. English/translation are raw JSON values or their
original response strings. A requires English; B requires translation; AB requires both and evaluates
translation against **that row's actual English**. A C review row is
`{id, detection, repairs: [{focus: {handle, field, category}, response}]}`; use every selected C case ID.
The fixture files illustrate envelope shapes, but never substitute a mock for a missing saved response.
These exports are disposable work inputs, not committed logs or a second canonical accounting ledger.

Read structural/fixture outcomes separately from subjective review. A model can return valid JSON
with a reversed negation; a rejected correction can preserve the original yet fix nothing. Review
actual text, paths, risk and unresolved claims using the skill, not a single green aggregate.

## Review priorities and concrete terms

The existing API 0–4 ordinal quality anchors remain; `null` means unassessed, never score 0.
The proposed [`rubric.json`](rubric.json) adds task-specific examples and review-record requirements,
not a new runtime scoring field or automatic promotion threshold.

1. Meaning/safety and supplied learner facts: explicit findings, never averaged away.
2. A: useful independent essentials first, then reusable vocabulary. Ordinary dialogue repetition
   is lower impact than an essential missing intent.
3. B: preserve English meaning, then assess target naturalness, dictionary forms, readings and
   truthful source occurrences separately. Attribute English-origin problems to A.
4. C: measure misses/false alarms and repair capability independently; distinguish proposed versus
   applied corrections, correct-control changes, source retention, introduced harm and unresolved cases.

| Term | Concrete path/example | Why it matters |
|---|---|---|
| Displayed English meaning, sometimes **gloss** | `items[0].card.translation = "pair"` | Learner-facing English equivalent, not another field |
| Meaning identifier, **sense** | `items[0].card.senseKey = "drinking-cup"` | Distinguishes a vessel from a cupful; not teaching prose |
| Repair explanation, **reason** | `repairs[0].response.reason` | Explains a correction/source removal; not saved teaching |
| Usage teaching | `card.notes` / `card.example` | Existing Card fields; support depends on producer/repair contract |
| Lexical evidence | `items[0].sources[0].snapshot` and `.span` | Exact historical occurrence, UTF-16 offsets; inflection can support a lemma |

Example rubric distinction: an allergy topic with only ingredient questions lacks its requested
allergy statement (**coverage 2**, correction/supplementation needed). Repeated but usable dance
invitations can remain **flow 3**, not a material failure. English “I cannot eat peanuts” translated
as “I can eat peanuts” is a material meaning/safety defect despite valid JSON.

For user review, show one canonical context, its actual English/target phrase, the concrete field,
a proposed finding/correction and uncertainty. A generator cannot certify its own output; independent
assistant/model/human reviews must remain attributable. Material linguistic disagreement stays unresolved
pending qualified adjudication. Initial user approval concerns the rubric/priorities/sample only,
**not spending or deployment**.

## Retained implementation and checks

- `pipelines/cli.mjs`, `runner.mjs`, `report.mjs`: current offline workflows, preparation and reporting.
- `pipelines/production.mjs`, `topic-conversion.mjs`: unchanged production prompt/parser adapters
  and lossless bilingual-topic conversion, consumed by A/B/C.
- `pipelines/review-contract.mjs`: allowlisted C model input, detection validation and localized patches.
- `pipelines/review-composition.mjs`, `repair-application.mjs`: C routing and atomic patch application.
- `pipelines/contracts/*.schema.json`: the two detection/localized-repair contracts used by C requests.

C's patch protocol is an **evaluation control**, not a selected production architecture or future API
commitment. It preserves English intent and historical snapshots while measuring proposals against
frozen inputs. A different repair design needs an explicit comparison, not compatibility with this control.
Unused POS-policy and one-pass experiments, their test-only contracts and obsolete wrappers were deleted.
Retain code for a current pipeline consumer, not hypothetical future reuse; selected failure lessons
remain in `fixtures/regressions.json`.

```sh
bun test evals/pipelines
```

Permanent tests cover consumer-visible boundaries/invariants; mock CLI runs provide actual workflow
smoke proof. They do not establish provider compatibility, live latency, cost or language quality.

## Cleanup and Git boundary

The user explicitly chose deletion rather than archival on 2026-10-28:

| Retain in Git | Delete; never commit |
|---|---|
| Reusable source/contracts/tests, small authored fixtures, rubrics, concise findings/current guidance | `.prompt-romp/` working experiments/imports/cutover artifacts |
| Selected regression examples with provenance and caveats | `evals/failures/` raw captures and duplicated historical `evals/corpora/` releases |
| Human-readable decision/review summaries | Old experiment directories, approvals, plans, raw responses, logs, receipts and snapshot verifiers |

Historical evidence was distilled, **not archived**. Old runs are no longer replayable/resumable;
concise lessons cannot establish current model rankings/error rates. All old paid approvals are
retired. Deleting logs does not prove historical unknown charges were zero; the latest narrow
continuation ledger had $1.03511475 of unknown reservations, not complete project billing reconciliation.
Production prompts/code, library data, API-local evals and unrelated design work were not deleted.

Keep future payloads ephemeral in ignored `.prompt-romp/` or `evals/.runs/`; no default raw capture
in these adapters. A selected reviewed regression is a fixture, not a whole run copied into Git.
Do not append experiment diaries or automatically persist every intermediate representation.

## Ordered next gates

1. Cleanup and BRIEF verification — separate committed checkpoint.
2. Offline pipelines/fixtures/rubric/skill and actual CLI proof — separate committed checkpoint.
3. User reviews rubric, priorities and representative fixture/report. Then freeze and explicitly
   approve the exact native paid calibration plan; run only that sample, reconcile uncertainty,
   version expectations and commit concise findings. Calibration is not a candidate-ranking study.
4. Only then compare **models**, **prompts** and **systemic changes** under separate controlled studies:
   A and B independently, small composed A→B, then C's incremental benefit versus unchanged topics.
   Freeze sampling, repetitions, gates and stop rules; no automatic model/prompt promotion or deployment.
