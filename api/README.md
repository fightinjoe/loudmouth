# Catchphrase API

Stateless Node.js Cloud Run service for guided phrasebook creation and on-demand phrase analysis.
Creation uses **`/context` → `/phrasebook`**, with independent UI naming via **`/phrasebook-title`**.
Existing phrases use **`/phrase-breakdown`**.

[`docs/API_DESIGN.md`](../docs/API_DESIGN.md) is the endpoint contract; see
[`docs/CARD_SCHEMA.md`](../docs/CARD_SCHEMA.md) for cards and reading tokens.

## Endpoints

### `POST /context`

```json
{ "seed": "ordering vegan food", "language": "ja" }
```

`seed` is required, trimmed, and limited to 200 characters. `language` must be one of `zh`, `ja`,
`es`, or `cs`. Optional `ability` accepts `none`, `basics`, or `conversational`; invalid
values are ignored. The prompt uses known ability and leaves proficiency questions to the client.

Returns `{ questions, checklist, usage }`. Questions have `label` and `options`; the **first option**
is the default. Checklist entries have `label` and `checked`. No server session is created.

### `POST /phrasebook-title`

```json
{ "seed": "Making small talk with other people at a dog park" }
```

Returns `{ title, usage }`, for example `"Dog Park Chitchat 🐕"`. Seed validation matches `/context`.
Uses its own prompt to produce a short English title, generally 2–6 words with an optional emoji.
Titles are validated as non-empty, single-line strings of at most 80 characters.
The client calls this in parallel with `/context` and freezes the available title or seed fallback
when saving. It never waits for naming or sends the title to `/phrasebook`.

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

`ability` accepts `none`, `basics`, or `conversational`; omitted or invalid values default to `basics`. The learner chooses 1–8
checklist topics. `answers` and `checklist` are top-level fields, not nested under a context object.

Returns `{ title, groups, usage }`: one `{ title, cards, vocab }` conversation bundle per request topic,
in request order. `vocab` contains normalized word cards without cross-topic deduplication or a global
cap. The client prefetches all topics while the learner selects, then filters bundles by index before
pooling, deduplicating, and capping vocabulary locally. API and web must deploy together.
English generation is followed by parallel conversation-sized translation calls; assembly is by index.
The service validates output, retries invalid generation or translation
chunks once, backs off on provider rate limits, and returns no partial phrasebook. See API_DESIGN for
exact bounds and deadlines.

### `POST /phrase-breakdown`

```json
{ "language": "ja", "text": "ここで写真を撮ってもいいですか。", "translation": "May I take photos here?", "context": "Taking photos" }
```

Required language supports `zh`, `ja`, `es`, and `cs`. Exact text and English translation are each
non-blank and at most 2,000 UTF-16 code units; optional context is at most 500. Returns
`{ chunks: [{ start, end, text, gloss, role, explanation, learningItems }], usage }` with 1–32
ordered, non-overlapping exact source chunks. Every chunk has 0–32 nested
`{ surface, text, meaning, reading? }` items. Item surface/text/reading are at most 2,000 code units
and meaning is at most 500; surface must occur exactly within its chunk. Japanese and Chinese require
non-blank readings, while Spanish and Czech forbid the reading key. Source-aligned punctuation-only
chunks with no items are removed without shifting retained offsets; items on such chunks and
all-punctuation analyses are rejected. The legacy `pattern`, top-level learning items, and
`chunkIndex` are rejected. See API_DESIGN for all field bounds and normalization details.
One provider call, no automatic retry, 4,096-token ceiling, 15-second default timeout or the configured
alternate adapter's timeout. The client handles Retry and tab-scoped caching. Nested items are not
yet displayed, saved, or starred as cards; no card-persistence design is implemented by this API
promotion. API, gateway route, and web changes must deploy together.

## Shared HTTP behavior

All routes accept `POST` JSON and reject a client-supplied `llm` selector. `OPTIONS` returns `204`
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
    ├── phrasebook-title/
    │   ├── index.js
    │   ├── prompt.js
    │   └── prompt.txt
    ├── phrase-breakdown/
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

The text files under `src/context/`, `src/phrasebook-title/`, `src/phrasebook/`, and
`src/phrase-breakdown/` are the authoritative runtime prompts. Edit them in place; there is no
separate prompt-source tree or copy step.

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

For parallel worktrees, `/add_worktree` copies only the main checkout's ignored
`api/.env` when present and writes an ignored `api/.env.local` with `PORT=XYZ1`.
`npm run dev` loads the base environment file and then the local override; an
explicit process environment variable takes precedence. Credentials are never
printed or committed. Keep Google application-default credentials in their
normal machine-level location rather than copying them into worktrees.
The web app uses `XYZ0` and its Playwright preview uses `XYZ2`; see
[`web/app/README.md`](../web/app/README.md#parallel-worktrees) for both worktree skills.

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
