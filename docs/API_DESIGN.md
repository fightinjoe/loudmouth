---
name: api-design
description: >
  Engineering design for the Catchphrase (Loudmouth) generation API — the /lookup endpoint that
  takes a term + options and returns translation blocks (a card plus related groups of cards).
  Load this doc to build, validate, or extend the endpoint, the prompt, or the eval harness.
status: RESOLVED — contract restructured (Goal · Inputs · Outputs · Internal flow · Model behavior ·
  Examples · Appendix). Code (api/src) predates the restructure and is reconciled in task T3.
---

# Catchphrase generation API (`/lookup`)

## Goal

A language learner interested in conversation benefits from words or phrases that help expand, redirect,
or continue a conversation. `/lookup` achieves this statelessly: each call takes one term and options and
returns a self-contained set of related phrases; conversational continuity comes from the caller chaining
calls (e.g. searching a returned card's `definition`/`context` next), not from server-side history.

This API takes inputs for a **term** (a single word or phrase) and **options** (enum variables that focus
the output), and returns an array of **translation blocks**, each pairing one card (a word or phrase with
its translation) with its related groups (labeled arrays of cards).

Internally, the API disambiguates the term into cards, identifies thematic groups, generates related
cards for each group, and bundles the response.

---

## Inputs

The table lists every parameter; params that need more explanation are detailed below it.

| Param | Required | Values | Default | Effect |
|---|---|---|---|---|
| `term` | yes | — | — | The English word or phrase to translate. Max 200 characters. |
| `language` | yes | `zh` \| `ja` \| `es` \| `cs` | — | Target language. Sets every card's `lang`. |
| `ability` | no | `none` \| `beginner` \| `intermediate` \| `advanced` | `beginner` | limits difficulty — vocabulary and grammar complexity. |
| `formality` | no | `casual` \| `polite` \| `formal` | `polite` | Register to anchor the output. A strong suggestion, not a filter (see below). |
| `audience` | no | `stranger` \| `staff` \| `acquaintance` \| `family` | `staff` | Who the learner is speaking to. |
| `llm` | no | `google` \| `claude` \| `chatgpt` | `google` | Which model backend generates the response. |

### `term` and context

The `term` may carry a parenthetical, e.g. `surf (v. to ride a wave)` or
`I'll have this one (ordering at a restaurant)`. The API splits it on the **first** `(`:

- **term** — the text before the `(` — the word or phrase to translate.
- **context** — the text after the first `(`, with any remaining `(`/`)` characters stripped (handles
  extra, nested, or unbalanced parens the same way). Optional; absent when there is no parenthetical.
  Missing a closing `)` is not an error (e.g. `surf (v. to ride` → context `"v. to ride"`); nested parens
  are stripped, not parsed (e.g. `term (b (c))` → context `"b c"`).

Both are handed to the model separately (their use is covered in Internal flow).

### `formality`

`formality` is a **strong suggestion, not a filter**. It anchors the output's register, but the model
may include neighboring registers when the `audience` makes them useful — e.g. `casual` + `staff` still
surfaces the polite form a shop sign would use. Input `casual` covers casual *and* slang. Cards report
their own register in the per-card `formality` output field, which adds `slang` as a fourth value
(`casual` \| `polite` \| `formal` \| `slang`) — output-only, since you request `casual` to get it.

### `ability`

`ability` scales output difficulty without changing intent (see **Model behavior**), anchored at `none`:
`none` means the learner has zero prior ability in the language — cards favor the single most common
word/phrase, minimal or no compound structure, no abbreviations; `beginner` allows common words, short
sentences, and simple grammar; `intermediate` allows compound sentences and less common vocabulary;
`advanced` allows idiomatic phrasing, complex constructions, and lower-frequency words. Affects word/
phrase choice and sentence complexity on every card, block and group alike — not a separate field on the
card. `slang`/vulgar register is never gated by `ability`; it's an optional output at the model's
discretion under `casual` formality (see `formality` above), independent of difficulty level.

---

## Outputs

The response is an object with one content key (an object, not a bare array, to leave room for
telemetry) plus a `usage` block:

```
{ "blocks": TranslationBlock[], "usage": Usage }
```

### Usage

Every 200 response carries a `usage` block reporting the LLM token consumption for the call
and an estimated cost:

```
{
  "model": "string",          // the exact provider model string that served the call
  "inputTokens": number,      // prompt tokens reported by the provider
  "outputTokens": number,     // completion tokens reported by the provider
  "totalTokens": number,      // inputTokens + outputTokens
  "costUsd": number | null    // estimated USD cost, or null when no rate is configured
}
```

Token counts come straight from each provider's usage metadata (`api/src/llms/*.js`). `costUsd`
is computed by `api/src/pricing.js` from a per-model rate table (USD per 1M input/output tokens);
it is `null` for any model whose rate is unset — the table ships as a placeholder, so cost is
`null` until real rates are filled in. The same figures are also emitted as a structured
`{ event: 'usage', route, llm, ... }` log line (visible on the terminal under `npm run dev`).
`/textbook` carries the identical `usage` block on both its call-1 and call-2 responses.

### Translation block

A term with one clear meaning yields **one** block; an ambiguous term (e.g. "switch" = the device vs.
to change) yields **one block per meaning**, in order. Blocks are distinguished by their order and, when
needed, by the `definition` on their card — there is no separate meaning label.

```
{
  "card":   Card,        // the direct translation of this meaning
  "groups": Group[]      // related groups for this meaning (may be empty)
}
```

**Cap: at most 4 blocks per response.**

### Group

A themed cluster of related cards. A group is a **leaf** — it holds cards, never nested groups. Cards
in a group may mix words and phrases (grouping is by theme, not grammatical form — see **Model
behavior**).

```
{
  "title": string,       // human heading, e.g. "Ordering at a restaurant"
  "cards": Card[]        // cards on the group's theme, distinct from one another
}
```

`title` is always **English**, regardless of `language` — it's a UI heading, not translated content.

**limits:** at most **8 groups total** across all blocks (they share the budget); at most **15 cards per
group**. There is no hard minimum — a narrow block may have 0 or more groups, and there is no floor on
the number of cards in a group. For broad topics, the model should generally target 3–5 groups and 4–6
cards per group when the topic supports it.

### Card

Every card — a block's `card` and every group card — is a `Card` per **`docs/CARD_SCHEMA.md`** (the
single source of truth for the shape). `lang` is set from the `language` input.

