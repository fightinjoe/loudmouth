---
kind: ledger
status: current
summary: "Launch: Antsy Aphid, the first public launch: web and iOS client work, API protection, staging, monitoring and generation reliability, the launch plan, and business model, privacy and naming; plus dated notes on changes of direction."
verified: 2026-11-19
statuses: [open, in-progress, blocked, done]
---

# Launch: Antsy Aphid

The first public launch: everything that must be done before Catchphrase is open to the public. Every row gates the launch; work that can ship after it goes to the [backlog](backlog.md). Production deployment state is owned by [API operations](../api/operations.md#production). Naming, sections and the release notes written at the end follow [launch milestones](../wiki.md#launch-milestones).

| Section | Open | In progress | Blocked | Done |
|---|---|---|---|---|
| Client › Web | 10 | 0 | 0 | 1 |
| Client › iOS | 11 | 0 | 0 | 1 |
| API + Server › Admission control | 17 | 4 | 0 | 1 |
| API + Server › Robustness | 4 | 3 | 0 | 0 |
| API + Server › Staging environment | 3 | 0 | 0 | 0 |
| API + Server › Monitoring | 6 | 0 | 0 | 0 |
| API + Server › Generation reliability | 1 | 0 | 0 | 4 |
| Launch | 3 | 0 | 0 | 0 |
| Product + legal › Business model | 5 | 1 | 0 | 1 |
| Product + legal › Privacy | 5 | 0 | 0 | 0 |
| Product + legal › Name | 3 | 0 | 0 | 0 |
| **Total** | **68** | **8** | **0** | **8** |

## Client

### Web

| Date | Status | Description | Details |
|---|---|---|---|
| 2026-11-17 | open | Set the six online-generation build inputs in the Vercel project before the protected build reaches `prod` | [details](antsy-aphid/api-protection.md) |
| 2026-11-17 | open | Load the Firebase SDK on the first generation request instead of bundling it in the entry chunk | [details](antsy-aphid/api-protection.md) |
| 2026-11-17 | open | Fix web failure handling: gateway-generated 401, 403 and 504 read as connection loss, silent title and image failures, no allowance warning on 5xx, Try again enabled during Retry-After | [details](antsy-aphid/api-protection.md) |
| 2026-11-17 | open | Harden the web request layer: refuse redirects on API POSTs and reject trailing-dot local hostnames in production configuration | [details](antsy-aphid/api-protection.md) |
| 2026-11-15 | open | Protected generation with real reCAPTCHA Enterprise on desktop, physical iPhone Safari and the installed PWA | [details](antsy-aphid/api-protection.md) |
| 2026-11-12 | open | Request persistent storage and handle a refusal | [details](antsy-aphid/library-durability.md) |
| 2026-11-12 | open | Decide and ship the install-to-home-screen and backup-reminder prompts | [details](antsy-aphid/library-durability.md) |
| 2026-11-12 | open | Check library eviction on iOS Safari on a device and state the durability guarantees | [details](antsy-aphid/library-durability.md) |
| 2026-11-12 | open | VoiceOver, enlarged-text and thumb-reach checks on physical phones | [details](antsy-aphid/accessibility-pass.md) |
| 2026-11-12 | open | Check iOS Safari gesture conflicts with long press and swipes | [details](antsy-aphid/accessibility-pass.md) |
| 2026-11-17 | done | ~~Make web CI pass with the build gate: synthetic online-generation inputs for the e2e build and stubbed identity in the Storybook journeys~~ | [details](antsy-aphid/api-protection.md) |

### iOS

| Date | Status | Description | Details |
|---|---|---|---|
| 2026-11-17 | open | Confirm the protection build inputs reach the built Info.plist (custom `INFOPLIST_KEY_*` settings are probably dropped) and settle the App Check auto-refresh setting | [details](antsy-aphid/api-protection.md) |
| 2026-11-15 | open | Register the staging bundle and Firebase iOS apps, and supply the protection build inputs | [details](antsy-aphid/api-protection.md) |
| 2026-11-15 | open | Build with full Xcode and verify App Attest, token refresh and unsupported-device denial on a physical device and TestFlight | [details](antsy-aphid/api-protection.md) |
| 2026-11-12 | open | Inventory drift between the iOS app and the web experience | [details](antsy-aphid/ios-port.md) |
| 2026-11-12 | open | Guided creation through `/context` and `/phrasebook`, with title and cover requests | [details](antsy-aphid/ios-port.md) |
| 2026-11-12 | open | Phrasebook landing and category sheets | [details](antsy-aphid/ios-port.md) |
| 2026-11-12 | open | Phrase breakdown | [details](antsy-aphid/ios-port.md) |
| 2026-11-12 | open | Stars and starred Review | [details](antsy-aphid/ios-port.md) |
| 2026-11-12 | open | v4 library and backup contracts from the card schema | [details](antsy-aphid/ios-port.md) |
| 2026-11-12 | open | Test the port against the v4 API on a physical device | [details](antsy-aphid/ios-port.md) |
| 2026-11-12 | open | VoiceOver, enlarged-text and thumb-reach checks of the ported app | [details](antsy-aphid/accessibility-pass.md) |
| 2026-11-15 | done | ~~Remove the retired `/translate` and `/generate-cards` calls~~ | [details](antsy-aphid/ios-port.md) |

## API + Server

### Admission control

| Date | Status | Description | Details |
|---|---|---|---|
| 2026-11-17 | open | Operator recovery: show reservation IDs in `status` and settlement logs, add a command that clears overshoot, and guard `reconcile` against running reservations | [details](antsy-aphid/api-protection.md) |
| 2026-11-17 | open | Detect and release a reservation that commits after the 4.5-second admission timeout | [details](antsy-aphid/api-protection.md) |
| 2026-11-17 | open | Keep CPU allocated for post-response settlement in `api/deploy.sh`, or settle before responding | [details](antsy-aphid/api-protection.md) |
| 2026-11-17 | open | Add an npm script for the Firestore emulator ledger suite, re-run it on the merged code, and run the API tests in CI | [details](antsy-aphid/api-protection.md) |
| 2026-11-17 | open | Audit housekeeping: pin `firebase-admin`, move the monitor image to Node 24, remove the unused module-level ledger functions, decide `allowScripts` for the Firebase packages | [details](antsy-aphid/api-protection.md) |
| 2026-11-17 | open | Review the pilot limits against the creation flow: shared dollar ceilings, global and per-caller concurrency, route weights and the per-caller daily allowance | [details](antsy-aphid/api-protection.md) |
| 2026-11-17 | open | Review the attempts admitted per topic (validation retries times rate-limit retries) against observed retry rates, and reconcile them with the rate-limit fallback | [details](antsy-aphid/api-protection.md) |
| 2026-11-17 | open | Measure the real cost of an eight-topic creation and replace the worst-case reserve estimate (bytes counted as tokens, full output cap, 1.25 margin) with a bound based on it | [details](antsy-aphid/api-protection.md) |
| 2026-11-15 | open | Provision separate nonproduction and production Firebase projects: app registrations, anonymous Auth, reCAPTCHA Enterprise keys, App Attest and the Firestore ledger database | [details](antsy-aphid/api-protection.md) |
| 2026-11-15 | open | Verify provider prices and the image reserve, then record the pricing verification date | [details](antsy-aphid/api-protection.md) |
| 2026-11-15 | open | Deploy the private runtime and JWT gateway to protected staging and re-audit every hostname, revision and IAM grant | [details](antsy-aphid/api-protection.md) |
| 2026-11-15 | open | Protected staging acceptance on every route with real SDK tokens: rejected evidence causes no provider work | [details](antsy-aphid/api-protection.md) |
| 2026-11-15 | open | 48 hours of protected staging observation, including 20 simultaneous requests decided within five seconds | [details](antsy-aphid/api-protection.md) |
| 2026-11-15 | open | Pause or retire the unauthenticated production path and the old service identity's privileges | [details](antsy-aphid/api-protection.md) |
| 2026-11-15 | open | Release protected web and migrated native builds together, re-audit every hostname, then resume admission | [details](antsy-aphid/api-protection.md) |
| 2026-11-15 | open | Decide how admission budgets the rate-limit fallback for English generation | [details](antsy-aphid/api-protection.md) |
| 2026-11-15 | in-progress | Caller authentication at the gateway | [details](antsy-aphid/api-protection.md) |
| 2026-11-15 | in-progress | Anonymous per-caller quotas | [details](antsy-aphid/api-protection.md) |
| 2026-11-15 | in-progress | Global concurrency and spend limits | [details](antsy-aphid/api-protection.md) |
| 2026-11-15 | in-progress | App attestation | [details](antsy-aphid/api-protection.md) |
| 2026-11-12 | open | Verify what the deployed gateway and Cloud Run service expose | [details](antsy-aphid/api-protection.md) |
| 2026-11-17 | done | ~~Give local development a working path under admission: without a Firebase project every request, including OPTIONS, returns 503~~ | [details](antsy-aphid/api-protection.md) |

### Robustness

| Date | Status | Description | Details |
|---|---|---|---|
| 2026-11-17 | open | Enforce the 64 KiB body limit before the Functions Framework parses the body, and answer malformed JSON with the controlled error contract | [details](antsy-aphid/api-protection.md) |
| 2026-11-15 | open | Stop logging learner seeds, raw provider output and error text by default | [details](antsy-aphid/api-protection.md) |
| 2026-11-15 | in-progress | Request size and rate bounds on every route | [details](antsy-aphid/api-protection.md) |
| 2026-11-15 | in-progress | Bounded fan-out per request | [details](antsy-aphid/api-protection.md) |
| 2026-11-15 | in-progress | Defined behavior when provider capacity or the spend limit runs out | [details](antsy-aphid/api-protection.md) |
| 2026-11-12 | open | Resist abuse of free-text inputs such as image prompts | [details](antsy-aphid/api-protection.md) |
| 2026-11-12 | open | Load and abuse test against staging shows quotas and spend limits holding | [details](antsy-aphid/api-protection.md) |

### Staging environment

| Date | Status | Description | Details |
|---|---|---|---|
| 2026-11-13 | open | Staging Cloud Run service and API Gateway, deployable with `api/deploy.sh` | [details](antsy-aphid/staging-environment.md) |
| 2026-11-13 | open | Staging web build pointed at the staging gateway | [details](antsy-aphid/staging-environment.md) |
| 2026-11-13 | open | Release procedure that deploys and checks staging before production | [details](antsy-aphid/staging-environment.md) |

### Monitoring

| Date | Status | Description | Details |
|---|---|---|---|
| 2026-11-17 | open | Alert on uncertain reservations and on pricing verification nearing its 30-day expiry | [details](antsy-aphid/monitoring.md) |
| 2026-11-15 | open | Provision the admission monitor job, alerts and cloud-invoice budget alert, and confirm delivery to the notification channel | [details](antsy-aphid/monitoring.md) |
| 2026-11-15 | open | Name the budget, privacy and incident owners | [details](antsy-aphid/monitoring.md) |
| 2026-11-12 | open | Dashboards for request outcomes by failure level, latency per route and provider spend | [details](antsy-aphid/monitoring.md) |
| 2026-11-12 | open | Error-rate and spend alerts, fired in a test | [details](antsy-aphid/monitoring.md) |
| 2026-11-12 | open | Budget caps or alerts in the OpenRouter and Google Cloud accounts | [details](antsy-aphid/monitoring.md) |

### Generation reliability

Non-prompt API work that makes `/phrasebook` English generation (DeepSeek v4.1 Flash through OpenRouter, `api/src/llms/openrouter.js`) valid, tolerant and fast enough for production. The endpoint behavior these items change is specified in [POST /phrasebook](../api/phrasebook.md).

| Date | Status | Description | Details |
|---|---|---|---|
| 2026-11-13 | open | Verify the latency and JSON fixes in production (fixes deployed 2026-11-13) | [details](antsy-aphid/production-verification.md) |
| 2026-11-13 | done | ~~Repair partially invalid English replies: drop, merge or flag broken items, retry only for unusable sections~~ | [details](antsy-aphid/reply-repair.md) |
| 2026-11-13 | done | ~~Route English generation by provider performance through OpenRouter~~ | [details](antsy-aphid/provider-routing.md) |
| 2026-11-13 | done | ~~Tolerate and flag count overruns in English generation~~ | [details](antsy-aphid/count-overruns.md) |
| 2026-11-13 | done | ~~Enforce valid JSON for English generation~~ | [details](antsy-aphid/valid-json.md) |

## Launch

| Date | Status | Description | Details |
|---|---|---|---|
| 2026-11-12 | open | Choose which clients ship, in what order, and to which first users | [details](antsy-aphid/launch-plan.md) |
| 2026-11-12 | open | Write the rollout and rollback steps | [details](antsy-aphid/launch-plan.md) |
| 2026-11-12 | open | Owner approves the launch plan, and the work it creates becomes rows on this page | [details](antsy-aphid/launch-plan.md) |

## Product + legal

### Business model

| Date | Status | Description | Details |
|---|---|---|---|
| 2026-11-13 | in-progress | Compare business models against the product principles and the cost to serve | [details](antsy-aphid/business-model.md) |
| 2026-11-13 | open | Price the annual plan and the trip pass, and define the trip pass | [details](antsy-aphid/business-model.md) |
| 2026-11-13 | open | Decide how many demo phrasebooks ship | [details](antsy-aphid/business-model.md) |
| 2026-11-13 | open | Decide whether paid plans need their own fair-use cap | [details](antsy-aphid/business-model.md) |
| 2026-11-13 | open | Decide whether to measure production cost for more languages (Chinese, Czech, Ukrainian, more Japanese) | [details](antsy-aphid/business-model.md) |
| 2026-11-13 | open | Log the chosen business model in decisions | [details](antsy-aphid/business-model.md) |
| 2026-11-13 | done | ~~Measure the cost to serve per phrasebook and per user~~ | [details](antsy-aphid/business-model.md) |

### Privacy

| Date | Status | Description | Details |
|---|---|---|---|
| 2026-11-15 | open | Cover the anonymous Firebase identity, App Check and reCAPTCHA signals and the admission ledger in the policy and the App Store declarations | [details](antsy-aphid/privacy.md) |
| 2026-11-12 | open | Write the privacy policy: what learners send, which providers receive it, logs and retention, on-device library | [details](antsy-aphid/privacy.md) |
| 2026-11-12 | open | Check the policy against the providers' data-retention terms | [details](antsy-aphid/privacy.md) |
| 2026-11-12 | open | Publish the policy at a stable URL linked from the web app and the store listing | [details](antsy-aphid/privacy.md) |
| 2026-11-12 | open | App Store privacy details that match the policy | [details](antsy-aphid/privacy.md) |

### Name

| Date | Status | Description | Details |
|---|---|---|---|
| 2026-11-12 | open | Trademark search in launch markets, plus App Store and domain availability | [details](antsy-aphid/name-trademark.md) |
| 2026-11-12 | open | Choose the final name and log it in decisions | [details](antsy-aphid/name-trademark.md) |
| 2026-11-12 | open | Use the name in the web manifest, the iOS app and the store listing | [details](antsy-aphid/name-trademark.md) |

## Notes

- 2026-11-15: The API protection baseline is in the repository, undeployed. The rows it implements are in progress until it is deployed and accepted in protected staging, and the provisioning, acceptance and release steps from its plan became rows. Its 2026-11-04 release policy (protected web and migrated native clients together, production generation paused until then) predates the 2026-11-13 web launch and awaits the owner's confirmation ([open questions](antsy-aphid/api-protection.md#open-questions)).
- 2026-11-14: The public-launch milestone became Launch: Antsy Aphid, split into sections whose rows are concrete tasks; the generation-reliability milestone became its Generation reliability subsection. Every row gates the launch; later work goes to the backlog (owner decisions).
