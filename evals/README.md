# Content-quality evaluation

**Goal: fast, reliable, trustworthy initial content.** Runtime review/repair is optional.
[Current strategy](../docs/designs/phrasebook-quality-identity-storage-plan.md) ·
[Proposed rubric](rubric.json) · [Subjective-review skill](../.agents/skills/content-quality-evaluation/SKILL.md)

**Current priority: establish a confident A/B baseline before comparing future models or prompts.**
C is optional and deferred, not a prerequisite for A/B. Follow the
[baseline checkpoint](../docs/designs/phrasebook-quality-identity-storage-plan.md#next-checkpoint-reviewed-ab-baseline);
retain C's [current process/status](calibration/c-recalibration-findings.md#status-deferred-optional-investigation)
without further reconciliation or paid execution.

## Three independent pipelines

| Command lane | Frozen input → output | What it measures |
|---|---|---|
| `a` — English | Canonical learner request → essentials, useful vocabulary and two-sided dialogue | Structural completeness plus independently reviewed usefulness/fit |
| `b` — translation | **Fixed authored English** and canonical context → target-language topic | Fidelity, readings, dictionary forms/meanings and evidence; independent of candidate A |
| `c` — detection/optional repair | Fixed bilingual topic, correct controls and deliberately injected defects → findings and proposed/applied repairs | Strict attribution and independently reviewed recognition/false alarms; known-location repair separately from counterfactual composition |
| `ab` — optional integration smoke check | Canonical request → **actual A output** → translation | Technical handoff/association checks, not a fourth quality pipeline or required paid comparison |

These are evaluation workflows, not required runtime API calls. A/B reuse unchanged production
prompts and parsers; C reuses validated local patch/composition contracts. There is no second
provider/accounting runner: paid execution belongs exclusively to native `../prompt-romp`.
No production prompt changes, model switch, paid calls or deployment are authorized by these scripts.

A and B can identify content errors separately: B can review translations of frozen English outputs
collected from A as well as authored controls. A separate paid A→B evaluation is not required.
The existing `ab` command is retained only as an optional integration check for technical handoff
failures, such as translating five entries when A produced six. It is not another linguistic rubric.

Saved localized replies reused under detector-gated routing are explicitly **counterfactual composition
checks**, not independent observations from a different neutral repair prompt. Fresh neutral-request
behavior requires separately approved native calls; it is not measured by the calibration inventory below.

## Offline proof and representative review sample

Offline CLI smoke covers all five contexts in A/B/C/AB and saved-response imports. Current mock C
produced five unchanged controls, six repaired defects and one unscored uncertainty probe, retaining
56/56 source records across twelve cases. An added sixth A essential with stale five-essential B was
rejected rather than substituting fixed English. **Quality remains unassessed.**

Selected `shoes-zh` example: the learner usually wears European size 39, wants a larger size if tight,
and has not specified a hold duration or purchase commitment.

| Pipeline C authored case | Actual field/text | Expected mock action, not a linguistic verdict |
|---|---|---|
| Correct translation | `/items/0/card/text`: `我平时穿欧码三十九号。` | Leave unchanged; 4/4 supporting source records retained |
| Wrong size | English: “I usually wear European size 39.”; target: `我平时穿欧码三十八号。` (38) | Change 38 to 39 and update the pronunciation annotation; keep the English and source records unchanged |
| Wording needing language review | English: “Can you keep these for me?”; target: `可以帮我保管这双鞋吗？` | Do not rewrite automatically. Check whether this wording asks staff to look after shoes rather than hold a pair for possible purchase. This possible distinction is not an established error. |

The repair **reason** explains restoring size 39 and aligned pinyin; it is not saved usage teaching.
This sample, the proposed rubric and relative priorities are the next selective human review gate.

In pipeline C, **unresolved** means “the reviewer cannot confidently decide whether a correction is
needed; leave the text unchanged and record the question.” It does not mean the whole phrasebook
failed, that A/B cannot assess the text, or that a runtime follow-up question is required.
Every review example should name its pipeline, show the English and target text, state the possible
learner impact, and say whether to change, leave unchanged, or request further review.

## Findings and chat-update format

Start assistant-authored findings and progress/result handoffs with **RECAP**, then **GOAL**, before
results or spending. Do not rely on a recap shown at the bottom of the conversation.

- **RECAP:** Name A, B or C and say whether this is pipeline implementation, an offline/mock check,
  a replay of saved replies, or a new live model run. Identify the input, the comparison baseline,
  what changed and which stages did **not** run.
- **GOAL:** State the human task and expected behavior. Say whether errors were deliberately inserted.
  For comparisons, explain what is being retested; do not assume “recalibration” explains it.
- **RESULT:** Separate expected behavior, actual model responses, independent review judgments and
  actually applied corrections. Give each metric a desired result/direction and denominator.
  “2/6 is better than 0/6, but the target is 6/6” is clearer than an unexplained improvement.
- Use **✅ named check passed**, **❌ named check failed**, **⚠️ partial/uncertain**, and **— none or
  not measured, explicitly labeled**. A detected inserted error is a detection success; it does not
  make the input correct or prove correction. An improvement below the target is not a full pass.
- Keep logistics in a short table: calls, reported spend/cap and execution failures (— if none;
  otherwise list them). Keep quality problems and blocked corrections separate from execution failures.
  Put provenance and detailed latency/token accounting after the result, not ahead of the context.
- Label columns **Expected behavior**, **Actual model response** and **Applied/replayed correction**,
  not an ambiguous “outcome and disposition.” Define schema terms on first use or link the key below.

### C review response: plain-language key

This is the **local evaluation detector's response**, not the production `/lookup` API schema.
The detector reports problems; a separate correction step decides whether it can safely apply repairs.

| Field or term | Meaning and consequence |
|---|---|
| Defect | A content error, such as a wrong size, reversed route or misleading pronunciation. In the six C negative examples these errors were inserted deliberately, not discovered as unexpected software bugs. |
| `complete` | Whether the detector says it examined the **entire topic**, not whether the content is correct. `true` can accompany errors or uncertainty. `false` blocks every correction in that topic, even if a finding is accurate. |
| `findings` | Problems the model believes it found. Each gives `handle` (item ID), `field` (affected part), `category` (error type), `severity` (impact), `origin` (English or translation) and `reason`. These are observed allegations, not fixture answer labels. |
| `handle` | Stable item ID; numbering starts at zero. `e:0` is the first essential phrase, `d:2` the third dialogue line, `v:0` the first vocabulary item. |
| Detector `unresolved` | Item IDs and reasons where the detector cannot confidently judge whether a correction is needed. Keep those items unchanged; this is not a list of all unfixed errors. `[]` means no specific uncertainty was listed, not “all work is complete.” |
| Correction-step `unresolvedHandles` | Items not safely resolved by routing/application. This differs from detector uncertainty: when `complete:false`, **all** topic items remain blocked even if detector `unresolved` is empty. |

Thus `{complete:true, findings:[], unresolved:[]}` declares a fully reviewed clean topic.
`{complete:true, findings:[…], unresolved:[]}` can declare fully reviewed content **with errors**.
`{complete:false, findings:[…], unresolved:[]}` can recognize an error while still blocking correction.
These are shape illustrations, not additional observed responses. Completion is a model declaration,
not independent proof of review quality; parser validity, recognition and correction remain separate checks.

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
frequencies must not be presented as production error prevalence. Current authored English remains
a proposed control, not a qualified linguistic baseline; assistant calibration reviews are recorded
in [`calibration/findings.md`](calibration/findings.md).

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

`calibration --plan` emits the model-independent inventory. The
[exact native calibration package](calibration/README.md) binds models/providers, dated prices,
token/time limits, frozen request hashes and stop rules: **29 maximum attempts / $0.40 approved cap**.
The user approved that package; all 29 calls completed once for **$0.034841798 reported spend**,
with no unknown charges or reservation overruns. Native conservative reservations were $0.38537448.
See [reviewed findings](calibration/findings.md) and [measured results](calibration/results.json).

The inventory is 5 A, 5 fixed-English B, 12 C detection, and 7 known-location replies:
6 proposed corrections (including one reading-only case) plus 1 leave-unchanged uncertainty probe.
The unestablished Chinese wording concern is excluded from defect-recall/false-alarm scoring; a clean
or uncertain leave-unchanged judgment is allowed. No missing paid reply may be filled by a mock.
No independent neutral repair calls, paid judges, retries, resumed historical approvals or conditional
expansion were included. Caps rely on the package's billing assumptions, not a provider billing
guarantee. This consumed approval grants no reruns; model/prompt comparisons and production changes
remain outside its scope.

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

### C reconciliation — proposed rubric 1.2

Evaluation-only detection instructions now distinguish **review coverage** from **correctness**:
`complete=true` is compatible with defects or unresolved items; `false` still blocks whole-topic
correction. Target-language wording belongs to `text`, not the frozen English `translation` field.
Guidance names canonical meaning, medical-safety and pronunciation categories, while retaining the
existing allowed categories. Critical severity requires a concrete serious safety consequence, not
merely a contradiction. Production prompts, schemas, repair instructions and routing are unchanged.

Current C JSON reports replace `matches`, `misses` and `falseAlarms` with `exactMatches`,
`unmatchedExpectations` and `unmatchedPredictions`. `attributionCandidates` compares findings on the
same handle, including field/category agreement and observed versus proposed authored severity.
These are review candidates, **not** an automatic semantic match or severity correction;
`semanticRecognition` remains null. Correct-control repair restraint remains unmeasured without
an actual repair response. Human recognition/false-alarm judgments remain separately attributable.

Offline replay of the original 12 saved detector responses preserves **2 exact matches, 4 unmatched
expectations, 5 unmatched predictions, 6 incomplete defect reviews and zero applied edits**. It exposes
6 same-handle candidates and 4 severity disagreements without rewriting a response or fixture label.
The historical `calibration/results.json`, measurements and approval package remain unchanged.
Revised reporting is a separate reassessment, not new model evidence. That offline checkpoint alone did not
establish improved generated behavior.

Verification: **49 tests pass**; the actual saved-response CLI and the five-context mock C workflow
were exercised. The revised model-independent inventory remains unapproved, non-dispatching and
29 calls; it is not a priced execution authorization.

The subsequently approved **12-call/$0.23 detection-only recalibration** completed at **$0.0132374**
reported spend, with zero errors/unknown charges. Under the same rubric, exact authored attribution
improved **2→5/6**, severity disagreements **4→0**, and coverage-complete defect reviews **0→2/6**.
All six defects were recognized according to two independent assistant reviews; **four incomplete
reviews still block correction**, including the severe-allergy denial. Saved replies support two
counterfactual Chinese repairs, not new neutral repair evidence. See
[`calibration/c-recalibration-findings.md`](calibration/c-recalibration-findings.md) for per-case
evidence, measured latency/tokens/cost and limitations. No production or additional paid work is authorized.


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
5. Pronunciation matters: assess ruby readings, pinyin/romanization and their agreement with the
   written phrase explicitly. Incorrect ruby is a quality finding, not an automatic whole-topic
   failure. Severity depends on what the learner would say: a minor annotation issue differs from
   pronunciation that changes the intended meaning. Malformed data that cannot render is a separate
   technical-validation issue; this guidance does not relax the production schema.

| Term | Concrete path/example | Why it matters |
|---|---|---|
| Displayed English meaning, sometimes **gloss** | `items[0].card.translation = "pair"` | Learner-facing English equivalent, not another field |
| Meaning identifier | `items[0].card.senseKey = "drinking-cup"` | Distinguishes a vessel from a cupful; `senseKey` is the existing schema name, not the preferred review term |
| Repair explanation, **reason** | `repairs[0].response.reason` | Explains a correction/source removal; not saved teaching |
| Usage teaching | `card.notes` / `card.example` | Existing Card fields; support depends on producer/repair contract |
| Lexical evidence | `items[0].sources[0].snapshot` and `.span` | Exact historical occurrence, UTF-16 offsets; inflection can support a lemma |

This section is the terminology reference. Prefer plain-English **meaning**, **pronunciation**,
**supporting source**, and **repair explanation** in reports; include schema names only to locate
the exact data. Readers should not need a glossary to understand a finding.

Example rubric distinction: an allergy topic with only ingredient questions lacks its requested
allergy statement (**coverage 2**, correction/supplementation needed). Repeated but usable dance
invitations can remain **flow 3**, not a material failure. English “I cannot eat peanuts” translated
as “I can eat peanuts” is a material meaning/safety defect despite valid JSON.

For user review, show one canonical context, its actual English/target phrase, the concrete field,
a proposed finding/correction and uncertainty. A generator cannot certify its own output; independent
assistant/model/human reviews must remain attributable. Material linguistic disagreement stays unresolved
pending qualified adjudication. Rubric/sample approval alone does not authorize spending or deployment;
the separately recorded calibration execution approval authorized only that completed bounded sample.

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
3. Diagnostic calibration checkpoint — user approved the exact 29-attempt/$0.40 package; all calls
   completed and concise findings are in `calibration/`. A subsequent approved 12-call C recalibration
   observed better attribution/severity agreement but four remaining incomplete defect reviews under
   proposed rubric 1.2. C is now optional and deferred; those unresolved questions do not gate A/B.
   Calibration is not candidate ranking or unseen reliability evidence.
4. **Next: establish the current A/B baseline** using the linked checkpoint. Inventory existing
   observations, review coverage/assessment gaps and freeze the baseline configuration, inputs and
   repetitions before requesting an exact A/B-only collection approval. Do not silently fix known
   failures or treat the five observations per lane as a confident baseline.
5. Only after that baseline, compare **models**, **prompts** and **systemic changes** under separate
   controlled studies, A and B independently. C is reconsidered only if explicitly reopened, with
   process review before new experiments. Optional A→B smoke checks are not a fourth quality study.
   Freeze decision criteria and stop rules; no automatic model/prompt promotion or deployment.
