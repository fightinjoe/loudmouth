---
kind: skill
status: current
summary: Rules, references and verification for any work under web/app.
sources: [web/app/package.json, .github/workflows/web-app-ci.yml]
verified: 2026-11-12
---

# Web app work

Use for any reading, change, review or test of code under `web/app`. It replaces the former nested web agent rules file; the root [`AGENTS.md`](../../AGENTS.md) still applies.

## Load

1. [Web app coding rules](../web/coding-rules.md): always, before editing.
2. As the task needs:
   - [Web architecture](../web/architecture.md) for module boundaries and the service boundary.
   - [Pane Protocol](../web/pane-protocol.html) for panes, layers, transitions, delegation and gestures.
   - [Web development](../web/development.md) for setup, local API, Storybook, build and deploy.
   - [Interaction design](../design.md) and [journeys](../journeys.md) for intended UI behavior.
   - [Card schema](../card-schema.md) for anything touching cards, phrasebooks, storage or backups.

## Verify

Run from `web/app`, serially (they share generated schema output). These are the package's own scripts; there are no extra helper scripts for this skill.

| Change | Commands |
|---|---|
| Any TypeScript | `npm run typecheck`, `npm test` |
| Panes, action-pane kinds, runtime wiring | `npm run test:e2e` (add new action-pane kinds to `KINDS` in `e2e/action-panes.smoke.spec.js`) |
| Components with stories | `npm run test:storybook` |
| Build or PWA config | `npm run build` |

CI runs the same set ([`web-app-ci.yml`](../../.github/workflows/web-app-ci.yml)). For a visible UI change, also run the app (`npm run dev` here and in `api/src`, using the server rule in `AGENTS.md`) and exercise the changed interaction in a browser.

## Keep the wiki current

When a change establishes or retires a pattern, update the coding rules. When it changes behavior, update the owning page and its `verified` date (see [wiki conventions](../wiki.md#writing-rules)).
