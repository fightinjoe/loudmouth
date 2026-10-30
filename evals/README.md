# Content-quality evaluation

**Goal: fast, reliable, trustworthy initial content.**
[Current strategy](../docs/designs/phrasebook-quality-identity-storage-plan.md) ·
[Proposed rubric](rubric.json) · [Subjective-review skill](../.agents/skills/content-quality-evaluation/SKILL.md)

Current adapters and authored fixtures use **v4 four-section phrasebooks**: Things to say, Likely
exchanges with explicit response options, titled Word families and a linear Example conversation.
Translation uses flat phrase/Word arrays; code restores nesting. The
[endpoint contract](../docs/api/phrasebook.md) owns bounds, recovery and production behavior.

**No accepted linguistic baseline exists. C is optional and deferred.** Current workflows and fixtures
are reusable development tools, not native-speaker gold labels, model rankings or broad reliability
certification. The completed v4 API/web milestone is not gated on retired experiments. Coordinated
deployment has not been performed, and native iOS is unchanged. Prior local integration results are
recorded in the [endpoint smoke summary](../docs/api/phrasebook.md#local-promotion-smoke), not treated
as a language-quality acceptance seal.

## Independent workflows

| Lane | Controlled input → output | What it measures |
|---|---|---|
| `a` — English | Canonical learner request → four-section English topic | Structure plus independently reviewed usefulness and intent coverage |
| `b` — translation | Fixed authored English and canonical context → target-language topic | Fidelity, readings, dictionary forms/meanings and supporting evidence, independent of candidate A |
| `c` — optional detection/repair | Fixed bilingual topic, controls and injected defects → findings and proposed/applied patches | Attribution, recognition/false alarms, coverage and preservation; known-location repair separately |
| `ab` — optional integration smoke | Canonical request → actual A output → translation | Technical handoff/association, not a fourth linguistic study |

A/B reuse production prompts and parsers. C uses local evaluation contracts, not a production repair
endpoint or selected future architecture. Native `../prompt-romp` is the sole paid dispatch/accounting
engine; these adapters do not call providers. Preparing requests does not authorize paid execution,
model/prompt changes or deployment. Reusing saved replies adds no new provider observation.

## Run offline

From the repository root, using Bun:

```sh
bun evals/pipelines/cli.mjs validate
bun evals/pipelines/cli.mjs run a --mock
bun evals/pipelines/cli.mjs run b --mock
bun evals/pipelines/cli.mjs run c --mock
bun evals/pipelines/cli.mjs run ab --mock
bun evals/pipelines/cli.mjs run c --mock --context shoes-zh --json
bun test evals/pipelines
```

No credentials, network or default output files. Markdown goes to stdout; `--json` emits structured
results. Unknown commands/options/context IDs and invalid inputs fail rather than silently narrowing
coverage. Mock provenance is explicit; provider latency, tokens and cost are **not measured**, not
zero. These workflows prove parser/routing/association behavior, not multilingual correctness.

### Current fixture provenance

- [`fixtures/contexts.json`](fixtures/contexts.json): canonical request registry for `shoes-zh`,
  `allergy-ja`, `tea-cs`, `lost-bag-uk` and `pottery-es`. Each contains the exact singleton-topic
  `/phrasebook` request and ordinary/challenge label; all lanes use these IDs.
- [`fixtures/pipeline-cases.json`](fixtures/pipeline-cases.json): authored v4 English topics, flat
  translations, C controls/defects/unresolved cases, mock replies and expected checks. B freezes this
  English; C derives its bilingual input from the same normalized topic. The structural migration
  uses the first two authored example turns as one exchange and groups existing Words under
  `Topic vocabulary`. Provenance is `authored-structural-v4-migration`; `historicalReplay`,
  `modelGenerated` and `linguisticCertification` are false. This is not newly generated content or
  a fresh review of family quality.
- [`fixtures/regressions.json`](fixtures/regressions.json): six distilled regression lessons,
  including inflected evidence, wrong occurrence selection, ambiguous intent and output-contract
  errors. Selected examples retain provenance/caveats without retaining complete historical runs.

All subjective expectations are assistant-proposed. Exposed development cases are not unseen
holdouts; deliberate challenge frequencies cannot estimate production error prevalence. Meaning,
pronunciation and evidence defects can survive schema validation. Broad topic-bucket families and
paraphrase-like response options remain possible; continuation after every alternative is unvalidated.

## Prepare requests without dispatch

```sh
bun evals/pipelines/cli.mjs prepare a --context shoes-zh
bun evals/pipelines/cli.mjs prepare b --context shoes-zh
bun evals/pipelines/cli.mjs prepare c --context shoes-zh
bun evals/pipelines/cli.mjs calibration --plan
```

A uses the production English prompt. B uses production translation instructions/schema and frozen
English. C exposes detection and separate **known-location repair** requests; the latter measures
oracle-assisted capability, not whether a detector finds those defects. Never feed fixture answers,
mutation descriptions or proposed corrections into detector input.

`calibration --plan` inventories current inputs: five A, five B, twelve C detection and seven
known-location replies. It does not reproduce historical requests, dispatch work or grant execution
approval. [`calibration/README.md`](calibration/README.md) documents reusable native-request preparation
with new bindings and a new ignored destination; no frozen run package is retained.

Programmatic helpers in `pipelines/runner.mjs` prepare without dispatch:
`loadFixtures()` loads the registry; `prepareComposedTranslation(fixtures, contextId, englishResponse)`
builds B from actual A; `createReviewInput(fixtures, contextId, reviewId)` returns the exact C input;
`prepareDetectedRepairs(input, detection)` prepares neutral requests for detected handles.

## Evaluate saved responses

Export selected responses to an ignored local workspace, then validate without redispatching:

```sh
bun evals/pipelines/cli.mjs evaluate a --input evals/.runs/selected.json --context shoes-zh
bun evals/pipelines/cli.mjs evaluate b --input evals/.runs/selected.json --context shoes-zh
bun evals/pipelines/cli.mjs evaluate c --input evals/.runs/selected.json --context shoes-zh --json
bun evals/pipelines/cli.mjs evaluate ab --input evals/.runs/selected.json --context shoes-zh
```

Input is `{ "version": 1, "responses": [...] }`. Rows carry `contextId` and raw JSON values or original
response strings: `english` for A, `translation` for B, both for AB. AB checks translation against
**that row's actual English**, not a substituted fixture. C uses `reviews` rows shaped as
`{id, detection, repairs: [{focus: {handle, field, category}, response}]}` for every selected C case.
Never replace a missing saved response with a mock. Exports are disposable inputs, not a second ledger.

## Learning-quality assessment

[`rubric.json`](rubric.json) owns the proposed 0–4 ordinal scale, dimensions and examples. Score
coverage, correctness/contextual fit, vocabulary usefulness and conversation flow separately with
exact citations. **3 needs editing to become good; 2 needs correction or supplementation to accomplish
the task.** Missing assessment is null, never 0. Ordinal scores are not equal numerical distances;
report per-topic findings/distributions, not a mean as proof of quality.

Prioritize meaning/safety and supplied learner facts, useful Things to say, meaningful options and
reusable families. Ordinary repetition or a relevant unfinished conversation is not automatically a
failure. Distinguish illustrative language from invented learner facts. An unsupported safety
assurance is not excused by good coverage scores. Assess pronunciation against written text and
intended meaning; malformed rendering data and linguistic defects are different findings.

For future comparisons, freeze inputs, configuration, rubric and decision criteria. Keep source
English defects distinct from translation defects. Cite actual expected/received text and identify
provider receipts, parser outcomes and assistant/human judgments separately. Material linguistic
disagreement stays unresolved pending qualified adjudication. A generator cannot certify its output.

## Step outcomes and criteria

Each [endpoint design](../docs/API_DESIGN.md#endpoints) owns its logical checkpoint IDs, bounds and
recovery. A/B name evaluation lanes, not individual steps or final endpoint outcomes. Some checkpoints
share a function; these guidelines do not claim runtime logs or the offline CLI emit every step.
CLI `stage.status: passed|failed` and `structuralPass` summarize combined parser paths, not provider
outcomes, complete endpoint outcomes or linguistic verdicts.

| Outcome | Meaning at the named step and scope |
|---|---|
| **Success** | Required output is available and meets that step's criterion. Provider completion proves neither parsing nor accuracy. |
| **Warning** | Usable required output survives supported normalization/recovery, optional enrichment is lost, or a quality concern remains. State the exact transformation/consequence; do not add a call merely to silence it. |
| **Failure** | Required output is missing, unsafe, ambiguous to recover or violates a non-recoverable requirement. Stop dependent work or use only existing recovery. |

`blocked`, `cancelled`, `not run` and `not assessed` are coverage states, not extra grades. Invalid A
blocks dependent B; it is not a second independent translation failure. A skipped optional reviewer
is not failed. Preserve missing measurements as null.

Keep **attempt**, **endpoint** and **client-operation** scopes separate. A failed attempt can recover
to endpoint success with a warning (`failureLevel = 1` where implemented); exhausted required work
is endpoint failure (`failureLevel = 2` where implemented). A title/cover failure can degrade creation
without failing its text endpoint. HTTP 400 means request rejected before model work; cancellation is
not invalid content. Count final requests once, with explicit denominators.

| Step suffix / kind | Success criterion | Warning or failure boundary |
|---|---|---|
| `.request` | Required input, bounds and associations valid | Documented optional defaults may be accepted; invalid required data/client controls reject before calls. Ordinary trimming is not degradation. |
| `.prompt` | Trusted task/context, settings and output contract reach the provider boundary | Disclose supported adapter differences; wrong source, unsafe instruction substitution or invalid configuration must not dispatch. |
| `.call` | Response completes within transport/deadline requirements | Preserve failed attempts if existing retry recovers. Exhausted transport/provider failure fails the step; unknown cost is accounting uncertainty. |
| `.decode` | Supported JSON/image representation decodes | Supported unwrapping may recover; undecodable/unsupported required data fails. An extra JSON key is not a syntax error. |
| `.normalize` | Documented shaping preserves required meaning/association | Cite ignored/clamped data or optional fallback; do not guess missing meaning or hide required defects. Ordinary ID derivation is not a warning. |
| `.align` | Required counts/indexes/source association and UTF-16 spans are valid | Optional association can be discarded only under documented recovery; ambiguous required alignment fails. |
| `.enrich` | Supplied evidence/readings resolve; permitted absence is also success | Optional hints may be omitted with warning; missing required readings or unsafe card fields remain failures. |
| `.validate` | Required content, bounds, speakers and wire/card constraints pass | Attribute supported recovery to normalization/enrichment. Remaining invalid required content fails. |
| `.join` | Every required indexed predecessor is available with topic identity intact | Carry recovery warnings; unavailable/ambiguous predecessors block dependent work. |
| `.assemble` | Complete sections, IDs, evidence and usage preserve association | Missing optional enrichment/unknown cost may remain; missing required groups/refs or partial output fails. |
| `.respond` | Complete contract-valid response delivered with known usage | Preserve existing flags/logs after recovery; exhausted required work returns controlled error. Disconnection is cancellation. |
| `.quality` | Reviewed content supports the named task/fidelity criterion | Awkwardness or uncertain judgment is a warning; a cited contradiction/wrong meaning is a content-check failure, not automatic endpoint failure. |

For each finding name endpoint/lane, context, topic and attempt where known; live call versus replay
versus hypothetical example; exact step ID and scope; expected/received/retained values; recovery and
consequence; reviewer authority and uncertainty. Report final endpoint outcome only if exercised.
A saved parser replay is not a live endpoint. Safety/linguistic severity is separate from runtime
levels; a proposed score or “material” label is not an automatic whole-topic rejection threshold.

## C detection and repair contracts

C remains evaluation-only. `pipelines/review-contract.mjs` owns allowlisted input, detection validation
and localized patches; `review-composition.mjs` and `repair-application.mjs` own routing and atomic
application. `pipelines/contracts/*.schema.json` supplies detection/localized-repair schemas.

- `complete` declares whole-topic review coverage, not correctness. `true` may accompany findings or
  uncertainty; `false` blocks all corrections even when a finding is accurate. The declaration is
  not independent proof of review quality.
- `findings` attributes alleged defects by `handle`, `field`, `category`, `severity`, `origin` and
  `reason`. `e:0` identifies the first Things to say phrase; `d:2` the third example line; `v:0` the
  first Word in family/item order; `x:0:1:0` the first response in the first exchange's second turn.
- Detector `unresolved` records specific uncertain items to leave unchanged, not every unfixed defect.
  Correction `unresolvedHandles` records routing/application blocks; incomplete review blocks all
  handles even with an empty detector uncertainty list.
- Reports separate `exactMatches`, `unmatchedExpectations` and `unmatchedPredictions`.
  `attributionCandidates` exposes same-handle field/category/severity differences for review, not
  automatic semantic matches; `semanticRecognition` remains null.
- Known-location repair, detector-gated application and counterfactual reuse of saved patches are
  different measurements. Correct-control restraint needs an actual repair response. Rejected patches
  preserve originals but receive no fix credit; unchanged uncertain wording is not an invented miss.
- English intent and immutable source snapshots must survive patches. `reason` explains the repair,
  not learner teaching; displayed meaning is `card.translation`, meaning identity is `card.senseKey`,
  and lexical evidence is an exact `sources[].snapshot`/UTF-16 span, not merely a related word.

## Source and data boundary

`pipelines/production.mjs` and `topic-conversion.mjs` adapt current production contracts. Phrase order
is Things to say, exchange/turn/option, then example; Words flatten in family/item order. Source hints
use `phraseIndex`. Review conversion retains exchange titles, turn/response indexes, speaker and
family title so nested topics can be reconstructed.

Keep reusable source/contracts/tests, small authored fixtures, rubrics and selected regression lessons.
Historical raw responses, run reports, approvals, receipts and experiment snapshots are deleted, not
archived or replayable. Old execution approvals cannot authorize reruns. Future payloads stay ephemeral
in ignored `.prompt-romp/` or `evals/.runs/`; adapters do not default to raw capture. Do not commit whole
runs or append experiment diaries. A selected reviewed regression is a fixture, not a copied run.
