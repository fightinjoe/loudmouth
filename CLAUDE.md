
## Project documentation

Always load these docs when context is relevant:

| Doc | Path | When to load |
|-----|------|--------------|
| Product brief | `docs/BRIEF.md` | Goals, user, phases, schema, architecture decisions |
| UX design spec | `docs/DESIGN.md` | Navigation structure, interaction states, action panes, UI layout |
| API overview | `docs/API_DESIGN.md` | Shared architecture, trust boundaries, runtime outcome conventions, and endpoint directory; not required for endpoint-only work |
| Endpoint design | `docs/api/<endpoint>.md` | Load only the relevant endpoint: `context`, `phrasebook-title`, `phrasebook`, `phrase-breakdown`, or `phrasebook-image`; owns I/O, pipeline, limits, recovery, and known gaps |
| Evaluation guidance | `evals/README.md` and `evals/rubric.json` | Evaluation methods, scoped reporting, quality dimensions and scoring; load for evaluation work, not ordinary endpoint implementation |
| Fan-out design (deferred) | `docs/FANOUT_DESIGN.md` | Planner + parallel-fillers optimization for `/lookup`; load only when building the fan-out |
| API operations | `api/README.md` | Local development, configuration, tests, deployment, and gateway setup; endpoint contracts live in `docs/api/` |

## Prompt changes

Changes to prompt `*.txt` files require explicit user approval before editing. After approval, run
before-and-after regression evaluations against representative inputs and report behavior, latency,
and token-impact differences so the effect of the prompt change is understood.

## gstack

Use the /browse skill from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.

Available gstack skills: /office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review, /design-consultation, /design-shotgun, /design-html, /review, /ship, /land-and-deploy, /canary, /benchmark, /browse, /connect-chrome, /qa, /qa-only, /design-review, /setup-browser-cookies, /setup-deploy, /setup-gbrain, /retro, /investigate, /document-release, /document-generate, /codex, /cso, /autoplan, /plan-devex-review, /devex-review, /careful, /freeze, /guard, /unfreeze, /gstack-upgrade, /learn
