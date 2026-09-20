---
name: api-design
description: >
  Current API contract for Catchphrase. Covers /context's situation setup and /phrasebook's
  English-generation and parallel-translation pipeline. Defines requests, responses, server-owned
  model selection, operational bounds, and trust boundaries.
status: CURRENT
---

# Catchphrase API design

The API is a stateless Cloud Run service. The client owns phrasebook storage and creation state.
Guided creation calls `/context`, collects answers, then speculatively calls `/phrasebook` with all
suggested topics while the learner chooses which conversations to keep.

## Source layout

Endpoint code and accepted prompt artifacts live together:

- `api/src/context/index.js` — request handling and response validation
- `api/src/context/prompt.js` — trusted prompt construction
- `api/src/context/prompt.txt` — canonical context prompt
- `api/src/phrasebook-title/index.js` — independent title request handling and validation
- `api/src/phrasebook-title/prompt.js` — trusted naming prompt construction
- `api/src/phrasebook-title/prompt.txt` — canonical naming prompt
- `api/src/phrasebook/index.js` — request handling and pipeline orchestration
- `api/src/phrasebook/parse.js` — generated and translated output parsing
- `api/src/phrasebook/prompt.js` — trusted generation and translation prompt construction
- `api/src/phrasebook/prompt.txt` — canonical English-generation prompt
- `api/src/phrasebook/translate-prompt.txt` — canonical translation prompt
- `api/src/phrasebook/reading-rules-ja.txt` and `reading-rules-zh.txt` — language-specific reading rules
- `api/src/phrase-breakdown/index.js` — on-demand analysis validation, source alignment, and execution
- `api/src/phrase-breakdown/prompt.js` and `prompt.txt` — trusted contextual-teaching prompt

Provider adapters remain in `api/src/llms/`. Shared backend configuration, card validation, and
pricing remain in `api/src/llm-config.js`, `api/src/card-validate.js`, and `api/src/pricing.js`.
Endpoint tests remain in `api/src/test/`.

## Shared conventions

- Supported languages: `zh`, `ja`, `es`, `cs`.
- Backend selection is server-owned: `LLM_BACKEND=gemini-3.5-flash-lite` by default.
  Other configuration values are `g-flash` (Gemini 3.8 Flash), `claude` (Claude Haiku 4.5),
  and `chatgpt` (GPT-5.6 Luna). `google` is not an alias.
  Requests must not contain `llm`; a supplied selector returns `400`. Invalid server configuration
  fails startup. Restart the local API with another backend to compare models using the same client.
- Invalid input returns `400` before a model call.
- Model failure, timeout, or output still invalid after an endpoint's normalization and retry policy
  returns `502`.
- Callers receive a completed, validated response, not streamed or partially translated output.
  Endpoint-specific rules may clamp excess content or discard malformed optional content.
- Every model call separates trusted instructions from `JSON.stringify`-serialized task data.
  Gemini uses `systemInstruction`, Anthropic uses `system`, and OpenAI uses a `developer` message;
  request data is user content. This reduces instruction ambiguity, not the possibility of extraction.
- Cards follow [`docs/CARD_SCHEMA.md`](./CARD_SCHEMA.md). The service supplies `context`; the client
  assigns storage IDs and import timestamps.
- `usage` reports provider token metadata, estimated USD cost, and elapsed model execution time rounded
  to milliseconds. `costUsd` is `null` when no rate is configured.
- Japanese reading tokens are normalized by the service: kana and katakana are not ruby-annotated,
  and adjacent unannotated reading tokens are merged.
- Provider timeouts and output ceilings remain backend-specific. The phrasebook pipeline additionally
  bounds the complete generation, translation, and retry sequence; its gateway deadline must exceed
  that bound, not merely one model call. The active limits are documented per endpoint below.
- Prompt requirements are not all runtime guarantees. Validators check structure and bounds, not
  translation accuracy, intent, register, language/script correctness, or phonetic correctness.
- All routes accept `POST` and return JSON. The router allows CORS origin `*`, methods
  `POST, OPTIONS`, and header `Content-Type`. `OPTIONS` returns `204` before path dispatch;
  other non-POST methods return `405`, and an unknown POST path returns `404`.

## `/context`

### Purpose

`/context` sets up situation preparation. Given a **seed** — a situation, activity, or topic
("salsa dancing in Austin, TX", "feeling sick") — and a target language, one model call
returns clarifying questions and a checklist of conversations to prepare. The client presents
both, collects selections, and submits them to `/phrasebook`; the server retains no setup session.

