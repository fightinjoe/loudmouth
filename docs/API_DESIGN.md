---
name: api-design
description: >
  Current API contract for Catchphrase. Covers /context's situation setup and /phrasebook's
  English-generation and parallel-translation pipeline, plus retained /lookup and /textbook
  endpoints. Defines requests, responses, server-owned model selection, and trust boundaries.
status: CURRENT
---

# Catchphrase API design

The API is a stateless Cloud Run service. The client owns phrasebook storage and creation state.
Guided creation calls `/context`, collects answers and selected topics, then calls `/phrasebook`.

## Shared conventions

- Supported languages: `zh`, `ja`, `es`, `cs`.
- Backend selection is server-owned: `LLM_BACKEND=gemini-3.5-flash-lite` by default.
  Other configuration values are `g-flash` (Gemini 3.8 Flash), `claude` (Claude Haiku 4.5),
  and `chatgpt` (GPT-5.6 Luna). `google` is not an alias.
  Requests must not contain `llm`; a supplied selector returns `400`. Invalid server configuration
  fails startup. Restart the local API with another backend to compare models using the same client.
- Invalid input returns `400` before a model call.
- Model failure, timeout, or output still invalid after the endpoint's normalization, repair,
  and retry policy returns `502`. These policies differ by endpoint; see below.
- Callers receive a completed, validated response, not streamed or partially translated output.
  Some endpoints clamp excess content or discard malformed optional content.
- Every model call separates trusted instructions from `JSON.stringify`-serialized task data.
  Gemini uses `systemInstruction`, Anthropic uses `system`, and OpenAI uses a `developer` message;
  request data is user content. This reduces instruction ambiguity, not the possibility of extraction.
- Cards follow [`docs/CARD_SCHEMA.md`](./CARD_SCHEMA.md). The service supplies `context`;
  the client assigns storage IDs and import timestamps.
- Japanese reading tokens are normalized by the service: kana and katakana are not ruby-annotated,
  and adjacent unannotated reading tokens are merged.
- `/lookup` and `/textbook` generation use a 30,000-token output ceiling on Google.
  Claude Haiku uses 8,192 and GPT-5.6 Luna uses 16,384. Other stages have smaller ceilings
  documented below. Truncation that leaves invalid output follows the validation-failure path.
- Provider timeout and token limits remain backend-specific. The phrasebook pipeline additionally
  bounds the complete generation, translation, and retry sequence; its gateway deadline must exceed
  that bound, not merely one model call. See the implementation limits below.
- Prompt requirements are not all runtime guarantees. Validators check structure and bounds,
  not translation accuracy, intent, register, language/script correctness, or phonetic correctness.
- All four routes accept `POST` and return JSON. The router allows CORS origin `*`, methods
  `POST, OPTIONS`, and header `Content-Type`. `OPTIONS` returns `204` before path dispatch;
  other non-POST methods return `405`, and an unknown POST path returns `404`.

## `/lookup`

### Purpose

`/lookup` translates one word or phrase and returns related conversational language. It is stateless:
continuity comes from the client passing a returned card's `definition` or `context` into a later call.

### Request

```json
{
  "term": "string",
  "language": "zh | ja | es | cs",
  "ability": "none | beginner | intermediate | advanced",
  "formality": "casual | polite | formal",
  "audience": "stranger | staff | acquaintance | family"
}
```

| Field | Required | Default | Rules |
|---|---:|---|---|
| `term` | yes | — | English word or phrase, at most 200 characters |
| `language` | yes | — | Target language supplied to the prompt; each returned card must have a supported `lang`, but equality to the requested language is not checked |
| `ability` | no | `beginner` | Changes difficulty, not intent |
| `formality` | no | `polite` | Soft register anchor, not a filter |
| `audience` | no | `staff` | Intended conversation partner |

A `term` may include a parenthetical context. The service splits on the first `(`. Text before it is
the term; text after it is context. Remaining parentheses are stripped. A missing closing `)` is
accepted. An empty term, invalid enum, or term over 200 characters returns `400`.

