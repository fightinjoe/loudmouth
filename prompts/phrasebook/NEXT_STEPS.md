# /phrasebook — implementation status and remaining work

State as of 2026-09-13: **prompt development is complete.** Generation prompt
(`prompt.txt`) and translation prompt (`translate/prompt.txt` + reading-rules
injections) are ACCEPTED; baselines, lessons, and rulings are in `NOTES.md` and
`translate/NOTES.md`. Backend decision is evidence-backed: `gemini-3.5-flash-lite`
(see `comparisons/luna/NOTES.md`; Luna is 7–15× slower, ~2× cost). Measured pipeline:
~2.6–3.3s end to end vs the <10s target. **Service implementation and web-client
migration are complete locally; production deployment has not been performed.**
The public contract is now in `docs/API_DESIGN.md`.

## 1. Implemented `/phrasebook` endpoint

Request (client state from `/context`, per `inputs/` fixture shape + required
`ability`; the client currently sends the literal `"basics"`):

```json
{ "seed": "...", "language": "es|ja|zh|cs",
  "ability": "none|basics|conversational",
  "answers": { "<question>": "<answer>" },
  "checklist": ["<selected topic>", "<selected topic>"] }
```

Execution: 1 generation call (English conversations, each with its own `vocab`),
then N parallel translation calls (one per conversation), assemble
**by index, never by title text**. Response: `{ title, groups, usage }`, with one
conversation group per selected topic and a final pooled `vocab` group. Cards have
`text` = target language, `translation` = English line, `reading` from inline ruby,
speaker/alternative metadata in JSON-string `notes`, and service-set `context` =
originating topic title (including vocabulary).

The learner selects 1–8 topics. `ability` has no API default. Backend selection
is server-only: `LLM_BACKEND=gemini-3.5-flash-lite` by default; `google` is not an
alias, and client `llm` fields are rejected. `/context` retains `{ seed, language }`
and first-option defaults. The web client uses the new flat request structure,
without creation-UI changes; iOS has no `/textbook` caller to migrate.

Implemented service obligations (rationale in `NOTES.md` §"Service-owed work"):

1. Per-chunk validation: `lines`/`vocab` counts match input; retry the chunk once on
   mismatch or JSON parse failure; 502 only after.
2. Ruby normalization: parse `base[reading]` (base = kanji/hanzi run) into
   ReadingToken pairs; strip any bracket group not preceded by such a run.
3. 429 backoff; API Gateway deadline must stay above total worst-case (gen retry +
   chunk retry).
4. Vocab: pool per-conversation lists, dedup by English word (keep first), cap.
5. ja `romanization` via mechanical kana→rōmaji from the inline readings.
6. `notes.source` on drawn vocab cards = the translated target-language line at
   the matched English source index. Exact/common inflected English forms are
   matched within the originating conversation; no source is invented for unmatched
   expansion words.
7. Reading-rules injection mirrors the runners: `translate/reading_rules_<lang>.txt`
   content into `{{READING_RULES}}`, empty string for es/cs.
8. Deployed prompt copies must stay byte-identical to `prompt.txt` /
   `translate/prompt.txt` (+ reading rules) — verify with `diff`.

Reference implementations of the whole flow: `runners/run_translate.py` (chunking,
parallelism, retries, pooling, ruby parsing) and `runners/run_generate.py`.

Verification: all four languages generated successfully through the real local API.
Three-topic calls measured approximately 3.1–5.7 seconds; one Japanese topic 2.6s,
eight Czech topics 7.7s. Browser creation, error/retry, conversation and vocabulary
rendering were exercised. Accepted prompt copies passed `diff`.
Interleaved alternatives are preserved per the accepted notes, not rejected for
having the other speaker's line between them. Source-line and retry/order/cancellation
regressions are covered in `api/src/test/phrasebook.test.js`.

## 2. `/context` revision (separate track, own prompt loop in `prompts/context/`)

- Make setup ability-aware in its own prompt loop when needed. The current client
  supplies `ability: "basics"` directly to `/phrasebook`; `/context` does not forward
  requests or hold session state.
- Stop emitting repair-style checklist topics ("Ask to repeat or slow down") once
  preset packs exist; until then `/phrasebook` handles them gracefully (topic
  overrides the repair ban — verified).
- Preset phrase packs: server-static content, API decides inclusion; first packs
  "Making sure you understand", "Attention and introductions", "Exclamations".
  Vocab packs (numbers, colors — words not phrases) are a later, separate concept.

## 3. Design backlog / watch items

- **"pura vida" watch (English-first ceiling):** target-language idioms only surface
  when an English line invites them. If translation quality reviews keep missing
  wanted idioms, revisit: let translation add a bonus local-idiom line, or test
  target-language-first generation (user hypothesis: English is homonym-heavier).
- Cross-chunk register variance (voseo/tuteo in one seed): candidate fix = derive a
  one-line style hint once, inject into every translate chunk.
- cs vocab lemma choice (levý vs the learner-useful doleva) — Luna chose better here;
  possible rule tweak "prefer the form used in the lines" for closed-class direction
  words.
- Vocab example phrases on cards: API attaches source line free for drawn words;
  prompt supplies examples only for expansion words (not built yet).
- `sick` fixture nits: off-topic opener once, allergic/allergy near-dupe.
- `/textbook` + `/lookup` + `docs/FANOUT_DESIGN.md` are historical artifacts to be
  replaced by this work once the endpoint ships.
