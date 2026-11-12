---
kind: record
status: current
summary: Clear the 23 development-only npm audit findings in web/app and the deprecated packages npm ci reports.
verified: 2026-11-12
---

# Update web development dependencies

Part of the [backlog](../backlog.md).

- **What:** update `web/app` development dependencies to clear its npm audit findings, and replace deprecated transitive packages that `npm ci` reports: `sourcemap-codec@1.4.8`, `source-map@0.8.0-beta.0` and `glob@11.1.0` in `web/app`, `node-domexception@1.0.0` in `api/src`.
- **Why:** `npm audit` on 2026-11-12 reports 23 findings in `web/app` (3 low, 8 moderate, 12 high), all in development tooling: `npm audit --omit=dev` reports none, so nothing ships to learners. They still run on developer machines and in CI.
- **Done when:** `npm audit` in `web/app` reports no high findings, the deprecation warnings are gone or recorded here as blocked upstream, and the web checks pass (`npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run test:storybook`, `npm run build`).
