# Catchphrase

A mobile-first personal language textbook for Chinese, Japanese, Spanish, Czech, and Ukrainian.

## Prerequisites

- Node.js 20.19+ (below 22), or 22.12+; Node 22 is used in CI
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

Unit tests run with `npm test`. On Node 25+, `vitest.config.js` starts test workers with
`--no-experimental-webstorage` so happy-dom owns the isolated browser storage instead of Node's
unrelated native Web Storage implementation.

## Component workbench (Storybook)

Run from `web/app/`:

```bash
npm run storybook          # http://localhost:6006, exact port
npm run build-storybook    # standalone output: storybook-static/
npm run test:storybook     # mobile and desktop Chromium; separate static server
```

The dev server binds to `0.0.0.0:6006` for LAN access. Open
`http://<this-machine-LAN-IP>:6006` from another device on a trusted network.
Sandbox and preview IDs use the shared `uuid()` helper backed by `crypto.getRandomValues`,
which works on HTTP LAN origins where secure-context-only `crypto.randomUUID` is unavailable.
The Storybook browser suite also runs with `randomUUID` disabled.

The browser suite uses port 6007; set `STORYBOOK_TEST_PORT` to another free port
when a manual preview already occupies it. Install Chromium with
`npx playwright install chromium` before running either browser suite.
`npm run test:e2e` still tests the production app and excludes Storybook specs.

The catalog has four sections:

- **Foundations:** final-cascade colors, typography, spacing, surfaces/motion, and the icon registry.
  Values come from production CSS, including textbook overrides. Local component spacing is
  distinguished from shared tokens; this catalog does not invent a second theme.
- **Components:** real renderers and panel controllers, named states, semantic Controls,
  source references, constraints, and explicitly documented existing limitations.
- **Compositions:** library, phrasebook landing and chapter sheet (`Compositions/Phrasebook`: each
  category page, chapter menu, Starred tabs, collections, covers), language browse, pane stacks and
  responsive cases.
- **Interactions:** executable creation, stars, chapter navigation (`Interactions/Phrasebook`),
  header collapse, Starred tabs/landing rows, reorder, details, Review, settings/export, suggestion
  and lifecycle journeys. These remain manually interactive after the scripted play.

Live stories provide a collapsible **Workbench** control outside the app: **Resolve** and **Fail**
settle pending fixture requests, and **Reset scenario** disposes the UI and reseeds the scene.
Reset returns to the initial scene; use Storybook's interaction replay to rerun a journey.
Controls-only remounts preserve sandbox persistence. The event log records requests,
silent speech and scenario milestones. Accessibility findings remain visible in the addon;
reduced-motion specimens use the actual browser/system preference, not replacement CSS.
The current Card playground exposes an axe `label-content-name-mismatch` finding; a green
interaction run is not an accessibility certification. Browser checks cover desktop and mobile
Chromium, not physical iOS gestures, Safari speech, or VoiceOver.

Each preview document owns a `catchphrase-storybook.<random-id>` IndexedDB and matching
preference/cache prefixes. Production persistence, request serialization and schema validation
remain real. Only storage naming, API transport and speech side effects are isolated:
no generation credentials, paid requests, real audio or user-library reset. Live Docs canvases
use separate iframes to avoid shared IDs, state and focus ownership. Fonts still load from
Google Fonts; offline screenshots may show the same fallback fonts as the app.

Stories live in `src/stories/{foundations,components,compositions,interactions}`. Add a named
state beside its existing family, import the production renderer/controller, and use
`support/fixtures.ts` for validated data. `support/scenario.ts:appStory` supplies serialized
setup, a real `mountApp` and teardown; controller mount callbacks must return `dispose`,
not animated `close`. Pure specimens can use `support/mounted-story.ts` when they own listeners.
Use `Meta<Args>` and `StoryObj<Args>` from `@storybook/html-vite` (its generic is the args type,
not `typeof meta`). Keep compound markup out of stories, and update affected stories with
production component changes. The zero-question creation route is controller-only:
the current real `/context` validator requires at least one question.

Storybook uses `.storybook/vite.config.ts`, not the app's PWA build configuration, and does not
install a service worker. Both entry points import `src/styles/app.css` in the same cascade order.
The linked CommonJS schema build options are also applied in `main.ts:viteFinal`, because
Storybook otherwise drops user Vite build options except `target`.

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

