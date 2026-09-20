# Phrase-breakdown evaluation methodology

## Current decision and scope

v07 is the selected working prompt. See [last comparison and next steps](notes/phrase-breakdown-07-vs-08.md).
The runtime source of truth is `api/src/phrase-breakdown/prompt.txt`; numbered files in `prompts/`
are immutable experiment snapshots, not an alternate deployment source.

The CLI uses the production provider adapters, request validation, response validation, and
punctuation normalization. It does not require an HTTP server, change runtime instructions, or save
cards. Running it makes paid calls using credentials from `api/.env`. Never include credentials in
fixtures, prompts, reports, or artifacts. Provider SDK retries may occur; the runner itself does not
retry failed calls. A full application smoke check is separate from prompt evaluation.

## Run and compare

Commands below run from the repository root with Node and API dependencies installed.

```bash
# Current production prompt: one call for each of the four fixtures
node --env-file=api/.env api/evals/scripts/eval-phrase-breakdown.js

# Compare an experimental prompt against production; three samples for each phrase and prompt
node --env-file=api/.env api/evals/scripts/eval-phrase-breakdown.js \
  --prompt=api/evals/prompts/phrase-breakdown-vocab-08.txt --repetitions=3

# Reproduce the v07-versus-v08 comparison with frozen instructions
node --env-file=api/.env api/evals/scripts/eval-phrase-breakdown.js \
  --baseline-prompt=api/evals/prompts/phrase-breakdown-vocab-07.txt \
  --prompt=api/evals/prompts/phrase-breakdown-vocab-08.txt \
  --backend=gemini-3.5-flash-lite --repetitions=3

# One fixture; Luna uses the existing chatgpt registry key
node --env-file=api/.env api/evals/scripts/eval-phrase-breakdown.js \
  --case=ja-meat-fish --backend=chatgpt

# Replay saved results with no model calls and no revalidation
node api/evals/scripts/eval-phrase-breakdown.js \
  --replay=api/evals/artifacts/phrase-breakdown-2026-09-20T21-26-46-564Z.json
```

Use `--verbose` for roles, explanations, provenance, and review questions. `--fixtures=PATH` selects
another JSON fixture array; `--out=PATH` chooses a new artifact path and refuses overwrites.
`--baseline-prompt` requires `--prompt`. Without `--prompt`, only production is run. Comparisons
alternate baseline/candidate order by repetition; this reduces fixed ordering bias, not all temporal
or provider variation. No temperature/seed control is currently supplied by this runner.

The promoted contract always has nested `chunks[].learningItems` and production normalization;
old experimental `--item-format` and `--normalize-punctuation` switches are no longer needed or
accepted. Earlier prompt shapes would require a deliberately separate experiment, not loosening
production validation. Retained v07/v08 artifacts can still be replayed.

## How the user and assistant collaborate in the CLI

1. **State the hypothesis before editing.** Name the frozen baseline, proposed candidate, and the
   specific behavior to improve. Keep unrelated prompt rules, fixtures, model, and normalization
   stable when possible. Show exact added/removed instructions or a small before/after schema.
2. **Run it.** Do not substitute predicted outputs for provider responses. One sample is a quick
   exploration; use at least three per phrase per prompt before claiming improved consistency.
3. **Make the actual content visible.** The terminal defaults to compact chunks and meanings, with
   each chunk's learning items directly underneath as `Text — Meaning`. Do not print a detached
   vocabulary list that forces the learner to reconstruct associations.
4. **Show inputs.** Include exact target text, English translation, language, and supplied context.
   Explain whether inputs are recovered or synthetic. The user should be able to revise the phrases,
   translation, or context rather than evaluate mysterious requests.
5. **Show normalization honestly.** When chunks are removed, print raw versus normalized boundaries
   and the removal count. Preserve raw text, failed calls, findings, and post-normalization output.
   Never hide a bad raw generation, silently repair linguistic content, or discard an unfavorable sample.
6. **Report in the conversation as well.** Tool output can be collapsed. Include grouped actual
   candidate content in the assistant response, not only a summary or a link to a file. Respect the
   request for concise comparison: group by phrase and model. For repeated runs, show the problematic
   phrase's variants, label any displayed representative sample by its number, and account for all
   other samples' differences. Never cherry-pick the best result as if it were typical.
7. **Separate evidence from judgment.** Preserve model wording in shown outputs; label assistant
   criticism separately. A mechanical PASS says nothing about correct grammar, useful segmentation,
   appropriate lexical selection, or a good review card. Explain what FAIL means and whether the
   provider actually failed versus returned invalid content.
8. **Invite informed evaluation.** Discuss the actual observed tradeoffs and user priorities, not just
   aggregate scores. Users can edit `fixtures/phrase-breakdown.json`; their preference for coherent
   larger chunks supersedes earlier assumptions that smaller segmentation is always better.
9. **Record the decision.** Retain candidate prompts, exact inputs, run artifacts, and a short note
   describing adoption/rejection, known limitations, and next steps. Do not promote merely because
   tests pass. On approval, update the API contract, consumers/cache, docs, and relevant tests together.

## Evaluation priorities

In order:

1. Coherent, understandable chunks without punctuation-only learning targets; larger constructions
   are preferable to unnecessary fragmentation.
2. Exact source alignment and correct parent-child association of learning items.
3. User-perceived latency around 3–4 seconds or less. Report model-call timings honestly: this CLI
   measurement excludes HTTP/network-to-app and rendering overhead, and local validation is timed
   separately. Report mean/median and slowest repeated sample; one fast call is not a guarantee.
4. Useful dictionary-form words and reusable expressions. Missing un poco or me gusta is less serious
   than broken segmentation. Productive particles may need explanation without deserving Word cards.
5. Accurate contextual meanings, readings, and grammatical explanations. Avoid unsupported exhaustive
   lists, conflicting literal/contextual glosses, and context-insensitive dictionary sense inventories.

No Pattern section is generated. Local grammar belongs in chunk explanations; a separate on-demand
Grammar feature is deferred. No automatic second model call or grammar fan-out is part of this flow.

## Fixtures and artifacts

Each fixture has `id`, `request`, `provenance`, and `review` questions. Review questions are human
rubrics, not sent to the model. Japanese meat/fish request fields were recovered from a phrasebook;
Spanish weather uses a reconstructed translation with no context. Restaurant and soup are explicitly
synthetic fixtures. Do not present reconstructed inputs as captured original requests.

Artifacts are written incrementally under ignored `api/evals/artifacts/`. They include exact trusted
instructions and serialized input, model/backend, usage and estimated cost, model-call latency,
raw responses, validation findings, normalized output, and normalization timing/removal information.
Failures remain in the run, and any final finding yields a nonzero exit code. Replay prints recorded
findings without revalidating, so historical PASS is not a claim about today's contract.

Keep raw model output even when invalid. Production punctuation cleanup verifies every raw span,
removes only punctuation/whitespace-only chunks with empty learningItems, preserves nested items on
retained chunks, and rejects all-empty results. It does not merge clauses, remove arbitrary symbols,
invent lexical items, or guess a misplaced item's parent. Source phrase text remains untouched.

As requested when locking v07, pre-v07 phrase-breakdown run artifacts were removed; original API
captures, prompt snapshots, the v07 run, and the v07/v08 comparison were retained. Do not delete other
endpoint experiments or future runs without explicit scope. The ignored artifacts are local evidence;
checked-in decision notes must preserve conclusions needed by another session or checkout.
