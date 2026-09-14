# Catchphrase API

Stateless Node.js Cloud Run service for guided phrasebook creation. The public API has two routes:
**`/context` → `/phrasebook`**.

[`docs/API_DESIGN.md`](../docs/API_DESIGN.md) is the endpoint contract; see
[`docs/CARD_SCHEMA.md`](../docs/CARD_SCHEMA.md) for cards and reading tokens.

## Endpoints

### `POST /context`

```json
{ "seed": "ordering vegan food", "language": "ja" }
```

`seed` is required, trimmed, and limited to 200 characters. `language` must be one of `zh`, `ja`,
`es`, or `cs`.

Returns `{ questions, checklist, usage }`. Questions have `label` and `options`; the **first option**
is the default. Checklist entries have `label` and `checked`. No server session is created.

### `POST /phrasebook`

```json
{
  "seed": "ordering vegan food",
  "language": "ja",
  "ability": "basics",
  "answers": { "Where are you eating?": "Standard restaurant" },
  "checklist": ["State my dietary restrictions", "Ask about hidden ingredients"]
}
```

`ability` is required and must be `none`, `basics`, or `conversational`. The learner chooses 1–8
checklist topics. `answers` and `checklist` are top-level fields, not nested under a context object.

Returns `{ title, groups, usage }`: one conversation group per topic in selection order and a final
pooled `vocab` group. English generation is followed by parallel conversation-sized translation
calls; assembly is by index. The service validates output, retries invalid generation or translation
chunks once, backs off on provider rate limits, and returns no partial phrasebook. See API_DESIGN for
exact bounds and deadlines.

## Shared HTTP behavior

Both routes accept `POST` JSON and reject a client-supplied `llm` selector. `OPTIONS` returns `204`
with CORS headers, unsupported methods return `405`, and unknown paths return `404`.

- `400`: invalid request, missing required field, invalid enum, or client backend selection.
- `502`: provider failure, deadline, or output still invalid after the endpoint's applicable retries.

## Server-owned model selection

Clients cannot choose a backend. Configure `LLM_BACKEND` on the server:

| `LLM_BACKEND` | Provider model |
|---|---|
| `gemini-3.5-flash-lite` (default) | Gemini 3.5 Flash Lite |
| `g-flash` | Gemini 3.8 Flash |
| `claude` | Claude Haiku |
| `chatgpt` | GPT-5.6 Luna |

Invalid configuration fails startup. To compare providers, restart the local API with another
`LLM_BACKEND`, then use the same request. No request override or testing header is exposed.

Usage reports the actual provider model, input and output token counts, estimated USD cost, and
elapsed time. `/phrasebook` aggregates usage across generation, translation, and retries while
reporting wall-clock duration. Rates live in `src/pricing.js`; unknown rates produce `costUsd: null`.

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
    ├── phrasebook/
    │   ├── index.js
    │   ├── parse.js
    │   ├── prompt.js
    │   ├── prompt.txt
    │   ├── translate-prompt.txt
    │   ├── reading-rules-ja.txt
    │   └── reading-rules-zh.txt
    ├── llms/
    ├── llm-config.js
    ├── card-validate.js
    ├── pricing.js
    └── test/
```

The text files under `src/context/` and `src/phrasebook/` are the authoritative runtime prompts.
Edit them in place; there is no separate prompt-source tree or copy step.

`src/index.js` exports the Cloud Function `translate` and owns CORS, method handling, and route
dispatch. `src/llm-config.js` owns server backend configuration, `src/llms/` contains provider
adapters, and the card and pricing modules contain shared rules.

## Local development

From `api/src`:

```bash
npm install
gcloud auth application-default login
export GCP_PROJECT_ID=YOUR_PROJECT_ID
export GCP_VERTEX_LOCATION=global
export LLM_BACKEND=gemini-3.5-flash-lite
npx functions-framework --target=translate --port=8080
```

Alternatively, populate `api/.env` and use `npm run dev`. Google adapters use Vertex AI and require
application-default credentials. `GCP_VERTEX_LOCATION` defaults to `global`; use `global`, `us`, or
`eu`, not a regional model endpoint such as `us-central1`. `GCP_LOCATION` remains the separate Cloud
Run and API Gateway deployment region.

For alternate providers, configure `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` and restart with
`LLM_BACKEND=claude` or `LLM_BACKEND=chatgpt`.

Point the web client at the local service with `VITE_API_URL=http://localhost:8080`.

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

`deploy.sh` enables required APIs, prepares Secret Manager secrets and the service account, deploys
the Cloud Run function, and updates API Gateway. Set `LLM_BACKEND` for the intended provider. Gateway
and Cloud Run deadlines must exceed the complete phrasebook request budget, including generation,
chunk retries, and rate-limit backoff.

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

Implement `handler({ instructions, input }, options)` returning `{ text, model, usage }`. Map trusted
instructions and JSON input to separate native instruction and user fields; never concatenate them.
Register the server configuration key in `src/llm-config.js`, declare timeout and output-token
capabilities, and add pricing if known. Update provider-boundary tests and operator documentation; do
not add a client enum.
