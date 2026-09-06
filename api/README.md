# Catchphrase Lookup API

A Node.js Cloud Run function that serves `/lookup` — translation + AI-clustered related terms —
and `/textbook` — a guided, two-call phrasebook generator — via multiple LLM backends, with an
API Gateway handling rate limiting.

See `docs/API_DESIGN.md` for the endpoint contract (inputs, outputs, internal flow, model
behavior) and `docs/CARD_SCHEMA.md` for the `Card` shape.

## Project structure

```
api/
├── config/
│   └── api-gateway.yaml      # OpenAPI 2.0 spec + rate limiting (60 req/min)
├── src/
│   ├── index.js                # Cloud Run entry point, path routing (/lookup, /textbook)
│   ├── lookup.js               # /lookup route handler (parse → generate → finish)
│   ├── lookup-parse.js         # /lookup request validation + defaults
│   ├── lookup-prompt.js        # /lookup prompt builder for the single model call
│   ├── lookup-validate.js      # /lookup response validator, limits, context assignment
│   ├── textbook.js             # /textbook route handler (two-call: questions → generate)
│   ├── textbook-parse.js       # /textbook request validation + defaults (both call modes)
│   ├── textbook-prompt.js      # /textbook prompt builders + limit constants
│   ├── textbook-validate.js    # /textbook response validators (questions + generate)
│   ├── card-validate.js        # Shared Card-shape validators (docs/CARD_SCHEMA.md)
│   ├── test/
│   │   ├── lookup.test.js      # /lookup unit tests (node --test)
│   │   └── textbook.test.js    # /textbook unit tests (node --test)
│   ├── package.json
│   └── llms/
│       ├── anthropic.js        # Claude via Anthropic SDK
│       ├── openai.js           # GPT-5.6 Luna via OpenAI SDK
│       └── genai.js            # Gemini via Google GenAI SDK
├── evals/
│   ├── eval-textbook.js       # /textbook multi-model YAML sample exporter (deno)
│   └── <prompt-slug>/         # per-prompt dir: context.json + <language>-<model>.yaml
├── deploy.sh                   # Idempotent GCP deploy script
└── README.md
```

## Endpoint

### `POST /lookup`

Looks up a term and returns a direct translation plus AI-clustered related groups.

**Request:**
```json
{
  "term": "bathroom",
  "language": "ja",
  "ability": "beginner",
  "formality": "casual",
  "audience": "staff",
  "llm": "google"
}
```

- `term` — required, max 200 characters. May carry a parenthetical for context, e.g.
  `"surf (v. to ride a wave)"`.
- `language` — required, `"zh"` \| `"ja"` \| `"es"` \| `"cs"`.
- `ability` — optional, `"none"` \| `"beginner"` \| `"intermediate"` \| `"advanced"` (default `"beginner"`).
- `formality` — optional, `"casual"` \| `"polite"` \| `"formal"` (default `"polite"`).
- `audience` — optional, `"stranger"` \| `"staff"` \| `"acquaintance"` \| `"family"` (default `"staff"`).
- `llm` — optional, `"google"` \| `"g-flash"` \| `"claude"` \| `"chatgpt"` (default `"google"`).

**Response:**
```json
{
  "blocks": [
    {
      "card": {
        "lang": "ja",
        "text": "トイレ",
        "reading": [["トイレ", null]],
        "translation": "toilet, restroom",
        "definition": "the toilet / restroom (not the bath)",
        "formality": "casual"
      },
      "groups": [
        {
          "title": "Using the toilet",
          "cards": ["..."]
        }
      ]
    }
  ],
  "usage": {
    "model": "gemini-3.5-flash-lite",
    "inputTokens": 812,
    "outputTokens": 4193,
    "totalTokens": 5005,
    "costUsd": 0.0021,
    "durationMs": 1842
  }
}
```

Both `/lookup` and `/textbook` 200 responses carry a `usage` block reporting the LLM
token counts, estimated `costUsd`, and elapsed LLM `durationMs` for that call. `costUsd`
is `null` when the served model has no configured rates; token counts and duration are
always reported. The same usage figures are emitted as a structured
`{ event: 'usage', ... }` log line to STDOUT under `npm run dev`.

Cost estimates use the USD-per-1,000,000-token rates in `src/pricing.js`, keyed by the exact model
string each provider reports. Gemini 3.8 Flash uses its promotional standard rates through
December 31, 2026; update that entry when Google's 2027 rates take effect.

See `docs/API_DESIGN.md` for the full contract, including disambiguation, group limits
(≤4 blocks, ≤8 groups total, ≤15 cards/group), and worked examples.

## First-time setup

### 1. Authenticate with GCP

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
export GCP_PROJECT_ID=YOUR_PROJECT_ID
```

### 2. Populate secrets in Secret Manager

After running `deploy.sh` for the first time, it will print instructions if secrets need values. To add them manually:

```bash
echo -n 'sk-ant-...' | gcloud secrets versions add anthropic-api-key \
  --data-file=- --project=$GCP_PROJECT_ID

echo -n 'sk-...' | gcloud secrets versions add openai-api-key \
  --data-file=- --project=$GCP_PROJECT_ID
```

### 3. Deploy

```bash
./deploy.sh
```

Or, if reading values from the local ENV:

```
set -a && source .env && set +a && ./deploy.sh
```

The script is idempotent — safe to re-run after config changes. It will:
- Enable required GCP APIs
- Create secrets (if missing) and print instructions to populate them
- Create and configure the `translation-api-sa` service account
- Deploy the Cloud Run function
- Create or update the API Gateway
- Print the final gateway URL and a ready-to-run `curl` test

## Local development

### Prerequisites

```bash
cd src && npm install
gcloud auth application-default login   # required for Vertex AI
```

The Google backends use Vertex AI: `google` selects **`gemini-3.5-flash-lite`** and `g-flash`
selects **`gemini-3.8-flash`**. Both are served from the `global`, `us`, or `eu` endpoints—not
regional endpoints such as `us-central1`. `GCP_VERTEX_LOCATION` defaults to `global` and remains
separate from `GCP_LOCATION`, the gateway and Cloud Run region. Leave `.env` at `global` unless the
project requires the `us` or `eu` data-residency endpoint.

### Run locally

```bash
cd src

