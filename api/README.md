# Catchphrase API

Stateless Node.js Cloud Run service for guided phrasebook creation and on-demand phrase analysis.
Creation uses **`/context` → `/phrasebook`**, with independent naming via **`/phrasebook-title`**
and nonblocking watercolor covers via **`/phrasebook-image`**. Existing phrases use **`/phrase-breakdown`**.

The 2026-10-01 v3 promotion is **production code only; not deployed**. Known translation defects
remain accepted risk and separate improvement work. Deploy API, gateway, and web together.

[`docs/API_DESIGN.md`](../docs/API_DESIGN.md) is the shared architecture and endpoint index.
Each endpoint design below owns its request/response contract, pipeline, bounds and recovery policy.
This README owns development, configuration, tests and deployment—not a second endpoint specification.
Shared cards/readings follow [`docs/CARD_SCHEMA.md`](../docs/CARD_SCHEMA.md);
[evaluation guidance](../evals/README.md) owns assessment and reporting.


## Endpoints

| POST endpoint | Purpose | Contract and pipeline |
|---|---|---|
| `/context` | Situation questions, suggested conversations and image prompt | [Context design](../docs/api/context.md) |
| `/phrasebook-title` | Independent English UI naming | [Title design](../docs/api/phrasebook-title.md) |
| `/phrasebook` | English generation and translation for indexed topics | [Phrasebook design](../docs/api/phrasebook.md) |
| `/phrasebook-image` | Independent nonblocking PNG cover generation | [Image design](../docs/api/phrasebook-image.md) |
| `/phrase-breakdown` | Exact-source contextual teaching and lexical targets | [Breakdown design](../docs/api/phrase-breakdown.md) |

## Structured diagnostics

