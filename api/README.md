# Translation API

A Node.js Cloud Run function that translates text and generates language flashcards via multiple LLM backends, with an API Gateway handling rate limiting.

## Project structure

```
translation-api/
├── config/
│   └── api-gateway.yaml      # OpenAPI 2.0 spec + rate limiting (60 req/min)
├── src/
│   ├── index.js              # Cloud Run entry point, path routing
│   ├── prompt.js             # Prompt builder for /translate
│   ├── validate.js           # Response validator for /translate
│   ├── cards-prompt.js       # Prompt builder for /generate-cards
│   ├── cards-validate.js     # Response validator for /generate-cards
│   ├── package.json
│   └── llms/
│       ├── anthropic.js      # Claude via Anthropic SDK
│       ├── openai.js         # GPT-4o via OpenAI SDK
│       └── genai.js          # Gemini via Google GenAI SDK
├── deploy.sh                 # Idempotent GCP deploy script
└── README.md
```

## Endpoints

Both endpoints are served from the same Cloud Run function, routed by path.

### `POST /translate`

Translates text into a target language.

**Request:**
```json
{
  "text": "hello",
  "targetLanguage": "Japanese",
  "llm": "claude"
}
```

**Response:**
```json
{
  "translations": [
    {
      "translation": "Hello / Hi",
      "lang": "Japanese",
      "text": "こんにちは",
      "ruby_markup": "<ruby>こんにちは</ruby>"
    }
  ]
}
```

### `POST /generate-cards`

Generates language flashcards in the Loudmouth card batch schema (see `docs/card-batch-schema.md`).

**Request:**
```json
{
  "lang": "zh",
  "topic": "ordering food at a restaurant",
  "count": 15,
  "llm": "google"
}
```

- `lang` — required, `"zh"` or `"ja"`
- `topic` — required, freeform description of card content
- `count` — optional, integer 1–50 (default: 15)
- `llm` — optional, `"google"` | `"claude"` | `"chatgpt"` (default: `"google"`)

**Response:**
```json
{
  "cards": [
    {
      "lang": "zh",
      "type": "word",
      "text": "菜单",
      "reading": "càidān",
      "translation": "menu"
    }
  ]
}
```

See `docs/card-batch-schema.md` for the full schema reference.

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
npm run dev
```

The function will be available at `http://localhost:8080`. Test it:

```bash
curl -X POST http://localhost:8080/translate \
  -H 'Content-Type: application/json' \
  -d '{"text": "hello", "targetLanguage": "Japanese", "llm": "claude"}'

curl -X POST http://localhost:8080/generate-cards \
  -H 'Content-Type: application/json' \
  -d '{"lang": "zh", "topic": "ordering food at a restaurant"}'
```

For Anthropic and OpenAI locally, set the env vars directly:

```bash
ANTHROPIC_API_KEY=sk-ant-... OPENAI_API_KEY=sk-... npm run dev
```

## Testing the deployed service

After `deploy.sh` completes, it prints the gateway URL. Export it and run smoke tests:

```bash
export GATEWAY_URL=https://YOUR_GATEWAY_HOST
```

The gateway URL is `https://translation-api-gateway-2qqw247r.uc.gateway.dev`

### `/translate`

```bash
curl -s -X POST $GATEWAY_URL/translate \
  -H 'Content-Type: application/json' \
  -d '{"text": "hello", "targetLanguage": "Japanese", "llm": "claude"}' | jq .

curl -s -X POST $GATEWAY_URL/translate \
  -H 'Content-Type: application/json' \
  -d '{"text": "hello", "targetLanguage": "Spanish", "llm": "google"}' | jq .

curl -s -X POST $GATEWAY_URL/translate \
  -H 'Content-Type: application/json' \
  -d '{"text": "hello", "targetLanguage": "Spanish", "llm": "chatgpt"}' | jq .
```

### `/generate-cards`

```bash
# Default (google, 15 cards)
curl -s -X POST $GATEWAY_URL/generate-cards \
  -H 'Content-Type: application/json' \
  -d '{"lang": "zh", "topic": "ordering food at a restaurant"}' | jq .

# Japanese, 10 cards, Claude
curl -s -X POST $GATEWAY_URL/generate-cards \
  -H 'Content-Type: application/json' \
  -d '{"lang": "ja", "topic": "common verbs for daily routines", "count": 10, "llm": "claude"}' | jq .
```

### Error handling

```bash
# Unknown LLM → 400
curl -s -X POST $GATEWAY_URL/translate \
  -H 'Content-Type: application/json' \
  -d '{"text": "hello", "targetLanguage": "Spanish", "llm": "gpt-5"}' | jq .

# Missing field → 400
curl -s -X POST $GATEWAY_URL/translate \
  -H 'Content-Type: application/json' \
  -d '{"text": "hello", "llm": "claude"}' | jq .

# Invalid lang → 400
curl -s -X POST $GATEWAY_URL/generate-cards \
  -H 'Content-Type: application/json' \
  -d '{"lang": "fr", "topic": "food"}' | jq .

# Missing topic → 400
curl -s -X POST $GATEWAY_URL/generate-cards \
  -H 'Content-Type: application/json' \
  -d '{"lang": "zh"}' | jq .
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
