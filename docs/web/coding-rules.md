---
kind: rules
status: current
summary: Coding rules for the web app — architecture constraints, source layout, CSS, rendering, gestures, panes and tests.
sources: [web/app/src/styles, web/app/src/panes/app.ts, web/app/src/panes/content-pane-actions.ts, web/app/src/components/bottom-sheet.ts, web/app/e2e/action-panes.smoke.spec.js]
verified: 2026-11-13
---

# Web app coding rules

Rules for all work in `web/app/`. Read before making changes.

## Architecture constraints (non-negotiable)

- **No framework.** Strict TypeScript with Vite — no React, Vue, Svelte, etc.
- **No web backend runtime.** The web app stays fully client-side. Model generation and phrase analysis call the monorepo `api/` service; do not add a separate web server or server-held library.
- **Small, modular files.** One concern per file. No monolithic modules.
- **PWA installability must be maintained.** Do not break the service worker, manifest, or caching strategy.
- **Audio is mobile-only.** Web Speech API. Do not attempt to support macOS Safari or Chrome Desktop.

## Source layout

```
src/js/          App logic and utilities (startup, router, library, API clients, preferences, enums, audio, uiState, delegate)
src/panes/       Pane modules — one per layer of the app, conforming to the Pane Protocol
src/components/  Markup renderers and interactive panel controllers, plus the bottom-sheet primitive
src/styles/      CSS split by concern (see below)
src/icons/       SVG icon sources
src/stories/     Storybook stories and their support code
src/__tests__/   Vitest unit tests
```

