# Loudmouth

A mobile-first phrasebook and flashcard app for Chinese, Japanese, Spanish, Czech and Ukrainian.

## Prerequisites

- Node.js 20.12+
- npm 9+

## Setup

Run package commands from `web/app/`, not `web/`. Use `api/src/` for API commands.
After pulling dependency changes, run `npm ci` in both package directories.

```bash
npm install
```

## Development

```bash
npm run dev
```

Opens at `http://localhost:8000` by default. `VITE_DEV_PORT` in `.env.local`
selects another port; startup fails if that port is occupied.

No manual TypeScript build is needed before `npm run dev` in either package.
Both packages run `predev` to compile the shared card schema automatically.
Vite transpiles the production web TypeScript; API handlers remain JavaScript
and load the compiled shared schema.

Web source edits use Vite's normal hot reload. Shared-schema edits in
`api/src/schema/index.ts` are **not continuously compiled**: restart both dev servers after changing
that file. Vite forces dependency rebundling on startup, so ordinary `npm run dev` uses the freshly
compiled schema rather than an older optimized copy; no manual `--force` is needed. Reload the
browser and start a fresh flow. `npm run typecheck` performs strict checking; Vite transpilation does not.

A stale validator can reject a successful `/phrasebook-image` response and show “Illustration
unavailable.” Failed saved illustrations do not automatically restart paid generation; refreshing
dependencies fixes new creation flows, not already-saved failed states.

## Testing against a local API

By default the app calls the deployed Cloud API Gateway. To test against a
locally running API instead:

```bash
cp .env.local.example .env.local   # sets VITE_API_URL=http://localhost:8080
```

Then run both dev servers (in separate terminals, starting from the repository root):

```bash
cd api/src && npm run dev     # serves the API on http://localhost:8080
cd web/app && npm run dev     # picks up VITE_API_URL from .env.local
```

`.env.local` is gitignored (`*.local`); Vite restarts pick up changes to it
automatically. Remove or edit the file to switch back to the deployed API.

## Parallel worktrees

Keep the main checkout for integration and use sibling directories for features.
Repository-local skills share one implementation under `.agents/skills`; Claude
Code discovers the symlinked `.claude/skills` entries, and OMP discovers the
`.agents/commands` slash aliases.

```text
/add_worktree card-layout
/add_worktree card-layout --id 527
/merge_worktree 527
```

In Codex, use `$add_worktree` and `$merge_worktree` or the `/skills` picker.
Restart/reload the host if newly installed skills or commands are not visible.
Python 3, npm, tmux, OMP, and an existing `loudmouth` tmux session are required
for worktree creation. Commit the setup changes to main before using the skills:
creation deliberately requires clean main and branches from its committed state.

`/add_worktree` creates sibling `loudmouth-527-card-layout` on
`feat/527-card-layout`, installs each package's dependencies independently, and
configures web port **5270**, API port **5271**, and Playwright port **5272**.
The identifier is selected automatically unless supplied; valid identifiers are
103–999, excluding 172, 506, and 600 (browser-restricted ports). It checks existing
worktrees, directories, branches, and occupied ports.
It does not push. After installation it opens a detached tmux window named for the
worktree, with OMP at the worktree root on the left, the web server upper-right,
and the API server lower-right. Both dev servers are started in their panes;
check their output for readiness or startup errors.

The generated, ignored `web/app/.env.local` contains:

```dotenv
VITE_DEV_PORT=5270
VITE_API_URL=http://tiny:5271
PLAYWRIGHT_PORT=5272
```

The generated `api/.env.local` contains `PORT=5271`. Only the main checkout's
ignored `api/.env` credential file is copied, privately, when present; arbitrary
local files and frontend environment overrides are not copied. Missing API
credentials are reported rather than invented. `tiny` is the API host's Tailscale
MagicDNS name: remote browsers must be on the tailnet to reach the API. Open the
web app at `http://tiny:5270` remotely (or `http://localhost:5270` locally).

HTTP worktree origins are supported. Library and cover-task UUIDs share the
`crypto.getRandomValues` implementation; do not use the secure-context-only
`crypto.randomUUID` in this browser flow. Context initialization errors remain
visible with **Try again**, rather than leaving creation on the loading screen.

Run `npm run test:e2e` from that worktree's `web/app`. Playwright uses its own
preview port (default **4173** outside configured worktrees), and never reuses
an existing server. An explicit `PLAYWRIGHT_PORT` environment variable overrides
the file. Do not run simultaneous builds or E2E runs in the same worktree:
they share that worktree's `dist` and report directories.

Keep dependencies, build output, and browser origins separate. Distinct frontend
ports isolate IndexedDB, localStorage, and service workers. One active writer
per worktree; integrate features into main serially.

`/merge_worktree` requires clean source and main, verifies the integrated result,
squash-commits locally, removes the source worktree directory, and deletes its
branch. It never pushes or force-removes a worktree. Unknown ignored files or
changed local credentials must be preserved or explicitly approved for removal.
After a squash, start the next feature from updated main, not the retired branch.

## Build

```bash
npm run build
```

Output goes to `dist/`. Includes a service worker for offline use. Fonts load
from Google Fonts via `index.html`, not from bundled files or the service-worker
precache. Without network access or a browser-cached font, system fallbacks render.