The prompt treats `formality` as an anchor rather than a filter and allows a more formal neighboring
register when useful for the audience. It permits output-only `slang` only for `casual` input;
the validator does not enforce this input/output relationship. Although the shared card schema
supports `vulgar`, `/lookup` strips that tag. Other values outside the shared card formality enum
fail card validation.

`ability` scales vocabulary and grammar complexity while preserving intent. `none` favors the most
common, simplest expression; `beginner` allows common words and short sentences; `intermediate`
allows compound sentences and less common vocabulary; `advanced` allows idioms and complex constructions.
Ability does not gate slang or vulgarity.

### Response

```json
{
  "blocks": [
    {
      "card": "Card",
      "groups": [
        { "title": "English heading", "cards": ["Card"] }
      ]
    }
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

A clear term produces one block. Distinct meanings produce one block per meaning, in relevance order,
with a maximum of four blocks. An ambiguous block carries `definition` on its primary card when needed.

A group is a leaf cluster of related cards. It has an English `title`, regardless of target language;
groups may mix words and phrases and are organized by situation or conversational goal, not grammatical
form. Across the response there may be at most eight groups and at most 15 cards per group.
Overflow is clamped in returned order. Empty groups and groups with malformed envelopes
(non-object, blank/missing title, or non-array cards) are dropped; missing/non-array block
`groups` becomes `[]`. Invalid retained cards fail the response. There is no minimum group
or card count, but at least one block with a valid primary card is required.

The service sets `context` on the block card from the input parenthetical and on group cards from the
group title. The model does not emit `context`, `id`, or `importedAt`.

`usage` reports provider token metadata, estimated USD cost, and elapsed LLM execution time rounded to
milliseconds. `costUsd` is `null` when no rate is configured.

Execution is one logical model call, with no application-level retry. Surrounding Markdown
JSON fences are stripped before parsing. The timeout is 15 seconds on the default backend
and 60 seconds on `g-flash`, `claude`, and `chatgpt`. Provider SDK retries may occur within
that budget. Japanese readings are normalized on cards and examples; multi-token Spanish
and Czech readings are coalesced into one space-joined, unannotated token.

### Model requirements

The shared prompt must work across all backends without backend-specific rules. It must:

1. Translate the implied intent from `term`, context, audience, and formality, rather than blindly
   translating the dictionary word.
2. Disambiguate genuinely different meanings into blocks, not into extra blocks for variety.
3. Build diverse, situation-based groups. Broad topics generally produce 3–5 groups; narrow words
   generally produce 1–3. Aim for 4–6 distinct cards per group when the topic supports it.
4. Bias toward the requested register while allowing useful formal spillover for the audience. Tag a
   card's own register only when a meaningful contrast exists.
5. Prefer common, conversational language. Reject stiff, textbook, exam-flavored, and near-duplicate
   content.
6. Return raw JSON matching the response shape, without service-owned fields.

## `/context`

### Purpose

`/context` sets up situation preparation. Given a **seed** — a situation, activity, or topic
("salsa dancing in Austin, TX", "feeling sick") — and a target language, one model call
returns clarifying questions and a checklist of conversations to prepare. The client presents
both, collects selections, and submits them to `/phrasebook`; the server retains no setup session.

The prompt is the endpoint's primary artifact; the service is a thin wrapper around it.
The accepted source and rolling version notes live in [`prompts/context/`](../prompts/context/).
The current version is **v04**; [`NOTES.md`](../prompts/context/NOTES.md) links its evaluation
artifacts and retains earlier hand-test history. The service serves a byte-identical copy
(`api/src/context-prompt.txt`). Prompt changes are versioned and hand-tested at the source,
then copied into the service.

Latency is the primary metric: the endpoint targets under 10 seconds end to end.
The recorded v04 five-seed baseline on `gemini-3.5-flash-lite` measured 1.18–2.58 seconds;
an initial directions call received a provider `429`, and an explicit rerun passed.
These are recorded observations, not a latency guarantee.

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

The prompt is language-aware: the target language code is supplied in the task JSON so the model
may spend a question on a register or cultural axis when the language makes one matter for
the seed (e.g. dashi/hidden-ingredient strictness for vegan food in Japanese). No cultural
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
  "usage": { "model": "string", "inputTokens": 0, "outputTokens": 0, "totalTokens": 0, "costUsd": null, "durationMs": 0 }
}
```

