# A/B baseline collection — 2026-10-28

**RECAP:** A creates English learning content; B translates fixed authored English, not live A output.
The user approved the exact additional **20-call / $0.22** proposal. Both live native collections ran
once, A before B, with unchanged prompts/settings and no inserted defects. Ten retained observations
remain separately identifiable. C, repairs, paid judges and production changes did not run.

**GOAL:** Characterize the unchanged reference, including failures, for future like-for-like
model/prompt comparisons. Do not silently improve the control or equate valid JSON with learning quality.

**RESULT:** ✅ **20/20 provider calls completed**, all charges reported and below reservations.
❌ **A production-parser acceptance: 6/10 fresh, 10/15 including retained**; rejected deliveries have
null quality scores. ✅ **B parser acceptance: 10/10 fresh, 15/15 combined**, not a semantic quality seal.
Independent assistant review found material content problems in **3/6 accepted fresh A outputs** and
**5/10 fresh B outputs**. Combined: **3/10 accepted A** and **7/15 B** have material findings.
These are observed case counts, not estimated population error rates or whole-topic failure labels.

## Logistics and consumed authorization

| Scope | New provider calls | Reported spend / approved cap | Provider/transport failures |
|---|---:|---:|---|
| A — English collection | 10 | $0.002433104 / $0.04 | — |
| B — fixed-English translation | 10 | $0.027543100 / $0.18 | — |
| Total | **20**, plus 10 retained at no new generation cost | **$0.029976204 / $0.22** | — |

The original [approval-request.json](approval-request.json) remains unchanged, SHA256
`fe2e0dcc3605bdc98cf24b86f96924425f4f1627392b465edabc65890d8a8615`.
[execution-approval.json](execution-approval.json) records the subsequent actual human approval.
Conservative reservations totaled **$0.21363776**. A passed the operational gate before B:
no uncertain starts, unknown charges, provider/schema errors, reservation overruns or plan drift.
No retries, substitutions, repairs or additional calls followed content failures.

[collection-results.json](collection-results.json) records exact native runs/plans, every new call,
raw-response hashes, charges, tokens and parser results; it references all ten retained observations.
[collection-review.json](collection-review.json) records every new independent assessment, verified
evidence citation and combined per-case ordinal distribution. The authorization is consumed, not
permission for another run or final human acceptance.

## What is frozen

| Lane | Unchanged model / exact provider | Collection settings |
|---|---|---|
| A — English | `deepseek/deepseek-v4.1-flash` / `relace` | Reasoning disabled; 6,000 output-token limit; 120s timeout; prompt-only JSON |
| B — translation | `google/gemini-3.5-flash-lite` / `google-vertex/global` | Minimal reasoning; 6,000 output-token limit; 15s timeout; exact per-request structured schema |

