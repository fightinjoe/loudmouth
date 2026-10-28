# A/B baseline preparation — 2026-10-28

**RECAP:** A creates English learning content; B translates fixed English. Their evaluation workflows
already exist. This work reuses **10 retained real observations** (5 A, 5 B), reviews them independently,
and prepares an A/B-only collection proposal. **No new model calls or prompt changes occurred. C stays paused.**

**GOAL:** Establish an honestly characterized reference for future like-for-like model/prompt comparisons,
without improving the control first or treating valid JSON as accurate learning content.

**RESULT:** ✅ All 10 current prepared requests exactly match the saved requests, and their execution
bindings match the retained baseline. ✅ Independent assistant assessments and original-response hashes
are recorded in [review.json](review.json). ⚠️ One observation per case does not measure variability.
The proposed next collection adds **2 observations per case**, reusing the saved one for **3 total**.
**This is a limited five-context reference, not a product-wide or unseen-validation baseline.**

## Logistics and exact proposal

| Scope | Calls | Reported spend / proposed cap | Execution failures |
|---|---:|---:|---|
| This preparation and retained-output assessment | 0 paid | $0 | — |
| Proposed A collection | 10 new | $0.04 maximum | Not run |
| Proposed B collection | 10 new | $0.18 maximum | Not run |
| Proposed total | **20 new**, plus 10 retained | **$0.22 maximum** | Not run; approval required |

Native conservative reservations total **$0.21363776**. [approval-request.json](approval-request.json)
freezes both exact native plans, source/request hashes, sample, assessment policy, settings and stop rules.
Both plans reload successfully and have **zero runs and no human brief approval**. “Please proceed”
authorized preparation, not these previously unpresented hashes/caps. No execution approval was fabricated.

## What is frozen

| Lane | Unchanged model / exact provider | Collection settings |
|---|---|---|
| A — English | `deepseek/deepseek-v4.1-flash` / `relace` | Reasoning disabled; 6,000 output-token limit; 120s timeout; prompt-only JSON |
| B — translation | `google/gemini-3.5-flash-lite` / `google-vertex/global` | Minimal reasoning; 6,000 output-token limit; 15s timeout; exact per-request structured schema |