**Breaking v4 rollout:** a future API/gateway/web release must be coordinated. Phrasebook responses
and library backups are v4; common CardBatch imports and breakdown exchange remain v2.
The fresh web library is `loudmouth-topic-v4`, with durable exchange/family titles and order,
explicit per-turn response occurrences, linear example occurrences, and family-local Word placements.
Old databases/preferences remain physically untouched, with no old phrasebook reader, conversion,
or restore. Reload marks interrupted pending cover work failed without paid retries.
This promotion changes API and web code only; it does not authorize or perform deployment.
Native iOS's retired-route integration remains unchanged.

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

`mountApp(root, params)` returns `{ ui, dispose }`; the router disposes the previous mount before
replacement. `initApp` owns the production `window.__loudmouth` debug hook. Panel `close()` retains
its user-facing animation, while `dispose()` synchronously releases owner resources without a
user-dismiss callback. Bottom-sheet `onDispose` runs once at close/disposal start, so cancellation
does not wait for a transition. Bound illustration persistence may finish after ordinary sheet
close; disposed app owners cannot receive stale UI updates.

### Panes (`src/panes/`)

| File | Responsibility |
|------|---------------|
| `app.ts` | Shell markup, state registration, pane mounting, last-opened phrasebook |
| `nav-pane.ts` | Illustrated welcome, seeded creation ideas, complete library shelves, language browsing |
| `content-pane.ts` | Phrasebook landing/browse state, header collapse, chapter sheet (open/close, scroll to section, Starred tabs, chapter menu, focus), reorder mode, pane coordination |
| `content-pane-load.ts` | Load stored, suggested-preview, and language-wide content |
| `content-pane-render.ts` | Landing markup (title layer, illustration, Starred slot, chapter list, Review tray, sheet shell) and language-browse lists |
| `content-pane-actions.ts` | Stars, audio, details entry, section-local reordering |
| `content-pane-gestures.ts` | Shell swipe, mouse dragging of landing rows and the Starred pager, landing-row keys, section-local reorder |
| `details-pane.ts` | On-demand phrase analysis, candidate stars, modal focus and expansion |
| `action-pane.ts` | Lifecycle for creation, suggestion confirmation, Review, settings, JSON |

Cross-pane communication uses named state transitions. Stable pane roots use delegated handlers;
action panels own their mounted listeners and cleanup. Keep asynchronous ownership and cancellation
within the pane or panel that starts the work.

### Components and API clients

`src/components/` contains both markup renderers (`card.ts`, `source-context.ts`,
`phrase-breakdown.ts`, and the phrasebook view's `phrasebook-title.ts`, `chapter-card.ts`,
`chapter-sheet.ts`) and interactive panel controllers (`creation-panel.ts`, `review-panel.ts`,
`bottom-sheet.ts`). Controllers explicitly own mounting and teardown; renderers receive data and
return markup. `src/js/phrasebook-chapters.ts` derives topics, the four category chapters (Words,
Key phrases, Exchanges, Conversation), the Starred chapter and supplemental collections from joined
entries. Web card-content editing is removed; phrasebook settings and card reordering remain.

Standalone Storybook entries also expose **Phrasebook**, **Language**, **Textarea**,
**BreakdownPhrase**, and **BreakdownCard**, rather than requiring a full library or dialog scene.
`book.ts` and `language.ts` supply the actual navigation tiles; `creation-text-area.ts` owns
the shared situation-field markup, auto-growth, clear control and disposable input listeners.
The creation controller retains request invalidation and submission. Breakdown specimens reuse
`renderSource` and `renderExplanations` directly; their standalone save controls log actions,
while `PhraseBreakdown` and interaction stories exercise actual persistence.
**Components/ChapterCard**, **Components/ChapterSheet**, and **PhrasebookTitle** render the
phrasebook view's landing cards, sheet states, and title layer from the production renderers.

`src/js/phrasebook-api.ts` validates creation responses against `@catchphrase/card-schema`.
`phrasebook-illustration.ts` manages independent cover work; `phrase-breakdown.ts` validates and
caches disposable analysis. `ability.ts` and `lang.ts` define the client enums reused by storage
validation. Preferences remain separate from durable library content.

### Phrasebook design

