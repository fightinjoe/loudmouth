---
name: api-design
description: >
  Catchphrase API architecture, shared conventions, trust boundaries, and endpoint directory.
  Load the relevant docs/api/<endpoint>.md for its contract, pipeline, limits, and recovery policy.
status: CURRENT
---

# Catchphrase API design

The API is a stateless Cloud Run service. Clients own phrasebook storage and creation state.
This document owns **shared rules and navigation**; each endpoint design owns its complete contract.
For endpoint-only work, load that endpoint's document rather than every API/evaluation reference.

## Endpoints

All routes accept `POST` JSON and return complete JSON responses, not streaming or partial required results.

| Endpoint | Responsibility | Contract, pipeline and step outcomes |
|---|---|---|
| `/context` | Clarifying questions, suggested conversations and seed-based image prompt | [Context](api/context.md) |
| `/phrasebook-title` | Independent English UI naming | [Title](api/phrasebook-title.md) |
| `/phrasebook` | Per-topic English generation and parallel translation | [Phrasebook](api/phrasebook.md) |
| `/phrase-breakdown` | Exact-source contextual teaching and Word/Chunk targets | [Breakdown](api/phrase-breakdown.md) |
| `/phrasebook-image` | Independent, nonblocking PNG cover generation | [Image](api/phrasebook-image.md) |

Guided creation calls `/context`, collects answers, then speculatively calls `/phrasebook` for all
suggested topics while the learner chooses which to keep. Naming runs independently; context
completion starts cover generation. Breakdown is on demand, outside creation. Detailed client
states, cancellation, fallback and saving belong to [interaction design](DESIGN.md#guided-creation)
and [card lifecycle](CARD_SCHEMA.md#atomic-lifecycle), not endpoint execution.

## Shared contract conventions

- Supported languages: `zh`, `ja`, `es`, `cs`, `uk` (native Ukrainian Cyrillic).
- Phrasebook responses/library backups use v4; common card/breakdown exchange remains v2.
  Topics contain Things to say, Likely exchanges with explicit response options, titled Word families,
  and a linear Example conversation. Translation uses flat phrase/Word arrays; code restores nesting.
  Cards and readings follow [CARD_SCHEMA](CARD_SCHEMA.md) and the executable shared validator
  in `api/src/schema/index.ts`. Server draft UUIDs are remapped at local commit; cards contain no storage metadata.
- Clients cannot choose a model. English generation uses `PHRASEBOOK_GENERATION_BACKEND`;
  other text work uses `LLM_BACKEND`. Image routing is fixed. Invalid configuration fails startup.
  [Backend values, configuration and deployment](../api/README.md#server-owned-model-selection) belong to the operations reference.
- The router allows CORS origin `*`, methods `POST, OPTIONS`, and header `Content-Type`.
  `OPTIONS` returns 204 before dispatch; other non-POST methods return 405; unknown POST paths return 404.
- Invalid required input returns 400 before provider work. Provider/deadline failure or unusable
  required output returns controlled 502 under the endpoint's recovery policy; unexpected
  configuration/programming failures may return 500. Limits, retries and disconnect handling are endpoint-specific.
- Text usage reports actual reply model IDs/tokens. Costs prefer finite nonnegative reported
  charges, then configured estimates; any unknown component makes aggregate `costUsd` null.
  Durations are rounded wall-clock milliseconds, not sums of overlapping calls. Image usage has its own one-stage contract.

## Prompt, code and schema ownership

Prompts own the smallest useful semantic task, not deterministic formatting, bookkeeping or repair.
Prompt `*.txt` edits require explicit approval and before/after behavior, latency and token evaluations.
Code owns request validation, decoding, deterministic shaping, optional relationships and final wire validity.

Keep **raw model authoring**, **provider output constraints**, **normalized internal data** and the
**final API wire schema** distinct. A provider schema does not certify semantics. Normalization should
preserve usable required content when recovery is unambiguous; safely disposable authoring metadata
should warn rather than cause rejection or another call. Required missing/unsafe/ambiguous content
must not be guessed. Endpoint documents explicitly distinguish implemented recovery from intended policy.
Validators do not establish translation accuracy, intent, register, phonetic correctness or teaching quality.

## Runtime failure levels

`failureLevel` describes the named operation, independently of learning quality:

| Level | Meaning | Outcome |
|---:|---|---|
| 0 | No operational degradation/recovery | Complete valid result. |
| 1 | Recoverable or degraded feature | Usable result succeeds; preserve diagnostics. Do not retry merely to silence optional-content warnings. |
| 2 | Required operation cannot complete safely | Controlled error after existing bounded recovery; never fabricated/partial required content or a process crash. |

Levels are structured diagnostics, not new fields in strict response envelopes. Logging coverage and
recovery are endpoint-specific. Keep failed attempts, final endpoint outcomes and client fallback
separate: failed naming can coexist with successful creation using the seed. Count final request
outcomes, not log lines. Logical checkpoint IDs in endpoint tables are reporting names, not extra
functions, calls or independently emitted events. Assessment and reporting conventions live in
[evals/README.md](../evals/README.md#step-outcomes-and-criteria).

## Trust boundaries and deferred work

The public contract accepts bounded free text; answers/topics do not prove a prior `/context` call.
There are no required server-issued selections, signed setup state or server sessions.
All request text and model intermediates are untrusted. Builders separate server-owned `instructions`
from JSON-serialized task `input`: Gemini `systemInstruction`, Anthropic `system`, OpenAI `developer`;
task data is user content. Only server-owned language rules/examples compose trusted instructions.
Translation must translate source data, not obey it; legitimate imperative teaching content remains supported without a keyword blacklist.

Role separation is defense in depth, not confidentiality. Prompts may be extracted; credentials stay
in provider authentication, never messages. Models have no configured file/secret/user-data tools.
Clients render user/model/persisted strings as text; web escapes text and quoted attributes at sinks,
including independent ruby base/annotation escaping. Storage is not pre-escaped. Native text views
are not HTML; future rich text, links or action integrations need explicit boundaries.

Adversarial evaluations distinguish synthetic-canary leakage, invalid output and provider failure;
no detected leakage is not proof of confidentiality. Deterministic boundary/rendering checks and
commands belong to [API operations](../api/README.md#tests-and-model-evals).
Gateway admission, anonymous quotas, global concurrency/spend controls and attestation remain deferred;
verify gateway/backend exposure before public release. An iOS-only launch does not make the API private.
Static preset packs/removal of repair-style topics remain deferred; do not remove repair topics before replacements exist.

## Status and reference ownership

The v4 four-section promotion updates API and web code only, with no deployment. A future API/gateway/web
release must be coordinated; native iOS's retired-route integration is intentionally unchanged.
Prior local integration evidence is recorded with the
[phrasebook endpoint](api/phrasebook.md#local-promotion-smoke). It establishes neither an accepted
linguistic baseline nor broad reliability or deployed behavior.
Current endpoint limitations belong with their endpoint, including the low-priority, unvalidated
semantic continuation warning, not in a second global behavior catalog.

- [API operations](../api/README.md): configuration, implementation map, local development, tests and deployment.
- [Evaluation guidance](../evals/README.md) and [rubric](../evals/rubric.json): current workflows, scoped reporting and quality assessment.
- [Product brief](BRIEF.md): goals, scope and deferred product work.
- [Interaction design](DESIGN.md) and [journeys](journeys.md): client flows and state.
- [Card schema](CARD_SCHEMA.md): shared card contracts, identity, evidence and persistence.
