# Diagnostic calibration findings — 2026-10-28

**RECAP:** This was the first paid diagnostic exercise of the already-built evaluation pipelines:
5 new English-generation calls (A), 5 translations of fixed authored English (B), and C's 12 detection
calls plus 7 separate repair calls. A and B were independent, not an end-to-end A→B run. C used saved
bilingual examples with deliberately inserted errors; repair calls were told where to look.

**GOAL:** Check whether the evaluation method distinguishes usable content from merely valid data,
and measures error detection separately from correction, before comparing models. For C, finding an
inserted error is a success; changing a correct or unestablished example without justification is not.

**RESULT:** ⚠️ The sample exposed English/translation issues and a C review-coverage blocker.
✅ C recognized all six inserted errors; ❌ it declared review complete for **0/6** defective examples
(target **6/6**, so higher is better), preventing all detector-gated corrections. Separate repair
responses passed the six supplied defect checks but failed one leave-unchanged probe. This is not
linguistic acceptance or permission to compare candidates.

## Run logistics

| Item | Observed |
|---|---|
| Authorized model calls | ✅ 29/29 completed |
| Reported spend / approved maximum | $0.034841798 / $0.40 |
| Execution failures | — None; no provider errors, uncertain starts, unknown charges or overruns |
| Retries, fallback, paid judges or production changes | — None |