Unlike `/textbook` call 1, a question carries no `default` field: **the first option is the
default**, and the model orders each option list most-likely-first. The model is asked for
2–5 questions with 2–5 options each and 5–8 checklist items; the service clamps overflow
(max 5 questions, 5 options, 8 checklist items). The validator accepts one question or one
checklist item, but each question must have at least two non-empty string options.
Labels must be non-empty strings and `checked` must be a boolean. Strings are trimmed.
All items are validated before question/checklist overflow is discarded; malformed items,
even beyond those caps, can cause `502`.

The following are prompt requirements, not semantic validator checks. Questions gather unknown
**facts** about the learner or their situation — role, conversation partner, key preferences
or constraints — that change which phrases are generated:

- Labels are short natural questions ("Where are you eating?"), never fragments.
- One axis per question; distinct axes (e.g. kind of symptoms vs. their severity) get
  separate questions rather than one merged question.
- Options are terse, mutually exclusive, valid answers to their label — never a list of
  topics. Topic-shaped choices become separate yes/no questions.
- The model asks only what the seed genuinely needs (often 2 or 3 questions), never asks
  what the seed already states, and never pads.

The checklist owns the **conversations to prepare**: 2–5 word titles the learner instantly
recognizes, one communicative goal each, ordered along the encounter's arc, with `checked`
as the model's suggested default. Questions must never poach this axis — a question whose
options are conversational tasks or goals is a defect.

### Execution

One model call per request, single-turn, JSON output (`responseMimeType: application/json`
on Google backends). The service validates the request before the call (`400`), validates
and clamps the model JSON after it, and returns `502` on model failure, timeout, or
structurally invalid output. Unlike `/lookup`, it does not strip Markdown fences before JSON
parsing. There is no application-level retry. The output ceiling is 2,000 tokens; the timeout
is 15 seconds on the default backend and 60 seconds on `g-flash`, `claude`, and `chatgpt`.

## `/phrasebook`

### Purpose

Generate one short two-sided conversation for every selected topic, then translate each conversation
and its vocabulary together. The accepted prompts are in `prompts/phrasebook/`; this endpoint
implements them without reopening prompt development.

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
- `ability` is required: `none`, `basics`, or `conversational`. **There is no API default.**
  The client explicitly sends the literal `basics` until an ability UI is introduced.
- `answers` is a required question-to-answer string map; an empty map is allowed. At most five
  entries, with question labels at most 200 characters and answers at most 500 characters.
- `checklist` is a required ordered list of 1–8 selected topic strings, at most 120 characters each.
  The learner chooses the count; three topics are only the prompt-development fixture size.
- `llm` is rejected. The server's `LLM_BACKEND` selects the provider for both stages.

The service trims `seed`, answer labels/values, and checklist topics before checking their
string-length limits. All must be non-empty after trimming. Answer keys that collide after
trimming return `400`; duplicate checklist topics are not rejected.

Ability controls which material is worth spending lines on, not a grammar-difficulty scale:
`none` includes first-week language, `basics` assumes it, and `conversational` concentrates on
situation-specific language. The `/lookup` ability vocabulary is separate and unchanged.

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
      ]
    },
    { "title": "vocab", "cards": [] }
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

The example shows the envelope and card shape, not required content counts.
The title comes from the seed; no extra naming model call is made. Conversation groups follow
selected-topic order. The final `vocab` group pools vocabulary from those conversations.
Each conversation card's `translation` is the English generation line; `text` is its translated
target-language line with inline ruby markup removed.

`notes` remains a JSON-encoded string, not a new object-valued card field:
- Conversation cards carry `speaker: "you" | "partner"` and `or: true` when an alternative.
  Alternatives may be interleaved with the other speaker's lines; an earlier line by the
  same speaker is required, not immediate adjacency.