New files go in the appropriate folder. Do not create new top-level folders without discussion. Panes follow the [Pane Protocol](#pane-protocol); [development](development.md#app-structure) maps the current modules.

## CSS rules

`src/styles/app.css` imports the other stylesheets in cascade order:

- **`variables.css`** — design tokens only (primitive + semantic CSS variables). No rules.
- **`utilities.css`** — single-purpose utility classes (Tailwind-like: `.flex-row`, `.gap-sm`, `.text-h2`). No component-specific styles here.
- **`base.css`** — global resets, element defaults, button styles.
- **`components.css`** — component-specific styles keyed to class names or `data-*` attributes.
- **`panes.css`** — pane-layer styles such as the shell swipe handle.
- **`phrase-breakdown.css`** — scoped details-layer expansion, semantic selection, and explanation styles.
- **`textbook.css`** — shared textbook tokens, including the `--phrasebook-*` colors.
- **`textbook-navigation.css`**, **`textbook-content.css`**, **`textbook-creation.css`** — the navigation, phrasebook-content and creation surfaces.

Display logic belongs in CSS, not JS. Use `data-*` attributes on elements and CSS attribute selectors to control visibility based on mode/state. Do not toggle `display` or `visibility` via JS DOM manipulation.

**Always render all elements unconditionally.** Do not conditionally omit elements from HTML based on mode or state — render them all, and let CSS show/hide them.

**Put pane state on a stable ancestor.** Pane subscribers write state attributes on the pane root or app stage with `setAttrSafe` (`src/js/uiState.ts`), and descendants react through ancestor selectors. For example, `content-pane.ts` sets `data-edit-mode` on the content pane root and `app.ts` sets `data-shell` on `#app`:

```css
#content-pane[data-edit-mode] .card-row-reorder-handle { display: flex; }
#app[data-shell="background"] .content-pane { transform: translateX(100%); }
```

**Use attribute toggles for transient state.** When UI state changes (e.g. revealing a hidden answer), update a `data-*` attribute on a stable container — do not swap `innerHTML`. The review panel (`src/components/review-panel.ts`) does this:

```ts
wrap.dataset.revealed = String(revealed);
// CSS: .review-card-wrap[data-revealed="true"] .review-answer { visibility: visible; }
```

## Rendering pattern

Markup renderers in `src/components/` are pure functions that return HTML strings (template literals). They receive data, return markup — no side effects, no DOM queries. Interactive panel controllers (for example `creation-panel.ts`, `review-panel.ts`, `bottom-sheet.ts`) mount markup, own their listeners, and return explicit cleanup.

Pane modules (`src/panes/`) follow the same render-then-update discipline at a higher level: `render` runs once at mount; subsequent state changes update `data-*` attributes (or rebuild a designated list region). See [Pane Protocol Rule 4](pane-protocol.html#rendering) for the full contract.

```ts
// Good
export function renderCard(card: Card, mode: string): string {
  return `<div class="card" data-card-mode="${mode}">...</div>`;
}

// Bad — don't manipulate DOM inside a component renderer
export function renderCard(card: Card, mode: string) {
  const el = document.createElement('div');
  el.style.display = mode === 'review' ? 'block' : 'none'; // ← wrong
  ...
}
```

## Design tokens

Colors are defined in `src/styles/variables.css` as space-separated HSL channels (not full `hsl()` values) to allow alpha composition:

```css
--gray-900: 220 47.37 11.18;                        /* primitive */
--fg-body: hsl(var(--gray-900));                    /* semantic */
--shadow-float: 0 8px 24px hsl(var(--gray-900) / 0.14); /* with alpha */
```

Always use semantic variables (`--fg-body`, `--fg-secondary`) in component styles. Use primitive variables (`--gray-900`) only when defining semantic variables in `variables.css`.

## Card schema

Card and library shapes are defined in [the card schema](../card-schema.md); do not restate them here.

## Swipe gesture pattern

Swipe gestures must track the user's finger in real time. Never wait until `touchend` to move an element.

**Axis lock:** On `touchstart`, record both `clientX` and `clientY`. On the first `touchmove` where displacement exceeds 4px, determine the axis (`Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'`). Respond only to the gesture's own axis; ignore the other so that scroll is not disrupted.

**Real-time tracking:** On every `touchmove` on the gesture's axis, apply the transform directly to the element. Do not use `classList` changes during the drag.

**Suppress transitions during drag:** Set `data-dragging` on the element during `touchstart` and remove it on `touchend`/`touchcancel`. Use a CSS rule to disable the transition while that attribute is present:

```css
.my-element { transition: transform 250ms ease; }
.my-element[data-dragging] { transition: none; }
```

**Commit or snap back on `touchend`:** Compare the final displacement against a threshold. If it exceeds the threshold, commit the action (animate to final position or trigger the next state). If it falls short, animate back to the original position using the transition.

```js
// touchstart
el.dataset.dragging = ''

// touchmove (gesture axis only)
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

Gestures live inside each pane's `bindEvents` (or the panel controller that owns the surface) and wire directly to **static handles** ([Pane Protocol Rule 6](pane-protocol.html#gestures)). Never wire a gesture to dynamic list items or anything else that re-renders. Each owner co-locates its gesture wiring next to the contract that owns the static handle:

- `src/panes/content-pane-gestures.ts` — shell edge swipe, mouse dragging of the landing's card rows and the Starred sheet pager, Arrow/Home/End on focused landing rows, and edit-mode reorder. Wired to the content pane's static root, shell handle, and reorder handle.
- `src/components/bottom-sheet.ts` — swipe-down-to-dismiss on every action pane, starting from its `.sheet-handle` or `.pane-header`.

All touch gestures follow the axis-lock, real-time tracking, and `data-dragging` suppression patterns above. They never call a transition during `touchmove` — only on `touchend`/`touchcancel`.

Card rows are not swiped. A tap on a card row speaks it; a 500 ms long press, right-click, or Shift+F10/ContextMenu on a focused phrase row opens its details instead, and the click that ends the hold is suppressed (`src/panes/content-pane-actions.ts`). Product behavior is owned by [design](../design.md#phrasebook-view).

## Pane Protocol

The web app organizes UI state, panes, events, and gestures according to the Pane Protocol: state machine, named transitions, render-once-then-attributes rendering, per-layer click delegation, static-handle gestures, and the load-bearing rule that subscribers never write to `[data-dragging]` elements.

**Source of truth:** [`pane-protocol.html`](pane-protocol.html). Open it in a browser — it has a working live example that is canonical when the prose is ambiguous.

When implementing a new pane, follow the contract in Rule 3: a default export of `{ namespace, initialState, transitions, render, bindEvents }`. The `host` argument to `bindEvents` provides `ui` (the state machine), `delegate` (the layer's click handler) and `stageEl`. The action layer receives `delegate: null`; its panel controllers own their listeners and cleanup. The primitives that back the protocol live in:

- `src/js/uiState.ts` — `createUIState`, `createHost`, `setAttrSafe`, `setListHTMLSafe`.
- `src/js/delegate.ts` — `createDelegate`.

Cross-pane communication goes through `host.ui` transitions, never through method bags or direct imports of other panes.

The details layer is the phrase-breakdown modal. `src/panes/details-pane.ts` owns its namespace, request lifecycle, selection, disclosures and focus, and closes synchronously before an action pane opens or content changes. Analysis validation and tab-scoped caching belong in `src/js/phrase-breakdown.ts`; `src/components/phrase-breakdown.ts` stays pure markup. Analysis adds no persisted card field.

## Testing

**Unit tests** live in `src/__tests__/`. Use Vitest. Run with `npm test`. (Vitest is scoped to `src/__tests__/` by `vitest.config.js` so it never loads the Playwright specs.)

**End-to-end smoke tests** live in `e2e/`. Use Playwright against the production build. Run with `npm run test:e2e`; `npm run test:all` runs unit + e2e. `e2e/action-panes.smoke.spec.js` opens every action-pane kind in a real browser and fails on ANY console error or uncaught exception — the guard for runtime-only bugs (e.g. a temporal-dead-zone `ReferenceError` in an `onMount` closure) that unit tests and the build don't catch. CI (`.github/workflows/web-app-ci.yml`) runs typecheck, unit, e2e and Storybook tests on every PR touching `web/app/**`.

`initApp` in `src/panes/app.ts` always sets `window.__loudmouth = { ui, db }`, in production builds too, and removes it on dispose. E2E tests use it to drive `action/open` transitions and seed decks the same way the app does internally. When you add a new action-pane kind, add it to the `KINDS` list in the smoke spec.

## Keeping docs current

Follow the ingest rule in [the wiki conventions](../wiki.md#maintenance-operations): after a change lands, update every page that owns an affected fact.
