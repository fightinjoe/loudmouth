---
kind: record
status: current
summary: Why the API protection baseline uses Firebase anonymous Auth, App Check and a Firestore admission ledger, with the risks, alternatives, integration guidance and cost model considered.
verified: 2026-11-15
---

# API protection baseline

Prepared 2026-11-04 as an offline guide: the explanations and pricing snapshots are included so the record is useful without internet access. It records why the baseline was chosen and what was considered. Current behavior is owned by the [API design](../api-design.md#api-protection), operations by [API operations](../api/operations.md#deployment-reference), the remaining release work by the [API protection todo](../todo/antsy-aphid/api-protection.md), and the local verification run by its [results record](../evals/results/2026-11-04-api-protection-local-verification.md). The risk discussion and pricing snapshots are background, not live configuration evidence.

## Context

The repository baseline when this was prepared, not a live infrastructure audit:

- The API was a stateless Cloud Run service with a public API Gateway entry point.
- Deployment configured authenticated gateway-to-Cloud-Run invocation. The checked-in gateway configuration defined no caller authentication or rate quotas.
- The router permitted CORS origin `*`, `POST`/`OPTIONS`, and the `Content-Type` header.
- Gateway admission, anonymous quotas, global concurrency and spend controls, and attestation were deferred.
- Web and native iOS were separate clients. Native iOS still had a retired-route integration, and the v4 API and web were not deployed. Native route alignment is a separate release dependency, not work solved by adding an SDK.
- Phrasebooks are stored on the client. User accounts and cloud sync are product non-goals.
- A creation flow can call `/context`, `/phrasebook`, `/phrasebook-title` and `/phrasebook-image`; `/phrase-breakdown` is on demand. A phrasebook request fans out into multiple model calls. Speculative generation can spend money on topics a user does not retain.

The v4 API and web went live on 2026-11-13 without these controls ([production state](../api/operations.md#production)), so the exposure described here applies to the live service.

Anonymous technical identities and a server-side abuse ledger are an architecture change, even without visible accounts. The ledger remains separate from the local phrasebook library.

## Decision

Keep Cloud Run and API Gateway. Add Firebase App Check for app verification, Firebase Authentication for anonymous caller identity, and Firestore for shared quota and reservation state. Use Apple App Attest on iOS and reCAPTCHA Enterprise on the web as App Check's underlying verification providers.

No new vendor outside Google/Firebase and Apple is necessary. These are nevertheless new services, SDK dependencies, billing surfaces and operational responsibilities. This does not require moving phrasebooks to the cloud or introducing a visible sign-in screen.

The security objective is **authorized, bounded use of paid generation**, not a promise that every request came from an untouched official app. Especially on the web, that stronger promise is not achievable.

The approved baseline:

- $10 per UTC day and $200 per UTC calendar month in estimated model-admission units, four global and four per-UID active generation requests, and 300 weighted units per UID per day. These are not cloud-invoice caps. The values in force are `DEFAULT_CONTROL` in `api/src/protection/ledger.js`.
- Strict App Attest with no DeviceCheck fallback.
- Standard anonymous Auth, with no automatic account cleanup.
- Production generation stays paused until protected web and separately migrated native clients pass verification together; there is no legacy exception. Native API and storage migration is separately owned and release-blocking.
- Optional token consumption, Redis, and WAF or load-balancer changes are excluded.

Launch requirements:

- No anonymous direct invocation of Cloud Run or bypass of the gateway's admission checks.
- Verified caller identity and app evidence before any paid model call.
- Shared, atomic per-caller allowances and global spending and concurrency admission controls.
- Bounded inputs, model output, fan-out, retries and execution time.
- Explicit rejection and outage behavior, with no silent fail-open path.
- Monitoring and a tested generation kill switch.

## The issues

### Public clients cannot keep a shared secret

Browser JavaScript, mobile binaries and their network requests can be inspected. An API key embedded in either client can be copied. Signing requests with a secret shipped in the app just moves the same problem into a signature algorithm.

Firebase client configuration and a reCAPTCHA site key are public identifiers, not privileged credentials. Provider API keys, service-account credentials and administrative permissions must remain server-side.

### Three questions need separate answers

1. **App verification:** Does this request carry acceptable evidence from a registered app/platform?
2. **Authentication:** Which user or anonymous identity is calling?
3. **Authorization:** What is that identity allowed to do, and how much may it consume?

A genuine app can be automated or operated abusively. An authenticated anonymous user is not necessarily a unique human. Neither check replaces resource limits.

### Main threats and residual risks

| Threat | Main control | What remains possible |
|---|---|---|
| Scripts copy the API URL | App Check plus verified caller identity | Automation through real browsers/devices |
| Attacker copies an embedded API key | Do not use a client secret as admission | Public identifiers remain discoverable, intentionally |
| Caller bypasses gateway | Cloud Run IAM isolation; verify every alternate hostname/revision path | Explicitly trusted operational identities still have access |
| Captured bearer token is reused | HTTPS, short-lived tokens, optional limited-use App Check tokens | Ordinary tokens can be replayed until expiry; token theft remains relevant |
| Valid caller launches many jobs | Atomic allowances and concurrency reservations | Attacker can create more identities; global controls must still hold |
| Anonymous identities are repeatedly reset | Signup controls, IP signals, global budgets | No reliable one-person-one-identity guarantee |
| Small request triggers large provider bill | Endpoint-weighted reservations and bounded work | Already-started provider work can still be billable after cancellation |
| Attack overwhelms admission infrastructure | Cheap early rejection; optional edge rate limiting/WAF | Gateway, logging, verification, and database costs may remain even when models are protected |
| Malicious text manipulates model behavior | Input bounds, instruction/data separation, output handling | Attestation does not solve prompt injection or establish content quality |

### What does not authenticate a caller

- **CORS:** A browser policy, not an access-control system for curl, scripts, or mobile clients. Restrict origins for browser hygiene, but do not count this as API protection.
- **Origin, Referer, User-Agent:** Useful signals; forgeable outside a browser.
- **Hidden URLs:** Discoverable in app traffic.
- **IP addresses alone:** Shared by hotels, mobile networks, and households; attackers can rotate them.
- **Billing alerts:** Notifications, not synchronous spending caps.

## Services and integration complexity

Complexity ratings are planning judgments, not measurements or delivery commitments. Low means configuration and narrow code changes; medium means SDK integration plus lifecycle/failure handling; high means distributed-state correctness or substantial deployment topology work.

| Service | Recommended role | New integration? | Complexity | Main cost driver |
|---|---|---|---|---|
| Firebase App Check | Issue/verify evidence from registered apps | Yes: web, iOS, API | Medium | Underlying provider assessments and quotas; no separate App Check fee assumed in this plan |
| Apple App Attest | Native iOS attestation provider through App Check | Yes: capability, SDK setup, physical-device release validation | Medium | Apple ecosystem membership already needed for distribution; quotas, not a per-request price modeled here |
| reCAPTCHA Enterprise API | Web risk assessment provider through App Check | Yes: site registration and web SDK | Medium | Assessment volume, not API request count |
| Firebase Authentication | Anonymous identity without a sign-in screen | Yes: both clients and gateway JWT validation | Medium | Plan-specific active-user billing and signup limits |
| Cloud Firestore Standard | Shared quota counters, cost reservations, concurrency leases | Yes: backend only | High for correct admission logic; low for provisioning | Document operations, retention, storage, and network |
| Cloud Logging/Monitoring and billing alerts | Rejections, spend signals, operational alerts | Extend existing GCP setup; deployed coverage unverified | Low–medium | Log volume/retention and selected monitoring features |
| Cloud Run IAM and API Gateway | Close bypasses and validate identity tokens | Existing services, configuration changes | Medium | Existing request/compute charges; added verification overhead |
| Cloud Armor plus supported load-balancer topology | Optional edge filtering if abuse warrants it | Not in baseline | High relative to this initial scope | Policies, rules, requests, load balancing, and network |

Firestore is the initial choice for a low-volume launch because it avoids operating an always-on Redis service. It is not an ideal unlimited-throughput rate limiter. A transaction touching a single global budget document becomes a contention point. Start conservative, load-test the expected burst, and move to an atomic Redis-backed admission design only if measured requirements warrant it. Do not randomly shard counters and then describe their sum as a hard synchronous global limit.

There is no baseline need for Auth0, Clerk, Cloudflare, a payment processor, a new application server, or a phrasebook database. They are alternatives or later product work, not prerequisites.

## Integration guidance

The design reasoning behind the implementation. Where it and the code differ, the [API design](../api-design.md#api-protection) and the code are authoritative.

### Project, environment and identity setup

- Add Firebase to the existing GCP project where appropriate. Use separate production and nonproduction projects so debug tokens and experimental allowances cannot unlock production.
- Register the web and iOS apps. Enable anonymous authentication. Choose billing and identity lifecycle policy deliberately rather than upgrading products accidentally.
- Use managed service identities/Application Default Credentials on Cloud Run, not downloaded service-account JSON keys.
- Give the runtime only the permissions it needs. Restrict Firestore client access entirely for this backend-only ledger. Server SDK access is controlled by IAM, not client Security Rules.
- Keep provider secrets in the existing server-side secret system.

Anonymous auth introduces a persistent UID and refresh credentials managed by the SDK. It does not create a visible account UI. A browser and an iPhone are separate identities unless explicit account linking is later introduced. Clearing storage, reinstalling, or account deletion can change identity, so UID quotas alone are insufficient.

### iOS client

Add Firebase Auth and Firebase App Check through Swift Package Manager. Register the correct app identifiers, add the App Attest capability, configure the production attestation environment, and initialize the App Check provider before other Firebase SDKs.

Authenticate anonymously once when needed and reuse the persisted SDK identity. Obtain refreshed tokens through the SDK, not by creating a new anonymous user for each request. Attach the identity token and App Check token to every protected API call.

Test physical-device development and distribution builds, including TestFlight. Simulator/debug-provider success is not evidence that production App Attest works. App Check requires the production App Attest environment, according to its setup documentation.

Unsupported devices were the choice between rejecting generation clearly and explicitly accepting a weaker DeviceCheck fallback with appropriate limits; strict rejection was chosen. Never silently accept an unattested request. Debug-provider credentials are nonproduction secrets and must not ship as production bypasses.

### Web client

Add the modular Firebase Auth and App Check SDKs. Register production domains and a reCAPTCHA Enterprise score-based site key; keep development registration separate. Initialize App Check and anonymous identity before protected calls, and let the SDK cache/refresh tokens.

Send identity tokens in `Authorization: Bearer …` and app tokens in `X-Firebase-AppCheck`. Do not place tokens in URLs or logs. Firebase does not automatically attach App Check tokens to this custom API; the application's request layer must do it.

Handle blocked scripts, privacy tools, network failures, and low-trust results without an infinite refresh/retry loop. Test Safari and the installed PWA, not just desktop Chromium. Keep local reading/review available when online generation cannot authenticate.

Restrict API CORS to approved web origins and allow the new request headers. Browser `OPTIONS` preflight must work without credentials; actual generation requests must still be protected. If cookies or a backend-for-frontend are introduced later, add the corresponding CSRF/session protections. They are not required by the bearer-token design.

### Gateway and Cloud Run boundary

Configure Firebase JWT validation in API Gateway for every generation POST route: correct issuer, audience, signing-key source, and token expiry checks. Keep preflight separate. Audit method-level overrides so no route is accidentally left public.

Cloud Run must require authenticated invocation, limited to the gateway service account and explicitly authorized operators. Inspect public invoker bindings and any setting that disables the invoker IAM check. Network ingress choices must remain compatible with the selected gateway topology; setting “internal only” blindly can break the gateway.

**Important integration detail:** API Gateway overrides the original `Authorization` header when using `x-google-backend`. It sends verified identity claims in `X-Apigateway-Api-Userinfo`. The backend may use those claims only behind the verified gateway-only trust boundary; base64url decoding by itself is not authentication. Test attempted header spoofing and direct backend calls. Do not accidentally interpret the gateway's service token as the end user's Firebase token.

In the API, verify `X-Firebase-AppCheck` with the Firebase Admin SDK and allowlist the intended production app IDs. Project membership alone could otherwise admit another app registered in the same project. A Firebase console enforcement switch does not automatically protect a custom Cloud Run API: rejection must be implemented in the API.

App Check and identity tokens are separate bearer credentials, not a cryptographic binding between one UID and one physical device. Do not infer device uniqueness from their coexistence.

### Shared admission and spending controls

Request sequence:

1. Gateway rejects missing/invalid identity tokens.
2. API performs cheap method, payload-size, and basic structural checks, then validates App Check evidence.
3. Validate endpoint inputs and derive required work from server-owned rules.
4. In a shared atomic transaction, check caller allowance, caller/global concurrency, global budget, and kill-switch state; reserve capacity and a conservative cost allowance.
5. Only after successful reservation may provider work start.
6. Record actual known usage, settle the reservation, and release concurrency safely.

Ledger state includes UID/window usage, reservation ID, endpoint/work weight, reserved cost, known settled cost, status, and concurrency lease expiry. It should not store phrasebook contents or bearer tokens.

Use endpoint-weighted allowances, not only requests per minute. `/phrasebook` needs an allowance that accounts for bounded topic count, generation/translation fan-out, and retries; images need their own cost weight. Title and context calls are cheaper but not free. Tune allowances to the real multi-request creation flow so normal users are not penalized for the product's own parallel requests.

Correctness requirements:

- Shared transactions prevent simultaneous Cloud Run instances from all spending the last allowance.
- Provider calls never occur inside a retriable Firestore transaction callback.
- Crashes, timeouts, and disconnects must not erase charges. Lease expiry must not release concurrency while work can still continue beyond the assumed deadline.
- Unknown provider cost stays conservatively reserved; it must not become zero merely because reporting failed.
- Set an upper bound using input/output limits, model prices, retry counts, image work, and fan-out. If that bound cannot be established, describe the control as an approximate budget rather than a hard dollar cap.
- The application budget limits model admission, not the entire cloud invoice. Already-started work, metering delay, and unrelated workloads require margin.
- Database/authentication failure blocks new paid work with a controlled unavailable response. Do not fail open.

Return distinguishable errors: authentication failure, forbidden client/access, `429` for caller limits with usable retry guidance, and `503` for temporary system admission outages. Clients should not automatically replay expensive POSTs after ambiguous network failures. If transparent retry is required, add a UID/endpoint/body-bound idempotency record so retries cannot duplicate provider work.

### Replay protection: optional second stage

Not in the baseline. Ordinary cached App Check tokens are reusable until expiry. For selected expensive endpoints, clients can request limited-use tokens and the Node Admin SDK can verify with `consume: true`. The backend must explicitly reject `alreadyConsumed`; ordinary verification does not enforce consumption.

The feature is documented as beta and adds a network round trip. It also requires the Firebase App Check Token Verifier role. Evaluate platform SDK support and latency before adopting it. It is not a substitute for idempotency, quotas, or payload authorization: one-time token use and one-time business operation execution are different properties.

### Monitoring, privacy and operating costs

Track counts by endpoint and outcome: invalid identity, invalid app evidence, quota rejection, reservation failure, accepted work, and provider failure. Track identity creation spikes, active concurrency, reserved/settled costs, and attestation success by client version/platform.

Use bounded-cardinality metrics; do not create a metric label per UID. Avoid logging tokens, user-entered text, or full request bodies. Sample repetitive rejected requests so an attacker cannot cheaply create an enormous log bill. Set retention and redact or minimize IP/identity data.

Firebase/reCAPTCHA introduces processing of identity and anti-abuse signals by providers. Review privacy disclosures, platform privacy declarations, applicable terms, and region requirements. “No visible account” does not mean “no personal or pseudonymous data processed.”

## Costs and budgeting

### Pricing snapshot and caveats

USD public list-price information retrieved on 2026-11-04. These are source snapshots, not a negotiated quote or confirmation of this project's billing configuration. Recheck region, SKU, plan, currency, organization-wide free allowances, taxes, and provider terms before enabling services.

| Item | Snapshot or planning treatment | Budget implication |
|---|---|---|
| App Check | No standalone fee budgeted; provider usage and service quotas still apply | Not an unlimited free abuse shield |
| Web reCAPTCHA assessments | Published pay-as-you-go pricing: first 10,000/month free; 10,001–100,000 costs $8/month; above 100,000 adds $1 per 1,000 assessments | Free allowance is organization-wide, not necessarily dedicated to this app. Product naming includes “Enterprise” API without requiring a negotiated enterprise commitment |
| Identity Platform Tier 1 | First 50,000 billable MAU free; next 50,000 at $0.0055/MAU; next band to 1 million at $0.0046/MAU | Applies to the Identity Platform plan, not an assertion about every Firebase Auth configuration |
| Anonymous cleanup option | With Identity Platform automatic cleanup enabled, anonymous identities are excluded from usage/billing quotas; accounts become eligible for deletion after 30 days | Can reduce identity cost, but changes identity durability. Must not underpin lifetime entitlements or irreversible library ownership |
| Firestore Standard free usage | One eligible database: 50,000 reads/day, 20,000 writes/day, 20,000 deletes/day, 1 GiB storage, 10 GiB outbound/month | Daily, not monthly, allowances. Named/additional databases and some features have different eligibility |
| Firestore regional example | Retrieved Iowa (`us-central1`) rates: $0.03/100,000 reads; $0.09/100,000 writes; $0.01/100,000 deletes | Other regions differ; add storage, network, retries, indexes where applicable, and retention work |
| Firestore TTL cleanup | TTL deletes are billed, not included in free deletion usage | Small per operation, but include lifecycle cleanup in the model |
| Apple App Attest | No separate per-attestation price established from the sources reviewed; this plan does not add one | Reconfirm Apple terms/quotas; existing Apple developer membership is separate |
| Cloud Run, API Gateway, logs | Existing services incur additional requests, verification time, logs, and possibly network usage | Admission rejection still consumes infrastructure. No measured incremental total yet |
| Optional Redis or WAF/LB | Not included in baseline | Obtain a separate regional quote; do not assume scale-to-zero pricing or a free add-on |

Avoid SMS authentication for this scope: it adds user friction, message costs, and SMS-abuse exposure without being necessary for anonymous quotas.

### Assessment count is not API request count

App Check caches tokens. Its documentation describes a default one-hour TTL and refresh around half the TTL. Shorter TTLs reduce the reuse window but increase verification traffic, latency, and potentially cost. Startup, refresh, multiple tabs/devices, and limited-use-token behavior affect actual assessment counts.

Use measured reCAPTCHA assessments for the estimate, not “one API request equals one assessment.” Lazy initialization around online generation may avoid verification traffic from users who only read saved content; preserve the required SDK initialization order.

### Worked examples: variable service costs only

The following are **illustrations**, not traffic forecasts or complete monthly bills. They assume the pay-as-you-go reCAPTCHA schedule above, Identity Platform's listed Tier 1 pricing, and an illustrative ledger implementation averaging **6 document reads and 6 writes per admitted API request**. Actual operation counts depend on transaction design, settlement, retries, and rejected traffic.

Firestore figures intentionally ignore free allowances and use the Iowa rates to show gross read/write cost. They exclude storage, deletes, network, and indexes. Assessment volumes are independent assumptions, not inferred from request counts.

| Monthly scenario | Small launch | Growing usage | Larger usage |
|---|---:|---:|---:|
| Assumed billable identity MAU | 1,000 | 10,000 | 100,000 |
| Assumed web assessments | 5,000 | 50,000 | 200,000 |
| Assumed admitted API requests | 20,000 | 200,000 | 2,000,000 |
| reCAPTCHA cost | $0 | $8 | $108 |
| Identity Platform cost without cleanup exclusion | $0 | $0 | $275 |
| Gross Firestore reads + writes | $0.144 | $1.44 | $14.40 |
| Subtotal of these three components only | $0.144 | $9.44 | $397.40 |

At the larger scenario, if all identities qualify for anonymous-cleanup exclusion, the identity component would instead be $0 and this limited subtotal would be $122.40. Do not choose cleanup solely for price: identity resets affect quotas and future account features.

A low operation bill does not prove Firestore can sustain the required concurrency. Contention and latency, especially on global budget state, must be tested independently.

### The full budget model

Monthly incremental protection cost consists of:

- App verification assessments.
- Billable identity usage, if any.
- Quota/reservation storage operations and retention.
- Added gateway/compute/network overhead.
- Logging and monitoring.
- Optional edge filtering or dedicated limiter service.
- Engineering, maintenance, incident response, and release work.

**Model generation spend is separate and potentially much larger.** Budget it as accepted work by endpoint multiplied by measured average cost, with a conservative maximum reservation for admission. Include speculative topics, image generation, provider retries, and partially failed requests.

The values to choose before launch:

| Budget decision | What to choose |
|---|---|
| Normal monthly generation budget | Desired operating spend, not a security guarantee |
| Maximum daily model admission | Enforced reservation ceiling with safety margin |
| Maximum global active work | Sized to provider quotas and reservation implementation |
| Per-anonymous-identity allowance | Enough for normal multi-request creation, but cheap to abandon if abused |
| Infrastructure contingency | Allowance for rejected requests, logs, verification, and attacks |
| Alert ownership | Who receives warnings and can stop generation |
| Reservation pricing margin | Buffer for unknown usage, price changes, and in-flight work |

A strict model-admission ceiling does not cap the total cloud invoice. Billing budgets and alerts should supplement admission controls; they cannot replace them.

## Questions considered

1. **Keep no-sign-in usage?** Yes, with anonymous technical identity and modest allowances. Identities are resettable and not shared across devices.
2. **How much free generation is economically acceptable?** A per-person-intended allowance, acknowledging that anonymous enforcement is only approximate, plus a real global ceiling: the pilot values under [Decision](#decision).
3. **What happens when verification is unavailable?** Reading saved content stays available; new paid generation is blocked with an actionable message.
4. **Which iOS devices must be supported?** Strict App Attest, without a weaker fallback. This affects false rejection risk.
5. **Should anonymous identities auto-expire?** Not in the baseline. Expiry minimizes retained identity state and possible billing, but is unsuitable for permanent entitlements without a later linking design.
6. **What rollout disruption is acceptable?** Old native builds cannot remain indefinitely exempt; they show update-required guidance. Enforcement timing is part of the remaining [release work](../todo/antsy-aphid/api-protection.md).
7. **When is stronger edge protection justified?** Start with the baseline; add WAF/topology work if admission-layer attacks or availability requirements justify its ongoing cost. Cloud Armor is not a checkbox attached directly to the current gateway; design and verify the supported frontend path and block bypasses.
8. **Who operates this after launch?** Open: budget ownership, incident response, privacy review and periodic SDK/configuration updates need named owners ([monitoring todo](../todo/antsy-aphid/monitoring.md)).

## Source notes

The key findings from each source are captured above. Prices and preview/beta status can change.

- [Firebase App Check overview](https://firebase.google.com/docs/app-check): app attestation and authentication are complementary; App Check does not eliminate all abuse; provider quotas apply.
- [Custom backend verification](https://firebase.google.com/docs/app-check/custom-resource-backend): requires client token attachment and backend enforcement; replay protection is beta, adds a round trip, and requires checking consumption status.
- [Apple App Attest integration](https://firebase.google.com/docs/app-check/ios/app-attest-provider): native capability, initialization order, production environment, TTL, debug testing, and staged rollout requirements.
- [Anonymous authentication and cleanup](https://firebase.google.com/docs/auth/web/anonymous-auth): anonymous identity lifecycle, signup limits, linking, and optional automatic deletion after 30 days.
- [API Gateway Firebase authentication](https://docs.cloud.google.com/api-gateway/docs/authenticating-users-firebase): JWT configuration and the `Authorization` override / `X-Apigateway-Api-Userinfo` forwarding behavior.
- [reCAPTCHA pricing](https://cloud.google.com/security/products/recaptcha#pricing): assessment tiers and organization-wide free allowance.
- [Identity Platform pricing](https://cloud.google.com/identity-platform/pricing): Tier 1 MAU rates and anonymous-cleanup billing exclusion.
- [Firestore pricing](https://cloud.google.com/firestore/pricing): regional operation rates, daily free quotas, and billable TTL cleanup.