The endpoint's canonical prompt is `api/src/context/prompt.txt`; trusted task construction is in
`api/src/context/prompt.js`.

Latency is the primary operational metric. The endpoint targets under 10 seconds end to end; this is
a target, not a guarantee across providers and request conditions.

### Request

```json
{
  "seed": "salsa dancing in Austin, TX",
  "language": "zh | ja | es | cs"
}
```

| Field | Required | Default | Rules |
|---|---:|---|---|
| `seed` | yes | — | Situation, activity, or topic; at most 200 characters |
| `language` | yes | — | Target language; the prompt is language-aware |
| `ability` | no | omitted | `none`, `basics`, or `conversational`; other values are ignored |

The prompt is language-aware: the target language code is supplied in the task JSON so the model
may spend a question on a register or cultural axis when the language makes one matter for
the seed (for example, hidden-ingredient strictness for vegan food in Japanese). No cultural
axis is required; most seeds get none.

### Response

```json
{
  "questions": [
    { "label": "string", "options": ["string"] }
  ],
  "checklist": [
    { "label": "string", "checked": true }
  ],
  "usage": {
    "model": "provider model string",
    "inputTokens": 0,
    "outputTokens": 0,
    "totalTokens": 0,
    "costUsd": null,
    "durationMs": 0
  }
}
```

A question carries no `default` field: **the first option is the default**, and the model orders each
option list most-likely-first. The model is asked for 2–5 questions with 2–5 options each and 5–8
checklist items; the service clamps overflow to at most five questions, five options, and eight
checklist items. The validator accepts one question or one checklist item, but each question must
have at least two non-empty string options.

Labels must be non-empty strings and `checked` must be a boolean. Strings are trimmed. All items are
validated before question or checklist overflow is discarded; malformed items, even beyond those
caps, can cause `502`.

The following are prompt requirements, not semantic validator checks. Questions gather unknown
**facts** about the learner or their situation — role, conversation partner, key preferences, or
constraints — that change which phrases are generated:

- Labels are short natural questions ("Where are you eating?"), never fragments.
- One axis per question; distinct axes get separate questions rather than one merged question.
- Options are terse, mutually exclusive, valid answers to their label — never a list of topics.
  Topic-shaped choices become separate yes/no questions.
- The model asks only what the seed genuinely needs, never asks what the seed already states, and
  never pads.

The checklist owns the **conversations to prepare**: 2–5 word titles the learner instantly recognizes,
one communicative goal each, ordered along the encounter's arc, with `checked` as the model's suggested
default. Questions must never poach this axis.

### Execution

One model call runs per request, single-turn, with JSON output (`responseMimeType: application/json`
on Google backends). The service validates the request before the call, validates and clamps the
model JSON after it, and returns `502` on model failure, timeout, or structurally invalid output.
It does not strip Markdown fences before JSON parsing and has no application-level retry.

The output ceiling is 2,000 tokens. The timeout is 15 seconds on the default backend and 60 seconds on
`g-flash`, `claude`, and `chatgpt`.

### Client behavior

The creation panel:

1. Calls `/context` with `{ seed, language, ability? }`, supplying remembered ability for that language.
2. Calls `/phrasebook-title` with `{seed}` in parallel
3. If ability is unknown, prepends the client-owned question "What is your language ability?" with
   options None, Basics, Conversational. Initializes each question to its first option. The model
   is instructed not to ask language proficiency questions. This extra question is outside the
   model's five-question cap.
4. On advancing, calls `/phrasebook` with the selected or remembered ability enum, copied flat
   `answers` excluding the ability question, and all checklist labels in order.
5. Preserves checklist defaults and allows local topic selection while generation runs.
6. On final Continue, reuses the pending or ready response and commits only selected conversations
   plus their locally pooled vocabulary.

Setup and speculative results remain client-side and ephemeral. A completed request does not save or
navigate automatically. Dismissal aborts outstanding requests and discards uncommitted results.

## `/phrasebook-title`

Independently distills a seed into an English UI title. It does not feed context or card generation.

- Request: `{ "seed": "Making small talk with other people at a dog park" }`.
- Response: `{ "title": "Dog Park Chitchat 🐕", "usage": { ... } }`, using shared usage accounting.
- `seed` is required, non-empty after trimming, and at most 200 characters before trimming,
  matching `/context`. Client-supplied `llm` is rejected.
