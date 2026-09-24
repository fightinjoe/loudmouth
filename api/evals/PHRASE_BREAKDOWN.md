# Phrase-breakdown evaluation methodology

## Current decision and scope

The runtime source of truth is `api/src/phrase-breakdown/prompt.txt`. It implements the v2 request,
dictionary-Word, explicit-equivalence, and Chunk-target contract. Numbered files in `prompts/` are
immutable pre-v2 experiment snapshots, not alternate deployment sources; they can explain historical
artifacts but are not valid candidate prompts for a current production comparison.

The CLI uses the production provider adapters, v2 request validation, model-output alignment and
assembly, and punctuation normalization. It does not require an HTTP server, change runtime
instructions, or save cards. Running it makes paid calls using credentials from `api/.env`. Never
include credentials in fixtures, prompts, reports, or artifacts. Provider SDK retries may occur; the
runner itself does not retry failed calls. A full application smoke check is separate from prompt
evaluation.

## Run and compare

Commands below run from the repository root with Node and API dependencies installed.

```bash
# Current production prompt: one call for each of the four fixtures
node --env-file=api/.env api/evals/scripts/eval-phrase-breakdown.js

# Compare a v2-compatible experimental prompt against production; three samples each
node --env-file=api/.env api/evals/scripts/eval-phrase-breakdown.js \
  --prompt=/tmp/phrase-breakdown-v2-candidate.txt --repetitions=3

# Historical v07/v08 artifacts remain replayable, but their prompts must not be sent
# through today's validator because they produce the retired learningItems contract.

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

The promoted contract has nested `chunks[].words`, explicit `equivalentWordIndex`, dictionary-aligned
structured readings, and production source-span assembly. Old experimental `--item-format` and
`--normalize-punctuation` switches are not accepted. Earlier prompt shapes belong to historical
replay, not a reason to loosen current production validation.

## How the user and assistant collaborate in the CLI

1. **State the hypothesis before editing.** Name the frozen baseline, proposed candidate, and the
   specific behavior to improve. Keep unrelated prompt rules, fixtures, model, and normalization
   stable when possible. Show exact added/removed instructions or a small before/after schema.
2. **Run it.** Do not substitute predicted outputs for provider responses. One sample is a quick
   exploration; use at least three per phrase per prompt before claiming improved consistency.
3. **Make the actual content visible.** The terminal defaults to compact chunks and meanings, with
   each chunk's dictionary Words and explicit Word/Chunk target directly underneath. Do not print a
   detached vocabulary list that forces the learner to reconstruct source association or equivalence.
4. **Show inputs.** Include the exact source snapshot—target text, occurrence translation, language,
   and supplied active context. Explain whether inputs are recovered or synthetic. The user should be
   able to revise the phrase, translation, or context rather than evaluate mysterious requests.
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
2. Exact UTF-16 source alignment, explicit occurrence selection for repeated surfaces, and correct
   parent-child association of Word evidence.
3. Correct equivalence: an unchanged lexical target such as standalone `caluroso` may use a Word
   target, while inflection or attached particles such as `食べません`/`食べる` and `肉も`/`肉`
   retain distinct Chunk and Word targets.
4. User-perceived latency around 3–4 seconds or less. Report model-call timings honestly: this CLI
   measurement excludes HTTP/network-to-app and rendering overhead, and local validation is timed
   separately. Report mean/median and slowest repeated sample; one fast call is not a guarantee.
5. Useful dictionary-form Words with consistent part of speech and canonical sense keys. Missing
   secondary vocabulary is less serious than broken segmentation or fabricated source evidence.
6. Accurate contextual meanings, dictionary-aligned readings, and grammatical explanations. Avoid
   unsupported exhaustive lists, conflicting literal/contextual glosses, and context-insensitive
   dictionary sense inventories.

No Pattern section is generated. Local grammar belongs in chunk explanations; a separate on-demand
Grammar feature is deferred. No automatic second model call or grammar fan-out is part of this flow.

## Fixtures and artifacts

Each fixture has `id`, a validated v2 `request`, `provenance`, and `review` questions. Review questions
are human rubrics, not sent to the model. Requests carry the occurrence translation in
`source.snapshot` and only the active phrasebook context. Japanese meat/fish request fields were
recovered from a phrasebook; Spanish weather uses a reconstructed translation with no context.
Restaurant and soup are explicitly synthetic fixtures. Do not present reconstructed inputs as
captured original requests.

Artifacts are written incrementally under ignored `api/evals/artifacts/`. They include exact trusted
instructions and serialized input, model/backend, usage and estimated cost, model-call latency,
raw responses, validation findings, normalized output, and normalization timing/removal information.
Failures remain in the run, and any final finding yields a nonzero exit code. Replay prints recorded
findings without revalidating, so historical PASS is not a claim about today's contract.

Keep raw model output even when invalid. Production punctuation cleanup verifies every raw span and
removes only punctuation/whitespace-only chunks with empty `words` and a null
`equivalentWordIndex`. It preserves dictionary Words on retained chunks and rejects all-empty output,
guessed occurrence offsets, misaligned readings, invalid equivalence, and source gaps. It does not
merge clauses, remove arbitrary symbols, invent lexical items, or trust model-generated snapshots or
IDs. The validated request snapshot remains untouched.

As requested when locking v07, pre-v07 phrase-breakdown run artifacts were removed; original API
captures, prompt snapshots, the v07 run, and the v07/v08 comparison were retained. Do not delete other
endpoint experiments or future runs without explicit scope. The ignored artifacts are local evidence;
checked-in decision notes must preserve conclusions needed by another session or checkout.
