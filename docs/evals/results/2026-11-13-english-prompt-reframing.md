---
kind: record
status: current
summary: English-generation prompt reframing study 2026-11-13, two candidates against the production prompt on DeepSeek, Gemini 3.5 Flash Lite and Qwen3.8 Flash over 21 topics; both candidates are preferred within each model, generic language and English fallback regress, Flash Lite stays behind production DeepSeek; nothing adopted.
verified: 2026-11-13
---

# English-generation prompt reframing study

On 2026-11-13 two candidate prompts for the `/phrasebook` English-generation stage (lane A) were compared with the production prompt (`api/src/phrasebook/prompt.txt`, candidate 4 of the [earlier study](2026-11-12-english-prompt-candidate-4.md)) on three models. The question was whether a differently framed prompt lifts models other than DeepSeek, Gemini 3.5 Flash Lite in particular, after the [Flash Lite diagnostic](2026-11-13-flash-lite-english-diagnostic.md). Dispatch was by Prompt Romp under owner-approved briefs and exact plans: 381 calls, serial, no retries, 6,000-token output cap, no paid judge. The candidate prompts, raw replies and review packets are in an ignored local run directory and are not committed.

**Outcome:** mixed; nothing is adopted and the production prompt is unchanged. Blind reviewers prefer both candidates over the production prompt on most topics for every model, and the candidates remove Flash Lite's structural failures. Both candidates regress on generic language and English fallback, mostly in generic-titled topics, and Flash Lite with either candidate is still judged behind production DeepSeek on coverage and vocabulary.

## Candidates

Both candidates replace the rule list with: what the learner sees, what each request field means (answers are broad multiple-choice categories), a section guide with typical sizes and hard maximums, five quality principles in rubric priority order with reasons, the ability levels, and one full worked chapter (a haircut topic outside every test set) instead of a minimal JSON skeleton. They are about as long as the production prompt (1,449 and 1,432 words against 1,355).

