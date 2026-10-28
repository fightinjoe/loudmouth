# C detection: revised review instructions vs saved baseline — 2026-10-28

**RECAP:** The evaluation pipeline already existed. This was a new live run of **only C's detection
stage**, not pipeline construction or a full generation→translation→repair run. We sent the same
12 saved bilingual examples to the model with revised review instructions, then compared its replies
with the earlier saved detector replies. Both sets were assessed under the same proposed rubric 1.2.

**GOAL:** Check whether the revised instructions help the detector identify deliberately inserted
errors, identify the correct item/field, grade their impact, and declare that it reviewed the whole
topic—without flagging correct examples. The sample contains **6 deliberately defective examples,
5 correct examples and 1 unscored wording question**. A defect here means an inserted translation or
pronunciation error, such as saying size 38 when the English says 39; it is not a newly discovered
software bug. “Recalibration” means retesting the review instructions, not training the model.

**RESULT:** ✅ The detector identified all six inserted errors, according to two independent assistant
checks of its actual replies. ❌ It declared the whole-topic review finished in only **2/6** defective
examples, so correction remained blocked for the other four. **2/6 is better than the baseline's 0/6;
the target is 6/6.** Recognizing an error is positive, but is not the same as completing review or fixing it.

**CURRENT DISPOSITION:** C is optional and deferred by user decision. Preserve these observations;
do not reconcile its instructions/schema now. Establishing a confident A/B baseline is the next
priority and does not depend on resolving C.

## Run logistics

| Item | Observed |
|---|---|
| Live model calls | ✅ 12/12 completed; detection only |
| Reported spend / approved maximum | $0.0132374 / $0.23 |
| Execution failures | — None; no provider errors, uncertain starts, unknown charges or overruns |
| Additional A/B, repair or paid-judge calls | — None; no retries, fallback or production changes |

The actual user reply “approved” authorized the exact [proposal](c-recalibration-request.json);
[approval provenance](c-recalibration-approval.json) records its package and native-plan hashes.
Provider metadata was rechecked with no observed drift. This approval is consumed.
[Measurements and per-case outcomes](c-recalibration-results.json) retain the native run references.
Historical measurements, responses and approvals are unchanged; this report's presentation was clarified.

## Comparison: what got better?

✅ = the named check passed; ❌ = it failed; ⚠️ = partial/limited result. These are not whole-topic
quality seals. **Expected** means the proposed test target; **observed** means what the detector returned.

| Check | Desired result | Earlier replies | New replies |
|---|---|---:|---:|
| Identifies inserted errors, independently checked by assistants | Higher: 6/6 | 6/6 | ✅ 6/6 |
| Says the entire topic was reviewed, even when it contains an error | Higher: 6/6 | 0/6 | ⚠️ 2/6 |
| Reports the expected item, field and error category together | Higher: 6/6 | 2/6 | ⚠️ 5/6 |
| Severity labels disagree with proposed impact labels | Lower: 0 | 4 | ✅ 0 |
| Flags an error in a correct example | Lower: 0/5 | 0/5 | ✅ 0/5 |

The remaining category mismatch concerns the **same correctly recognized Japanese allergy denial**:
the detector returned `meaning`, not the expected, more specific `medical-safety`. This is not an
unnoticed allergy error plus a separate false alarm. The new replies also avoid the baseline's extra
allegation against correct Ukrainian dialogue. Assistant judgments are not native-language or medical certification.

## Reading the C review response

This is a **local evaluation contract**, not the production `/lookup` response schema.

| Field or term | Plain-language meaning |
|---|---|
| `complete: true` | “I examined the entire topic.” The detector may still find errors or record uncertainty. It does **not** mean “everything is correct.” |
| `complete: false` | “I did not finish reviewing the entire topic.” The pipeline therefore applies **no corrections to that topic**. A valid reply can still say false; that is a review-coverage blocker, not a failed network call. |
| `findings` | The detector's reported problems: item ID, affected field, error category, severity, origin and reason. These are observed model allegations, not the expected answers. |
| `handle` | A stable item ID: `e:0` is the first essential phrase, `d:2` the third dialogue line, `v:0` the first vocabulary item. Numbering starts at zero. |
| Detector `unresolved` | Items it cannot confidently judge, each with an item ID and reason. Leave those items unchanged. An empty list does **not** override `complete:false`. |
| Pipeline `unresolvedHandles` | Items the correction step could not safely resolve. This is a different list: an incomplete review blocks **all** items, even when the detector listed no specific uncertainty. |

“Counterfactual correction” below means replaying the local correction gate with **previously saved
repair replies** to see which changes it would accept. No new repair-model call or production fix occurred.

## Concrete findings and learner impact

All item paths below refer to the corresponding complete topic's `items` array. English remains fixed.
The error/desired action columns describe the **test input and target**; the other columns describe
the **actual response and observed local replay**, not what we hoped the model would return.

