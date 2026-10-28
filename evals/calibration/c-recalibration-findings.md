# C detection recalibration — 2026-10-28

**12/12 approved calls completed for $0.0132374 reported spend against the $0.23 cap.**
No provider/transport errors, uncertain starts, unknown charges, reservation overruns, retries,
fallbacks or paid judges were observed. No new A/B or repair calls, production changes or deployment.

The actual user reply **“approved”** followed presentation of the exact 12-call/$0.23 plan.
[`c-recalibration-approval.json`](c-recalibration-approval.json) binds that approval to the immutable
[proposal](c-recalibration-request.json), package hash and native prepared-plan hash. Provider metadata
was rechecked before dispatch with no observed drift. The approval is consumed, not reusable permission.

## Decision

**Attribution and severity agreement improved on this sample; coverage remains a blocker.**
Four defect responses still declare `complete:false`, including the severe-allergy denial. Preserve
the fail-closed correction gate. Do not force coverage true, credit withheld corrections, promote a
model or infer general reliability from one observation per exposed development case.

[Concise measurements and per-case outcomes](c-recalibration-results.json) retain the native run refs.
Original baseline findings, results and approvals remain unchanged. Both detector sets were reassessed
under the same proposed rubric **1.2**, not compared using different grading rules.

## Observed contrast

| Measure | Saved baseline | Revised detection instructions |
|---|---:|---:|
| Valid detection envelopes | 12/12 | 12/12 |
| Coverage-complete authored-defect reviews | 0/6 | **2/6** |
| Exact authored handle/field/category matches | 2/6 | **5/6** |
| Unmatched expectations / predictions | 4 / 5 | **1 / 1** |
| Severity disagreements with proposed authored labels | 4 | **0** |
| Correct controls with findings | 0/5 | 0/5 |
| Keep/hold uncertainty probe | Clean, unchanged | Clean, unchanged |
| Counterfactual repaired defect topics | 0/6 | **2/6** |
| Counterfactual applied field edits | 0 | **3** |
| Historical source records retained | 56/56 | 56/56 |

The remaining unmatched expectation and prediction concern the **same correctly recognized Japanese
allergy denial**, categorized `meaning` rather than the authored `medical-safety`. This is category
granularity, not an unnoticed safety contradiction plus an independent false alarm. All six new
findings point to the defective target field; none repeats the baseline's spurious Ukrainian dialogue
allegation. Semantic recognition remains an independent review judgment, not automatic metric credit.

## Concrete findings and learner impact

All item paths below refer to the corresponding complete topic's `items` array. English remains fixed.

| Context / path | Exact English and target contrast | Revised outcome and disposition |
|---|---|---|
| Chinese size, `/items/0/text` and `/items/0/reading` | “I usually wear European size 39.” vs `我平时穿欧码三十八号。` / `sānshíbā` (38) | Correct `e:0/text/meaning/material`; complete coverage. Saved patch changes to `三十九号` / `sānshíjiǔ`; **2 counterfactual field edits**. Preserve correct dialogue counterparts. |
| Chinese reading, `/items/2/reading/0/1` | “Do you have one size larger?” and written `有大一码的吗？` vs `yǒu xiǎo yī mǎ de ma` | Correct `e:2/reading/reading-romanization/material`; complete coverage. Saved patch changes only `xiǎo`→`dà`; **1 counterfactual edit**. Material spoken-meaning reversal, not unrenderable data or automatic critical severity. |
| Japanese allergy, `/items/0/text` | “I have a severe peanut allergy.” vs `ピーナッツアレルギーはありません。` (“no peanut allergy”) | Correct target field, critical risk and reason; category `meaning`, not authored `medical-safety`. **Incomplete coverage: correction withheld**, including the saved aligned reading/Latin-text patch. No claim of safety from recognition alone. |
| Czech tea, `/items/0/text` | “A black tea without sugar, please.” vs `Černý čaj s cukrem, prosím.` (“with sugar”) | Correct exact attribution and material severity; **incomplete coverage**, saved correction withheld. A changed preference is material here; no supplied medical condition warrants critical severity. |
| Ukrainian route, `/items/1/text` | “The train from Lviv to Kyiv arrived today at 14:30.” vs `Поїзд із Києва до Львова прибув сьогодні о 14:30.` (Kyiv→Lviv) | Correct target field and material severity; **incomplete coverage**, saved correction withheld. Correct `d:2`, `У поїзді зі Львова до Києва. Він прибув сьогодні о 14:30.`, is no longer spuriously flagged. |
| Spanish pottery, `/items/2/text` | “I would like to make a small bowl by hand, without a wheel.” vs `Quisiera hacer un cuenco pequeño con torno.` (“with a wheel”) | Correct exact attribution and material severity; **incomplete coverage**, saved correction withheld. Correct hand-building dialogue remains outside repair scope. |

