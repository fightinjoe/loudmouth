# Phrasebook quality, identity, storage, and client convergence

## Current milestone

The **v4 four-section API/web promotion is implemented**. Topics contain Things to say, Likely
exchanges with explicit response options, titled Word families, and a linear Example conversation.
Translation receives flat phrase/Word arrays; code restores their section, turn and family structure.
There are no value scores, featured selections or inferred alternatives.

The web opens a fresh seven-table `loudmouth-topic-v4` library. Old v3 databases and preferences
remain untouched; there is no v3 phrasebook import, migration or restore path. Common card and
breakdown exchange remain v2; phrasebook responses and full-library backups are v4.
**Coordinated API/gateway/web deployment has not been performed.** Native iOS's retired-route
integration is unchanged; implementation is not a client-parity or deployed-behavior claim.

Prior local promotion verification recorded **130 API, 241 web and 51 evaluation-adapter tests**,
shared-schema compilation, web typecheck/build, five-context mock A/B execution and gateway checks.
Two real default-provider requests returned **HTTP 200/schema v4**, for Czech café ordering and
Chinese shoe shopping. Chromium inspection exercised the Czech response at desktop/mobile widths,
saving, starring, reload and seven-table backup/restore. These are prior observed integration results,
not new cleanup executions or broad linguistic certification. Details and scoped limits live in the
[phrasebook endpoint](../api/phrasebook.md#local-promotion-smoke).

Historical experiment data and diaries are deleted rather than archived. The current milestone is
**not gated on obsolete collections, approvals, commit steps or C repair experiments**. Reusable
fixtures, offline workflows, contracts and regression lessons remain; they are not an accepted
linguistic baseline. See [evaluation guidance](../../evals/README.md), [API contracts](../API_DESIGN.md)
and [card/library contracts](../CARD_SCHEMA.md).

## Goal and priorities

Produce **fast, reliable, trustworthy initial content**, not a mandatory repair architecture:

- **Fast:** time to first usable content, including the learner-visible wait and its distribution.
- **Reliable:** complete, structurally valid, correctly associated output; disclose retries, failures
  and degraded outcomes rather than reporting only successful provider replies.
- **Trustworthy:** faithful meaning and learner intent, useful teaching, correct pronunciation and
  truthful supporting evidence. Schema validity alone establishes none of these semantic properties.

Useful independent Things to say, differentiated exchange choices and reusable Word families have
higher priority than ordinary example-conversation repetition or an unfinished but relevant exchange.
Material meaning/safety problems require separate, cited findings; do not average them away with style
scores. No overall quality percentage or broad reliability target has been established.

**A and B are the primary quality work. C is optional and deferred.** Detection/repair is neither an
acceptance gate nor a required serial stage before usable content. There is no production `/repair`
endpoint. If C is revisited, assess the whole detection → coverage gate → repair → atomic application
process: recognizing a defect does not guarantee review completion or a safe applied correction.
Known-location repair is oracle-assisted capability measurement, not detector success.

## Current implementation and quality limits

- `/context` gathers preparation context. `/phrasebook` generates English per topic with at most four
  concurrent calls, waits for all English, then translates complete topics in parallel and validates
  the assembled response. Exact bounds and recovery belong to the endpoint contract.
- Checked-in defaults in [`api/src/llm-config.js`](../../api/src/llm-config.js) are
  `PHRASEBOOK_GENERATION_BACKEND=deepseek-v4.1-flash` (Relace only, no reasoning or provider fallback)
  and `LLM_BACKEND=gemini-3.5-flash-lite`. Environment overrides, deployed revision and present provider
  availability are not established by these defaults.
- Japanese, Chinese, Spanish, Czech and Ukrainian share the same library graph. Exact-English Things
  to say is deduplicated only across retained topics; exchange options, example lines and Word-family
  placements remain. Canonical identity, membership stars and immutable source snapshots follow
  CARD_SCHEMA, not a new semantic-equivalence rule.
- Meaning/quantity, pronunciation, dictionary-form and source-evidence errors can survive structural
  validation. Linguistic disputes need qualified review; a rejected unsafe patch is preservation,
  not a credited correction. Inflection can be legitimate evidence for a dictionary-form Word;
  a merely related expression cannot.
- Word families can still become broad topic lists or mix categories; exchange options can be
  paraphrases. Structural validation does not check whether every later turn sensibly follows every
  alternative. That continuation concern is a low-priority quality warning, not a runtime diagnostic
  or reason for a new blocking model call.
- Current fixture expectations and rubric scores are assistant-proposed. Exposed development contexts
  are not unseen holdouts and deliberate defect frequencies do not estimate production prevalence.
  No accepted linguistic baseline, model ranking, tail-latency claim or clinical-safety certification
  follows from the fixtures or the small local smoke.

## Current evaluation workflows

| Lane | Controlled input → output | Purpose |
|---|---|---|
| **A — English generation** | Canonical learner request → four-section English topic | Useful intent coverage, options/families, completeness and contextual fit |
| **B — translation** | Frozen English plus original context → translated topic | Meaning, register, dictionary forms, pronunciation and truthful source evidence |
| **C — optional detection/repair** | Frozen bilingual topic, correct controls and injected defects → findings and separately validated patches | Recognition/false alarms, coverage, repair capability, preservation and introduced harm |
| **A→B — optional integration smoke** | Actual A output → B | Technical handoff and association, not a fourth linguistic study |

The five-context registry supplies one canonical `seed`, `language`, `ability`, `answers` and ordered
`checklist` request per case. B uses authored controls or explicitly frozen A output, never silently
substituted English. C retains its allowlisted evaluation-only patch protocol; it is not a selected
production architecture. Native `../prompt-romp` is the sole paid execution/accounting engine;
repository adapters prepare, validate and report offline without dispatching provider calls.

Future comparisons should freeze configuration, prompt/parser revisions, representative inputs,
repetitions and decision criteria. Assess A and B separately; keep provider/protocol errors, parser
outcomes, content findings, latency, tokens and cost distinct. Missing assessment stays null.
Report exact expected/actual text and attributable reviewer judgments rather than a green aggregate.
A generator cannot certify its own output. New paid studies or production prompt/model changes
require their own explicit scope; old approvals provide no authority to resume work.

## Identity, storage and independent iOS work

These remain separate future decisions, not prerequisites to the completed v4 milestone:

- **Identity/schema:** distinguish record identity, revision equality, semantic equivalence,
  similarity and placement deduplication. Review concrete same/related/distinct/uncertain examples
  before changing sharing, stars, repair propagation or saved source evidence. Retrieval proximity
  is not authority to merge cards.
- **Storage:** choose durability, portability, caching and synchronization requirements before adding
  accounts, a database, queue or vector service. Define ownership, privacy, retention/deletion,
  offline behavior and cost. Remaining stateless is valid; no old user-data deletion is implied.
- **iOS/web convergence:** inventory endpoint/schema, creation, evidence, stars/review and backup
  drift; use shared versioned conformance fixtures and actual client smoke before claiming parity.
  Preserve intentional UX differences and coordinate release ordering. Native legacy generation
  assumptions need inspection rather than an inferred migration path.