- Drawn vocabulary carries `source`, an exact target-language source line. Expansion vocabulary
  with no identified source line omits it; the service does not invent example sentences.
  Matching uses English tokens and common inflections within the originating conversation, then
  maps that source index to the translated line. It does not infer synonyms or derivations.

The service sets card `context` to the originating topic title, including vocabulary provenance.
Vocabulary is deduplicated case-insensitively by English word, preserving the first occurrence and
its translation, capped at the lesser of 24 words or five times the selected-topic count.
Kanji/hanzi `base[reading]` runs become `ReadingToken` pairs; stray bracket annotations are removed.
Japanese translation chunks additionally return `lineRomanizations` and `vocabRomanizations`,
matched by index to their Japanese translations. The service keeps non-empty Latin-script
entries and replaces invalid entries with WanaKana conversion of that target's kana and
inline readings. Missing or wrong-count arrays use mechanical conversion for the entire
affected array, since model entries may have shifted. Romanization problems log
`phrasebook_romanization_fallback`; they do not trigger a chunk retry or `502`.
If missing kanji readings prevent Latin-script mechanical output, the card is retained
without `romanization`. Japanese translation text/count validation remains strict.

Romanization follows modified Hepburn with learner-readable word spacing: particles は/へ/を
are `wa`/`e`/`o` by grammatical function, inflected endings remain attached, and `desu` is
separate. Long vowels use macrons (including katakana ー); conventional `ei` and `ii` are
retained. Small っ doubles consonants (`matcha` before `ch`); syllabic `n` takes an apostrophe
before vowels or `y` (`kin'en`, `shin'yō`). Sentence starts and proper names are capitalized.
For example, 私はビーガンです。 becomes `Watashi wa bīgan desu.`. Rules live in the Japanese
translation prompt; linguistic accuracy remains model-dependent, not guaranteed by schema validation.
WanaKana fallback inserts a space before each ruby-annotated run, replaces segment-final `ha`
with `wa` (before whitespace, punctuation, or end of string), and capitalizes phrase output.
For example, `これには出汁[だし]が入[はい]っていますか` becomes
`Koreniwa dashiga haitteimasuka`. Internal `ha` is unchanged. This is a heuristic, not
grammatical analysis: genuine words ending in `ha` can also change. Other particle readings
and macron conventions remain mechanical. Valid model romanization is never rewritten.
The Latin-script check does not prove correct Hepburn.
Existing client-stored cards are not rewritten; new `/phrasebook` responses use these rules.

### Execution and failure behavior

1. Validate the request before any model call.
2. Generate English conversations and per-conversation vocabulary in one call.
3. Validate exact conversation count and exact topic titles in selected-topic order, line speakers,
   non-empty text, alternative-line rules, and per-conversation counts; retry once on invalid output.
4. Translate each conversation and its vocabulary in parallel. Results are assembled **by index,
   never by title text**, regardless of completion order.
5. Validate each translated chunk's line and vocabulary counts and string values. Retry a malformed
   or count-mismatched chunk once; never return a partially translated phrasebook.
6. Normalize readings, assemble cards, pool vocabulary, and aggregate provider usage and costs.

Each logical model attempt has a 15-second budget on the default backend or the adapter's extended
60-second budget. That budget includes up to three 429 retries with 2/4/8-second backoff.
Generation and chunk validation each allow one new logical attempt after invalid output.
The longest critical path is two generation attempts plus two parallel-translation attempts:
60 seconds on the default backend or 240 seconds with a 60-second adapter. The complete request
has a 245-second hard deadline, API Gateway allows 270 seconds, and Cloud Run allows 300 seconds.
Exhausted model/validation failures return `502`; aborted requests stop outstanding provider calls.
Generation output is capped at 6,000 tokens and each translation at 4,000 tokens, subject to
provider ceilings. Generation validates 4–10 lines and 3–6 vocabulary entries per conversation.
`durationMs` is wall-clock pipeline time, not the sum of overlapping translation durations.
Usage includes reported token consumption from invalid responses that caused retries.

