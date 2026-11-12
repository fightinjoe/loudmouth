# Endpoint baseline inputs

## Files for review

| File | Contents |
|---|---|
| [`fixtures/baseline-context.json`](fixtures/baseline-context.json) | Three exact `/context` request bodies |
| [`fixtures/baseline-phrasebook-english.json`](fixtures/baseline-phrasebook-english.json) | Four exact `/phrasebook` request bodies for evaluating its English-generation stage |
| [`fixtures/captures/baseline-context.json`](fixtures/captures/baseline-context.json) | The three real `/context` responses from which answers and checklist selections were chosen; separate provenance, not model input |

Each input file is an array of `{ "id": "...", "request": { ... } }`. The ID identifies the case;
only `request` is sent to the endpoint. Every request is self-contained. The phrasebook file's
`english` name identifies the stage to evaluate, not a field containing authored English output.

The inputs were reviewed and used for the English-generation study summarized under
[results](#english-generation-results-2026-11-02-to-2026-11-12). There are no generated phrasebook
outputs, expected answers, review notes or scoring criteria in the input files. The old combined
fixture and its assistant-authored English have been removed. Existing evaluation CLI fixtures remain
unchanged; these request files are not wired into that CLI. Studies used per-topic Prompt Romp suites
built from them.

## Initial Spanish-only set

All requests use `language: "es"` and `ability: "basics"`.

| Seed | Answers selected from the actual response | Checklist selection |
|---|---|---|
| `asking directions` | `A landmark or monument`; `Walking` | All six API-checked defaults |
| `asking directions` | `A landmark or monument`; `Using public transport` | Same six items, same order |
| `surf vacation in Costa Rica` | `Beginner`; `Surf camp` | Four API-checked defaults plus the offered `Chat with local surfers` |
| `dinner with my partner’s parents` | `First time meeting them`; `At their home` | All five API-checked defaults |

The two directions requests differ in exactly one answer. They share the destination category, not
an invented exact destination or starting point. `/context` receives the common directions seed once.

Answers are assistant choices from the captured options, not real-user responses. Checklist defaults
are retained rather than reduced to one topic. The only change to defaults is selecting surfing's
local-peer chat to preserve the agreed mixed-audience coverage; the label is API-provided.
No question, answer option or checklist label has been invented or rewritten.

The captures do not offer an in-lesson surfing topic or an explicit reciprocal getting-acquainted
family topic. The request files preserve those limitations instead of silently adding topics.

## Captured response provenance

Three actual local HTTP `POST /context` calls returned 200 using `gemini-3.5-flash-lite` through the
production Vertex AI adapter, one per seed without application reruns. The separate capture file
preserves request/response values, timestamps, HTTP elapsed times, usage and the context prompt hash.
It contains final normalized HTTP responses, not raw provider output, and is not evidence of the
currently deployed service. Endpoint-estimated total cost was USD 0.0051218, not a billing receipt.
No `/phrasebook` calls or translations were generated to create these input files.

## Evaluation approach

Start with this small set to compare models directionally and identify broad prompt shortcomings.
Freeze the same inputs and settings across candidates. Keep endpoint/stage outcomes distinct:

- **`/context`:** send the three context requests; inspect the actual returned questions and checklist.
- **`/phrasebook` English generation (A):** use the four phrasebook requests, preserving all selected
  topics. If an evaluator calls A once per topic, derive singleton-topic calls without silently
  dropping topics. The full set contains 22 topic calls per candidate/repetition.
- **Translation (B):** separately capture and review actual A outputs before freezing translation
  inputs. These request files do not contain a B baseline or authorize authored substitutes.
- **Integration:** pass actual upstream output downstream and retain its association with the input.
  Keep this separate from isolated A/B comparisons so upstream differences do not confound them.

After choosing a promising model, broaden diagnosis with salsa dancing in Austin, joining a pottery
class, ordering vegan food and feeling sick. Report severe peanut allergy as a separate safety
challenge. Add targeted ability/language variants instead of a full combinatorial matrix; validate
selected Japanese and Mandarin cases before making multilingual claims. Production Czech/Ukrainian
support remains unchanged. Keep untouched cases for a final check rather than tuning against every case.

## English generation results (2026-11-02 to 2026-11-12)

All runs used these requests, single attempts, no retries and no paid judging. Raw replies, plans and
findings were local and have been deleted; they are not replayable. Rules learned from the reviews
live in the [rubric](RUBRIC.md) decision log; non-prompt follow-ups live in
[`docs/TODO.md`](../docs/TODO.md).

| Study | Scope | Outcome |
|---|---|---|
| Baseline | All 22 topics, DeepSeek v4.1 Flash (Relace, reasoning off) | Coverage mostly strong. Owner and assistant reviews found long or fused openers, paraphrase alternatives, opening-line alternatives, "Do you speak English?" fallbacks, and repeated vocabulary. Parser: 17 accepted, 2 Word lists trimmed, 3 surfing topics rejected (five-turn exchanges, array text). |
| Reasoning | Walking topics 1–6; reasoning off (repeat), low, medium, high | Rejected for latency: median 52–74 s per topic with reasoning versus 3–6 s without. At 6,000 output tokens, 1–4 of 6 calls per level were cut off or timed out. |
| Models | Walking topics 1–3; Claude Haiku 5.5, GPT-6 Luna, DeepSeek 1017 snapshot, Gemini 3.5 Flash Lite and Muse Ember (minimal reasoning) | No candidate beat DeepSeek v4.1 Flash in owner or assistant review. Gemini and Muse Ember reject disabled reasoning; Luna and Muse Ember each returned one invalid JSON reply; the DeepSeek snapshot was too slow (6–9 s). |
| Prompt | Four candidates against the previous prompt, calls alternated; final check on the first three topics of all four requests | Candidate 4 adopted in `api/src/phrasebook/prompt.txt` on 2026-11-12. On 8 paired topics: equal or better scores everywhere; generic Things to say 7 → 2; opening-line alternatives 11/21 → 0/26; about 200 more input tokens per call (+12%); same latency. Candidate 1 repeated "Excuse me." in every topic; candidate 3 invented over-specific learner facts; both were fixed before adoption. |
| Latency | Production prompt across five DeepSeek providers, plus OpenRouter timing for earlier calls | Slowness on 2026-11-11 came from Relace output speed, not the prompt. Details and next steps in [`docs/TODO.md`](../docs/TODO.md). |

Limits: Spanish context, `basics` ability, one or two samples per topic and condition, assistant and
owner review only (no native-speaker adjudication). Translation (B) was not evaluated.

[Evaluation guidance](README.md), the [rubric](RUBRIC.md) and endpoint contracts
([context](../docs/api/context.md), [phrasebook](../docs/api/phrasebook.md)) own evaluation conventions
and runtime behavior. They are not fields to inject into baseline requests. Further prompt edits and
paid runs remain separately approved work.
