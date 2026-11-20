---
kind: spec
status: current
summary: GitHub Actions CI — the docs check and web-app CI workflows, what each trigger and step does and why, shared conventions, and what CI does not cover.
sources: [.github/workflows/web-app-ci.yml, .github/workflows/docs-check.yml, web/app/playwright.config.js, web/app/playwright.storybook.config.js, scripts/check-docs.mjs]
verified: 2026-11-20
---

# Continuous integration

Two GitHub Actions workflows in `.github/workflows/` check every change that reaches `main` or a pull request. They verify; they deploy nothing and gate no deployment. Vercel builds the web app from the `prod` branch on its own, and the API is deployed by hand ([web deployment](../web/development.md#deployment), [API production](../api/operations.md#production)). A push to `prod` runs no workflow, so CI gives evidence about a release only if its commit was already pushed to `main`.

| Workflow | File | Runs on | Fails when |
|---|---|---|---|
| docs check | `docs-check.yml` | Every push to `main` and every pull request | `scripts/check-docs.mjs` reports an error |
| web-app CI | `web-app-ci.yml` | Pushes to `main` and pull requests that touch the web app's inputs | Typecheck, unit tests, end-to-end tests or Storybook journeys fail |

## Shared conventions

- **Node from `.nvmrc`.** Both workflows install Node with `node-version-file: .nvmrc`, so CI runs the version that development and deployment pin rather than a second copy of it. Node 24 is the single runtime ([decisions](../decisions.md), 2026-11-13).
- **First-party actions on major tags.** The workflows use only GitHub's own `actions/checkout` and `actions/setup-node`, at floating major tags such as `@v7`, so fixes inside a major arrive without upkeep. The cost is that a retagged release would run unreviewed code; these jobs limit what it could reach, because they hold a read-only token and no secrets. Upgrade the major when GitHub deprecates the runtime an action targets: v4 to v7 moved them from Node 20 to Node 24. Owner decision in [decisions](../decisions.md), 2026-11-20.
- **Read-only token.** Each workflow sets `permissions: contents: read`, so the job token can read the repository and nothing else, whatever the repository's default token setting is. Neither workflow writes back, comments or publishes.
- **Failures are read in the run.** Both Playwright configs switch to the `github` reporter under `CI`, which turns each failing test into an annotation on the run and pull request. No report artifact is uploaded: under `CI` the `github` reporter writes no report files to collect (owner decision, 2026-11-20). To dig into a failure, run the same command locally, where the `list` reporter prints each failure and the Storybook suite keeps a trace of every failed test in `test-results/`.

## docs check

Runs `node scripts/check-docs.mjs` on the checked-out tree. The script and what it checks are owned by [wiki conventions](../wiki.md#maintenance-operations).

- **Why it exists.** Before the wiki, nothing checked documentation links or paths and CI ignored documentation changes, so pages drifted from the code ([wiki decision](../decisions/2026-11-12-docs-wiki.md)). The same script runs before every commit in the worktree skills; CI catches changes that skipped it.
- **No path filter.** Pages cite code by backticked path and by `sources`, so a code-only change, such as renaming a file, can break the wiki. The check therefore runs on every change, not only on `docs/` edits.
- **Full history (`fetch-depth: 0`).** Staleness warnings compare each source's last commit date with the page's `verified` date. The default one-commit clone would date every source at the head commit and make most pages look stale.
- **Errors fail, warnings do not.** The script exits nonzero only on errors. Stale `verified` dates are warnings: they ask for a reading pass, which a machine cannot do.

## web-app CI

One job, working in `web/app`.

### Triggers

The job runs only when a change can affect the web app:

| Path | Why it triggers |
|---|---|
| `web/app/**` | The app itself |
| `api/src/schema/**` | The web app links the shared card schema as a local package (`@catchphrase/card-schema` in `web/app/package.json`) and compiles it during typecheck and build, so a schema change can break the web build |
| `.nvmrc` | Changes the Node version the job runs on |
| `.github/workflows/web-app-ci.yml` | A change to the workflow is tested by running it |

### Steps

| Step | What it does | Why |
|---|---|---|
| `actions/checkout` | Checks out the commit | — |
| `actions/setup-node` | Installs Node from `.nvmrc` and caches npm's download cache, keyed on `web/app/package-lock.json` | The cache makes `npm ci` faster; the lockfile key drops it whenever dependencies change |
| `npm ci` | Installs exactly the lockfile's dependencies | Reproducible installs: CI tests what the lockfile pins, and fails if `package.json` and the lockfile disagree |
| `npm run typecheck` | Compiles the shared schema, then runs `tsc --noEmit` | Vitest strips TypeScript types without checking them, so type errors would otherwise reach only the build. Running it before the browser steps fails fast |
| `npm test` | Vitest unit tests | Fast logic coverage without a browser |
| `npx playwright install --with-deps chromium` | Installs Chromium and its system libraries | Both Playwright suites use Chromium projects only, so no other browser is downloaded |
| `npm run test:e2e` | Builds the production bundle, serves it with `vite preview` and runs the specs in `web/app/e2e` on a mobile viewport (Pixel 7) | The production build is what ships and catches build-only failures a dev server hides. The viewport is mobile because the app is mobile-first. The build gets synthetic online-generation inputs ([build](../web/development.md#build)) |
| `npm run test:storybook` | Builds Storybook and runs the workbench journeys in `web/app/e2e/storybook` on mobile and desktop Chromium | Exercises full interaction journeys against production renderers and persistence, with fixture API responses instead of paid calls. Configuration and identity are stand-ins ([Storybook](../web/development.md#component-workbench-storybook)) |

Both Playwright configs set `forbidOnly` when `CI` is set, so a committed `test.only` fails the run instead of silently skipping every other test, and both use `retries: 0`, so a flaky test fails rather than passing on a retry. Neither suite calls a paid provider or needs a secret. The local command for each step is in the [web app skill](../skills/ajw_web_app.md).

## Not covered by CI

- **API.** No workflow runs `api/src` tests or the Firestore emulator ledger suite; this is a launch todo ([Admission control](../todo/antsy-aphid.md#admission-control)). API changes rely on the local checks in [API operations](../api/operations.md#tests-and-model-evals).
- **iOS.** Nothing builds or tests `ios/` ([iOS development](../ios/development.md)).
- **Evaluation tooling.** `bun test evals/pipelines` runs only locally ([evaluation guidance](../evals/index.md)).
- **Deployment.** As above, CI neither deploys nor blocks a deploy.