The build automatically compiles the shared schema, runs strict TypeScript
checking, and bundles the web app. Keep the repository's `api/src/schema/`
directory available when building the web package: its local package dependency
is linked using the checked-in `.npmrc` (`install-links=false`). No separately
checked-in compiled schema is needed.

Unit tests run with `npm test`. On Node 25, use
`NODE_OPTIONS=--no-experimental-webstorage npm test` so happy-dom owns the isolated browser storage
instead of Node's unrelated native Web Storage implementation.

## Deployment

- **Web:** run `npm ci` and `npm run build` in `web/app/`, then deploy `dist/`
  to the static host. Set `VITE_API_URL` to the intended API before building if
  overriding the default gateway; Vite embeds it at build time.
- **API via `api/deploy.sh`:** run the existing deployment script from `api/`.
  No manual local compilation is required. Google's Node buildpack runs the
  `gcp-build` hook in `api/src/package.json`, compiling `schema/dist/` before
  pruning development dependencies. Do not disable this hook with an empty
  `GOOGLE_NODE_RUN_SCRIPTS`. See [API deployment documentation](../../api/README.md#deployment-reference)
  for credentials and configuration.
- **Custom API deployment:** run `npm ci && npm run schema:build` in `api/src/`
  during the build stage and include `schema/dist/` in the deployed artifact.
  Compile before pruning development dependencies. Raw Functions Framework or
  Node startup bypasses `predev` and requires this compiled output; production
  startup deliberately does not require the TypeScript compiler.

**Breaking v3 rollout:** API, gateway, and web must deploy together. Phrasebook responses and library
backups are v3; common CardBatch imports and breakdown exchange remain v2.
The new web library is `loudmouth-topic-v3`, with independent section occurrences and topic Word
placements. Old databases/preferences remain physically untouched, with no old phrasebook reader,
conversion, or restore. Reload marks interrupted pending cover work failed without paid retries.
The 2026-10-01 promotion changes production code only; it does not authorize or perform deployment.

## Preview production build

```bash
npm run preview
```

## Testing on iOS Safari

To test PWA installability ("Add to Home Screen"):

1. `npm run build`
2. Serve `dist/` over HTTPS (e.g. via ngrok or a deployment)
3. Open in iOS Safari → Share → Add to Home Screen

## App structure

### Startup and state

`src/js/main.ts` initializes the library, then `src/js/router.ts` passes hash parameters to
`src/panes/app.ts`. The app mounts the shell, content, details, and action layers and registers
their namespaced transitions with `src/js/uiState.ts`. Typed slice and transition payload contracts
live in `src/js/app-types.ts`; pane event handlers receive a shared `Host`, not a mutable app context.

### Panes (`src/panes/`)

| File | Responsibility |
|------|---------------|
| `app.ts` | Shell markup, state registration, pane mounting, last-opened phrasebook |
| `nav-pane.ts` | Recent phrasebooks, language browsing, creation entry point |
| `content-pane.ts` | Phrasebook/browse state, page selection, edit mode, pane coordination |
| `content-pane-load.ts` | Load stored, suggested-preview, and language-wide content |
| `content-pane-render.ts` | Contents, topic sections, supplemental collections, Starred markup |
| `content-pane-actions.ts` | Card actions, editing, stars, audio, details entry |
| `content-pane-gestures.ts` | Shell reveal, topic paging, section-local reorder |
| `content-pane-tab-motion.ts` | Tab scrolling, selection animation, reduced-motion handling |
| `details-pane.ts` | On-demand phrase analysis, candidate stars, modal focus and expansion |
| `action-pane.ts` | Lifecycle for creation, suggestion confirmation, Review, settings, editor, JSON |

Cross-pane communication uses named state transitions. Stable pane roots use delegated handlers;
action panels own their mounted listeners and cleanup. Keep asynchronous ownership and cancellation
within the pane or panel that starts the work.

### Components and API clients

`src/components/` contains both markup renderers (`card.ts`, `source-context.ts`,
`phrase-breakdown.ts`) and interactive panel controllers (`creation-panel.ts`, `review-panel.ts`,
`card-edit-panel.ts`, `bottom-sheet.ts`). Controllers explicitly own mounting and teardown; renderers
receive data and return markup.

`src/js/phrasebook-api.ts` validates creation responses against `@catchphrase/card-schema`.
`phrasebook-illustration.ts` manages independent cover work; `phrase-breakdown.ts` validates and
caches disposable analysis. `ability.ts` and `lang.ts` define the client enums reused by storage
validation. Preferences remain separate from durable library content.

### Storage and exchange

`src/js/db.ts` owns the seven-table Dexie library, atomic phrasebook commits, canonical card identity,
phrasebook-specific membership stars, occurrences, topic Word placements, and historical evidence.
Phrasebook and language-wide reads share provenance retrieval while retaining different source
ordering: the active phrasebook's evidence first versus chronological ordering.

Library backup/restore uses v3; `components/json-panel.ts` exports v2 CardBatch content through the
shared schema. The library exposes validated import and backup/restore APIs; there is no
`#deck?cards=` URL-import handler. `#deck?id=` selects a stored phrasebook.
