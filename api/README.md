# Catchphrase API

Stateless Node.js Cloud Run service for guided phrasebook creation and on-demand phrase analysis.
Creation uses **`/context` → `/phrasebook`**, with independent naming via **`/phrasebook-title`**
and nonblocking watercolor covers via **`/phrasebook-image`**. Existing phrases use **`/phrase-breakdown`**.

The 2026-10-01 v3 promotion is **production code only; not deployed**. Known translation defects
remain accepted risk and separate improvement work. Deploy API, gateway, and web together.

[`docs/API_DESIGN.md`](../docs/API_DESIGN.md) is the endpoint contract; see
[`docs/CARD_SCHEMA.md`](../docs/CARD_SCHEMA.md) for cards and reading tokens.

## Endpoints

### `POST /context`

```json
{ "seed": "ordering vegan food", "language": "ja" }
```

`seed` is required, trimmed, and limited to 200 characters. `language` must be one of `zh`, `ja`,
`es`, `cs`, or `uk` (Ukrainian). Optional `ability` accepts `none`, `basics`, or `conversational`; invalid
values are ignored. The prompt uses known ability and leaves proficiency questions to the client.

Returns `{ questions, checklist, imagePrompt, usage }`. Questions have `label` and `options`;
web requires an explicit answer, without preselection. Checklist entries have `label` and `checked`.
The required English `imagePrompt` is trimmed and 1–2,000 characters. No server session is created.

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

Returns `{schemaVersion:3,title,groups,flags,usage}`. Each group contains:

```ts
{
  id: string; title: string;
  essentials: {id:string; card:Phrase}[]; // 1–8, no speaker metadata
  vocab: Candidate[];                  // 0–10 dictionary Words with POS/senseKey
  dialogue: {id:string; card:Phrase; speaker:'you'|'partner'; alternative?:true}[]; // 2–10
}
```

Essentials are independent phrases, not selected dialogue excerpts. Dialogue requires both speakers;
code derives alternatives from adjacent same-speaker lines. Old phrases/featured IDs/scores are gone.
Omitted vocabulary evidence is valid without a flag. Present unresolved source hints receive
`vocab-source-missing` / `unresolved`; exact section-aware Evidence is attached when resolvable.

Generation uses one English call per topic with at most four concurrent jobs. After all English is
complete, one translation per complete topic runs in parallel. Both stages use 6,000-token ceilings.
Assembly preserves request index order, including duplicate titles. Independent valid excess lists
are clamped to eight essentials/ten words only after every item is validated; dialogue is not truncated.
Existing validation retry, rate-limit backoff, cancellation, and 245-second overall bounds remain.
There is no partial response or automatic fallback backend.

The client validates every topic before selection, then atomically commits selected original indexes.
There is no word pooling or global cap: each topic retains Word placements, while canonical identity
shares membership stars and unique Review entries. Server draft UUIDs are remapped at commit.

### `POST /phrasebook-image`

Exact request: `{prompt, output_format:"png"}`, with a 1–2,000-character
trimmed prompt. Returns `{image:{dataUrl,mediaType:"image/png",width,height},usage:{model,costUsd,durationMs,stages}}`.
The server makes one OpenRouter image call to `black-forest-labs/flux.2-klein-4b`, pinned to
Black Forest Labs, with 16:9 aspect ratio and PNG output. The context prompt requests a close-up
composition on plain white paper: large objects fill the frame with a narrow 3–5% target margin,
without clipping. Actual margins vary; no automatic crop is applied. Transparency is neither
requested nor required. Only decoded inline PNG output with visible pixels, ≤6 MiB, ≤4 MP,
and 16:9 ±0.03 is accepted.
No background-removal service, remote output URLs, redirects, automatic retries,
or client-selected models. The operation has a 120-second deadline; disconnect aborts work.
Usage contains one OpenRouter stage; reported cost is used for both stage and aggregate cost,
or null when unavailable. All durations are integer milliseconds.
Requires only server-side `OPENROUTER_API_KEY`; no separate image-provider account or key.
An authenticated local HTTP smoke using a generated context image prompt returned an opaque
1824×1024 PNG in 4.4 seconds at a reported $0.015. This is one observation, not a latency guarantee.
The route logs `usage` on success and `request_invalid`/`request_failed` on rejection, each with
`route: 'phrasebook-image'` and a failure level. Usage logs contain cost, model, and duration,
not image bytes or credentials.

