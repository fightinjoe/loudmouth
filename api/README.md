# Catchphrase Lookup API

A Node.js Cloud Run function that serves `/lookup` — translation + AI-clustered related terms —
via multiple LLM backends, with an API Gateway handling rate limiting.

See `docs/API_DESIGN.md` for the endpoint contract (inputs, outputs, internal flow, model
behavior) and `docs/CARD_SCHEMA.md` for the `Card` shape.

## Project structure

```
api/
├── config/
│   └── api-gateway.yaml      # OpenAPI 2.0 spec + rate limiting (60 req/min)
├── src/
│   ├── index.js               # Cloud Run entry point, path routing
│   ├── lookup.js               # /lookup route handler (parse → generate → finish)
│   ├── lookup-parse.js         # Request validation + defaults
│   ├── lookup-prompt.js        # Prompt builder for the single model call
│   ├── lookup-validate.js      # Response validator, limits, context assignment
│   ├── card-validate.js        # Shared Card-shape validators (docs/CARD_SCHEMA.md)
│   ├── test/
│   │   └── lookup.test.js      # Unit tests (node --test)
│   ├── package.json
│   └── llms/
│       ├── anthropic.js        # Claude via Anthropic SDK
│       ├── openai.js           # GPT-4o via OpenAI SDK
│       └── genai.js            # Gemini via Google GenAI SDK
├── evals/
│   └── lookup.eval.js          # LLM-judge + golden-set eval harness
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
- `llm` — optional, `"google"` \| `"claude"` \| `"chatgpt"` (default `"google"`).

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
  ]
}
```

See `docs/API_DESIGN.md` for the full contract, including disambiguation, group limits
(≤4 blocks, ≤8 groups total, ≤10 cards/group), and worked examples.

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
npm test              # unit tests (node --test)
npm run eval:lookup   # LLM-judge + golden-set eval harness (evals/lookup.eval.js)
```

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
