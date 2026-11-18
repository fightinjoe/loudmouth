---
kind: record
status: current
summary: "Protect the public API for anonymous callers: the baseline is in the repository; provisioning, protected staging acceptance, native acceptance and the coordinated release remain."
verified: 2026-11-17
---

# Protect the API for anonymous users

Part of [Launch: Antsy Aphid](../antsy-aphid.md).

- **What:** make the API safe to serve anonymous users. Admission control: caller authentication at the gateway, anonymous per-caller quotas, global concurrency and spend limits, and app attestation. Robustness under hostile or careless traffic: request size and rate bounds on every route, bounded fan-out per request, behavior when provider capacity or the spend limit is exhausted, and abuse of free-text inputs such as image prompts. The baseline that does this is in the repository ([API protection](../../api-design.md#api-protection)); what remains is provisioning, deployment to a protected staging environment, acceptance there and on devices, and the release.
- **Why:** the live gateway and Cloud Run service still serve unauthenticated generation ([production state](../../api/operations.md#production)). Every phrasebook request fans out into several paid model calls, so an open endpoint exposes provider spend. An iOS-only launch does not make the API private. The owner asked for robustness work for anonymous users on 2026-11-12; the design and its reasoning are in the [decision record](../../decisions/2026-11-04-api-protection.md).
- **Done when:** the deployed gateway and backend exposure is verified with no unknown bypass path; missing, forged, expired, wrong-project and wrong-app tokens cannot trigger paid work through any public path; the [pre-release evidence](#pre-release-evidence) below is recorded in the [results ledger](../../evals/results.md); a load or abuse test against protected staging shows quotas and spend limits holding; and [API operations](../../api/operations.md#production) describes the protected deployment as live.

## State

In the repository and locally verified on 2026-11-04 ([record](../../evals/results/2026-11-04-api-protection-local-verification.md)): backend identity and App Check verification, atomic Firestore reservations, provider work bounds, operator recovery, web credentials and error handling, the native Firebase request layer with retired actions gated, deployment hardening and monitoring provisioning.

Not done: nothing is deployed. No production or nonproduction project ID, authenticated cloud access, verified rates or image allowance, owner or notification-channel confirmation, real app registration, full Xcode or signing, or real browser and device run has been available. The ordered operator procedure, including the console steps no script performs, is the [setup sequence](../../api/operations.md#setup-sequence).

## Phases and gates

Phases are sequential where they share a trust boundary. Observation mode is not protection: keep hard cost controls enabled, limit the observation window, and use staging or controlled access. Never leave a permanent unauthenticated legacy route for old mobile builds. Rollback preserves the spending boundary: pause generation, keep quota enforcement, or revert to the last secure release; disabling authentication is not a rollback.

| Phase | Work | Acceptance gate |
|---|---|---|
| 1. Inventory and decisions | Inspect the deployed gateway, Cloud Run IAM and ingress, alternate URLs, existing Firebase resources, billing plans, traffic and model costs. | Written exposure map, no unknown bypass path, explicit budget and environment ownership |
| 2. Admission foundation | Close direct-access bypasses; provision the backend-only ledger; deploy bounded work, shared quotas and reservations, failure behavior and the kill switch. | Concurrent requests cannot overspend the configured allowance; crashes and outages fail safely; rejected work makes no provider calls |
| 3. Client and token integration | Register apps, configure gateway JWT validation in staging, and run both clients against it. | A real iOS device and Safari/PWA complete all endpoint flows with tokens; forged, wrong-project and expired tokens and spoofed headers fail |
| 4. Compatibility and observation | Align the native API routes ([iOS port](ios-port.md)); release capable clients; collect admission metrics in a bounded observation period. | Known supported versions can authenticate; documented unsupported-device behavior; measured failure rate, added latency, assessment volume and cost |
| 5. Enforcement release | Enforce identity and App Check on all generation routes; retire unprotected access; publish the quota and error UX and the operational runbook. | Missing tokens cannot trigger paid work through any public path; older unsupported versions receive a clear update requirement |
| 6. Operate and tune | Review rejection and spending signals; adjust allowances; evaluate replay protection or edge filtering only when justified. | Alerts and kill switch exercised; normal creation fits quotas; burst load and monthly spend stay within the chosen envelopes |

## Pre-release evidence

1. Deterministic tests, real Firestore emulator contention, crash and reconciliation tests, actual Functions Framework malformed and oversize-body behavior, and gateway and direct-hostname spoofing denial, on the merged code.
2. Every protected route with real nonproduction SDK tokens. Missing, wrong-project, wrong-app and expired evidence must produce zero provider work. Approved-origin preflight must not authenticate a subsequent POST. Exercise pauses, provider failures, ledger outage, disconnect and midnight settlement.
3. Desktop, physical iPhone Safari and PWA, physical strict App Attest development, and signed TestFlight acceptance. Simulator or debug success is not App Attest evidence. Unsupported devices keep saved reading and review but cannot generate.
4. 48 hours of protected staging observation with identity, App Check and hard limits always on: zero unauthorized paid calls, lost liabilities or overspends; p50 and p95 admission latency and transaction retries; signup and assessment volume and cost; confirmed alerts; all device and browser scenarios. At 20 simultaneous requests, decisions must complete within five seconds or reject safely. A failure delays the release; it does not justify disabling protection or inventing sharded hard-budget totals.
5. Release capable web/PWA and migrated native builds together, re-audit every hostname, revision and config, then explicitly `resume`. Installed clients may need an update; no unauthenticated legacy exception survives.

Scenarios to cover while gathering it:

- Valid web and iOS creation, including title and image side calls and on-demand breakdown.
- Missing, malformed, expired, wrong-project and wrong-app tokens.
- Successful preflight followed by a rejected unauthenticated POST.
- Direct Cloud Run request and forged gateway user-info header.
- Many simultaneous requests by one identity and many identities across multiple instances.
- Identity resets, signup bursts and shared-IP legitimate users.
- Ledger outage, process crash after reservation, partial provider failure and unknown usage cost.
- Client disconnect and ambiguous retry without duplicate billable generation.
- iOS production attestation, unsupported devices, Safari/PWA and blocked verification scripts.
- Budget exhaustion, alert delivery, kill switch and recovery without reopening bypasses.

## Native acceptance

The native request layer exists but no screen uses it ([protected requests](../../ios/architecture.md#protected-requests)); connecting it is part of the [iOS port](ios-port.md), and already-installed clients must update rather than receive a public legacy exception. Acceptance is blocked on a verified Firebase project and app registration with anonymous Auth and App Check configured, a separately registered staging bundle, Apple team and provisioning access, the port itself, a physical supported device and TestFlight distribution ([build inputs](../../ios/development.md)).

With full Xcode installed and selected, resolve dependencies and build once. Then verify on a physical device: fresh and persisted anonymous identity, App Attest and token refresh, unsupported-device denial, no debug bypass in a release build, all five migrated route flows, cancellation and error UX, and saved-content availability while verification is unavailable.

## Reserve and limit assumptions

How the limits work is specified in [API protection](../../api-design.md#api-protection): the dollar ceilings and global concurrency are shared by all callers, and each caller has only a concurrency limit and a daily allowance in weight units. The values below are the checked-in ones on 2026-11-17 (`DEFAULT_CONTROL` in `api/src/protection/ledger.js`, `buildWorkPlan` in `api/src/protection/policy.js`, `PRICING` in `api/src/pricing.js`). None has been checked against a measured creation, and together they decide how many learners can create at once. They are to be reviewed before protected staging (owner request, 2026-11-17).

| Limit | Scope | Value | Unit |
|---|---|---|---|
| Daily ceiling | All callers | $10 per UTC day | Reserved plus settled dollars |
| Monthly ceiling | All callers | $200 per UTC month | Reserved plus settled dollars |
| Global concurrency | All callers | 4 | Requests in flight |
| Caller concurrency | Each UID | 4 | Requests in flight |
| Caller daily allowance | Each UID | 300 per UTC day | Route weight |

Route weights: `/phrasebook` 10 per topic, `/context` 10, `/phrasebook-image` 8, `/phrase-breakdown` 5, `/phrasebook-title` 2. An eight-topic creation with its side calls is about 100 units, so the allowance is roughly three creations per caller per day.

The reserve for one eight-topic `/phrasebook` request at the default backends:

| Stage | Attempts admitted | Reserve per attempt | Subtotal |
|---|---|---|---|
| English generation (DeepSeek) | 64 | about $0.0069 | about $0.44 |
| Translation (Flash Lite) | 64 | about $0.0543 | about $3.48 |
| Total with the 1.25 margin | | | $4.90 |
| Adding the rate-limit fallback (Flash Lite) | 64 | about $0.0543 | about $9.25 in total |

Assumptions to revisit:

- **Input size.** Each attempt is priced at 131,072 input tokens: the 128 KiB byte bound with every byte counted as a token. A generation prompt built from maximum-length request fields measured about 13 KB on 2026-11-15, so this term overstates input by roughly ten times or more and is most of the reserve.
- **Output size.** Each attempt is priced at the full 6,000-token output cap.
- **Attempts.** Eight per topic per stage assumes both validation tries each use all four rate-limit tries, on every topic at once. No production data on how often retries happen has been compared with this.
- **Fallback.** The generation fallback is not in the work plan at all ([open question](#open-questions)). With the default translation backend it draws on the translation stage's attempts; with any other `LLM_BACKEND` it is rejected.
- **Margin.** The 1.25 multiplier is a judgment, not a measurement.
- **Pool against reserve.** One in-flight eight-topic creation holds about half the daily ceiling, so two concurrent creations can exhaust it until they settle, and one that ends without terminal evidence holds its reserve until an operator reconciles it.
- **Concurrency.** Caller and global concurrency are both four and the web flow starts up to four requests for one topic, so one caller can occupy every global slot.
- **Weights.** Weights are not derived from cost, and a failed request keeps its weight.
- **Actual cost.** No real eight-topic creation has been costed under admission; the prices themselves are unverified ([pricing row](../antsy-aphid.md#admission-control)).

## Open questions

- **Release policy.** The 2026-11-04 decision keeps production generation paused until protected web and migrated native clients pass together. Production has served v4 generation since 2026-11-13, so the owner needs to confirm whether the live unprotected service is paused before rollout and whether web may ship protected before native ([launch plan](launch-plan.md)).
- **Closed beta.** Anonymous identity plus App Check admits acceptable app clients, not an invitation list. An invite-only beta needs a server-enforced enrollment mechanism, which the baseline does not have ([beta delivery plan](../../proposals/beta-delivery-plan.md)).
- **Fallback allowance.** The admission work plan gives the `/phrasebook` rate-limit fallback no attempt allowance or reserve of its own ([known gap](../../api/phrasebook.md#execution-limits-and-recovery)). Giving it eight attempts per topic raises the reservation for an eight-topic phrasebook from about $4.90 to about $9.25 at the checked-in rates, against the $10 daily ceiling, so the owner decides between a larger reserve, a smaller attempt budget and no fallback under admission. Decide it together with the [reserve review](#reserve-and-limit-assumptions): a tighter input estimate changes which option is affordable.

## Known gaps in the baseline

- API logs still include user-entered text: seeds in `/context` and `/phrasebook` success events, and raw provider output and error text in failure events. The design rule is to avoid logging tokens, user-entered text or full request bodies ([decision record](../../decisions/2026-11-04-api-protection.md#monitoring-privacy-and-operating-costs)).
- Free-text abuse such as prompt injection through image prompts is bounded in size only; attestation and quotas do not address it.

## Audit findings on the merged code

A read-only audit of the baseline after it was merged with `main` (2026-11-15, owner request) found the gaps below. Each has a row on the [ledger](../antsy-aphid.md); none is fixed. Items marked unconfirmed were read from the code or inferred from platform behavior and not reproduced. The capacity lockouts the same audit found (uncertain reservations never released without an operator, and a single failed settlement leaving a reservation active) and the fallback budget are tracked by the reserve and limit rows, not here.

Web:

- **CI.** `.github/workflows/web-app-ci.yml` sets no `VITE_*` values. `npm run test:e2e` starts with `npm run build` (`web/app/playwright.config.js`), and `web/app/vite.config.js` now rejects a build without the six online-generation inputs (`getApiConfiguration` in `web/app/src/js/api-config.ts`), so that step fails. The Storybook journeys (`web/app/e2e/storybook/workbench.spec.js`) run the real `web/app/src/js/phrasebook-api.ts` with only `fetch` stubbed; `post()` throws on missing configuration before any fetch, so 8 of the 28 journeys failed with "Online generation is not configured" when `npm run test:storybook` was run on 2026-11-17. It also rejects Storybook's relative API URL when the inputs are set (read from the code, not run). Done when both browser steps pass in CI without real credentials.
- **Hosting.** No hosting configuration is in the repository, so the six inputs must exist in the Vercel project before the protected build reaches `prod`, or that build fails. The old gateway fallback for `VITE_API_URL` is gone.
- **SDK loading.** `web/app/src/js/api-identity.ts` imports Firebase statically; only initialization is lazy, so the SDK and the reCAPTCHA loader ship in the entry bundle (about 493 KB on 2026-11-15). Done when Firebase loads on the first generation request and local library use downloads none of it.
- **Failure handling.**
  - Responses the gateway generates itself (JWT 401, 504) and a forbidden origin's 403 carry no `Access-Control-Allow-Origin`, so the browser reports a network error, the client shows "connection was lost" and never refreshes credentials (unconfirmed against a real gateway).
  - `/phrasebook-title` and `/phrasebook-image` failures of every class are silent (`web/app/src/components/creation-panel.ts`, `web/app/src/js/phrasebook-illustration.ts`).
  - Readable 500, 502 and 504 responses show no warning that allowance may have been consumed; the native client does warn.
  - "Try again" after a 429 is not disabled for the Retry-After period.
- **Request hardening.** The API `fetch` follows redirects, so a 307 or 308 would re-send the POST with its App Check header; the native client refuses redirects. The production configuration check accepts trailing-dot local hostnames such as `localhost.`.

iOS:

- **Build inputs.** `ios/Config/Protection.xcconfig` passes runtime configuration as custom `INFOPLIST_KEY_Loudmouth*` settings with a generated Info.plist. Xcode probably emits only the keys it knows, in which case `APIConfiguration.load()` in `ios/Loudmouth/Services/APIIdentity.swift` throws in every build, startup swallows the error and Firebase is never configured (unconfirmed: needs a build, then `plutil -p` on the built Info.plist). The same file turns App Check auto-refresh off while `APIIdentity.swift` turns it on at every acquisition.

Admission and operation:

- **Operator recovery.** `reconcile` in `api/scripts/protection-admin.js` needs a reservation ID, but `status` prints only counts and no log event carries the ID (`settlement_failed` in `api/src/index.js` included), so the operator must read Firestore directly. Settlement sets `overshoot`, which blocks `resume`, and no command clears it. `reconcile` accepts any non-empty evidence text and has no lease-age guard, so it can refund a reservation that is still running.
- **Late commit.** `reserve` in `api/src/protection/ledger.js` races its transaction against a 4.5-second timer. A transaction that commits after the timer holds a slot and budget while the caller received 503, and its ID is not logged.
- **CPU after response.** Settlement runs after the response is sent and `api/deploy.sh` does not pass `--no-cpu-throttling`, so with request-based CPU the settlement transaction can stall or be lost at instance shutdown (unconfirmed platform behavior).
- **Tests.** The emulator suite `api/src/test/protection-ledger.integration.js` is in no npm script or workflow and needs Java; it was last run on 2026-11-04, before the merge. No workflow runs the API tests at all.
- **Body limit.** The 64 KiB check in `api/src/index.js` runs after the Functions Framework has buffered and parsed the body under its own much larger limit, and malformed JSON is answered by the framework rather than the controlled error contract.
- **Housekeeping.** `firebase-admin` is a caret range in `api/src/package.json` while the other Firebase dependencies are exact. `api/config/monitor.Dockerfile` uses Node 22 against the single-runtime Node 24 decision. The module-level `reserve`, `settle` and `getDefaultLedger` in `api/src/protection/ledger.js` are unused. npm blocks the install scripts of `@firebase/util` and `re2` (API) and `@firebase/util` and `protobufjs` (web), and `allowScripts` does not yet record a decision for them ([earlier decisions](../backlog/npm-install-scripts.md)).
