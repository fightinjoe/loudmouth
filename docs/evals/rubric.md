---
kind: rules
status: current
summary: "Content-quality rubric for phrasebook evaluations: scale, dimensions, outcome classes, English and translation rules, review records and decision log."
sources: [evals/rubric.json]
verified: 2026-11-15
---

# Content-quality rubric

**Version 2.1-proposed.** This file is the human-readable source of truth for judging phrasebook content. Rules come from joint reviews with the project owner; the [decision log](#decision-log) records each change and why.

This is review guidance, not linguistic certification or a production acceptance gate. A model cannot certify its own output, and assistant, independent-model and human judgments stay attributable and separate.

Lanes: **A** English generation · **B** translation · **C** optional detection and repair.

## Contents

1. [Scoring scale](#scoring-scale)
2. [Dimensions](#dimensions)
3. [Outcome classes](#outcome-classes): failure, warning, not the prompt
4. [Priorities](#priorities)
5. [English generation rules](#english-generation-rules) (lane A)
6. [Translation and repair checks](#translation-and-repair-checks) (lanes B and C)
7. [What to score in each kind of comparison](#what-to-score-in-each-kind-of-comparison)
8. [Review records and citations](#review-records-and-citations)
9. [Calibration examples](#calibration-examples)
10. [Decision log](#decision-log)

## Scoring scale

Scores are ordinal (0–4, higher is better). Report each dimension separately with distributions and concrete weaknesses; never average scores. A missing assessment is null, never 0.

| Score | Label | Meaning |
|---:|---|---|
| 4 | High quality | Accurate, relevant, clear and well arranged; ready to use with negligible improvements. |
| 3 | Usable | Core task is achievable without correction despite repetition, awkward flow or minor omissions. Needs editing to become good. |
| 2 | Partially usable | Important intent is missing or misleading; correction or supplementation is needed to accomplish the task. |
| 1 | Poor | Little dependable help; extensive rewriting is needed. |
| 0 | No usable value | Empty, irrelevant or effectively unusable content. |

## Dimensions

| Dimension | Question | Lanes |
|---|---|---|
| Usefulness | Is every Things to say entry, exchange line, alternative and Word something this learner is likely to say or hear in this situation and would want on a card? Padding, alternatives that only reword another option, low-value Words and material that belongs to another topic lower it. A missing item counts against coverage, not usefulness. An empty Words list can be appropriate. | A |
| Correctness and fit | Are meaning, supplied facts, register, learner level and teaching correct and contextually appropriate? | A, B, C |
| Coverage | Can the learner initiate and accomplish this contextual task? | A, B, C |
| Naturalness and reusability | Does the English sound natural, and can each Things to say entry and exchange line be lifted and reused on its own? | A |
| Conversation flow | Are roles, alternatives and progression usable? Repetition alone is not a material failure. | A, B, C |
| Vocabulary usefulness | Are the dictionary words relevant, reusable, broad and unpadded, with truthful forms, meanings and evidence? An empty list can be appropriate. | B, C |

For English generation (A) the first five rows are in priority order, and the first three are close in importance. Usefulness covers both phrases and vocabulary there, so lane A has no separate vocabulary dimension.

### Machine-readable copy

[`rubric.json`](../../evals/rubric.json) mirrors the version, scale and dimensions for tools and points back here. Its fields: `version`, `source` (the path of this page), `note`, `scale`, `missingAssessment` (`null`) and `dimensions`, each with `id`, `question` and `lanes`. Current readers:

- `rubricReference` in `evals/pipelines/runner.mjs` reads `version` and `source`, hashes the JSON together with this page, and attaches the reference to reports with all scores null.
- `evals/calibration/prepare.mjs` reads `source` to embed this page in each suite goal, and picks the `dimensions` whose `lanes` include the suite's lane (`a`, `b` or `c`) as human-scored criteria.

`rubric.json` also lists `ab` in the lanes of every dimension that applies to B. No tool reads that tag: calibration has no `ab` suite, and the CLI's `ab` lane is an integration smoke that checks structure and association only, so it is not scored on these dimensions. Keep this table and the JSON in step when a dimension changes.

## Outcome classes

Keep these separate from quality scores. A response can be technically valid and still poor, and a technical problem outside the prompt is not a prompt regression.

| Situation | Class | How to report |
|---|---|---|
| Invalid JSON from the model | **Not the prompt** (fix planned in code; see [valid JSON](../todo/antsy-aphid/valid-json.md)) | Report the count and likely cause (for example a one-item array closed with the wrong bracket). Do not count it against the prompt. |
| More items than a limit allows (turns, options, Words, phrases) | **Warning** | Report the count against the limit. Score the content. |
| Output about 10× a limit or more (for example 40 turns where 4 are allowed) | **Failure** | Report and score as a material failure. |
| Wrong types, missing sections, wrong title | **Contract issue** | Report the exact path and value; content may still be reviewed if readable. |
| Provider errors (HTTP 429, timeouts) with no output | **Not assessed** | Coverage gap, not a content failure. |
| Latency and cost | **Not a prompt criterion** | Report separately for information. Latency is a production problem tracked in [generation reliability](../todo/antsy-aphid.md#generation-reliability). |
| Placeholders such as `[name]` | **Not scored** | Neither required nor penalized until the [placeholder feature](../todo/backlog/proper-noun-placeholders.md) exists; note them as observations. |

Severity follows learner impact: **minor** leaves the task usable; **material** changes important meaning or blocks the task; **critical** requires a concrete, serious safety consequence. Meaning errors, harmful assurances and violations of supplied learner facts are explicit risk findings and never disappear inside a favorable score.

## Priorities

**All lanes.** Speed, reliability, quality and cost are reported separately. A runtime reviewer is optional, not a required serial stage before content is useful.

**English generation (A)**, in order; the first three are close:

1. Usefulness: every phrase, alternative and Word earns its place. An extra phrase or exchange turn loses value much faster than an extra Word.
2. Correctness and fit.
3. Coverage of the selected topic. More content is not better coverage: high coverage that brings in items the learner will not use lowers the value.
4. Natural, independently reusable phrases.
5. Conversation flow, with continuation coherence lowest (unless it teaches a wrong meaning).

**Translation (B).** Preserve the frozen English intent, negation, quantities, referents and register; check target-language naturalness, dictionary forms, readings and exact lexical evidence separately. Pronunciation matters: assess ruby readings and romanization explicitly. Incorrect ruby is a quality finding, not an automatic whole-topic failure; severity follows learner impact. Malformed, unrenderable reading data is a separate technical finding.

**Detection and repair (C).** Detect without changing correct content; measure detection, known-location repair and detector-gated whole-topic results separately. A rejected proposal is not a credited fix.

## English generation rules

Each rule names the dimension it affects. Quotes are real outputs from evaluation runs.

### Whole topic

- **No generic language in Things to say or Words.** Greetings, thanks (including thanks to hosts), apologies, polite openers and generic requests usable in any conversation stay out: "Excuse me.", "Thank you.", "Thank you for inviting me to your home.", "Sorry to bother you.", "Could you help me?", "Could you repeat that?", "please". This applies at every ability level and in every topic, including topics whose title is itself generic such as "Get someone's attention"; those topics need situation-specific lines ("I'm looking for the cathedral."). Generic language is welcome in Likely exchanges and the Example conversation, where a beginner can star a line individually. *Naturalness and reusability.*
- **No English fallback.** No "Do you speak English?" and no partner replies about speaking English, in any section. The phrasebook exists so the learner speaks the target language. *Correctness and fit.*
- **No invented learner facts beyond illustration.** Illustrative statements are fine and adaptable ("I work as a teacher."). Over-specific or assumed facts are not: "I'm staying at the surf camp at Playa Jacó.", "I've been living in Madrid for three years.", "I've heard a lot about you from your son." (assumes the partner's gender). Contradictions within a topic are material ("I have one brother and one sister." next to "I'm an only child."). *Correctness and fit.*
- **Every item earns its place.** Each phrase, alternative and Word costs the learner study time. A line the learner is unlikely to need is a finding even when it is correct: "There's a ding on the nose." for a beginner renting a surfboard. Be stricter with phrases and turns than with Words. *Usefulness.*
- **Low overlap.** Exchanges add material beyond Things to say and the example; adjacent topics avoid repeating each other's exchanges, and a topic does not spend its space on another topic's subject. The example conversation should not copy the exchanges line for line. *Usefulness.*
- **English surface form is not scored.** Contractions ("It is" versus "It's") do not count against naturalness: the English is translated and does not reach the learner in that form. Judge wording, length and what the learner would actually say. *Naturalness and reusability.*
- **Natural titles.** Exchange and family titles are short and natural, and name the moment or the choice rather than the people ("Arrival and introductions", not "Arriving and exchanging names"). Poor exchange titles: "Asking the person next to you", "The person can't help". Awkward family titles: "Who to ask", "Your situation". Minor. *Naturalness and reusability.*

### Things to say

- **Short, stand-alone and reusable.** Each entry works on its own. Verbose or compound lines are weaker ("Excuse me, where is the landmark? I'm trying to find it."). *Naturalness and reusability.*
- **On topic.** Every entry serves the selected topic. A supplied fact belongs only where it helps the task: "I'm staying at the surf camp." does not help rent a surfboard. *Usefulness.*

### Likely exchanges

- **One opening line.** The first turn of an exchange has exactly one option. *Conversation flow.*
- **Alternatives must differ.** Add an option only when it changes the information, decision or next action. The best alternatives show a different response, such as a yes and a no. Wording variants fail ("Of course, what do you need?" / "No problem, how can I help?", "Sorry, I'm not from here either." / "I'm a tourist too."), as do low-value pairs ("I'm glad you like it." / "Thank you, it's a family recipe.") and arbitrary number swaps. *Usefulness.*
- **Short lines.** Exchange lines stay short and reusable. Judge length against short, memorable English, not ability: ability selects material, not grammar difficulty. A 14-word line such as "I'm looking for a landmark, but I'm not sure I'm going the right way." is too long. *Naturalness and reusability.*
- **Continuations follow the first option.** Later turns continue only the first option of earlier turns. Incoherence is minor unless it teaches a wrong meaning, such as confirming a reversed route ("Go left, then right at the fountain." → "Right, then left at the light?"), which is material. *Conversation flow.*

### Words

- **Dictionary items.** Words and short fixed items ("come in") are good. Never split a fixed item into a misleading fragment ("excuse" from "excuse me"). Whole set phrases ("make yourself at home") are borderline and usually belong in Things to say. Use base forms ("bring", not "brought"). *Usefulness.*
- **Broad, not repeated.** Prefer new, useful words over repeating the same family across topics (left/right/straight in every directions topic). *Usefulness.*
- **Family size.** One to three families of two to six Words each. A useful family of four is better grown to six than cut to three: an extra Word loses value far more slowly than an extra phrase. An empty list is still right when a topic has no vocabulary of its own. The current prompt asks for small families and the parser trims topics to ten Words (a warning, see outcome classes). *Usefulness.*

### Example conversation

- **Room for composition.** Longer and compound sentences and slightly more advanced composition are welcome here, unlike Things to say. A relevant conversation can pause or end in many plausible ways; not reaching a preferred ending is a suggestion, not a failure. *Conversation flow.*

### Not required

Missing useful extras — cardinal directions, opposites of compliments ("ugly", "terrible"), "for you" with gifts — are improvement suggestions, never deductions by themselves.

## Translation and repair checks

Check these separately; one passing does not establish another.

- Raw response contract versus normalized application validity and failure level.
- Translation fidelity versus English-origin defects: do not blame a faithful translation for its source's content.
- Written target text, reading and romanization agreement; structural reading validity does not establish pronunciation accuracy.
- Word lemma, target-language part of speech and `senseKey`; a correct English display equivalent does not establish target grammar.
- Source snapshot and UTF-16 span identify the intended lexical occurrence; an inflected occurrence can validly support a dictionary lemma.
- Material risk disposition, reviewer confidence and unresolved linguistic disagreement.
- C: localized detection, missed defects, false alarms, known-location repairs, applied repairs, new harm, unchanged controls and evidence retained.

## What to score in each kind of comparison

- **Prompt comparisons** (same model, different prompt): score every rule above. The prompt is what changed, so it owns all of them.
- **Model or reasoning comparisons** (same prompt): score only rules the current prompt asks for. Report rules the prompt does not request as separate counts, so a model is not penalized for following the prompt. With the prompt adopted on 2026-11-12, only **family size** falls in this group.
- Use the same frozen inputs, settings and rubric version on both sides, and alternate calls between sides when timing matters.

## Review records and citations

A review record contains: context ID, lane, artifact SHA-256, rubric version, reviewer, the lane's dimension scores (or null), findings, uncertainties and a disposition of `usable`, `material-failure` or `unresolved`. `unresolved` means "cannot confidently decide whether a correction is needed; leave unchanged and record the question".

Each finding contains: path, exact quote, impact, severity, origin, confidence and disposition. Use concrete array indexes in the actual artifact, plus the stable handle where available (`items[e:0]` in examples below means the item whose handle is `e:0`, not JSON syntax).

Rules:

- Citations quote the actual artifact, not an expectation or a normalized reconstruction presented as raw output.
- Name the documented pipeline step and scope; A/B/C are lanes, not checkpoints or endpoint outcomes.
- Separate current implementation from intended policy, failed attempts from recovered endpoints, and technical outcomes from quality severity.
- Mark dependent unavailable work as blocked, not run or not assessed, not as another failure; a saved parser replay does not establish a final endpoint outcome.
- C: strict location mismatches are not semantic miss/false-alarm judgments; coverage is independent of correctness, and incomplete review blocks whole-topic correction even when a known-location patch is valid.
- Material linguistic disagreement stays unresolved pending qualified review.
- Promotion thresholds, sampling, repetitions and stop rules belong to each comparison's decision, not to this rubric.

## Calibration examples

| Example | Observation | Assessment | Why |
|---|---|---|---|
| Missing essential | The learner must explain a peanut allergy, but every Things to say entry only asks about ingredients. | Coverage 2 | Useful questions exist, but the learner still needs an allergy statement. |
| Reversed negation (B) | English "I cannot eat peanuts."; Spanish "Puedo comer cacahuetes." ("I can eat peanuts."). | Material meaning and safety error, translation origin | Valid JSON does not mitigate a reversed meaning. |
| Ordinary repetition | Two dance invitations repeat the request, followed by usable acceptance and refusal options. | Conversation flow 3 | Polish would help; no correction is needed. |
| Inflected evidence (B) | Chinese lemma 买 ("buy") supported by 我买了茶。 span [1,3) selecting 买了 ("bought"). | Keep the source | An inflected occurrence can support a lemma. |
| Ambiguous word (B) | "Light" alone could mean weight or illumination; unrelated context does not decide it. | Unresolved, score null | Do not manufacture a definitive correction. |
| Rejected repair (C) | A proposal fixes one word but has an invalid envelope; validation keeps the original topic. | 0 credited fixes | Count the delivered result; record the proposal failure separately. |
| Generic opener (A) | "Excuse me, could you help me?" in Things to say; splitting it into "Excuse me." then repeated it in every topic. | Generic-language finding | Generic phrases displace situation-specific language. |
| Paraphrase options (A) | "Of course, what do you need?" / "No problem, how can I help?" | Minor, usefulness | The second option adds no information or action. |
| Off-topic fact (A) | "I'm staying at the surf camp." under "Rent a surfboard". | Minor, usefulness | A supplied fact is not useful for every topic. |
| Padding (A) | Eight Things to say and four exchanges, two of which cover the next topic's subject. | Usefulness 2, coverage 4 | Coverage is complete, but a third of the cards will not be used here. |

## Decision log

Newest first. Dates are review dates; quotes in rules above come from the runs named here.

| Date | Decision | Source |
|---|---|---|
| 2026-11-14 | Words: one to three families of two to six Words each; an extra phrase or turn loses value much faster than an extra Word. | Owner, after the usefulness-first re-review |
| 2026-11-14 | English-generation dimensions reordered: usefulness (phrases and vocabulary) first, then correctness and fit, then coverage, these three close; then naturalness and reusability; then conversation flow. Usefulness replaces vocabulary usefulness for lane A, and paraphrase alternatives, off-topic lines and overlap now count against it. High coverage that brings in unused items lowers value. | Owner, after reviewing candidate R3 outputs |
| 2026-11-14 | Titles name the moment or the choice, not the people; the best alternatives show different responses such as a yes and a no. | Owner, after reviewing candidate R3 outputs |
| 2026-11-12 | Thanks to hosts ("Thank you for inviting me to your home.") count as generic language. | Owner, after the prompt candidate-4 comparison |
| 2026-11-12 | Invalid JSON is reported with its likely cause but is not a prompt regression; it will be fixed outside the prompt. Count overruns are warnings; failure only at about 10× the limit. Latency is a production issue, not a prompt criterion. | Owner |
| 2026-11-12 | Placeholders are neither avoided nor penalized until the placeholder feature exists; the no-placeholders rule is removed. Over-specific invented learner facts remain a finding. | Owner, after candidate-3 invented specifics |
| 2026-11-12 | Rubric moved to this readable file; prompt comparisons score every rule. | Owner |
| 2026-11-11 | No generic language in Things to say or Words at any level or in any topic; generic topics still need situation-specific lines. | Owner, after prompt candidate-1 repeated "Excuse me." in every topic |
| 2026-11-11 | No "Do you speak English?" content anywhere. English contractions are not scored. | Owner, after the model comparison |
| 2026-11-11 | Polite openers are fine in exchanges and the example conversation. "excuse" is a poor fragment of "excuse me". | Owner, model comparison review |
| 2026-11-11 | Naturalness and reusability added as a dimension and made the top A priority; continuation errors are minor unless they teach a wrong meaning; alternatives must genuinely differ; one opening line per exchange; short exchange lines; the example conversation may be longer. | Owner, baseline review of the DeepSeek English output |
