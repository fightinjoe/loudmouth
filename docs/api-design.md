---
kind: spec
status: current
summary: Catchphrase API architecture, endpoint table, shared contract conventions, failure levels, trust boundaries and API protection.
sources: [api/src/index.js, api/src/llm-config.js, api/src/pricing.js, api/src/schema/index.ts, api/config/api-gateway.yaml, api/src/protection/identity.js, api/src/protection/policy.js, api/src/protection/ledger.js, api/src/protection/work.js, api/src/llms/bounds.js]
verified: 2026-11-17
---

# Catchphrase API design

The API is a Cloud Run service. Clients own phrasebook storage and creation state; the only server-held state is the backend admission ledger described under [API protection](#api-protection), which holds no library content. This document owns **shared rules and navigation**; each endpoint design owns its complete contract. For endpoint-only work, load that endpoint's document rather than every API/evaluation reference.

## Endpoints

All routes accept `POST` JSON and return complete JSON responses, not streaming or partial required results.

| Endpoint | Responsibility | Contract, pipeline and step outcomes |
|---|---|---|
| `/context` | Clarifying questions, suggested conversations and seed-based image prompt | [Context](api/context.md) |
| `/phrasebook-title` | Independent English UI naming | [Title](api/phrasebook-title.md) |
| `/phrasebook` | Per-topic English generation and parallel translation | [Phrasebook](api/phrasebook.md) |
| `/phrase-breakdown` | Exact-source contextual teaching and Word/Chunk targets | [Breakdown](api/phrase-breakdown.md) |
| `/phrasebook-image` | Independent, nonblocking PNG cover generation | [Image](api/phrasebook-image.md) |

Guided creation calls `/context`, collects answers, then speculatively calls `/phrasebook` for all suggested topics while the learner chooses which to keep. Naming runs independently; context completion starts cover generation. Breakdown is on demand, outside creation. Detailed client states, cancellation, fallback and saving belong to [interaction design](design.md#guided-creation) and [card lifecycle](card-schema.md#atomic-lifecycle), not endpoint execution.

## Shared contract conventions

- Supported languages: `zh`, `ja`, `es`, `cs`, `uk` (native Ukrainian Cyrillic).
- Phrasebook responses/library backups use v4; common card/breakdown exchange remains v2. Topics contain Things to say, Likely exchanges with explicit response options, titled Word families, and a linear Example conversation. Translation uses flat phrase/Word arrays; code restores nesting. Cards and readings follow the [card schema](card-schema.md) and the executable shared validator in `api/src/schema/index.ts`. Server draft UUIDs are remapped at local commit; cards contain no storage metadata.
- Clients cannot choose a model. English generation uses `PHRASEBOOK_GENERATION_BACKEND`; other text work uses `LLM_BACKEND`. Image routing is fixed. Invalid configuration fails startup. [Backend values, configuration and deployment](api/operations.md#server-owned-model-selection) belong to the operations reference.
- The router allowlists exact browser origins (`CORS_ALLOWED_ORIGINS`) and sets `Vary: Origin`; another origin gets 403, and native requests may omit `Origin`. Allowed methods are `POST, OPTIONS`; allowed headers are `Content-Type, Authorization, X-Firebase-AppCheck`; `Retry-After` is exposed. Unknown paths return 404. On a known path, `OPTIONS` from an approved origin returns 204 without credentials, other non-POST methods return 405, and every `POST` requires identity and app evidence ([API protection](#api-protection)).
- A request body is a JSON object of at most 64 KiB, measured on the framework's raw body bytes: larger bodies return 413, and a non-JSON content type or a content encoding other than identity returns 415. Functions Framework can reject malformed JSON with an HTML 400 before the router runs.
- Protection failures use `{error, code, retryAfterSeconds?}`: identity 401, app or origin 403, caller allowance or concurrency 429, and paused, capacity, budget or admission outage 503. Timed rejections include `Retry-After`. Clients never automatically replay a paid POST.
- Invalid required input returns 400 before provider work. Provider/deadline failure or unusable required output returns controlled 502 under the endpoint's recovery policy; unexpected configuration/programming failures may return 500. Limits, retries and disconnect handling are endpoint-specific.
- Text usage reports actual reply model IDs/tokens. Costs prefer finite nonnegative reported charges, then configured estimates; any unknown component makes aggregate `costUsd` null. Durations are rounded wall-clock milliseconds, not sums of overlapping calls. Image usage has its own one-stage contract.

## Prompt, code and schema ownership

Prompts own the smallest useful semantic task, not deterministic formatting, bookkeeping or repair. Code owns request validation, decoding, deterministic shaping, optional relationships and final wire validity.

Keep **raw model authoring**, **provider output constraints**, **normalized internal data** and the **final API wire schema** distinct. A provider schema does not certify semantics. Normalization should preserve usable required content when recovery is unambiguous; safely disposable authoring metadata should warn rather than cause rejection or another call. Required missing/unsafe/ambiguous content must not be guessed. Endpoint documents explicitly distinguish implemented recovery from intended policy. Validators do not establish translation accuracy, intent, register, phonetic correctness or teaching quality.

## Runtime failure levels

`failureLevel` describes the named operation, independently of learning quality:

| Level | Meaning | Outcome |
|---:|---|---|
| 0 | No operational degradation/recovery | Complete valid result. |
| 1 | Recoverable or degraded feature | Usable result succeeds; preserve diagnostics. Do not retry merely to silence optional-content warnings. |
| 2 | Required operation cannot complete safely | Controlled error after existing bounded recovery; never fabricated/partial required content or a process crash. |

Levels are structured diagnostics, not new fields in strict response envelopes. Logging coverage and recovery are endpoint-specific. Keep failed attempts, final endpoint outcomes and client fallback separate: failed naming can coexist with successful creation using the seed. Count final request outcomes, not log lines. Logical checkpoint IDs in endpoint tables are reporting names, not extra functions, calls or independently emitted events. Assessment and reporting conventions live in [docs/evals/index.md](evals/index.md#step-outcomes-and-criteria).

## Trust boundaries

The public contract accepts bounded free text; answers/topics do not prove a prior `/context` call. There are no required server-issued selections, signed setup state or server sessions. All request text and model intermediates are untrusted. Builders separate server-owned `instructions` from JSON-serialized task `input`: Gemini `systemInstruction`, Anthropic `system`, OpenAI `developer`; task data is user content. Only server-owned language rules/examples compose trusted instructions. Translation must translate source data, not obey it; legitimate imperative teaching content remains supported without a keyword blacklist.

Role separation is defense in depth, not confidentiality. Prompts may be extracted; credentials stay in provider authentication, never messages. Models have no configured file/secret/user-data tools. Clients render user/model/persisted strings as text; web escapes text and quoted attributes at sinks, including independent ruby base/annotation escaping. Storage is not pre-escaped. Native text views are not HTML; future rich text, links or action integrations need explicit boundaries.

Adversarial evaluations distinguish synthetic-canary leakage, invalid output and provider failure; no detected leakage is not proof of confidentiality. Deterministic boundary/rendering checks and commands belong to [API operations](api/operations.md#tests-and-model-evals).

## API protection

Every generation POST passes admission before any provider work: a Firebase anonymous identity, App Check app evidence, and an atomic reservation in a backend-only Firestore ledger, followed by per-request provider-attempt accounting. This is in the repository and not deployed; [production state](api/operations.md#production) and the [deployment procedure](api/operations.md#deployment-reference) are in API operations, and the remaining release work is in [API protection](todo/antsy-aphid/api-protection.md). The reasoning behind the design is in the [decision record](decisions/2026-11-04-api-protection.md).

- **Identity.** The gateway configuration (`api/config/api-gateway.yaml`) validates the Firebase ID token on all five POST routes and exempts only `OPTIONS`. With `PROTECTION_ENV` `staging` or `production` the router trusts the claims the gateway forwards in `X-Apigateway-Api-Userinfo`, which is sound only behind audited Cloud Run invoker IAM: an identity that can invoke the service directly can forge that header. With `development` the router verifies the `Authorization: Bearer` ID token itself (`verifyIdentity` in `api/src/protection/identity.js`). The router accepts no other value; `local`, which skips admission, exists only in the development launcher and cannot run on a deployed service ([local mode](api/operations.md#local-mode)).
- **App evidence.** The API verifies `X-Firebase-AppCheck` with the Firebase Admin SDK and accepts only the app IDs listed in `APP_CHECK_APP_IDS`; project membership alone is not enough.
- **Fail closed.** Missing or unsafe configuration (`loadProtectionConfig`), a missing control document, unverified pricing or a ledger outage returns 503 before provider work. `PRICING_VERIFIED_AT` expires after 30 days; a missing `IMAGE_RESERVE_MICROS` disables image admission only.
- **Admission.** `reserve` in `api/src/protection/ledger.js` checks five limits in one transaction, and a request must pass all of them. Two are shared by every caller and three apply to each UID; the pilot values are `DEFAULT_CONTROL` in that file. The ceilings bound estimated model admission, not the cloud invoice. The reservation and caller weight commit before provider work; retries and invalid paid replies count.

  | Limit (`DEFAULT_CONTROL` field) | Scope | Counts | Rejection |
  |---|---|---|---|
  | `dailyLimitMicros`, `monthlyLimitMicros` | All callers together, per UTC day and calendar month | Dollars: every open reservation plus every settled cost | 503 `GLOBAL_BUDGET` |
  | `globalConcurrency` | All callers together | Requests in flight | 503 `GLOBAL_CAPACITY` |
  | `callerConcurrency` | Each UID | That caller's requests in flight | 429 `CALLER_CONCURRENCY` |
  | `callerDailyWeight` | Each UID, per UTC day | Route weight units, not dollars | 429 `CALLER_QUOTA` |

- **Reserve and weight.** `buildWorkPlan` in `api/src/protection/policy.js` sets each request's weight, attempt limits and dollar reserve. There is no per-caller dollar budget: dollars are tracked only in the shared pool, and per-caller fairness uses weights. A weight is charged at admission and is not refunded when the request fails. The reserve is a worst case, not an expected cost: every admitted attempt is priced at the maximum input (`MAX_INPUT_BYTES`, with each byte counted as a token) plus the route's full output-token cap, then multiplied by a 1.25 margin. `/phrasebook` admits eight attempts per topic on each of the generation and translation backends, which is every validation retry times every rate-limit retry ([limits](api/phrasebook.md#execution-limits-and-recovery)). A request holds its whole reserve against the shared ceilings while it runs, so the reserve, not the real cost, decides how many creations fit at once. The assumptions behind these numbers are under review ([reserve and limit assumptions](todo/antsy-aphid/api-protection.md#reserve-and-limit-assumptions)).
- **Settlement.** A terminal request with complete usage replaces its reserve with the actual cost in the daily and monthly totals. Unknown cost retains the full reserved liability. Unresolved remote work retains capacity even after its lease (`LEASE_MS`); only terminal evidence releases it. A known overshoot records the full charge and pauses admission.
- **Administration** is CLI-only with operator credentials, never a public route ([control and recovery](api/operations.md#control-and-recovery)).
- **Stored data.** The ledger holds quota, reservation and budget state. It stores no prompts, images, tokens or library content, and client Firestore access is denied (`api/firestore.rules`).

### Provider work bounds

Provider SDK transport retries are disabled; the bounded `/phrasebook` application retries remain ([limits](api/phrasebook.md#execution-limits-and-recovery)). Every text adapter bounds serialized provider input, including instructions and schema, to 128 KiB (`MAX_INPUT_BYTES`) and the returned text and metadata to 2 MiB (`MAX_RESPONSE_BYTES`, both in `api/src/llms/bounds.js`). Oversize fails with 502, without truncation or another call. One work scope per request (`runWithWork` in `api/src/protection/work.js`) enforces the admitted attempt and output-token budgets and composes the admission deadline and client disconnect into every handler's signal. Abort is not proof that a provider stopped billing: a local timeout or abort and HTTP 408 or 5xx leave an attempt unresolved, while the explicit rejection statuses in `isTerminalRejection` establish a terminal rejection.

## References

Production deployment state is in [API operations](api/operations.md#production). Endpoint limitations, including known quality warnings, live on their endpoint page.

- [API operations](api/operations.md): configuration, implementation map, local development, tests and deployment.
- [Evaluation guidance](evals/index.md) and [rubric](evals/rubric.md): current workflows, scoped reporting and quality assessment.
- [To-do](todo/index.md): planned API work and release milestones.
- [Product brief](brief.md): goals, scope and deferred product work.
- [Interaction design](design.md) and [journeys](journeys.md): client flows and state.
- [Card schema](card-schema.md): shared card contracts, identity, evidence and persistence.