Three optional fields warrant a note here (all optional; a card may carry any combination):

- **`definition`** — the word's meaning, present only when disambiguation is needed. "bathroom" →
  `"bath / shower room"`; "surf" → one of `"n. ocean waves"` / `"v. ride a wave"` / `"v. browse the
  internet"`. An unambiguous term (e.g. "toilet") has no `definition`. Produced by the **model**.
- **`formality`** — the card's register: `casual` \| `polite` \| `formal` \| `slang`. Present only when
  the word has a register worth marking (common in Japanese: トイレ casual / お手洗い polite; often
  absent elsewhere and for words with no register, e.g. 水 "water"). Produced by the **model**.
- **`context`** — the situation a card belongs to, set by the **service** (the model never emits it): a
  block card gets the input term's parenthetical (if any); a group card gets its group's `title`.

---

## Internal flow

A request flows **service → model → service**: the service prepares the input, the model does the
language work in one call, the service validates and finishes the output.

```
term + options
     │
     │  ┌─────────────────────────────────────────────┐
     └─▶│ 1. PARSE (service)                          │
        │    split term on first "(" → term + context │
        │    validate options, apply defaults         │
        └───────────────────┬─────────────────────────┘
                            │
        ┌───────────────────▼─────────────────────────┐
        │ 2. GENERATE (model, one call)               │
        │    disambiguate term → 1..N meanings        │
        │    per meaning: translation card (+definition│
        │      if ambiguous) + thematic groups of cards│
        └───────────────────┬─────────────────────────┘
                            │
        ┌───────────────────▼─────────────────────────┐
        │ 3. FINISH (service)                         │
        │    validate shape · apply limits · drop empty  │
        │    groups · set context on cards · bundle    │
        └───────────────────┬─────────────────────────┘
                            │
                    { blocks: [...] }
```

### 1. Parse `[service]`

Split `term` on the first `(` into `term` + `context` (see **`term` and context** above). Validate the
parameters (required `term` and `language`; enum values; `term` ≤ 200 characters). Reject bad input with
a `400` before any model call.

### 2. Generate `[model]` — one call

One prompt turns the term + all params into the blocks-and-groups structure with be following actions:
1. disambiguate into meanings
2. translate each (to the inferred intent — see **Model behavior**)
3. cluster related cards into groups.

Full spec (output shape, how params tailor the result, disambiguation, quality bar) is
in the **Model behavior** section.

**Latency budget:** Google and Claude target p50 <4s with a 15s request timeout.
GPT-5.6 Luna receives a 60s timeout because large JSON generation can exceed
the shared budget; failures still return `502`.

### Output token budget

The shared ceiling is 30000 for Google. Provider adapters may lower it when
their model rejects larger completion limits: Claude Haiku uses 8192 and GPT-5.6
Luna uses 16384. The service passes the selected backend's effective ceiling to
its SDK; a response truncated by that ceiling follows the same invalid JSON →
502 path.

> v0 does this in a single call. A deferred optimization splits it into a planner + parallel fillers
> (appendix / `docs/FANOUT_DESIGN.md`); the service steps are unchanged by that.

### 3. Finish `[service]`

Deterministic post-processing, no model:
- **Validate** the response shape; a malformed or truncated response is a `502`.
- **Normalize Japanese readings** — kana and katakana never receive ruby annotations, and adjacent unannotated Japanese reading tokens are merged so model tokenization cannot produce per-character kana ruby output.
- **Check limits** — verify (and trip) ≤4 blocks, ≤8 groups total, ≤15 cards per group. These caps are
  also stated directly in the prompt (see **Model behavior**), so trimming here is a backstop for
  non-compliant model output, not the primary limiting mechanism — trimming is exceptional, not expected
  in normal operation, and no `truncated` flag is exposed to callers. When it does trigger, trimming
  keeps items in the model's returned order and drops from the end (block 5+ dropped; within a block,
  group 9+ dropped; within a group, card 11+ dropped) — consistent with disambiguation already ordering
  blocks by relevance.
- **Set `context`** — the input parenthetical on each block card; the group `title` on each group card.
- **Attach usage** — build the `usage` block (token counts from the provider + estimated `costUsd`).
- **Bundle** into `{ blocks: [...], usage }`.

---

## Model behavior

This is the spec for the one model call. It is the bulk of the implementation (the prompt) and the
main thing to verify. The rules are stated here; the **Examples** section demonstrates them.

The prompt is shared verbatim across all three `llm` backends (`google` \| `claude` \| `chatgpt`); per-
backend quality variance (a backend following the disambiguation, grouping, or register rules less
faithfully than another) is a known risk, not a runtime guarantee, and is caught by the eval harness's
LLM-judge pass (**Test coverage**, EVAL section) rather than enforced at request time.

**Translate the intent, not the dictionary word.** "Intent" is the implied meaning or situation that
emerges from reading the `term`, `context`, `audience`, and `formality` together. The block's card is
the phrase a person would actually use for that intent, which is often not the literal translation:
"bathroom" into Japanese for `audience: staff` leads with トイレ ("toilet"), not the literal loanword
バスルーム. (`ability` does not shape intent — it shapes how hard the resulting cards are.)

**Disambiguate into blocks.** Split the term into its distinct meanings, one block per meaning, in
order (at most 4). Only split on meanings that give genuinely different translations ("surf" → ride a
wave / ocean foam / browse the web). A block whose meaning needs spelling out carries a `definition` on
its card; an unambiguous term yields one block with no `definition`.

**Build diverse situation-based groups.** For each block, first identify the major situations and
conversational goals naturally associated with the seed, then cluster related cards into themed groups
(at most 8 total across all blocks; ≤15 cards each). Broad topics should generally produce 3–5 distinct
groups per block; narrow everyday words should generally produce 1–3. A group is organized primarily
by situation or conversational goal, not grammatical form, and **may mix words and phrases** — never
split them apart merely because they are different grammatical forms. Separate groups when the learner
would use them in different situations, even if they share the same broad topic. Aim for 4–6 distinct
cards per group when the topic supports it, including both useful vocabulary and usable phrases across
the response. Do not invent a second translation block just to create variety. Give each group a short,
content-scannable, **English** `title` (see **Outputs**). A narrow block may have a single group.

