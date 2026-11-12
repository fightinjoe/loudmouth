# Agent rules

Catchphrase is a language-preparation app: a TypeScript PWA (`web/app`), a stateless Node API (`api/src`), a native iOS client (`ios/`) and offline evaluation tooling (`evals/`). This is the only agent rules file in the repository. Guidance for one area of the codebase lives in a skill (for example `ajw_web_app` for `web/app`), not in nested `AGENTS.md` files.

## Wiki

`docs/` is the project wiki and the only home for knowledge that is not in code.

- Start at [`docs/index.md`](docs/index.md), the generated catalog of every page with a one-line summary, and load only the pages relevant to the task.
- Before creating or editing any page, follow [`docs/wiki.md`](docs/wiki.md): page header block, current state only, one owner per fact, ledgers for todos, decisions and results.
- After a change lands, update the pages that own the affected facts and their `verified` dates. Planned work goes in [`docs/todo/`](docs/todo/index.md), logged with the `ajw_log_todo` skill; future designs in `docs/proposals/`.
- `node scripts/check-docs.mjs` must pass before committing (`--fix` regenerates the index).

Frequently needed pages:

| Page | Load for |
|---|---|
| [`docs/brief.md`](docs/brief.md) | Product goals, scope, principles, platform |
| [`docs/design.md`](docs/design.md), [`docs/journeys.md`](docs/journeys.md) | UI structure, interaction states, user flows |
| [`docs/api-design.md`](docs/api-design.md) | Shared API rules and the endpoint directory; then only the relevant `docs/api/<endpoint>.md` |
| [`docs/card-schema.md`](docs/card-schema.md) | Card, phrasebook and storage contracts |
| [`docs/api/operations.md`](docs/api/operations.md) | API configuration, local development, tests, deployment |
| [`docs/evals/index.md`](docs/evals/index.md) | Evaluation tooling, rubric, results |
| [`docs/todo/index.md`](docs/todo/index.md) | Milestones, open work, release state |

## Tools over judgment

Prefer discrete, deterministic tools for repeatable jobs. When a task will recur and its steps can be scripted (checks, generation, setup, cleanup), write or extend a script under `scripts/` and have the agent call it, rather than relying on an agent to redo the work by hand. Every new skill must state which supporting scripts it needs, and create them.

## Skills

- Skill procedures live in `docs/skills/<name>.md`. `.agents/skills/<name>/SKILL.md` is a thin shell holding only `name`, `description` and a pointer to that page; `.claude/skills/<name>` symlinks to the shell, and `.agents/skills/<name>/agents/openai.yaml` sets Codex invocation policy.
- Name new skills with the `ajw_` prefix. The worktree skills (`add_worktree`, `commit_worktree`, `finalize_worktree`, `merge_worktree`) keep their names.
- A disabled skill keeps its page with `status: disabled` and has no shell, so no client can load it.
- `check-docs` validates shells, pages, symlinks and naming.

## Prompt changes

Changes to prompt `*.txt` files require explicit user approval before editing. After approval, run before-and-after regression evaluations against representative inputs and report behavior, latency, and token-impact differences so the effect of the prompt change is understood.

## Local servers

Whenever you start a server (web app, API, preview or exploration) for the user to view:

1. **Run it in a visible tmux pane** with `scripts/tmux-server.sh [-t <pane>] <working-dir> <command...>`. It opens a new pane in your current window (or the window of `-t <pane>`) below the bottom-right pane, or creates the right-hand pane when the window has only one column. The pane keeps a shell, so the user stops the server with Ctrl-C. Without tmux (exit code 2), run it as a named background service and report how to stop it.
2. **Bind to `0.0.0.0`** so it is reachable from other devices on the network (for example `python3 -m http.server <port> --bind 0.0.0.0`, or `--host 0.0.0.0` for Vite). Report both the localhost URL and the LAN URL (`ifconfig | grep 'inet '`; the interface is not always `en0`).
3. **Serve the narrowest directory that works.** A `0.0.0.0` server is visible to the whole network; never expose the repository root, `.git`, or files containing secrets such as `.env`.
4. Pick a free port (check with `lsof -nP -iTCP:<port> -sTCP:LISTEN`) rather than stopping another process.
5. **Run the app with its own scripts.** The web app and API run together, each in its own pane: start them with the `ajw_start_web_server` and `ajw_start_api_server` skills (`scripts/dev-server.py web|api`), which use each checkout's configured ports, reuse a server that is already running and verify readiness. Never start the app with ad-hoc commands such as `npx vite --port …`: they skip `predev` and the configured port, and the app cannot reach the API.

## gstack

Use the /browse skill from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.

Available gstack skills: /office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review, /design-consultation, /design-shotgun, /design-html, /review, /ship, /land-and-deploy, /canary, /benchmark, /browse, /connect-chrome, /qa, /qa-only, /design-review, /setup-browser-cookies, /setup-deploy, /setup-gbrain, /retro, /investigate, /document-release, /document-generate, /codex, /cso, /autoplan, /plan-devex-review, /devex-review, /careful, /freeze, /guard, /unfreeze, /gstack-upgrade, /learn

gstack writes design documents and learnings outside the repository (`~/.gstack/projects/`). Anything that matters for this project must be filed into the wiki; treat those files as scratch.