Serial concurrency 1, zero retries/fallbacks/paid judges; no challenger, A→B collection, C or repair calls.
Public alias/provider capabilities and rates were checked at **2026-10-28T23:33:02.126Z**:
[Relace](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash-20260910/endpoints)
($0.07 input / $0.50 output per million tokens) and
[Vertex global](https://openrouter.ai/api/v1/models/google/gemini-3.5-flash-lite-20260721/endpoints)
($0.30 input / $2.50 output/reasoning per million tokens). No observed alias/rate/capability drift.
Recheck immediately before dispatch. Aliases are not immutable revisions.

A uses the checked-in production prompt/model family and route. B uses the production prompt and
parser but **OpenRouter Vertex with explicit minimal reasoning**, not production's direct-Vertex
transport without that setting. Deployment/environment overrides are unverified. This is not a
production-latency or end-to-end first-usable-phrasebook measurement.

## Independent review of the retained observations

Separate reviewers **BaselineEnglishReview** and **BaselineTranslationReview** each read all five
complete observations in their lane before rubric examples. B included raw responses and assembled
cards. Packets omitted candidate identity, operational measurements and fixture answers; recognizable
development scenarios are not fully blinded. These are proposed assistant judgments under rubric
**1.2**, not native-speaker/medical certification or new generation. Historical results are unchanged.

Scores are ordinal **0–4, higher is better**: 4 high quality, 3 usable, 2 needs correction/supplementation,
1 poor, 0 no usable value. No averages. A's rejected output has **null delivered-stage scores**, not zero.
A scores concern English only; B scores concern fidelity to its own fixed English and normalized cards.

| Lane / context | Production parser | Coverage | Correctness / fit | Useful vocabulary | Conversation flow | Assessment of this observation |
|---|---|---:|---:|---:|---:|---|
| A / shoes | ✅ | 4 | 4 | 4 | 3 | Usable; essentials cover holding/noncommitment although dialogue does not rehearse that branch |
| A / allergy | ✅ | 4 | 4 | 4 | 3 | Usable; minor dialogue/alternative-normalization concern, not an established harmful assurance |
| A / tea | ✅ | 4 | 4 | 4 | 4 | Usable English; conditional lemon request already expresses the choice |
| A / lost bag | ✅ | 4 | 4 | 4 | 3 | Usable; redundant staff lost-property question is minor |
| A / pottery | ❌ | — | — | — | — | Rejected: 12 dialogue lines exceed 2–10. Raw-only missing time agreement is separate |
| B / shoes | ✅, degraded optional source | 4 | 3 | 2 | 3 | ❌ Material retained lexical-evidence error; dialogue/essentials remain usable |
| B / allergy | ✅ | 4 | 3 | 4 | 4 | ⚠️ Localized Latin-pronunciation alignment/spacing issues; no established safety reversal |
| B / tea | ✅ | 4 | 2 | 4 | 4 | ❌ Material changed price |
| B / lost bag | ✅ | 4 | 4 | 4 | 4 | No supported material error; gender applicability remains a question |
| B / pottery | ✅ | 4 | 4 | 4 | 4 | No supported material error; regional firing terminology remains a question |

✅ marks the named technical check, not overall linguistic certification. Grades/dispositions are
attributable assessments, not gold answers. Raw-only pottery grades are 2/4/4/2 in the same dimension
order; no part of that rejected response is credited as delivered content. B's two material findings
affect different dimensions, not a claim that both whole topics are unusable.

### Representative evidence, not proposed fixes

- **A pottery:** `/conversations/0/lines/10/text`, “Great. Can I book a place now?”, follows an offer of
  Saturday at 10 a.m. or 4 p.m. without choosing a time. Supplied goal: agree time and euro price before
  booking. This raw-only missing intent is material, independently of parser rejection.
- **B Czech:** `/lines/3`, English “Forty-five crowns. Will you drink it here or take it away?” →
  `Padesát korun. Budete to tady, nebo s sebou?` (“fifty”). The wrong amount survives normalization.
- **B Chinese:** `/vocab/4/source` associates English “price” / target `价格` with the surface `多` in
  `这双很舒适。这双多少钱？`. Normalized `/groups/0/vocab/4/sources/0/span` is `[8,9)`:
  a real substring, but not an occurrence of the noun `价格`. Preserve this observed evidence failure.
- **B Japanese:** `/essentialsRomanizations/4` ends `taberaremasen` against written `食べません`
  and English “If you cannot confirm, I will not eat this dish.” This teaches a different grammatical
  form (“cannot” versus “will not”), but both remain negative. Grade the localized impact, not an
  automatic critical or whole-topic failure. `/lineRomanizations/7` also joins `wa` and `hikaete`.

[review.json](review.json) supplies raw artifact hashes, concrete packet pointers, all cited findings,
score rationale, normalization distinctions and uncertainties. Nothing was corrected or filtered out.

## Coverage and confidence boundary

The shared sample remains **shoes/Chinese, allergy/Japanese, tea/Czech, lost bag/Ukrainian,
pottery/Spanish**: 3 ordinary cases and 2 explicit challenges; 4 `basics` and 1 `none`.
It covers the supported target scripts/readings, but has **one scenario per language**, no
`conversational` learner, no multi-topic request, no real-user sample and no unseen holdout.
A's five outputs are all English; they are not five independent English-language populations.

Two new observations plus the compatible historical one can describe variation **on these exact
cases**. Keep historical/new cohorts identifiable; do not select winners or imply immutable model
versions. Three is descriptive, not statistical significance, reliable p95 or production error prevalence.
A broader sample and qualified adjudication remain separate decisions before generalizing beyond this
reference. Mandarin usage/tone conventions, Czech idiom, Ukrainian speaker applicability and Spanish
regional wording remain uncertain where no material error was established.

## Execution and review boundary

If this exact proposal is approved, run **A first**, inspect its native results, then B. Stop before B on
provider/transport/unsupported-schema errors, uncertain start/unknown charge, reservation overrun or
plan drift. Every started attempt consumes a slot; unknown charges retain their full reservation.
Native bounds assume frozen rates and honored output limits, not a provider billing guarantee.
Parser/content failures are retained evidence, not permission to retry, truncate, substitute a mock or
repair. Reassess every new observation independently with the frozen rubric and report per-case
counts/distributions, exact weaknesses and runtime measurements separately. No automatic extension,
final baseline acceptance, model ranking, prompt edit, promotion or deployment. C remains deferred.
