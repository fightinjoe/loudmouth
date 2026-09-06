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
- Supported LLM backends: `google`, `g-flash`, `claude`, `chatgpt`; default `google`.
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
- `gemini-3.5-flash-lite` targets p50 latency below 4 seconds and keeps the shared 15-second request
  timeout. Claude Haiku, GPT-5.6 Luna, and Gemini 3.8 Flash each use a 60-second timeout: their
  larger JSON responses routinely exceed the shared budget. Claude Haiku in particular measures
  20-26 seconds on a `/textbook` generate call.
- The API Gateway backend deadline (`deadline` in `api/config/api-gateway.yaml`) must stay above the
  longest adapter timeout. ESPv2 defaults it to 15 seconds, which would return an opaque gateway
  `504` before a slow-but-healthy backend could answer.

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
  "llm": "google | g-flash | claude | chatgpt"
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

## `/textbook`

### Purpose

`/textbook` prepares a learner for a topic or situation by guiding them through context selection and
then generating a complete phrasebook. It uses the same route for two calls; the presence of `context`
selects the call mode.

Initial generation defaults to situation-first, level-neutral language. It does not expose fixed
`ability`, `formality`, or `audience` request fields. When a dynamically selected context question asks
about proficiency or language confidence, call 2 honors that answer when choosing vocabulary and
sentence complexity without dropping essential practical content.

### Quality objective

The primary output of `/textbook` is a set of meaningful, reusable words and phrases that help the
learner converse in the target language. Realistic conversations are the generation mechanism for
discovering and validating that language, not an excuse to optimize for story realism.

Generation priorities, in order:

1. Reusable, memorizable words and phrases.
2. The learner's ability to express their needs, preferences, constraints, intentions, and identity.
3. The learner's ability to understand likely partner language.
4. Useful positive/negative and alternative outcomes.
5. Natural conversational sequencing.
6. Situational detail only when it improves reuse or comprehension.

Every primary action, explicit learner identity, explicit need, and hard constraint in the topic or
selected context is an essential concept. Generation teaches each essential identity, need, and
constraint directly rather than relying only on implications or lists of examples.

Context selects the language that matters—phrase frames, register, and substitutions. It should not
force concrete names, technical details, personal backstory, or observations into otherwise reusable
lines.

### Request

Call 1 omits `context`:

```json
{
  "topic": "dinner with my partner's parents",
  "language": "zh | ja | es | cs",
  "llm": "google | g-flash | claude | chatgpt"
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
  "llm": "google | g-flash | claude | chatgpt"
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
  "usage": { "model": "string", "inputTokens": 0, "outputTokens": 0, "totalTokens": 0, "costUsd": null, "durationMs": 0 }
}
```

Questions are dynamically authored for the topic, not a fixed demographic form. Options are short,
mutually exclusive, and meaningful to generation. `default` must be one of `options`. Maximum six
questions. Proficiency or language confidence is optional, but when call 1 selects that axis, call 2
must honor the chosen answer.

Checklist items are the **conversations to prepare** for the situation — short, learner-recognizable
titles ordered along the encounter's arc (before → during → after). `checked` is the model's suggested
default. Each checked item becomes exactly one conversation group in call 2. A defining identity or
hard constraint requires a default-checked conversation for stating it directly before verification,
modification, or transaction conversations. Maximum seven items; one group is reserved for `vocab`.

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
  "usage": { "model": "string", "inputTokens": 0, "outputTokens": 0, "totalTokens": 0, "costUsd": null, "durationMs": 0 }
}
```

`title` is a concise phrasebook name, preferably 2–4 Title Case words, clamped to 60 characters.
A missing or blank title is not an error; the client falls back to the raw topic.

Generation treats each selected checklist item as a short, two-sided conversation. Conversation groups
stay in the selected encounter order; their turns alternate speakers and carry speaker metadata in
`notes` as `{"speaker":"you"}` or `{"speaker":"partner"}`. The learner's supplied role and context
constrain their lines.

The final group is titled `vocab`. It contains 10–15 useful situation-specific word cards extracted
from the generated conversations, including reusable citation forms for conjugated verbs. Each vocab
card identifies an exact source conversation line in `notes` as `{"source":"…"}`.

There are at most eight groups total, including `vocab`, and at most 15 cards per group. The model does
not emit `context`, `id`, or `importedAt`; the service sets each card's `context` to its group's title.
Every card follows `CARD_SCHEMA.md`; `/textbook` includes `type` (`word` or `phrase`) so the client can
distinguish vocabulary from conversation content.

### Model requirements

Call 1 must infer only the context axes that materially change the generated chapter. It must avoid
padding questions and default-check the goals that carry the core interaction. A defining identity or
hard constraint requires a checked conversation for stating the learner's need directly.

Call 2 must:

- optimize first for reusable, memorizable words and phrases; conversations are a means to select and
  validate language, not the primary quality target;
- identify the topic's primary action plus every explicit learner identity, need, and hard constraint
  as essential concepts;
- teach each essential identity, need, and hard constraint in a direct learner-originating phrase, a
  general request, question, or response when useful, and a `vocab` card;
- include reusable learner self-expression of needs, preferences, constraints, intentions, and identity;
- default to level-neutral language, but honor an explicit proficiency or language-confidence context
  answer when choosing vocabulary and sentence complexity;
- use context to choose relevant phrase frames, register, and substitutions, not to decorate every line
  with concrete or technical detail;
- keep each conversation short and coherent, but permit a confirmation, reassurance, or acknowledgment
  when that is the natural reply; do not invent facts solely to create progression;
- include both sides of the exchange, including likely replies;
- include positive and negative or alternative outcomes when the situation naturally involves a choice;
- prefer phrases that can be adapted by changing one word or short phrase;
- include a final `vocab` group with 10–15 useful situation-specific word cards drawn from the
  conversations, led by the essential concepts;
- preserve the conventional target-language term for an essential concept even when it is a loanword
  or resembles English;
- when a situation involves safety, allergy, dietary, religious, or other hard constraints, never infer
  compatibility from an item's or action's name; a partner may present a specific option as compatible
  only after the exchange confirms the relevant ingredients, preparation, or conditions;
- respect any learner role in the context when assigning dialogue actions and speakers;
- omit generic survival padding, invented personal backstory, technical commentary, and encyclopedic
  or glossary-only material;
- alternate dialogue speakers strictly so no speaker responds to their own prior turn;
- return raw JSON with no prose or code fences.

The quality bar is conversational and practical, but reuse and memorization take precedence over story
realism. The shared prompt and card-reading rules are backend-independent.


### Generation robustness

Model-emitted JSON is occasionally malformed, most often in Japanese `reading` token arrays. Call 2
hardens generation before falling back to `502`:

- a missing comma between adjacent array or object elements is repaired;
- a structurally malformed `reading` token is dropped, keeping the card without furigana (reading is
  an optional display aid, not core content);
- the generation is retried once on any remaining validation failure.

These recover the response in place where possible; only a still-invalid result after the retry
returns `502`.

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