# If you're getting a `GCP_PROJECT_ID enviornment variable is not set` error
set -a && source ../.env && set +a

npm run dev
```

The function will be available at `http://localhost:8080`. Test it:

```bash
curl -X POST http://localhost:8080/lookup \
  -H 'Content-Type: application/json' \
  -d '{"term": "bathroom", "language": "ja", "formality": "casual", "audience": "staff"}'
```

For Anthropic and OpenAI locally, set the env vars directly:

```bash
ANTHROPIC_API_KEY=sk-ant-... OPENAI_API_KEY=sk-... npm run dev
```

### Tests and evals

```bash
cd src
npm test                       # unit tests (node --test)

# Subjective-review sample exporter for /textbook. Requires the dev server
# running (npm run dev) and `deno` on PATH. Drives /textbook's two-call flow
# (questions → generate) across every model and writes one hand-editable YAML
# per model to evals/<prompt-slug>/<language>-<model>.yaml. The first model
# runs call 1 once and pins its output to evals/<prompt-slug>/context.json;
# every model then generates call 2 from that SAME context, so the samples are
# directly comparable. The raw `actual` block below the divider captures the
# pinned questions/answers plus both raw responses; the `ideal` section above
# the divider is seeded once and preserved across reruns.
npm run eval:textbook -- \
  --topic="salsa dancing in austin, tx" --language=es --llm=all \
  --checklist=default --url=http://localhost:8080
```

`--llm` accepts `all` (default — every model), a single model
(`google|g-flash|claude|chatgpt`), or a comma-separated subset. `--checklist=default`
generates only the checklist items the first model marked checked (falling back
to all if none are); `--checklist=all` generates every item. Pass `--force` to
reseed each model's `ideal` section from its fresh response.

To rerun an existing prompt — reusing its pinned `context.json` and overwriting
the model files — run from inside its directory (or point `--dir` at it):

```bash
cd evals/salsa-dancing-in-austin-tx && deno run ../eval-textbook.js
# or, from src/:
npm run eval:textbook -- --dir=../evals/salsa-dancing-in-austin-tx
```

Provider token ceilings are applied automatically: Claude Haiku receives at most
8,192 output tokens, GPT-5.6 Luna at most 16,384, and Google retains the
30,000-token ceiling. This keeps `/textbook` and `/lookup` compatible with each
provider's completion-token limit.

Per-provider request timeouts are applied the same way: `gemini-3.5-flash-lite`
keeps the shared 15s budget, while Claude Haiku, GPT-5.6 Luna, and Gemini 3.8
Flash each get 60s. Claude Haiku needs it — a `/textbook` generate call measures
20-26s, so the shared 15s budget failed every one of them with a 502.
The gateway's own backend `deadline` (`config/api-gateway.yaml`) is set to 90s so
it never cuts off a request before the service's timeout does.

## Testing the deployed service

After `deploy.sh` completes, it prints the gateway URL. Export it and run smoke tests:

```bash
export GATEWAY_URL=https://YOUR_GATEWAY_HOST
```

The gateway URL is `https://translation-api-gateway-2qqw247r.uc.gateway.dev`

```bash
curl -s -X POST $GATEWAY_URL/lookup \
  -H 'Content-Type: application/json' \
  -d '{"term": "bathroom", "language": "ja", "formality": "casual", "audience": "staff"}' | jq .

curl -s -X POST $GATEWAY_URL/lookup \
  -H 'Content-Type: application/json' \
  -d '{"term": "hello", "language": "es", "llm": "claude"}' | jq .

curl -s -X POST $GATEWAY_URL/lookup \
  -H 'Content-Type: application/json' \
  -d '{"term": "surf (v. to ride a wave)", "language": "cs", "llm": "chatgpt"}' | jq .
```

### Error handling

```bash
# Unknown LLM → 400
curl -s -X POST $GATEWAY_URL/lookup \
  -H 'Content-Type: application/json' \
  -d '{"term": "hello", "language": "es", "llm": "gpt-5"}' | jq .

# Missing field → 400
curl -s -X POST $GATEWAY_URL/lookup \
  -H 'Content-Type: application/json' \
  -d '{"term": "hello"}' | jq .

# Invalid language → 400
curl -s -X POST $GATEWAY_URL/lookup \
  -H 'Content-Type: application/json' \
  -d '{"term": "hello", "language": "fr"}' | jq .
```

View live logs:

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="translation-api"' \
  --limit=50 --project=$GCP_PROJECT_ID --format=json | jq '.[].jsonPayload'
```

## Adding a new LLM provider

1. Create `src/llms/your-provider.js` — export a `callYourProvider(prompt)` function that returns a string.
2. Add one line to `LLM_REGISTRY` in `src/index.js`:
   ```js
   'your-model-name': callYourProvider,
   ```
3. Add the new model name to the `enum` lists in `config/api-gateway.yaml`.
4. Re-run `./deploy.sh`.

No other files change.

## Changing rate limits

Rate limits are defined entirely in `config/api-gateway.yaml` under `x-google-management.quota.limits`. To change the limit from 60 to 120 requests/minute:

```yaml
values:
  STANDARD: 120
```

Then re-run `./deploy.sh`. No code changes required.