### `POST /phrase-breakdown`

```json
{
  "schemaVersion": 2,
  "source": {
    "snapshot": {
      "lang": "ja", "text": "肉も魚も食べません。",
      "translation": "I don't eat meat or fish."
    }
  },
  "context": { "groupTitle": "Dietary restrictions", "speaker": "you" }
}
```

Snapshot lang supports `zh`, `ja`, `es`, `cs`, `uk`; exact text/translation are nonblank and ≤2,000 UTF-16
units. Source may include aligned reading tokens, romanization and advisory card/occurrence refs.
Optional context contains active-book generation `{seed,ability,answers}`, groupTitle and speaker.
The model receives snapshot/context, never IDs. Old flat requests are rejected.

Returns `{schemaVersion:2,chunks,flags,usage}`. Each meaningful chunk contains
`{start,end,text,gloss,role,explanation,words:Candidate[],target}` with Word candidates and exactly one
`{kind:'word',index}` or `{kind:'chunk',card:Chunk}` target. There are 1–32 ordered source-aligned
chunks and 0–32 Words per chunk. Word sources retain exact request snapshots and selected spans;
dictionary readings align to their own headwords, never inflected source forms. Japanese/Chinese
generated Words require readings. Spanish/Czech/Ukrainian generated Words omit readings; model-supplied
`reading` fields (including `null`) are discarded. Every meaningful source character is covered;
bounds cannot split surrogate pairs. Explicit equivalence collapses `caluroso` to one Word target but retains independent
Chunk/Word targets for `食べません`/`食べる`. See API_DESIGN for model fields, offsets and all limits.
Ukrainian targets retain native Cyrillic, without forced romanization or ruby readings. Ukrainian
support does not change schema version 2; deploy the API, gateway, shared schema, and web together.

Word source evidence is optional: a dictionary form such as `眠い` need not occur literally in an
inflected source such as `眠くなってきたのかも`. Missing or unresolved surface/occurrence hints retain
the valid Word without `sources` and add
`{code:'word-source-missing',chunkIndex,wordIndex,reason:'omitted'|'unresolved'}` to `flags`.
Indices refer to returned chunks and Words; `flags` is empty when none are missing evidence.
Required card content, chunk coverage, present evidence, and explicit Word/Chunk equivalence remain
strict. No retry or extra provider call is made for a missing source.

One provider call, no automatic retry, 4,096-token ceiling and 15-second default timeout (alternate
adapter timeout otherwise). Invalid requests return 400; invalid model output returns 502. Web
caches validated content but resolves stars from the active phrasebook membership. Opening analysis
does not persist it; explicit starring does. Regeneration never overwrites saved teaching.

## Shared HTTP behavior

All routes accept `POST` JSON and reject a client-supplied `llm` selector. `OPTIONS` returns `204`
with CORS headers, unsupported methods return `405`, and unknown paths return `404`.

- `400`: invalid request, missing required field, invalid enum, or client backend selection.
- `502`: provider failure, deadline, or output still invalid after the endpoint's applicable retries.

Structured API diagnostics include `failureLevel`: **0 none**, **1 non-fatal** (usable result with
degraded enrichment or recovery), **2 fatal to the requested operation** (controlled HTTP error,
not a service crash). Successful usage events record 0/1; rejection/failure events record 2.
Unresolved source hints, romanization fallback, and declared independent-list clamping
do not turn usable content into `502`. Failure levels are logged, not added to response envelopes.
See [Runtime failure levels](../docs/API_DESIGN.md#runtime-failure-levels).

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
    ├── llms/
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

Historical Romp suite snapshots that import former production v2 validators must be replayed against
their recorded dependency revision. They are retained evidence, not live v3 compatibility adapters.
The code-only cutover's raw prompt regressions, five native API scenarios, budget ledger references,
and browser evidence are under `.prompt-romp/product-cutover-2026-10-01/`.

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
