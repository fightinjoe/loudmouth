# Content-quality evaluation

**Goal: fast, reliable, trustworthy initial content.** Runtime review/repair is optional.
[Current strategy](../docs/designs/phrasebook-quality-identity-storage-plan.md) ·
[Proposed rubric](rubric.json) · [Subjective-review skill](../.agents/skills/content-quality-evaluation/SKILL.md)

**Current priority: clarify the collected A/B evidence before accepting a comparison baseline.**
C is optional and deferred, not a prerequisite for A/B. The dated working
[evaluation log](baseline/log-findings-2026-10-28.md) explains the ten earlier responses and twenty
additional responses, with expected behavior, actual values and parser/review distinctions.
The additional calls cost **$0.029976204 against the approved $0.22 maximum**.
[Measured receipts](baseline/collection-results.json) and
[historical assistant reviews](baseline/collection-review.json) are records, not an accepted baseline;
the original grades and counts are not settled pass/fail judgments. Local prompt-romp artifact paths
are temporary provenance locators, not durable attachments or guaranteed replay inputs.
See the [baseline checkpoint](../docs/designs/phrasebook-quality-identity-storage-plan.md#next-checkpoint-reviewed-ab-baseline).
Further calls need separate approval. Keep edits uncommitted unless explicitly asked to commit.

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

## Learning-quality assessment

[`rubric.json`](rubric.json) owns the proposed **0–4 ordinal scale**, dimension definitions,
calibration examples, risk policy and review-record requirements. Do not duplicate or reinterpret
its anchors in endpoint designs. Score coverage, correctness/contextual fit, vocabulary usefulness
and conversation flow independently, with exact citations.

**3 needs editing to become good; 2 needs correction or supplementation to accomplish the task.**
Scores are ordered categories, not equal numerical distances. Report distributions, per-topic
scores and cited weaknesses, not a mean as proof of quality. Missing assessment is null, never 0.
Repetition can remain usable; relevant unfinished dialogue is not automatically a failure.

Generic illustrative language is not automatically a claim about the learner: distinguish an example
allergy from an invented personal fact. Record potentially harmful or materially misleading content
as an attributable risk flag with the statement, concern and review disposition. An unsupported
medication-safety assurance is not excused by strong coverage/vocabulary scores; structural validity
does not establish clinical safety.

Before paid decision work, freeze the rubric, calibration examples, risk policy and explicit promotion
threshold. New versions may reassess saved evidence but must not overwrite historical findings,
manufacture judgments or count reused output as a new observation. No rubric alone promotes a model.
Keep quality, runtime levels, contract validity, safety review, latency and cost separate. The rubric
adds no runtime scoring/semantic retry and is unrelated to legacy v2 `lineScores`/`featuredPhraseIds`.

## Step outcomes and criteria

Each [endpoint design](../docs/API_DESIGN.md#endpoints) owns its pipeline and exact checkpoint IDs.
Use those IDs in reports: `english.call` is provider execution, `english.decode` is JSON decoding,
`english.normalize` is deterministic shaping, and `english.validate` checks required content.
**A** and **B** identify evaluation lanes, not individual steps or an endpoint's final outcome.

This is the reporting/assessment standard. It does **not** claim that runtime logs or the current
offline CLI already emit every checkpoint. Some checkpoints share one function. Current CLI
`stage.status: passed|failed` and `structuralPass` summarize a combined parser path; they are not
provider outcomes, full endpoint outcomes, or step-level quality verdicts. Reports must explain that
scope rather than treating legacy `FAIL` wording as a failure of all work.

### Success, warning and failure have a scope

| Outcome | Meaning at the named step | Consequence |
|---|---|---|
| **Success** | The step's required output is available and meets that step's criterion. | Continue. A successful provider call proves neither decoding nor content accuracy. |
| **Warning** | The step can supply usable required output, but safely ignores/normalizes surplus data, recovers a feature, loses optional enrichment, or exposes a quality concern. | Continue; show the exact transformation, lost feature or concern. Do not spend another model call merely to silence the warning. |
| **Failure** | Required output is missing, unsafe, ambiguous to recover, or violates a non-recoverable requirement. | Stop the dependent path or apply only the existing approved recovery policy. Identify whether this is one attempt, one topic, the endpoint, or a client operation. |

`blocked`, `cancelled`, `not run` and `not assessed` describe execution/assessment coverage, not
additional success/warning/failure grades. If A supplies no valid English, its dependent translation
is **blocked**, not a second independent translation failure. A skipped optional reviewer is **not
run**, not failed. Missing measurements and grades remain null.

Keep three scopes separate:

1. **Attempt/step:** a particular provider or validation attempt may fail.
2. **Endpoint:** existing bounded recovery may still produce complete usable output. That is success
   with a recovery warning (`failureLevel = 1` where implemented), not an erased attempt failure.
   Exhausted required work is endpoint failure (`failureLevel = 2` where implemented).
3. **Client operation:** title or cover failure can leave phrasebook creation usable with a fallback
   or missing illustration. That is degradation of creation, not failure of the text endpoint.

For an unrecovered HTTP 400, report **request rejected**; do not blame a model that was never called.
Keep cancellation separate from invalid output. Do not sum several step warnings/errors into several
failed requests. Final request counts use final endpoint outcomes and explicit denominators.

### Criteria for each documented step

Each endpoint checkpoint uses a suffix below; apply its criterion to the named endpoint, topic and
attempt. Endpoint designs own exact bounds and supported recovery; these generic criteria do not
add recovery capabilities or replace the endpoint's contract.

| Step suffix / kind | Success criterion | Warning criterion | Failure criterion |
|---|---|---|---|
| `.request` — input boundary | Required request fields, bounds and associations are valid. | A documented optional input is defaulted/ignored, such as invalid optional ability; ordinary specified trimming is not itself degradation. | Missing/invalid required input, prohibited client controls, unsafe source or ambiguous association; reject before calls. |
| `.prompt` — trusted request construction | Correct task/context, trusted instructions, server settings and supported output contract reach the provider boundary. | A known adapter capability difference is disclosed without changing required meaning/contract. | Wrong topic/source, untrusted data substituted into trusted instructions, invalid configuration or unsupported required schema; do not dispatch an invalid request. |
| `.call` — provider execution | A response arrives within the active deadline with required transport/provider completion. | An existing bounded retry recovers; retain failed-attempt details. Missing reported cost is unknown accounting, not automatically generation failure. | Provider/transport error, deadline or no usable response after allowed recovery. Unknown start/charge is an accounting uncertainty and may stop further paid work under its approval rules. |
| `.decode` — response decoding | Model JSON, inline image envelope or PNG bytes decode using that endpoint's supported representation. | A supported representation is safely unwrapped/converted; report recovery when it is diagnostic. | Undecodable JSON/image or unsupported required representation; do not guess/repair meaning. Valid JSON with an extra field is not a JSON-decoding failure. |
| `.normalize` — deterministic shaping | Required meaning and association survive the documented canonicalization. Ordinary trimming or server-owned ID derivation need not be warnings. | Safe ignored authoring metadata, valid list clamping, optional-reading fallback, or another supported recovery; show raw → retained/dropped values. | Required content cannot be shaped safely without guessing, changing its meaning or hiding a required-data defect. |
| `.align` — source association/positioning | Required sections/indexes stay associated with the exact source; span-based steps also require valid ordered UTF-16 spans and meaningful coverage. | A recoverable optional association is discarded before fallback; describe the normalization/enrichment that follows. | Required counts, chunk/source alignment or topic association are missing, ambiguous, out of bounds or inconsistent. |
| `.enrich` — optional relationships/features | Supplied evidence/reading enrichment resolves correctly; absence allowed by the endpoint is also success. | Optional source hints are unresolved, or optional pronunciation needs fallback/omission; keep valid required content. | Required Word/card fields are invalid despite enrichment recovery. Optionality does not excuse missing required readings or unsafe cards. |
| `.validate` — required content/shape | Required fields, counts, speakers, topic/source association and applicable card/wire constraints pass. | The endpoint explicitly supports a recovery and the resulting required object is valid; attribute its transformation to `.normalize`/`.enrich`, not an unexplained validation failure. | Required content remains invalid; e.g. wrong translated counts, missing speaker, or dialogue above its hard bound with no supported recovery. |
| `.join` — dependency barrier | Every required indexed predecessor is available; preserve topic identity, including duplicate titles. | A predecessor recovered and remains usable; carry its warning, do not invent another error. | A required predecessor is unavailable or identity is unsafe; dependent work is blocked. |
| `.assemble` — deterministic result construction | Complete sections, cards, IDs/targets/evidence and usage are assembled without changing association. | Valid optional enrichment is absent or aggregate cost is unknown; preserve flags/null accounting and usable required output. | Required groups/targets are missing, IDs/refs or source association are invalid, or only a partial required result can be constructed. |
| `.respond` — final endpoint delivery | A complete contract-valid response is returned with actual known usage. | Return usable output after documented recovery, preserving warnings in existing flags/logs; do not invent a new wire field. | Required validation/delivery fails or the operation exhausts its deadline; return a controlled error. A disconnected caller is separately labelled cancelled, not a content failure. |
| `.quality` — evaluation-only review | The reviewed content supports the task/fidelity criterion with no supported concern in the assessed scope. | Relevant but unfinished/awkward dialogue, an improvement opportunity, applicability question or uncertain linguistic judgment. | A cited, supported violation of the named content criterion, such as 45 becoming 50 or an unrelated response. This is a **content-check finding**, not an automatic endpoint failure or promotion threshold. |

Safety/linguistic severity remains a separate assessment with quoted evidence and reviewer identity.
Do not turn a proposed “material” label, an ordinal score of 2, or a recoverable runtime level of 1 into
an automatic whole-topic/endpoint failure. Strong disputed claims remain unresolved.

### Endpoint contracts and implementation gaps

Use the relevant endpoint's **Pipeline and step outcomes** and **Execution limits and recovery**:
[context](../docs/api/context.md#pipeline-and-step-outcomes),
[title](../docs/api/phrasebook-title.md#pipeline-and-step-outcomes),
[phrasebook](../docs/api/phrasebook.md#pipeline-and-step-outcomes),
[breakdown](../docs/api/phrase-breakdown.md#pipeline-and-step-outcomes), or
[image](../docs/api/phrasebook-image.md#pipeline-and-step-outcomes).
Those references—not a parallel evaluation catalog—own endpoint behavior and current-versus-intended
implementation gaps.

C is an optional evaluation-only detector/repair path, not an endpoint prerequisite. Distinguish
detection, localized repair validation, atomic application and preservation review. Incomplete
detector coverage can block repair without making the original endpoint a failed request.

### Step-aligned report record

For each reported observation, include:

- Endpoint, lane if applicable, situation, earlier/additional response identifier, topic index and
  attempt where known; live call versus saved replay versus hypothetical policy example.
- Exact **step ID**, owner and scope; outcome `success|warning|failure`, or a coverage state such as
  blocked/not assessed; and **current implementation versus intended policy**.
- Expected behavior, exact received value/path, retained/dropped value, recovery taken, and concrete
  consequence for the next step. Preserve enough selected evidence to read without temporary files.
- Final endpoint outcome **only if exercised**, separately from content-check disposition and proposed
  severity. A saved parser replay is not an exercised production endpoint.
- Provider calls, known/unknown charges, latency and tokens separately. Replaying saved data creates
  no new provider observation or spend. Keep original scores/receipts attributable and unchanged.

For a concrete saved-response example, see the dated
[step-aligned outcomes](baseline/log-findings-2026-10-28.md#step-aligned-outcomes-not-a-blanket-ab-verdict)
and raw `alternative` excerpt in that log. Current rejection versus intended ignore-and-warn policy
is owned by the [phrasebook implementation gap](../docs/api/phrasebook.md#known-implementation-gaps).


## Historical evidence

Earlier results are separate from current contracts:
[v3 cutover, evaluation reset and legacy v2 comparisons](history/api-cutover-and-legacy-evaluations.md);
[image smoke and prompt comparisons](history/image-prompt-evaluations.md).
These migrated summaries preserve observations and limitations, not replayable raw captures or new
verification. Current A/B evidence remains in the dated log linked above.

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
- Define observation labels: **earlier response** is saved evidence; **additional response 1/2**
  identifies repeat calls to the same unchanged request. Avoid unexplained “fresh” or “Allergy 2.”
- Show the actual returned value before explaining the concern. For parser changes, distinguish
  raw model output from retained application values. A recoverable warning is not a rejection.
- Relevant dialogue need not reach a prescribed ending. Suggestions to extend or polish an exchange
  are warnings, not failures; demonstrate a concrete contradiction, unrelated reply or misleading
  meaning/role before making a stronger claim. A lost standalone essential is a separate concern.
- Name the source of each result: provider receipt, production parser, assistant reviewer or human
  adjudication. Proposed severity/scores are not automatic acceptance rules.
- Use dated `log-findings-YYYY-MM-DD.md` names for run-specific working findings. Keep selected
  expected/actual excerpts self-contained; an ignored local path plus a hash cannot preserve evidence.

Use the [step outcome criteria](#step-outcomes-and-criteria) and exact
[endpoint checkpoint IDs](../docs/API_DESIGN.md#endpoints). Never use an unqualified “A failed”
when the evidence only shows a required-content check rejected one saved response.



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

The [quality-assessment policy](#learning-quality-assessment) and [`rubric.json`](rubric.json) own
ordinal anchors, dimensions and calibration examples; null means unassessed, never score 0.

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

Use the rubric's missing-allergy, repeated-dance-invitation and reversed-negation calibration examples
to distinguish needed supplementation, ordinary editing and material meaning/safety defects.

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

**Current review boundary:** approval to run an evaluation is not approval to commit its results.
Keep mixed results and reporting edits uncommitted until explicitly asked to commit. Existing commits
are not permission for further commits; do not reset/rewrite them without direction. Dated findings
logs are observations, not permanent acceptance decisions. Where historical JSON records already
exist, preserve their original judgments and identify later interpretation changes separately.
The dated A/B log inventories reusable guidance, historical records and temporary local artifacts.


## Ordered next gates

1. Cleanup and BRIEF verification — separate committed checkpoint.
2. Offline pipelines/fixtures/rubric/skill and actual CLI proof — separate committed checkpoint.
3. Diagnostic calibration checkpoint — user approved the exact 29-attempt/$0.40 package; all calls
   completed and concise findings are in `calibration/`. A subsequent approved 12-call C recalibration
   observed better attribution/severity agreement but four remaining incomplete defect reviews under
   proposed rubric 1.2. C is now optional and deferred; those unresolved questions do not gate A/B.
   Calibration is not candidate ranking or unseen reliability evidence.
4. **Next: review the collected limited A/B evidence, not collect it again.**
   The approved twenty additional calls completed; see
   [`baseline/log-findings-2026-10-28.md`](baseline/log-findings-2026-10-28.md).
   One earlier plus two additional responses per case give three total. Technical rejections,
   recoverable warnings and proposed quality concerns remain distinct. No accepted portable baseline,
   broad reliability claim, additional spending or Git commit follows automatically.
5. Only after that baseline, compare **models**, **prompts** and **systemic changes** under separate
   controlled studies, A and B independently. C is reconsidered only if explicitly reopened, with
   process review before new experiments. Optional A→B smoke checks are not a fourth quality study.
   Freeze decision criteria and stop rules; no automatic model/prompt promotion or deployment.
