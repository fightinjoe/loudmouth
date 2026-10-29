# Evaluation log — A/B collection, 2026-10-28

**RECAP:** A is the model step that writes **English** essentials, vocabulary and an example conversation.
B separately translates **fixed authored English**, not these A responses. On October 28 we made ten
additional calls to A and ten to B: two responses for each of five unchanged situations. We also kept
one earlier response per situation and step. No errors were deliberately inserted.

**GOAL:** Understand the observed parser incompatibilities and learning-content weaknesses before
accepting a comparison baseline. This is a working findings log, **not an accepted baseline or a
pass/fail quality gate**. The reporting correction follows user feedback about overly strong judgments.

**RESULT:** All 20 additional provider calls completed. Of the ten additional A responses, the existing
application parser rejected four: **two for more than ten dialogue entries, two for forbidden fields**.
The other six were accepted, including two with recoverable normalization warnings. B's ten additional
responses were accepted structurally; that does not establish translation quality.

The earlier report mixed these measured parser results with assistant-proposed quality judgments.
In particular, **“We'll do our best to accommodate you” is relevant dialogue, not a failure**. A separate,
observable issue is that the parser dropped a standalone refusal phrase. Those are different claims.

## What the response labels mean

| Label used here | Meaning | Former shorthand / machine ID example |
|---|---|---|
| Earlier response | One previously collected model response reused without another generation call | “Retained”; `a-allergy-ja-retained` |
| Additional response 1 | First of the two newly collected responses to the same situation and unchanged request | “Fresh 1”; `a-allergy-ja-new-1` |
| Additional response 2 | Second newly collected response to that same request | “Allergy 2” / “Fresh 2”; `a-allergy-ja-new-2` |

“Fresh” meant **newly generated**, not improved, corrected or newly accepted. The number identifies a
repeat call, not a score, turn number, defect number or different allergy scenario. We now spell it out.
Each of A and B therefore has fifteen observations: five earlier and ten additional responses.

A always writes English. Its situation labels mention the eventual target language only to identify
the case: shoes/Chinese, allergy/Japanese, tea/Czech, lost bag/Ukrainian and pottery/Spanish.

## Step-aligned outcomes, not a blanket A/B verdict

