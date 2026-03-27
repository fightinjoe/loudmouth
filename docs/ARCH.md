# Loudmouth — Architecture

> Client-only PWA built with plain HTML/JS + Vite, storing cards in IndexedDB via Dexie.js, deployed on Vercel.

## Status
**As of:** 2026-03-18
**Brief:** See docs/BRIEF.md

## Platform
Mobile-first PWA. Web only — no native app. PWA manifest + service worker enables "Add to Home Screen" on iOS Safari, hides browser chrome, and provides offline support. Desktop is supported but not a design target; audio is explicitly iOS Safari only.

## Frontend
**Approach:** SPA (client-rendered, no framework)
**Tooling:** Plain HTML/JS + Vite
**Why:** The app is a focused single-purpose tool with no SEO requirement and no server. A framework adds bundle weight and abstraction overhead with no payoff here. Vite provides fast dev builds, ES module bundling, and static output for Vercel. Files should be small and modular — one concern per file.

## Backend
**Approach:** None — fully client-side
**Why:** No user accounts, no cross-device sync, no server-side secrets. Everything runs in the browser. This is a deliberate constraint from the brief and should not be relaxed without a concrete forcing function (see Constraints).

## Data & Storage
**Primary store:** IndexedDB via [Dexie.js](https://dexie.org/)
**Why:** IndexedDB has no practical size limit for this use case (handles 100k+ cards). Dexie wraps the raw API with a clean, async interface. localStorage is ruled out (5MB limit, synchronous). SQLite/WASM is overkill — no complex querying needed.

**Schema:** See `docs/BRIEF.md` — Library Schema section. Key points:
- Cards are stored with `id` (UUID v4) and `importedAt` (ISO 8601) assigned at import time
- Cards from the same paste share `importedAt` — this is the batch association mechanism
- Schema includes extension points for future spaced repetition (`reviewHistory`) even if unused in Phase 1–2

**Durability note:** iOS Safari can evict IndexedDB data under low-storage conditions without warning. Mitigation: a JSON export feature (Phase 2) lets users back up and restore their library manually.

## Auth
**Approach:** None
**Why:** Single-user, single-device tool. No accounts, no login, no sessions.

## Deployment
**Target:** Vercel
**Build output:** Static files from `vite build`
**Environments:** Production only — no staging environment needed for a single-user tool. Local dev via `vite dev`.
**Why:** Zero-config for static Vite output. Free tier is sufficient. Good CLI and GitHub integration.

## Key Integrations
- **Web Speech API** — TTS audio playback. `lang="zh-CN"` for Mandarin, `lang="ja-JP"` for Japanese. iOS Safari only; do not attempt to support macOS Safari or Chrome Desktop for audio.
- **URI import** — Cards can be imported via a `#deck?cards=<base64url-encoded-JSON>` hash URL. The payload is the standard card batch JSON schema. No server is involved; the `#` fragment is never sent over the network. Browser URL buffer limits (~2MB) are the only practical size constraint, sufficient for thousands of cards. A small pure `base64url` utility module handles encode/decode.

## Constraints
Every feature and future PRD must respect these:

- **No backend.** Do not introduce server-side logic, APIs, or auth without a concrete forcing function (multi-device sync, shared decks, or server-side AI calls).
- **Audio is mobile-only.** Web Speech API audio is a mobile-first feature. macOS Safari is silent; Chrome Desktop is poor. Do not attempt to fix this.
- **Small, modular files.** One concern per file. No monolithic modules.
- **No framework.** Plain JS only. Do not introduce React, Vue, Svelte, or similar without revisiting this architecture.
- **PWA requirements must be maintained.** Any change to the service worker, manifest, or caching strategy should be deliberate — breaking PWA installability is a regression.

## Deferred Decisions
- **Spaced repetition storage shape** — The Library Schema has an extension point but SR is not designed. Deferred until the no-self-rating tension is resolved (see BRIEF.md open questions). Will be decided when SR is prioritized.
- **Card grouping model** — How cards are organized in the browse/list view (by batch, trip, topic) is unresolved and affects the data model. A prototype is planned (see BRIEF.md). Will be decided before Phase 2 PRD is written.
- **Furigana rendering approach** — Whether `reading` renders as plain text or ruby annotations is pending a prototype. Does not affect the data model but affects the rendering layer. Will be decided before Phase 2 ships.
- **Server-side storage** — Not needed now. Revisit if: multi-device sync is desired, iOS eviction becomes a real problem, or card derivation moves server-side.

## What This Rules Out
- **Multi-device sync** — no server means the library lives only on the device it was imported on. Acceptable for now; would require a backend to change.
- **Push notifications / background sync** — PWA service worker is for offline caching only, not background processing.
- **Native device APIs** (camera, haptics, etc.) — web-only; not available.
- **Real-time features** — no server means no websockets, no live collaboration.
