---
kind: proposal
status: proposal
summary: "Proposed delivery schedule to a guarded invited beta: improve the core loop, learn from supervised sessions, verify protection, then invite; with UI, API, user-testing, logging and protection workstreams and beta gates. Not approved."
verified: 2026-11-15
---

# Beta delivery plan: improve, learn, protect, then beta

Prepared 2026-11-04 as a proposed delivery plan. It is not a release approval, and the owner has not adopted it: decided launch work is the rows of [Launch: Antsy Aphid](../todo/antsy-aphid.md), and the [launch plan](../todo/antsy-aphid/launch-plan.md) todo decides which clients ship, in what order and to whom. Current behavior is owned by the [design](../design.md), the [API design](../api-design.md), [API operations](../api/operations.md) and the [iOS architecture](../ios/architecture.md).

Two things changed after it was prepared. The v4 web and API went live on 2026-11-13 ([production state](../api/operations.md#production)), so production generation is not paused as the plan assumes. And the protection baseline it schedules is now in the repository, undeployed ([API protection](../todo/antsy-aphid/api-protection.md)); the reasoning for that baseline is in its [decision record](../decisions/2026-11-04-api-protection.md).

## Recommended order

**Establish a measurable working loop → improve the most important UI/API problems → test with a few people under supervision → incorporate findings → verify protection and recovery → admit a small invited beta → expand only on evidence.**

Start lightweight diagnostics and security foundations early. Do not wait until visual polish is complete to learn from users, and do not wait until the day before beta to integrate authentication. Native iOS compatibility is a separate delivery track, not a small styling task.

Release policy selected on 2026-11-04: **coordinated protected web/PWA and migrated native release**, including real iPhone Safari, physical App Attest and TestFlight verification, with production generation paused until both clients meet the functional and security gates. This superseded an earlier web-first recommendation: native migration is on the shared critical path, and there is no unauthenticated legacy exception.

This plan covers five workstreams: UI, API, user testing, minimal logging, and API protection.

## Starting point

### Web

The web implementation is the newer product direction: guided creation, continuous four-section phrasebooks, phrasebook-scoped stars and review, contextual breakdowns, local library storage, and backup/restore. It is not a blank-slate UI project.

- `web/app/vite.config.js` configures an auto-updating PWA and has a TODO for actual PNG installation icons. Installed-PWA update behavior, icon presentation, and persisted-library compatibility need device verification.
- The [design](../design.md#guided-creation) specifies atomic saving, cancellation, stale-response guards, nonblocking images and title, and speculative generation. Preserve these semantics during polish rather than simplifying away working safeguards.
- The [brief](../brief.md) identifies iOS Safari as the primary web audio target. Chromium success does not establish voice or pronunciation behavior on iPhone.

The only runtime observation behind this plan was a local run of the web entry flow on 2026-11-04, without a generation request: language selection gated Next, the selected language appeared at situation entry, and no console errors were reported. That shows the entry flow runs. It is not a usability rating, accessibility certification, mobile-device validation, or end-to-end generation smoke. The UI priorities below are hypotheses to validate, not user findings.

### Native iOS: a contract and storage migration before polish

Source inspection found a substantial SwiftUI/SwiftData local-card app with library navigation, speech, card details, editing, and flashcard interaction. It is not yet the four-section phrasebook product:

| Area | Native implementation | Required delivery decision/work |
|---|---|---|
| API calls | Retired generation and Translation transports are removed; both entry points display an update-required notice and make no requests. | Implement the current guided contracts through `APIClient`; explicitly remove the obsolete Translation action from beta or separately approve a supported replacement. Renaming URLs is insufficient. |
| Creation | Online creation is disabled while saved-card reading, review and import remain local. | Add context/ability/topic selection, validated v4 decoding, explicit final save, cancellation, and recoverable errors |
| Persistence | SwiftData registers Card and Deck; flat cards and global stars | Represent ordered topics/sections, exchange options, Word families, occurrences/evidence, and phrasebook-owned stars without flattening away semantics |
| Languages | Native menus list Japanese, Chinese, Korean, Spanish, French, German | Align with the actual supported contract: Chinese, Japanese, Spanish, Czech, Ukrainian |
| Review | Flat-list flashcards; global star state | Coherent phrasebook-scoped starred review, stable ordering, speech/readings, and return navigation |
| Backup | Unversioned card/deck backup; import UI exists but no normal entry trigger was found | Reachable versioned export/restore, full graph validation, and preservation of existing data on failed restore |
| Security/diagnostics | The request layer exists with no migrated creation caller ([protected requests](../ios/architecture.md#protected-requests)). | Supply verified registrations/signing, wire all migrated requests through the client, and complete physical acceptance before enabling generation. |

These are source findings from `ios/Loudmouth/LoudmouthApp.swift`, `ios/Loudmouth/Screens/CardList/CardListView.swift` and `ios/Loudmouth/Services/BackupService.swift`, not observed native runtime acceptance.

**Native execution sequence:** (1) define full typed contract and legacy-store policy; (2) implement one guided-create → atomic-save → four-section-read vertical slice; (3) add phrasebook stars/review, speech, breakdown and optional image/title behavior with intentional native UX; (4) finish backup/data safety and remove obsolete actions/editing assumptions; (5) integrate protected requests and error states; (6) verify on physical devices and prepare TestFlight.

Use shared versioned conformance fixtures to check web/native semantics, not identical screen layouts. Keep old native data exportable or explicitly isolated during cutover; do not silently delete it. Native in-place content editing conflicts with the current immutable-content/evidence model and needs an explicit cutover decision.

External TestFlight distribution also requires signing/provisioning, tester enrollment, current App Store Connect metadata/privacy declarations, and any applicable beta review. Those are calendar dependencies, not engineering completion. There is no native test target; add focused contract/data-safety coverage during migration, then prove the actual device loop. Re-estimate the provisional native allowance after the first vertical slice.

The native protection build inputs are in [iOS development](../ios/development.md), and the native acceptance blockers are in the [API protection todo](../todo/antsy-aphid/api-protection.md#native-acceptance).

### Shared API and quality

There is no accepted linguistic-quality baseline ([quality limitations](../api/phrasebook.md#quality-limitations)), and integration evidence in the [results ledger](../evals/results.md) is limited evidence, not production health.

The key API improvement question is not “can we make every component more sophisticated?” It is “does a normal learner reliably get useful, accurate preparation material at acceptable wait and cost?” Measure these separately:

- English intent coverage and useful choices/Word families.
- Translation meaning, register, pronunciation/readings, and source evidence.
- Complete valid response and correct association with requested topics.
- Latency, retries, partial provider failures, and cost including discarded speculative topics.

Schema success is not language accuracy. A generator judging itself is not independent review. Prompt `.txt` changes require explicit approval and before/after representative evaluation of behavior, latency, and token impact.

### Storage and release compatibility

The web library is a fresh v4 database; v3 data remains untouched, with no v3 import or migration path ([namespace isolation](../card-schema.md#namespace-isolation-and-backup)). Before inviting testers with older builds or data, decide whether to offer migration, an explicit backup/export route, or a clearly communicated fresh-beta start. Do not promise silent preservation that the code does not provide.

Anonymous security identity does not imply phrasebook cloud sync. Keep the local-library promise clear, explain data-loss risks, and verify backup/restore before people invest substantial effort in saved content.

## Schedule and assumptions

**Planning estimate, not a commitment:** allow **6–8 calendar weeks for a guarded web beta**, assuming one primary engineer with access to product decisions, a small tester pool, and qualified language reviewers. Native convergence adds a separate multi-week body of work; an initial **4–6 engineer-week allowance** is a provisional reserve to refine after one complete native vertical slice, not a code-estimated quote. If one person does both tracks, these efforts cannot be treated as free parallel capacity.

The protection work was allowed roughly 2–4 engineer-weeks for an engineer familiar with the repository, covering the baseline integration, distributed-admission work, device and browser verification, and rollout preparation. That was a planning inference, not a quote: the implementation had not been scoped line by line and deployed resources had not been audited, and it excludes native retired-route migration, store review delays, visible account features, and a new edge/WAF topology. The allowance is included across the schedule below, not added after week 6. The highest-risk part is correct cost and concurrency accounting and rollout compatibility, not installing the Firebase SDK: provisioning may be quick, and proving failure behavior is the substantial part. Device access, cloud permissions, store release timing and observed attestation failures can extend elapsed calendar time. If security consumes the high end, reviewer or device access is delayed, or the native migration is larger than expected, move the date rather than skip gates.

Weeks are relative to kickoff. Use gate completion, not the calendar alone, to authorize access.

| Window | Main work | What can happen alongside it | Exit evidence |
|---|---|---|---|
| Week 1 | Freeze the intended beta loop and supported environments; establish a local/staging working path; inventory deployment and native drift; add minimal diagnostics | Recruit first research participants; choose representative language scenarios; provision dev security services | One reproducible web loop; endpoint/configuration inventory; traceable failure; agreed limits and beta scope |
| Week 2 | First UI improvements to creation/read/star/review; measure API baseline and fix blocking correctness failures | Integrate anonymous identity/App Check in development; build shared quota foundations; native vertical slice if separately staffed | Usable supervised research build; baseline latency/cost/content findings; no accidental production calls |
| Week 3 | Supervised sessions with 3–5 target users; observe real situations and return visits; prioritize findings | Continue security, reservation accounting, error UX, and physical-device testing | Ranked observed issues; distinction between UI confusion, bad content, latency, and technical failure |
| Week 4 | Fix the highest-impact observed problems; second focused API/content pass; complete protected staging path | Retest with 3–5 users, including some new participants; validate native fixture compatibility | Core tasks work without coaching; protected real-client path; known quality defects resolved or explicitly excluded from beta |
| Week 5 | Release hardening: quota/outage/retry behavior, backup/restore, installed PWA update, Safari audio, accessibility pass, privacy/support materials | Bounded staging soak and controlled paid model samples; native device/TestFlight preparation if ready | All beta gates below pass, with measured evidence and an owner for every accepted limitation |
| Week 6 | Invite an initial 10–20 beta users in small batches, only if gates passed | Support, bug triage, endpoint spend review, targeted content review | Several days of explainable usage and stable costs; no unresolved release-blocking failures |
| Weeks 7–8 | Contingency for failed gates or a second beta iteration; widen gradually only after review | Finish any blocking native migration/device acceptance; refine lower-priority polish from actual feedback | Evidence-based coordinated release/expansion decision rather than automatic public launch |

If no second engineer is available, native work remains on the coordinated-release critical path: move the shared release date until migration and protected physical-device acceptance are complete. Do not ship the old native flow against new endpoints or enable production generation for web alone as a shortcut.

## UI work: improve the core loop before decorating more surfaces

Keep the current visual direction unless research shows a reason to replace it. Focus first on understandability and interaction reliability:

1. **First use:** does the learner understand that this prepares them for a future conversation, not live translation? Can they choose a language and describe a useful situation?
2. **Creation:** clarify questions, Back behavior, topic selection, and whether work is still running. Handle keyboard/viewport changes, long answers, and double taps. Explain cancellation without promising that already-started provider work is free.
3. **Reading:** make chapter/section structure, response alternatives, and horizontal Word/Phrase shelves discoverable. Check long text, ruby/reading layout, text scaling, contrast, reduced motion, and horizontal-versus-vertical gesture conflicts.
4. **Prioritizing and review:** make the difference between reading, starring, and reviewing clear. A user should find a saved phrase again and understand the review scope.
5. **Trust/recovery:** show actionable offline, verification, quota, generation, and local-save failures. Failed art should not look like failed text generation. Avoid automatic paid retries on every reload.
6. **Returning:** verify library navigation, restore position, reload, local persistence, backup/export, and the effect of an app update.

Prioritize broken/confusing tasks over typography refinements. A visually attractive screen is not a completion gate. Test real iPhone touch, keyboard, VoiceOver/text size, and speech; desktop snapshots cannot answer those questions.

## API improvement work: stabilize, measure, then optimize

Preserve the existing API safeguards: input/output validation, server-owned model selection, bounded per-request worker/retry behavior, aggregate phrasebook usage accounting, defensive image decoding, and the phrasebook pipeline's overall deadline below the gateway and Cloud Run deadlines ([limits](../api/phrasebook.md#execution-limits-and-recovery)). Per-request concurrency is not a global spend limit.

One reliability gap named when this was prepared may remain: image failures lacked useful internal cause categories. Resolve such gaps with bounded work and accurate outcomes, not blanket automatic retries.

### First pass: necessary for supervised research

- Verify the actual deployed/configured route and schema versions; create a coordinated staging release instead of assuming the hosted gateway matches local source.
- Exercise one complete scenario through context, title, phrasebook, optional image, and on-demand breakdown.
- Verify invalid input fails before provider work, output validation is enforced, and failed local save cannot masquerade as successful creation.
- Record endpoint durations, controlled failures, retries, token usage, and known/unknown cost without logging private prompts.
- Establish a small fixed representative set across supported languages and abilities. Review fresh holdouts as well as familiar fixtures so tuning is not mistaken for general quality.

### Second pass: driven by evidence

Fix meaning/pronunciation/source-evidence errors before stylistic perfection. Review English generation separately from translation to locate causes. Have qualified reviewers examine the supported language output; limit beta language availability explicitly if a language cannot yet be reviewed, rather than claiming universal readiness.

Measure both start-to-saved-phrasebook time and the final Continue-to-usable wait. Include abandoned/discarded speculative work in cost accounting. Do not optimize only a model's response time while ignoring retries, translation completion, or local save.

Only change fan-out/concurrency, prompts, models, or speculative behavior when measurements identify a problem and a comparison supports the change. Do not introduce a mandatory repair model, streaming architecture, a queue, or another backend merely to make the roadmap look complete.

Before the first beta invitation, define explicit tolerances from measured baseline and budget: acceptable task completion, generation failure, learner-visible wait, per-flow cost, and content defects. Proposed starting review rule: no known critical meaning/safety defect in the release sample and no known data-loss or access-control defect. Sample success is not a guarantee about future generated content.

## User testing: start early, separate research from beta

### Round 1: supervised research, approximately week 3

Recruit 3–5 people resembling intended travelers/learners, not only engineers or existing enthusiasts. Ask them to bring an upcoming real situation. Observe without teaching the UI:

- Explain what they think the app does.
- Create preparation material for that situation.
- Find something they would actually say and a reply they need to recognize.
- Star a few useful phrases and start review.
- Return later and find the same material.

Use a researcher-operated device or access-restricted staging with a tiny global spend limit. Do not distribute an unrestricted paid endpoint and call it safe because there are only five people. Seeded saved phrasebooks can test browsing before generation is ready, but cannot validate creation speed or content relevance.

Take structured notes: task outcome, hesitation, wrong turn, misunderstanding, requested help, perceived wait, useful/useless content, and willingness to return. With permission, record a session; do not collect passwords or unrelated private information. Separate user reaction from expert language correctness.

### Round 2: retest changed flows, approximately week 4

Use 3–5 participants, including new people to avoid learned behavior masking problems. Revisit the highest-impact failures and include at least a short return-use session. Do not spend the whole round asking which color people prefer.

### Invited beta: week 6 or later

Beta users operate independently and can generate repeated costs. Admission controls, diagnostics, privacy/support instructions, and recovery therefore become mandatory. Begin with 10–20 invited testers in batches; these counts are planning suggestions, not statistical validation.

**An invitation link alone is not an access-control mechanism.** Anonymous identity plus App Check admits acceptable app clients, not just people on an invitation list. For a truly closed beta, add a server-enforced enrollment/allowlist mechanism (for example, limited-use invite redemption bound to a UID), with issuance limits and reset behavior. Do not add a full visible account product solely for this purpose unless chosen deliberately.

Collect lightweight feedback tied to a release/request reference. Request actual phrase text only with explicit user action and consent; automatic raw-prompt logging is not the default debugging strategy.

## Minimal logging: early enough to inform the work

Start in week 1, before research and API tuning. Prefer the existing Cloud Run structured logs and a small release dashboard over a new analytics platform ([structured diagnostics](../api/operations.md#structured-diagnostics)).

**Existing logging needs cleanup, not merely expansion.** Events are structured and carry a request ID, but `/context` and `/phrasebook` success logs include the learner's seed, and validation failures log the raw provider output and error text (`api/src/context/index.js`, `api/src/phrasebook/index.js`, `api/src/phrasebook-title/index.js`). Remove sensitive default fields before real-user research.

### Minimum useful operational record

- Server-generated request ID and endpoint, release/build identifier, server-owned model/config version.
- Terminal outcome/status and bounded error category; distinguish required failure from optional title/image degradation.
- Duration, retry count, provider/model identifiers, tokens, known cost and an explicit unknown-cost indicator.
- Admission reason, reservation/settlement reference, quota result, active-work/spend signals.

Keep endpoint outcomes distinct from internal stage diagnostics so a retry does not count as a second user request or a failed image as a failed phrasebook. Propagate safe request references back to client error reports and allow required CORS response headers.

### Minimum useful client signals

For initial supervised research, researcher notes are sufficient for most usability questions. Before independent beta, add an intentionally small set if needed: creation started/completed/abandoned, save failed, review started, and app version/error reference. A server success does not prove that the client saved the phrasebook, so that distinction is worth instrumenting.

Client telemetry requires an ingestion contract, rate limits, retention, privacy review, and deduplication expectations; do not create an unbounded public log endpoint. Do not use client-reported events as authoritative billing or security facts. Optional Sentry/analytics tooling can wait unless crash investigation demonstrates a need.

No default logging of seeds, answers, translations, authorization headers, App Check/debug tokens, full request bodies, or stable identifiers in high-cardinality metric labels. Sample repetitive rejections and set retention. Choose one owner who reviews failures and spending daily during early beta.

## Protection: start early, enforce before unsupervised access

Deploy and verify the [protection baseline](../api-design.md#api-protection): gateway-only authenticated Cloud Run invocation, Firebase anonymous identity, App Check with App Attest/reCAPTCHA, backend-only shared quotas/reservations, and spending/concurrency controls.

This changes client request lifecycle and failure UI, so it cannot safely be a final-day infrastructure task. Integrate it in staging while research proceeds.

Required beta checks:

- Missing, forged, expired, wrong-project, and wrong-app tokens cannot trigger model calls.
- No direct Cloud Run or alternate-route bypass; gateway-forwarded identity claims are not blindly trusted from arbitrary clients.
- Normal multi-request creation fits allowances; repeated concurrent requests cannot spend the same last allowance.
- Failures/crashes/disconnects do not erase spent or unknown provider cost.
- Ledger/auth outages fail closed for new paid work; saved local content remains readable.
- Global spend admission and kill switch are exercised, not just configured. Billing alerts are not a cap.
- Closed-beta enrollment is enforced if access is advertised as invite-only.

### Preserve local testing and dev deployments

Use separate production/nonproduction Firebase/GCP trust domains. Local browser/simulator development uses registered App Check debug tokens in nonproduction; physical staging tests use real attestation. Local API runs verify the original identity bearer token directly when no gateway exists; deployed environments use the verified gateway contract. Offline automated tests may use Auth/Firestore emulators and test-only verifier substitutes.

No production skip-auth switch, debug registration, or accepted emulator token. Test an installed iOS distribution build and Safari/PWA against the protected staging gateway. Debug-provider success alone is not release evidence.

## Beta gates and scope control

Before sending invitations, record pass/fail evidence for each gate:

| Gate | Required evidence |
|---|---|
| Coherent product loop | Supported client completes create → read → star → review → return without developer intervention |
| Content suitability | Reviewed representative output and holdouts; known serious defects addressed; supported languages and limitations stated |
| Reliability | Real endpoint workflow, optional image/title failure, network interruption, cancellation, reload, and local-save failure exercised |
| Data durability | Save/reload and backup/restore verified; legacy-data policy explicit; no known silent loss |
| Device/accessibility | Real iPhone Safari/PWA and any shipped native build checked for keyboard, speech, long text, text size, and core accessibility |
| Protection | Auth, attestation, admission, invite policy, bypass rejection, and no production dev carve-out verified |
| Cost | Normal flow and bursts measured; reservations, alerts, kill switch, and owner established |
| Diagnostics | A real failure can be traced from a safe client reference to a terminal server outcome without exposing content/tokens |
| Release operations | Environment/config versions known; PWA stale-client behavior and native update policy handled; secure rollback available |
| Tester expectations | Local-only storage, generated-content limitations, privacy/feedback process, and support route communicated |

Pause invitations for unauthorized paid access, unexplained spend, silent data loss, repeated core-loop failure, or a serious content defect in a supported use case. Roll back to a secure known release or disable new generation; do not restore access by removing authentication.

Keep out of this beta unless evidence makes it necessary: cloud library sync, social features, payments, full account UI, semantic deduplication redesign, vector search, comprehensive analytics, mandatory model repair, and complete visual parity across platforms. Preserve intentional native differences while sharing the API/data contract.

## Decisions for the first planning meeting

1. Selected on 2026-11-04: coordinated protected web/PWA and migrated native release, with production generation paused until both pass acceptance. Production has since gone live for web, so this needs confirming in the [launch plan](../todo/antsy-aphid/launch-plan.md).
2. Who is the beta for, and which languages can receive qualified review?
3. Is the beta actually invite-only, and what is the simplest enforceable enrollment method?
4. Decided: the pilot admission limits in the [protection decision](../decisions/2026-11-04-api-protection.md#decision). These are not cloud-invoice caps.
5. Who can provide physical iPhone, language review, and recruiting access?
6. How will older local data and unsupported app versions be handled?
7. Who owns daily triage, spend review, and the decision to stop generation?

## Evidence boundaries

This plan used repository source, the architecture, product and interaction documentation of 2026-11-04, and the limited local web observation described above. It is not a live infrastructure audit or a release certification. No paid generation, production deployment, prompt change, or user study was performed for it. Native runtime and real-device verification must be completed during execution; source inspection is not a substitute.
