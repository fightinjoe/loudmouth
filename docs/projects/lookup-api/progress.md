# /lookup API — Progress Log

## Codebase Patterns
- `api/src/card-validate.js` is the shared per-card validator for both `/lookup` and legacy `/generate-cards` — extend its enums (lang, formality) here, never duplicate per-route.
- Route-specific finish/clamp logic (drop vs. strip vs. throw) belongs in the route's own validate module (`lookup-validate.js`), layered on top of the shared card validator, not folded into it.
- `api/src/package.json` test script is `node --test test/` (Node's built-in test runner, no framework dep). Test files live in `api/src/test/*.test.js`.
- Local smoke testing: `cd api/src && set -a && source ../.env && set +a && FUNCTION_TARGET=translate npx @google-cloud/functions-framework --port=<port>`, then curl. `.env` has real `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`GCP_PROJECT_ID` for live LLM smoke tests.

## 2026-08-20 — LK-001
Task: Parse layer: term/context split + input validation
- Added `api/src/lookup-parse.js`: `parseTerm` (splits `term` on the first `(`, strips stray parens from context, tolerates a missing closing `)`) and `parseLookupRequest` (validates required `term`/`language`, enums for `ability`/`formality`/`audience`/`llm`, term ≤200 chars, applies Inputs-table defaults).
- Files changed: `api/src/lookup-parse.js` (new).
- **Learnings:** the old `api/src/lookup.js` used a `seed`/`deck` nested body shape from a pre-restructure draft of the contract — the current contract is a flat body (`term`, `language`, `ability`, `formality`, `audience`, `llm`). Confirmed via `docs/API_DESIGN.md`'s Inputs table, not the old code.
---

## 2026-08-20 — LK-002
Task: Prompt + Generate call (single LLM call, token/latency budget)
- Rewrote `api/src/lookup-prompt.js`: `buildLookupPrompt({ term, context, language, ability, formality, audience })` implements intent translation, ≤4-block disambiguation, ≤8-group/≤10-card theme grouping, English group titles, the formality soft-anchor + slang-never-spills-in rule, ability difficulty scaling (including the `none` floor), and the content quality bar. Output schema uses `card` (not the old `primary`) per the restructured Outputs contract, and drops the old `seed` echo field (current contract has no top-level `seed`).
- Files changed: `api/src/lookup-prompt.js` (rewritten).
- **Learnings:** `docs/CARD_SCHEMA.md`'s reading-token rule for non-CJK scripts ("Other scripts — a single unannotated token") applies to `es`/`cs`; only `zh` (per-character pinyin) and `ja` (kanji+hiragana, kana=null) get structured multi-token readings.
---

## 2026-08-20 — LK-003
Task: Response validation + Finish layer
- Rewrote `api/src/lookup-validate.js`: parses/validates the model JSON (`card`+`groups` per block), clamps to ≤4 blocks / ≤8 groups total (shared budget, in-order) / ≤10 cards per group (all keep-first-N, drop-from-end), drops empty groups (no other minimum), sets `context` (block card ← input parenthetical, group card ← group title), and strips (not throws) an out-of-range per-card `formality`.
- Files changed: `api/src/lookup-validate.js` (rewritten), `api/src/card-validate.js` (added `formality` enum check + broadened `lang` enum to `zh|ja|es|cs`).
- **Learnings:** `card-validate.js`'s new formality enum is the full CARD_SCHEMA set (`casual|polite|formal|slang|vulgar`) — genuinely bogus values throw (malformed → 502) there, while `lookup-validate.js` additionally strips schema-valid-but-not-`/lookup`-output values (`vulgar`) since `/lookup` only ever emits 4 of the 5. Layering: shared validator = structural correctness; route validator = route-specific output contract.
---

## 2026-08-20 — LK-004
Task: /lookup route wiring
- Rewrote `api/src/lookup.js`: extracted a pure `performLookup(parsedRequest, registry, opts)` core (reused later by the eval harness) wrapped by `handleLookup(req, res, registry, opts)` for Express-style routing. Added a distinguishable timeout path (`LookupTimeoutError` + `callWithTimeout`, 15s budget, injectable via `opts.timeoutMs` for tests) that still maps to the same 502 as a hard LLM error, but on a separate catch branch. `maxOutputTokens` set to 20000. No `index.js` changes needed — the `/lookup` route wiring, 204/405/404 behavior, and `LLM_REGISTRY` dispatch were already correct.
- Added `api/src/test/lookup.test.js`: 35 `node:test` cases (LLM mocked) covering every "parse term", "handler", and "validate + finish" row in `API_DESIGN.md`'s Test coverage table, including all CRITICAL ones (blocks/groups/cards trim boundaries + over-cap, timeout-vs-throw distinct paths, truncated JSON, service-set `context`).
- Added `"test": "node --test test/"` to `api/src/package.json`.
- Manually smoke-tested all 3 worked examples (bathroom, dinner, water) end-to-end against the real `claude` backend via `functions-framework` + curl — output matched `API_DESIGN.md`'s expected shape (bathroom disambiguates into 2 blocks with a soft-register spillover to polite forms; dinner is one block with themed groups; water has no `formality`/`definition`). Also verified 400 (missing term, unknown llm), 204 (OPTIONS), 405 (GET), 404 (unknown path).
- Files changed: `api/src/lookup.js` (rewritten), `api/src/test/lookup.test.js` (new), `api/src/package.json` (test script).
- **Learnings:** `functions-framework`'s dev server (`FUNCTION_TARGET=translate npx @google-cloud/functions-framework --port=<port>`) is the fastest way to manually curl-smoke-test any route in this repo without deploying; `api/.env` already has working `ANTHROPIC_API_KEY` for local live testing.
