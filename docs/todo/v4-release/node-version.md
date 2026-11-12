---
kind: record
status: current
summary: Choose one supported Node.js major and pin it for local development, CI and the Cloud Run build; clear engine warnings.
verified: 2026-11-12
---

# Pin one Node.js version

Part of the [v4 release](../v4-release.md) milestone.

- **What:** choose one supported Node.js major and pin it everywhere: `engines` in `api/src/package.json` and `web/app/package.json`, a repository version file for local tools, and the CI `node-version`. Confirm dependency engine ranges accept it.
- **Why:** `api/src/package.json` declares `node >=20.12` and `api/deploy.sh` deploys from source (`gcloud run deploy --source`), so the Cloud Run build chooses the production version from that open range; which version it picks has not been checked. CI uses Node 22 (`.github/workflows/web-app-ci.yml`), the workstation has Node 26.12.1, and `npm ci` on 2026-11-12 warned that `cloudevents@8.0.3`, pulled in by `@google-cloud/functions-framework`, declares `node >=16 <=22`.
- **Done when:** one version is pinned in `engines`, a version file and CI; `npm ci` in both packages shows no engine warning; the deployed revision is confirmed to run that version.
