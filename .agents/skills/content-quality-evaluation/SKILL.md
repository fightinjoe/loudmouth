---
name: content-quality-evaluation
description: Propose or independently review phrasebook evaluation scenarios, English generation, translation, and optional detection/repair using canonical contexts, cited evidence, and calibrated uncertainty. Use for subjective content-quality evaluation, not production prompt editing or paid execution.
---

# Content-quality evaluation

Read `evals/README.md`, `evals/rubric.json`, the selected canonical context in
`evals/fixtures/contexts.json`, and the normative contract relevant to the artifact.
Production contracts: `docs/API_DESIGN.md` and `docs/CARD_SCHEMA.md`.

## Boundaries

- No paid calls, production prompt edits, model switch or deployment without separate exact approval.
  Native `../prompt-romp` is the only paid execution/accounting engine. This skill is not a provider runner.
- Never read `.env` or print credentials. Raw responses/logs stay in ignored temporary workspaces,
  not Git. Commit only concise reviewed findings and deliberately selected regression examples.
- Authored fixtures, mocks and your own agreement are not gold labels or linguistic certification.
  Exposed development cases are not unseen holdouts. Challenge rates do not estimate production rates.
- A generating candidate cannot certify its own output. Identify reviewer identity, available language
  expertise and whether review was blind. User approves the initial rubric, priorities and sample;
  materially uncertain linguistic judgments remain unresolved pending qualified adjudication.

## Mode 1: propose expectations

1. Discover scenarios in `evals/fixtures/contexts.json`; reuse stable IDs and original learner facts,
   ability and ordered topics. Do not create divergent A/B/C versions of the same context.
2. State the real communicative task, essential learner intents, useful vocabulary, plausible roles,
   register and contextual constraints. Do not impose an arbitrary word/phrase quota.
3. Separate ordinary examples from explicit challenge/negative cases. Propose correct controls,
   a known defect and at least one uncertainty/abstention boundary. Include all supported scripts
   when assessing cross-language behavior; state missing coverage.
4. Label every new expectation as proposed. Show representative actual text and schema paths for
   user review before treating subjective labels as calibration targets. Do not resolve ambiguous
   English such as 'light' from unrelated context or add a production classifier POS enum.
5. Keep source facts, linguistic expectations and test mutations distinct; answer labels must not
   enter model-visible prompts. Preserve concise provenance and why each example is informative.

## Mode 2: independent assessment

Review the context and actual candidate artifact before opening answer expectations or candidate names.
If blind review is impossible, disclose it. Use rubric version `1.0-proposed` until explicitly replaced.

### A — English generation

- Prioritize independently useful essentials, then relevant reusable Words; check supplied facts,
  level, safety and requested intents. A topic about explaining an allergy needs an allergy statement,
  not merely ingredient questions.
- Score coverage, correctness/fit, vocabulary usefulness and conversation flow separately on the
  existing 0–4 ordinal anchors. Ordinary repetition can be flow 3; do not call every awkward dialogue
  unusable. An illustrative statement is not automatically an invented fact about the learner.

### B — translation

- Compare against the exact pinned English, not what you wish it had said. In composed A→B review,
  use the actual A output. Attribute English-origin defects separately from translator-added defects.
- Check negation, referents, quantities, register, dictionary forms and meanings; then written text,
  readings/romanization, source occurrence and optional enrichment independently.
- A truthful exact span must support the intended lexical occurrence, not merely exist. A lemma can
  validly be supported by an inflected occurrence: 买 with 买了 is not automatically false evidence.
- Distinguish `card.translation` (displayed English equivalent, often called a **gloss**) from
  `card.senseKey` (a concept identifier, e.g. `drinking-cup`). Check target-language `partOfSpeech`,
  not the English label's grammatical role. Do not count normalized structural validity as accurate speech.

### C — detection and optional repair

- First identify defects independently of curated expected findings. Record missed defects and
  false alarms/localization; measure known-location repair separately from detector-gated repair.
- Compare original, proposed and actually applied whole topics. Report fixed defects, introduced
  harm, changed correct controls, unresolved intent and retained/deleted evidence with denominators.
- Atomic rejection preserves the original but earns zero credited fixes. Unchanged output is not
  automatically correct. A defensible source deletion can still reduce teaching value; assess it.
- A proposal's `reason` explains a correction/source removal; it is not `card.notes` or learner-facing
  teaching. Do not demand an invented explanation for a valid unchanged entry.
- The C patch protocol is an evaluation control, not a selected production API or architecture.
  Counter/classifier and new teaching-field repair policies are not implemented by this control;
  do not silently change schema expectations or migrate consumers.

## Evidence and compact output

Every finding contains the actual artifact path, exact quote, user impact, severity, origin,
confidence and disposition. Include both English and target text for a meaning claim. Resolve concrete
array indexes and, where available, include the stable handle; `items[e:0]` is descriptive notation,
not a valid JSON array index. Source spans use UTF-16 offsets against the exact historical snapshot.

Use the record contract in `evals/rubric.json`: context ID, lane, artifact SHA-256, rubric version,
reviewer, four dimension scores or null, findings, uncertainties and overall disposition. Keep
assistant, independent model and qualified human assessments attributable and separate. Use
`usable`, `material-failure` or `unresolved` as review dispositions, not a fabricated promotion seal.

Show a concise table and at most the representative findings needed to explain the decision.
Do not emit a diary, duplicate full outputs, average ordinal grades or assign a zero to missing review.
Risk flags are explicit and cannot disappear inside a favorable aggregate. Report provider latency,
tokens, cost, raw contract validity, application failure level and qualitative scores separately.
Mock observations have no provider-performance measurements.

## Mode 3: reconcile and prepare calibration

Compare independent assessments only after each has been recorded. Quote the disputed text, identify
whether the disagreement concerns intent, grammar, register, severity or rubric application, and retain
both positions. Revise/version expectations transparently; never rewrite history to force agreement.
Ask the user to review priorities, rubric and a representative fixture/report sample. Material language
claims require qualified adjudication if still uncertain. Calibration tests the measurement method;
it does not promote a model, approve prompt changes or authorize a mandatory runtime reviewer.
Only after calibration may a separately approved study compare models, prompts and systemic changes.
