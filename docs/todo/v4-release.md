---
kind: ledger
status: current
summary: v4 release milestone and the owner of release and deployment status for the v4 API, gateway, web and iOS.
sources: [api/config/api-gateway.yaml, api/deploy.sh]
verified: 2026-11-13
statuses: [open, in-progress, blocked, done]
---

# v4 release

## Release status

This page owns release and deployment status; other pages link here instead of restating it.

- **API and gateway:** v4 deployed on 2026-11-13: Cloud Run revision `translation-api-00017-6qp` on the Node.js 24 base image, gateway config `translation-api-config-20261113-094027`. Live checks are in the [release record](../evals/results/2026-11-13-v4-live-release.md).
- **Web:** v4 is not deployed yet. Production serves the v3 bundle from the `prod` branch (Vercel Git integration), which does not work with the v4 API.
- **English-generation prompt:** prompt candidate 4 (`api/src/phrasebook/prompt.txt`) is live with the API and passed the post-deploy spot-check.
- **Native iOS:** unchanged by v4 and outside this milestone. It still calls the retired `/generate-cards` and `/translate` routes (`ios/Loudmouth/Screens/GenerateCards/GenerateCardsView.swift`, `ios/Loudmouth/Screens/Translation/TranslationView.swift`), which neither the API nor the gateway configuration serves. The port is tracked in [public launch](public-launch/ios-port.md).

Deployment mechanics are in [API operations](../api/operations.md#deployment-reference).

## Todos

| Date | Status | Description | Details |
|---|---|---|---|
| 2026-11-13 | done | Pin one Node.js version across local development, CI and Cloud Run | [details](v4-release/node-version.md) |
| 2026-11-13 | done | Fix the 11 production npm audit findings in the API, one critical, before deploying | [details](v4-release/api-dependency-vulnerabilities.md) |
| 2026-11-12 | open | Coordinated API, gateway and web release with a live end-to-end check | [details](v4-release/coordinated-release.md) |
| 2026-11-13 | done | Deploy the revised English-generation prompt and spot-check live output | [details](v4-release/deploy-english-prompt.md) |