- The prompt asks for generally 2–6 words, descriptive first, playful when appropriate, and at most
  one relevant emoji. Titles must be English even for non-English seeds. Sensitive situations get
  respectful, clear titles. These style requirements are prompt guidance, not semantic validation.
- Validation requires a non-empty, trimmed, single-line title of at most 80 characters.
- One model call uses a dedicated prompt, separate trusted instructions and JSON task data, and a
  256-token output ceiling. Timeout is 15 seconds by default or the adapter's timeout (60 seconds
  for alternate backends). There is no application-level retry or Markdown-fence stripping.
- Invalid input returns `400`; model errors, timeout, and invalid output return `502`.

The web client starts this request in parallel with `/context` and never awaits it to advance or save.
Immediately before creating the local phrasebook, it freezes the available generated title or falls
back to the original seed. Pending title work is aborted and late responses are ignored. Naming errors
remain silent. The title is stored as the local phrasebook name and is not sent to `/phrasebook`.
Answer changes and card-generation retries reuse the title; submitting a different seed replaces the
naming request, and dismissal aborts it. A failed local save also retains the frozen title on retry.

## `/phrase-breakdown`

Analyzes one existing phrase independently of phrasebook creation. Request:

```json
{
  "language": "zh",
  "text": "可以给我一杯水吗？",
  "translation": "Could I have a glass of water?",
  "context": "At the café"
}
```

`language` is required (`zh`, `ja`, `es`, `cs`). `text` and `translation` must be non-blank strings
of at most 2,000 JavaScript UTF-16 code units each. They are preserved without trimming or
normalization. Optional `context` is a string of at most 500 code units. Client `llm` is rejected.

The response is `{ chunks, usage }`:

- `chunks`: 1–32 ordered
  `{ start, end, text, gloss, role, explanation, learningItems }` entries.
- `start`/`end`: inclusive/exclusive UTF-16 offsets into the exact request text.
- `text`: the exact source substring, not a dictionary form or reading; at most 2,000 code units.
- `gloss`: required non-blank contextual English meaning, trimmed on output (at most 500 code units).
- `role`: required non-blank learner-facing grammatical/pragmatic role, trimmed on output (at most 200).
- `explanation`: required non-blank teaching text, trimmed on output (at most 1,000).
- `learningItems`: a required array of 0–32
  `{ surface, text, meaning, reading? }` entries belonging to that chunk.
- Learning-item `surface` is preserved exactly, is at most 2,000 code units, must be a contiguous
  substring of its containing chunk, must have no surrounding whitespace, and cannot be
  punctuation-only. Item `text` is a required non-blank dictionary form or reusable expression of at
  most 2,000 code units; `meaning` is a required non-blank contextual English meaning of at most 500.
  Both are trimmed on output.
- Every Japanese and Chinese learning item requires a non-blank `reading` of at most 2,000 code
  units (kana for Japanese, tone-marked pinyin for Chinese), trimmed on output. Spanish and Czech
  items must omit the `reading` key.

The model emits ordered exact chunk text rather than calculating offsets. The server first locates
every raw chunk after the preceding one, rejects overlap or reordered/non-source text, and derives
offsets. Only Unicode punctuation and whitespace may remain uncovered. Boundaries cannot split
surrogate pairs. After source alignment, punctuation-only chunks are removed if and only if their
`learningItems` array is empty; their teaching strings may be empty because they are not returned.
An item attached to a removed chunk, or a response with no meaningful chunk after removal, is
rejected. Retained offsets continue to address the original, untouched request text.

The server rejects the former top-level `pattern`, a top-level `learningItems` array, and nested
`chunkIndex`; learning-item association comes only from nesting. It validates the association and
language-dependent shape without guessing, moving, or deduplicating items. These checks enforce
alignment and structural bounds, not reading correctness or optimal semantic segmentation. The
prompt asks for meaningful chunks and a small selection of reusable words and expressions.

One server-selected provider call uses separate trusted instructions and JSON task content, a
4,096-token output ceiling, and a 15-second default deadline (60 seconds for alternate adapters).
There is no application-level retry. Invalid input returns `400`; provider failure, timeout, malformed
JSON, or invalid analysis returns `502`. Usage follows the shared accounting contract.

