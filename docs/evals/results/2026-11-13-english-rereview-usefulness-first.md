---
kind: record
status: current
summary: Blind re-review 2026-11-13 of saved candidate R3 English outputs under the owner's proposed dimension order (usefulness first); DeepSeek R3 still preferred over Flash Lite R3, usefulness itself even, and R3's larger sizes lower usefulness on DeepSeek.
verified: 2026-11-13
---

# Re-review of candidate R3 outputs with usefulness first

On 2026-11-13 the owner proposed a new order for the lane A review dimensions: usefulness of phrases and vocabulary first, then correctness and fit, then coverage (these three close together), then naturalness and reusability, then conversation flow. The reason given: high coverage can bring in content that is not useful. This record re-reviews saved outputs of the [candidate R3 run](2026-11-13-english-prompt-candidate-r3.md) and the [reframing study](2026-11-13-english-prompt-reframing.md) under that order. No provider calls were made. At the time of the review the [rubric](../rubric.md) was version 2.0 and the order was given to reviewers as an instruction overriding its Dimensions and Priorities sections; the owner confirmed the order and the usefulness wording on 2026-11-14, and rubric 2.1 carries them.

**Outcome:** informational. The model ranking does not change, and the owner's concern about size is supported on DeepSeek.

## Method

Blind assistant reviewer subagents, first sample of each of the 21 topics, sides shuffled, conditions hidden, the rubric's English generation rules unchanged. Reviewers scored five dimensions and chose a side by the proposed order. Usefulness was defined for them as: every Things to say entry, exchange line, alternative and Word is something this learner is likely to say or hear in this situation and would want on a card; padding, near-duplicates (including an alternative that only rewords another option), low-value Words and material that belongs to another chapter lower it; a missing item is a coverage matter.

## Results

Cells are first side / second side / tie.

| Comparison | Reviewer 1 | Reviewer 2 | Same verdict | Earlier result, old order |
|---|---|---|---|---|
| DeepSeek R3 versus Flash Lite R3 | 15 / 5 / 1 | 15 / 6 / 0 | 19 of 21 | 18 / 3 / 0 and 19 / 2 / 0 |
| DeepSeek R3 versus DeepSeek R2 | 13 / 7 / 1 | 11 / 9 / 1 | 18 of 21 | not compared |
| DeepSeek R3 versus DeepSeek base (production) | 17 / 4 / 0 | | | 17 / 3 / 1 and 17 / 4 / 0 |
| Flash Lite R3 versus DeepSeek base (production) | 15 / 6 / 0 | | | 8 / 12 / 1 and 12 / 8 / 1 |

**DeepSeek R3 versus Flash Lite R3,** pairs in which each side is scored higher (reviewer 1, reviewer 2):

| Dimension | DeepSeek higher | Flash Lite higher |
|---|---|---|
| Usefulness | 5, 6 | 5, 6 |
| Correctness and fit | 6, 9 | 4, 4 |
| Coverage | 14, 18 | 0, 0 |
| Naturalness and reusability | 16, 14 | 2, 2 |
| Conversation flow | 9, 9 | 3, 5 |

Findings in that packet: other-chapter material 34 and 27 for DeepSeek against 12 and 10 for Flash Lite; low-value items 17 and 17 against 29 and 20; missing items 1 and 2 against 8 and 11; paraphrase alternatives 17 and 16 against 15 and 13; poor titles 4 and 4 against 2 and 4.

**DeepSeek R3 versus R2** (same contract; R3 has the firm rules and larger sizes): R2 is scored higher on usefulness (7 pairs to 3, and 10 to 4) and flow (11 to 4, and 9 to 4); R3 on coverage (10 to 2, and 9 to 4). R3 has about twice the other-chapter findings (34 and 32 against 18 and 14) and paraphrase-alternative findings (19 and 18 against 9 and 7). R3 still wins overall, helped by R2's generic and English-fallback failures in the two "Get someone's attention" topics. Median cards per topic are 45.5 for DeepSeek R3, 38.5 for DeepSeek R2 and 33 for Flash Lite R3.

## Findings

- **DeepSeek stays ahead on the same prompt,** by a smaller margin. Usefulness does not separate the two models; DeepSeek's lead is coverage, naturalness and correctness.
- **The two models miss usefulness differently.** DeepSeek spills into sibling chapters; Flash Lite has more low-value items and more missing ones.
- **Larger sizes cost usefulness on DeepSeek.** Moving from R2's sizes to R3's doubled other-chapter and paraphrase findings.
- **Under this order Flash Lite R3 is preferred over production DeepSeek** by the one reviewer who compared them, where the old order gave a split.

## Limits

Assistant reviewers only, one or two per packet, first sample only; the R3 versus R2 comparison mixes the size change with the rule changes; no topic is untouched by earlier drafting. Translation (B) was not evaluated.
