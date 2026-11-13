---
kind: record
status: current
summary: Approve or decline the install scripts npm 12 blocks (esbuild, fsevents, protobufjs) and commit the setting.
verified: 2026-11-13
---

# Decide which npm install scripts to allow

Part of the [backlog](../backlog.md).

- **What:** review the install scripts npm blocks, approve or decline each, and commit the setting so every checkout installs the same way: `esbuild` and `fsevents` in `web/app`, `protobufjs` in `api/src`.
- **Why:** npm 12.2.1 on the workstation blocks install scripts that its `allowScripts` setting does not cover; `npm ci` for a new worktree on 2026-11-12 skipped those three. Vite and the API still started, but esbuild's postinstall checks its native binary and the effect of skipping protobufjs's has not been checked. The pinned Node 24 bundles npm 11.19.1, which also skipped all three on 2026-11-13; CI installs with Node 24's bundled npm.
- **Done when:** each package is approved or declined with a reason recorded here, the setting is committed, `npm ci` in both packages runs without the blocked-scripts warning, and the web build and API tests pass.