**Register (`formality`) is a soft anchor.** Bias toward the requested register, but include a
neighboring register when the `audience` makes it useful (request `casual` + `audience: staff` → also
surface the polite form on signage). Spillover only ever moves toward more formal registers — it never
moves toward `slang`; a card is tagged `slang` only when the input `formality` was `casual` (see
`formality` under **Inputs**). Tag each card with its own `formality` (`casual` \| `polite` \| `formal` \|
`slang`) only when the word has a register worth marking; omit it otherwise (most non-Japanese words, and
words like 水 "water" with no register variants).

Audience and formality shape how cards are phrased; they do not eliminate useful topic branches. For
example, a staff-oriented lookup may make rental and safety phrases polite, but should not exclude
related vocabulary or small-talk groups when those are useful.

**Content quality bar.** Favor common, conversational language a person would actually say to someone
they are trying to connect with; reject stiff, textbook, or exam-flavored content. Keep cards distinct
— no near-duplicates within or across a look-up.

**Output.** Return raw JSON (no code fences) shaped like the response in **Outputs**, minus the fields
the service fills in: the model does **not** emit `context`, `id`, or `importedAt`. Cards otherwise
follow `docs/CARD_SCHEMA.md`.

---

## Examples

Each example is an input and the block structure it should produce. Outputs use a compact
`text — translation` shorthand (with `[definition]` / `(formality)` where present); the first example
also gives one full card so the literal JSON shape is on record.

### 1. `bathroom` — intent, disambiguation, soft register, small groups

Input: `{ "term": "bathroom", "language": "ja", "formality": "casual", "audience": "staff" }`

Two meanings → two blocks. The primaries are the *intended* words (トイレ, not バスルーム), each with a
`definition` because "bathroom" is ambiguous. Words and phrases share one group per block (small,
cohesive). Register spreads past `casual` because staff/signage uses polite forms.

```
Block 1 — card: トイレ — toilet  (casual)
          definition: "the toilet / restroom"
  Group "Using the toilet"
    トイレはどこですか — where is the bathroom?
    お手洗い — restroom (polite)
    お手洗いをお借りできますか — may I use your restroom? (polite)
    便所 — toilet, lavatory (slang)

Block 2 — card: 浴室 — bathroom (the bathing room)
          definition: "bath / shower room"
  Group "Bath & shower"
    お風呂 — bath
    シャワー — shower
    湯船 — bathtub
    お風呂に入る — to take a bath
    シャワーを浴びる — to take a shower
```

The full JSON for Block 1's primary card (illustrating the literal shape):

```json
{
  "lang": "ja",
  "text": "トイレ",
  "reading": [["トイレ", null]],
  "translation": "toilet, restroom",
  "definition": "the toilet / restroom (not the bath)",
  "formality": "casual"
}
```

### 2. `dinner` — expansive grouping, single unambiguous block

Input: `{ "term": "dinner", "language": "ja", "formality": "casual", "audience": "family" }`

One meaning → one block, no `definition`. The related content is large, so it splits into distinct
themed groups (words vs. a couple of phrase themes) rather than one bucket.

```
Block 1 — card: 夕飯 — dinner, evening meal
  Group "Meals & courses"
    朝ごはん — breakfast
    昼ごはん — lunch
    おかず — side dish
    デザート — dessert
  Group "Planning the meal"
    何時にごはん？ — what time is dinner?
    今日の晩ごはんは何？ — what's for dinner tonight?
  Group "At the table"
    いただきます — (said before eating)
    おかわり — seconds / another helping
```

### 3. `water` — no register, no definition

Input: `{ "term": "water", "language": "ja" }`

One word, one meaning, and Japanese has no register variants for it — so the card has **no**
`formality` and **no** `definition`. Demonstrates the absence case.

```
Block 1 — card: 水 — water
  Group "Drinks"
    お茶 — tea
    コーヒー — coffee
    ジュース — juice
    お水をください — water, please
```

### 4. `coffee` — `ability` contrast

Input A: `{ "term": "coffee", "language": "es", "ability": "beginner" }`
Input B: `{ "term": "coffee", "language": "es", "ability": "advanced" }`

Same term, same intent — `ability` only changes word/phrase complexity, not which meaning is picked.

```
Beginner — card: café — coffee
  Group "Ordering"
    Quiero un café — I want a coffee
    ¿Tiene café? — do you have coffee?

Advanced — card: café — coffee
  Group "Ordering"
    Me pones un cortado, porfa — hook me up with a cortado, please
    ¿Qué tal está el café de aquí? — how's the coffee here?
```

---

# Catchphrase guided phrasebook generation (`/textbook`)