Use the [phrasebook pipeline](../../docs/api/phrasebook.md#pipeline-and-step-outcomes) and
[evaluation criteria](../README.md#step-outcomes-and-criteria). The same observation can contain a
successful provider call, valid JSON, a warning-producing transformation, and a separate quality
concern. Each statement below names its scope and evidence source.

| Checkpoint / scope | Observed outcome in this collection | What it does not establish |
|---|---|---|
| `english.call` / ten additional live calls | Success: all ten provider calls completed | Not proof of valid or useful content |
| `translation.call` / ten independent fixed-English live calls | Success: all ten completed | Not a dependent continuation of these A responses |
| `english.decode` / ten saved English replies | Success: syntactically valid JSON | Extra keys and hard bounds are required-validation concerns, not JSON syntax errors |
| `english.validate` / ten saved parser paths | Six successes; four failures under the current strict checks, detailed below | Not four observed full-endpoint failures; no production retry sequence was exercised |
| `english.normalize` / the six accepted parser paths | Two recoverable list-clamping warnings; retained/dropped values shown below | Not a declaration that every dropped phrase is unimportant or every quality concern is fatal |
| `translation.validate` / ten saved B parser/assembly paths | All accepted structurally | Not linguistic certification or a full live endpoint result |
| `english.quality`, `translation.quality` / assistant content review | Attributed concerns and improvement suggestions | Not provider/parser failures or agreed endpoint rejection thresholds |
| `/phrasebook` / complete live endpoint | Not exercised by these individual native calls and saved parser replays | No measured final endpoint-success/failure rate |

Some checkpoints share one current parser function and were not logged as independent runtime events.
The IDs above attribute existing evidence; they are not a claim of newly instrumented execution.

A **material finding** was a reviewer's proposed classification that an important meaning or task intent
needs correction or supplementation. It was **not** a provider error, an automatically measured fact,
or an agreed rejection threshold. The original four-dimensional scores are historical assistant
assessments under proposed rubric 1.2. Their counts must not be presented as settled quality failures.

A relevant conversation can pause, branch, or continue in many plausible ways. Not reaching a preferred
ending is an improvement suggestion, not itself a failure. An unrelated reply, a concrete contradiction,
a reversed meaning or misleading role assignment needs its own quoted evidence and explanation.

## A: why exactly were four additional responses rejected?

At the current `english.validate` checkpoint, dialogue must contain **2–10 entries**, each with
`speaker` and `text`, and raw `alternative` is rejected. `english.normalize` derives local alternatives
from adjacent same-speaker entries. **Intended policy:** ignore raw `alternative` with a warning when
required content remains safe, rather than reject or retry just to remove it. That change is not yet
implemented. A dialogue entry is one speaker turn, not a displayed or wrapped line of text.

| Situation / observation | Current required structure | Actual returned value | Observed `english.validate` result / saved attempt |
|---|---|---|---|
| Shoes — additional response 1 | No raw `alternative` field | Dialogue entry 6 includes `"alternative": "Here's the next size up."`; total dialogue entries: 10 | ❌ `conversations[0].lines[5].alternative is not allowed` |
| Shoes — additional response 2 | At most 10 dialogue entries | `lines.length = 12`; entries 11–12 ask for a hold and answer it | ❌ `conversations[0].lines must contain 2 to 10 items` |
| Lost bag — additional response 2 | No raw `alternative` field | Dialogue entry 8 includes `"alternative": "You can leave it with me."`; total entries: 8 | ❌ `conversations[0].lines[7].alternative is not allowed` |
| Pottery — additional response 1 | At most 10 dialogue entries | `lines.length = 11`; the final entry answers materials/firing and collection | ❌ `conversations[0].lines must contain 2 to 10 items` |

For example, the shoes response returned this exact sixth dialogue entry:

```json
{
  "speaker": "partner",
  "text": "Certainly, let me get a larger pair for you.",
  "alternative": "Here's the next size up."
}
```

The sentence is relevant. **Its extra field is incompatible with the current parser.** This is not a
claim that offering the next size up is a bad conversation response. An allowed raw entry has only
`speaker` and `text`; changing the response or parser was not part of this evaluation.

Under the intended policy, this example would instead be an `english.normalize` **warning**:
ignore `"alternative": "Here's the next size up."`, retain the valid speaker/text and derive any
alternative marker from adjacency. The warning preserves the question **why was the field added?**
This is a policy example, not an observed successful replay or a diagnosis of the field's origin.


The eleven-entry pottery response ends with:

```json
{
  "speaker": "partner",
  "text": "Yes, everything is included. You can collect it the following week."
}
```

Again, that reply is relevant. Rejection is caused by **the array having eleven entries**, not by this
sentence being wrong. The parser rejects excessive continuous dialogue rather than cutting off a turn.

**Answer to “is more than ten lines the primary failure?”:** it explains **two of four additional A
rejections**; forbidden fields explain the other two. Including the earlier pottery response, there
are **five parser rejections among fifteen A observations: three length violations and two forbidden
fields**. This small sample does not establish their frequency in production.

## A: allergy — additional response 2, with the actual values

### Conversation ending: warning/opportunity, not failure

The returned conversation ends:

```json
[
  {
    "speaker": "you",
    "text": "I have a severe peanut allergy. Even a small amount is dangerous for me."
  },
  {
    "speaker": "partner",
    "text": "I understand. We'll do our best to accommodate you."
  }
]
```

**Expected:** a relevant continuation of an allergy conversation, not one predetermined answer.
**Actual:** a relevant acknowledgement. It neither guarantees safety nor reverses the learner's meaning.
**Current interpretation:** ⚠️ The example could continue with ingredient/equipment questions or a refusal,
but stopping here is an improvement opportunity, **not a demonstrated conversational failure**.
The original review category `incomplete_task_progression` called it material; that classification is
superseded by this warning. Its flow score of 2 remains a historical proposal, not an endorsed score.

### Standalone essentials: a phrase was actually dropped

**Expected learner intent, from the supplied task:** “If staff cannot confirm safety, I will not eat the
dish.” Essentials are standalone learner phrases, separate from the example conversation.

The model returned these **nine** essentials, in this order:

```json
[
  "Excuse me, is there a manager I can speak to?",
  "I have a severe peanut allergy.",
  "Even a small amount is dangerous for me.",
  "Does this dish contain peanuts?",
  "What about peanut oil?",
  "Is this cooked with the same oil or utensils as peanuts?",
  "Does the sauce have any peanut ingredients?",
  "Can you check with the kitchen, please?",
  "If you can't confirm it's safe, I won't order it."
]
```

**Actual `english.normalize` result:** recoverable warning, `failureLevel = 1`, followed by accepted
required output. The parser keeps **the first eight essentials** and drops the ninth:

> If you can't confirm it's safe, I won't order it.

The last retained essential is “Can you check with the kitchen, please?” The refusal is also absent
from the example dialogue. Thus the generated refusal existed, but the application representation no
longer offers it as a standalone phrase. “Normalization loss” meant **this concrete removal**, not that
the manager's acknowledgement was wrong. The parser's eight-essential limit and recoverable clamping
are existing behavior, not introduced by this run.

**Current interpretation:** `english.normalize` has a demonstrated, recoverable list-clamping warning.
The separate `english.quality` concern is loss of a requested communication option, **not a parser
rejection or an unsafe-meal verdict**. The original reviewer proposed coverage 2 / “material” severity;
task-level failure is not an agreed acceptance rule. No new score is manufactured here.

## A: other review observations, shown rather than asserted

| Situation / observation | Expected behavior | Actual returned / retained values | Current interpretation |
|---|---|---|---|
| Lost bag — additional response 1 | Traveller asks where lost property is and where to leave a phone number; staff answers | `partner`: “Where is lost property?” → `you`: “It's over there, near the information desk.” Then `partner`: “Can I leave my phone number?” → `you`: “Yes, you can leave it at the lost property office.” | ⚠️ Concrete role mismatch for this supplied situation. The dialogue casts the traveller as the source of office information; standalone essentials still contain the correct questions. This is a content concern, not a parser failure or proof that the whole topic is unusable. |
| Pottery — additional response 2 | Retain independently useful price/time questions where possible | Returned essential 9: “How much does the class cost?”; essential 10: “What times do you have available?” Both are dropped by the eight-essential clamp. The dialogue still asks “How much does it cost, and is the clay included?” and books Saturday at 10 for 35 euros. | ⚠️ Standalone-phrase improvement opportunity; do not claim the topic lacks price/time information. Parser accepted with `failureLevel = 1`. |
| Pottery — additional response 2 | Alternative replies should fit their surrounding exchange | Raw staff turns: “We have a hand-building class on Saturday from 10 to 12.” / “We also have one from 2 to 4 in the afternoon.” The parser marks the latter `alternative: true`; next learner turn: “The morning class works for me. How much does it cost, and is the clay included?” | ⚠️ Potential branch inconsistency if the afternoon reply substitutes for the morning reply. The complete raw sequence is coherent. This is not a demonstrated UI failure; no UI selection was exercised. |
| Allergy — additional response 1 | Do not teach that visible-peanut removal makes a dish safe | Staff: “It has peanut oil, but we can remove the peanuts.” Learner: “Even a small amount is dangerous. If you can't confirm it's safe, I won't eat it.” | ⚠️ A questionable staff suggestion that the learner rejects. Not an endorsed safety assurance or automatic whole-topic failure. |
| Tea — both additional responses | Cover black tea, no sugar, optional lemon, drinking in and card payment | For example: “No sugar, please. With lemon, if you have it.” → “Yes, we have lemon. Here you are.” Price and card-payment questions follow. | Usable exchange; no extra scripted acceptance of lemon is required. |

## B: examples of fidelity concerns, not parser failures

B received the same fixed English for both additional calls in each situation. These examples distinguish
an observable text mismatch from an assistant's judgment about its importance. No translation was repaired.

| Situation / observation | Expected behavior / frozen English | Actual normalized value | Why it merits review |
|---|---|---|---|
| Tea — both additional responses, and earlier response | “Forty-five crowns. Will you drink it here or take it away?” Preserve the amount 45. | `Padesát korun. Budete to tady, nebo s sebou?` | `Padesát` means fifty, not forty-five: a specific numerical fidelity error, independent of how the conversation continues. |
| Allergy — additional response 1 | For “I cannot eat even a small amount,” visible Japanese and pronunciation should agree | `少しでも食ることができません。`; raw annotates `食[たべ]る` rather than retaining written `べ` | Visible `食る` is malformed spelling. Reviewers did not establish a negation reversal or allergen substitution. |
| Allergy — additional response 1 | Peanut vocabulary should agree with ruby `らっかせい` / phrase-level `rakkasei` | Vocabulary romanization: `rakkakasei` | Extra `ka` creates conflicting pronunciation for the same word. |
| Shoes — additional response 1 | Preserve the written demonstrative in “These are comfortable. How much is this pair?” | Raw price question: `[zhè]双[shuāng]鞋[xié]多[duō]少[shǎo]钱[qián]？`; normalized question fragment: `双鞋多少钱？` | `zhè` lacks a written `这`; the parser removes the unattached reading, leaving a missing demonstrative. |
| Pottery — additional response 2 | Written Spanish should contain actual accented letters | `Me gustar&iacute;a reservar una plaza para la clase de cer&aacute;mica del s&aacute;bado.`; word card `cocci&oacute;n` | Literal entity text survives parsing. It is not the correctly accented string. No additional UI decoding step was observed or assumed. |

These are assistant-reviewed linguistic concerns, not qualified native-language or medical certification.
Other judgments, such as Mandarin tone conventions or Ukrainian masculine `забув` with unspecified learner
gender, remain applicability/usage questions rather than categorical failures.

## Where the judgments came from, and what remains durable

- **Earlier responses:** `BaselineEnglishReview` and `BaselineTranslationReview` assessed five responses
  each. Their original records are in [review.json](review.json).
- **Additional responses:** `FreshEnglishBaselineReview` and `FreshTranslationBaselineReview` assessed
  ten each. These names identify assistant review jobs, **not models being tested or human experts**.
  They read the exact request, returned text and parsed result before rubric examples, without candidate
  names, prices, timing or earlier grades. Original records are in [collection-review.json](collection-review.json).
- **No paid model judge ran.** Review job names containing “Fresh” are historical identifiers only.
  Proposed grades and severity labels were not produced by the production parser and were not approved
  as final acceptance decisions. This log's corrected interpretations supersede the disputed presentation;
  original reviewer records and counts remain unchanged as history.

| File / location | Intended role and retention boundary |
|---|---|
| `evals/README.md`, `evals/rubric.json`, evaluation code and authored fixtures | Reusable guidance and tooling; not individual experiment logs |
| `log-findings-2026-10-28.md` — this file | Dated, human-readable working log with selected exact evidence embedded above. Understandable without prompt-romp files; not an accepted baseline. Reporting edits stay uncommitted pending explicit instruction. |
| `review.json`, `collection-review.json` | Historical assistant review records, including disputed grades and severity labels; not normative quality gates |
| `collection-results.json` | Historical measured call receipts and parser summaries; raw-artifact paths are provenance locators, not durable attachments |
| `approval-request.json`, `execution-approval.json` | Historical frozen proposal and actual authorization. Unchanged; no new spending authorized. |
| `.prompt-romp/...`, native experiment/run IDs and review packets | Ignored local working data. **Temporary and not guaranteed to survive.** Not a dependency for reading this log. |

Hashes identify bytes if the original artifact is available; **they do not preserve or reconstruct it**.
The selected quotations and structural counts above are retained evidence, not a full raw-run archive.
Full replay of these specific observations depends on local artifacts and is not guaranteed long term.
No accepted, portable/replayable baseline is claimed. We will not automatically commit mixed results,
copy local experiment trees into Git, delete existing evidence, or rewrite the previous commit.

## Collection logistics and scope

| Step | Additional provider calls | Reported spend / approved maximum | Provider/transport failures |
|---|---:|---:|---|
| A — English | 10 | $0.002433104 / $0.04 | — |
| B — fixed-English translation | 10 | $0.027543100 / $0.18 | — |
| Total | 20 | $0.029976204 / $0.22 | — |

A ran first; its provider/charge gate passed before B. No retries, paid judges, C, repairs, prompt/model
changes or deployment ran. Source receipts are [collection-results.json](collection-results.json).
A used `deepseek/deepseek-v4.1-flash` / Relace; B used `google/gemini-3.5-flash-lite` / OpenRouter Vertex
global with explicit minimal reasoning, not production's direct-Vertex transport. Both used a 6,000-token
output limit and serial concurrency 1. This is not a production-latency or model-ranking comparison.

| Application parser | Earlier responses | Additional responses | All observations |
|---|---:|---:|---:|
| A — accepted | 4/5 | 6/10 | 10/15 |
| B — accepted | 5/5 | 10/10 | 15/15 |

The same five exposed contexts provide only descriptive evidence: three observations per context and
step, one scenario per target language, no unseen holdout, conversational learner or multi-topic coverage.
Review interpretation and archival adequacy remain unresolved. Further calls, prompt edits, baseline
acceptance and Git commits require their own explicit direction; C remains paused.