On Google backends, translation calls also supply a JSON response schema requiring `lines` and
`vocab` arrays of strings with exactly the source item counts and no additional properties.
For Japanese, the schema also requires the two corresponding romanization arrays.
This constrains generation rather than repairing malformed JSON after the fact. Strict parsing,
content validation, and the bounded retry remain in place. Surrounding Markdown JSON fences
are accepted, but malformed JSON is not repaired. Local validation does not reject every unknown
property or verify linguistic/reading correctness. Other providers ignore the schema option
and retain prompt-and-validation output handling.

Generation and translation prompt copies, including Japanese and Chinese reading-rule files, must
remain byte-identical to the accepted source files. Reading rules substitute into
`{{READING_RULES}}`; Spanish and Czech substitute an empty string.

The older v09 three-topic pipeline measured approximately 2.6–3.3 seconds end to end.
The current **v10 generation / v06 translation** baseline records generation and slowest-chunk
translation timings separately, not a measured end-to-end pipeline duration; see
[`prompts/phrasebook/NOTES.md`](../prompts/phrasebook/NOTES.md). A recorded HTTP smoke for
the Japanese password-related seed measured 3.64 seconds for `/phrasebook`
([context notes](../prompts/context/NOTES.md)). These observations are not guarantees for
eight topics or alternate providers. The normal-operation target remains under 10 seconds.

### Client migration

The creation UI and persistence flow are unchanged:
- Topic entry calls `/context` with `{ seed, language }`, not `/textbook` with `topic`.
- Question selection uses the first option as default, without a response `default` field.
- Final submission calls `/phrasebook` with flat `answers` and `checklist`, plus explicit
  `ability: "basics"`, not a nested `context` object.
- The complete returned phrasebook is committed only after successful generation.
- Clients do not choose the backend.

### Trust boundary and deferred work

The public contract remains stateless free text. Answers and selected topic labels are bounded
user-authored context, not evidence of completing `/context`. Existing request limits remain unchanged.
Server-issued selections, signed setup state, and server-side sessions are not required.

All request text and model-generated intermediate content are untrusted. Builders return
`{ instructions, input }`: server-owned teaching rules go in `instructions`; task fields go in
`input` via `JSON.stringify`. User strings are never substituted into trusted instructions. Only
server-owned language rules/examples are composed there. Translation receives source lines and
vocabulary as structured data and is instructed to translate their meaning, not obey them.
Legitimate imperative language-learning content remains supported; there is no keyword blacklist.

Prompt wording and role separation are defense in depth, not confidentiality boundaries. Treat
prompts as potentially extractable. Credentials stay in provider authentication, never model
messages. The model has no configured tools for reading server files, secrets, or other users' data.
Structurally valid output can still contain instructions or inaccurate content.

Clients must render all user/model/persisted strings as text. Web HTML templates encode text and
quoted attributes at the sink; ruby elements are trusted markup with independently escaped base
and annotation strings. Stored data is not pre-escaped. Native text views do not interpret HTML;
future web views, rich text, links, or action integrations need their own explicit trust boundaries.

Adversarial model evals exercise extraction and instruction override, including the full
`/context` → `/phrasebook` chain. They use synthetic test-only canaries, preserve raw responses,
and distinguish detected leakage, invalid output, and provider failures. A run with no detected
leakage is not proof of confidentiality. Deterministic tests separately cover provider message
boundaries, input rejection, and literal UI rendering, including persistence and review.

Gateway admission policy, anonymous-client quotas, global concurrency/spend controls, and app
attestation remain deferred. Verify intended gateway/backend exposure before public release;
an iOS-only launch does not make the API private. No abuse-control policy is implemented by this
prompt/rendering change.

Ability-aware setup, static preset phrase packs, and removal of repair-style checklist topics
remain deferred. Explicit repair topics continue to work; they must not be removed before
replacement packs exist.

## Retained `/textbook` endpoint