| Test input: deliberately inserted error | Expected detector behavior / desired correction | Actual new detector response | Local replay with saved repair replies |
|---|---|---|---|
| Chinese size, `/items/0/text` and `/items/0/reading`: “I usually wear European size 39.” vs `我平时穿欧码三十八号。` / `sānshíbā` (38) | Flag the wrong size; restore 39 and aligned pronunciation. | ✅ Finds `e:0/text/meaning`, material; says review is complete. | ✅ 2 field edits: `三十九号` / `sānshíjiǔ`. Correct dialogue preserved. |
| Chinese reading, `/items/2/reading/0/1`: “Do you have one size larger?” and written `有大一码的吗？` vs `yǒu xiǎo yī mǎ de ma` (“small”) | Flag pronunciation, not correct written text; pronounce 大 as `dà`. | ✅ Finds `e:2/reading/reading-romanization`, material; says review is complete. | ✅ 1 reading edit: `xiǎo`→`dà`; written text unchanged. |
| Japanese allergy, `/items/0/text`: “I have a severe peanut allergy.” vs `ピーナッツアレルギーはありません。` (“no peanut allergy”) | Flag the dangerous denial as critical/medical-safety; restore the affirmative severe-allergy statement with aligned pronunciation. | ✅ Recognizes the critical denial and correct field. ⚠️ Category is `meaning`. ❌ Says review is incomplete. | ❌ Correction blocked; original erroneous topic retained. |
| Czech tea, `/items/0/text`: “A black tea without sugar, please.” vs `Černý čaj s cukrem, prosím.` (“with sugar”) | Flag the reversed preference as material; restore `bez cukru` (“without sugar”). | ✅ Correct finding and material severity. ❌ Says review is incomplete. | ❌ Correction blocked; original erroneous topic retained. |
| Ukrainian route, `/items/1/text`: “The train from Lviv to Kyiv arrived today at 14:30.” vs `Поїзд із Києва до Львова прибув сьогодні о 14:30.` (Kyiv→Lviv) | Flag the reversed route as material; restore Lviv→Kyiv and preserve correct `d:2` dialogue. | ✅ Correct finding and material severity; no allegation against correct dialogue. ❌ Says review is incomplete. | ❌ Correction blocked; original erroneous topic retained. |
| Spanish pottery, `/items/2/text`: “I would like to make a small bowl by hand, without a wheel.” vs `Quisiera hacer un cuenco pequeño con torno.` (“with a wheel”) | Flag the wrong pottery method as material; restore `a mano, sin torno`. | ✅ Correct finding and material severity. ❌ Says review is incomplete. | ❌ Correction blocked; original erroneous topic retained. |

The four incomplete responses all recognize the inserted error and list no specifically uncertain
items. The whole-topic flag still blocks correction. Why the detector declared review incomplete is
unknown; the pipeline is behaving as designed by retaining the original rather than bypassing that flag.

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

## Status: deferred optional investigation

**C is parked, not accepted or repaired.** Its unresolved coverage/category questions remain recorded.
No C instruction/schema change, further reconciliation or new run is currently planned. A and B's
[baseline checkpoint](../../docs/designs/phrasebook-quality-identity-storage-plan.md#next-checkpoint-reviewed-ab-baseline)
takes priority; C is not a prerequisite.

### What the current evaluation actually does

Detection and repair are two **model roles**, with deterministic routing and application around them.
They are not necessarily two total calls: detection reviews a topic, while repairs can be per item.
This is an evaluation decomposition, not a selected production architecture.

| Stage | Owner | Observed status at pause |
|---|---|---|
| Identify problems and declare review coverage | Detector model | Latest run: 12 valid replies; all 6 inserted errors recognized by assistant review; 4 defective topics declared incomplete. Five correct controls and the unscored keep/hold probe were left clean. |
| Decide whether correction may proceed | Local gate | `complete:false` selects no repairs and retains the topic. This withheld saved repairs for 4 cases; it is not evidence that a repair model refused or failed to produce a correction. Why the detector chose false is unknown. |
| Generate a localized correction | Repair model | **No fresh calls in the latest study.** Earlier, location-assisted replies passed all 6 supplied defect checks. The separate keep/hold probe was unnecessarily changed; suitability of the original wording remains unestablished. Neutral repair behavior and restraint on correct controls remain unmeasured. |
| Validate and apply proposed changes | Local application code | Offline reuse of saved replies applied the 2 Chinese repairs, totaling 3 field edits. Four incomplete topics retained their original errors. This was not fresh end-to-end repair or production delivery. |

### Required process review if C is reopened

Before choosing another prompt, schema or experiment, trace the whole process on a defective example
and a correct control: exact inputs to each model role, actual replies, gate decision, proposed changes,
application validation and resulting whole topic. Separate **missed/false findings**, **incomplete or
uncertain review**, **repair not requested**, **repair-model failure**, **rejected application** and
**accepted but harmful changes**. Do not attribute a gate-blocked repair to model refusal.

Only after that review decide what to change and how to measure net benefit over unchanged content.
The previously suggested coverage-contract redesign is a parked hypothesis, not approved work.
Preserve the existing blocking contract and historical labels. Any new study needs a separately
frozen scope and explicit paid approval; no further calls or production changes are authorized.
