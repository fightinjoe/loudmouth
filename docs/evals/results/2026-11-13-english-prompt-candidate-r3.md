---
kind: record
status: current
summary: English-generation candidate R3 (2026-11-13) on DeepSeek, Gemini 3.5 Flash Lite and Qwen3.8 Flash over 21 topics; preferred over the production prompt on every model, rule regressions gone, Flash Lite about level with production DeepSeek and well behind DeepSeek on the same prompt; Words overruns grow; not adopted.
verified: 2026-11-13
---

# English-generation candidate R3

On 2026-11-13 a third candidate prompt for the `/phrasebook` English-generation stage (lane A) was run on the inputs, models and settings of the [reframing study](2026-11-13-english-prompt-reframing.md) and compared with that study's saved production-prompt and R2 replies. Dispatch was by Prompt Romp under the owner's pre-approval and exact plans: 126 calls (21 topics, two samples, three models), serial, no retries, 6,000-token output cap, no paid judge. The candidate text, raw replies and review packets are in an ignored local run directory.

**Outcome:** mixed; nothing is adopted and the production prompt is unchanged. R3 is preferred over the production prompt on every model, and R2's generic-language, English-fallback and target-language regressions are gone. Flash Lite with R3 is about level with production DeepSeek and clearly behind DeepSeek with R3. Word totals overrun the ten-Word limit more often than before. Adopting R3 needs the R2 output contract in production code.

## What R3 changes against R2

R3 keeps R2's request and output contract (`topic` plus `otherTopics`, `{speaker, say, or?}` turns, enforced JSON schema, no wrapper or title echo) and changes the prompt text (1,673 words):

- **Three rules without exceptions,** placed just before the output section: English only, including the partner's lines; no line about speaking English; no universal phrases as, or at the start of, a Things to say line or as a Word. A generic topic title gets the situation-specific lines that do that job.
- **Larger sizes:** typically 6 to 8 Things to say, 3 or 4 exchanges, 3 families with 8 to 10 Words, 8 example turns, and a worked chapter of that size (8, 4, 9 and 8).
- **Strict speaker alternation** stated for exchanges and the example; a coverage sentence asking the model to think through the whole moment.

## Technical results

Per cell of 42 calls. Base and R2 columns repeat the reframing study. "Trimmed" means accepted with Words cut to ten.

| | Flash Lite base | R2 | R3 | DeepSeek base | R2 | R3 | Qwen base | R2 | R3 |
|---|---|---|---|---|---|---|---|---|---|
| Accepted unchanged | 37 | 42 | 40 | 20 | 24 | 9 | 38 | 40 | 21 |
| Accepted, trimmed | 0 | 0 | 2 | 16 | 16 | 32 | 2 | 2 | 21 |
| Rejected or invalid JSON | 5 | 0 | 0 | 6 | 2 | 1 | 1 | 0 | 0 |
| No output (HTTP 429) | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| Seconds, median (max) | 1.66 (3.9) | 2.27 (4.6) | 2.70 (3.3) | 3.50 (7.2) | 3.11 (6.5) | 2.59 (5.7) | 5.99 (9.6) | 5.34 (7.6) | 6.94 (10.3) |
| Output tokens, median | 360 | 465 | 588 | 765 | 684 | 801 | 680 | 526 | 702 |
| Input tokens, median | 1,891 | 2,899 | 3,251 | 1,868 | 2,218 | 2,566 | 1,924 | 2,294 | 2,650 |
| Reported cost, 42 calls | $0.065 | $0.086 | $0.104 | $0.018 | $0.017 | $0.020 | $0.016 | $0.014 | $0.017 |

- **Words overruns.** R3 replies exceed ten Words in 32 of 42 DeepSeek replies (mostly 11 or 12, at most 15), 21 of 42 Qwen replies (11 to 13) and 2 Flash Lite replies (11). The schema cannot express a total across families, and the stated limit is not followed.
- **One rejection:** a DeepSeek exchange with two consecutive turns by the same speaker.
- Reported spend for the 126 calls was $0.14. Latency is through OpenRouter, in a later window than the base and R2 runs.

## Content measures

Same deterministic counts as the reframing study, both samples.

