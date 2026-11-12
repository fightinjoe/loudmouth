# To-do

Work that is decided but not done, outside prompt wording. Prompt changes and their evaluation live
in [`evals/`](../evals/README.md); the rubric is [`evals/RUBRIC.md`](../evals/RUBRIC.md).

Each item states what, why (with dated evidence), and when it is done. The evaluation runs behind the
evidence were local and have been deleted, so the relevant observations are summarized here.

## 1. API work outside prompts

### Enforce valid JSON for English generation

- **What:** stop invalid JSON from DeepSeek English generation. First check whether the provider path
  can enforce the output schema (OpenRouter `response_format` with a JSON schema on the pinned
  provider). If not, evaluate our own fix, such as a targeted retry or a narrow, logged repair.
- **Why:** 2026-11-11 interleaved prompt tests produced two invalid replies, both a one-item `text`
  array closed with the wrong bracket (`["About five stops.")`). DeepSeek has no provider-enforced
  schema today (`docs/api/phrasebook.md`, `english.call`). Until fixed, evaluations report invalid JSON
  and its likely cause but do not count it as a prompt regression (user decision 2026-11-12).
- **Done when:** invalid JSON cannot reach `english.validate`, or is recovered within the existing
  retry budget, verified on a live sample.

### Treat small count overruns as warnings in the English parser

- **What:** align `validateGenerationResponse` with the evaluation policy: modest overruns (for example
  five exchange turns where four are allowed) should be trimmed with a warning (failure level 1), not
  rejected. Keep rejecting gross overruns (an order of magnitude over the limit) and wrong types.
- **Why:** the parser rejects a five-turn exchange outright (2026-11-02: three surfing topics;
  2026-11-11: two candidate replies), spending the validation retry. User decision 2026-11-12: extra
  turns or words are a warning; failure only when output is about 10× the limit.
- **Done when:** parser and `docs/api/phrasebook.md` document the trimming rule; tests cover a small
  overrun (trimmed, level 1) and a gross overrun (rejected).

### Placeholder support for proper nouns

- **What:** design a placeholder token for names the learner supplies (a specific landmark, street,
  person). Needs a syntax distinct from reading brackets, translation passthrough, a code check that
  translated phrases keep the same tokens, reading/romanization passthrough, and client rendering.
- **Why:** user wants placeholders for proper nouns (2026-11-11). Today card assembly removes any
  `[...]` text in every language (`stripStrayBrackets` in `api/src/reading.js`), so a translated
  "Where is [a landmark]?" would lose the placeholder silently. The production prompt already produced
  one unprompted ("I'm [name], [partner]'s partner.", 2026-11-12). Until then, evaluations neither
  avoid nor penalize placeholders.
- **Done when:** a token survives English generation, translation and card assembly end to end, and
  the English prompt allows it only for learner-supplied proper nouns, with negative-control topics
  showing no overuse.

### Make English-generation latency meet the target

- **What:** keep English generation per topic under 10 s (3 s ideal, 6 s acceptable). Options: a
  faster or ordered list of providers for DeepSeek v4.1 Flash, a per-call timeout aligned with the
  target, and the 429 handling below.
- **Why:** on 2026-11-02 Relace took 2.2–4.0 s per topic; on 2026-11-11 it took up to 39.4 s. Time to
  first token stayed normal; output speed fell from 195–294 to as low as 18 tokens/s. A same-window
  probe of the production prompt (3 calls each, all valid) took: Relace 6.6–8.5 s, Morph 4.3–6.4 s,
  Fireworks 3.6–5.9 s, Together 1.3–4.1 s, Google Vertex 4.0–7.5 s. Providers serve different
  quantizations, so content quality must be checked before switching. Production pins Relace with no
  fallback and a 120 s timeout (`api/src/llms/openrouter.js`).
- **Done when:** repeated probes at different times of day justify a provider policy, its output
  quality is spot-checked against the rubric, and production meets the target under realistic load.

### Operationalize reliable DeepSeek capacity

- **What:** evaluate dedicated or provider-owned capacity and quotas rather than assuming an OpenRouter
  shared pool can sustain production traffic. Load-test increasing QPS and concurrent users with
  realistic per-topic fan-out plus translation; measure completed-chapter p50/p95/p99, throughput,
  429s, failure levels 0/1/2, token load and cost. Bound concurrency across requests, not only per
  book.
- **Why:** four concurrent 429s reported Relace `upstream_provider_shared_pool`; they do not establish a
  four-request concurrency limit or prove that our fan-out caused the rejection. On 2026-11-12 the
  first six of 24 serial evaluation calls also returned 429.
- **Mid-term candidate:** standardize English generation on DeepSeek and fall back to Gemini Flash Lite
  after a confirmed 429. Define bounded retry/fallback and total deadlines, preserve healthy topic
  results and order, validate the same output contract, and record actual backend, fallback reason,
  quality, latency and mixed-model cost. Verify fallback compatibility and quality; avoid retry storms
  or fallback for unrelated validation errors. Note: Gemini 3.5 Flash Lite rejects disabled reasoning
  (2026-11-11) and needs minimal reasoning effort set explicitly.
- **Done when:** a load test meets agreed latency and error targets.

### Developer diagnostics mode

- **What:** an app developer mode that displays API response diagnostics, including
  `vocab-source-missing` flags for generated vocabulary without resolved phrase evidence. Not shown in
  the normal learner experience.

### Move deterministic shaping out of the translation prompt

- **What:** evaluate removing formatting, normalization and stripping instructions from the phrasebook
  translation prompt and moving deterministic transformations into endpoint code. Obtain approval
  before editing prompt `*.txt` files, then run before-and-after regression evaluations for output
  behavior, latency and token usage.

## 2. Production: test, fix, deploy

### Deploy the revised English-generation prompt

- **What:** release `api/src/phrasebook/prompt.txt` as adopted on 2026-11-12 (prompt "candidate 4":
  no generic language in Things to say or Words, single-option exchange openers, no English fallback,
  no contractions instruction).
- **Evidence:** interleaved comparison with the previous prompt on 8 paired topics (walking, transit,
  surfing, dinner): equal or better rubric scores on every topic; generic Things to say 7 → 2; opener
  alternatives 11/21 → 0/26; about 200 more input tokens per call (+12%), similar output length,
  $0.00002 more per call, same latency.
- **Known follow-up:** thanks addressed to hosts ("Thank you for inviting me to your home.") still
  appears in Things to say; the rubric counts it as generic (user decision 2026-11-12). Address in a
  future prompt iteration with an evaluation.
- **Done when:** deployed, and a post-deploy spot check of live `/phrasebook` output confirms the
  behavior above.

### Coordinated API and web release

- **What:** the v4 phrasebook API and web milestone requires a coordinated release; deployment has not
  been performed (`evals/README.md`). Native iOS is unchanged.
- **Done when:** both are deployed together and a live end-to-end phrasebook creation succeeds.

### Verify latency and JSON fixes in production

- **What:** after the latency and JSON items above ship, confirm in production: per-topic English
  generation under 10 s, invalid-JSON rate, retry and failure levels.
- **Done when:** measured on live traffic or an agreed production smoke test.
