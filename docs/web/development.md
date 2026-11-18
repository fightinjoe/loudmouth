---
kind: guide
status: current
summary: Web app development — setup, local API, build, Storybook, deployment, and the module map.
sources: [.nvmrc, web/app/package.json, web/app/vite.config.js, web/app/.env.local.example, web/app/src/js/api-config.ts, web/app/src/panes, web/app/src/components, web/app/src/stories/support]
verified: 2026-11-17
---

# Web app development

How to run, test, build and deploy the Catchphrase web client in `web/app/`. Architecture is in [architecture](architecture.md); coding rules are in [coding rules](coding-rules.md).

## Prerequisites

- Node.js 24 with its bundled npm. The repository root `.nvmrc` pins it; `engines` in `web/app/package.json` and `api/src/package.json` and the CI workflows follow it.

## Setup

Run package commands from `web/app/`, not `web/`. Use `api/src/` for API commands. After pulling dependency changes, run `npm ci` in both package directories.

npm blocks dependency install scripts that the `allowScripts` field of each `package.json` does not cover. `web/app` approves `esbuild` pinned to its installed versions and denies `fsevents`; `api/src` denies `protobufjs` (reasons in the [install scripts record](../todo/backlog/npm-install-scripts.md)). When an upgrade changes an approved package's version, `npm ci` warns that its script was blocked: review the new version and run `npm approve-scripts <pkg>` in that package. `npm approve-scripts --allow-scripts-pending` lists anything unreviewed.

```bash
npm install
```

## Development

```bash
npm run dev
```

Opens at `http://localhost:8000` by default. `VITE_DEV_PORT` in `.env.local` selects another port; startup fails if that port is occupied.

No manual TypeScript build is needed before `npm run dev` in either package. Both packages run `predev` to compile the shared card schema automatically. Vite transpiles the production web TypeScript; API handlers remain JavaScript and load the compiled shared schema.

Web source edits use Vite's normal hot reload. Shared-schema edits in `api/src/schema/index.ts` are **not continuously compiled**: restart both dev servers after changing that file. Vite forces dependency rebundling on startup, so ordinary `npm run dev` uses the freshly compiled schema rather than an older optimized copy; no manual `--force` is needed. Reload the browser and start a fresh flow. `npm run typecheck` performs strict checking; Vite transpilation does not.

A stale validator can reject a successful `/phrasebook-image` response and show “Illustration unavailable.” Failed saved illustrations do not automatically restart paid generation; refreshing dependencies fixes new creation flows, not already-saved failed states.

## Online generation configuration