API diagnostics use [runtime failure levels](../docs/API_DESIGN.md#runtime-failure-levels),
not fields added to strict response envelopes. Count final outcomes rather than log lines.
The image route logs `usage` on success and `request_invalid`/`request_failed` on rejection, with
`route: 'phrasebook-image'` and a failure level. Usage contains cost, model and duration, not image
bytes or credentials. Endpoint designs distinguish implemented warnings from intended recovery.

## Server-owned model selection

Clients cannot choose a backend. `LLM_BACKEND` selects translation and the other text endpoints:

| `LLM_BACKEND` | Provider model |
|---|---|
| `gemini-3.5-flash-lite` (default) | Gemini 3.5 Flash Lite |
| `g-flash` | Gemini 3.8 Flash |
| `claude` | Claude Haiku |
| `chatgpt` | GPT-5.6 Luna |

`PHRASEBOOK_GENERATION_BACKEND` independently selects English generation:
`deepseek-v4.1-flash` (default, OpenRouter Relace only, reasoning disabled) or
`gemini-3.5-flash-lite`. Neither selector enables an automatic fallback.

Image generation separately requires server-side `OPENROUTER_API_KEY`; it needs no additional
image-provider account/key. Its fixed routing and output contract are in the image design.

Invalid configuration fails startup. To compare providers, restart the local API with another
`LLM_BACKEND`, then use the same request. No request override or testing header is exposed.

Usage reports actual reply model IDs, token counts, and wall-clock duration. `/phrasebook` aggregates
mixed-model generation, translation, and retries. Costs prefer reported per-reply charges, then
configured estimates in `src/pricing.js`; an unknown component makes the aggregate `costUsd: null`.

## Implementation map

```text
api/
├── config/api-gateway.yaml
├── evals/
│   ├── adversarial-scorer.js
│   ├── fixtures/
│   │   ├── adversarial.json
│   │   └── baseline/input_{directions,salsa,sick,surf,vegan}.json
│   └── scripts/eval-adversarial.js
└── src/
    ├── index.js
    ├── context/
    │   ├── index.js
    │   ├── prompt.js
    │   └── prompt.txt
    ├── phrasebook-title/
    │   ├── index.js
    │   ├── prompt.js
    │   └── prompt.txt
    ├── phrase-breakdown/
    │   ├── index.js
    │   ├── prompt.js
    │   └── prompt.txt
    ├── phrasebook-image/
    │   └── index.js
    ├── phrasebook/
    │   ├── index.js
    │   ├── parse.js
    │   ├── prompt.js
    │   ├── prompt.txt
    │   ├── translate-prompt.txt
    │   ├── reading-rules-ja.txt
    │   └── reading-rules-zh.txt
    ├── llms/                       # provider adapters + shared single-call timeout helper
    ├── llm-config.js
    ├── schema/                     # canonical strict TS contract; emits ignored dist/
    ├── pricing.js
    └── test/
```

The text files under `src/context/`, `src/phrasebook-title/`, `src/phrasebook/`, and
`src/phrase-breakdown/` are the authoritative runtime prompts. Changes require initial user approval
and before-and-after regression evaluation of behavior, latency, and token usage. Edit approved
changes in place; there is no separate prompt-source tree or copy step.

`src/index.js` exports the Cloud Function `translate` and owns CORS, method handling, and route
dispatch. `src/llm-config.js` owns server backend configuration, `src/llms/` contains provider
adapters, and the card and pricing modules contain shared rules.

`src/llms/timeout.js` shares the bounded-call/AbortSignal/timer-cleanup mechanics used by context,
title, and breakdown. Their handlers retain endpoint-specific deadlines, error types, validation,
usage, and HTTP policy. Phrasebook's multi-call retries/overall deadline and image disconnect
cancellation remain separate; they are not equivalent single-call lifecycles.

## Local development

From `api/src`:

```bash
npm install
gcloud auth application-default login
export GCP_PROJECT_ID=YOUR_PROJECT_ID
export GCP_VERTEX_LOCATION=global
export LLM_BACKEND=gemini-3.5-flash-lite
export PHRASEBOOK_GENERATION_BACKEND=deepseek-v4.1-flash
npm run schema:build
npx functions-framework --target=translate --port=8080
```

Alternatively, populate `api/.env` and use `npm run dev`. Google adapters use Vertex AI and require
application-default credentials. `GCP_VERTEX_LOCATION` defaults to `global`; use `global`, `us`, or
`eu`, not a regional model endpoint such as `us-central1`. `GCP_LOCATION` remains the separate Cloud
Run and API Gateway deployment region.

Supply `OPENROUTER_API_KEY` privately in `api/.env` for English generation and cover images.
Do not put keys in Vite variables, prompts, committed files, command history, or chat.
Missing image credentials fail cover work nonfatally; they must not prevent saving valid text.

The runtime-dependency-free card contract is compiled from `src/schema/index.ts`.
`predev` and `pretest` build it locally; direct Node tests/evals or raw Functions
Framework startup require `npm run schema:build` first. Deployment keeps `api/src`
as the source root and uses `gcp-build` to emit `schema/dist` while TypeScript is
available as a dev dependency. `start` deliberately does not invoke the compiler:
runtime dev dependencies may have been pruned. Google documents custom build
hooks and their dependency installation behavior in
[Node.js buildpacks](https://docs.cloud.google.com/docs/buildpacks/nodejs).
Do not override the build hook with an empty `GOOGLE_NODE_RUN_SCRIPTS`.

The API development launcher does not watch source or prompt files: restart `npm run dev` after
changing them. After a shared response-contract change, also restart the web app with
`npm run dev`: Vite forces dependency rebundling on startup so the freshly compiled local schema
cannot be hidden by a stale optimized dependency. Reload the browser and start a fresh creation flow;
an in-progress flow can still hold a response fetched from the old server.
For example, a v2 response cannot be committed by the v3 phrasebook validator. Do not synthesize
empty sections or translate old data into a compatibility shape: restart stale processes and begin
a fresh request using the new contract.

For parallel worktrees, `/add_worktree` copies only the main checkout's ignored
`api/.env` when present and writes an ignored `api/.env.local` with `PORT=XYZ1`.
`npm run dev` loads the base environment file and then the local override; an
explicit process environment variable takes precedence. Credentials are never
printed or committed. Keep Google application-default credentials in their
normal machine-level location rather than copying them into worktrees.
The web app uses `XYZ0` and its Playwright preview uses `XYZ2`; worktree
configuration points the browser at `http://tiny:XYZ1` so remote tailnet clients
can reach the API. The skill starts both dev servers in a new three-pane tmux
window in session `loudmouth`; see
[`web/app/README.md`](../web/app/README.md#parallel-worktrees) for details.

For alternate providers, configure `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` and restart with
`LLM_BACKEND=claude` or `LLM_BACKEND=chatgpt`.

Point the web client at the local service with `VITE_API_URL=http://localhost:8080`.

When started with `npm run dev`, every POST response sent by the API router is saved as a
pretty-printed JSON file in `api/tmp/` (git-ignored and created on demand, independent of the
working directory). Capture exists only in the development launcher; the production entrypoint
and direct Functions Framework launches do not capture responses.
Filenames contain a UTC timestamp followed by the endpoint name, for example
`2026-09-17T14-32-08.123Z-phrasebook-title.json`. Same-millisecond responses use incrementing
filename timestamps to avoid collisions within the process; the recorded timestamp remains
the actual capture time. Each file records `timestamp`, `method`, `path`, `status`, and `body`,
including successful responses and errors. Other methods, including CORS preflight `OPTIONS`,
are not captured.
These are final HTTP response bodies, not raw intermediate model outputs. Requests and headers
are not saved. Responses rejected by the Functions Framework before reaching the router are
not captured.

Capture writes synchronously before sending the response; a filesystem failure is logged without
failing the API call.
Files may contain sensitive generated content and accumulate until manually deleted; clear
`api/tmp/` when no longer needed.

```bash
curl -sS http://localhost:8080/context \
  -H 'Content-Type: application/json' \
  -d '{"seed":"ordering vegan food","language":"ja"}'

curl -sS http://localhost:8080/phrasebook \
  -H 'Content-Type: application/json' \
  -d '{"seed":"ordering vegan food","language":"ja","ability":"basics","answers":{},"checklist":["State my dietary restrictions"]}'
```

## Tests and model evals

Deterministic API tests run from `api/src`:

```bash
npm test
```

Phrase-breakdown prompt evaluation methodology, fixtures, scoring, and commands are documented in
[`evals/PHRASE_BREAKDOWN.md`](evals/PHRASE_BREAKDOWN.md).

The adversarial eval makes paid provider calls and reads server credentials from `api/.env` without
including them in prompts:

```bash
npm run eval:adversarial -- --mode=all --backend=gemini-3.5-flash-lite --repetitions=1
```

The default mode is `adversarial`. `--mode=baseline` runs the five fixtures in
`api/evals/fixtures/baseline/` through setup, generation, and every translation chunk using production
instructions. `--mode=all` combines the baseline, benign control, and attack cases. Useful options are
`--case='GLOB[,GLOB...]'`, `--repetitions=N`, `--out=PATH`, `--list-cases`, and
`--fail-on-findings`.

Artifacts default to ignored `api/evals/artifacts/`. Use synthetic canaries only. Successful
extraction is evidence of a failure; no observed extraction is not a confidentiality guarantee.
Review raw outputs alongside automated scoring and normal language-learning baselines. The runner
does not retry invalid output or provider errors itself; provider SDK retries still apply.

Historical Romp runs and raw cutover captures were intentionally deleted during the evaluation reset;
they are no longer replayable. Retained regression lessons, current tooling and approval boundaries
are documented in [`evals/README.md`](../evals/README.md). The API-local security evals above are unchanged.

Active attack coverage includes schema-preserving extraction, encoded disclosure, instruction
overrides in seed, answer, and checklist fields, generated translation source, and the complete
`/context`-to-`/phrasebook` pipeline.

## Deployment reference

Production deployment is an explicit operator action:

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
export GCP_PROJECT_ID=YOUR_PROJECT_ID
./deploy.sh
```

`deploy.sh` enables APIs, prepares Secret Manager secrets/service identity, deploys Cloud Run, and
updates API Gateway. Set both backend selectors intentionally. Secret bindings include
`openrouter-api-key`; provision its value privately before an authorized deployment.
Gateway and Cloud Run deadlines must exceed the complete phrasebook pipeline and retry budget.
This reference is not authorization: no deployment was performed for the code-only promotion.

The checked-in gateway configuration does not define caller authentication or rate quotas.
`deploy.sh` configures authenticated gateway-to-Cloud-Run invocation; that is not caller admission
control. Verify the actual deployed access boundary before public release. Provider quotas are
separate: one phrasebook request produces multiple model calls.

## Trust boundary

The stateless free-text contract is intentional: answers and checklist labels need not originate from
a prior `/context` response. All task data is serialized as JSON separately from trusted provider
instructions, including generated English passed to translation. This is defense in depth, not a
prompt-injection guarantee. Prompts may be extractable; never include secrets. Render returned strings
as text, including data previously persisted by clients.

## Adding a provider

Implement `handler({ instructions, input }, options)` returning `{ text, model, usage, costUsd? }`;
preserve provider-reported charges when available. Separate trusted instructions and JSON user input.
Register the server configuration key in `src/llm-config.js`, declare timeout and output-token
capabilities, and add pricing if known. Update provider-boundary tests and operator documentation; do
not add a client enum.