This historical report's presentation was clarified later; measurements, observations and approvals
were not changed. See the [C response key](../README.md#c-review-response-plain-language-key) for
`complete`, findings, item IDs (“handles”) and unresolved items. ✅/❌ mark the named check only,
not overall linguistic quality. The [later detection-only run](c-recalibration-findings.md) is separate.

Approval provenance: the user's actual reply **“approved”** bound the preceding 29-attempt/$0.40
package. [`execution-approval.json`](execution-approval.json) records it separately; the original
[`approval-request.json`](approval-request.json) remains an immutable assistant proposal. Native brief
and execution approvals bind its exact four prepared-plan hashes. That approval grants no rerun.

## Measured execution

Native Romp is the sole execution/accounting engine. Raw calls, receipts and saved-response inputs
remain in the ignored working root identified in [`results.json`](results.json), not Git.

| Stage | Calls | Reported USD | Request median / max | Native run wall time | Input / output tokens |
|---|---:|---:|---:|---:|---:|
| A — English | 5 | 0.001464798 | 1.641s / 2.537s | 8.887s | 5,705 / 2,242 |
| B — fixed-English translation | 5 | 0.013062800 | 2.271s / 3.692s | 13.521s | 12,201 / 3,761 |
| C — detection | 12 | 0.012157200 | 1.167s / 1.434s | 14.088s | 33,149 / 885 |
| C — known-location repair | 7 | 0.008157000 | 1.314s / 1.898s | 9.478s | 18,965 / 987 |

One repetition, serial concurrency 1; request durations exclude queue time. Stage wall times are not
learner end-to-end latency and exclude pauses between stages. A reported 896 cached input tokens;
B/C reported none. All calls reported zero reasoning tokens despite B/C requesting minimal reasoning.
No p95, repeatability, prevalence or prompt-change token/latency effect is established by this sample.

Public model/provider metadata was rechecked before execution: no observed alias, selected-route,
capability or quoted-rate drift. Actual provider labels were Relace for A and Google for B/C; frozen
requests forbade fallback and selected the approved routes. OpenRouter aliases are not immutable
revision pins. B/C's OpenRouter Vertex global/minimal-reasoning configuration is not production's
direct-Vertex transport or an exact production-parity claim.

## Review authority and coverage

Separate assistant reviewers assessed all five A outputs, all five B outputs, all twelve detector
outputs and all seven known-location patches; the integration assistant checked parser/application
results and inspected assembled B card data. These are attributable peer assistant assessments, not
blind reviews, qualified native-speaker adjudication, medical advice or numeric quality scores.

The current fixture/rubric expectations remain **proposed**. No label was changed to make an observed
response pass. Existing uncertainty handling accepts a clean or uncertain unchanged Chinese keep/hold
judgment without inventing a missed defect. Pronunciation findings are graded by learner impact.

The rubric's checkpoint status was advanced only after execution; its priorities, scores and fixture
expectations were not re-pinned. The approval package retains the original execution-time rubric hash.

## A — English usefulness and technical validity

**✅ 4/5 production-parser passes; ❌ 1 rejection.** Shoes, allergy, tea and lost-bag essentials preserve the supplied
core facts; peer review found no confirmed material essential-content defect in those four observations.
Vocabulary is relevant and reusable. This is not certification of every wording choice.

- **Pottery technical rejection:** `/conversations/0/essentials` has 10 entries and `/lines` has 12.
  Production first clamps essentials to 8, then rejects dialogue: `conversations[0].lines must contain
  2 to 10 items`. The removed raw essentials are “How much is the class?” and “Can I book a place now?”
  No portion of this rejected observation is demonstrated delivered content. Record the failure; do
  not silently truncate dialogue or change the parser to conceal it.
- **Pottery raw-only coverage:** staff offer “Saturday at 10 a.m. and another at 4 p.m.” at
  `/conversations/0/lines/3/text`; the learner reaches “Great. Can I book a place now?” at `/lines/10/text`
  without choosing a time, and essentials provide no time-selection phrase. The supplied goal requires
  agreeing time and euro price before booking. Record missing independently useful time-agreement
  language separately from the parser rejection; any prompt remediation requires separate approval.
- **Allergy dialogue organization:** consecutive partner entries `/conversations/0/lines/4–5` say
  “No, the sauce is peanut-free.” then “I'm not sure about the oil. I'll ask the chef.” These are
  complementary answers, but production marks the second as an alternative, as it also does at
  `/lines/2`. Essentials still state severe allergy and refusal without confirmation. Record a localized
  source-dialogue/alternative-semantics mismatch, not a demonstrated medical-safety reversal.

## B — translation, pronunciation and lexical evidence

**✅ 5/5 production-parser passes; linguistic quality is not implied.** B translated fixed authored
English, not these live A outputs. No paid A→B study was performed.

| Context and path | Exact observed discrepancy | Impact and proposed action |
|---|---|---|
| Czech tea, `/lines/3` | English “Forty-five crowns. Will you drink it here or take it away?” → `Padesát korun. Budete to tady, nebo s sebou?` | Fifty replaces forty-five: material quantity error. Proposed amount: `Čtyřicet pět korun`; preserve English. |
| Japanese allergy, `/essentialsRomanizations/4` | Written `確認できない場合は、この料理は食べません。`; English “If you cannot confirm, I will not eat this dish.”; Latin text ends `kono ryōri wa taberaremasen.` | “Cannot eat” differs from written “will not eat”; localized pronunciation/wording mismatch, not reversed negation or a safety assurance. Proposed ending: `kono ryōri wa tabemasen.` |
| Japanese allergy, `/lineRomanizations/7` | English “Understood. I will not place the order.”; written `承知いたしました。注文は控えておきます。`; Latin text `Shōchi itashimashita. Chūmon wahikaete okimasu.` | Minor learner-readable spacing defect. Proposed `Chūmon wa hikaete okimasu.` |
| Chinese shoes, `/vocab/4/source` | English “price” → `价格`; hint selects surface `多` in dialogue 6, `这双很舒适。这双多少钱？` | Exact occurrence exists, but `多` is part of “how much,” not lexical evidence of the noun `价格`. Omit the optional hint or supply genuine lexical evidence; retain the valid word card. |
| Chinese shoes, `/lines/2`, `/lines/7`, `/lines/9` | Raw annotations contain `。[mǎ]。`, `。[yuán]。`, `。[kàn]。` respectively | Assembled cards remove punctuation ruby, so duplicated spoken syllables are **not** observed. Duplicate `。。` survives in card text/reading. Minor punctuation quality defect, not a whole-topic or rendering failure. |

Assembled-card smoke inspection confirmed the two Japanese Latin-text defects and the Chinese `多`
source span survive normalization. Chinese duplicate stops appear at
`/groups/0/dialogue/{2,7,9}/card/text`; their reading segments are `["。。", null]`.
No actual web/TUI rendering or listening assessment was performed.

The Chinese `/vocab/2/source` hint separately selects `舒` in an essential that does not contain it.
Production records `vocab-source-missing` / `unresolved`, retains the card and omits that source;
this optional-source diagnostic is not a translation failure.

No confirmed high-impact contradiction was found in Japanese peanut/severity/tiny-amount/refusal
content or Ukrainian Lviv→Kyiv, today-at-14:30, blue-bag/passport/lost-not-stolen content. Spanish
preserves one place, Saturday ten-to-twelve, 40 euros, hand-building/no wheel and delayed collection.

Remaining qualified-review questions: Mandarin register, redundant size wording and dictionary-tone
versus contextual-tone conventions; Czech black-tea meaning granularity and gender applicability;
Ukrainian masculine `забув` applicability; Spanish `cochura` regional familiarity. These are not
confirmed defects or automatic failures. The disputed `保管` wording does not occur in live B.

## C — detection is not the same as a usable correction

All **12 detection envelopes validate**. The five controls return complete, empty findings; the
unscored keep/hold probe also returns a defensible clean judgment. ✅ All **six deliberately inserted
errors are recognized in the detector's reasons**. ❌ Each response nevertheless says `complete:false`
(“I did not finish reviewing the whole topic”), with no item-specific uncertainty entries.
The correction step therefore retains each original defective topic and applies **zero** field edits.
An empty `unresolved` list does not override the incomplete-review flag. Why the model returned false
is unknown; interpreting it as “not clean” is only a hypothesis.
Keep this fail-closed boundary; do not silently reinterpret the flag to manufacture correction success.

Strict authored `handle + field + category` matching yields **2 matches, 4 misses and 5 unmatched
predicted locations**. These are not four unnoticed linguistic defects plus five independent false
alarms: four unmatched predictions concern the recognized defects but use different attribution.

| Case | Actual detector response vs expected item/field/category | Meaning/impact assessment |
|---|---|---|
| Chinese size | `e:0/translation/meaning` vs `e:0/text/meaning` | Correctly notices `三十八号` (38) against “I usually wear European size 39.” Wrong field points at correct immutable English. |
| Chinese reading | `e:2/reading/reading-accuracy` vs `e:2/reading/reading-romanization` | Correctly notices `xiǎo` vs `dà` for `有大一码的吗？` / “Do you have one size larger?” Same recognized spoken-meaning defect, different allowed category. Material impact; critical label is excessive here. |
| Japanese allergy | `e:0/translation/meaning` vs `e:0/text/medical-safety` | Correctly notices `ピーナッツアレルギーはありません。` denies “I have a severe peanut allergy.” Wrong field/category; critical impact is justified by the severe-allergy denial. |
| Czech sugar | Exact `e:0/text/meaning` match | `s cukrem` contradicts “without sugar.” Material order error; no supplied medical condition supports critical severity. |
| Ukrainian route | `e:1/translation/meaning` vs `e:1/text/meaning` | Correctly notices Kyiv→Lviv reverses Lviv→Kyiv; wrong field. Material search-direction error; immediate critical safety risk is not established. |
| Spanish wheel | Exact `e:2/text/meaning` match | `con torno` contradicts “by hand, without a wheel.” Material class-modality error, not established critical risk. |

**One genuine extra false alarm:** Ukrainian `d:2/translation/meaning` is flagged because of the
contradiction with bad `e:1`, although its target `У поїзді зі Львова до Києва. Він прибув сьогодні о 14:30.`
already matches “The train from Lviv to Kyiv. It arrived today at 14:30.” Localize correction to `e:1`;
do not rewrite correct dialogue. No additional damage was applied in the offline composition.

### Known-location repair, separately

All **7 patches are application-valid**. All **6 authored-defect repairs pass their exact supplied
checks**: size 38→39 with aligned pinyin; reading-only `xiǎo`→`dà`; allergy denial→severe-allergy statement
with aligned ruby/Latin text; `s cukrem`→`bez cukru`; reversed route→Lviv-to-Kyiv;
`con torno`→`a mano, sin torno`.
Patches address only the requested handle, propose no English/dictionary/source-snapshot rewrites,
and remove no sources. This is oracle-assisted evidence, not end-to-end C success or independent
neutral-request repair behavior. No repair calls were made on the five correct controls.

**Abstention-probe failure:** “Can you keep these for me?” / `可以帮我保管这双鞋吗？` at `/items/4`
is rewritten to `可以帮我留一下这双鞋吗？`, with an aligned reading change. That fails the approved
leave-unchanged preservation probe; it does **not** establish that either wording is wrong, a corrected
known defect, or whole-topic failure. The clean detector-gated path retains the original. The probe
remains excluded from defect recall/false-alarm scoring.

Across all twelve offline composition checks, **56/56 historical source records are retained** and
English intent stays immutable. Because zero correction edits were selected, this preservation result
must not be presented as evidence that a repaired end-to-end topic was successfully delivered.

## Decision and next gate

The method exposes meaningful differences that parser success alone misses. It also exposes a C
coverage/attribution/severity bottleneck and the distinction between repair ability and repair restraint.
**Do not promote models, add a mandatory runtime reviewer or start candidate rankings from this sample.**

Before a separately authorized comparison: reconcile C's completeness/field/category expectations and
severity reporting; review the cited A/B findings and unresolved language questions; freeze any changed
instructions/rubric and obtain a new exact paid plan. Keep strict machine attribution and human semantic
recognition separate rather than silently relabeling this run. Production prompt edits require explicit
approval and representative before/after behavior, latency and token evidence. No such edit was made.