| | Flash Lite base | R2 | R3 | DeepSeek base | R2 | R3 | Qwen base | R2 | R3 |
|---|---|---|---|---|---|---|---|---|---|
| Things to say | 4 | 6 | 7 | 8 | 6 | 8 | 5 | 5 | 8 |
| Likely exchanges | 1 | 2 | 3 | 3 | 3 | 4 | 2 | 2 | 3 |
| Words | 4 | 7 | 8 | 9 | 10 | 11 | 6 | 7 | 10.5 |
| Example conversation turns | 4 | 6.5 | 8 | 8 | 9 | 10 | 7 | 8 | 9 |
| Generic Things to say (pattern match) | 2% | 5% | 1% | 3% | 8% | 3% | 3% | 8% | 5% |
| Generic Words (pattern match) | 0% | 2% | 0% | 0% | 3% | 1% | 0% | 2% | 0% |
| Replies asking about speaking English | 0 | 4 | 0 | 0 | 2 | 0 | 0 | 1 | 0 |
| Topics with target-language text | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 5 | 0 |
| Exchanges with opener alternatives | 11% | 2% | 4% | 1% | 0% | 2% | 0% | 1% | 2% |
| Later turns with alternatives | 60% | 62% | 64% | 54% | 23% | 29% | 63% | 46% | 42% |
| Things to say over ten words | 18% | 0% | 1% | 11% | 2% | 0% | 3% | 0% | 0% |
| Things to say nearly repeated in a sibling topic | 0% | 2% | 3% | 9% | 6% | 10% | 7% | 3% | 6% |
| Example lines copied from other sections | 28% | 12% | 10% | 29% | 14% | 13% | 6% | 5% | 5% |
| Topics without any contraction | 98% | 71% | 64% | 10% | 0% | 0% | 49% | 2% | 7% |

Under R3 the only non-English strings are Spanish place names ("Gran Vía", "Plaza España"). The remaining pattern-matched generic Things to say are mostly thanks and apologies that carry situation content ("Thank you, but I need to rest.", "Sorry, I'm sitting this one out."), host thanks in the dinner topic, and Qwen greetings in "Get someone's attention".

## Blind review

Same procedure as the reframing study: first sample of every topic, 21 pairs per packet, sides shuffled and conditions hidden, assistant reviewer subagents against the [rubric](../rubric.md). The first three comparisons had two independent reviewers on the same packet. Cells are first side / second side / tie.

| Comparison | Reviewer 1 | Reviewer 2 | Same verdict | Held-out only |
|---|---|---|---|---|
| Flash Lite R3 versus DeepSeek base (production) | 8 / 12 / 1 | 12 / 8 / 1 | 16 of 21 | 3 / 6 / 0 and 4 / 4 / 1 |
| DeepSeek R3 versus DeepSeek base | 17 / 3 / 1 | 17 / 4 / 0 | 20 of 21 | 8 / 1 / 0 and 8 / 1 / 0 |
| Flash Lite R3 versus DeepSeek R3 | 3 / 18 / 0 | 2 / 19 / 0 | 20 of 21 | 1 / 8 / 0 and 1 / 8 / 0 |
| Qwen R3 versus Qwen base | 18 / 3 / 0 | | | 9 / 0 / 0 |
| Flash Lite R3 versus Flash Lite R2 | 16 / 4 / 1 | | | 5 / 3 / 1 |

One DeepSeek base reply is unreadable and loses its pair in the first two rows.

- **Flash Lite R3 against production DeepSeek:** the reviewers split. Both score DeepSeek higher on coverage (10 pairs to 2, and 7 to 2) and vocabulary (9 to 3, and 10 to 1), and Flash Lite higher on correctness (9 to 3, and 8 to 5) and naturalness (7 to 4, and 9 to 3). With R2 the same comparison was 3 to 18, with R1 8 to 12.
- **Same prompt, different model:** DeepSeek R3 is scored higher than Flash Lite R3 on coverage in 19 pairs to 0 by both reviewers, and on flow and naturalness in 12 or more pairs to 3 or fewer.
- **Flash Lite findings under R3** cited by both reviewers include three opener-alternative findings, a generic Things to say line ("Excuse me, can I ask you something?"), generic Words ("yes, no, maybe, thanks") and learner lines that contradict or go beyond the answers ("Eggs are okay, but no dairy please." for a fully vegan learner, "I am allergic to shellfish.").

## Findings

- **The firm rules work on all three models.** English fallback and target-language text disappear, and generic Things to say return to the production prompt's level on Flash Lite and DeepSeek, including in "Get someone's attention".
- **Size follows the worked chapter again.** Flash Lite rises to 7, 3, 8 and 8; DeepSeek and Qwen fill the larger sizes and overrun the Word total.
- **The prompt, not only the model, limited DeepSeek.** DeepSeek with R3 beats DeepSeek with the production prompt in 17 of 21 pairs for both reviewers.
- **Flash Lite does not match DeepSeek on the same prompt.** R3 brings Flash Lite to about the level of today's production output, at a median 2.7 s per topic, but DeepSeek gains more from the same prompt.
- **Open issues for adoption:** Word totals (a schema with at most three families of at most three items, a higher parser limit, or trimming as today), speaker alternation in the parser, and the R2 contract changes in `api/src/phrasebook/`.

## Limits

Two samples per cell; blind review on the first sample only; assistant reviewers, at most two per packet, no owner or native-speaker adjudication; the 12 tuned topics were visible while drafting and R3 was written after seeing R1 and R2 results on all 21 topics, so no topic is fully untouched; Spanish dominates (15 of 21 topics); R3 ran in a later window than the replies it is compared with. Translation (B) was not evaluated.