> **⚠️ Branch exploration.** `/textbook` exists only on the `textbook-guided-creation` branch, as
> an alternate phrasebook-creation path alongside `/lookup` (see `docs/journeys.md` Journey 5 and
> `docs/BRIEF.md`'s Textbook bullet). It is a new, separate endpoint — not a mode of `/lookup` —
> deployed in the same `api/` service and sharing its LLM backend plumbing.

## Goal

Where `/lookup` translates one term and returns AI-clustered *related* content around it,
`/textbook` goes further: given a **topic or situation** (not necessarily a single word — "salsa
dancing", "dinner with my girlfriend's parents") rather than a term to translate, it produces
enough structure and content to **generate an entire phrasebook in one guided flow**, with the
learner steering via a couple of quick choices rather than curating card-by-card.

The endpoint is used in **two calls** against the same route, distinguished by whether the request
carries a `context` field:

1. **Without `context`** — given the topic (+ language + ability), the model proposes: a set of
   **dynamic clarifying questions** (each with a label and a small set of options, one marked
   default) that narrow the topic to the learner's actual situation, and a **checklist** of
   candidate sub-goals/sections for the eventual phrasebook, some pre-checked. Nothing is
   generated or saved yet.
2. **With `context`** — given the topic (+ language + ability) **and** the learner's answers to
   call 1's questions plus which checklist items they left checked, the model **bulk-generates**
   the full phrasebook content: themed groups of cards covering the checked checklist items and
   organized around the arc of the situation, plus a short example conversation, ready to commit
   as a brand-new phrasebook with no further curation.

The two calls share one endpoint and one request/response envelope shape (see Inputs/Outputs)
rather than being two separate routes, per an explicit design decision: the caller doesn't have to
remember two URLs, and the presence of `context` alone is sufficient to disambiguate intent.

## Design principles

Three principles govern `/textbook` generation and rank above any individual formatting rule:

- **(0) Meaningful, put-to-work language — teacher, not dictionary, but the situation's own vocabulary IS the lesson.** Every card must be language the learner can deploy in the actual situation: a line they would say, a line they would HEAR and must understand (a real encounter is two-sided — teach the other person's questions and the answers to the learner's own questions, not only the learner's half), or a word they would genuinely say, hear, point at, or choose between in the moment. The transactional nouns and adjectives specific to the situation (fiber types and yarn weights in a yarn shop; symptoms in a clinic) are core content — taught as compact `type:"word"` vocabulary cards plus a reusable frame, never expanded into one near-duplicate sentence per word. What gets cut is only encyclopedic or theory vocabulary the learner would never actually say or hear (obscure anatomy, "musicality", "connection"); the test is "would the learner say or hear this in the room?", not "is it about the topic?".
- **(1) Fast and consistent.** One model call per stage, the same p50 <4s / 15s-timeout / 502-on-failure posture as `/lookup`, and a prompt shared verbatim across backends. Latency and determinism outrank breadth.
- **(2) The thinnest possible output schema.** New richness is proven before it is promoted: experiment with it as a JSON blob inside a card's `notes` field first, and promote it to a first-class schema field only once it has earned its place. The example-conversation group (below) is a live instance — per-turn speaker rides in `notes` as `{"speaker":"…"}`, not as a new schema shape.

---

## Inputs

| Param | Required | Values | Default | Effect |
|---|---|---|---|---|
| `topic` | yes | — | — | The topic, situation, or scenario to build a phrasebook around. Max 200 characters. Broader than `/lookup`'s `term` — a phrase, scenario, or activity, not necessarily a single translatable word. |
| `language` | yes | `zh` \| `ja` \| `es` \| `cs` | — | Target language. Sets every generated card's `lang`, same as `/lookup`. |
| `ability` | no | `none` \| `beginner` \| `intermediate` \| `advanced` | `beginner` | Same semantics as `/lookup`'s `ability` — caps difficulty, never changes intent. |
| `context` | no | JSON object | — (absent) | **Presence, not shape, selects the call mode.** Absent → call 1 (return questions + checklist). Present → call 2 (bulk-generate). Treated as an opaque blob echoing whatever call 1 returned plus the learner's answers/selections — see Internal flow. |
| `llm` | no | `google` \| `claude` \| `chatgpt` | `google` | Same as `/lookup` — which model backend generates the response. |

Unlike `/lookup`, there is **no `formality`/`audience` (VIBE) input** — the Textbook flow does not
surface VIBE at all (see `docs/journeys.md` Journey 5); tone is inferred by the model from `topic`
and the context answers themselves (e.g. a "salsa scene" or "role" answer implicitly carries
register information the way `/lookup`'s explicit `formality`/`audience` inputs do directly).

### `context` shape (call 2 only)

Not a fixed schema — call 1's `questions` response defines the *shape* of what call 2's `context`
should echo back. Conceptually:

```json
{
  "answers": { "<question label>": "<chosen option>", "...": "..." },
  "checklist": ["<checked item label>", "..."]
}
```

The service does not validate individual keys inside `context` beyond confirming it is a JSON
object — it is passed to the model largely as-is, re-embedded into the generate prompt. This
mirrors the client's own posture toward it: opaque state carried from call 1's response to call 2,
discarded afterward (see `docs/journeys.md` Journey 5 "Save model").

---

## Outputs

### Call 1 response — questions + checklist

```json
{
  "questions": [
    { "label": "string", "options": ["string", "..."], "default": "string" }
  ],
  "checklist": [
    { "label": "string", "checked": true }
  ],
  "usage": { "model": "string", "inputTokens": 0, "outputTokens": 0, "totalTokens": 0, "costUsd": null }
}
```

- `questions` — an array of **dynamically authored** clarifying questions, each a label (e.g.
  "Salsa scene") plus a small set of plausible options (e.g. "Latin America (neutral)", "Cuban
  style", …) and a `default` (must be one of `options`). The **count and content are entirely
  topic-driven** — no fixed field list (contrast `/lookup`'s fixed `ability`/`formality`/
  `audience` inputs). **Cap: at most 6 questions** (bounds the context-answer surface and output
  size; a topic needing more than 6 distinguishing axes should be split into a narrower topic by
  the learner).
- `checklist` — an array of candidate phrasebook sections, each a short label naming a
  communicative goal in the situation's arc, plus a `checked` default (the model's guess at which
  goals are most likely wanted). A checked item is an intent to COVER, not a literal group title —
  generation may rename, merge, split, or resequence to follow the encounter's arc. **Cap: at most
  8 items** (mirrors `/lookup`'s `MAX_GROUPS_TOTAL`).

### Call 2 response — generated phrasebook content

```json
{
  "title": "string",          // concise, one-line phrasebook name (service-clamped ≤ 60 chars)
  "groups": TextbookGroup[],
  "usage": { "model": "string", "inputTokens": 0, "outputTokens": 0, "totalTokens": 0, "costUsd": null }
}
```

Where each `TextbookGroup` is:

```json
{
  "title": "string",       // English section heading naming its moment in the encounter
  "cards": Card[]           // cards for this section
}
```

- **top-level `title`** — a concise, one-line name for the whole phrasebook, biased toward 2–4
  words in Title Case and capping the whole situation in a single glance (topic "talking to a
  doctor about my annual physical" → "Annual Physical Visit"), used as the created phrasebook's
  name. Model-produced (the "name the phrasebook" prompt step), **soft**: a missing or blank
  title is not a `502` — the client falls back to the raw topic; an over-length title is clamped
  to 60 characters, not rejected. Distinct from each group's own `title` (a section heading).
- **example-conversation group** — the final group, titled "Example conversation", is a prototype
  addition: its cards are the turns of a short realistic exchange (in order), built only from
  language already present in the other groups. It must be a genuine **two-sided** exchange —
  information flows both ways, each turn advances the conversation, and speakers alternate rather
  than one side restating the same point across several turns. Each turn card carries its speaker
  as a JSON blob in `notes` (`{"speaker":"you"}` / `{"speaker":"partner"}`) — an experiment staged
  in `notes` per Design principle 2, not a promoted schema field. It counts against the group cap
  and comes last.

No top-level "blocks"/disambiguation concept, unlike `/lookup` — the topic isn't being
disambiguated into meanings, it's being expanded into sections. Every `Card` is shaped exactly per
**`docs/CARD_SCHEMA.md`**, identical to `/lookup`'s card shape (reuses the same reading-token
rules, `formality`/`definition`/`notes` semantics, gender-collapse rule for `es`/`cs`). Unlike
`/lookup`, `/textbook` **does emit `type`** (`"word"` | `"phrase"`) on every card so the client can
render a vocabulary group distinctly from a phrase group; `formality` is tagged only when the word
has a register-varying alternative worth contrasting, never merely because a sentence is polite.

**Limits:** **at most 8 groups total** (mirrors `/lookup`'s `MAX_GROUPS_TOTAL`) — the themed groups
plus the single example-conversation group share this budget, so themed groups run to at most 7.
**At most 15 cards per group**, same ceiling as `/lookup`'s `MAX_CARDS_PER_GROUP`. No hard minimum.
Groups are **not** one-per-checklist-item: generation organizes around the encounter's arc and may
reshape the checked items into fewer, merged, or differently-named groups (see Model behavior).

---

## Internal flow

Same **service → model → service** shape as `/lookup`, branching once on whether `context` is
present:

```
topic + options (+ context?)
     │
     │  ┌─────────────────────────────────────────────┐
     └─▶│ 1. PARSE (service)                          │
        │    validate options, apply defaults         │
        │    branch on presence of `context`           │
        └───────────────────┬─────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
   context ABSENT                 context PRESENT
   (call 1)                       (call 2)
              │                           │
        ┌─────▼─────────┐         ┌───────▼─────────┐
        │ 2a. GENERATE   │         │ 2b. GENERATE     │
        │ QUESTIONS       │         │ PHRASEBOOK        │
        │ (model)         │         │ (model)           │
        │ questions +     │         │ one group per     │
        │ checklist       │         │ checked item       │
        └─────┬─────────┘         └───────┬─────────┘
              │                           │
        ┌─────▼─────────┐         ┌───────▼─────────┐
        │ 3a. FINISH     │         │ 3b. FINISH       │
        │ validate shape,│         │ validate shape,   │
        │ apply caps     │         │ apply caps,        │
        │                │         │ set card.context   │
        └─────┬─────────┘         └───────┬─────────┘
              │                           │
   { questions, checklist }      { groups: [...] }
```

### 1. Parse `[service]`

Validate `topic` (required, ≤200 chars) and `language` (required, enum) exactly as `/lookup`
validates `term`/`language`. Apply the `ability` default. Determine call mode from whether
`context` is present and is a JSON object (not a string, not an array) — reject a malformed
`context` with a `400` before any model call, same posture as `/lookup`'s early-reject rule.

### 2a. Generate questions `[model]` — call 1, one call

One prompt turns `{ topic, language, ability }` into the `{ questions, checklist }` JSON. Reuses
`/lookup`'s content-quality-bar language (conversational, not textbook-stiff — the irony of the
endpoint's own name is intentional; "Textbook" names the *feature* the learner sees, not the
prompt's register) since both are explicitly meant to read the same way.

**Latency/token budget:** smaller than call 2 — this call returns short label/option strings, not
card content. Target the same p50 <4s / 15s timeout / 502-on-failure posture as `/lookup` for
consistency; exact `maxOutputTokens` sized generously for ≤6 questions × ≤6 options + ≤8 checklist
items (a few hundred tokens of headroom is ample, nowhere near `/lookup`'s card-heavy budget).

### 2b. Generate phrasebook `[model]` — call 2, one call

One prompt turns `{ topic, language, ability, context }` into `{ groups }` — conceptually "the
groups you'd get from one broad `/lookup` call on the topic, but directed by which checklist items
were checked and biased by the context answers," rather than disambiguation-driven blocks. Reuses
`/lookup`'s reading-token instructions, gender-collapse rule, and card-schema JSON block verbatim
(same `Card` shape, same rules — see `docs/CARD_SCHEMA.md`).

**Token budget:** worst case 8 groups × 15 cards = 120 cards, comparable to `/lookup`'s own worst
case (124 cards). Use the shared 30000 ceiling for Google, with the provider-specific ceilings
described above (8192 for Claude Haiku, 16384 for GPT-5.6 Luna), plus the same 15s timeout / 502
posture.

### 3a/3b. Finish `[service]`

Deterministic post-processing, no model, mirroring `/lookup`'s Finish step:
- **Validate** the response shape for whichever call mode ran; malformed/truncated → `502`.
- **Normalize Japanese readings** — identical rule to `/lookup` (reuse, don't reimplement).
- **Check limits** — call 1: ≤6 questions, ≤8 checklist items; call 2: ≤8 groups, ≤15 cards/group.
  Same trim-from-the-end-in-model-order posture as `/lookup` when the model over-produces.
- **Set `context`** (call 2 only) — each card's `context` field is set to its group's `title`,
  identical mechanism to `/lookup`'s group-card `context`-setting. This is what lets the finished
  phrasebook reuse the existing section-header rendering with no client-side rendering changes
  (see `docs/journeys.md` Journey 5, step 8).
- **Attach usage** — same `usage` block as `/lookup` (provider token counts + estimated `costUsd`).
- **Bundle** into `{ questions, checklist, usage }` or `{ groups: [...], usage }` depending on call mode.

---

## Model behavior

Shared prompt-writing posture with `/lookup`: same three-backend (`google`/`claude`/`chatgpt`)
requirement that the prompt not special-case any backend; same eval-harness-catches-drift stance
rather than runtime enforcement of exact conversational quality.

**Call 1 (questions + checklist).** Read the topic and infer the axes that would meaningfully
change what phrasebook content gets generated — not generic demographic questions, but the ones
this *specific* topic actually turns on (a dance topic turns on role/lead-follow and scene/style; a
family-dinner topic would turn on relationship-to-host and dietary needs instead). Each question's
`options` should be short, mutually exclusive, and genuinely different in downstream effect — not
padding. The checklist should read as concrete, learner-recognizable communicative goals mapped to
the situation's arc ("Ask someone to dance & the etiquette"), not vague or dictionary-style labels
("Dancing", "Dance vocabulary"), and should default-check the items that carry the interaction
itself — the opening/approach and core exchange — leaving clearly-secondary items unchecked.

**Call 2 (bulk generate).** Governed by the **Design principles** above — principle (0)
(teacher-not-dictionary, but the situation's transactional vocabulary is the lesson) is the
operative bar. Keep `/lookup`'s conversational quality bar (never stiff/textbook/exam-flavored — the
irony of the feature's own name is intentional and does not relax it). Every card must be language
the learner would actually say, hear, or use in the moment: teach **both voices** (the lines the
learner hears and must follow, including answers to their own questions — not only their half), teach
the situation's real vocabulary as compact `type:"word"` cards plus reusable frames (not one
near-duplicate sentence per word), and cut only glossary-style vocabulary that merely describes the
topic. `ability` is a **floor as well as a ceiling** — do not re-teach greetings/courtesy the learner
at that level already owns; spend the freed budget on the situation's real vocabulary and nuance.
Organize groups around the **arc of the encounter** (opening/approach → core interaction → wrap-up →
recovery) rather than emitting one verbatim-titled group per checklist item: the checked items
define the intent to cover, and generation may rename, merge, split, reorder, and add connective
groups (opening small-talk, "when you get lost") the checklist omitted. Finish with one
**example-conversation group** (see Outputs) that replays the chapter's key lines as a genuine
two-sided dialogue — information flowing both ways, speakers alternating — built only from language
already introduced (including the heard lines taught for the other speaker); it is the highest-value
artifact for the learner and, per Design principle (2), a prototype staged via the card `notes` field.

**Output.** Both calls return raw JSON, no code fences, no prose — identical output-format rule to
`/lookup`.

---

## Examples

### 1. Call 1 — "salsa dancing" → questions + checklist

Input: `{ "topic": "salsa dancing", "language": "es", "ability": "beginner" }`

```json
{
  "questions": [
    { "label": "Salsa scene", "options": ["Latin America (neutral)", "Cuban style", "LA style", "New York style"], "default": "Latin America (neutral)" },
    { "label": "Main setting", "options": ["Social dancing at a club / social", "A class / lesson", "A festival or congress"], "default": "Social dancing at a club / social" },
    { "label": "Your role & gender", "options": ["Man, leading", "Woman, following", "Either role"], "default": "Man, leading" },
    { "label": "Your Spanish level", "options": ["Near-zero / survival", "Basic phrases", "Conversational"], "default": "Near-zero / survival" }
  ],
  "checklist": [
    { "label": "Ask someone to dance & the etiquette", "checked": true },
    { "label": "Communicate on the floor (lead/follow, restart)", "checked": false },
    { "label": "Compliments & thanks after a dance", "checked": false },
    { "label": "Dance/step vocabulary", "checked": false }
  ]
}
```

### 2. Call 2 — generating from the checked items

Input:
```json
{
  "topic": "salsa dancing",
  "language": "es",
  "ability": "beginner",
  "context": {
    "answers": {
      "Salsa scene": "Latin America (neutral)",
      "Main setting": "Social dancing at a club / social",
      "Your role & gender": "Man, leading",
      "Your Spanish level": "Near-zero / survival"
    },
    "checklist": ["Ask someone to dance & the etiquette", "Dance/step vocabulary"]
  }
}
```

```
title: "Salsa Social Dancing"

Group "Ask someone to dance & the etiquette"
  ¿Bailas? — Wanna dance?
  ¿Quieres bailar? — Would you like to dance?
  Con permiso — Excuse me / pardon (asking to cut in)
  Gracias por el baile — Thanks for the dance

Group "Dance/step vocabulary"
  el paso — the step
  girar — to turn/spin
  el guía / la guía — the leader
  seguir — to follow
```

The checked items ("Ask someone to dance & the etiquette", "Dance/step vocabulary") set the intent
to cover; generation organizes around the encounter's arc rather than emitting one verbatim-titled
group per item, and appends an "Example conversation" group (omitted here for brevity) that replays
these lines as a short dialogue. The checklist remains the learner's control surface for *what gets
covered* (see `docs/journeys.md` Journey 5, step 6), not a rigid group outline.

---
## Learnings & proposed direction (office-hours, 2026-08-31)

> **Status: direction to explore, not a settled contract.** Captured after prototype testing
> showed `/textbook` "works pretty well." These amend the `/textbook` design above; sketch and
> validate on real output before promoting into the Inputs/Outputs contract. Full record:
> `docs/designs/prep-pivot-and-phrasebook-expansion.md`.

**1. Drop `ability` from initial generation (call 2).** Testing showed the highest-value output
is level-invariant — key phrases, the example conversation, and context-specific vocabulary. In
practice `beginner` over-produces already-known basics (はい/いいえ, "hello", "thank you") and
`intermediate` over-complexifies into less broadly-useful sentences. The floor-as-ceiling rule
(Design principle 0, Model behavior) is not enough on its own. Proposed: initial generation
takes **no `ability`**, assumes courtesy/basics are owned unless the topic explicitly needs
them, and spends the whole budget on the situation's real vocabulary + the two-sided
conversation. `ability`/difficulty moves to the expansion call below.

**2. New call mode — scoped expansion.** Growing a phrasebook is one primitive, "give me more,
here," with the anchor selecting scope and where results land (reusing the `context`
auto-filing that already backs generation):

- **group anchor** — generate one bounded batch of additional cards for an existing group,
  deduped against the phrasebook's current cards; results carry that group's `title` as `context`.
- **phrasebook anchor** — generate a new section (new `context`); the client offers a
  freshly-anticipated menu of candidate sections (derived from current content) plus a typing
  fallback for a specific ask.
- **card anchor (decompose)** — break one phrase card into its component words + grammar;
  output lands in the source card's `notes`, and component words worth studying are emitted as
  new `type:"word"` cards (auto-filed). This is *decomposition*, not lateral new language.

Request shape (sketch): `{ topic, language, anchor, existingContent, suppress?, difficulty? }`
where `existingContent` drives dedup and `difficulty` is an optional per-expansion nudge
(easier / more advanced) — the on-demand replacement for the removed up-front `ability`.

**3. Retain the unchecked checklist as a *suppression set*, not a menu.** Amends the "discard
all creation state" decision (Outputs / `docs/journeys.md` J5 Save model): call-1 checklist
items the user left **unchecked are a negative signal** (declined interest). Retain their labels
on the phrasebook and pass them as `suppress` so expansion never re-offers what was rejected.
Do **not** offer unchecked items back as an expansion menu.

**4. No whole-chapter regenerate / full editability.** Expansion is bounded and opinionated;
there is no reroll (a weak result is simply left un-starred). This keeps the "Regenerate / undo"
item in **Deferred** as-is — out of scope by product decision, not merely unbuilt.


## What this reuses from `/lookup`

Per the project's own "don't rebuild what exists" posture (see `/lookup`'s own "What already
exists" table):

| Existing (from `/lookup`) | Reuse in `/textbook` |
|---|---|
| `api/src/index.js` router + CORS/method handling | add one `/textbook` route; same 204/405/404 behavior |
| `api/src/llms/*.js` + `LLM_REGISTRY` | backend calls unchanged, same explicit `maxOutputTokens` requirement |
| `api/src/card-validate.js` | reused as-is for every card in every `/textbook` group |
| `lookup-prompt.js`'s `readingInstructions`/`cardReadingExample`/`genderInstruction` + card-schema JSON block | imported/shared, not duplicated, into `textbook-prompt.js` |

## Deferred (build only when earned / needed)

Same deferred list and same rationale as `/lookup`'s own Appendix — `/textbook` is not held to a
stricter bar for a branch exploration:

- **Auth / rate limiting** — unauthenticated and unlimited, same single-tenant prototype posture.
- **Caching / determinism** — fresh-each-time, no cache.
- **Client-facing streaming** — call 2's bulk generation is a plausible future streaming candidate
  (stream groups as they complete) but not built now, same "revisit only if latency is bad" stance
  as `/lookup`'s deferred streaming note.
- **Fan-out (planner + parallel fillers)** — call 2 is architecturally similar to `/lookup`'s v0
  mono-call; the same earned-not-default posture applies (`docs/FANOUT_DESIGN.md`'s design would
  need extending to cover a checklist-driven group set, not built here).
- **Regenerate / undo** — explicitly out of scope by product decision, not just deferred: once
  generation completes, the context Q&A/checklist state is discarded, not just unbuilt-for-now.

---

# Appendix

## What this replaces

The legacy API (`api/`) has two endpoints that do not match this design and whose premise (blind,
context-free generation) is known to have failed:

- `POST /translate` → flat `translations[]`, disambiguation only.
- `POST /generate-cards` → flat `cards[]` from a freeform topic.

They have **4 live callers**, all in throwaway prototype clients: `web/app/src/components/{translation-panel.js,
generate-cards-panel.js}` and `ios/Loudmouth/Screens/{Translation/TranslationView.swift,
GenerateCards/GenerateCardsView.swift}`. **Hard cutover is intentional** — the clients are disposable
prototypes; they get rebuilt against `/lookup`, and the two legacy endpoints are retired when `/lookup`
ships. No coexistence window.

## What already exists (reused, not rebuilt)

| Existing | Reuse in `/lookup` |
|---|---|
| `api/src/index.js` router + CORS/method handling | add one `/lookup` route; same 204/405/404 behavior |
| `api/src/llms/*.js` + `LLM_REGISTRY` | backend calls unchanged (must pass an explicit `maxOutputTokens`) |
| `cards-validate.js` per-card checks + `validateReadingTokens` | extracted to `card-validate.js`, shared with `/lookup` |
| `cards-prompt.js` per-language reading-token instructions | reuse the instruction text in the lookup prompt |

## Deferred (build only when earned / needed)

- **Auth / rate limiting** — `/lookup` is unauthenticated and unlimited; each request is one paid LLM
  call, and the caller picks `llm` per-request (no operator-side allowlist/default), so cost-abuse
  includes routing to the most expensive backend, not just request volume. Not needed to prototype
  (single-tenant use); required before any multi-tenant or public exposure.
- **Planner + parallel fillers fan-out** — the earned latency/quality optimization: split the one model
  call into a planner (blocks + group skeleton) and N parallel fillers (cards per group), assembled by
  index. Build **only if** v0's measured latency or quality is unacceptable. Full design in
  [`docs/FANOUT_DESIGN.md`](./FANOUT_DESIGN.md).
- **Caching / determinism** — currently fresh-each-time. A cache keyed on the normalized request would
  win on repeats; needs a pinned temperature. Not needed to prototype.
- **Client-facing streaming** — stream the first block ahead of the rest (matches the Figma top-first
  skeleton). Revisit only if latency is bad even after the fan-out.
- **Runtime reading-correctness check** — `reading` tokens are validated for shape, not phonetic
  correctness (a wrong tone passes). Guarded by the golden-set eval, not a request-time check. A
  pinyin/dictionary verifier is possible later but too heavy for the prototype.
- **Client re-search seed rule** — building the next `term` from a card's `definition`/`context` on the
  🔍 mechanic is client behavior; it belongs in the UX/journey docs, not this contract.
- **Suggested-phrasebook generation, additional languages** — generate seed phrasebooks per
  `{language, ability}` via the same path; add languages beyond zh/ja/es/cs (per-language reading
  instructions are the work).
- **Content-safety / vulgar-content policy** — no floor exists today beyond model discretion under
  `casual` formality (see `ability`); acceptable for single-tenant prototype, needed before any
  `audience: family`/`stranger` traffic beyond internal testing.
- **Golden-set coverage strategy** — 4 languages × 4 `ability` × 3 `formality` × 4 `audience` × 3 `llm` =
  576 input combinations; the golden-set eval (T4) samples a representative subset per axis, not the full
  cross-product. Not needed to prototype; revisit sampling strategy if production surfaces a
  combination-specific quality gap the golden set didn't catch.
- **Production quality-drift monitoring** — the golden-set eval is a pre-deploy manual gate; nothing
  detects quality regression from the three backends' own model updates over time. Not needed to
  prototype; revisit once `/lookup` has real production traffic.

## Implementation tasks

> **Code-drift note.** T0–T2 were built against an earlier draft of this contract and are **out of sync**
> with the restructured design: the code still has the old `formality` enum (`textbook`), the removed
> `sense` field, a `<3`-card drop (now drop-**empty** only), and no per-card `formality`/`vulgar` or
> words-mixed grouping. Treat T0–T2 as "first pass landed," not "done" — **T3 reconciles the code to
> this doc** as it adds the test suite. Statuses below reflect that.

- [~] **T0** — extract `validateCard` + `validateReadingTokens` into `src/card-validate.js`; refactor
  `cards-validate.js` to import it. *(Landed; still valid — the shared card validator stands. Add
  `formality` enum validation when T3 runs.)*
- [~] **T1** — build the lookup prompt, response validator, `src/lookup.js` handler (parse `term` on
  first `(`, one LLM call, validate, apply limits, set `context`), and the `/lookup` route.
  *(Landed against the old contract; reconcile in T3: drop `sense`, new `formality` values, drop-empty
  not `<3`, per-card `formality`, theme grouping, respond-directly prompt rule.)*
- [~] **T2** — pass an explicit `maxOutputTokens` on the lookup call (the wrapper defaults to 1024 →
  truncation → 502). *(Landed.)*
- [ ] **T3** — reconcile the code to this doc **and** add a `node:test` suite (LLM mocked), with a `test`
  script. Cover the paths in **Test coverage** below; the CRITICAL ones are must-pass.
- [ ] **T4** — eval harness (`evals/lookup.eval.js`): structural invariants (limits, no near-duplicates,
  valid schema) + reading-correctness on a golden set + an LLM-judge on the conversational bar.
- [ ] **T5** — rebuild web + iOS against `/lookup`; delete `/translate` + `/generate-cards`.

## Test coverage

`api/` has no test infra yet (no framework, no `test` script, no test files). T3 adds a `node:test`
suite (stdlib, no deps) with the LLM mocked, plus the T4 eval harness.

```
UNIT (LLM mocked)                                              NOTE
parse term
  · "dinner"            → context ""
  · "surf (v...)"       → context "v. to ride a wave"
  · "a (b) (c)"         → 2nd "(" ignored, ")" trimmed         edge
  · "(only context)"    → 400 (no term before "(")
  · "surf (v. to ride"  → context "v. to ride" (no closing ")") edge
  · term > 200 chars     → 400
handler
  · LLM throws          → 502 "LLM request failed"
  · LLM times out        → 502 "LLM request failed" (distinct path from throw) CRITICAL (timeout budget)
  · truncated JSON      → 502 "Invalid response"              CRITICAL (max_tokens trap)
  · happy path          → valid { blocks }
validate + finish
  · = 4 blocks          → no trim (boundary)                  edge
  · > 4 blocks          → trimmed to 4, keeps first 4          CRITICAL (shared budget, trim order)
  · = 8 groups total    → no trim (boundary)                  edge
  · > 8 groups total    → trimmed to 8, keeps first 8 in order CRITICAL (shared budget, trim order)
  · = 15 cards/group    → no trim (boundary)                  edge
  · > 15 cards/group    → trimmed to 15, keeps first 15        CRITICAL (trim order)
  · empty group         → dropped (no other minimum)
  · context service-set → card.context = group.title         CRITICAL (service adds, model doesn't)
  · bad formality value → rejected / stripped
  · invalid card        → per-field guard → 502
route
  · missing term / language / bad enum → 400
  · unknown llm         → 400

EVAL (real model — mechanical asserts + LLM-judge)
  · structural: ≤4 blocks, ≤8 groups, ≤15 cards, no near-duplicate cards, valid schema
  · reading correctness: golden set of known words → tokens match known-correct readings
  · conversational bar: LLM-judge "would a person say this to someone they want to connect with?"
```

**Known gap:** reading-token *correctness* has no runtime guard (shape only) — a phonetically wrong
reading is silent and user-visible. The golden-set eval is the mitigation; it must run pre-deploy.


---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | not run standalone this pass (ran as outside voice inside this eng review instead — see below) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | CLEAR | 21 issues (8 internal pass + 13 outside voice); 20 resolved via direct doc edits/notes, 1 kept as-is by explicit user decision (mono-vs-fanout re-litigation); 0 new critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | not run (backend contract) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | not run |

- **OUTSIDE VOICE:** Codex CLI failed to spawn again (vendored binary ENOENT, same failure as the prior
  review on this doc); fell back to a Claude subagent (`scout`), which surfaced 13 net-new findings the
  internal pass missed: no content-safety/vulgar policy, prompt-cognitive-load-vs-backend-capability risk,
  unspecified `maxOutputTokens` derivation, no truncation signal, `ability: none` ordinal-scale ambiguity,
  a `formality`/`slang` spillover contradiction, per-backend `llm` cost-abuse amplification, no operator
  `llm` allowlist, unspecified group-title language, unspecified nested-paren handling, a 576-combination
  eval-coverage gap, no production quality-drift monitoring, and a Goal-copy/stateless-contract positioning
  mismatch. All 13 were presented to the user: 9 landed as direct doc edits, 2 landed as new Appendix
  Deferred bullets, 1 folded into an existing Deferred bullet, and 1 (mono-vs-fanout re-litigation) was
  explicitly kept as documented, no edit.
- **CROSS-MODEL TENSION:** Outside voice questioned the mono-call v0 architecture (one call doing 5
  cognitive tasks — disambiguate, translate-intent, cluster-by-theme, soft-register-bias, per-card
  formality — across 3 backends of uneven capability, with only a post-hoc eval catching failures) against
  the user's already-settled mono-first/fan-out-earned decision from the prior review. User kept the
  settled decision as-is; no change to the architecture.
- **VERDICT:** ENG CLEARED — this document review, code-blind per user instruction (repo code is known
  stale relative to this contract and was not consulted). Design/CEO/DX not required for a backend
  contract. Supersedes the prior report on this file, which reviewed an earlier draft.

NO UNRESOLVED DECISIONS
