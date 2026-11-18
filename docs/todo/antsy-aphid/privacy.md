---
kind: record
status: current
summary: Write the privacy policy and store privacy disclosures covering what learners type and which model providers receive it.
verified: 2026-11-15
---

# Privacy policy and data handling

Part of [Launch: Antsy Aphid](../antsy-aphid.md).

- **What:** a public privacy policy and the App Store privacy details, covering what learners type (situations, answers, phrases sent for breakdown), which third-party model providers receive it, what the API logs and how long logs are kept, and that the library stays on the device. It also covers the persistent anonymous Firebase identity, the App Check, App Attest and reCAPTCHA anti-abuse signals those providers process, and the server-side admission ledger keyed by that identity.
- **Why:** owner accepted the suggestion, 2026-11-12. Requests are forwarded to third-party model providers selected in `api/src/llm-config.js` (English generation goes to DeepSeek and covers to Black Forest Labs, both through OpenRouter: [operations](../../api/operations.md#server-owned-model-selection), [`/phrasebook-image`](../../api/phrasebook-image.md)). The App Store requires a privacy policy and privacy details for any listing, and a public web launch needs the same policy. [API protection](../../api-design.md#api-protection) adds pseudonymous identity and anti-abuse processing: no visible account does not mean no personal or pseudonymous data is processed. API logs currently include learner seeds and raw provider output ([known gaps](api-protection.md#known-gaps-in-the-baseline)).
- **Done when:** the policy is published at a stable URL linked from the web app and the store listing, the App Store privacy details match it, and it is checked against the providers' data-retention terms.
