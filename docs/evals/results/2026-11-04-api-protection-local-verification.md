---
kind: record
status: current
summary: Local verification 2026-11-04 of the API protection baseline on its feature branch; API, Firestore-emulator, HTTP-boundary and web checks pass, with no cloud, device, native build or paid run.
verified: 2026-11-15
---

# Local verification of the API protection baseline

On 2026-11-04 the [API protection](../../api-design.md#api-protection) baseline (identity and App Check verification, the Firestore admission ledger, provider work bounds, the protected web and native request layers, deployment hardening and monitoring provisioning) was verified locally on its feature branch. The runs were made before that branch merged the changes `main` made between 2026-11-12 and 2026-11-15, including the v4 release, structured logging and the English-generation fallback, so they do not cover the merged code. Nothing was deployed and no paid request was made.

**Outcome:** passed locally. Everything that needs a cloud project, real registrations, a device or full Xcode was not run.

## What ran

| Check | Result |
|---|---|
| API suite | 151 tests passed, including bounded work, missing evidence, quota rejection, ambiguous upstream timeout accounting, and a failing-before, passing-after image-deadline response regression |
| Firestore emulator integration (`api/src/test/protection-ledger.integration.js`) | All 16 cases passed. Contention with 20 separate clients admitted exactly one final-budget request and exactly four global slots; crash and outage, unknown liability, reconciliation, overshoot, original UTC-window settlement and first-install status passed. The four-slot contention scenario completed in 3.60 seconds |
| Functions Framework over HTTP | Missing identity 401, approved preflight 204, forbidden origin 403, 65,537-byte JSON 413, invalid JSON or object 400, unsupported media 415. Malformed JSON is rejected by framework middleware before the application and may use an HTML error response |
| Throwaway HTTP harness with fake app verification and provider transport and real emulator transactions | Wrong app 403, paused 503, resume then `/context` 200, settlement of 280 micro-USD with zero remaining reserved units and active slots, pause then 503. No real provider was called |
| Web | 291 tests passed with the Node webstorage compatibility flag. The production build passed with explicitly synthetic public configuration and rejected missing configuration. A browser smoke displayed the recoverable generation-disabled state and saved-card review with no console errors |
| Deployment | `api/deploy.sh` syntax, environment rejection checks and all five gateway POST security declarations passed local checks. Monitoring provisioning ran only against an isolated fake cloud transport |
| Native | Firebase Swift dependencies resolved and a static review of the SDK integration passed |

## Findings

- With the checked-in rates, the reservation for one eight-topic phrasebook (128 maximum attempts) is estimated at $4.901115, before context, title and image. This is not verified provider pricing, and it does not guarantee three creations under the $10 daily ceiling. Image pricing is unset.
- Emulator latency and contention results are local evidence only; they say nothing about Firestore under real concurrency.
- The web checks are not real reCAPTCHA, Safari or PWA acceptance.
- The native pins were produced by the Swift 6.1.2 command-line resolver through a temporary manifest selecting the same three Firebase products, then saved as `Package.resolved` without the temporary manifest's origin hash. CommandLineTools was selected rather than full Xcode, so Xcode's resolver, native compilation and device acceptance did not run.
- During implementation `gcloud config list` showed no project or account, and no explicit GCP or Firebase project values were available, so live resources, billing, IAM, registrations and prices were not inspected. The checked-in gateway hostname is not evidence of project ownership.

## Not run

No deployment, billing activation, paid model request, live IAM audit, real app registration, notification delivery, monitor image build, physical App Attest or TestFlight acceptance, or 48-hour staging observation. Cloud IAM, flag and API compatibility and real alert delivery are staging acceptance evidence that local syntax checks cannot establish. The outstanding work is in the [API protection todo](../../todo/antsy-aphid/api-protection.md).
