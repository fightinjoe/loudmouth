# Phrase breakdown: v07 selected, v08 not promoted

Decision: lock v07 provisionally and promote its exact instructions to the API. v08 did not
consistently improve the targeted Japanese behavior. This is a working baseline, not a claim of
linguistic completeness. The canonical runtime prompt is `api/src/phrase-breakdown/prompt.txt`;
`api/evals/prompts/phrase-breakdown-vocab-07.txt` is the frozen experimental reference.

## Evidence from the last decision run

Run: `api/evals/artifacts/phrase-breakdown-2026-09-20T21-26-46-564Z.json`.
In this artifact **baseline = v07**, **candidate = v08**, not the then-production prompt.
Gemini `gemini-3.5-flash-lite`, four phrases, three samples per prompt per phrase: 24 calls.
Order alternated across repetitions. Same inputs, provider, nested schema, and punctuation cleanup.

v08 added only two ideas: keep short mutually dependent constructions together; explain productive
particles/endings instead of extracting them as standalone learning items.

| Observation | v07 | v08 |
|---|---:|---:|
| Mechanical checks passed at run time | 12/12 | 12/12 |
| Raw punctuation-only chunks | 0 | 0 |
| Mean model-call latency | 1.665 s | 1.621 s |
| Median latency | 1.634 s | 1.626 s |
| Slowest call | 2.208 s | 1.992 s |
| Total output tokens | 4,410 | 4,541 |
| Meat/fish kept together | 1/3 | 1/3 |
| Standalone mo-type learning item | 1/3 | 1/3 |
| Spanish weather extracts un poco rather than poco | 3/3 | 1/3 |

These are small-sample observations, not population estimates or a controlled latency benchmark.
Historical PASS means the checks implemented when the artifact was produced; replay does not
retroactively certify outputs against a newer production validator.

## Qualitative findings

- Both prompts retained useful nouns and 食べる in all three meat/fish samples. Both varied between
  肉も魚も and separate noun-plus-particle chunks. Both emitted a standalone mo-type item once.
- v08 still produced “even meat” and mixed literal/contextual glosses. Its instruction did not resolve
  the distinction between explaining a particle and offering it as a standalone study target.
- Weather segmentation was consistently two useful chunks in both prompts. v08 reduced un poco to
  poco in two samples; v07 preserved the expression in all three.
- Restaurant responses varied between larger clauses and smaller chunks. v08 produced two larger
  clause chunks twice, but four chunks in the third sample. Vocabulary selection varied between 店
  and この店. Both retain contextually overbroad dictionary glosses at times.
- Soup responses varied between three and four chunks. Both selected gustar in two samples and
  gustaría in one. Literal “I don't have much hunger” persists in some responses.
- No pattern output is part of v07. Chunk explanations retain local grammatical teaching.

## Recommendations

1. Keep v07 as the baseline; do not promote v08 or append further corrective paragraphs based only
   on these four fixtures.
2. Broaden the phrase set before more tuning: unseen constructions, natural conversational replies,
   repeated text, idioms, and different learner situations. Include Chinese and Czech before claiming
   quality across all supported languages; current qualitative evaluation covers Japanese and Spanish.
3. Prioritize coherent segmentation and no punctuation-only learning targets over extracting every
   desirable lexical expression. Apply deterministic punctuation cleanup, not retries or another model.
4. Distinguish contextual chunk targets from independently reusable Word targets. A surface-linked
   item passing validation can still be a poor card; no hardcoded particle blacklist or automatic
   linguistic correction was approved.
5. Track contextual gloss accuracy, dictionary forms versus usable expressions, source association,
   and latency distribution. Keep a clear boundary between structural checks and human judgment.
6. Grammar/pattern exploration is deferred; do not automatically launch a parallel grammar call.
7. Chunk/Word persistence, per-phrasebook stars, and provenance remain target design in
   `docs/CARD_SCHEMA.md`, not implemented by this API promotion.

## Promotion verification

- Runtime prompt is byte-for-byte identical to frozen v07.
- API suite: 99 tests passed. Targeted web breakdown suite: 8 tests passed; web build succeeded.
- Local HTTP endpoint: all four fixtures returned 200 with nested learning items, no pattern, and
  no punctuation-only chunks. Observed end-to-end times were 1.407–2.079 seconds.
- Production-only CLI run: four mechanical passes, 1.38–2.15 seconds per model call.
  Artifact: `api/evals/artifacts/phrase-breakdown-2026-09-20T21-42-45-605Z.json`.
- Browser smoke used the local API: selected-chunk and SHOW ALL explanations rendered, nested
  items survived in the v2 session cache, and the former Pattern section was absent. Browser
  animations were explicitly finished for the screenshot because the automation surface froze them.
- Retained v07/v08 artifact replays successfully in the compact, chunk-grouped CLI view.

These checks establish local integration, not a deployment or broader linguistic-quality guarantee.

## Retention

Retained decision artifacts:

- `phrase-breakdown-2026-09-20T21-16-33-793Z.json`: first v07 evaluation (historical baseline still had patterns).
- `phrase-breakdown-2026-09-20T21-26-46-564Z.json`: direct v07/v08 repeated comparison.

Pre-v07 phrase-breakdown evaluation run JSON files were removed at the user's request. Frozen prompt
versions remain for provenance; original `api/tmp/` response captures are source fixtures, not eval
runs, and remain untouched. New verification runs may be added after promotion. Artifacts are ignored
local files, so these notes intentionally preserve the key decision evidence for another checkout.

For commands and the collaborative review protocol, see [the evaluation methodology](../PHRASE_BREAKDOWN.md).
