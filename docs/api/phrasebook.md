# POST /phrasebook

## Purpose and boundaries

Generate independent essential phrases, useful dictionary Words, and a complete short dialogue for
every selected topic. English authors the material; translation receives all three sections together,
not a request to score or select dialogue lines. Code owns request validation, index association,
readings, evidence, UUIDs, flags, usage and complete wire validation. Optional evidence never decides
whether an otherwise valid Word survives.

The API is stateless and returns a complete response, not streamed or partial required content.
Generation and translation backends are independently server-owned; the client cannot select them.
See the [API overview](../API_DESIGN.md) for shared routing, backend configuration, trust and accounting
conventions, and [card content and validation](../CARD_SCHEMA.md#content-types) for shared types.
Structural acceptance is not a guarantee of translation, pronunciation or teaching quality.

## Request and response

### Request

```json
{
  "seed": "ordering vegan food",
  "language": "ja",
  "ability": "basics",
  "answers": {"Where are you eating?": "Standard restaurant"},
  "checklist": ["State my dietary restrictions", "Ask about hidden ingredients"]
}
```

| Field | Rules |
|---|---|
| `seed` | Required nonblank string, at most 200 UTF-16 units after trimming. |
| `language` | Required: `zh`, `ja`, `es`, `cs` or `uk`. Ukrainian uses native Cyrillic. |
| `ability` | Exactly `none`, `basics` or `conversational`; missing or invalid values, including wrong types, casing or whitespace, are ignored and default to `basics`. Only the sanitized enum reaches prompts. |
| `answers` | Required question-to-answer string map, possibly empty; at most five entries, labels at most 200 and values at most 500 units after trimming. |
| `checklist` | Required ordered list of 1–8 nonblank topic strings, each at most 120 units after trimming. Duplicate topics are allowed. |
| `llm` | Rejected; requests cannot override server backend selection. |

Seed, answer labels/values and topics must remain nonempty after trimming. Trimmed answer-key
collisions return `400`. Ability controls which material is worth spending lines on, not grammar
difficulty: `none` includes first-week language, `basics` assumes it, and `conversational` prioritizes
situation-specific language. The learner chooses the topic count.

### Model tasks and raw authoring output

Every call separates trusted instructions from `JSON.stringify`-serialized task data; no request
content becomes trusted instructions. English receives sanitized `{seed,language,ability,answers,
checklist}` with a singleton checklist for the original indexed topic. Its raw JSON shape is:

```ts
{conversations: [{
  title: string,
  essentials: string[],
  vocab: string[],
  lines: {speaker: 'you' | 'partner', text: string}[]
}]}
```

The singleton title must exactly equal that topic. English entries are nonblank strings of at most
2,000 UTF-16 units. Every essentials/vocab entry is validated before valid excess is clamped to eight
essentials or ten words; malformed tails reject the attempt. At least one essential is required;
vocab may be empty. Dialogue is 2–10 entries with both speakers and is never truncated. Raw unknown
fields are rejected, including a model-authored `alternative` (see the implementation gap below).

Translation receives `{seed,language,ability,answers,conversation}` with the retained English title,
essentials, lines and vocab. It emits this smaller shape, not cards, IDs or Evidence:

```ts
{
  lines: string[], essentials: string[],
  vocab: {target: string, partOfSpeech: string, senseKey: string,
          source?: {section: 'essentials' | 'dialogue', index: number,
                    surface: string, occurrence: number}}[],
  // Japanese only:
  essentialsRomanizations?: string[], lineRomanizations?: string[], vocabRomanizations?: string[]
}
```

Each section count must exactly match retained English, including an empty vocabulary list. Target
strings are trimmed, nonblank and at most 2,000 units, and must remain nonblank after stray reading
brackets are removed. Word targets are dictionary forms; POS must be one of `noun`, `verb`,
`adjective`, `adverb`, `pronoun`, `determiner`, `preposition`, `postposition`, `conjunction`, `particle`,
`interjection`, `numeral`, `expression`, `other`. `senseKey` is an English concept identifier matching
`^[a-z0-9]+(?:-[a-z0-9]+)*$`, at most 120 units. English vocab supplies each Word's displayed translation.
Unknown raw fields are rejected outside explicitly recoverable enrichment.

The native translation schema orders properties as `lines`, `essentials`, `vocab`, followed by the
unchanged Japanese romanization-array order. Native schema constraints do not repair malformed JSON
or establish linguistic correctness; adapters without schema support retain prompt/validation handling.

### Wire response and source evidence

```ts
{
  schemaVersion: 3,
  title: string,
  groups: {
    id: string, title: string,
    essentials: {id: string, card: Phrase}[],
    vocab: Candidate[], // Word cards only; optional sources
    dialogue: {id: string, card: Phrase, speaker: 'you' | 'partner', alternative?: true}[]
  }[],
  flags: {code: 'vocab-source-missing', groupIndex: number,
          vocabIndex: number, reason: 'unresolved'}[],
  usage: {model: string, inputTokens: number, outputTokens: number,
          totalTokens: number, costUsd: number | null, durationMs: number}
}
```

There are 1–8 groups in original request order, each with the exact submitted topic title, 1–8
essentials, 0–10 vocabulary candidates and 2–10 dialogue lines containing both speakers. Response
`title` remains the seed fallback; independent local naming is unchanged. Title/group-title bounds
are 200/120 units. Server UUIDs identify groups and draft occurrences; essential/dialogue IDs are
globally unique even for equal target text. Essentials carry neither speaker nor alternative.
Dialogue has `alternative: true` exactly when the immediately preceding line has the same speaker;
code derives this association again during assembly. Old `phrases`, `featuredPhraseIds` and score
fields are not v3 and are rejected.

Phrase/Word text and English translation are nonblank, at most 2,000 units. Optional romanization is
nonblank and at most 2,000 units. Cards carry no storage metadata. `ReadingToken` is exactly
`[nonemptyBase, nonblankAnnotation | null]`; a present reading is nonempty and its bases concatenate
exactly to card text. Generated Japanese/Chinese Words require their own dictionary-headword-aligned
readings; source readings are not an inflection heuristic. See also
[shared strict validation](../CARD_SCHEMA.md#strict-validation).

A vocabulary `source` selects a translated essential/dialogue item in the same topic by section and
in-range index. Its `surface` is nonblank, at most 2,000 units, unpadded, contains a letter or number,
and has no reading markup. Its explicitly supplied nonnegative integer `occurrence` selects a
left-to-right **overlapping** exact match after inline readings are normalized. Even a unique surface
requires an occurrence; code never guesses positions or inflections or uses English substrings.
For example, a unique surface without `occurrence` is unresolved rather than implicitly occurrence 0.

Code constructs the exact source snapshot, UTF-16 `[start,end)` span and draft occurrence ref.
Evidence must stay within that phrase, select meaningful text, not split surrogate pairs, and cannot
cross topics or mismatch snapshots. Refs are advisory; snapshots remain the historical source of
truth. Omitted source produces neither evidence nor a flag. Present but unresolved source is dropped
with `vocab-source-missing` / `unresolved`, preserving the valid Word; required target/POS/senseKey
and reading validation remain strict.

`usage` uses actual reply model IDs, nonnegative integer token counts (`totalTokens = inputTokens +
outputTokens`), finite nonnegative cost or `null`, and rounded wall-clock milliseconds. Failed
validation attempts and provider-error replies with usage contribute known usage; any unknown cost
component keeps aggregate cost null. Overlapping calls are not added as latency.

### Readings and Japanese pronunciation

Kanji/hanzi `base[reading]` runs become ReadingToken pairs; stray bracket annotations are removed.
Japanese kana/katakana are not ruby-annotated, and adjacent unannotated tokens merge. Language reading
rules are inserted into `{{READING_RULES}}`; Spanish, Czech and Ukrainian insert an empty string.

Japanese raw translation arrays match essentials/lines/vocab by section index. Nonempty Latin-script
entries are retained. Invalid entries use WanaKana conversion of that target's kana and inline
readings. Missing or wrong-count arrays are discarded **as a whole** and rebuilt mechanically so
shifted model indexes are never trusted. Fallback or omission logs
`phrasebook_romanization_fallback`, level 1, without a chunk retry or `502`. If missing kanji readings
prevent Latin-script output, the valid card is retained without romanization. Translation text,
required readings and section counts remain strict.

The Japanese prompt requires modified Hepburn with learner-readable spacing: particles は/へ/を are
`wa`/`e`/`o` by grammatical function, inflected endings stay attached, and `desu` is separate. Long
vowels use macrons, including katakana ー, while conventional `ei`/`ii` remain. Small っ doubles
consonants (`matcha` before `ch`); syllabic `n` uses an apostrophe before vowels/`y` (`kin'en`,
`shin'yō`). Sentence starts and proper names are capitalized. 私はビーガンです。 should become
`Watashi wa bīgan desu.`. These are prompt requirements, not schema guarantees.

Mechanical fallback is narrower: it inserts a space before ruby-annotated runs, changes segment-final
`ha` to `wa` before whitespace/punctuation/end, and capitalizes phrase output. Thus
`これには出汁[だし]が入[はい]っていますか` becomes `Koreniwa dashiga haitteimasuka`. Internal `ha` is
unchanged; genuine words ending in `ha` can also change. Other particle readings/macron conventions
remain mechanical. Valid model romanization is never rewritten, and the Latin-script check does not
prove Hepburn correctness. Existing stored cards are not rewritten.

### Client boundary

The client must validate the **full** response and submitted checklist association before filtering
selected original indexes; duplicate titles are not identity. Generation finishing causes no implicit
save or navigation. A stored selected topic may have no essentials after client deduplication, but the
incoming response must still meet the bounds above. Detailed setup, selection, invalidation and retry
interactions belong to [guided creation](../DESIGN.md#guided-creation); commit/deduplication, ID/ref
remapping, stars and namespace ownership belong to [atomic lifecycle](../CARD_SCHEMA.md#atomic-lifecycle)
and [namespace isolation](../CARD_SCHEMA.md#namespace-isolation-and-backup). Evidence always preserves
its exact original snapshot/span, even if a client removes the referenced draft occurrence.
API and web must deploy together.

## Pipeline and step outcomes

These are logical reporting checkpoints, not separately emitted logs or extra model calls.
Apply the [shared outcome criteria](../../evals/README.md#step-outcomes-and-criteria) to each named
step; [runtime levels](../API_DESIGN.md#runtime-failure-levels) stay out of the wire envelope.
Bounds above apply throughout this single authoritative pipeline description.

| Step | Responsibility / success | Warning / recovery | Failure |
|---|---|---|---|
| `phrasebook.request` | Parser sanitizes task and ordered checklist. | Invalid optional ability defaults to basics. | Invalid required input, trimmed key collision or client `llm`: `400`. |
| `english.prompt` | Trusted builder creates singleton indexed-topic instructions and JSON task. | No prompt substitution or semantic repair. | Required task/build failure cannot yield content. |
| `english.call` | Provider/rate-limit helper returns raw English and usage. | Existing 429 backoff only. | Provider/call/deadline failure is not a content-validation retry. |
| `english.decode` | `parseModelJson` decodes exterior-trimmed JSON. | One existing validation retry may recover syntax failure. | No Markdown-fence stripping or arbitrary JSON repair; exhausted invalid JSON fails. |
| `english.validate` | Exact title/sections, bounded nonblank entries and both dialogue speakers validate. | One validation retry per topic, not per field. | Missing/wrong required data, malformed tails or raw extra fields, including `alternative`, reject attempt. |
| `english.normalize` | Retain independent sections and derive alternatives from adjacency. | Clamp valid excess essentials/vocab, level 1. | Never truncate dialogue; intended raw-alternative ignore is not implemented. |
| `phrasebook.english.join` | Barrier obtains every English result at its original index before translation. | Completion order/duplicate titles never change association. | Required failure blocks translation and aborts siblings; no partial book. |
| `translation.prompt` | Trusted/schema builders send all retained sections with exact counts and language reading rules. | Provider schema support is not semantic validation. | No substituted source or guessed required structure. |
| `translation.call` | One parallel job per complete topic returns raw translation/usage. | Existing 429 backoff; no extra call for optional enrichment. | Provider/call/deadline failure aborts required work. |
| `translation.decode` | Syntax-only parser decodes translation JSON. | One existing validation retry for this topic's unusable output. | No fence stripping/repair; exhausted syntax failure fails. |
| `translation.validate` | Required targets, exact counts, dictionary Word/POS/key/readings validate. | Optional source/romanization recovery only. | Missing/invalid required cards or count mismatch reject attempt. |
| `translation.align` | Associate each translated section exactly with retained English indexes. | Discard wrong-count Japanese romanization arrays and mechanically rebuild whole arrays. | Never truncate/pad required sections or guess shifted associations. |
| `translation.normalize` | Normalize annotated text, readings and pronunciation. | Invalid/missing/unaligned Japanese romanization falls back or is omitted, level 1; routine shaping need not warn. | Optional recovery never excuses invalid required text/readings. |
| `translation.enrich` | Resolve optional Word source to an exact occurrence/span. | Omitted source is valid without flag; present unresolved source is dropped with `vocab-source-missing`, level 1. | Valid Word survives missing enrichment; invalid required Word does not. |
| `phrasebook.translation.join` | Obtain all translations at original indexes. | Neither completion order nor duplicate titles determine association. | Required translation failure aborts sibling work. |
| `phrasebook.assemble` | Build v3 cards, UUIDs, exact snapshots/refs/spans, flags and usage; derive alternatives again. | Optional flags/unknown cost alone do not invalidate content. | Missing required results or invalid candidates prevent response. |
| `phrasebook.validate` | Shared validator checks every group/card/reading/ID/ref/association and usage. | No per-card repair/retry at this boundary. | Invalid final contract fails endpoint. |
| `phrasebook.respond` | Handler returns complete validated `200` response. | Recovered endpoint success retains level 1. | No partial required content; exhausted operation is level 2, controlled error; disconnect cancels work. |

`english.quality` and `translation.quality` independently review task coverage, meaning, vocabulary,
roles, readings/pronunciation and evidence. They are **evaluation-only**, not runtime stages,
semantic retry triggers or automatic endpoint-failure thresholds.

## Execution limits and recovery

- At most four English workers run indexed topics. Translation fanout starts only after the complete
  English barrier; then one job runs per topic. Every job retains its original request index.
- Both generation and translation cap each provider call at 6,000 output tokens. DeepSeek has a
  120-second adapter budget; default Gemini has 15 seconds; alternate adapters keep configured bounds.
- Each logical call shares its timeout across at most three 429 retries with 2/4/8-second backoff.
  Required English and translation validation each allow one new logical attempt per topic.
- The overall 245-second deadline includes queued generation waves and retries; it never resets.
  Gateway allows 270 seconds and Cloud Run 300 seconds. Required failure cancels sibling work;
  disconnect aborts work. Exhausted failures return `502`; configuration/programming errors may be `500`.
- Optional evidence/pronunciation recovery makes no additional model call. Retain failed attempts,
  known usage, unknown charges and recovered final outcomes separately.
- Usage includes all requested topics, including those the client later discards.

## Known implementation gaps

- Current `english.validate` rejects a raw model `alternative` field as an extra field; an available
  validation retry may then be spent. Intended policy is to ignore it in `english.normalize`, derive
  alternatives from adjacency and warn without a call merely to remove the field. The warning must
  retain the exact ignored value for investigating why it appeared. Safe-ignore is **not implemented**;
  preserve current rejection versus intended recovery in reports. See the
  [baseline log](../../evals/baseline/log-findings-2026-10-28.md); no provenance cause is established.
- Known translation defects remain accepted risk from the
  [code-only v3 cutover](../../evals/history/api-cutover-and-legacy-evaluations.md#2026-10-01-code-only-v3-cutover),
  not linguistic acceptance or deployment authorization.

## Implementation references

- [`api/src/phrasebook/index.js`](../../api/src/phrasebook/index.js): `generateTopic`,
  `generateConversations`, `translateConversation`, `translateConversations`, `performPhrasebook`,
  `handlePhrasebook`; scheduling, deadlines and cancellation.
- [`api/src/phrasebook/parse.js`](../../api/src/phrasebook/parse.js): request parsing,
  `validateGenerationResponse`, `validateTranslationResponse`, `assemblePhrasebook`.
- [`api/src/phrasebook/prompt.js`](../../api/src/phrasebook/prompt.js): trusted task builders;
  [`prompt.txt`](../../api/src/phrasebook/prompt.txt) and
  [`translate-prompt.txt`](../../api/src/phrasebook/translate-prompt.txt): canonical prompts;
  [`reading-rules-ja.txt`](../../api/src/phrasebook/reading-rules-ja.txt) and
  [`reading-rules-zh.txt`](../../api/src/phrasebook/reading-rules-zh.txt): reading requirements.
- [`api/src/reading.js`](../../api/src/reading.js): shared pure pronunciation helpers.
- [`api/src/schema/index.ts`](../../api/src/schema/index.ts): `validatePhrasebookResponse` and shared
  card/evidence/wire validation; [`api/src/pricing.js`](../../api/src/pricing.js): cost accounting.
