
## Project documentation

Always load these docs when context is relevant:

| Doc | Path | When to load |
|-----|------|--------------|
| Product brief | `docs/BRIEF.md` | Goals, user, phases, schema, architecture decisions |
| UX design spec | `docs/DESIGN.md` | Navigation structure, interaction states, action panes, UI layout |
| API design (current) | `docs/API_DESIGN.md` | The `/lookup` endpoint — contract, execution model, prompt/validation design, tests. Source of truth for the new API. |
| Fan-out design (deferred) | `docs/FANOUT_DESIGN.md` | Planner + parallel-fillers optimization for `/lookup`; load only when building the fan-out |
| API reference | `api/README.md` | Endpoint reference, deploy/dev setup, and gateway config for the `/lookup` service; see `docs/API_DESIGN.md` for the endpoint contract itself. |

## Prompt changes

Changes to prompt `*.txt` files require explicit user approval before editing. After approval, run
before-and-after regression evaluations against representative inputs and report behavior, latency,
and token-impact differences so the effect of the prompt change is understood.

## gstack

Use the /browse skill from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.

Available gstack skills: /office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review, /design-consultation, /design-shotgun, /design-html, /review, /ship, /land-and-deploy, /canary, /benchmark, /browse, /connect-chrome, /qa, /qa-only, /design-review, /setup-browser-cookies, /setup-deploy, /setup-gbrain, /retro, /investigate, /document-release, /document-generate, /codex, /cso, /autoplan, /plan-devex-review, /devex-review, /careful, /freeze, /guard, /unfreeze, /gstack-upgrade, /learn
