---
kind: ledger
status: current
summary: "Launch: Antsy Aphid, the first public launch: web and iOS client work, API protection, staging, monitoring and generation reliability, the launch plan, and business model, privacy and naming; plus dated notes on changes of direction."
verified: 2026-11-14
statuses: [open, in-progress, blocked, done]
---

# Launch: Antsy Aphid

The first public launch: everything that must be done before Catchphrase is open to the public. Every row gates the launch; work that can ship after it goes to the [backlog](backlog.md). Production deployment state is owned by [API operations](../api/operations.md#production). Naming, sections and the release notes written at the end follow [launch milestones](../wiki.md#launch-milestones).

| Section | Open | In progress | Blocked | Done |
|---|---|---|---|---|
| Client › Web | 5 | 0 | 0 | 0 |
| Client › iOS | 9 | 0 | 0 | 0 |
| API + Server › Admission control | 5 | 0 | 0 | 0 |
| API + Server › Robustness | 5 | 0 | 0 | 0 |
| API + Server › Staging environment | 3 | 0 | 0 | 0 |
| API + Server › Monitoring | 3 | 0 | 0 | 0 |
| API + Server › Generation reliability | 1 | 0 | 0 | 4 |
| Launch | 3 | 0 | 0 | 0 |
| Product + legal › Business model | 5 | 1 | 0 | 1 |
| Product + legal › Privacy | 4 | 0 | 0 | 0 |
| Product + legal › Name | 3 | 0 | 0 | 0 |
| **Total** | **46** | **1** | **0** | **5** |

## Client

### Web

| Date | Status | Description | Details |
|---|---|---|---|
| 2026-11-12 | open | Request persistent storage and handle a refusal | [details](antsy-aphid/library-durability.md) |
| 2026-11-12 | open | Decide and ship the install-to-home-screen and backup-reminder prompts | [details](antsy-aphid/library-durability.md) |
| 2026-11-12 | open | Check library eviction on iOS Safari on a device and state the durability guarantees | [details](antsy-aphid/library-durability.md) |
| 2026-11-12 | open | VoiceOver, enlarged-text and thumb-reach checks on physical phones | [details](antsy-aphid/accessibility-pass.md) |
| 2026-11-12 | open | Check iOS Safari gesture conflicts with long press and swipes | [details](antsy-aphid/accessibility-pass.md) |

### iOS

| Date | Status | Description | Details |
|---|---|---|---|
| 2026-11-12 | open | Inventory drift between the iOS app and the web experience | [details](antsy-aphid/ios-port.md) |
| 2026-11-12 | open | Guided creation through `/context` and `/phrasebook`, with title and cover requests | [details](antsy-aphid/ios-port.md) |
| 2026-11-12 | open | Phrasebook landing and category sheets | [details](antsy-aphid/ios-port.md) |
| 2026-11-12 | open | Phrase breakdown | [details](antsy-aphid/ios-port.md) |
| 2026-11-12 | open | Stars and starred Review | [details](antsy-aphid/ios-port.md) |
| 2026-11-12 | open | v4 library and backup contracts from the card schema | [details](antsy-aphid/ios-port.md) |
| 2026-11-12 | open | Remove the retired `/translate` and `/generate-cards` calls | [details](antsy-aphid/ios-port.md) |
| 2026-11-12 | open | Test the port against the v4 API on a physical device | [details](antsy-aphid/ios-port.md) |
| 2026-11-12 | open | VoiceOver, enlarged-text and thumb-reach checks of the ported app | [details](antsy-aphid/accessibility-pass.md) |

## API + Server

### Admission control

| Date | Status | Description | Details |
|---|---|---|---|
| 2026-11-12 | open | Verify what the deployed gateway and Cloud Run service expose | [details](antsy-aphid/api-protection.md) |
| 2026-11-12 | open | Caller authentication at the gateway | [details](antsy-aphid/api-protection.md) |
| 2026-11-12 | open | Anonymous per-caller quotas | [details](antsy-aphid/api-protection.md) |
| 2026-11-12 | open | Global concurrency and spend limits | [details](antsy-aphid/api-protection.md) |
| 2026-11-12 | open | App attestation | [details](antsy-aphid/api-protection.md) |

### Robustness

| Date | Status | Description | Details |
|---|---|---|---|
| 2026-11-12 | open | Request size and rate bounds on every route | [details](antsy-aphid/api-protection.md) |
| 2026-11-12 | open | Bounded fan-out per request | [details](antsy-aphid/api-protection.md) |
| 2026-11-12 | open | Defined behavior when provider capacity or the spend limit runs out | [details](antsy-aphid/api-protection.md) |
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

- 2026-11-14: The public-launch milestone became Launch: Antsy Aphid, split into sections whose rows are concrete tasks; the generation-reliability milestone became its Generation reliability subsection. Every row gates the launch; later work goes to the backlog (owner decisions).
