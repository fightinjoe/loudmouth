# /phrasebook — endpoint build handoff

State as of 2026-09-13: **prompt development is complete.** Generation prompt
(`prompt.txt`) and translation prompt (`translate/prompt.txt` + reading-rules
injections) are ACCEPTED; baselines, lessons, and rulings are in `NOTES.md` and
`translate/NOTES.md`. Backend decision is evidence-backed: `gemini-3.5-flash-lite`
(see `comparisons/luna/NOTES.md`; Luna is 7–15× slower, ~2× cost). Measured pipeline:
~2.6–3.3s end to end vs the <10s target. What remains is service code and one
`/context` revision.

## 1. Build the `/phrasebook` endpoint (next session's job)

Request (client state from `/context`, per `inputs/` fixture shape + `ability` +
`llm`):

```json
{ "seed": "...", "language": "es|ja|zh|cs",
  "ability": "none|basics|conversational",
  "answers": { "<question>": "<answer>" },
  "checklist": ["<topic>", "<topic>", "<topic>"],
  "llm": "google | ..." }
```

Execution: 1 generation call (English conversations, each with its own `vocab`),
then N parallel translation calls (one per conversation; `Promise.all`), assemble
**by index, never by title text**. Response shape: decide against `CARD_SCHEMA.md`
at build time (cards with `text` = target language, `translation` = English line,
`reading` from inline ruby, speaker in `notes`, service-set `context` = topic title).

Service obligations (full list with rationale in `NOTES.md` §"Service-owed work"):

1. Per-chunk validation: `lines`/`vocab` counts match input; retry the chunk once on
   mismatch or JSON parse failure; 502 only after.
2. Ruby normalization: parse `base[reading]` (base = kanji/hanzi run) into
   ReadingToken pairs; strip any bracket group not preceded by such a run.
3. 429 backoff; API Gateway deadline must stay above total worst-case (gen retry +
   chunk retry).
4. Vocab: pool per-conversation lists, dedup by English word (keep first), cap.
5. ja `romanization` via mechanical kana→rōmaji from the inline readings.
6. `notes.source` on drawn vocab cards = the conversation line containing the word.
7. Reading-rules injection mirrors the runners: `translate/reading_rules_<lang>.txt`
   content into `{{READING_RULES}}`, empty string for es/cs.
8. Deployed prompt copies must stay byte-identical to `prompt.txt` /
   `translate/prompt.txt` (+ reading rules) — verify with `diff`.

Reference implementations of the whole flow: `runners/run_translate.py` (chunking,
parallelism, retries, pooling, ruby parsing) and `runners/run_generate.py`.

## 2. `/context` revision (separate track, own prompt loop in `prompts/context/`)

- Accept `ability` (`none|basics|conversational`) and pass it through to `/phrasebook`.
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
