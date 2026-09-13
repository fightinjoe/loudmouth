# Catchphrase API

Stateless Node.js Cloud Run service. Guided creation uses **`/context` → `/phrasebook`**;
`/lookup` remains the supporting translation endpoint. `/textbook` is retained for legacy callers,
not used by the migrated creation client.

[`docs/API_DESIGN.md`](../docs/API_DESIGN.md) is the endpoint contract; see
[`docs/CARD_SCHEMA.md`](../docs/CARD_SCHEMA.md) for cards and reading tokens.

## Endpoints

### `POST /context`

```json
{ "seed": "ordering vegan food", "language": "ja" }
```

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

`ability` is required (`none`, `basics`, `conversational`), with **no API default**. The client
currently sends the constant `basics`; this migration does not add an ability control.
The learner chooses 1–8 topics. `answers` and `checklist` are top-level fields, not nested in `context`.

Returns `{ title, groups, usage }`: one card group per topic in selection order and a final pooled
`vocab` group. English generation is followed by parallel conversation-sized translation calls;
assembly is by index. The service validates output, retries invalid generation/chunks once,
backs off on 429, and returns no partial phrasebook. See API_DESIGN for exact bounds and deadlines.

### `POST /lookup`

```json
{ "term": "bathroom", "language": "ja", "formality": "casual", "audience": "staff" }
```

Returns `{ blocks, usage }`. Required `term` is at most 200 characters. Optional lookup defaults:
`ability: "beginner"`, `formality: "polite"`, `audience: "staff"`. Lookup uses its existing
`none | beginner | intermediate | advanced` ability vocabulary, not phrasebook's vocabulary.

### Retained `POST /textbook`

Setup: `{ topic, language }`. Generation: `{ topic, language, context: { answers, checklist } }`.
The old route remains separate from the accepted phrasebook pipeline.

## Server-owned model selection

Clients cannot choose a backend. All endpoints reject a request `llm` field.

| `LLM_BACKEND` | Provider model |
|---|---|
| `gemini-3.5-flash-lite` (default) | Gemini 3.5 Flash Lite |
| `g-flash` | Gemini 3.8 Flash |
| `claude` | Claude Haiku |
| `chatgpt` | GPT-5.6 Luna |

`google` is no longer a selector or alias. Invalid configuration fails startup. To compare models,
restart the local API with another `LLM_BACKEND`, then use the same app or HTTP requests. No testing
header or request override is exposed. Usage reports the actual provider model, token counts,
estimated USD cost, and elapsed time. `/phrasebook` aggregates reported usage across calls and
retries, with wall-clock duration rather than summed parallel-call durations. Rates live in
`src/pricing.js`; unknown rates produce `costUsd: null`.

## Implementation map

- `src/index.js`: CORS, method handling, and endpoint routing.
- `src/llm-config.js`: server backend configuration and provider registry.
- `src/context.js`, `context-prompt.js`, `context-prompt.txt`: setup validation and accepted prompt.
- `src/phrasebook*.js` and phrasebook text files: pipeline, validation, prompt assembly, and cards.
- `src/llms/`: provider adapters and their timeout/output capabilities.
- `src/card-validate.js`, `pricing.js`: shared card and cost rules.
- `src/test/`: Node regression tests.
- `config/api-gateway.yaml`: routes, gateway deadlines, and rate quota.

Accepted prompt sources are under `prompts/context/` and `prompts/phrasebook/`. Service copies must
stay byte-identical, including Japanese/Chinese reading rules. Edit and accept source prompts first;
then copy and verify with `diff`. Static preset packs and the ability-aware context prompt are deferred.

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

Alternatively, populate `api/.env` and use the existing `npm run dev` script. The Google adapters use
Vertex AI and require application-default credentials. `GCP_VERTEX_LOCATION` defaults to `global`;
use `global`, `us`, or `eu`, not a regional model endpoint such as `us-central1`.
`GCP_LOCATION` remains the separate Cloud Run/Gateway deployment region.

For alternate providers, configure `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` on the server and restart
with `LLM_BACKEND=claude` or `LLM_BACKEND=chatgpt`.

Point the web client at the local API using `VITE_API_URL=http://localhost:8080` when starting
Vite. The client and API must be migrated together for production: the new client requires the new
routes, and old clients that submit `llm` are rejected. Local verification does not deploy either.

```bash
curl -sS http://localhost:8080/context \
  -H 'Content-Type: application/json' \
  -d '{"seed":"ordering vegan food","language":"ja"}'

curl -sS http://localhost:8080/phrasebook \
  -H 'Content-Type: application/json' \
  -d '{"seed":"ordering vegan food","language":"ja","ability":"basics","answers":{},"checklist":["State my dietary restrictions"]}'
```

### Verification

```bash
# api/src
npm test

# web/app
npm test
npm run build
```

Exercise the actual local app through topic entry, first-option question defaults, checklist
selection, generation, and persisted conversation/vocabulary views. Include one and eight selected
topics, all four languages, invalid/missing ability, client-supplied `llm`, translation count mismatch,
retry exhaustion, and out-of-order parallel completion. Historical evaluation outputs are evidence
of their recorded prompts/models, not current configuration documentation.

## Deployment reference

Production deployment is a separate operator action:

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
export GCP_PROJECT_ID=YOUR_PROJECT_ID
./deploy.sh
```

`deploy.sh` enables required APIs, prepares Secret Manager secrets and the service account, deploys
the Cloud Run function, and updates API Gateway. It prints instructions for missing secret values.
Set server `LLM_BACKEND` for the intended provider. Gateway and Cloud Run deadlines must exceed the
complete phrasebook request budget, including generation and chunk retries plus backoff.

API Gateway rate quota is configured under `x-google-management.quota.limits` in
`config/api-gateway.yaml`. Provider quotas are separate: one phrasebook request produces multiple
model calls, so gateway request limiting alone does not prevent provider 429 responses.

## Errors and trust boundary

- `400`: invalid request, missing required fields, invalid enum, or client backend selection.
- `502`: model failure, deadline, or invalid output after applicable retries.
- `OPTIONS` returns `204`; unsupported methods `405`; unknown paths `404`.

Request text is untrusted. Structural validation and output validation are not a prompt-injection
security guarantee. The current API does not verify that submitted question/topic labels came from
a prior `/context` response. See API_DESIGN's trust-boundary section before changing public inputs.

## Adding a provider

Implement the existing adapter contract `{ text, model, usage }`, register its server configuration
key in `src/llm-config.js`, and declare appropriate timeout/token capabilities. Add pricing if known.
Update operator documentation and exercise the pipeline before deployment. Do not add a client enum.