| | R1: prompt only | R2: prompt plus contract |
|---|---|---|
| Request | Production request, unchanged | `topic` plus `otherTopics` (the phrasebook's other topic titles) instead of a one-item `checklist` |
| Output | Production shape | No `topics` wrapper or title echo; exchange turns are `{speaker, say, or?}` with alternatives only in `or` |
| Provider schema | None, as in production | JSON schema sent as `response_format` (bounds on list sizes, speaker enum) |
| Acceptance | Unchanged `validateGenerationResponse` | Adapter converts to the production shape, then unchanged `validateGenerationResponse` |

## Inputs and configurations

- **Tuned (12 topics):** the first three topics of each Spanish `basics` request in [baseline inputs](../baseline.md). The diagnostic outputs for these were seen while drafting the candidates.
- **Held-out (9 topics):** the salsa, feeling-sick and vegan requests in `api/evals/fixtures/baseline/`, three topics each, with an ability added for this study (salsa `none`, sick `basics`, vegan `conversational`). Not seen while drafting.
- Two samples per topic, model and prompt: 42 calls per cell. A one-call schema probe per model preceded R2 and is excluded from the counts.

| Model | Provider (OpenRouter, pinned, no fallback) | Reasoning |
|---|---|---|
| `deepseek/deepseek-v4.1-flash` | Relace | disabled |
| `google/gemini-3.5-flash-lite` | Google Vertex `global` | effort `minimal` |
| `qwen/qwen3.8-flash` | Alibaba | disabled |

## Technical results

Per cell of 42 calls. "Trimmed" means accepted with Words cut to ten.

| | Flash Lite base | R1 | R2 | DeepSeek base | R1 | R2 | Qwen base | R1 | R2 |
|---|---|---|---|---|---|---|---|---|---|
| Accepted unchanged | 37 | 42 | 42 | 20 | 16 | 24 | 38 | 34 | 40 |
| Accepted, trimmed | 0 | 0 | 0 | 16 | 23 | 16 | 2 | 5 | 2 |
| Rejected or invalid JSON | 5 | 0 | 0 | 6 | 3 | 2 | 1 | 3 | 0 |
| No output (HTTP 429) | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| Seconds, median (max) | 1.66 (3.9) | 1.95 (4.2) | 2.27 (4.6) | 3.50 (7.2) | 2.86 (7.7) | 3.11 (6.5) | 5.99 (9.6) | 5.45 (8.2) | 5.34 (7.6) |
| Output tokens, median | 360 | 513 | 465 | 765 | 687 | 684 | 680 | 558 | 526 |
| Input tokens, median | 1,891 | 2,269 | 2,899 | 1,868 | 2,212 | 2,218 | 1,924 | 2,284 | 2,294 |
| Reported cost, 42 calls | $0.065 | $0.083 | $0.086 | $0.018 | $0.017 | $0.017 | $0.016 | $0.014 | $0.014 |

- **Flash Lite base failures:** two replies with an extra closing brace, three with invented keys (`alt`, `thingsToSign`, `likelyExsigns`).
- **DeepSeek base failures:** three example conversations with array `text`, one invalid JSON, one 11-turn example, one exchange of more than four turns. R1: one of each of the last three. R2: two exchanges with consecutive same-speaker turns, which the schema cannot express.
- **Qwen failures:** base, one example conversation with array `text`; R1, three replies with a missing closing brace. With the R2 schema no model returned invalid JSON or an unknown key (126 calls).
- The R2 schema counts as about 630 extra input tokens on Flash Lite; it is not billed as input on the other two providers.
- Reported spend was $0.33 for the 378 study calls and $0.003 for the probes; one failed Qwen call has an unknown charge. Latency is through OpenRouter in one window per model.

## Content measures

Deterministic counts over replies that parse, both samples. Medians are per topic; shares are of all entries in the cell.

| | Flash Lite base | R1 | R2 | DeepSeek base | R1 | R2 | Qwen base | R1 | R2 |
|---|---|---|---|---|---|---|---|---|---|
| Things to say | 4 | 5.5 | 6 | 8 | 6 | 6 | 5 | 6 | 5 |
| Likely exchanges | 1 | 2 | 2 | 3 | 3 | 3 | 2 | 2 | 2 |
| Words | 4 | 7 | 7 | 9 | 11 | 10 | 6 | 7 | 7 |
| Example conversation turns | 4 | 7 | 6.5 | 8 | 8 | 9 | 7 | 8 | 8 |
| Things to say over ten words | 18% | 0% | 0% | 11% | 1% | 2% | 3% | 1% | 0% |
| Exchanges shaped like the production skeleton | 76% | 16% | 13% | 50% | 25% | 17% | 66% | 40% | 44% |
| Partner-initiated exchanges | 13% | 58% | 45% | 36% | 55% | 56% | 28% | 57% | 50% |
| Exchanges with opener alternatives | 11% | 21% | 2% | 1% | 0% | 0% | 0% | 0% | 1% |
| Later turns with alternatives | 60% | 76% | 62% | 54% | 50% | 23% | 63% | 74% | 46% |
| Directions lines that name the answer category | 27% | 5% | 8% | 14% | 0% | 2% | 7% | 2% | 0% |
| Things to say nearly repeated in a sibling topic | 0% | 7% | 2% | 9% | 13% | 6% | 7% | 11% | 3% |
| Example lines copied from other sections | 28% | 14% | 12% | 29% | 13% | 14% | 6% | 3% | 5% |
| Topics without any contraction | 98% | 36% | 71% | 10% | 0% | 0% | 49% | 5% | 2% |
| Generic Things to say (pattern match) | 2% | 10% | 5% | 3% | 11% | 8% | 3% | 7% | 8% |
| Generic Words (pattern match) | 0% | 2% | 2% | 0% | 2% | 3% | 0% | 2% | 2% |
| Replies asking about speaking English | 0 | 2 | 4 | 0 | 2 | 2 | 0 | 3 | 1 |
| Topics with target-language text | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 3 | 5 |

"Skeleton shape" is learner opener, partner turn with exactly two options, learner follow-up. "Category" lines contain monument, landmark or memorial. Near repetition is a content-word overlap of 0.6 or more with a Things to say entry in another topic of the same request and sample. The rubric does not score contractions; the row is a proxy for spoken register.

## Blind review

Reviewer subagents compared pairs for the first sample of every topic, with sides shuffled and conditions hidden, against the [rubric](../rubric.md). One reviewer per packet of 21 pairs. An unreadable side loses its pair. This is assistant review; there is no owner or native-speaker adjudication.

| Comparison | Candidate preferred | Production prompt preferred | Tie | Held-out only |
|---|---|---|---|---|
| Flash Lite, R1 versus base | 19 | 2 | 0 | 9 / 0 / 0 |
| Flash Lite, R2 versus base | 18 | 3 | 0 | 8 / 1 / 0 |
| DeepSeek, R1 versus base | 14 | 6 | 1 | 6 / 2 / 1 |
| DeepSeek, R2 versus base | 18 | 2 | 1 | 9 / 0 / 0 |
| Qwen, R1 versus base | 11 | 9 | 1 | 6 / 3 / 0 |
| Qwen, R2 versus base | 14 | 7 | 0 | 8 / 1 / 0 |

Unreadable sides: Flash Lite base 2 in each packet, DeepSeek base 1 in each, DeepSeek R1 1, Qwen R1 2. Candidates are scored higher most often on naturalness and coverage, then flow; vocabulary is close to even for DeepSeek and Qwen. Correctness is the exception for Flash Lite R1, where the production prompt is scored higher in 5 pairs and R1 in 1.

**Flash Lite candidates against production DeepSeek** (same topics, first sample, same procedure):

| Comparison | Flash Lite preferred | DeepSeek base preferred | Tie | Held-out only |
|---|---|---|---|---|
| Flash Lite R1 versus DeepSeek base | 8 | 12 | 1 | 3 / 5 / 1 |
| Flash Lite R2 versus DeepSeek base | 3 | 18 | 0 | 2 / 7 / 0 |

In both packets DeepSeek is scored higher on coverage (14 pairs to 1, and 16 to 1) and on vocabulary (12 to 1, and 15 to 0); Flash Lite is scored higher on naturalness (12 to 3, and 8 to 3) and on correctness (7 to 5, and 7 to 2). One Flash Lite win in each packet is an unreadable DeepSeek reply. The two packets had different reviewers, so the gap between the R1 and R2 rows is not a measured difference between the candidates.

## Findings

- **The reframing helps every model, Flash Lite most.** Flash Lite stops mirroring the skeleton, writes 30–40% more, drops the long written-register lines and the invented keys. DeepSeek and Qwen get shorter Things to say, fewer copied example lines and more partner-initiated exchanges.
- **Flash Lite follows the size it is shown.** With the worked chapter (six Things to say, three exchanges, nine Words, eight turns) it writes about 6, 2, 7 and 7. Production DeepSeek writes 8, 3, 9 and 8, and that breadth is what the cross-model reviewers reward.
- **Generic language and English fallback regress.** All 14 replies asking about English are in the two "Get someone's attention" topics, and those two topics hold 37 of 66 (R1) and 29 of 50 (R2) pattern-matched generic Things to say against 3 of 18 for the production prompt. Reviewers prefer the production prompt in 11 of the 12 pairs on those topics, with one tie. The candidates state both rules once, without the production prompt's repeated prohibitions.
- **Target-language text.** Qwen writes Spanish lines under both candidates, mostly in the ability `none` salsa request ("¿Bailamos?", a whole Spanish example conversation); DeepSeek R2 has one "Mamá, papá".
- **R1 opener alternatives on Flash Lite.** Partner-initiated exchanges often start with two options (21%). The `say`/`or` shape removes this (2%).
- **Contract (R2).** The enforced schema removes invalid JSON and unknown keys on all three providers. It cannot enforce speaker alternation or the ten-Word total: DeepSeek still has two rejections and 16 trimmed replies. Sibling titles reduce near-repeated Things to say against R1 on every model, and they leave a generic-titled topic nothing specific to say.
- **DeepSeek Words overruns grow under R1** (23 trimmed against 16).

## Limits

Two samples per cell; blind review on the first sample only, one assistant reviewer per packet, no second rater; tuned topics were visible while drafting; Spanish dominates (15 of 21 topics); pattern-matched generic counts miss and over-count; provider latency and the 429 are one window. R2 bundles four changes, so its effects are not separable from each other. Translation (B) was not evaluated.