The web details pane keeps the source visible while loading or on failure, and offers explicit Retry.
Validated success, including nested learning items, is cached in tab-scoped sessionStorage, keyed by
schema version plus exact language, text, translation, and context. Changes to those inputs miss the
cache; no card schema or IndexedDB migration is involved. The current details UI still renders only
chunk teaching. Saving or starring learning items as cards is design work, not part of this API
promotion and remains unimplemented. Dismissal aborts the client fetch and guards against late
completion; it does not guarantee that an already-started provider call stops at the server. Deploy
the API route and gateway configuration with the web client.

## `/phrasebook`

### Purpose

Generate one short two-sided conversation for every selected topic, then translate each conversation
and its vocabulary together. The canonical generation, translation, and reading-rule prompt artifacts
are under `api/src/phrasebook/` as listed in [Source layout](#source-layout).

Latency is an operational target: normal operation aims to complete under 10 seconds, but alternate
providers, retries, and larger topic selections can take longer.

### Request

```json
{
  "seed": "ordering vegan food",
  "language": "ja",
  "ability": "basics",
  "answers": {
    "Where are you eating?": "Standard restaurant"
  },
  "checklist": [
    "State my dietary restrictions",
    "Ask about hidden ingredients"
  ]
}
```

- `seed` is required, non-empty, and at most 200 characters.
- `language` is required: `zh`, `ja`, `es`, or `cs`.
- `ability` accepts exactly `none`, `basics`, or `conversational`. Missing or invalid values
  (including wrong types, casing, or whitespace) are ignored and default to `basics`. Only the
  sanitized enum reaches the generation prompt.
- `answers` is a required question-to-answer string map; an empty map is allowed. At most five entries
  are accepted, with question labels at most 200 characters and answers at most 500 characters.
- `checklist` is a required ordered list of 1–8 selected topic strings, at most 120 characters each.
  The learner chooses the count.
- `llm` is rejected. The server's `LLM_BACKEND` selects the provider for both stages.

The service trims `seed`, answer labels and values, and checklist topics before checking string-length
limits. All must be non-empty after trimming. Answer keys that collide after trimming return `400`;
duplicate checklist topics are not rejected.

Ability controls which material is worth spending lines on, not a grammar-difficulty scale: `none`
includes first-week language, `basics` assumes it, and `conversational` concentrates on
situation-specific language.

### Response

```json
{
  "title": "ordering vegan food",
  "groups": [
    {
      "title": "State my dietary restrictions",
      "cards": [
        {
          "lang": "ja",
          "type": "phrase",
          "text": "ヴィーガンです。",
          "translation": "I'm vegan.",
          "reading": [["ヴィーガンです。", null]],
          "context": "State my dietary restrictions",
          "notes": "{\"speaker\":\"you\"}"
        }
      ],
      "vocab": []
    }
  ],
  "usage": {
    "model": "gemini-3.5-flash-lite",
    "inputTokens": 0,
    "outputTokens": 0,
    "totalTokens": 0,
    "costUsd": null,
    "durationMs": 0
  }
}
```

The example shows the envelope and card shape, not required content counts. This endpoint’s legacy `title` field comes from the
seed; it makes no naming model call. The web client uses the independent `/phrasebook-title` result
or the seed fallback for the saved name. Conversation groups follow request-topic order. Each group
contains `cards` (phrase cards) and `vocab` (fully normalized word cards for that conversation).
There is no pooled vocabulary group in the response. Each conversation card's `translation` is the
English generation line; `text` is its translated target-language line with inline ruby markup removed.

`notes` remains a JSON-encoded string, not a new object-valued card field:

- Conversation cards carry `speaker: "you" | "partner"` and `or: true` when an alternative.
  Alternatives may be interleaved with the other speaker's lines; an earlier line by the same speaker
  is required, not immediate adjacency.
- Drawn vocabulary carries `source`, an exact target-language source line. Expansion vocabulary with
  no identified source line omits it; the service does not invent example sentences.
- Matching uses English tokens and common inflections within the originating conversation, then maps
  that source index to the translated line. It does not infer synonyms or derivations.

The service sets card `context` to the originating topic title, including vocabulary provenance.
The API preserves all per-conversation vocabulary, including duplicates across groups, without a global
cap. The client first selects groups by request index, then pools their vocabulary in checklist order.
It deduplicates by the English `translation` normalized with NFKC and `toLocaleLowerCase('en-US')`,
preserving the first selected occurrence's translation and source metadata, and caps the result at
the lesser of 24 words or five times the selected-topic count. Filtering must precede deduplication
and capping so unselected conversations cannot remove selected vocabulary.

Kanji and hanzi `base[reading]` runs become `ReadingToken` pairs; stray bracket annotations are removed.
Japanese translation chunks additionally return `lineRomanizations` and `vocabRomanizations`, matched
by index to their Japanese translations. The service keeps non-empty Latin-script entries and replaces
invalid entries with WanaKana conversion of that target's kana and inline readings. Missing or
wrong-count arrays use mechanical conversion for the entire affected array, since model entries may
have shifted. Romanization problems log `phrasebook_romanization_fallback`; they do not trigger a
chunk retry or `502`. If missing kanji readings prevent Latin-script mechanical output, the card is
retained without `romanization`. Japanese translation text and count validation remain strict.

Romanization follows modified Hepburn with learner-readable word spacing: particles は/へ/を are
`wa`/`e`/`o` by grammatical function, inflected endings remain attached, and `desu` is separate. Long
vowels use macrons, including katakana ー; conventional `ei` and `ii` are retained. Small っ doubles
consonants (`matcha` before `ch`); syllabic `n` takes an apostrophe before vowels or `y` (`kin'en`,
`shin'yō`). Sentence starts and proper names are capitalized. For example, 私はビーガンです。 becomes
`Watashi wa bīgan desu.`. These rules are part of the Japanese translation prompt; linguistic accuracy
remains model-dependent, not guaranteed by schema validation.

WanaKana fallback inserts a space before each ruby-annotated run, replaces segment-final `ha` with
`wa` before whitespace, punctuation, or the end of a string, and capitalizes phrase output. For
example, `これには出汁[だし]が入[はい]っていますか` becomes `Koreniwa dashiga haitteimasuka`.
Internal `ha` is unchanged. This is a heuristic, not grammatical analysis: genuine words ending in
`ha` can also change. Other particle readings and macron conventions remain mechanical. Valid model
romanization is never rewritten. The Latin-script check does not prove correct Hepburn. Existing
client-stored cards are not rewritten; new `/phrasebook` responses use these rules.

### Execution and failure behavior

1. Validate the request before any model call.
2. Generate English conversations and per-conversation vocabulary in one call.
3. Validate exact conversation count and exact topic titles in selected-topic order, line speakers,
   non-empty text, alternative-line rules, and per-conversation counts; retry once on invalid output.
4. Translate each conversation and its vocabulary in parallel. Results are assembled **by index,
   never by title text**, regardless of completion order.
5. Validate each translated chunk's line and vocabulary counts and string values. Retry a malformed
   or count-mismatched chunk once; never return a partially translated phrasebook.
6. Normalize readings, assemble per-conversation phrase and vocabulary cards, and aggregate usage/costs.

Each logical model attempt has a 15-second budget on the default backend or the adapter's extended
60-second budget. That budget includes up to three `429` retries with 2/4/8-second backoff. Generation
and chunk validation each allow one new logical attempt after invalid output. The longest critical path
is two generation attempts plus two parallel-translation attempts: 60 seconds on the default backend
or 240 seconds with a 60-second adapter. The complete request has a 245-second hard deadline, API
Gateway allows 270 seconds, and Cloud Run allows 300 seconds.

Exhausted model or validation failures return `502`; aborted requests stop outstanding provider calls.
Generation output is capped at 6,000 tokens and each translation at 4,000 tokens, subject to provider
ceilings. Generation validates 2–10 lines and 3–6 vocabulary entries per conversation. The prompt asks
for complete exchanges without padding; greetings and farewells may take just two or three lines.
Completeness remains a prompt requirement, not a semantic validator guarantee. `durationMs` is
wall-clock pipeline time, not the sum of overlapping translation durations. Usage includes reported
token consumption from invalid responses that caused retries.

On Google backends, translation calls also supply a JSON response schema requiring `lines` and `vocab`
arrays of strings with exactly the source item counts and no additional properties. For Japanese, the
schema also requires the two corresponding romanization arrays. This constrains generation rather than
repairing malformed JSON after the fact. Strict parsing, content validation, and the bounded retry
remain in place. Surrounding Markdown JSON fences are accepted, but malformed JSON is not repaired.
Local validation does not reject every unknown property or verify linguistic or reading correctness.
Other providers ignore the schema option and retain prompt-and-validation output handling.

Reading rules are inserted into `{{READING_RULES}}`; Spanish and Czech insert an empty string.

### Client integration

- Topic entry calls `/context` with `{ seed, language, ability? }`, using remembered ability.
- Question selection uses the first option as its default, without a response `default` field.
- Advancing from questions starts one `/phrasebook` request with all checklist topics, copied flat
  `answers` excluding the client ability question, and the selected or remembered `ability`.
  Toggling topics never sends another request.
- Final Continue uses the existing pending or ready result, selects groups by index (titles may
  duplicate), and commits selected phrases and locally pooled vocabulary.
- Back without input changes reuses work. Changing an answer or seed invalidates and aborts it;
  request-identity guards ignore stale responses.
- Background failures leave the checklist usable. Final Continue surfaces the error; retry preserves
  selections and starts fresh work. Dismissal aborts context, title, and phrasebook requests.
- No automatic save or navigation occurs when speculative generation finishes. Persistence begins
  only after final Continue and successful generation; incomplete saves are rolled back. Ability is
  remembered per language only after import succeeds, never by speculative completion or deck creation.
  Historical setup preferences are not migrated. Updating remembered ability is deferred.
- Clients do not choose the backend. This response contract requires deploying API and web together.

Speculation hides generation behind checklist interaction but does not guarantee lower latency:
all-topic English generation is larger, and the response still waits for every translation, including
topics the learner eventually discards. Usage includes all generated topics. Compare final
Continue-to-usable-phrasebook time and cost per saved phrasebook when evaluating this prototype.

## Trust boundary and deferred work

The public contract remains stateless free text. Answers and selected topic labels are bounded
user-authored context, not evidence of completing `/context`. Existing request limits remain
unchanged. Server-issued selections, signed setup state, and server-side sessions are not required.

All request text and model-generated intermediate content are untrusted. Builders return
`{ instructions, input }`: server-owned teaching rules go in `instructions`; task fields go in `input`
via `JSON.stringify`. User strings are never substituted into trusted instructions. Only server-owned
language rules and examples are composed there. Translation receives source lines and vocabulary as
structured data and is instructed to translate their meaning, not obey them. Legitimate imperative
language-learning content remains supported; there is no keyword blacklist.

Prompt wording and role separation are defense in depth, not confidentiality boundaries. Treat prompts
as potentially extractable. Credentials stay in provider authentication, never model messages. The
model has no configured tools for reading server files, secrets, or other users' data. Structurally
valid output can still contain instructions or inaccurate content.

Clients must render all user, model, and persisted strings as text. Web HTML templates encode text and
quoted attributes at the sink; ruby elements are trusted markup with independently escaped base and
annotation strings. Stored data is not pre-escaped. Native text views do not interpret HTML; future web
views, rich text, links, or action integrations need their own explicit trust boundaries.

Adversarial model evals exercise extraction and instruction override, including the complete
`/context` → `/phrasebook` chain. They use synthetic test-only canaries, preserve raw responses, and
distinguish detected leakage, invalid output, and provider failures. A run with no detected leakage is
not proof of confidentiality. Deterministic tests separately cover provider message boundaries, input
rejection, and literal UI rendering, including persistence and review.

Gateway admission policy, anonymous-client quotas, global concurrency and spend controls, and app
attestation remain deferred. Verify intended gateway and backend exposure before public release; an
iOS-only launch does not make the API private. No abuse-control policy is implemented by this prompt
and rendering boundary.

Static preset phrase packs and removal of repair-style checklist topics remain deferred. Explicit repair topics continue to work; they must not be removed before replacement
packs exist.

## Shared implementation

The endpoints share:

- the API router, CORS, and method/path handling described above;
- server-owned backend configuration, the `LLM_REGISTRY`, and provider adapters;
- card-shape helpers and Japanese reading normalization, with endpoint-specific validation policies;
- usage accounting and pricing;
- the card-schema reading, gender-collapse, and optional-field rules.

## References

- [`docs/CARD_SCHEMA.md`](./CARD_SCHEMA.md) — authoritative card and reading-token schema.
- [`docs/BRIEF.md`](./BRIEF.md) — current product scope and phases.
- [`docs/DESIGN.md`](./DESIGN.md) and [`docs/journeys.md`](./journeys.md) — client interaction flows.
- [`api/README.md`](../api/README.md) — local setup, deployment, and evaluation commands.
- Runtime contract: `api/src/index.js`, `api/src/context/index.js`, `api/src/phrasebook/index.js`,
  `api/src/phrasebook/parse.js`, `api/src/llm-config.js`, and `api/src/card-validate.js`.
