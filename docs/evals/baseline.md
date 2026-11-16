---
kind: spec
status: current
summary: Frozen Spanish-first /context and /phrasebook English-generation request inputs, their capture provenance and evaluation approach.
sources: [evals/fixtures/baseline-context.json, evals/fixtures/baseline-phrasebook-english.json, evals/fixtures/captures/baseline-context.json, evals/baseline/prepare-english.mjs]
verified: 2026-11-15
---

# Endpoint baseline inputs

## Files for review

| File | Contents |
|---|---|
| [`fixtures/baseline-context.json`](../../evals/fixtures/baseline-context.json) | Three exact `/context` request bodies |
| [`fixtures/baseline-phrasebook-english.json`](../../evals/fixtures/baseline-phrasebook-english.json) | Four exact `/phrasebook` request bodies for evaluating its English-generation stage |
| [`fixtures/captures/baseline-context.json`](../../evals/fixtures/captures/baseline-context.json) | The three real `/context` responses from which answers and checklist selections were chosen; separate provenance, not model input |

Each input file is an array of `{ "id": "...", "request": { ... } }`. The ID identifies the case; only `request` is sent to the endpoint. Every request is self-contained. The phrasebook file's `english` name identifies the stage to evaluate, not a field containing authored English output.

The inputs were reviewed and used for the 2026-11-02 to 2026-11-12 English-generation study ([record](results/2026-11-12-english-prompt-candidate-4.md)). There are no generated phrasebook outputs, expected answers, review notes or scoring criteria in the input files. The old combined fixture and its assistant-authored English have been removed. Existing evaluation CLI fixtures remain unchanged; these request files are not wired into that CLI. Model comparisons build a Prompt Romp suite from them with `prepare-english.mjs` ([below](#prepare-an-english-generation-model-comparison)).

## Overlapping API input set

`api/evals/fixtures/baseline/` holds a separate set of five `/phrasebook` request bodies (Czech directions, Spanish salsa and surfing, Mandarin feeling sick, Japanese vegan ordering) used by the paid adversarial runner's `--mode=baseline` ([API operations](../api/operations.md#tests-and-model-evals)). Those requests are not these inputs: they cover more languages, omit `ability`, carry their own answers and three-item checklists, and were not built from the captured `/context` responses. The surfing seed and the directions seed appear in both sets with different answers and checklists; results from one set are not comparable to the other.

## Initial Spanish-only set

All requests use `language: "es"` and `ability: "basics"`.

| Seed | Answers selected from the actual response | Checklist selection |
|---|---|---|
| `asking directions` | `A landmark or monument`; `Walking` | All six API-checked defaults |
| `asking directions` | `A landmark or monument`; `Using public transport` | Same six items, same order |
| `surf vacation in Costa Rica` | `Beginner`; `Surf camp` | Four API-checked defaults plus the offered `Chat with local surfers` |
| `dinner with my partner’s parents` | `First time meeting them`; `At their home` | All five API-checked defaults |

The two directions requests differ in exactly one answer. They share the destination category, not an invented exact destination or starting point. `/context` receives the common directions seed once.

Answers are assistant choices from the captured options, not real-user responses. Checklist defaults are retained rather than reduced to one topic. The only change to defaults is selecting surfing's local-peer chat to preserve the agreed mixed-audience coverage; the label is API-provided. No question, answer option or checklist label has been invented or rewritten.

The captures do not offer an in-lesson surfing topic or an explicit reciprocal getting-acquainted family topic. The request files preserve those limitations instead of silently adding topics.

## Captured response provenance

Three actual local HTTP `POST /context` calls returned 200 using `gemini-3.5-flash-lite` through the production Vertex AI adapter, one per seed without application reruns. The separate capture file preserves request/response values, timestamps, HTTP elapsed times, usage and the context prompt hash. It contains final normalized HTTP responses, not raw provider output, and is not evidence of the currently deployed service. Endpoint-estimated total cost was USD 0.0051218, not a billing receipt. No `/phrasebook` calls or translations were generated to create these input files.

## Evaluation approach

Start with this small set to compare models directionally and identify broad prompt shortcomings. Freeze the same inputs and settings across candidates. Keep endpoint/stage outcomes distinct:

- **`/context`:** send the three context requests; inspect the actual returned questions and checklist.
- **`/phrasebook` English generation (A):** use the four phrasebook requests, preserving all selected topics. Production calls A once per topic; derive those calls with production `generationTasks` so each names its topic and the request's other topics, without silently dropping topics. The full set contains 22 topic calls per candidate/repetition.
- **Translation (B):** separately capture and review actual A outputs before freezing translation inputs. These request files do not contain a B baseline or authorize authored substitutes.
- **Integration:** pass actual upstream output downstream and retain its association with the input. Keep this separate from isolated A/B comparisons so upstream differences do not confound them.

After choosing a promising model, broaden diagnosis with salsa dancing in Austin, joining a pottery class, ordering vegan food and feeling sick. Report severe peanut allergy as a separate safety challenge. Add targeted ability/language variants instead of a full combinatorial matrix; validate selected Japanese and Mandarin cases before making multilingual claims. Production Czech/Ukrainian support remains unchanged. Keep untouched cases for a final check rather than tuning against every case.

[Evaluation guidance](index.md), the [rubric](rubric.md) and endpoint contracts ([context](../api/context.md), [phrasebook](../api/phrasebook.md)) own evaluation conventions and runtime behavior. They are not fields to inject into baseline requests. Further prompt edits and paid runs remain separately approved work; their results go in the [results ledger](results.md).

## Prepare an English-generation model comparison

`evals/baseline/prepare-english.mjs` turns the phrasebook requests into one native Prompt Romp suite without dispatching anything:

```sh
node evals/baseline/prepare-english.mjs \
  --destination evals/.runs/NEW_DIR \
  --bindings evals/.runs/BINDINGS.json \
  [--topics-per-request N]
```

- Each case is one per-topic production model request (`<request id>--<topic number>`), split from the whole request by production `generationTasks` and built with the production prompt builder, so its input names one `topic` and the request's `otherTopics`. `--topics-per-request N` keeps the first N topics of each request, each still listing all the other topics of its request; omitted, all 22.
- Bindings: `{"timeoutMs"?: number, "models": [{"model", "provider", "settings"?, "pricing": {"inputPerMillion", "outputPerMillion", "currency": "USD", "source", "date"}}]}`. `settings` carries per-model controls such as `reasoning`; the production generation output cap is fixed and cannot be overridden.
- The suite adapter replays the frozen request with the production response schema (`buildGenerationResponseJsonSchema`), as production does, and runs production `validateGenerationResponse` on raw text with the case's topic title: a parser rejection is a `NORMALIZER_ERROR` finding; the by-design conversion of exchange turns to lines, a repaired section and the parser's repair flags are logged normalization changes; count overruns are flagged later, at assembly.
- `materialization.json` lists the `romp init`, `note` and per-model `run --plan --save-plan` commands. Each model gets its own plan, because Prompt Romp pins one provider and one settings overlay per run. Run `romp` from the destination directory, with `OPENROUTER_API_KEY` in the environment.

Execution still needs a human-approved brief and a separate approval of each exact prepared plan. A model whose ID is batch-only (for example an OpenRouter `:batch` variant) cannot run: Prompt Romp uses chat completions.
