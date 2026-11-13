---
kind: record
status: current
summary: Clear the high and critical npm audit findings in the API's production dependencies before the v4 deploy.
verified: 2026-11-13
---

# Fix API runtime dependency vulnerabilities

Part of the [v4 release](../v4-release.md) milestone.

- **What:** update `api/src` dependencies so `npm audit --omit=dev` reports no high or critical findings. Most have non-breaking fixes (`npm audit fix`). For `@google-cloud/functions-framework`, `cloudevents` and `uuid`, npm proposes only functions-framework 2.0.0, a downgrade from 3.5.1, so look for a fixed functions-framework release instead.
- **Why:** `npm audit` on 2026-11-12 against `api/src/package-lock.json` reports 11 findings, all in production dependencies: critical `proxy-addr`; high `body-parser`, `fast-uri`, `form-data`, `protobufjs`, `ws`; moderate `@google-cloud/functions-framework`, `@protobufjs/utf8`, `cloudevents`, `qs`, `uuid`. Only functions-framework is a direct dependency. They ship in the Cloud Run service this milestone deploys.
- **Remaining:** after upgrading to `@google-cloud/functions-framework` 5.0.5 (Express 5) and `npm audit fix`, `npm audit --omit=dev` reports three moderate findings in one chain: `uuid` 8.3.2 ([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)), `cloudevents` and `@google-cloud/functions-framework`. Upstream `cloudevents@10.0.0` (latest, required by functions-framework 5.0.5) still depends on `uuid ^8.3.2`; cloudevents calls only `uuid.v4()` without a buffer, and the advisory affects v3/v5/v6 with a caller-supplied buffer. npm's only proposed fix is a downgrade to functions-framework 2.0.0.
- **Done when:** `npm audit --omit=dev` in `api/src` reports no high or critical findings, any remaining moderate ones are listed here with the reason, `npm test` passes, and the fix ships with the [coordinated release](coordinated-release.md).
