# Loudmouth — Architecture

> Client-side TypeScript PWA built with Vite, storing its library in IndexedDB via Dexie.
> The monorepo's stateless `api/` service supplies generated content; it stores no library.

## Sources of truth

- [`docs/BRIEF.md`](../../docs/BRIEF.md) — product scope and current architecture.
- [`docs/DESIGN.md`](../../docs/DESIGN.md) — creation, browsing, analysis, and Review behavior.
- [`docs/CARD_SCHEMA.md`](../../docs/CARD_SCHEMA.md) — normative card and storage contracts.
- [`docs/API_DESIGN.md`](../../docs/API_DESIGN.md) — endpoint contracts and provider policies.
- [`web/app/README.md`](../app/README.md#app-structure) — current module map and development commands.
- [Pane Protocol](./PANE_PROTOCOL.html) — pane ownership and interaction mechanics.

## Frontend

The web app is a framework-free, mobile-first SPA. Vite transpiles strict TypeScript and emits
static assets plus a PWA service worker. Native iOS is a separate client in the monorepo.

Production source lives under `web/app/src/`:

- `js/` — startup/router, typed UI state and delegated events, library access, API clients,
  preferences, language/ability enums, audio, and shared utilities.
- `panes/` — shell initialization and owners of the navigation, content, details, and action layers.
  Content rendering, loading, card actions, gestures, and tab motion have separate modules.
- `components/` — data-to-markup renderers and interactive panels with explicit mount/cleanup.
- `styles/` — tokens, utilities, base rules, component/pane styles, and phrase-breakdown styles.

Named state transitions coordinate panes through a typed host. Stable pane roots use delegated
events; mounted panels manage their own listeners. CSS data attributes express display state.
Content gestures own shell reveal, topic paging, and section-local reorder. Details uses geometric
expansion and modal focus management rather than a fifth pane layer.

## Service boundary

Creation uses `/context` and `/phrasebook`, with independent `/phrasebook-title` and
`/phrasebook-image` work. Text commits atomically; cover failure never prevents saving a phrasebook.
`/phrase-breakdown` analyzes the exact selected occurrence and active phrasebook context.
Validated analysis is disposable and cached per browser tab; only explicit stars save targets.

The shared `@catchphrase/card-schema` package validates server/client exchange. Phrasebook responses
and library backups use v3; common CardBatch exports and phrase breakdown use v2. API, gateway,
shared schema, and web must deploy together when their contract changes.

## Local library

The `loudmouth-topic-v3` Dexie database contains `cards`, `decks`, `groups`, `memberships`,
`occurrences`, `provenance`, and `topicWords`. Canonical cards may be shared across phrasebooks,
while stars belong to memberships and translation/presentation belongs to occurrences.
Historical source evidence survives deletion of its originating phrase or phrasebook.

Storage exposes atomic import and full-library backup/restore APIs. JSON card export uses the
shared CardBatch validator; there is no URL-encoded card-import handler. Local preferences and
tab-scoped analysis caches are separate from the durable library. Old physical databases and
preference keys are left untouched; no compatibility reader or migration runs.

iOS Safari may evict local storage. There are no accounts, cloud sync, or server-held backups.

## Constraints and deployment

- Keep the web client framework-free and statically deployable; do not add a separate web backend.
- Preserve PWA installability and offline asset caching.
- Audio uses Web Speech API on mobile; desktop audio is intentionally unsupported.
- Keep code separated by ownership and lifecycle rather than adding generic frameworks.
- Static build output is deployed to Vercel; the API runs separately on Cloud Run.
- Camera/OCR, spaced repetition, push notifications, and multi-device synchronization remain
  outside the current product scope. The service worker is not a background generation worker.
