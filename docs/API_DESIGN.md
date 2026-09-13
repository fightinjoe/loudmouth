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
  Other configuration values are `g-flash`, `claude`, and `chatgpt`. `google` is not an alias.
  Requests must not contain `llm`; a supplied selector returns `400`. Invalid server configuration
  fails startup. Restart the local API with another backend to compare models using the same client.
- Invalid input returns `400` before a model call.
- Model failure, timeout, malformed JSON, or invalid output returns `502`.
- The service validates and limits model output; callers receive no partial model response.
- Cards follow [`docs/CARD_SCHEMA.md`](./CARD_SCHEMA.md). The service supplies `context`;
  the client assigns storage IDs and import timestamps.
- Japanese reading tokens are normalized by the service: kana and katakana are not ruby-annotated,
  and adjacent unannotated reading tokens are merged.
- The shared output ceiling is 30,000 tokens for Google. Provider adapters may lower it when required:
  Claude Haiku uses 8,192 and GPT-5.6 Luna uses 16,384. A response truncated at the effective ceiling
  follows the invalid-response `502` path.
- Provider timeout and token limits remain backend-specific. The phrasebook pipeline additionally
  bounds the complete generation, translation, and retry sequence; its gateway deadline must exceed
  that bound, not merely one model call. See the implementation limits below.

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
| `language` | yes | — | Target language; sets every card's `lang` |
| `ability` | no | `beginner` | Changes difficulty, not intent |
| `formality` | no | `polite` | Soft register anchor, not a filter |
| `audience` | no | `staff` | Intended conversation partner |

A `term` may include a parenthetical context. The service splits on the first `(`. Text before it is
the term; text after it is context. Remaining parentheses are stripped. A missing closing `)` is
accepted. An empty term, invalid enum, or term over 200 characters returns `400`.

`formality` anchors rather than filters output. The model may include a more formal neighboring register
when the audience makes it useful. `slang` is output-only and may appear only when the input formality
is `casual`.

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
form. Across the response there may be at most eight groups and at most 15 cards per group. Empty groups
are removed. There is no minimum group or card count.

The service sets `context` on the block card from the input parenthetical and on group cards from the
group title. The model does not emit `context`, `id`, or `importedAt`.

`usage` reports provider token metadata, estimated USD cost, and elapsed LLM execution time rounded to
milliseconds. `costUsd` is `null` when no rate is configured.

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

The prompt is the endpoint's primary artifact; the service is a thin wrapper around it. The
prompt's versioned history, accepted version, and per-version hand-test outputs live in
[`prompts/context/`](../prompts/context/) (each version has a `NOTES.md`); the service
serves a byte-identical copy (`api/src/context-prompt.txt`). A prompt change is made by
cutting a new version there, hand-testing it against the standard seeds, and copying the
accepted version in.

Latency is the primary metric: the endpoint targets under 10 seconds end to end. The
default backend `gemini-3.5-flash-lite` measured 1.1–1.6 seconds across the v03 baseline
seeds.

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

The prompt is language-aware: the target language is injected into the prompt so the model
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
(max 5 questions, 5 options, 8 checklist items) rather than failing, and rejects a response
with no questions or no checklist as a `502`.

Questions gather unknown **facts** about the learner or their situation — role, conversation
partner, key preferences or constraints — that change which phrases are generated:

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
structurally invalid output. Output ceiling 2,000 tokens; the shared 15-second timeout
applies as a hard backstop.

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
3. Validate the generation; retry once on invalid output.
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
content validation, and the bounded retry remain in place. Other providers retain their existing
prompt-and-validation output handling.

Generation and translation prompt copies, including Japanese and Chinese reading-rule files, must
remain byte-identical to the accepted source files. Reading rules substitute into
`{{READING_RULES}}`; Spanish and Czech substitute an empty string.

The measured accepted three-topic pipeline was approximately 2.6–3.3 seconds on
`gemini-3.5-flash-lite`; this is a baseline, not a guarantee for eight topics or alternate providers.
The normal-operation target remains under 10 seconds.

### Client migration

The creation UI and persistence flow are unchanged:
- Topic entry calls `/context` with `{ seed, language }`, not `/textbook` with `topic`.
- Question selection uses the first option as default, without a response `default` field.
- Final submission calls `/phrasebook` with flat `answers` and `checklist`, plus explicit
  `ability: "basics"`, not a nested `context` object.
- The complete returned phrasebook is committed only after successful generation.
- Clients do not choose the backend.

### Trust boundary and deferred work

All client text, including answers and selected topic labels, is untrusted. Request validation,
bounded fan-out, and strict output validation constrain structure and resource consumption; they do
**not** establish that the model ignored prompt injection. This stateless contract does not authenticate
labels as originating in an earlier `/context` response. Server-issued selection identifiers or
signed setup state require a separate API design decision.

The accepted `/context` prompt remains unchanged. Ability-aware setup, static preset phrase packs,
and removal of repair-style checklist topics are deferred. Explicit repair topics continue to work;
they must not be removed before replacement packs exist.

## Retained `/textbook` endpoint

`/textbook` remains available but is no longer used by the migrated creation client. Its first request
uses `{ topic, language }`; its second uses `{ topic, language, context: { answers, checklist } }`.
It returns explicit question defaults for setup and `{ title, groups, usage }` for generation.
Its existing prompts, validation, and card assembly remain separate from `/phrasebook`.
Like other routes, it now uses server-owned backend configuration and rejects request `llm`.

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

- the API router, CORS, method handling, and `204`/`405`/`404` behavior;
- server-owned backend configuration, the `LLM_REGISTRY`, and provider adapters;
- card validation and Japanese reading normalization;
- usage accounting and pricing;
- the card-schema reading, gender-collapse, and optional-field rules.

Expansion requests (more cards for a group, a new phrasebook section, or card decomposition) are the
next additive API surface. Their anchor, deduplication, suppression, difficulty, and `notes` shapes
must be finalized against real output before being added as a contract.

## References

- [`docs/CARD_SCHEMA.md`](./CARD_SCHEMA.md) — authoritative card and reading-token schema.
- [`docs/BRIEF.md`](./BRIEF.md) — current product scope and phases.
- [`docs/DESIGN.md`](./DESIGN.md) and [`docs/journeys.md`](./journeys.md) — client interaction flows.
