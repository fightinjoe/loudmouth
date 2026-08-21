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

The response is an object with one key (an object, not a bare array, to leave room for future
telemetry):

```
{ "blocks": TranslationBlock[] }
```

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

**limits:** at most **8 groups total** across all blocks (they share the budget); at most **10 cards per
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

**Latency budget:** target p50 < 4s, request timeout at 15s → `502` (same "LLM request failed" path as
a hard error — see **Test coverage**). Fan-out (below) is earned when measured p50 exceeds this budget
under real load, not before.

**Output token budget:** worst case is 4 blocks + 8 groups × 10 cards = 84 cards; at ~150 tokens/card
(JSON structure + multi-byte text/reading tokens) that's ~12.6k tokens of card content plus block/group
wrapper overhead. Set `maxOutputTokens` to 20000 for headroom — the three worked examples average far
fewer cards, so this is a ceiling, not a typical size. Same truncation → `502` path as the T2 fix (see
Test coverage).

> v0 does this in a single call. A deferred optimization splits it into a planner + parallel fillers
> (appendix / `docs/FANOUT_DESIGN.md`); the service steps are unchanged by that.

### 3. Finish `[service]`

Deterministic post-processing, no model:
- **Validate** the response shape; a malformed or truncated response is a `502`.
- **Normalize Japanese readings** — kana and katakana never receive ruby annotations, and adjacent unannotated Japanese reading tokens are merged so model tokenization cannot produce per-character kana ruby output.
- **Check limits** — verify (and trip) ≤4 blocks, ≤8 groups total, ≤10 cards per group. These caps are
  also stated directly in the prompt (see **Model behavior**), so trimming here is a backstop for
  non-compliant model output, not the primary limiting mechanism — trimming is exceptional, not expected
  in normal operation, and no `truncated` flag is exposed to callers. When it does trigger, trimming
  keeps items in the model's returned order and drops from the end (block 5+ dropped; within a block,
  group 9+ dropped; within a group, card 11+ dropped) — consistent with disambiguation already ordering
  blocks by relevance.
- **Set `context`** — the input parenthetical on each block card; the group `title` on each group card.
- **Bundle** into `{ blocks: [...] }`.

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
(at most 8 total across all blocks; ≤10 cards each). Broad topics should generally produce 3–5 distinct
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
  · = 10 cards/group    → no trim (boundary)                  edge
  · > 10 cards/group    → trimmed to 10, keeps first 10        CRITICAL (trim order)
  · empty group         → dropped (no other minimum)
  · context service-set → card.context = group.title         CRITICAL (service adds, model doesn't)
  · bad formality value → rejected / stripped
  · invalid card        → per-field guard → 502
route
  · missing term / language / bad enum → 400
  · unknown llm         → 400

EVAL (real model — mechanical asserts + LLM-judge)
  · structural: ≤4 blocks, ≤8 groups, ≤10 cards, no near-duplicate cards, valid schema
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
