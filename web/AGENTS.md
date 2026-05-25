# AGENTS.md — Coding rules for AI agents

> Rules that apply to all AI-assisted work in this repo. Read before making changes.

## Architecture constraints (non-negotiable)

- **No framework.** Plain JS only — no React, Vue, Svelte, etc.
- **No backend.** Fully client-side. Do not introduce server-side logic or APIs.
- **Small, modular files.** One concern per file. No monolithic modules.
- **PWA installability must be maintained.** Do not break the service worker, manifest, or caching strategy.
- **Audio is mobile-only.** Web Speech API. Do not attempt to support macOS Safari or Chrome Desktop.

## Source layout

```
src/js/          Generic utilities and app logic (router, db, tts, import-parser, base64url, lang, utils, uiState, delegate)
src/panes/       Pane modules — one per layer of the app, conforming to the Pane Protocol
src/components/  Reusable rendering functions for specific UI components, plus the bottom-sheet primitive
src/styles/      CSS split by concern (see below)
```

New files go in the appropriate folder. Do not create new top-level folders without discussion.

Panes (nav, content, action, etc.) live in `src/panes/` and follow the Pane Protocol — see [Pane Protocol](#pane-protocol) below. The `src/screens/` folder is deprecated and was removed during the protocol migration.

## CSS rules

- **`variables.css`** — design tokens only (primitive + semantic CSS variables). No rules.
- **`utilities.css`** — single-purpose utility classes (Tailwind-like: `.flex-row`, `.gap-sm`, `.text-h2`). No component-specific styles here.
- **`base.css`** — global resets, element defaults, button styles.
- **`components.css`** — component-specific styles keyed to class names or `data-*` attributes.

Display logic belongs in CSS, not JS. Use `data-*` attributes on elements and CSS attribute selectors to control visibility based on mode/state. Do not toggle `display` or `visibility` via JS DOM manipulation.

**Always render all elements unconditionally.** Do not conditionally omit elements from HTML based on mode or state — render them all, and let CSS show/hide them.

**Mode attribute belongs on the ancestor.** The deck mode (`study`, `review`, `reverse`) is set as `data-mode` on the top-level app container (`el`), not on individual child components. All descendants pick it up via CSS ancestor selectors:

```css
[data-mode="review"] .card-review-content { ... }
[data-mode="reverse"] .deck-view-list .card-row { ... }
```

**Use CSS class toggles for transient state.** When UI state changes (e.g. revealing a hidden translation), add/remove a class on a stable container element — do not swap `innerHTML`:

```js
contentEl.classList.add('review--revealed')   // show
contentEl.classList.remove('review--revealed') // hide
```

## Rendering pattern

Components in `src/components/` are pure functions that return HTML strings (template literals). They receive data, return markup — no side effects, no DOM queries.

Pane modules (`src/panes/`) follow the same render-then-update discipline at a higher level: `render` runs once at mount; subsequent state changes update `data-*` attributes (or rebuild a designated list region). See `web/docs/PANE_PROTOCOL.html` Rule 4 for the full contract.

```js
// Good
export function renderCard(card, mode) {
  return `<div class="card" data-card-mode="${mode}">...</div>`;
}

// Bad — don't manipulate DOM inside a component renderer
export function renderCard(card, mode) {
  const el = document.createElement('div');
  el.style.display = mode === 'review' ? 'block' : 'none'; // ← wrong
  ...
}
```

## Design tokens

Colors are defined as space-separated HSL channels (not full `hsl()` values) to allow alpha composition:

```css
--gray-900: 220 47 11;                     /* primitive */
--text-body: hsl(var(--gray-900));         /* semantic */
--text-muted: hsl(var(--gray-900) / 0.5); /* with alpha */
```

Always use semantic variables (`--text-body`, `--bg-primary`) in component styles. Use primitive variables (`--gray-900`) only when defining semantic variables in `variables.css`.

## Card schema

See `../docs/CARD_SCHEMA.md` for the full batch schema. Key points:
- `id` (UUID v4) and `createdAt` (ISO 8601) are assigned at import time, never in the batch JSON
- Required per card: `lang`, `text`, `translation`
- `reading` is a `ReadingToken[]` array of `[base, annotation|null]` pairs, not a plain string
- All other fields optional: `type`, `reading`, `romanization`, `notes`, `example`

## Swipe gesture pattern

Swipe gestures must track the user's finger in real time. Never wait until `touchend` to move an element.

**Axis lock:** On `touchstart`, record both `clientX` and `clientY`. On the first `touchmove` where displacement exceeds 4px, determine the axis (`Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'`). Only respond to horizontal swipes; ignore the gesture if the axis is vertical so that scroll is not disrupted.

**Real-time tracking:** On every horizontal `touchmove`, apply `transform: translateX(dx)` directly to the element. Do not use `classList` changes during the drag.

**Suppress transitions during drag:** Set `data-dragging` on the element during `touchstart` and remove it on `touchend`/`touchcancel`. Use a CSS rule to disable the transition while that attribute is present:

```css
.my-element { transition: transform 250ms ease; }
.my-element[data-dragging] { transition: none; }
```

**Commit or snap back on `touchend`:** Compare the final displacement against a threshold. If it exceeds the threshold, commit the action (animate to final position or trigger the next state). If it falls short, animate back to the original position using the transition.

```js
// touchstart
el.dataset.dragging = ''

// touchmove (horizontal axis only)
el.style.transform = `translateX(${dx}px)`

// touchend
delete el.dataset.dragging
if (Math.abs(dx) >= THRESHOLD) {
  // commit
} else {
  // snap back — transition is now active again
  el.style.transform = ''
}
```

**Always handle `touchcancel`:** Treat it the same as a below-threshold `touchend` — snap back and clean up state.

**Clamping:** For reveal gestures (swipe to expose buttons), clamp the transform so the element cannot be dragged further than the revealed width: `Math.max(-REVEAL_WIDTH, Math.min(0, dx))`.

## Gesture implementation

Gestures live inside each pane's `bindEvents` and wire directly to **static handles** rendered by that pane (Rule 6 of the Pane Protocol — see `web/docs/PANE_PROTOCOL.html`). Never wire a gesture to dynamic list items or anything else that re-renders.

The old `src/js/gestures.js` factory module is **removed**. Each pane co-locates its own gesture wiring next to the contract that owns the static handle. Examples in the current tree:

- `src/panes/content-pane-gestures.js` — shell swipe, card-row reveal swipe, and edit-mode reorder. All three are wired to handles rendered by the content pane.
- `src/components/bottom-sheet.js` — swipe-down-to-dismiss, wired to `.sheet-handle` inside every action pane.

All gestures follow the axis-lock, real-time tracking, and `data-dragging` suppression patterns described in the Swipe gesture pattern section above. They never call a transition during `touchmove` — only on `touchend`/`touchcancel` (Rule 6).

## Pane Protocol

The Loudmouth web app organizes UI state, panes, events, and gestures according to the Pane Protocol. The protocol is the source of truth for everything pane-shaped: state machine, named transitions, render-once-then-attributes rendering, per-layer click delegation, static-handle gestures, and the load-bearing rule that subscribers never write to `[data-dragging]` elements.

**Source of truth:** `web/docs/PANE_PROTOCOL.html`. Open it in a browser — it has a working live example at the bottom that is canonical when the prose is ambiguous.

When implementing a new pane, follow the contract in Rule 3 verbatim: a default export of `{ namespace, initialState, transitions, render, bindEvents }`. The `host` argument to `bindEvents` provides `ui` (the state machine) and `delegate` (the layer's single click handler). The primitives that back the protocol live in:

- `src/js/uiState.js` — `createUIState`, `createHost`, `setAttrSafe`, `setListHTMLSafe`.
- `src/js/delegate.js` — `createDelegate`.

Cross-pane communication goes through `host.ui` transitions, never through method bags or direct imports of other panes.

## Testing

Tests live in `src/__tests__/`. Use Vitest. Run with `npm test`.

## Docs to keep current

- `../docs/BRIEF.md` — product decisions and schema (monorepo root). Update when schema or feature scope changes.
- `docs/ARCH.md` — technical decisions. Update when stack, folder structure, or key patterns change.
- `AGENTS.md` (this file) — coding rules. Update when a new pattern is established.
