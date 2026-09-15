# Loudmouth

A mobile-first flashcard app for Chinese and Japanese vocabulary.

## Prerequisites

- Node.js 20.12+
- npm 9+

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Opens at `http://localhost:8000` by default. `VITE_DEV_PORT` in `.env.local`
selects another port; startup fails if that port is occupied.

## Testing against a local API

By default the app calls the deployed Cloud API Gateway. To test against a
locally running API instead:

```bash
cp .env.local.example .env.local   # sets VITE_API_URL=http://localhost:8080
```

Then run both dev servers (in separate terminals):

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
Python 3 and npm are required for worktree creation. Commit the setup changes
to main before using the skills: creation deliberately requires clean main and
branches from its committed state.

`/add_worktree` creates sibling `loudmouth-527-card-layout` on
`feat/527-card-layout`, installs each package's dependencies independently, and
configures web port **5270**, API port **5271**, and Playwright port **5272**.
The identifier is selected automatically unless supplied; valid identifiers are
103–999, excluding 172, 506, and 600 (browser-restricted ports). It checks existing
worktrees, directories, branches, and occupied ports.
It does not start servers or push.

The generated, ignored `web/app/.env.local` contains:

```dotenv
VITE_DEV_PORT=5270
VITE_API_URL=http://localhost:5271
PLAYWRIGHT_PORT=5272
```

The generated `api/.env.local` contains `PORT=5271`. Only the main checkout's
ignored `api/.env` credential file is copied, privately, when present; arbitrary
local files and frontend environment overrides are not copied. Missing API
credentials are reported rather than invented. Start `npm run dev` separately
in the new worktree's `api/src` and `web/app` directories.

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

### Entry point

`src/js/router.js` → `src/panes/app.js`

The router calls `initApp(params)` on every hash change. `app.js` builds the
static shell HTML, creates the shared `app` context object, and bootstraps the
two panes.

### The `app` context object

Passed by reference to every pane and gesture module. Contains:

```js
app.els.navPane      // #nav-pane — the nav list behind the content (stable DOM element)
app.els.handle       // .handle — transparent overlay on nav-main; gesture target
app.els.navMain      // #nav-main — the sliding shell that carries handle, scrim, and content-pane
app.els.contentPane  // #content-pane — the deck content area inside nav-main (re-rendered on deck switch)
app.els.scrim        // #nav-main-scrim — tap-to-close overlay when nav is open

app.navPane          // returned by wireNavPaneGesture: { open, close, setSuppressed, refresh }
app.contentPane      // set by buildContentPane: { loadDeck }

app.getLastDeckId()  // reads last-viewed deck from localStorage
app.setLastDeckId()  // writes last-viewed deck to localStorage
```

### Panes (`src/panes/`)

| File | Responsibility |
|------|---------------|
| `app.js` | Shell HTML, `app` object, gesture bootstrap, pane init sequence |
| `navPane.js` | Nav pane HTML renderer + one delegated click listener on `app.els.navPane` |
| `contentPane.js` | Content pane HTML renderer + all content-pane event listeners on `app.els.contentPane` |

**Listener strategy:** all event listeners attach once to the stable pane root
elements (`app.els.navPane`, `app.els.contentPane`). Re-renders write freely
into their children via `innerHTML` with no listener bookkeeping.

**Cross-pane communication** goes through `app`:
- Nav pane calls `app.contentPane.loadDeck(id)` when a deck is selected.
- Content pane calls `app.navPane.refresh()` after deck settings change.
- Content pane calls `app.navPane.open/close/setSuppressed` for gesture coordination.

### Gesture modules (`src/js/`)

| File | Attaches to | Handles |
|------|-------------|---------|
| `navPaneGestures.js` | `app.els.handle` | Swipe right/left to open/close nav pane |
| `contentPaneGestures.js` | `app.els.contentPane` | Swipe-left to reveal card actions; touch-drag to reorder cards |
| `gestures.js` | Various | `wireSheetDismissGesture` for bottom sheet panels |

### Components (`src/components/`)

Pure functions that return HTML strings. No DOM queries, no side effects.
Event listeners for component interactions are handled by the containing pane's
delegated listener, not inside the component itself.

### Data layer (`src/js/db.js`)

Dexie-backed IndexedDB. All DB calls are async. Imported directly by panes;
components receive data as arguments.
