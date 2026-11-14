---
kind: record
status: current
summary: Stand up a hosted staging API, gateway and web so releases are verified before production is updated.
verified: 2026-11-13
---

# Hosted staging environment

Part of [Launch: Antsy Aphid](../antsy-aphid.md).

- **What:** Create a hosted staging environment: a separate Cloud Run service and API Gateway (deployable with `api/deploy.sh`), a staging web build pointed at that gateway with `VITE_API_URL`, and a release procedure that deploys and checks staging before production is touched.
- **Why:** Owner request, 2026-11-13, during the v4 release. Production has one Cloud Run service (`translation-api`) behind one gateway, and the web build defaults to that gateway (`GATEWAY_URL` in `web/app/src/js/phrasebook-api.ts`). The production web deploys from the `prod` branch through Vercel's Git integration. The v4 release could be verified only locally before replacing the live API, and the v3 web and v4 API are incompatible, so production was exposed until both were live. The [API protection](api-protection.md) todo also needs a staging deployment for load and abuse tests.
- **Done when:** Staging API, gateway and web are deployed from the repository with documented commands, isolated from production data and spend limits, and [API operations](../../api/operations.md#deployment-reference) and [web development](../../web/development.md#deployment) describe deploying and verifying staging before production.
