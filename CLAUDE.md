
## Project documentation

Always load these docs when context is relevant:

| Doc | Path | When to load |
|-----|------|--------------|
| Product brief | `docs/BRIEF.md` | Goals, user, phases, schema, architecture decisions |
| UX design spec | `docs/DESIGN.md` | Navigation structure, interaction states, action panes, UI layout |
| TODO / backlog | `docs/TODO.md` | Known bugs, inconsistencies, design migration gaps, improvements |
| API reference | `api/README.md` | `/translate` and `/generate-cards` endpoints, request/response shapes, local dev |
| Card schema | `docs/CARD_SCHEMA.md` | Card batch JSON format, field definitions, import examples |

## gstack

Use the /browse skill from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.

Available gstack skills: /office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review, /design-consultation, /design-shotgun, /design-html, /review, /ship, /land-and-deploy, /canary, /benchmark, /browse, /connect-chrome, /qa, /qa-only, /design-review, /setup-browser-cookies, /setup-deploy, /setup-gbrain, /retro, /investigate, /document-release, /document-generate, /codex, /cso, /autoplan, /plan-devex-review, /devex-review, /careful, /freeze, /guard, /unfreeze, /gstack-upgrade, /learn