Serial concurrency 1, zero retries/fallbacks/paid judges; no challenger, A→B collection, C or repair calls.
Public alias/provider capabilities and rates were rechecked immediately before dispatch at **2026-10-28T23:57:08.467Z**:
[Relace](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash-20260910/endpoints)
($0.07 input / $0.50 output per million tokens) and
[Vertex global](https://openrouter.ai/api/v1/models/google/gemini-3.5-flash-lite-20260721/endpoints)
($0.30 input / $2.50 output/reasoning per million tokens). No observed alias/rate/capability drift.
Aliases are not immutable revisions; provider-reported model aliases do not establish fixed weights.

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

## Independent assessment of all 20 fresh observations

Separate **FreshEnglishBaselineReview** and **FreshTranslationBaselineReview** read each complete
lane packet before frozen rubric examples or prior findings. Packets included exact input, raw reply,
production-parser outcome and normalized English/cards, but omitted model identity, operational
measurements, old grades and fixture answers. All **25 finding quotations and JSON pointers** were
checked against the packet. Recognizable development cases are not a fully blinded or unseen sample.
Reviewer confidence values are uncalibrated self-reports, not probabilities of correctness.

The table preserves all three observations instead of averaging or selecting the best.
Each vector is **coverage / correctness-and-fit / vocabulary-usefulness / conversation-flow**,
ordinal 0–4, higher better. **Rejected** means all delivered scores are null; raw-only diagnostic
scores are recorded separately. “Material / accepted” counts outputs with at least one material
content finding among parser-accepted outputs, not findings or failed provider calls.

| Lane / context | Retained scores | Fresh 1 scores | Fresh 2 scores | Parser accepted / 3 | Material / accepted |
|---|---|---|---|---:|---:|
| A / shoes | 4/4/4/3 | Rejected | Rejected | 1/3 | 0/1 |
| A / allergy | 4/4/4/3 | 4/3/4/3 | 2/3/4/2 | 3/3 | 1/3 |
| A / tea | 4/4/4/4 | 4/4/3/4 | 4/4/4/4 | 3/3 | 0/3 |
| A / lost bag | 4/4/4/3 | 4/2/3/2 | Rejected | 2/3 | 1/2 |
| A / pottery | Rejected | Rejected | 2/3/4/2 | 1/3 | 1/1 |
| B / shoes | 4/3/2/3 | 3/2/4/3 | 3/3/3/4 | 3/3 | 2/3 |
| B / allergy | 4/3/4/4 | 3/2/2/3 | 4/3/4/4 | 3/3 | 1/3 |
| B / tea | 4/2/4/4 | 3/2/4/3 | 3/2/4/3 | 3/3 | 3/3 |
| B / lost bag | 4/4/4/4 | 4/3/4/4 | 4/3/4/3 | 3/3 | 0/3 |
| B / pottery | 4/4/4/4 | 4/4/4/4 | 3/2/2/4 | 3/3 | 1/3 |

### Fresh A: expected useful English, observed contract and content defects

- **Four rejected replies:** shoes 1 and lost-bag 2 emit forbidden raw `alternative` properties;
  shoes 2 has 12 dialogue lines and pottery 1 has 11, above the maximum 10. Together with retained
  pottery's rejection, five of fifteen A replies are unavailable as delivered content.
- **Allergy 2 — material normalization loss:** raw essential 9,
  “If you can't confirm it's safe, I won't order it.”, is truncated to the first eight essentials.
  No dialogue line preserves the refusal. The final “We'll do our best to accommodate you” is not a
  safety confirmation. This is missing communication, not evidence that a learner ate an unsafe dish.
- **Lost bag 1 — material role inversion:** staff asks “Where is lost property?” and “Can I leave my
  phone number?”, while the traveller supplies office directions and permission. The essentials
  remain usable; the dialogue teaches the wrong roles. Rejected lost-bag 2 has a related raw-only defect.
- **Pottery 2 — material standalone/branch loss:** normalization removes the price and available-time
  questions from essentials 9–10. Dialogue still contains time, price and booking, so these facts are
  not globally absent. It also marks “We also have one from 2 to 4 in the afternoon.” as an alternative
  to the morning offer, then selects “The morning class works for me.”: that branch is inconsistent.
- **Allergy 1 — minor dialogue caveat:** “It has peanut oil, but we can remove the peanuts.” is not
  endorsed by the learner, who states danger and refusal. It merits review, not an invented observed
  safety guarantee. Both tea outputs remain usable; repetitions and lexical polish are lower impact.

### Fresh B: expected fidelity, observed meaning, spelling and pronunciation defects

- **Czech 1 and 2 — material quantity error:** both render frozen “Forty-five crowns” as
  `Padesát korun.` (fifty), surviving normalization. The retained observation did the same.
  Fresh `Budu to tady.` also lacks the verb/complement for “I will drink it here.”
- **Japanese 1 — material written/read-aloud mismatch:** normalized `少しでも食ることができません。`
  omits written okurigana; related cards contain `食られません` / `食ません`. Raw annotations assign
  `たべ` to `食` without the written `べ`. Peanut vocabulary romanization `rakkakasei` also disagrees
  with ruby `らっかせい` and phrase-level `rakkasei`. No allergen substitution or negation reversal is
  established. Japanese 2 has no supported material defect; heavy/formal phrasing remains minor.
- **Chinese 1 — material reading/text alignment:** raw `[zhè]双[shuāng]鞋[xié]多[duō]少[shǎo]钱[qián]？`
  has no written `这`. Normalized `双鞋多少钱？` loses the demonstrative and leaves an incomplete
  classifier construction. Chinese 2 is usable with minor redundancy. Unsourced optional `价格`
  in both fresh replies is absent evidence, not the retained reply's false lexical source.
- **Spanish 2 — material literal entity spelling:** normalized
  `Me gustar&iacute;a reservar una plaza para la clase de cer&aacute;mica del s&aacute;bado.`
  retains entity text rather than accents; dictionary `cocci&oacute;n` likewise remains encoded.
  The linked span faithfully selects the encoded text but does not make its spelling correct.
  No extra UI decoding step was observed or credited. Spanish 1 remains usable.
- **Ukrainian:** both replies preserve route, time, passport and lost-not-stolen intent. Masculine
  `забув` is speaker-dependent with unspecified learner gender, not a proven universal mistranslation.
  Chinese tone conventions, regional lexical choices and Ukrainian idiom retain qualification limits.

The B reviewer examined **50 essentials, 88 dialogue turns, 50 vocabulary cards, 47 supplied lexical
sources**, all Mandarin readings and **36 Japanese card romanizations**. Mechanically correct spans
do not establish lexical meaning or spelling. No content was repaired, and no assistant review is
native-language or medical certification. See the attributed full assessments for uncertainties.

## Measured runtime, not a model comparison

| Fresh lane | Request median | Request maximum | Serial run wall time | Input / output tokens | Cached input / reasoning tokens |
|---|---:|---:|---:|---:|---:|
| A, 10 calls | 2.387s | 3.584s | 24.903s | 11,410 / 4,237 | 7,808 / 0 |
| B, 10 calls | 2.418s | 4.067s | 28.496s | 24,402 / 8,089 | 0 / 0 |

Request durations are native dispatch-to-response observations; wall time includes serial collection.
Token categories can overlap: cached input is part of input, reasoning part of output. Reported spend
includes provider-reported cache treatment; it is not the conservative reservation. No reliable p95,
production latency, first-usable phrasebook time or comparative provider ranking is established.

## Coverage and confidence boundary

The shared sample remains **shoes/Chinese, allergy/Japanese, tea/Czech, lost bag/Ukrainian,
pottery/Spanish**: 3 ordinary cases and 2 explicit challenges; 4 `basics` and 1 `none`.
It covers the supported target scripts/readings, but has **one scenario per language**, no
`conversational` learner, no multi-topic request, no real-user sample and no unseen holdout.
A outputs are English in every context; the five contexts are not independent English-language populations.

One retained plus two fresh observations describe variation **on these exact cases**. Historical/new
cohorts remain identifiable; none was replaced, selected as a winner or silently repaired.
Three is descriptive, not statistical significance, reliable p95 or production error prevalence.
A broader sample and qualified adjudication remain separate decisions before generalizing beyond
this reference. Mandarin usage/tone conventions, Czech idiom, Ukrainian speaker applicability and
Spanish regional wording remain uncertain where no material error was established.

## Review and decision boundary

The consumed approval authorized this unchanged collection and assessment, not final baseline
acceptance. Human review must decide whether the known failures and limited sample are adequate for
the intended like-for-like comparison or whether separately approved broader evidence is needed.
Neither collecting more cases nor fixing the baseline is silently authorized. No automatic extension,
model ranking, prompt edit, promotion or deployment follows these findings. C remains deferred and
is not a prerequisite for A/B. Native bounds depend on frozen rates and honored output limits, not a
provider billing guarantee.
