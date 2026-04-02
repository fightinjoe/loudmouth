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
src/js/          Generic utilities and app logic (router, db, tts, import-parser, base64url)
src/screens/     Full-page views — one file per route/screen
src/components/  Reusable rendering functions for specific UI components
src/styles/      CSS split by concern (see below)
```

New files go in the appropriate folder. Do not create new top-level folders without discussion.

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

See `docs/BRIEF.md` — Library Schema section. Key points:
- `id` (UUID v4) and `createdAt` (ISO 8601) are assigned at import time, never in the batch JSON
- Required per card: `lang`, `text`, `translation`
- All other fields optional: `type`, `reading`, `notes`, `example`

## Testing

Tests live in `src/__tests__/`. Use Vitest. Run with `npm test`.

## Docs to keep current

- `docs/BRIEF.md` — product decisions and schema. Update when schema or feature scope changes.
- `docs/ARCH.md` — technical decisions. Update when stack, folder structure, or key patterns change.
- `AGENTS.md` (this file) — coding rules. Update when a new pattern is established.
