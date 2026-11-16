---
kind: record
status: current
summary: Local verification 2026-11-14 of the adopted English-generation contract, prompt R4, relaxed wire bounds and generation fallback; test suites pass and three live local requests succeed, including Flash Lite directly on Vertex and a simulated-429 fallback.
verified: 2026-11-14
---

# Adoption check for the English-generation contract

On 2026-11-14 the `/phrasebook` English-generation stage moved to prompt [candidate R4](2026-11-14-english-prompt-candidate-r4.md) with its request and reply contract, an enforced reply schema, DeepSeek as primary with Gemini 3.5 Flash Lite as the rate-limit fallback, a Words bound of 24 (warning above 18) and consecutive same-speaker turns as a warning ([POST /phrasebook](../../api/phrasebook.md)). This record is the local verification of that change. Nothing was deployed.

**Outcome:** passed locally. The live fallback path was exercised with a simulated 429, not a real one.

## Deterministic suites

| Suite | Command | Result |
|---|---|---|
| API | `npm test` in `api/src` | 134 passed |
| Evaluation tooling | `bun test evals`, `bun evals/pipelines/cli.mjs validate` | 53 passed; fixtures valid |
| Web | `npm run typecheck`, `npm test` in `web/app` | typecheck clean; 335 passed |
| Wiki | `node scripts/check-docs.mjs` | 0 errors |

The web end-to-end and Storybook suites were not run; the web change removes one storage invariant and adds tests, with no pane or component change.

## Live local requests

A throwaway script called `performPhrasebook` with the real adapters and local credentials, owner-authorized. One Spanish `basics` request with two topics ("Buy a ticket", "Ask about platforms and times"), run three ways. No parser warning or validation retry occurred in any run.

| Run | Generation | Seconds per generation call | Whole request | Reported cost |
|---|---|---|---|---|
| Default | DeepSeek via OpenRouter (Relace), enforced schema | 2.2, 2.4 | 8.3 s | $0.0070 |
| Flash Lite as primary | Gemini 3.5 Flash Lite on Vertex, schema and minimal thinking | 2.5, 3.3 | 5.9 s | $0.0096 |
| Simulated 429 on one topic | DeepSeek for one topic, Flash Lite fallback for the other | 1.9 (DeepSeek), 2.6 (fallback) | 5.4 s | unknown |

- **Provider acceptance.** OpenRouter accepted the schema from the production adapter, and Vertex accepted the schema together with `thinkingLevel` minimal for Flash Lite. The evaluations had only reached Flash Lite through OpenRouter.
- **Fallback.** The simulated 429 logged `phrasebook_generation_fallback`, the other topic stayed on DeepSeek, and `usage.model` named both models. The 429 carries no usage, so the request's cost is reported as unknown rather than zero.
- **Words beyond ten.** DeepSeek topics carried 12 to 14 Words; translation and the wire validator accepted them. Translation took 5.8 to 5.9 s per topic in the default run and 2.5 to 2.8 s in the other two, so it was the slower stage in the default run.

## Limits

One request, one language, one sample per path, one time window; no real rate limit was observed; nothing was run against the gateway or a deployed service.