There is no hosted gateway fallback. Saved reading, Review, stars, the library and backups work without online configuration; generation reports a controlled configuration error instead. `getApiConfiguration` in `web/app/src/js/api-config.ts` validates the inputs and accepts two shapes: all six below, or, on the development server only, `VITE_API_URL` alone pointing at a local API ([testing against a local API](#testing-against-a-local-api)). Setting some but not all of the five Firebase inputs is an error.

| Input | Source |
|---|---|
| `VITE_API_URL` | The intended protected gateway, or the local development API |
| `VITE_FIREBASE_API_KEY` | Registered Firebase web app public API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Registered Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | The environment's Firebase/GCP project |
| `VITE_FIREBASE_APP_ID` | The exact allowlisted web app ID |
| `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` | Registered reCAPTCHA Enterprise score-based site key |

Anonymous Auth, App Check and the browser's domain must be registered in that environment. Public Firebase configuration is not a credential. Never commit debug tokens. The client does not connect Firebase emulators or enable a debug provider by itself. How the client uses these inputs is in [architecture](architecture.md#service-boundary-and-local-library).

## Testing against a local API

Copy the example:

```bash
cp .env.local.example .env.local   # sets VITE_API_URL=http://localhost:8080; Firebase values are blank
```

With the Firebase values blank, `npm run dev` sends requests without credentials, and no Firebase code runs. The API must then run in local mode (`PROTECTION_ENV=local`); the whole procedure is in [API local development](../api/operations.md#local-mode). This shape is refused when the API URL is not a local host, and `import.meta.env.PROD` rules it out of every build, which also requires all six inputs. To exercise real verification instead, fill in the five values of the registered nonproduction Firebase web app and run the API in its `development` mode.

Then run both dev servers in separate terminals, starting from the repository root. Agents use the [start web server](../skills/ajw_start_web_server.md) and [start API server](../skills/ajw_start_api_server.md) skills instead, which place tmux panes and check readiness.

```bash
cd api/src && npm run dev     # serves the API on http://localhost:8080
cd web/app && npm run dev     # picks up VITE_API_URL from .env.local
```

`.env.local` is gitignored (`*.local`); Vite restarts pick up changes to it automatically. A local URL alone is not a bypass: whether a request needs credentials is the API's decision, and an API in `development` mode answers a request without them with 401.

Parallel feature worktrees get their own web, API and Playwright ports; see [add_worktree](../skills/add_worktree.md). Their servers are not started on creation; the same skills start them with the worktree's ports.

## Build

```bash
npm run build
```

Output goes to `dist/`. Includes a service worker for offline use. Fonts load from Google Fonts via `index.html`, not from bundled files or the service-worker precache. Without network access or a browser-cached font, system fallbacks render.

The build automatically compiles the shared schema, runs strict TypeScript checking, and bundles the web app. Keep the repository's `api/src/schema/` directory available when building the web package: its local package dependency is linked using the checked-in `.npmrc` (`install-links=false`). No separately checked-in compiled schema is needed.

Every build, staging mode included, requires the six [online generation inputs](#online-generation-configuration) and fails without them (`web/app/vite.config.js`). It also rejects HTTP or local API URLs, local auth domains, `demo-` projects, emulator hosts and debug-token environment settings. Starting the development server does not require online configuration. Do not invent registration values to make a build pass: a successful build is not verification evidence.

Unit tests run with `npm test`. On Node 25+, `vitest.config.js` starts test workers with `--no-experimental-webstorage` so happy-dom owns the isolated browser storage instead of Node's unrelated native Web Storage implementation.

## Component workbench (Storybook)

Run from `web/app/`:

```bash
npm run storybook          # http://localhost:6006, exact port
npm run build-storybook    # standalone output: storybook-static/
npm run test:storybook     # mobile and desktop Chromium; separate static server
```

The dev server binds to `0.0.0.0:6006` for LAN access. Open `http://<this-machine-LAN-IP>:6006` from another device on a trusted network. Sandbox and preview IDs use the shared `uuid()` helper backed by `crypto.getRandomValues`, which works on HTTP LAN origins where secure-context-only `crypto.randomUUID` is unavailable. The Storybook browser suite also runs with `randomUUID` disabled.

The browser suite uses port 6007; set `STORYBOOK_TEST_PORT` to another free port when a manual preview already occupies it. Install Chromium with `npx playwright install chromium` before running either browser suite. `npm run test:e2e` still tests the production app and excludes Storybook specs.

The catalog has four sections:

- **Foundations:** final-cascade colors, typography, spacing, surfaces/motion, and the icon registry. Values come from production CSS, including textbook overrides. Local component spacing is distinguished from shared tokens; this catalog does not invent a second theme.
- **Components:** real renderers and panel controllers, named states, semantic Controls, source references, constraints, and explicitly documented existing limitations.
- **Compositions:** library, phrasebook landing and chapter sheet (`Compositions/Phrasebook`: each category page, chapter menu, Starred tabs, collections, covers), language browse, pane stacks and responsive cases.
- **Interactions:** executable creation, stars, chapter navigation (`Interactions/Phrasebook`), header collapse, Starred tabs/landing rows, reorder, details, Review, settings/export and lifecycle journeys. These remain manually interactive after the scripted play.

Live stories provide a collapsible **Workbench** control outside the app: **Resolve** and **Fail** settle pending fixture requests, and **Reset scenario** disposes the UI and reseeds the scene. Reset returns to the initial scene; use Storybook's interaction replay to rerun a journey. Controls-only remounts preserve sandbox persistence. The event log records requests, silent speech and scenario milestones. Accessibility findings remain visible in the addon; reduced-motion specimens use the actual browser/system preference, not replacement CSS. The current Card playground exposes an axe `label-content-name-mismatch` finding; a green interaction run is not an accessibility certification. Browser checks cover desktop and mobile Chromium, not physical iOS gestures, Safari speech, or VoiceOver.

Each preview document owns a `catchphrase-storybook.<random-id>` IndexedDB and matching preference/cache prefixes. Production persistence, request serialization and schema validation remain real. Only storage naming, API transport and speech side effects are isolated: no generation credentials, paid requests, real audio or user-library reset. Live Docs canvases use separate iframes to avoid shared IDs, state and focus ownership. Fonts still load from Google Fonts; offline screenshots may show the same fallback fonts as the app.

Stories live in `src/stories/{foundations,components,compositions,interactions}`. Add a named state beside its existing family, import the production renderer/controller, and use `src/stories/support/fixtures.ts` for validated data. `src/stories/support/scenario.ts:appStory` supplies serialized setup, a real `mountApp` and teardown; controller mount callbacks must return `dispose`, not animated `close`. Pure specimens can use `src/stories/support/mounted-story.ts` when they own listeners. Use `Meta<Args>` and `StoryObj<Args>` from `@storybook/html-vite` (its generic is the args type, not `typeof meta`). Keep compound markup out of stories, and update affected stories with production component changes. The zero-question creation route is controller-only: the current real `/context` validator requires at least one question.

Storybook uses `.storybook/vite.config.ts`, not the app's PWA build configuration, and does not install a service worker. Both entry points import `src/styles/app.css` in the same cascade order. The linked CommonJS schema build options are also applied in `.storybook/main.ts:viteFinal`, because Storybook otherwise drops user Vite build options except `target`.

## Deployment

- **Web:** Vercel's Git integration builds and publishes production (`https://loudmouth-gilt.vercel.app`) from the `prod` branch; release with `git push origin main:prod` (fast-forward only) after any API change the web depends on is live. A local build is `npm ci` and `npm run build` in `web/app/`. Supply the six registered [online generation inputs](#online-generation-configuration) to the build environment first; Vite embeds these public values at build time. Whether the protected build is live is in [production state](../api/operations.md#production).
- **API via `api/deploy.sh`:** run the existing deployment script from `api/`. No manual local compilation is required. Google's Node buildpack runs the `gcp-build` hook in `api/src/package.json`, compiling `schema/dist/` before pruning development dependencies. Do not disable this hook with an empty `GOOGLE_NODE_RUN_SCRIPTS`. See [API deployment documentation](../api/operations.md#deployment-reference) for credentials and configuration.
- **Custom API deployment:** run `npm ci && npm run schema:build` in `api/src/` during the build stage and include `schema/dist/` in the deployed artifact. Compile before pruning development dependencies. Raw Functions Framework or Node startup bypasses `predev` and requires this compiled output; production startup deliberately does not require the TypeScript compiler.

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

`src/js/main.ts` initializes the library, then `src/js/router.ts` passes hash parameters to `src/panes/app.ts`. The app mounts the shell, content, details, and action layers and registers their namespaced transitions with `src/js/uiState.ts`. Typed slice and transition payload contracts live in `src/js/app-types.ts`; pane event handlers receive a shared `Host`, not a mutable app context.

`mountApp(root, params)` returns `{ ui, dispose }`; the router disposes the previous mount before replacement. `initApp` always installs the `window.__loudmouth` debug hook, in production builds too, and removes it on dispose. Panel `close()` retains its user-facing animation, while `dispose()` synchronously releases owner resources without a user-dismiss callback. Bottom-sheet `onDispose` runs once at close/disposal start, so cancellation does not wait for a transition. Bound illustration persistence may finish after ordinary sheet close; disposed app owners cannot receive stale UI updates.

### Panes (`src/panes/`)

| File | Responsibility |
|------|---------------|
| `app.ts` | Shell markup, state registration, pane mounting, last-opened phrasebook |
| `nav-pane.ts` | Illustrated welcome, seeded creation ideas, complete library shelves, language browsing |
| `content-pane.ts` | Phrasebook landing/browse state, header collapse, chapter sheet (open/close, scroll to section, Starred tabs, chapter menu, focus), reorder mode, pane coordination |
| `content-pane-load.ts` | Load stored and language-wide content |
| `content-pane-render.ts` | Landing markup (title layer, illustration, Starred slot, chapter list, Review tray, sheet shell) and language-browse lists |
| `content-pane-actions.ts` | Stars, audio, details entry, section-local reordering |
| `content-pane-gestures.ts` | Shell swipe, mouse dragging of landing rows and the Starred pager, landing-row keys, section-local reorder |
| `details-pane.ts` | On-demand phrase analysis, candidate stars, modal focus and expansion |
| `action-pane.ts` | Lifecycle for creation, Review, settings, JSON |

Cross-pane communication uses named state transitions. Stable pane roots use delegated handlers; action panels own their mounted listeners and cleanup. Keep asynchronous ownership and cancellation within the pane or panel that starts the work.

### Components and API clients

`src/components/` contains both markup renderers (`card.ts`, `source-context.ts`, `phrase-breakdown.ts`, and the phrasebook view's `phrasebook-title.ts`, `chapter-card.ts`, `chapter-sheet.ts`) and interactive panel controllers (`creation-panel.ts`, `review-panel.ts`, `bottom-sheet.ts`). Controllers explicitly own mounting and teardown; renderers receive data and return markup. `src/js/phrasebook-chapters.ts` derives topics, the four category chapters (Words, Key phrases, Exchanges, Conversation), the Starred chapter and supplemental collections from joined entries. Web card-content editing is removed; phrasebook settings and card reordering remain.

Standalone Storybook entries also expose **Phrasebook**, **Language**, **Textarea**, **BreakdownPhrase**, and **BreakdownCard**, rather than requiring a full library or dialog scene. `book.ts` and `language.ts` supply the actual navigation tiles; `creation-text-area.ts` owns the shared situation-field markup, auto-growth, the submit and clear controls, Enter-to-submit and disposable input listeners. The creation controller retains request invalidation and submission. Breakdown specimens reuse `renderSource` and `renderExplanations` directly; their standalone save controls log actions, while `PhraseBreakdown` and interaction stories exercise actual persistence. **Components/ChapterCard**, **Components/ChapterSheet**, and **PhrasebookTitle** render the phrasebook view's landing cards, sheet states, and title layer from the production renderers.

`src/js/phrasebook-api.ts` validates creation responses against `@catchphrase/card-schema` and attaches the credentials that `api-identity.ts` obtains; `api-config.ts` validates the build inputs ([service boundary](architecture.md#service-boundary-and-local-library)). `phrasebook-illustration.ts` manages independent cover work; `phrase-breakdown.ts` validates and caches disposable analysis. `ability.ts` and `lang.ts` define the client enums reused by storage validation. Preferences remain separate from durable library content.

### Phrasebook view

Behavior is owned by [design](../design.md#phrasebook-view); the visual reference is `explorations/phrasebook-organization/PHRASEBOOK_ORGANIZATION.html`. In code, content state tracks `chapterKey` (`category:words`, `category:phrases`, `category:exchanges`, `category:conversation`, `starred`, or a collection key; `null` for the landing) and `starredTab`; `content/open-chapter`, `content/select-tab` and `content/close-chapter` drive the chapter sheet. `COLLAPSE_AT`/`EXPAND_AT` in `src/panes/content-pane.ts` set the title-bar thresholds. `src/styles/textbook.css` owns shared textbook tokens; local neutral artwork, including the header illustration mask, lives in `public/textbook/`.

### Storage and exchange

`src/js/db.ts` owns the Dexie library: atomic phrasebook commits, canonical card identity, membership stars, occurrences, topic Word placements, historical evidence, and backup/restore (`exportAllData`, `restoreAllData`). The data model and lifecycle rules are owned by the [card schema](../card-schema.md). `src/components/json-panel.ts` exports CardBatch JSON through the shared schema validator. There is no URL-import handler; `#deck?id=` selects a stored phrasebook.
