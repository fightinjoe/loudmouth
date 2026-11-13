---
kind: record
status: current
summary: "Local live samples for generation reliability on 2026-11-13: strict schema versus JSON mode, OpenRouter performance routing, reply repair, per-topic latency and count overruns."
verified: 2026-11-13
---

# Generation reliability: local live samples

Local API on 2026-11-13 against real OpenRouter (DeepSeek v4.1 Flash) and Gemini translation, using the four `evals/fixtures/baseline-phrasebook-english.json` requests (22 topics). This record covers [valid JSON](../../todo/generation-reliability/valid-json.md), [provider routing](../../todo/generation-reliability/provider-routing.md), [reply repair](../../todo/generation-reliability/reply-repair.md) and [count overruns](../../todo/generation-reliability/count-overruns.md). Raw outputs were inspected and then deleted. Production behavior is verified separately ([production verification](../../todo/generation-reliability/production-verification.md)). Total paid cost was about $0.50.

## JSON enforcement: strict schema versus JSON mode

English generation only, each topic twice (44 calls per mode), routing as below without an `ignore` list:

| Mode | Valid | Invalid JSON syntax | Shape failures | Other | Call p50 / p90 / max |
|---|---|---|---|---|---|
| Strict `json_schema` (structure only, no counts) | 41 | 0 | 2, both Wafer (empty required sections) | 1 Wafer 502 | 4.1 / 6.3 / 19.7 s |
| `json_object` (JSON mode) | 42 | 0 | 1, Relace (extra field) | 1 Venice cut off at 6,000 tokens | 4.0 / 5.7 / 27.1 s |

End-to-end requests in JSON mode then failed 7 of about 81 English attempts on shape, including the original wrong-bracket case: DeepInfra put a `]` inside a string and broke the nesting. One request failed when both attempts for a topic were invalid. **Result: strict schema adopted.**

With a strict schema, Baidu, DigitalOcean, Wafer and Novita emit properties in alphabetical order, so the example conversation is generated first. Baidu and DigitalOcean replies were still valid. A Novita probe of one dinner topic (three calls) produced 4,042 and 5,267 output tokens and one completion cut off at 6,000 tokens (a typical topic is about 650). Wafer, Novita and OpenInference (see below) are in `ignore`.

## Final configuration, end to end

Strict schema; `allow_fallbacks`, `require_parameters`, `data_collection: 'deny'`, `preferred_min_throughput: {p90: 150}`, `ignore: ['wafer','novita']`; truncated replies spend the validation retry. Eight `/phrasebook` requests (each fixture twice), summarized with `scripts/generation-report.mjs --file`:

| Measure | Result |
|---|---|
| Requests | 8 of 8 returned 200 (all failure level 1, from flags or retries), 10.1–21.6 s, p50 12.2 s |
| English per topic | 44 topics: p50 4.5 s, p90 7.3 s, max 13.8 s; 43 under 10 s, 34 under 6 s |
| Invalid English replies | 0 invalid JSON; 4 of 48 attempts invalid in shape (Morph, AtlasCloud, InferenceNet, Baidu), all recovered by the retry |
| Providers | 14 providers answered; Baidu 11 attempts, InferenceNet 6, River 6, others 1–4 |
| Translation | 44 calls, p50 3.3 s, max 5.6 s, no retries |
| Cost | $0.015–0.023 per request |

The v4 baseline (Relace only, no schema) took 18.0 s and 8.0 s for two of these requests ([v4 live release](2026-11-13-v4-live-release.md)).

## Quality spot-check

Mechanical checks of the English across both end-to-end runs: no opener alternatives and no "Do you speak English?" fallback. Generic thanks appear only in thank-you and goodbye topics (the known [backlog gap](../../todo/backlog/host-thanks.md)).

**OpenInference:** three of its four replies were degenerate. Two wrote the English source in Spanish; three exchanges ran to 14, 27 and 35 turns. Validation cannot catch either problem, and count overruns are now kept. OpenInference was added to `ignore` after this run, so the final configuration was not re-sampled with it excluded.

## Count overruns

Overruns are now kept and flagged ([POST /phrasebook](../../api/phrasebook.md#model-tasks-and-raw-authoring-output)). Words above 10 per topic is common:

- Generation-only sample: 11 of 41 valid topics had 11 or 12 Words, and one had 5 exchanges.
- End-to-end runs: 17 Words flags (up to 18) and 3 exchange-turn flags, all from OpenInference.

## Reply repair

With reply repair and `ignore: ['wafer','novita','open-inference']`, eight more `/phrasebook` requests (each fixture twice) were summarized with `scripts/generation-report.mjs --file`:

| Measure | Result |
|---|---|
| Requests | 8 of 8 returned 200, 8.5–13.7 s, p50 10.4 s |
| English per topic | 44 topics: p50 4.0 s, p90 5.5 s, max 9.9 s; all 44 under 10 s, 41 under 6 s |
| Retries | 0 of 44 topics needed a second English call |
| Repairs | 2 `speaker-repeated` (kept); no drops, merges or missing sections |
| Providers | 15 answered; none of the ignored providers |

Both kept repeats were legitimate: in "The shop asks about your level", the learner answers and then asks a follow-up ("I'm a beginner." then "Is there a board that's good for beginners?"). The earlier parser rejected such replies and spent the retry. Count overruns were Words only (13 flags, up to 15).
