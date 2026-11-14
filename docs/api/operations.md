---
kind: guide
status: current
summary: "Catchphrase API operations: model selection, implementation map, local development, tests, evals and deployment."
sources: [api/src/index.js, api/src/log.js, api/src/llm-config.js, api/src/llms/openrouter.js, api/src/dev.js, api/src/package.json, api/deploy.sh, api/config/api-gateway.yaml, api/evals/scripts/eval-adversarial.js, scripts/generation-report.mjs, scripts/cost-report.mjs, scripts/lib/log-events.mjs]
verified: 2026-11-14
---

# Catchphrase API operations

Stateless Node.js Cloud Run service for guided phrasebook creation and on-demand phrase analysis. The [API design](../api-design.md) owns the endpoint table, shared conventions and trust boundaries; each endpoint page owns its contract, pipeline, bounds and recovery policy. This page owns configuration, the implementation map, local development, tests, evals and deployment. Production deployment state is in [Production](#production).

## Structured diagnostics

API diagnostics use [runtime failure levels](../api-design.md#runtime-failure-levels), not fields added to strict response envelopes. Count final outcomes rather than log lines. The image route logs `usage` on success and `request_invalid`/`request_failed` on rejection, with `route: 'phrasebook-image'` and a failure level. Usage contains cost, model and duration, not image bytes or credentials. Endpoint designs distinguish implemented warnings from intended recovery.

Every structured event goes through `api/src/log.js` as one JSON line with a Cloud Logging `severity`, so Cloud Run stores it as a queryable `jsonPayload` (for example `jsonPayload.event="llm_call"`). Events also carry the request's `requestId`: Cloud Run's trace ID, or a fresh UUID locally. Production logs are kept 30 days. `/phrasebook` logs one `llm_call` per provider attempt (`route` `phrasebook:generate` or `phrasebook:translate`, `topicIndex`, `attempt`, `outcome` `ok`/`incomplete`/`rate_limited`/`timeout`/`cancelled`/`error`, `durationMs`, `provider`, `outputTokens`, `outputTokensPerSecond`), `validation_error` and retry events, and one `phrasebook_flag` event per response flag (count overruns, English repairs, missing sections, unresolved word sources).

`node scripts/generation-report.mjs [--since 7d] [--project <id>]` summarizes production logs as Markdown: request outcomes and failure levels, per-topic English latency (p50/p90/p95, share under 3/6/10 s), attempts by provider, invalid replies by kind, retries and response flags by code and section. `--file <log>` reads local dev-server output instead (one JSON event per line; other lines are skipped).

`node scripts/cost-report.mjs [--since 30d] [--project <id>]` reads the same events. It reports mean, p50, p90 and maximum cost per call by route; `/phrasebook` cost by language with cost per topic and mean card count; and the per-phrasebook and per-user cost model. The model's assumption flags and their current values are on the [business model](../todo/public-launch/business-model.md#cost-to-serve) page. It accepts `--file` like the generation report.

## Server-owned model selection

Clients cannot choose a backend; there is no request override or testing header. Two independent environment selectors are read by `api/src/llm-config.js` (`getBackendName`, `getPhrasebookGenerationBackendName`); defaults and accepted values live there, and invalid values fail startup. Neither selector enables an automatic fallback.

| Selector | Drives | Values → adapter model constant |
|---|---|---|
| `LLM_BACKEND` | Translation and every other text endpoint | `gemini-3.5-flash-lite` (default) → `GENAI_MODEL`, `g-flash` → `GENAI_FLASH_MODEL` in `api/src/llms/genai.js`; `claude` → `ANTHROPIC_MODEL` in `api/src/llms/anthropic.js`; `chatgpt` → `OPENAI_MODEL` in `api/src/llms/openai.js` |
| `PHRASEBOOK_GENERATION_BACKEND` | `/phrasebook` English generation | `deepseek-v4.1-flash` (default) → `DEEPSEEK_MODEL` in `api/src/llms/openrouter.js` (OpenRouter performance routing across DeepSeek providers, reasoning disabled; see [POST /phrasebook](phrasebook.md#english-generation)); `gemini-3.5-flash-lite` |

Image generation separately requires server-side `OPENROUTER_API_KEY`; its fixed routing and output contract are on the [image page](phrasebook-image.md). To compare text providers, restart the local API with another `LLM_BACKEND` and repeat the same request.

Usage reports actual reply model IDs, token counts and wall-clock duration. `/phrasebook` aggregates mixed-model generation, translation and retries. Costs prefer reported per-reply charges, then configured estimates in `src/pricing.js`; an unknown component makes the aggregate `costUsd: null`.

## Implementation map

```text
api/
├── config/api-gateway.yaml         # API Gateway (Swagger 2.0) routes, deadlines, wire schemas
├── deploy.sh                       # Secrets, Cloud Run deploy, gateway update
├── evals/
│   ├── adversarial-scorer.js
│   ├── fixtures/
│   │   ├── adversarial.json
│   │   ├── baseline/input_{directions,salsa,sick,surf,vegan}.json
│   │   └── phrase-breakdown.json
│   └── scripts/
│       ├── eval-adversarial.js
│       └── eval-phrase-breakdown.js
└── src/
    ├── index.js                    # Cloud Function `translate`: CORS, methods, route dispatch
    ├── dev.js                      # `npm run dev` launcher: env files, response capture
    ├── ability.js                  # shared ability enum and sanitizer
    ├── reading.js                  # shared pure reading/romanization helpers
    ├── llm-config.js               # backend selectors and registry
    ├── pricing.js                  # usage and cost accounting
    ├── llms/                       # provider adapters + shared single-call timeout helper
    ├── schema/                     # canonical strict TS contract; emits ignored dist/
    ├── context/                    # index.js, prompt.js, prompt.txt
    ├── phrasebook-title/           # index.js, prompt.js, prompt.txt
    ├── phrase-breakdown/           # index.js, prompt.js, prompt.txt
    ├── phrasebook-image/           # index.js
    ├── phrasebook/                 # index.js, parse.js, prompt.js, prompt.txt, translate-prompt.txt,
    │                               # reading-rules-ja.txt, reading-rules-zh.txt
    └── test/
```

The `*.txt` files beside each handler are the runtime prompts; there is no separate prompt-source tree or copy step. The offline evaluation pipelines in `evals/pipelines/` import production modules directly (`api/src/phrasebook/parse.js`, `prompt.js`, `index.js`, `api/src/schema`) and read the phrasebook prompt files, so changes there affect evaluation tooling too.

`src/llms/timeout.js` shares the bounded-call/AbortSignal/timer-cleanup mechanics used by context, title and breakdown. Their handlers retain endpoint-specific deadlines, error types, validation, usage and HTTP policy. Phrasebook's multi-call retries/overall deadline and image disconnect cancellation are separate lifecycles.

## Local development

From `api/src`:

```bash
npm install
gcloud auth application-default login
export GCP_PROJECT_ID=YOUR_PROJECT_ID
export GCP_VERTEX_LOCATION=global
npm run schema:build
npx functions-framework --target=translate --port=8080
```

Alternatively, populate `api/.env` and use `npm run dev`. Google adapters use Vertex AI and require application-default credentials. `GCP_VERTEX_LOCATION` defaults to `global`; use `global`, `us`, or `eu`, not a regional model endpoint such as `us-central1`. `GCP_LOCATION` remains the separate Cloud Run and API Gateway deployment region.

Supply `OPENROUTER_API_KEY` privately in `api/.env` for English generation and cover images. Do not put keys in Vite variables, prompts, committed files, command history, or chat. Missing image credentials fail cover work nonfatally; they must not prevent saving valid text.

The runtime-dependency-free card contract is compiled from `src/schema/index.ts`. `predev` and `pretest` build it locally; direct Node tests/evals or raw Functions Framework startup require `npm run schema:build` first. Deployment keeps `api/src` as the source root and uses `gcp-build` to emit `schema/dist` while TypeScript is available as a dev dependency. `start` deliberately does not invoke the compiler: runtime dev dependencies may have been pruned. Google documents custom build hooks and their dependency installation behavior in [Node.js buildpacks](https://docs.cloud.google.com/docs/buildpacks/nodejs). Do not override the build hook with an empty `GOOGLE_NODE_RUN_SCRIPTS`.

The API development launcher does not watch source or prompt files: restart `npm run dev` after changing them. After a shared response-contract change, also restart the web app with `npm run dev`: Vite forces dependency rebundling on startup so the freshly compiled local schema cannot be hidden by a stale optimized dependency. Reload the browser and start a fresh creation flow; an in-progress flow can still hold a response fetched from the old server. For example, a v3 response cannot be committed by the v4 phrasebook validator. Do not synthesize empty sections or translate old data into a compatibility shape: restart stale processes and begin a fresh request using the new contract.

`npm run dev` loads `api/.env` and then an optional `api/.env.local` override; an explicit process environment variable takes precedence. Parallel worktrees use `.env.local` for their port; see [add worktree](../skills/add_worktree.md). Keep Google application-default credentials in their normal machine-level location rather than copying them into worktrees.

For alternate providers, configure `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` and restart with `LLM_BACKEND=claude` or `LLM_BACKEND=chatgpt`.

Point the web client at the local service with `VITE_API_URL=http://localhost:8080`.

When started with `npm run dev`, every POST response sent by the API router is saved as a pretty-printed JSON file in `api/tmp/` (git-ignored and created on demand, independent of the working directory). Capture exists only in the development launcher; the production entrypoint and direct Functions Framework launches do not capture responses. Filenames contain a UTC timestamp followed by the endpoint name, for example `2026-09-17T14-32-08.123Z-phrasebook-title.json`. Same-millisecond responses use incrementing filename timestamps to avoid collisions within the process; the recorded timestamp remains the actual capture time. Each file records `timestamp`, `method`, `path`, `status`, and `body`, including successful responses and errors. Other methods, including CORS preflight `OPTIONS`, are not captured. These are final HTTP response bodies, not raw intermediate model outputs. Requests and headers are not saved. Responses rejected by the Functions Framework before reaching the router are not captured.

Capture writes synchronously before sending the response; a filesystem failure is logged without failing the API call. Files may contain sensitive generated content and accumulate until manually deleted; clear `api/tmp/` when no longer needed.

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

Phrase-breakdown prompt evaluation (`api/evals/scripts/eval-phrase-breakdown.js`) is documented in [phrase-breakdown evals](../evals/phrase-breakdown.md).

The adversarial eval makes paid provider calls and reads server credentials from `api/.env` without including them in prompts:

```bash
npm run eval:adversarial -- --mode=all --backend=gemini-3.5-flash-lite --repetitions=1
```

The default mode is `adversarial`. `--mode=baseline` runs the five fixtures in `api/evals/fixtures/baseline/` through setup, generation, and every translation chunk using production instructions. These are reusable input fixtures, not recorded responses or historical run snapshots. `--mode=all` combines the baseline, benign control, and attack cases. Useful options are `--case='GLOB[,GLOB...]'`, `--repetitions=N`, `--out=PATH`, `--list-cases`, and `--fail-on-findings`.

Artifacts default to ignored `api/evals/artifacts/`. Use synthetic canaries only. Successful extraction is evidence of a failure; no observed extraction is not a confidentiality guarantee. Review raw outputs alongside automated scoring and normal language-learning baselines. The runner does not retry invalid output or provider errors itself; provider SDK retries still apply.

Content-quality workflows and fixtures are documented in [evaluation guidance](../evals/index.md); results are recorded in the [results ledger](../evals/results.md).

Active attack coverage includes schema-preserving extraction, encoded disclosure, instruction overrides in seed, answer, and checklist fields, generated translation source, and the complete `/context`-to-`/phrasebook` pipeline.

## Production

This section owns production deployment state. v4 has been live since 2026-11-13 ([release record](../evals/results/2026-11-13-v4-live-release.md)). The API was redeployed the same day with generation reliability (revision `translation-api-00018-2js`); its gateway config, rollback targets and live checks are in the [deployment record](../evals/results/2026-11-13-generation-reliability-deploy.md). The live web still runs the v4 build and rejects most of the new responses until it is redeployed (owner decision 2026-11-13).

| Component | Production | Deployed by |
|---|---|---|
| API | Cloud Run service `translation-api` (`us-central1`, Node.js 24 base image) in the project named by `GCP_PROJECT_ID` | `api/deploy.sh` |
| Gateway | `translation-api-gateway`, `https://translation-api-gateway-2qqw247r.uc.gateway.dev`, the web build's default `GATEWAY_URL` | `api/deploy.sh` |
| Web | Vercel, `https://loudmouth-gilt.vercel.app` | push to the `prod` branch ([web deployment](../web/development.md#deployment)) |
| iOS | Not released from this repository's current code; it calls retired routes ([iOS architecture](../ios/architecture.md)) | — |

An API/web contract change makes the live web and API incompatible until both are deployed: deploy the API, then push the web immediately. There is no pre-production environment yet ([staging todo](../todo/public-launch/staging-environment.md)).

## Deployment reference

Production deployment is an explicit operator action:

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
export GCP_PROJECT_ID=YOUR_PROJECT_ID
./deploy.sh
```

`deploy.sh` enables APIs, prepares Secret Manager secrets/service identity, deploys Cloud Run, and updates API Gateway. The Cloud Run function runs on the Node.js 24 base image (`--base-image="nodejs24"`), matching the `engines` pin in `src/package.json` and the repository `.nvmrc`. Set both backend selectors intentionally. Secret bindings include `openrouter-api-key`; provision its value privately before an authorized deployment. Gateway and Cloud Run deadlines must exceed the complete phrasebook pipeline and retry budget. Deploying requires explicit owner authorization.

Secrets bind as `:latest`, and Secret Manager shows only that a version exists, not that the key is valid. After every deployment, confirm with a live `/phrasebook` request (OpenRouter) and a live `/context` request (Vertex AI). To replace a key, add a version privately with the `read -rs … gcloud secrets versions add` command that `deploy.sh` prints. Then roll a revision so it reads the new version: `gcloud run services update translation-api --update-secrets=OPENROUTER_API_KEY=openrouter-api-key:latest --region=us-central1 --project=<project>`.

The checked-in gateway configuration does not define caller authentication or rate quotas. `deploy.sh` configures authenticated gateway-to-Cloud-Run invocation; that is not caller admission control. Verify the actual deployed access boundary before public release. Provider quotas are separate: one phrasebook request produces multiple model calls.

## Adding a provider

Implement `handler({ instructions, input }, options)` returning `{ text, model, usage, costUsd? }`; preserve provider-reported charges when available. Keep trusted instructions separate from JSON user input ([trust boundaries](../api-design.md#trust-boundaries)). Register the server configuration key in `src/llm-config.js`, declare timeout and output-token capabilities, and add pricing if known. Update provider-boundary tests and operator documentation; do not add a client enum.
