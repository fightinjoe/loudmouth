---
name: api-design
description: >
  Current API contract for Catchphrase. Covers /lookup's stateless translation primitive and
  /textbook's guided phrasebook generation: requests, responses, model behavior, and service flow.
status: CURRENT
---

# Catchphrase API design

The API is a stateless Cloud Run service. It accepts a request, makes one or two model calls, validates
the result, and returns a self-contained response. The client owns phrasebook storage and history.

## Shared conventions

- Supported languages: `zh`, `ja`, `es`, `cs`.
- Supported LLM backends: `google`, `claude`, `chatgpt`; default `google`.
- Invalid input returns `400` before a model call.
- Model failure, timeout, malformed JSON, or invalid output returns `502`.
- The service validates and limits model output; callers receive no partial model response.
- Cards follow [`docs/CARD_SCHEMA.md`](./CARD_SCHEMA.md). The service supplies `context`, `id`, and
  `importedAt` where the relevant client flow requires them.
- Japanese reading tokens are normalized by the service: kana and katakana are not ruby-annotated,
  and adjacent unannotated reading tokens are merged.
- The shared output ceiling is 30,000 tokens for Google. Provider adapters may lower it when required:
  Claude Haiku uses 8,192 and GPT-5.6 Luna uses 16,384. A response truncated at the effective ceiling
  follows the invalid-response `502` path.
- Google and Claude target p50 latency below 4 seconds with a 15-second request timeout. GPT-5.6 Luna
  uses a 60-second timeout because large JSON responses can exceed the shared budget.

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
  "audience": "stranger | staff | acquaintance | family",
  "llm": "google | claude | chatgpt"
}
```

| Field | Required | Default | Rules |
|---|---:|---|---|
| `term` | yes | — | English word or phrase, at most 200 characters |
| `language` | yes | — | Target language; sets every card's `lang` |
| `ability` | no | `beginner` | Changes difficulty, not intent |
| `formality` | no | `polite` | Soft register anchor, not a filter |
| `audience` | no | `staff` | Intended conversation partner |
| `llm` | no | `google` | Model backend |

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
    "costUsd": null
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

`usage` reports provider token metadata and estimated USD cost. `costUsd` is `null` when no rate is
configured.

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

## `/textbook`

### Purpose

`/textbook` prepares a learner for a topic or situation by guiding them through context selection and
then generating a complete phrasebook. It uses the same route for two calls; the presence of `context`
selects the call mode.

Initial generation is situation-first and level-independent. It does not expose `ability`, `formality`,
or `audience` settings. Difficulty and explanation depth are handled by later, scoped client actions.

### Request

Call 1 omits `context`:

```json
{
  "topic": "dinner with my partner's parents",
  "language": "zh | ja | es | cs",
  "llm": "google | claude | chatgpt"
}
```

Call 2 includes the opaque state returned by call 1 plus the learner's selections:

```json
{
  "topic": "dinner with my partner's parents",
  "language": "zh | ja | es | cs",
  "context": {
    "answers": { "Relationship": "Partner's parents" },
    "checklist": ["Introduce myself", "Discuss food"]
  },
  "llm": "google | claude | chatgpt"
}
```

| Field | Required | Default | Rules |
|---|---:|---|---|
| `topic` | yes | — | Topic, situation, or activity; at most 200 characters |
| `language` | yes | — | Target language |
| `context` | call 2 | absent | JSON object; presence selects call 2 |
| `llm` | no | `google` | Model backend |

`context` is opaque state from call 1. The service validates only that it is an object, not an array or
string. Its internal keys are not prescribed beyond the conceptual `answers` and `checklist` shape.
Malformed context returns `400`.

### Call 1 response

```json
{
  "questions": [
    { "label": "string", "options": ["string"], "default": "string" }
  ],
  "checklist": [
    { "label": "string", "checked": true }
  ],
  "usage": { "model": "string", "inputTokens": 0, "outputTokens": 0, "totalTokens": 0, "costUsd": null }
}
```

Questions are dynamically authored for the topic, not a fixed demographic form. Options are short,
mutually exclusive, and meaningful to generation. `default` must be one of `options`. Maximum six
questions.

Checklist items are concrete communicative goals in the situation's arc. `checked` is the model's
suggested default. A checked item means the learner wants the goal covered; it is not a required group
title. Maximum eight items.

### Call 2 response

```json
{
  "title": "Annual Physical Visit",
  "groups": [
    {
      "title": "English section heading",
      "cards": ["Card"]
    }
  ],
  "usage": { "model": "string", "inputTokens": 0, "outputTokens": 0, "totalTokens": 0, "costUsd": null }
}
```

`title` is a concise phrasebook name, preferably 2–4 Title Case words, clamped to 60 characters.
A missing or blank title is not an error; the client falls back to the raw topic.

Groups follow the encounter's arc rather than mirroring checklist labels. Generation may merge, split,
rename, reorder, or add connective groups. The final group is `Example conversation`, containing a short,
two-sided exchange built only from language introduced in earlier groups. Turns alternate, advance the
conversation, and carry speaker metadata in `notes` as `{"speaker":"you"}` or
`{"speaker":"partner"}`. This is intentionally staged in `notes`, not a new schema field.

There are at most eight groups total, including the example conversation, and at most 15 cards per
group. The model does not emit `context`, `id`, or `importedAt`; the service sets each card's `context`
to its group's title. Every card follows `CARD_SCHEMA.md`; `/textbook` includes `type` (`word` or
`phrase`) so the client can distinguish vocabulary from phrase content.

### Model requirements

Call 1 must infer only the context axes that materially change the generated chapter. It must avoid
padding questions and default-check the goals that carry the core interaction.

Call 2 must:

- teach language the learner will say, hear, point at, or choose between in the situation;
- include both sides of the exchange, including likely replies;
- include situation-specific vocabulary as compact word cards plus reusable frames;
- omit only encyclopedic or glossary-only material;
- organize content around the encounter's arc;
- end with the two-sided example conversation;
- return raw JSON with no prose or code fences.

The quality bar is conversational and practical, not textbook-stiff. The shared prompt and card-reading
rules are backend-independent.

## Service flow

Both endpoints follow `service → model → service`.

```text
request
  │
  ├─ parse and validate service-side
  │
  ├─ model call
  │    /lookup: translate, disambiguate, and group
  │    /textbook call 1: questions and checklist
  │    /textbook call 2: phrasebook sections and dialogue
  │
  └─ validate, normalize, cap, set service-owned fields, attach usage
       → response
```

The service rejects invalid input before the model call. After the call it validates the response
shape, drops empty groups, trims excess items from the end while preserving model order, normalizes
Japanese readings, sets `context`, attaches usage, and returns the endpoint envelope.

## Shared implementation

The endpoints share:

- the API router, CORS, method handling, and `204`/`405`/`404` behavior;
- the `LLM_REGISTRY` and provider adapters, including explicit effective output-token ceilings;
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
