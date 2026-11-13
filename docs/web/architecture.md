---
kind: spec
status: current
summary: Web app architecture — client-only TypeScript PWA, source areas, pane coordination, and where storage and service contracts are owned.
sources: [web/app/src/js, web/app/src/panes, web/app/src/components, web/app/src/styles]
verified: 2026-11-13
---

# Web app architecture

> Client-side TypeScript PWA built with Vite, storing its library in IndexedDB via Dexie. The monorepo's stateless `api/` service supplies generated content; it stores no library.

## Sources of truth

- [Brief](../brief.md) — product scope.
- [Design](../design.md) — creation, browsing, analysis, and Review behavior.
- [Card schema](../card-schema.md) — normative card, versioned-exchange and local-library contracts.
- [API design](../api-design.md) — endpoint contracts and provider policies.
- [Development](development.md#app-structure) — current module map and development commands.
- [Pane Protocol](pane-protocol.html) — pane ownership and interaction mechanics.

## Frontend

The web app is a framework-free, mobile-first SPA. Vite transpiles strict TypeScript and emits static assets plus a PWA service worker. Native iOS is a separate client in the monorepo ([iOS architecture](../ios/architecture.md)).

Production source lives under `web/app/src/`:

- `js/` — startup/router, typed UI state and delegated events, library access, API clients, preferences, language/ability enums, audio, and shared utilities.
- `panes/` — shell initialization and owners of the navigation, content, details, and action layers. The content pane splits loading, rendering, card actions, and gestures into separate modules.
- `components/` — data-to-markup renderers and interactive panels with explicit mount/cleanup.
- `styles/` — tokens, utilities, base rules, component/pane styles, phrase-breakdown styles, and textbook surfaces.

Named state transitions coordinate panes through a typed host. Stable pane roots use delegated click events; mounted action panels manage their own listeners. CSS data attributes express display state. Content gestures own shell reveal, landing-row and Starred-pager mouse dragging, and section-local reorder. Details uses geometric expansion and modal focus management rather than a fifth pane layer.

## Service boundary and local library

The web calls `/context`, `/phrasebook`, `/phrasebook-title`, `/phrasebook-image` and `/phrase-breakdown`; [API design](../api-design.md) owns those contracts and [design](../design.md#guided-creation) owns how creation sequences them. The shared `@catchphrase/card-schema` package (`api/src/schema/index.ts`) validates every server/client exchange.

The [card schema](../card-schema.md) owns the schema versions, the Dexie database and its tables ([library records](../card-schema.md#library-records-and-ownership)), atomic commits ([atomic lifecycle](../card-schema.md#atomic-lifecycle)), namespace isolation and backup ([namespace isolation](../card-schema.md#namespace-isolation-and-backup)), and the tab-scoped analysis cache ([contextual presentation](../card-schema.md#contextual-presentation)). Storage names are defined in `web/app/src/js/storage-config.ts`.

iOS Safari may evict local storage. There are no accounts, cloud sync, or server-held backups.

## Constraints and deployment

- Keep the web client framework-free and statically deployable; do not add a separate web backend.
- Preserve PWA installability and offline asset caching.
- Audio uses Web Speech API on mobile; desktop audio is intentionally unsupported.
- Keep code separated by ownership and lifecycle rather than adding generic frameworks.
- The static `dist/` build deploys to a static host; the API runs separately on Cloud Run ([development](development.md#deployment), [API operations](../api/operations.md)).
- Camera/OCR, spaced repetition, push notifications, and multi-device synchronization are outside the current product scope. The service worker is not a background generation worker.
