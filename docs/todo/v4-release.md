---
kind: ledger
status: current
summary: v4 release milestone and the owner of release and deployment status for the v4 API, gateway, web and iOS.
sources: [api/config/api-gateway.yaml, api/deploy.sh]
verified: 2026-11-12
statuses: [open, in-progress, blocked, done]
---

# v4 release

## Release status

This page owns release and deployment status; other pages link here instead of restating it.

- **API, gateway and web:** the v4 phrasebook API, its gateway configuration (`api/config/api-gateway.yaml`) and the web client are implemented and were verified locally on 2026-10-29 (see the [results ledger](../evals/results.md)). None of them has been deployed.
- **English-generation prompt:** prompt candidate 4 is adopted in `api/src/phrasebook/prompt.txt` but ships only with the API deployment.
- **Native iOS:** unchanged by v4 and outside this milestone. It still calls the retired `/generate-cards` and `/translate` routes (`ios/Loudmouth/Screens/GenerateCards/GenerateCardsView.swift`, `ios/Loudmouth/Screens/Translation/TranslationView.swift`), which neither the API nor the gateway configuration serves.

Deployment mechanics are in [API operations](../api/operations.md#deployment-reference).

## Todos

| Date | Status | Description | Details |
|---|---|---|---|
| 2026-11-12 | open | Coordinated API, gateway and web release with a live end-to-end check | [details](v4-release/coordinated-release.md) |
| 2026-11-12 | open | Deploy the revised English-generation prompt and spot-check live output | [details](v4-release/deploy-english-prompt.md) |
