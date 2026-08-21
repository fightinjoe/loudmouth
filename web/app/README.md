# Loudmouth

A mobile-first flashcard app for Chinese and Japanese vocabulary.

## Prerequisites

- Node.js 18+
- npm 9+

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Opens at `http://localhost:5173`.

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

## Build

```bash
npm run build
```

Output goes to `dist/`. Includes a service worker for offline use.

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