`/textbook` remains available but is no longer used by the migrated creation client.
Both modes require a non-empty `topic` of at most 200 characters and a supported `language`.
Like other routes, it uses server-owned backend configuration and rejects request `llm`.

- **Setup:** `{ topic, language }`, with no `context`, returns `{ questions, checklist, usage }`.
  Each question has an explicit `default` that must match one of its options. Questions are
  capped at six and checklist items at seven; both input arrays must be non-empty.
  Checklist `checked` is normalized to `true` only for literal `true`.
  The output ceiling is 4,000 tokens, with no application-level retry.
- **Generation:** `{ topic, language, context: { answers, checklist } }` is the conventional
  request. Any non-null, non-array `context` object selects generation, including `{}`;
  nested `answers` and `checklist` are not request-validated. It returns `{ groups, usage }`
  with an optional model-generated `title`, trimmed and capped at 60 characters. Missing,
  blank, or wrong-typed titles are omitted, not replaced by the server.
  Groups are capped at eight and cards at 15 per group; malformed group envelopes and empty
  groups are dropped. Card `context` comes from the group title. Malformed card-level
  readings are dropped while retaining the card; non-empty object-valued `notes` are
  serialized to JSON strings before card validation.

Both modes strip Markdown fences and attempt missing-comma repair between adjacent array/object
elements if JSON parsing fails. Generation additionally retries once on output-validation failure,
but not on timeout or provider error. Each model attempt has a 15-second timeout on the default
backend or 60 seconds on alternate backends. Generation uses the shared provider output ceilings.
Unlike `/phrasebook`, generation `usage` and `durationMs` describe only the successful attempt,
not an earlier invalid response. These legacy prompts, validators, and card assembly remain
separate from `/phrasebook`.

`/lookup` remains the supporting translation endpoint. Retirement of these endpoints and the
historical fan-out design is not part of this client migration.

## Service flow

Every endpoint follows `service → model → service`.

```text
request
  │
  ├─ parse and validate service-side
  │
  ├─ model call
  │    /lookup: translate, disambiguate, and group
  │    /context: questions and checklist for a seed
  │    /textbook call 1: questions and checklist
  │    /textbook call 2: legacy phrasebook sections and dialogue
  │    /phrasebook: English generation → parallel conversation translations
  │
  └─ validate, normalize, cap, set service-owned fields, attach usage
       → response
```

The service rejects invalid input before model calls. Each endpoint validates its output according
to its own contract; phrasebook conversation coverage is never silently clamped away. Cards are
normalized, assigned service-owned context, and returned with usage metadata.

## Shared implementation

The endpoints share:

- the API router, CORS, and method/path handling described above;
- server-owned backend configuration, the `LLM_REGISTRY`, and provider adapters;
- card-shape helpers and Japanese reading normalization, with endpoint-specific validation policies;
- usage accounting and pricing;
- the card-schema reading, gender-collapse, and optional-field rules.

Expansion requests (more cards for a group, a new phrasebook section, or card decomposition) are the
next additive API surface. Their anchor, deduplication, suppression, difficulty, and `notes` shapes
must be finalized against real output before being added as a contract.

## References

- [`docs/CARD_SCHEMA.md`](./CARD_SCHEMA.md) — authoritative card and reading-token schema.
- [`docs/BRIEF.md`](./BRIEF.md) — current product scope and phases.
- [`docs/DESIGN.md`](./DESIGN.md) and [`docs/journeys.md`](./journeys.md) — client interaction flows.
- [`api/README.md`](../api/README.md) — local setup, deployment, and evaluation commands.
- Runtime contract: [`index.js`](../api/src/index.js), [`llm-config.js`](../api/src/llm-config.js),
  [`lookup-validate.js`](../api/src/lookup-validate.js), [`context.js`](../api/src/context.js),
  [`phrasebook-parse.js`](../api/src/phrasebook-parse.js), [`phrasebook.js`](../api/src/phrasebook.js),
  and [`textbook-validate.js`](../api/src/textbook-validate.js).
