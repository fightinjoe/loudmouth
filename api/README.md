# Translation API

A Node.js Cloud Run function that translates text via multiple LLM backends, with an API Gateway handling rate limiting.

## Project structure

```
translation-api/
├── config/
│   └── api-gateway.yaml      # OpenAPI 2.0 spec + rate limiting (60 req/min)
├── src/
│   ├── index.js              # Cloud Run entry point, request routing
│   ├── prompt.js             # Shared prompt builder (all LLMs use this)
│   ├── validate.js           # Response shape validation
│   ├── package.json
│   └── llms/
│       ├── vertex.js         # Gemma via Vertex AI (no API key needed)
│       ├── anthropic.js      # Claude via Anthropic SDK
│       └── openai.js         # GPT-4o via OpenAI SDK
├── deploy.sh                 # Idempotent GCP deploy script
└── README.md
```

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
curl -X POST http://localhost:8080 \
  -H 'Content-Type: application/json' \
  -d '{"text": "hello", "targetLanguage": "Japanese", "llm": "claude-sonnet"}'
```

For Vertex AI locally, `gcloud auth application-default login` provides the credentials automatically — no service account key file needed.

For Anthropic and OpenAI locally, set the env vars directly:

```bash
ANTHROPIC_API_KEY=sk-ant-... OPENAI_API_KEY=sk-... npm run dev
```

## Testing the deployed service

After `deploy.sh` completes, it prints the gateway URL. Export it and run a smoke test:

```bash
export GATEWAY_URL=https://YOUR_GATEWAY_HOST

curl -X POST $GATEWAY_URL/translate \
  -H 'Content-Type: application/json' \
  -d '{"text": "hello", "targetLanguage": "Japanese", "llm": "claude"}'
```

A successful response looks like:

```json
{
  "translations": [
    {
      "translation": "こんにちは",
      "lang": "ja",
      "text": "hello",
      "ruby_markup": null
    }
  ]
}
```

Test each LLM backend:

```bash
# Google
curl -s -X POST $GATEWAY_URL/translate \
  -H 'Content-Type: application/json' \
  -d '{"text": "hello", "targetLanguage": "Spanish", "llm": "google"}' | jq .

# Claude
curl -s -X POST $GATEWAY_URL/translate \
  -H 'Content-Type: application/json' \
  -d '{"text": "hello", "targetLanguage": "Spanish", "llm": "claude"}' | jq .

# ChatGPT
curl -s -X POST $GATEWAY_URL/translate \
  -H 'Content-Type: application/json' \
  -d '{"text": "hello", "targetLanguage": "Spanish", "llm": "chatgpt"}' | jq .
```

Test error handling:

```bash
# Unknown LLM → 400
curl -s -X POST $GATEWAY_URL/translate \
  -H 'Content-Type: application/json' \
  -d '{"text": "hello", "targetLanguage": "Spanish", "llm": "gpt-5"}' | jq .

# Missing field → 400
curl -s -X POST $GATEWAY_URL/translate \
  -H 'Content-Type: application/json' \
  -d '{"text": "hello", "llm": "claude"}' | jq .
```

View live logs in Cloud Logging:

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
3. Add the new model name to the `enum` list in `config/api-gateway.yaml`.
4. Re-run `./deploy.sh`.

No other files change.

## Changing rate limits

Rate limits are defined entirely in `config/api-gateway.yaml` under `x-google-management.quota.limits`. To change the limit from 60 to 120 requests/minute:

```yaml
values:
  STANDARD: 120
```

Then re-run `./deploy.sh` to deploy a new gateway config. No code changes required.