The web uses a personal-textbook design: warm paper, a fixed foreground speech-bubble title,
contextual illustrations, and white reading surfaces. The phrasebook view follows the "Organized by
category" design (iteration 6, superseding the iteration 5 topic decks) recorded in
`explorations/phrasebook-organization/PHRASEBOOK_ORGANIZATION.html`; behavior is
described in [the design doc](../../docs/DESIGN.md#phrasebook-view). `styles/textbook.css` owns
shared tokens, including the `--phrasebook-*` colors derived from one `--phrasebook-accent` (no
per-phrasebook accent is persisted yet); `textbook-navigation.css`, `textbook-content.css`, and
`textbook-creation.css` own their surfaces. Local neutral artwork, including the header illustration
mask, lives in `public/textbook/`. Ready saved PNGs fill the masked header illustration without
repeating or paid regeneration. Missing/failed/pending artwork uses repeating frog paper.

Creation retains its real language → situation → questions → checklist → generation lifecycle.
Example situations seed the form, not a generated preview. The landing shows a Starred card (only
while stars exist), one card per category with content (Words, Key phrases, Exchanges,
Conversation) whose row of deck cards is headed by family/exchange title (clustered per topic) or by
topic, and supplemental collections. Content state tracks `chapterKey` (the chapter open in the
chapter sheet: `category:words`, `category:phrases`, `category:exchanges`, `category:conversation`,
`starred`, or a collection; `null` for the landing) and `starredTab`; `content/open-chapter`,
`content/select-tab` (Starred only), and `content/close-chapter` drive the sheet. A category
chapter is one page across every topic; only Starred has Words/Phrases tabs, and its tab is
remembered per phrasebook for the session. **In context ›** opens the entry's category. The title
bar collapses past 150 px of landing scroll and expands below 110 px. Reorder is entered from the
sheet header and only within an open category or collection, per family, exchange turn, or topic
section; whole-exchange saving is not implemented.
The unchanged API generates watercolor covers, not seamless pattern assets. Physical-phone reach,
VoiceOver, and iOS Safari gestures require separate acceptance checks beyond desktop Chromium.

Historical feature-branch verification (2026-10-27, before v4 integration and the topic-decks
phrasebook view): production build/strict TypeScript passed, 240 web unit tests
and 129 API tests passed; all 12 browser cases passed across the final targeted runs after fixes.
Desktop Chromium exercised a live Spanish creation and save, stars/Review, live phrase breakdown,
Japanese suggested preview/Save, preserved seeded and retry inputs, cancellation, reduced motion,
and narrow rendering. A controlled offline request exercised the error surface. A resized neutral
image fixture verified late-artwork persistence without remounting cards or losing focus, scrolling,
or edit state; it is not evidence of generated art quality or verification of the integrated v4 UI.

Integrated v4 verification (2026-10-29, before the topic-decks phrasebook view replaced the
continuous textbook): 130 API tests, 253 web unit tests, strict TypeScript,
production build, and all 12 mobile Chromium Playwright cases passed. Web unit tests used
`NODE_OPTIONS=--no-experimental-webstorage` on Node 26. A separate 390px Chromium smoke checked
seeded first-time creation, a locally saved v4 four-section fixture, explicit reply alternatives,
starring, and Review reveal without horizontal overflow or console errors. This used no paid
provider calls and does not establish live generation quality or iOS Safari behavior.

### Storage and exchange

`src/js/db.ts` owns the seven-table Dexie library, atomic phrasebook commits, canonical card identity,
phrasebook-specific membership stars, occurrences, topic Word placements, and historical evidence.
Each topic stores **Things to say**, **Likely exchanges**, **Words** with family titles, and
**Example conversation**; the chapter sheet gathers them across topics as the Key phrases,
Exchanges, Words, and Conversation categories. Alternatives are explicit options within one
exchange turn; the example is linear. After final topic selection, commit removes only exact-English Things to say
already present in an earlier retained topic. Every exchange option, example line and family-local
Word placement survives; shared Words reuse canonical cards and membership without removing
placements across topics. Unchecked topics never suppress selected content. No API round trip or
model stage is added. Reorder is local to Things to say/example sections, one exchange turn's
options, or one Word family; durable titles, IDs and ordering survive reload and backup.
Phrasebook and language-wide reads share provenance retrieval while retaining different source
ordering: the active phrasebook's evidence first versus chronological ordering.

Library backup/restore uses v4; `components/json-panel.ts` exports v2 CardBatch content through the
shared schema. The library exposes validated import and backup/restore APIs; there is no
`#deck?cards=` URL-import handler. `#deck?id=` selects a stored phrasebook.
