# POST /phrase-breakdown

## Purpose and boundaries

Analyze the active occurrence of one Phrase independently of phrasebook creation. The model chooses
meaningful chunks, teaching explanations, dictionary Words and proposed Word equivalence. Code owns
the trust boundary: storage IDs are withheld from the model; source alignment, UTF-16 offsets,
evidence, cards, target selection and final response validation are deterministic.

This stateless endpoint makes one server-selected model call and returns a complete analysis, not
partial required content. Analysis does not save anything. Source snapshots are exact historical
content; refs are advisory navigation hints, not authority to reinterpret text or translation.
See the [API overview](../API_DESIGN.md) for shared routing, backend selection, trust and usage
conventions, and [shared cards](../CARD_SCHEMA.md#content-types) for Card/Candidate types.
Structural validity and exact spans do not establish accurate teaching or pronunciation.

## Request and response

### Request

```json
{
  "schemaVersion": 2,
  "source": {
    "snapshot": {
      "lang": "ja",
      "text": "肉も魚も食べません。",
      "translation": "I don't eat meat or fish.",
      "reading": [["肉", "にく"], ["も", null], ["魚", "さかな"], ["も", null], ["食", "た"], ["べません。", null]]
    },
    "ref": {"cardId": "saved-card-id", "occurrenceId": "active-occurrence-id"}
  },
  "context": {
    "generation": {"seed": "vegan dinner", "ability": "basics", "answers": {}},
    "groupTitle": "Dietary restrictions",
    "speaker": "you"
  }
}
```

| Field | Required / bounds and meaning |
|---|---|
| `schemaVersion` | Required, exactly `2`; old request formats are rejected. |
| `source.snapshot` | Required exact active phrase form/translation. `lang` is `zh`, `ja`, `es`, `cs` or `uk`; text/translation are nonblank strings, each at most 2,000 UTF-16 units. Optional nonblank `romanization` is at most 2,000 units; optional `reading` follows the exact alignment rules below. |
| `source.ref` | Optional `{cardId?,occurrenceId?}`; when present has at least one nonblank ID. IDs do not reach the model. |
| `context` | Optional active teaching context; may contain only `generation`, `groupTitle`, `speaker`. Do not substitute another phrasebook's situation. |
| `context.generation` | Optional complete `{seed,ability,answers}`. Seed is nonblank and at most 200 units; ability exactly `none`, `basics` or `conversational`; answers is a map with at most five nonblank labels/values, at most 200/500 units respectively. |
| `context.groupTitle` | Optional nonblank string, at most 500 units. |
| `context.speaker` | Optional `you` or `partner`. |

All present fields, including readings, are validated. Unknown keys (including client `llm`), null
in place of optional fields, malformed required data and unsupported enums return `400`. Source text
is **not trimmed**: its exact contents remain the offset basis, and the translation/readings remain
those of the active occurrence. A present ReadingToken array is nonempty; each token is exactly
`[nonemptyBase, nonblankAnnotation | null]`, and bases concatenate exactly to associated text,
including whitespace and punctuation. See also [strict validation](../CARD_SCHEMA.md#strict-validation).

### Model task and raw output

The trusted prompt receives `JSON.stringify({source: request.source.snapshot, context?})`: the exact
snapshot and optional active context, never storage IDs/refs. Trusted instructions remain separate
from this untrusted task content. The model emits a smaller analysis shape, not wire cards or spans:

```ts
{chunks: [{
  text: string, gloss: string, role: string, explanation: string,
  equivalentWordIndex: number | null,
  words: [{surface?: string, occurrence?: number, text: string,
           translation: string, partOfSpeech: string, senseKey: string,
           reading?: ReadingToken[], romanization?: string}]
}]}
```

There are 1–32 raw chunks, each with nonempty text of at most 2,000 UTF-16 units. Unknown raw fields
and malformed required fields are rejected. Every retained meaningful chunk requires nonblank gloss
(≤500), role (≤200) and explanation (≤1,000 units), and 0–32 Words. Model Word text is nonblank and
≤2,000; its translation is nonblank and **≤500**, not the general card translation ceiling of 2,000.
POS is one of `noun`, `verb`, `adjective`, `adverb`, `pronoun`, `determiner`, `preposition`,
`postposition`, `conjunction`, `particle`, `interjection`, `numeral`, `expression`, `other`.
`senseKey` is an English concept identifier matching `^[a-z0-9]+(?:-[a-z0-9]+)*$`, at most 120 units.

Japanese/Chinese generated Words require dictionary-headword-aligned ReadingToken arrays; inline
reading notation in their Word text is rejected. Spanish/Czech/Ukrainian Words omit readings: any
model `reading`, including `null`, is discarded before card validation. Ukrainian uses native
Cyrillic. Optional romanization is shaped with shared pronunciation helpers: Japanese can use
mechanical fallback from its own readings; other supplied romanization passes the Latin-script
helper. Retained romanization is nonblank and at most 2,000 units. Neither structural alignment nor
mechanical shaping verifies phonetic accuracy. No fragment reading is manufactured by cutting a
source reading token, and inflected source readings are never reused as dictionary-form readings.

### Wire response, alignment and evidence

```ts
{
  schemaVersion: 2,
  chunks: {
    start: number, end: number, text: string,
    gloss: string, role: string, explanation: string,
    words: Candidate[], // Word only, 0..32
    target: {kind: 'word', index: number} | {kind: 'chunk', card: Chunk}
  }[],
  flags: {code: 'word-source-missing', chunkIndex: number, wordIndex: number,
          reason: 'omitted' | 'unresolved'}[],
  usage: {model: string, inputTokens: number, outputTokens: number,
          totalTokens: number, costUsd: number | null, durationMs: number}
}
```

The response has 1–32 ordered meaningful chunks. Exact UTF-16 `[start,end)` spans select each chunk's
text in the original snapshot, do not split surrogate pairs, and cover every meaningful source
character. Only punctuation/whitespace gaps are permitted. Positions cannot be guessed and chunks
cannot be reordered. Punctuation-only chunks without Words and with null equivalence are discarded
after alignment, without shifting retained offsets; Words/targets on such chunks and all-empty or
all-punctuation analyses are invalid.

The prompt asks for a meaningful Word `surface` without surrounding whitespace, plus a zero-based
`occurrence` selecting its left-to-right **overlapping** match inside that chunk. Code treats both as
optional evidence hints. A resolvable surface is at most 2,000 units; occurrence must be an explicit
nonnegative safe integer even for a unique surface. Code derives absolute offsets, source language,
exact snapshot and optional refs. Every present Word Evidence must match the request's snapshot/refs,
select nonempty meaningful text, avoid surrogate splits and stay inside the containing chunk.
The server does not trust model IDs/snapshots, infer inflections or guess repeated occurrences.

A valid dictionary Word survives missing or unresolved hints without `sources`. For example, `眠い`
remains a Word beside the source-aligned Chunk `眠くなってきたのかも` when the model wrongly supplies the
dictionary form `眠い` as the encountered surface. Every source-less Word receives exactly one flag:

- `omitted`: **both** `surface` and `occurrence` were absent.
- `unresolved`: either hint was present but partial, malformed, unmatched, out of range or splitting
  a surrogate pair. Missing occurrence is unresolved even when the surface is unique.

Flag indexes refer to returned chunks/Words **after** punctuation-only chunks are removed. `flags`
is required and empty when every Word has evidence. Duplicate flags, bad indexes, flags for evidenced
Words and unflagged source-less Words are invalid. Optional flags cannot excuse invalid required
Words, readings, POS or senseKey; present evidence is still strict at the wire boundary.

### Equivalence and target choice

Every meaningful chunk has exactly one target; other distinct Words retain their own controls.
`equivalentWordIndex` must be null or an in-range nonnegative integer; malformed/out-of-range values
reject the analysis. Null uses a contextual Chunk. An indexed Word is the target only when its
resolved source covers the chunk apart from edge punctuation/whitespace **and** its normalized
dictionary text equals that edge-trimmed source span. Normalization is NFC plus trim, preserving
accents and case; it does not stem or case-fold.

An in-range claim lacking evidence, covering only part of the chunk or naming a different dictionary
form safely falls back to a Chunk, retaining every valid Word. Examples:

| Source and Word | Result |
|---|---|
| `caluroso` / `caluroso`, exact evidence | One Word target. |
| `肉も` / `肉` | Distinct contextual Chunk and Word targets; partial coverage is not equivalence. |
| `食べません` / `食べる` | Distinct Chunk and dictionary Word targets; inflection is not equivalence. |
| `aqui.` / `aquí` | Distinct targets; accent differences are preserved rather than failing the entire analysis. |

A Chunk target preserves exact source text/evidence, `translation = gloss`, role and explanation.
Contextual rendering uses the original snapshot, not fabricated sliced readings. The final shared
validator rechecks target equivalence, exact snapshots/refs, spans/coverage, cards and flags against
the **full original request**, and rejects an invalid Word target.

`usage` follows shared accounting: actual reply model ID, nonnegative integer token counts with
`totalTokens = inputTokens + outputTokens`, finite nonnegative charge/estimate or `null` for unknown
cost, and rounded wall-clock duration. Usage does not establish learning quality.

### Client boundary

The web validates the full response against the exact request before using or caching it. Cache keys
include refs, context and readings; cached analysis is not authoritative storage IDs or stars. Opening,
retrying, regenerating, closing and clearing cache do not implicitly save content. Only explicit
starring performs a durable save/membership operation, preserving exact evidence snapshots. Detailed
cache, stale-result, regeneration and close behavior is authoritative in
[phrase breakdown (web)](../DESIGN.md#phrase-breakdown-web); persistence, identity, stars and saved
teaching ownership are in [contextual presentation](../CARD_SCHEMA.md#contextual-presentation) and
[atomic lifecycle](../CARD_SCHEMA.md#atomic-lifecycle). Client cache/save outcomes are not API stages.
API and web must deploy together.

## Pipeline and step outcomes

These IDs name logical checkpoints, not an additional log emitted for every row. Classify scoped
success/warning/failure using the [shared criteria](../../evals/README.md#step-outcomes-and-criteria),
not merely the presence of an error or normalization. Runtime failure levels stay out of the wire
response. Bounds and exact-source requirements above apply to this single pipeline description.

| Step | Responsibility / success | Warning / recovery | Failure |
|---|---|---|---|
| `breakdown.request` | Shared request parser validates exact snapshot, optional refs/context, language, readings and bounds. | Source text remains untrimmed and exact. | Unknown/invalid fields or old request format: `400`. |
| `breakdown.prompt` | Trusted builder serializes snapshot and active context without storage IDs/refs. | No substituted prompt or source. | Required task/build failure cannot yield analysis. |
| `breakdown.call` | Timeout helper/provider returns one reply, model and usage. | No application retry, even for optional hints. | Provider failure/timeout: `502`; handler has no disconnect-cancellation wiring. |
| `breakdown.decode` | Direct model JSON parser decodes the reply. | No fence stripping or arbitrary repair. | Malformed JSON: `502`, no retry. |
| `breakdown.analysis.validate` | Validate bounded chunk teaching fields, required Word data and equivalence index. | Optional evidence can be absent/unresolved. | Unknown/malformed required fields, invalid Words or malformed/out-of-range equivalence reject analysis. |
| `breakdown.align` | Exact ordered chunk text becomes UTF-16 spans covering meaningful source. | Punctuation/whitespace-only gaps are allowed. | Guessed positions, surrogate splits, missing meaningful text or reordered chunks fail. |
| `breakdown.normalize` | Retain meaningful chunks and language-appropriate Word fields. | Remove empty punctuation chunks and non-Japanese/Chinese Word readings; ordinary shaping has no dedicated warning. | Words/targets on punctuation-only chunks or all-empty analyses are invalid. |
| `breakdown.enrich` | Resolve optional surface/occurrence to exact snapshot/ref/span. | Missing/unresolved hints retain valid Words and add `word-source-missing`, reason `omitted` or `unresolved`. | Never infer inflections or guess repeated positions; evidence cannot rescue invalid required content. |
| `breakdown.assemble` | Construct one Word or contextual Chunk target per meaningful chunk, flags and usage. | Null equivalence uses Chunk; in-range unsuitable Word claim safely falls back to Chunk, preserving Words, without dedicated runtime warning. | Malformed/out-of-range index or invalid required target/card fails. |
| `breakdown.validate` | Shared wire validator checks complete response against original request: spans/coverage, cards, evidence/ref containment, equivalence and flags. | Source-less Words must each have exactly one flag. | Invalid final analysis: `502`, no retry. |
| `breakdown.respond` | Handler returns complete `200` analysis. | Source warnings permit success/level 1; current usage level is flag-based, not every logical normalization. | Invalid required work returns controlled error, not partial analysis; client cache/save outcomes stay separate. |

`breakdown.quality` reviews teaching accuracy, target choice, dictionary meaning and pronunciation.
It is **evaluation-only**, not an emitted runtime stage, semantic retry trigger or automatic endpoint
failure threshold. Exact spans alone do not establish accurate explanation.

## Execution limits and recovery

- One server-selected provider call has a 4,096-output-token ceiling and default 15-second deadline;
  an alternate adapter uses its configured timeout.
- There is no application-level retry, including malformed required output or missing optional
  evidence. Optional evidence recovery never requests another model call.
- Invalid input returns `400`; provider failure, timeout, malformed JSON and invalid required analysis
  return `502`. Configuration/programming failures may return `500` under shared handling.
- The handler does not wire request-disconnect cancellation. A web close can abort fetch and suppress
  stale UI updates without cancelling an already committed save; server work and client persistence
  have distinct lifetimes.

## Known implementation gaps

- Request-disconnect cancellation is not wired in this handler.
- Successful usage `failureLevel` is currently derived from whether `flags` is nonempty; it does not
  individually report every pronunciation normalization or safe equivalence fallback. Such shaping
  must not be described as an emitted warning when none is recorded.

## Implementation references

- [`api/src/phrase-breakdown/index.js`](../../api/src/phrase-breakdown/index.js):
  `parsePhraseBreakdownRequest`, `validatePhraseBreakdownResponse`, `performPhraseBreakdown`,
  `handlePhraseBreakdown`, alignment, evidence and target construction.
- [`api/src/phrase-breakdown/prompt.js`](../../api/src/phrase-breakdown/prompt.js): trusted snapshot/task
  builder; [`prompt.txt`](../../api/src/phrase-breakdown/prompt.txt): canonical contextual-teaching prompt.
- [`api/src/schema/index.ts`](../../api/src/schema/index.ts): `validateBreakdownRequest`,
  `validateBreakdownResponse` and shared card, reading and evidence validators.
- [`api/src/reading.js`](../../api/src/reading.js): shared pure pronunciation helpers;
  [`api/src/llms/timeout.js`](../../api/src/llms/timeout.js): shared single-call timeout helper.
