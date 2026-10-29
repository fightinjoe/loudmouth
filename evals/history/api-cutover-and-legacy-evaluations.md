# API cutover and legacy evaluation record

Historical material relocated from `docs/API_DESIGN.md` during the endpoint-reference split.
These are previously recorded observations, **not new executions or current endpoint contracts**.
Dates not stated in the original record remain unspecified. Current endpoint designs are indexed in
[API design](../../docs/API_DESIGN.md#endpoints).

## 2026-10-01 code-only v3 cutover

The user promoted per-topic DeepSeek English generation and dialogue-first Gemini translation despite
known translation defects. The retained 19-topic review had 8 passes and 11 material failures,
including Japanese romanization polarity misalignment. Those historical grades are not a linguistic
acceptance seal. Translation improvement remains separate work.

The code-only cutover included API, web and browser verification; it did not authorize deployment.
Historical prompt/model/architecture comparisons changed multiple variables together and do not
establish current model rankings or isolated prompt effects. Structural success did not establish
translation, pronunciation or teaching quality.

## Evaluation reset and evidence retention

The subsequent evaluation reset intentionally deleted historical raw captures, native experiment
histories and duplicated evidence rather than archiving them. Those runs are no longer replayable;
the summaries below do not restore their missing source artifacts.
See [evaluation guidance](../README.md) for retained regression lessons, tooling and approval gates.

Historical topic-first, bilingual and translation-order trials exposed meaningful errors despite
valid response structure: changed meaning, incorrect readings, dictionary-form/sense mismatches
and unrelated source links. Output reordering did not establish a reliable quality improvement.
These are development lessons, not a current model ranking or a native-speaker acceptance claim.

New evaluation separates English generation, translation and optional detection/repair under shared
learner contexts. Production prompts were unchanged by that reset.

## Historical v2 translation scoring live check

The earlier scoring change (before learner-only selection) was compared against the preceding prompt with the configured
`gemini-3.5-flash-lite` backend, using the same fixed English conversations once before and once
after. Each response passed translation parsing, complete assembly, and shared wire validation:

| Case | Latency before → after | Input tokens before → after | Output tokens before → after | Featured / complete lines |
| --- | --- | --- | --- | --- |
| Japanese vegan restaurant | 6,415 → 6,932 ms | 2,271 → 2,702 | 403 → 424 | 5 / 8 |
| Chinese parcel pickup | 2,176 → 2,798 ms | 1,637 → 2,053 | 560 → 651 | 5 / 8 |
| Spanish allergy pharmacy | 1,300 → 1,414 ms | 1,575 → 1,999 | 183 → 206 | 6 / 9 |

All 25 lines were retained; greetings and thanks were excluded from the 16 featured phrases.
Selected partner replies included bonito-stock disclosure, passport acceptance, signing instructions,
dosage, and a driving warning. These single-run translation measurements are not end-to-end latency
estimates or statistically reliable performance comparisons. They do not certify language quality:
the after-run Japanese thanks contained `ごさいます` rather than `ございます`, and Chinese raw output
included punctuation reading annotations. No native-speaker review or Czech run was performed.

## Historical v2 Ukrainian and learner-only variation live check

The four approved prompts were sampled before and after the language-list extension using
`gemini-3.5-flash-lite`, identical vegetarian-food tasks, production prompt builders and validators,
and the production translation response schema. One sample per language/stage:

| Language / stage | Latency before → after (ms) | Input tokens before → after | Output tokens before → after |
| --- | --- | --- | --- |
| Japanese context | 5,985 → 5,666 | 1,008 → 1,014 | 291 → 292 |
| Japanese generation | 1,214 → 1,353 | 1,393 → 1,399 | 324 → 349 |
| Japanese translation | 1,640 → 1,504 | 2,630 → 2,664 | 344 → 355 |
| Japanese breakdown | 1,377 → 1,439 | 1,147 → 1,183 | 411 → 350 |
| Ukrainian context | 1,296 → 1,248 | 1,008 → 1,014 | 280 → 282 |
| Ukrainian generation | 1,158 → 1,429 | 1,393 → 1,399 | 350 → 335 |
| Ukrainian translation | 1,240 → 1,774 | 1,913 → 1,947 | 257 → 383 |
| Ukrainian breakdown | 1,738 → 1,757 | 1,151 → 1,187 | 430 → 426 |

Before the change, all Ukrainian endpoint request contracts rejected `uk`; those baseline calls
were prompt-only samples, not working endpoint requests. Their translation/card assembly and
breakdown validation rejected the unsupported language. Baseline Japanese translation failed
dictionary Han reading validation. Every candidate passed production validation, including both
translation wire responses after correcting the evaluation harness's incomplete usage object.
The Japanese reading rules and 1–5 scoring rubric were unchanged.

Both candidate translations kept all five lines and selected the two qualifying learner lines;
high-scoring partner disclosures and generic thanks remained visible only in the complete dialogue.
Ukrainian output retained Cyrillic and dictionary forms such as `їсти`; no ruby was required.
A separate real-provider production-handler smoke returned 200 for Ukrainian context, phrasebook,
and breakdown: 5,264 / 2,703 / 1,915 ms respectively, with 280 / 851 / 599 output tokens.
The generated book contained two groups, eight complete lines, five featured learner lines, and nine Words.

These are single samples, not a performance benchmark or native-speaker certification. In both
Ukrainian breakdown samples the model treated the whole short sentence as one chunk and overstated
the requirement for genitive under negation. Optional romanization and `reading: null` also appeared
in raw Ukrainian breakdown Words; reading was discarded by the existing non-Japanese/Chinese path.
The Japanese generation sample changed a payment amount from yen to dollars without a specified
location. Structural checks do not establish teaching quality or cultural appropriateness.
