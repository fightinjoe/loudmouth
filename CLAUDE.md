
## Project documentation

Always load these docs when context is relevant:

| Doc | Path | When to load |
|-----|------|--------------|
| Product brief | `docs/BRIEF.md` | Goals, user, phases, schema, architecture decisions |
| UX design spec | `docs/DESIGN.md` | Navigation structure, interaction states, action panes, UI layout |
| API overview | `docs/API_DESIGN.md` | Shared architecture, trust boundaries, runtime outcome conventions, and endpoint directory; not required for endpoint-only work |
| Endpoint design | `docs/api/<endpoint>.md` | Load only the relevant endpoint: `context`, `phrasebook-title`, `phrasebook`, `phrase-breakdown`, or `phrasebook-image`; owns I/O, pipeline, limits, recovery, and known gaps |
| Evaluation guidance | `evals/README.md` and `evals/RUBRIC.md` | Evaluation methods, scoped reporting, quality rules, outcome classes and scoring; load for evaluation work, not ordinary endpoint implementation |
| Fan-out design (deferred) | `docs/FANOUT_DESIGN.md` | Planner + parallel-fillers optimization for `/lookup`; load only when building the fan-out |
| API operations | `api/README.md` | Local development, configuration, tests, deployment, and gateway setup; endpoint contracts live in `docs/api/` |
| To-do | `docs/TODO.md` | Decided non-prompt API work and production test/fix/deploy items, with evidence and done conditions; load when planning, fixing or releasing API work |

## Prompt changes

Changes to prompt `*.txt` files require explicit user approval before editing. After approval, run
before-and-after regression evaluations against representative inputs and report behavior, latency,
and token-impact differences so the effect of the prompt change is understood.

## Local servers

Whenever you start a server (preview, exploration, dev, or API) for the user to view:

1. **Run it in a visible tmux pane.** If you are in a tmux session (`$TMUX` is set), start the server
   in a pane of your current window (`-t "$TMUX_PANE"`) so the user can stop it with Ctrl-C. If the
   window has no right-hand pane, split it horizontally to create one (`tmux split-window -h -d`). If
   a right-hand pane exists, split the bottom of that right-hand column vertically
   (`tmux split-window -v -d -t <bottom-right pane>`). Start a shell in the pane and send the server
   command with `tmux send-keys`, so stopping the server leaves the pane open. Outside tmux, run it as
   a named background service and report how to stop it.
2. **Bind to `0.0.0.0`** so it is reachable from other devices on the network (for example
   `python3 -m http.server <port> --bind 0.0.0.0`, or `--host 0.0.0.0` for Vite/uvicorn). Report both
   the localhost URL and the LAN URL (`ifconfig | grep 'inet '`; the interface is not always `en0`).
3. **Serve the narrowest directory that works.** A `0.0.0.0` server is visible to the whole network;
   never expose the repository root, `.git`, or files containing secrets such as `.env`.
4. Pick a free port (check with `lsof -nP -iTCP:<port> -sTCP:LISTEN`) rather than stopping another
   process.
5. **Run the app with its own scripts.** The web app and API run together: `npm run dev` in
   `web/app` (Vite; host and port come from `vite.config.js` and `.env.local`) and `npm run dev` in
   `api/src`, each in its own pane. Never start the app with ad-hoc commands such as
   `npx vite --port …`: they skip `predev` and the configured port, and the app cannot reach the API.
   If either is already running, reuse it.

## gstack

Use the /browse skill from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.

Available gstack skills: /office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review, /design-consultation, /design-shotgun, /design-html, /review, /ship, /land-and-deploy, /canary, /benchmark, /browse, /connect-chrome, /qa, /qa-only, /design-review, /setup-browser-cookies, /setup-deploy, /setup-gbrain, /retro, /investigate, /document-release, /document-generate, /codex, /cso, /autoplan, /plan-devex-review, /devex-review, /careful, /freeze, /guard, /unfreeze, /gstack-upgrade, /learn
