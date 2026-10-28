# Phrasebook quality, identity, storage, and client convergence

Current plan: 2026-10-28. **A/B/C workflows and optional A→B integration checks are implemented.**
The separately approved diagnostic calibration completed 29 calls for $0.034841798 reported spend;
[reviewed findings](../../evals/calibration/findings.md) separate parser failures, content quality,
detector protocol failures and oracle-assisted repair. A subsequent detection-only C study completed
12 calls for $0.0132374; [its current status](../../evals/calibration/c-recalibration-findings.md#status-deferred-optional-investigation)
is recorded without resolving its coverage blocker. **C is optional and deferred by user decision.
The next checkpoint is a confident A/B baseline, not further C reconciliation.** These small
assistant-reviewed samples are not linguistic acceptance, model ranking or authorization for further
inference or production changes. Tooling and review entrypoint: [`evals/README.md`](../../evals/README.md).
Normative contracts remain [`API_DESIGN.md`](../API_DESIGN.md) and
[`CARD_SCHEMA.md`](../CARD_SCHEMA.md); this plan does not change them.

## Goal and priorities

Produce **fast, reliable, trustworthy initial content**, not a mandatory repair architecture:

- **Fast:** time to the first usable phrasebook, including the learner-visible wait and its distribution.
- **Reliable:** complete, structurally valid, correctly associated content; report retries, failures and
  degraded outcomes, not just successful model replies.
- **Trustworthy:** faithful meaning and learner intent, usable teaching, correct pronunciation/readings,
  and no harmful learner-facing changes. Schema validity alone cannot establish these properties.

Creation speed remains critical; do not add a required serial quality call before first use.
For A, useful independent essentials are the highest content priority, followed by useful vocabulary;
dialogue coherence matters but ordinary awkwardness/repetition is lower impact than missing essentials.
Material meaning errors and safety risks are separate findings, never averaged away as stylistic issues.
No fixed overall quality percentage is established. Keep latency, quality, reliability and cost visible.

**A and B are the primary quality work.** Establish their baseline before changing models or prompts.
C is a nice-to-have investigation, not an A/B acceptance gate, required serial stage or prerequisite
for pipeline progress. Its current findings and implementation remain available; no C redesign,
reconciliation or additional inference is the next task.

Workstream order is **R1 quality → R2 identity/schema → R3 storage**. Independent iOS/web convergence
can start its inventory now, but implementation consumes approved contracts rather than guessing them.

## Current implementation, not deployed verification

- `/context` gathers preparation context; `/phrasebook` generates English per topic with at most four
  concurrent calls, waits for all English, then translates complete topics in parallel and validates
  the assembled response. There is no `/repair` endpoint or runtime translation-repair stage.
- Checked-in defaults in [`api/src/llm-config.js`](../../api/src/llm-config.js) are
  `PHRASEBOOK_GENERATION_BACKEND=deepseek-v4.1-flash` (DeepSeek V4.1 Flash) and
  `LLM_BACKEND=gemini-3.5-flash-lite` (Gemini 3.5 Flash Lite). DeepSeek's adapter requests Relace only,
  without reasoning or provider fallback. Environment overrides and deployed revision are unverified;
  these code defaults are not proof of deployed behavior or current provider availability.
- Five languages: Japanese, Chinese, Spanish, Czech and Ukrainian. The API is stateless; the web
  library uses seven IndexedDB tables, content/breakdown exchange v2 and phrasebook/backup v3.
  Existing canonical identity, exact cross-topic placement deduplication, memberships/stars and
  historical evidence remain as specified in CARD_SCHEMA. Related words and dialogue are not deduped.
- Repair is optional. If eventually selected, the provisional background target is validated patches
  applied within 60 seconds of first display, including orchestration and client application—not a
  measured guarantee or a reason to postpone usable initial content. Triggering/persistence are undecided.

## Next checkpoint: reviewed A/B baseline

**RECAP:** A and B already have offline workflows and five live diagnostic observations each, one per
canonical context. A passed the production parser in 4/5 cases; B passed in 5/5 but contained observed
meaning, pronunciation and supporting-evidence problems. This is starting evidence, not yet a
confident comparative baseline. See the [diagnostic findings](../../evals/calibration/findings.md).

**GOAL:** Establish a reproducible, independently assessed reference for **current** English generation
and translation, so future models and prompts can be compared fairly. A baseline can contain known
failures; confidence means its configuration, coverage, variability and limitations are understood,
not that its content is error-free.

| Baseline requirement | Evidence to establish before comparison |
|---|---|
| Frozen configuration | Record prompt bytes/hashes, model/resolved identity where available, provider/transport, settings and parser/schema revision separately for A and B. Disclose differences from production; do not silently improve the baseline first. |
| Fixed, reviewed inputs | Use shared canonical learner contexts for A and exact frozen English for B. Review ordinary/challenge, language/script and learner-level coverage; separate development regressions from comparison cases. Exposed cases are not unseen holdouts. |
| Independent assessment | Reuse the existing cited A/B reviews as starting evidence. Review expected behavior and the rubric before new collection; keep material meaning/safety problems distinct from minor phrasing. Preserve unresolved language judgments and reviewer qualifications. |
| Variability and limits | Agree repetitions and report counts/distributions and uncertainty by lane and language. Five single observations cannot establish reliability or tail latency. Do not invent a confidence percentage or average away material risks. |
| Comparable results | Record per-topic quality dimensions and exact findings separately from parser/runtime failures, latency, tokens and cost. Missing assessment stays null. Retain known baseline failures rather than filtering them out. |
| Bounded collection | Prepare an A/B-only native request plan for missing evidence, with exact inputs, repetitions, caps and stop rules. New paid calls need explicit approval; existing approvals are consumed. No challenger, production prompt edit or deployment is included. |

First inventory the retained A/B evidence against these requirements, identify gaps, and present the
baseline sample/assessment and exact collection proposal for approval. No C repair success is needed
to complete this checkpoint. Once established, compare models and prompts in separate controlled
studies, one changed variable at a time. Optional A→B smoke checks prove handoff, not a fourth study.

## Four ordered steps and commit gates

1. **Cleanup and establish the checkpoint.** Delete bulky raw responses/logs, native experiment
   histories and duplicated snapshots rather than archiving them in Git. Retain reusable scripts/suites,
   canonical fixtures/rubrics, concise findings/decisions/provenance and selected regression examples.
   Verify BRIEF against implementation, remove dead historical links, then **commit cleanup**.
   This checkpoint does not claim the replacement pipelines already work.
2. **Implement usable independent A/B/C offline workflows.** Supply fixtures, deterministic mocks,
   scripts and subjective-review skills, with one shared discoverable scenario registry. Reuse existing
   assets and contracts. Prove each lane offline; optionally smoke the A→B technical handoff, then **commit**.
   Mock success proves workflow/validation behavior, not model quality or linguistic correctness.
3. **Calibrate only under separate paid approval.** First obtain human approval of the rubric,
   priorities, sample and exact bounded request plan. Use a small sample to check instructions,
   subjective expectations, review disagreements and measurement/reporting usability. Keep material
   linguistic disputes unresolved until qualified adjudication. Record limitations, then **commit**.
4. **Establish the reviewed A/B baseline above, then compare candidates.** Freeze task-specific
   configurations, representative inputs, repetitions, decision criteria and stop rules; obtain fresh
   paid approval. Compare A and B separately. C remains deferred unless explicitly reopened; only then
   assess its incremental benefit against unchanged input. Optional A→B is an integration smoke check,
   not a fourth paid quality study. Commit concise findings and selected regressions; no automatic
   prompt/model promotion or deployment.

No live provider/catalog checks are needed for cleanup/offline implementation. Historical approvals,
unused slots or budgets do not authorize new calls, retries or resuming stopped experiments.
Production prompt `*.txt` changes require explicit approval and representative before/after evidence
covering behavior, latency and tokens. API/card migrations and deployment require separate decisions.

## Three evaluation lanes, shared contexts

| Lane | Controlled input → output | Main questions |
|---|---|---|
| **A — English generation** | Canonical situation, learner facts/level and selected topics → English essentials, vocabulary, two-sided dialogue | Useful essentials? Relevant words? Intent/level fidelity? Usable dialogue? Completeness and time to use? |
| **B — Translation** | Frozen English topics (authored controls or outputs collected from A) and original context → target-language content/readings/associations | Faithful meaning, natural register, dictionary form, POS/meaning, pronunciation and truthful evidence? |
| **C — Detection and optional repair** | Frozen bilingual topics with reviewed defects and correct controls → findings; separately proposed corrections | Detection/localization/false alarms? Known-location repair? New harm or evidence loss? Net whole-topic benefit? |

These are independent evaluation workflows, not three required runtime calls. Detection and localized
repair must be measurable separately. Current C helpers/contracts live alongside the pipelines and
define an evaluation control, not a selected production protocol. A one-pass reviewer remains a possible
comparison, but no unused implementation is retained in anticipation of it.
The native `../prompt-romp` tool remains the sole paid execution/accounting engine. Repo scripts are
thin offline preparation/validation/review adapters, not a second runner, ledger or resume system.
Pronunciation is an explicit quality priority. Wrong ruby/readings or romanization are findings graded
by learner impact, not automatic whole-topic failures. Malformed, unrenderable data remains a separate
technical failure; no production validation changes are implied.

The registry must make scenarios discoverable by situation, language/level and coverage, and retain
one canonical initial context (`seed`, `language`, `ability`, `answers`, ordered `checklist`, from the
`/phrasebook` request). A, B and C reference it rather than maintaining divergent copies. Freeze reviewed
English for B comparisons; link C topics to their English/context provenance. Include correct controls,
representative ordinary use and explicit challenges; exposed regression cases are not unseen holdouts.
Keep examples and findings concise; raw runtime observations stay outside Git.

Subjective-review skills should guide agents to propose task-specific expectations, cite exact input
and output locations, separate material failures from preferences, and preserve uncertainty. Humans
approve the rubric, relative priorities and calibration sample. Independent assessment is required even
without runtime review; a generating candidate must not certify its own output. Assistant agreement
is not linguistic certification, and disputed material language judgments remain unresolved.

Report absolute counts/denominators by language and defect category. Separate provider/protocol,
application, source-generation, translation, detection and repair failures; distinguish proposed edits
from actually applied valid output. For C report misses, false alarms, fixed defects, introduced harm,
correct-control preservation and evidence retention. Show stage and end-to-end latency/failures/cost;
component success does not prove composed-topic success or production prevalence.

### Terms grounded in the current schema

- **Gloss:** displayed equivalent, `card.translation` (for example, “eat”); not `card.senseKey`.
  A Word's **meaning identifier**, such as `consume-food`, is stored in the existing `card.senseKey` field.
- **POS:** `card.partOfSpeech`, the target expression's part of speech, not the English label's grammar.
  Language-aware counter/classifier proposals are evaluation questions, not new production enum values.
- **Evidence:** a Word candidate's `sources[]` or a Chunk's `card.source`, with an exact historical
  `snapshot` and UTF-16 `span`. `食べる` can have the encountered `食べません` as evidence; a merely
  related word cannot. `card.reading` annotates written text; `card.romanization` is separate.
- **Reason:** an evaluation repair proposal's explanation of an edit/source removal, not learner
  teaching in `card.notes`, and not a new Card field. Unchanged entries need no invented explanation.
  The tooling README documents concrete fixture/proposal paths and representative review examples.

## Selected historical lessons, not model rankings

- Historical translation review found meaning/negation, referent, spelling, reading, dictionary-meaning
  and false-evidence problems despite valid output. Reviews were assistant-authored, not native/human
  certification, and the selected cases do not estimate production error rates.
- Localized repair could succeed while detector-gated whole topics still missed defects. A one-pass
  reviewer passed one small authored screen; that does not establish naturalistic reliability, safety,
  deployment latency or production economics. Reassess on canonical representative inputs.
- Source-occurrence guidance helped in focused screens but did not clear every broader gate. Later
  Chinese cup/counter diagnostics still proposed rewriting defensible noun evidence; one invalid reply
  preserved originals only through atomic rejection. Better effective preservation was not better
  linguistic judgment. Tone/register/intent disputes remain qualified-review questions.
- Structured-output rejection, JSON parsing, strict application validity and semantic correctness are
  distinct. Historical schema-mode failures did not establish the exact rejected schema feature.
  Rejecting an unusable proposal is not a credited fix; do not hide failures through output cleanup.

Selected regression fixtures retain concise origin/configuration/review caveats. Historical screens
support failure hypotheses, not rejection of a model family or automatic resumption of old work.

## R2, R3 and the independent iOS track

**R2 — identity/schema:** distinguish record identity, revision equality, semantic equivalence,
similarity and placement deduplication. Use labeled same/related/distinct/uncertain examples (`allergy`
vs `allergic`, negation, doses, meanings and inflections). Evaluate exact rules and embeddings for candidate
retrieval; proximity is not equality or authority to merge. Decide sharing, repair propagation, stars,
saved teaching, historical evidence and migration with concrete examples before changing contracts.

**R3 — storage:** after R2, rank caching, durable repair, portability and synchronization needs. Compare
local export/import, narrowly scoped server state and synchronized libraries; remaining stateless is
valid. Specify ownership, privacy, retention/deletion, offline behavior and operational cost before
choosing a database, queue, vector service or accounts. No user-data migration/deletion is implied.

**Independent iOS/web convergence:** inventory endpoint/schema, creation, evidence, stars/review and
backup drift; establish versioned shared conformance fixtures and repeatable catch-up slices. Native
legacy generation/flat-card assumptions need inspection, not a web-parity claim. Preserve intentional
UX differences; require explicit migration/release ordering and actual client smoke evidence.
Jev value scoring remains separate; its agreed direction is alongside translation without delaying use.
