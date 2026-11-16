---
kind: spec
status: current
summary: POST /phrasebook contract, four-section generation and translation pipeline, limits, recovery and quality limitations.
sources: [api/src/phrasebook/index.js, api/src/phrasebook/parse.js, api/src/phrasebook/prompt.js, api/src/phrasebook/prompt.txt, api/src/phrasebook/translate-prompt.txt, api/src/phrasebook/reading-rules-ja.txt, api/src/phrasebook/reading-rules-zh.txt, api/src/reading.js, api/src/ability.js, api/src/schema/index.ts, api/src/llm-config.js]
verified: 2026-11-15
---

# POST /phrasebook

## Purpose and boundaries

Generate four sections for every selected topic: **Things to say**, **Likely exchanges**, **Words** (organized into titled families), and a linear **Example conversation**, in that display order. English authors the material; translation receives the complete topic, not a request to score or select lines. Alternatives are explicit response arrays within an exchange turn, never inferred from adjacent speakers. Code owns validation, index association, readings, evidence, UUIDs, flags and usage. Optional evidence never decides whether an otherwise valid Word survives.

The API is stateless and returns a complete response, not streamed or partial required content. Generation and translation backends are independently server-owned; the client cannot select them. See the [API overview](../api-design.md) for shared routing, backend configuration, trust and accounting conventions, and [card content and validation](../card-schema.md#content-types) for shared types. Structural acceptance is not a guarantee of translation, pronunciation or teaching quality.

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

Seed, answer labels/values and topics must remain nonempty after trimming. Trimmed answer-key collisions return `400`. Ability controls which material is worth spending lines on, not grammar difficulty: `none` includes first-week language, `basics` assumes it, and `conversational` prioritizes situation-specific language. At every level, generic language (greetings, thanks, apologies, polite openers, "Could you help me?") stays out of Things to say and Words; `none` learners meet it in Likely exchanges and the Example conversation. The prompt also asks for English-only output, no "Do you speak English?" line, nothing that belongs to another topic of the same request, and at most one alternative on a turn after the first, used only when the outcome differs; the parser accepts any number of alternatives on every turn and flags more than three responses (counts below). The learner chooses the topic count.

### Model tasks and raw authoring output

Every call keeps fixed teaching instructions separate from the user's task data. [`english.prompt`](#english-generation) does **not** ask a model to write a custom prompt or substitute the seed into `prompt.txt`. It pairs that unchanged file with a JSON string containing `{seed,language,ability,answers,topic,otherTopics}`: `topic` is **one** checklist entry and `otherTopics` lists the request's other entries in order, so each call knows which subjects belong to other chapters. `generationTasks` in `api/src/phrasebook/index.js` owns that split. The reply carries no title; code attaches the requested one. The English model is asked to return:

```ts
type EnglishModelOutput = {
  thingsToSay: string[];
  likelyExchanges: {
    title: string;
    turns: {speaker: 'you' | 'partner'; say: string; or?: string[]}[];
  }[];
  words: {title: string; items: string[]}[];
  exampleConversation: {speaker: 'you' | 'partner'; text: string}[];
};
```

A turn's `say` is its main line and `or` holds alternatives for that turn; read in order, the `say` lines are the exchange, and code reads each turn as one response array `[say, ...or]`. The same shape is sent to the provider as an enforced response schema (`buildGenerationResponseJsonSchema`) that also caps each list at the size the prompt asks for: 1–8 Things to say, 1–4 exchanges of 2–4 turns with at most one `or` line, at most three Word families of two to six items, and 2–10 example lines (owner decision 2026-11-14). The parser does not rely on those caps: a provider that ignores them is caught by the repair and count rules below. English entries are nonblank strings of at most 2,000 UTF-16 units; exchange and family titles are at most 120 units. Each section has a minimum and no maximum: Things to say needs at least one phrase; Likely exchanges at least one titled exchange of at least two turns with at least one response each; Example conversation at least two lines; Words may be empty, and each family needs at least two words. Either speaker may start, and consecutive turns may share a speaker. Unknown fields at any level reject that entry; on the reply, including a `title`, a `topics` wrapper or legacy `alternative` or `featuredPhraseIds` markers, they make the whole reply unreadable.

English replies are repaired entry by entry rather than rejected as a whole (owner decisions 2026-11-13). Each repair is reported as a response flag:

| Defect | Handling | Flag |
|---|---|---|
| Blank, oversized, wrong-typed or malformed entry (phrase, response, turn, line, word, exchange or family) | Dropped | `content-dropped`, reason `invalid-entry` |
| Exchange left with fewer than two turns | Dropped | `content-dropped`, reason `too-few-turns` |
| Word family left with one word | The word joins the nearest earlier family with two or more words, else the first later one; two lone words form one family | `word-family-merged` with the receiving `familyIndex` |
| Lone word with no other family | Dropped | `content-dropped`, reason `single-word-family` |
| Same speaker on consecutive turns or lines | Kept: a speaker can say two things in a row, which should not be grouped into one response | `speaker-repeated` with `lineIndex` (and `exchangeIndex`) |
| Section missing, wrong type, or below its minimum after drops | One more full-topic attempt; each section is taken from the earliest attempt that could use it | `section-missing` with an empty section if no attempt could use it |

A reply that cannot be read at all (invalid JSON, an unknown or missing top-level field, or a completion that is empty or cut off at the token limit) uses the same single extra attempt. The request fails with `502` only when no attempt for a topic was readable, or when the combined topic has no phrases (Things to say, Likely exchanges and Example conversation all missing).

Nothing is trimmed or rejected for being too long. Counts above these limits (`PHRASEBOOK_COUNT_LIMITS` in `api/src/schema/index.ts`) are kept and reported as `count-overrun` flags at failure level 1 (owner decisions 2026-11-13; the Words limit rose from 10 to 18, the three families of six the prompt asks for, on 2026-11-14):

| `section` | Counted | Flagged above |
|---|---|---|
| `thingsToSay` | Things to say phrases | 8 |
| `likelyExchanges` | Exchanges in the topic | 4 |
| `exchangeTurns` | Turns in one exchange (`exchangeIndex`) | 6 |
| `responses` | Alternative responses in one turn (`exchangeIndex`, `lineIndex`) | 3 |
| `exampleConversation` | Example conversation lines | 12 |
| `words` | Words across all families of the topic | 18 |

[`translation.prompt`](#translation) pairs the translation instructions and language reading rules with `{seed,language,ability,answers,topic}` as a JSON string. `topic` is one accepted four-section English topic. The translation model is asked to return translated strings and word descriptions, not cards, IDs or source snapshots:

```ts
type TranslationModelOutput = {
  phrases: string[];
  words: {target: string; partOfSpeech: string; senseKey: string;
          source?: {phraseIndex: number; surface: string; occurrence: number}}[];
  // Japanese only:
  phraseRomanizations?: string[]; wordRomanizations?: string[];
};
```

Counts must exactly match retained English. Phrase order is thingsToSay, then exchange/turn/response, then exampleConversation; Word order is family/item. IDs and nesting are reconstructed by code. Target strings are trimmed, nonblank and at most 2,000 units, and must remain nonblank after stray reading brackets are removed. Word targets are dictionary forms; POS must be one of `noun`, `verb`, `adjective`, `adverb`, `pronoun`, `determiner`, `preposition`, `postposition`, `conjunction`, `particle`, `interjection`, `numeral`, `expression`, `other`. `senseKey` is an English concept identifier matching `^[a-z0-9]+(?:-[a-z0-9]+)*$`, at most 120 units. English family items supply each Word's displayed translation. Unknown raw fields are rejected outside explicitly recoverable enrichment.

The native translation schema uses `phrases` and `words`, followed by Japanese romanization arrays when applicable. Native schema constraints do not repair malformed JSON or establish linguistic correctness; adapters without schema support retain prompt/validation handling.

### Wire response and source evidence

```ts
{
  schemaVersion: 4,
  title: string,
  groups: {
    id: string, title: string,
    thingsToSay: {id: string, card: Phrase}[],
    likelyExchanges: {
      id: string, title: string,
      lines: {speaker: 'you' | 'partner', responses: {id: string, card: Phrase}[]}[]
    }[],
    words: {id: string, title: string, items: Candidate[]}[], // Word cards only
    exampleConversation: {id: string, card: Phrase, speaker: 'you' | 'partner'}[]
  }[],
  flags: ({code: 'vocab-source-missing', groupIndex: number,
           wordIndex: number, reason: 'unresolved'}
        | {code: 'count-overrun', groupIndex: number, section: string,
           received: number, limit: number,
           exchangeIndex?: number, lineIndex?: number}
        | {code: 'content-dropped', groupIndex: number, section: Section,
           reason: 'invalid-entry' | 'too-few-turns' | 'single-word-family'}
        | {code: 'word-family-merged', groupIndex: number, section: 'words',
           familyIndex: number}
        | {code: 'speaker-repeated', groupIndex: number,
           section: 'likelyExchanges' | 'exampleConversation',
           exchangeIndex?: number, lineIndex: number}
        | {code: 'section-missing', groupIndex: number, section: Section})[],
  // Section = 'thingsToSay' | 'likelyExchanges' | 'words' | 'exampleConversation'
  usage: {model: string, inputTokens: number, outputTokens: number,
          totalTokens: number, costUsd: number | null, durationMs: number}
}
```

There are 1–8 groups in original request order, each with the exact submitted topic title and the section minimums above, except that Things to say, Likely exchanges and Example conversation may be empty when, and only when, a `section-missing` flag names them. Response `title` remains the seed fallback; independent local naming is unchanged. Title/group-title bounds are 200/120 units. Server UUIDs identify groups, exchanges, families and draft occurrences. Phrase occurrence IDs remain globally unique even for equal target text. Things to say carries no speaker; exchanges attach the speaker to each turn, and the linear example attaches it to each line. No section accepts `alternative` flags. Legacy `essentials`, `vocab`, `dialogue`, `phrases`, `featuredPhraseIds` and score fields are not v4 and are rejected. Flags must reference a group and match the content: a `count-overrun` reports a real count above its section limit, with `exchangeIndex` exactly for `exchangeTurns` and `responses` and `lineIndex` exactly for `responses`; a `speaker-repeated` turn repeats the previous turn's speaker; a `section-missing` section is empty; a `word-family-merged` index is a family. Duplicate identifying flags are rejected; `content-dropped` and `word-family-merged` may repeat. Every flag is logged as a `phrasebook_flag` event.

Phrase/Word text and English translation are nonblank, at most 2,000 units. Optional romanization is nonblank and at most 2,000 units. Cards carry no storage metadata. `ReadingToken` is exactly `[nonemptyBase, nonblankAnnotation | null]`; a present reading is nonempty and its bases concatenate exactly to card text. Generated Japanese/Chinese Words require their own dictionary-headword-aligned readings; source readings are not an inflection heuristic. See also [shared strict validation](../card-schema.md#strict-validation).

A Word `source` selects a translated phrase in the same topic by its in-range flat `phraseIndex`. Its `surface` is nonblank, at most 2,000 units, unpadded, contains a letter or number, and has no reading markup. Its explicitly supplied nonnegative integer `occurrence` selects a left-to-right **overlapping** exact match after inline readings are normalized. Even a unique surface requires an occurrence; code never guesses positions or inflections or uses English substrings. For example, a unique surface without `occurrence` is unresolved rather than implicitly occurrence 0.

Code constructs the exact source snapshot, UTF-16 `[start,end)` span and draft occurrence ref. Evidence must stay within that phrase, select meaningful text, not split surrogate pairs, and cannot cross topics or mismatch snapshots. Refs are advisory; snapshots remain the historical source of truth. Omitted source produces neither evidence nor a flag. Present but unresolved source is dropped with `vocab-source-missing` / `unresolved`, preserving the valid Word; required target/POS/senseKey and reading validation remain strict. `wordIndex` addresses the flattened family/item order, not a family-local index.

`usage` uses actual reply model IDs, nonnegative integer token counts (`totalTokens = inputTokens + outputTokens`), finite nonnegative cost or `null`, and rounded wall-clock milliseconds. Failed validation attempts and provider-error replies with usage contribute known usage; any unknown cost component keeps aggregate cost null. Overlapping calls are not added as latency.

### Readings and Japanese pronunciation

Kanji/hanzi `base[reading]` runs become ReadingToken pairs; stray bracket annotations are removed. Japanese kana/katakana are not ruby-annotated, and adjacent unannotated tokens merge. Language reading rules are inserted into `{{READING_RULES}}`; Spanish, Czech and Ukrainian insert an empty string.

Japanese raw translation arrays match the flat phrases/words arrays by index. Nonempty Latin-script entries are retained. Invalid entries use WanaKana conversion of that target's kana and inline readings. Missing or wrong-count arrays are discarded **as a whole** and rebuilt mechanically so shifted model indexes are never trusted. Fallback or omission logs `phrasebook_romanization_fallback`, level 1, without a chunk retry or `502`. If missing kanji readings prevent Latin-script output, the valid card is retained without romanization. Translation text, required readings and section counts remain strict.

The Japanese prompt requires modified Hepburn with learner-readable spacing: particles は/へ/を are `wa`/`e`/`o` by grammatical function, inflected endings stay attached, and `desu` is separate. Long vowels use macrons, including katakana ー, while conventional `ei`/`ii` remain. Small っ doubles consonants (`matcha` before `ch`); syllabic `n` uses an apostrophe before vowels/`y` (`kin'en`, `shin'yō`). Sentence starts and proper names are capitalized. 私はビーガンです。 should become `Watashi wa bīgan desu.`. These are prompt requirements, not schema guarantees.

Mechanical fallback is narrower: it inserts a space before ruby-annotated runs, changes segment-final `ha` to `wa` before whitespace/punctuation/end, and capitalizes phrase output. Thus `これには出汁[だし]が入[はい]っていますか` becomes `Koreniwa dashiga haitteimasuka`. Internal `ha` is unchanged; genuine words ending in `ha` can also change. Other particle readings/macron conventions remain mechanical. Valid model romanization is never rewritten, and the Latin-script check does not prove Hepburn correctness. Existing stored cards are not rewritten.

### Client boundary

The client must validate the **full** response and submitted checklist association before filtering selected original indexes; duplicate titles are not identity. Generation finishing causes no implicit save or navigation. A stored selected topic may have no Things to say after client deduplication, but the incoming response must still meet the bounds above. Word placements are never deduplicated across topics. Detailed setup, selection, invalidation and retry interactions belong to [guided creation](../design.md#guided-creation); commit/deduplication, ID/ref remapping, stars and namespace ownership belong to [atomic lifecycle](../card-schema.md#atomic-lifecycle) and [namespace isolation](../card-schema.md#namespace-isolation-and-backup). Evidence always preserves its exact original snapshot/span, even if a client removes the referenced draft occurrence.

## Pipeline and step outcomes

Read each row as **what code or a model does**, **which data it consumes/produces**, then **how it can continue or stop**. Only `english.call` and `translation.call` ask models to generate content. The English rows run per topic; translation waits for all English topics to succeed.

These are logical responsibilities, not 18 separate functions or emitted logs. In particular, `english.decode` and `english.validate` share `readGenerationReply`, and `english.normalize` is its per-entry repair plus `combineGenerationAttempts`; the corresponding translation work shares `validateTranslationResponse`. Checks and shaping can interleave, but no accepted result is returned until all required checks pass.

### Intermediate data shapes

- **Model input** is `{instructions: string, input: string}`: fixed teaching instructions plus user-specific JSON text. Preparing it is code work, not another model call.
- **English model reply** / **Translation model reply** is the text returned by that model call, wrapped by the backend integration as `{text: string, model: string}` plus token/cost metadata when available. The default English integration reads `text` from the provider response's `choices[0].message.content`. A **saved model reply** is that text recorded for later inspection; it is not an additional pipeline step.
- **Decoded English** / **Decoded translation** is `JSON.parse(reply.text)`, not yet accepted as the required `EnglishModelOutput` / `TranslationModelOutput` [above](#model-tasks-and-raw-authoring-output). Valid JSON can still contain forbidden fields.
- **Shaped English** is code's accepted, repaired English data: every usable list item, explicit exchange responses and word families, plus the repair flags. “Normalize” means deterministic shaping, not a second model rewriting the content:

```ts
type EnglishTopic = {
  title: string; // the requested topic, attached by code
  thingsToSay: string[];
  likelyExchanges: {title: string; lines: {speaker: 'you' | 'partner'; text: string[]}[]}[];
  words: {title: string; items: string[]}[];
  exampleConversation: {speaker: 'you' | 'partner'; text: string}[];
};
// One topic's combineGenerationAttempts return (flags gain groupIndex at assembly):
type ShapedEnglish = {topic: EnglishTopic; flags: Omit<PhrasebookFlag, 'groupIndex'>[]};
```

Each exchange line's `text` is `[say, ...or]`, so the turn owns its alternative response array. Example conversation is a separate linear sequence, not a branch of an exchange. `phrasebook.english.join` preserves original topic order; the orchestrator tracks recovery levels separately.

**Shaped translation** is the accepted return from `validateTranslationResponse` for one topic:

```ts
type ShapedTranslation = {
  phrases: string[];
  words: TranslationModelOutput['words'];
  // Japanese arrays can have undefined entries when pronunciation cannot be recovered:
  phraseRomanizations?: (string | undefined)[];
  wordRomanizations?: (string | undefined)[];
  flags: {code: 'vocab-source-missing'; wordIndex: number; reason: 'unresolved'}[];
  failureLevel: 0 | 1;
};
```

Its target strings still contain any inline `base[reading]` notation. Optional `source` remains a checked `{phraseIndex,surface,occurrence}` hint, not a source snapshot or card ID. `phrasebook.assemble` turns these strings/hints into cards, reading tokens, IDs and exact source snapshots/spans, returning `{schemaVersion,title,groups,flags}`. The orchestrator adds aggregate `usage`, then checks the complete [phrasebook response](#wire-response-and-source-evidence).

### English generation

| Step | What happens | Input → output | Outcome boundaries |
|---|---|---|---|
| `phrasebook.request` — check the user's request | Code trims/checks the seed, language, ability, answers and ordered topic list. | HTTP body → accepted task with the [request fields](#request). | Invalid required input/key collision/client `llm`: 400 before model calls. Invalid optional ability defaults to basics. |
| `english.prompt` — prepare English model input | Code uses unchanged `prompt.txt` as instructions and JSON-serializes the task for this topic, with the request's other topic titles in `otherTopics`; it does not interpolate user values into the instructions. | Accepted task + one topic → **Model input**. | Construction must retain the user's task and topic identity; no model call, semantic repair or prompt substitution here. |
| `english.call` — ask the English model | Backend code sends the instructions, the task and the strict response schema (`buildGenerationResponseJsonSchema`: fields, types, speakers and list caps) to the server-selected model with minimal reasoning, then extracts its returned text and accounting metadata. The provider enforces the schema: OpenRouter `response_format` for DeepSeek, `responseJsonSchema` for Gemini. DeepSeek goes through OpenRouter's performance routing: no fixed provider, fallbacks allowed, only providers that support the schema (`require_parameters`), a `preferred_min_throughput` of p90 150 tokens/s, `data_collection: 'deny'`, and `ignore` for providers that kept failing validation (`DEEPSEEK_PROVIDER_ROUTING` in `api/src/llms/openrouter.js`). | **Model input** → **English model reply** (`reply.text` plus metadata). | Receiving text succeeds here, not at later content checks. Provider/deadline errors fail the call. A rate limit (429) from DeepSeek hands this topic's call to Gemini 3.5 Flash Lite; a backend without a fallback uses 429 backoff ([limits](#execution-limits-and-recovery)). A completed reply that is empty or cut off at the token limit spends the validation retry instead. |
| `english.decode` — read the reply as JSON | Code trims exterior whitespace and parses `reply.text` into an object; it does not remove or rewrite object fields. | **English model reply** text → **Decoded English**. | Invalid JSON rejects the attempt; valid JSON alone does not prove the requested shape. No fence stripping or arbitrary repair. |
| `english.validate` — check the English fields/content bounds | `readGenerationReply` checks the reply's top-level fields, then every entry of every section, including each exchange turn's `say` and `or` responses. | **Decoded English** → per-section checked data or `null` for an unusable section, or a thrown error for an unreadable reply. | Unreadable replies and unusable sections earn one more full-topic attempt (see [repair](#model-tasks-and-raw-authoring-output)). Semantic continuation compatibility is not validated. |
| `english.normalize` — shape accepted English | Code attaches the requested title, reads each `{say, or}` turn as one response array, drops invalid entries, merges lone words into families and keeps repeated speakers, recording a flag for each. `combineGenerationAttempts` takes each section from the earliest attempt that could use it. It does not generate or translate sentences. | Checked attempts → **Shaped English** for this topic. | Nothing is clamped; counts above their limits are flagged at assembly. A section no attempt could use is left empty with `section-missing`; a topic with no phrases fails. |
| `phrasebook.english.join` — collect every English topic | Code waits for all English jobs and places accepted topics and their flags at their original request indexes. | Per-topic **Shaped English** → `{topics: EnglishTopic[], flags}`. | Translation starts only with all required topics. Exhausted failure blocks translation and aborts siblings; completion order/duplicate titles cannot change association. |

### Translation

| Step | What happens | Input → output | Outcome boundaries |
|---|---|---|---|
| `translation.prompt` — prepare translation model input | Code combines translation instructions with reading rules, serializes the task and complete accepted topic, and builds a response schema with exact flat phrase/word counts. | Task + **EnglishTopic** → **Model input** and provider response schema where supported. | All four English sections travel together; neither the topic nor required counts may be guessed or substituted. |
| `translation.call` — ask the translation model | Backend code requests all translated sections for one topic and extracts the returned text/metadata; topic jobs run in parallel. | **Model input** + response schema → **Translation model reply**. | Provider/call/deadline failure fails required work; existing 429 backoff may recover. No extra call merely for optional enrichment. |
| `translation.decode` — read the translation as JSON | Code parses the model's text into an object without repairing it. | **Translation model reply** text → **Decoded translation**. | Syntax failure rejects the attempt; no fence stripping/repair. An available validation retry may recover. |
| `translation.validate` — check required translated content | Code checks target strings, exact section counts and dictionary Word fields/readings against the accepted English topic. | **Decoded translation** + **EnglishTopic** → checked translated data, or validation error. | Invalid required cards/counts reject the attempt; optional source/pronunciation recovery cannot excuse them. |
| `translation.align` — keep source/translation indexes matched | Code associates every translated phrase and Word with the corresponding flat English index. | Flat translated arrays + English topic → checked one-to-one associations. | Never pad/truncate required arrays. Wrong-count Japanese pronunciation arrays are discarded for whole-array fallback, not attached to possibly shifted indexes. |
| `translation.normalize` — shape text and pronunciation | Code trims target strings, checks that their readings can form valid cards, and retains or mechanically rebuilds Japanese pronunciation. | Checked translated data → shaped strings/pronunciation arrays. | Pronunciation fallback/omission is level 1, not another model call. Inline reading notation remains in returned strings until card assembly. |
| `translation.enrich` — check optional word-source hints | Code checks whether a supplied phraseIndex/surface/occurrence identifies an exact translated phrase occurrence; keeps the hint or drops it with a flag. | Optional raw source hints → checked hints or missing-source flags in **Shaped translation**. | Omitted hints are valid without flags. Present unresolved hints warn at level 1; valid required Word content survives. Snapshots and IDs are built later. |
| `phrasebook.translation.join` — collect every translation | Code waits for every topic's accepted translation and retains the original topic order. | Per-topic **Shaped translation** → ordered translation array. | Required translation failure aborts sibling work; no partial phrasebook or title/completion-order reassociation. |

### Final response

| Step | What happens | Input → output | Outcome boundaries |
|---|---|---|---|
| `phrasebook.assemble` — build cards and the response | Code pairs flat source/translated items, rebuilds four-section nesting, converts inline readings into card reading tokens, creates IDs and exact source evidence, adds the English repair flags and a `count-overrun` flag for each count above its limit, and combines flags. The orchestrator adds usage and logs each flag. | English topics + flags + ordered translations → complete **Phrasebook response** candidate. | Optional flags/unknown cost alone do not invalidate content. Missing required results/invalid cards prevent a response. |
| `phrasebook.validate` — check the complete response | The shared validator checks groups, exchanges, families, cards, readings, IDs, source relationships, flags against content, missing-section flags and usage. | Response candidate → accepted **Phrasebook response**, or error. | Invalid final contract fails the endpoint; no per-card model repair/retry here. |
| `phrasebook.respond` — send the result to the client | The handler serializes the accepted response as HTTP JSON. | Accepted **Phrasebook response** → HTTP 200 body. | Recovered success remains level 1 in diagnostics; exhausted required work returns a controlled error, never partial required content. Disconnect cancels work. |

`english.quality` and `translation.quality` are separate **evaluation-only** reviews of usefulness, meaning and pronunciation, not more model calls required by this endpoint. For report classifications, use the [shared outcome criteria](../evals/index.md#step-outcomes-and-criteria); [runtime levels](../api-design.md#runtime-failure-levels) stay out of the response body.

## Execution limits and recovery

- At most four English workers run indexed topics. Translation fanout starts only after the complete English barrier; then one job runs per topic. Every job retains its original request index.
- Both generation and translation cap each provider call at 6,000 output tokens. DeepSeek has a 120-second adapter budget, a last-resort cap: OpenRouter retries providers that fail or time out, while a slow but still-streaming provider only loses later traffic to the throughput preference. Default Gemini has 15 seconds; alternate adapters keep configured bounds.
- Each logical call shares its timeout across at most three 429 retries with 2/4/8-second backoff. English generation on DeepSeek does not wait out that backoff: the first 429 for a topic hands that attempt to Gemini 3.5 Flash Lite (`getPhrasebookGenerationFallbackBackendName` in `api/src/llm-config.js`) with the same instructions, task and schema, under Gemini's own timeout and 429 backoff (owner decision 2026-11-14). Other topics stay on DeepSeek, and no other error triggers the fallback. The handover logs `phrasebook_generation_fallback` at level 1, and `usage.model` names every model that replied. Because DeepSeek is routed across providers with fallbacks, a 429 reaches the API only when OpenRouter could not place the call. Translation validation allows one new logical attempt per topic. English allows one more full-topic attempt per topic when a reply is unreadable (including empty or truncated) or leaves a section unusable, starting at the primary backend again; item-level defects are repaired without another call.
- The overall 245-second deadline includes queued generation waves and retries; it never resets. Gateway allows 270 seconds and Cloud Run 300 seconds. Required failure cancels sibling work; disconnect aborts work. Exhausted failures return `502`; configuration/programming errors may be `500`.
- Optional evidence/pronunciation recovery makes no additional model call. Retain failed attempts, known usage, unknown charges and recovered final outcomes separately.
- Usage includes all requested topics, including those the client later discards.

## Quality limitations

- Explicit response arrays preserve options within each exchange turn; they do not establish that options are meaningfully different rather than paraphrases.
- **Low-priority quality warning:** structural validation does not determine whether a later exchange turn is a sensible continuation after every preceding alternative. Continuation semantics remain unvalidated; no runtime diagnostic is emitted for this quality warning, and there is no semantic rejection or additional blocking quality call.
- Word families are an authoring target, not a semantic guarantee: broad topic buckets, mixed categories and near-duplicate Words can still occur. Structural bounds do not prove usefulness.
- Meaning, pronunciation, dictionary-form and source-evidence errors remain possible despite valid output. There is no accepted linguistic baseline or broad quality certification.
- A topic generated by the fallback model is thinner than a DeepSeek one ([candidate R4 evaluation](../evals/results/2026-11-14-english-prompt-candidate-r4.md)), so a phrasebook can mix two densities when only some topics hit a rate limit.
- Speaker order is not guaranteed: an exchange or example can contain two turns in a row by one speaker (flagged `speaker-repeated`).

Integration runs are recorded in the [evaluation results ledger](../evals/results.md).

## Implementation references

- [`api/src/phrasebook/index.js`](../../api/src/phrasebook/index.js): `generationTasks`, `buildGenerationResponseJsonSchema`, `generateTopic`, `generateTopics`, `translateTopic`, `translateTopics`, `performPhrasebook`, `handlePhrasebook`; scheduling, fallback, deadlines and cancellation.
- [`api/src/phrasebook/parse.js`](../../api/src/phrasebook/parse.js): request parsing, `readGenerationReply`, `combineGenerationAttempts`, `validateGenerationResponse` (both for one attempt), `validateTranslationResponse`, `assemblePhrasebook`.
- [`api/src/phrasebook/prompt.js`](../../api/src/phrasebook/prompt.js): trusted task builders; [`prompt.txt`](../../api/src/phrasebook/prompt.txt) and [`translate-prompt.txt`](../../api/src/phrasebook/translate-prompt.txt): canonical prompts; [`reading-rules-ja.txt`](../../api/src/phrasebook/reading-rules-ja.txt) and [`reading-rules-zh.txt`](../../api/src/phrasebook/reading-rules-zh.txt): reading requirements.
- [`api/src/reading.js`](../../api/src/reading.js): shared pure pronunciation helpers.
- [`api/src/schema/index.ts`](../../api/src/schema/index.ts): `validatePhrasebookResponse` and shared card/evidence/wire validation; [`api/src/pricing.js`](../../api/src/pricing.js): cost accounting.