The Japanese, Czech, Ukrainian and Spanish responses all emit an accurate finding with
`complete:false` and no unresolved handles. This declares incomplete review coverage under the
unchanged contract; it does not establish why the model chose false or that the defect was unnoticed.

Five correct controls return complete empty findings. The uncertainty probe “Can you keep these for
me?” / `可以帮我保管这双鞋吗？` also returns a defensible clean judgment. Whether that wording suitably
conveys holding retail stock remains unestablished; no invented duration or purchase commitment is
required, and the probe remains excluded from defect scoring.

## Counterfactual repair is not new repair evidence

The seven existing **oracle-assisted** repair replies were reused unchanged. No fresh neutral or
known-location repair calls were made. Only the two coverage-complete Chinese defect cases select
patches; all other defect topics retain their original items as unresolved. English intent is immutable,
56/56 historical source records remain, and no unexpected field changes are recorded.

The old hold-probe patch still rewrites `保管` to `留一下` with an aligned reading. Its historical
leave-unchanged check therefore still fails. The new detector does **not** select that patch: its
counterfactual probe stays clean with zero edits. Overall CLI fixture failure includes this retained
historical repair failure and the four incomplete reviews; it is not a new detector false alarm or
an invalid detection envelope. These observations do not measure repair restraint on correct controls.

## Latency, tokens and cost

| Native measurement, 12 calls each | Baseline | Recalibration |
|---|---:|---:|
| Reported USD | 0.0121572 | **0.0132374** |
| Input tokens | 33,149 | **37,133** |
| Output tokens | 885 | **839** |
| Request median / mean | 1.167s / 1.160s | **1.112s / 1.269s** |
| Maximum request | 1.434s | **2.631s** |
| Serial native run wall time | 14.088s | **15.452s** |

Observed deltas: **+$0.0010802**, **+3,984 input tokens**, **−46 output tokens**. Both runs reported
zero cached and reasoning tokens. Request durations exclude queue time; wall times are not learner
end-to-end latency. The lower observed median does not prove a speed improvement; mean and maximum
increased. No reliable tail percentile, causal instruction effect or production latency claim follows.

## Independent review and limits

Two separate assistant reviewers, **RecalCoverageAttribution** and **RecalMeaningSeverity**, each
inspected all 12 complete topic inputs and actual detector responses before reading rubric examples.
The packet omitted candidate identity, version, timing, price and fixture answer labels. Their
assessments agree: all six defects are semantically recognized, target fields and severities are
supported, no unsupported new allegation or additional important meaning defect was established,
and four explicit incomplete reviews still block correction. The medical category is less specific
than instructed, not a missed allergy denial. Both accept leaving the keep/hold probe unchanged.

Reviewers saw detection responses, not repair proposals or applied topics; counterfactual composition
and native accounting were verified separately by the integrating assistant. Recognition is not
proof of actual repair. No material disagreement required relabeling a fixture or rewriting evidence.
These are **assistant judgments, not qualified native-language or medical certification**.
Naturalness, regional usage, pronunciation conventions and fine-grained keep/hold suitability remain
unsettled where no important error was established.

The examples are exposed development material, not an unseen sample or fully blinded certification.
The same model alias and OpenRouter Vertex route do not establish reproducibility or equivalence to
the production direct-Vertex path. One observation per case cannot establish a defect rate, reliable
tail latency, instruction causality or general repair benefit. A/B remain separate quality lanes.

## Next boundary

This diagnostic does not clear C for candidate ranking or a mandatory production reviewer. A further
proposal should investigate an explicit, independently checkable coverage contract rather than keep
silently changing or ignoring `complete`. Any schema/instruction revision and additional paid study
need a new exact scope and approval. The remaining category-granularity question also needs explicit
reporting expectations, not retrospective label changes. Production and the current fail-closed
contract are unchanged; no additional calls are authorized.
