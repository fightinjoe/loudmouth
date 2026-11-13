---
kind: record
status: current
summary: Clear the 23 development-only npm audit findings in web/app and the deprecated packages npm ci reports.
verified: 2026-11-13
---

# Update web development dependencies

Part of the [backlog](../backlog.md).

- **What:** update `web/app` development dependencies to clear its npm audit findings, and replace deprecated transitive packages that `npm ci` reports: `sourcemap-codec@1.4.8`, `source-map@0.8.0-beta.0` and `glob@11.1.0` in `web/app`, `node-domexception@1.0.0` in `api/src`.
- **Why:** `npm audit` on 2026-11-12 reports 23 findings in `web/app` (3 low, 8 moderate, 12 high), all in development tooling: `npm audit --omit=dev` reports none, so nothing ships to learners. They still run on developer machines and in CI.
- **Done when:** `npm audit` in `web/app` reports no high findings, the deprecation warnings are gone or recorded here as blocked upstream, and the web checks pass (`npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run test:storybook`, `npm run build`).

## Result (2026-11-13)

`npm update` within the existing ranges plus `happy-dom` 20 → 21 leaves 6 findings (2 low, 4 moderate, no high). happy-dom 21 turns off CSS file and iframe loading by default; the unit tests load neither. The remaining findings (`glob`, `minimatch`, `deepmerge`, `@rollup/plugin-node-resolve`) all come through `vite-plugin-pwa` → `workbox-build@7.4.1`, the latest workbox-build; `vite-plugin-pwa` 2.0 still requires it.

Deprecations:

- **`sourcemap-codec@1.4.8`, `source-map@0.8.0-beta.0`:** gone; `workbox-build@7.4.1` uses non-deprecated versions.
- **`glob@11.1.0` (`web/app`): blocked upstream.** `workbox-build@7.4.1` requires `glob ^11.0.1`, and 11.1.0 is the last 11.x release.
- **`node-domexception@1.0.0` (`api/src`): blocked upstream.** One path is `@google/genai` → `google-auth-library` → `gaxios` → `node-fetch@3.3.2` (its latest) → `fetch-blob`, and even `fetch-blob@4.0.0` depends on it. The other path, `@anthropic-ai/sdk@0.39` → `formdata-node`, was left in place: a major SDK upgrade would not remove the warning.
- **`uuid@8.3.2` (`api/src`, newly deprecated): blocked upstream.** `@google-cloud/functions-framework@5.0.5` → `cloudevents@10.0.0` (both latest) requires `uuid ^8.3.2`.
