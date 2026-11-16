---
kind: record
status: current
summary: English-generation candidate R4 (2026-11-14, usefulness first) on DeepSeek and Gemini 3.5 Flash Lite over 21 topics; preferred over R3 on both models and over the previous prompt on every DeepSeek topic, DeepSeek still ahead of Flash Lite; adopted on 2026-11-14 with its reply contract.
verified: 2026-11-14
---

# English-generation candidate R4

On 2026-11-14 a fourth candidate prompt for the `/phrasebook` English-generation stage (lane A) was run on DeepSeek v4.1 Flash and Gemini 3.5 Flash Lite with the inputs and settings of the [reframing study](2026-11-13-english-prompt-reframing.md), and compared with saved [R3](2026-11-13-english-prompt-candidate-r3.md) and production-prompt replies. R4 was written for [rubric](../rubric.md) 2.1, which puts usefulness first, after the [usefulness-first re-review](2026-11-13-english-rereview-usefulness-first.md). Dispatch was by Prompt Romp under an owner-approved brief and exact plans: 84 calls (21 topics, two samples, two models), serial, no retries, 6,000-token output cap, no paid judge. The candidate text, raw replies and review packets are in an ignored local run directory.

**Outcome:** R4 was adopted in `api/src/phrasebook/prompt.txt` on 2026-11-14 by owner decision, together with its request and reply contract, the enforced schema and DeepSeek as primary with Flash Lite as the rate-limit fallback ([POST /phrasebook](../../api/phrasebook.md)); it is not deployed yet ([production](../../api/operations.md#production)). In this record "production prompt" and "base" mean the prompt it replaced. R4 is preferred over R3 on both models and over the previous prompt on all 21 DeepSeek topics, with usefulness and flow up and coverage unchanged. DeepSeek with R4 is still preferred over Flash Lite with R4. Three issues were open at review time: speaker alternation on DeepSeek, the ten-Word parser limit against the new Words bound, and generic Things to say in generic-titled topics.

## What R4 changes against R3

R4 keeps R3's request shape and its three rules without exceptions, and changes:

- **Usefulness first.** The opening and the first quality principle say every card costs study time and each line, alternative and Word must be one the learner is likely to use. The principles follow the rubric 2.1 order.
- **Sizes as ceilings:** usually 5 to 7 Things to say, 3 exchanges, 6 to 8 example turns, with "end a section when the next item is one the learner could do without". The worked chapter has 6, 3, 11 Words and 8 turns.
- **Alternatives:** at most one `or` line per turn (schema), only when the answer could go the other way, with yes and no as the model case.
- **Words:** up to three families of two to six Words (schema), per the owner's decision that an extra Word loses value far more slowly than an extra phrase. An empty list stays allowed.
- **Titles:** one to three words naming the moment or the choice, not the people.
- **A fourth rule:** nothing from another chapter, with one stated exception for topics whose title names a courtesy step.

The prompt is 1,837 words.

## Technical results

Per cell of 42 calls; R3 columns repeat the R3 record.

| | Flash Lite R3 | Flash Lite R4 | DeepSeek R3 | DeepSeek R4 |
|---|---|---|---|---|
| Accepted unchanged | 40 | 41 | 9 | 10 |
| Accepted, Words trimmed to ten | 2 | 1 | 32 | 30 |
| Rejected | 0 | 0 | 1 | 2 |
| Seconds, median (max) | 2.70 (3.3) | 2.25 (3.1) | 2.59 (5.7) | 5.72 (10.5) |
| Output tokens, median | 588 | 506 | 801 | 658 |
| Input tokens, median | 3,251 | 3,399 | 2,566 | 2,718 |
| Reported cost, 42 calls | $0.104 | $0.095 | $0.020 | $0.017 |

- **Words.** Every R4 reply is within three families of two to six Words. DeepSeek writes a median 12.5 Words, so the production parser's ten-Word limit (`MAX_WORDS` in `api/src/phrasebook/parse.js`) trims 30 replies that the new bound allows. No reply from either model has an empty Words list.
- **Rejections:** two DeepSeek replies with consecutive turns by the same speaker, one in an exchange and one in the example conversation.
- **Latency:** DeepSeek on Relace was slow in this window (median 5.7 s, maximum 10.5 s); Flash Lite was not. Both are through OpenRouter.
- Reported spend for the 84 calls was $0.11.

## Content measures

Deterministic counts over both samples.

| | Flash Lite R3 | Flash Lite R4 | DeepSeek R3 | DeepSeek R4 |
|---|---|---|---|---|
| Cards per topic, median | 33 | 28 | 45.5 | 40 |
| Things to say | 7 | 5 | 8 | 6 |
| Likely exchanges | 3 | 2 | 4 | 3 |
| Example conversation turns | 8 | 7 | 10 | 8 |
| Words | 8 | 7 | 11 | 12.5 |
| Word families per topic | 2 | 1 or 2 | 3 | 2 or 3 |
| Alternative lines per topic, median | 3 | 2 | 3 | 1 |
| Later turns with an alternative | 64% | 42% | 29% | 16% |
| Alternative sets pairing a yes-type with a no-type reply | 28% | 38% | 14% | 17% |
| Exchange titles that name people | 8% | 4% | 19% | 18% |
| Family titles that name people | 0% | 0% | 8% | 3% |
| Things to say nearly repeated in a sibling topic | 3% | 2% | 10% | 8% |
| Generic Things to say (pattern match) | 1% | 4% | 3% | 6% |
| Generic Words (pattern match) | 0% | 0% | 1% | 2% |
| Replies asking about speaking English | 0 | 0 | 0 | 0 |

A card is one Things to say entry, exchange line, alternative, Word or example line. Titles "naming people" contain you, your, they, them, someone, the person or who. The only non-English string under R4 is a Spanish station name.

- **Flash Lite families.** Flash Lite never writes three families under R4 (one family in 13 replies, two in 29) and its family sizes rise to mostly four or five.
- **DeepSeek titles.** Family titles improve ("Landmarks", "Distance", "Board types"); exchange titles keep a people-centred form the prompt's examples did not cover ("They're busy", "They offer help", "Your level").
- **Generic language** rises again in the two "Get someone's attention" topics and the dinner greeting topic on both models ("Excuse me, could you help me for a second?", "Sorry to bother you.", a "Being polite" Word family). The new other-chapter rule leaves such topics little else to say.

## Blind review

First sample of every topic, 21 pairs per packet, sides shuffled and conditions hidden, assistant reviewer subagents applying rubric 2.1. Cells are first side / second side / tie.

| Comparison | Reviewer 1 | Reviewer 2 | Same verdict | Held-out only |
|---|---|---|---|---|
| DeepSeek R4 versus DeepSeek R3 | 16 / 4 / 1 | 17 / 3 / 1 | 17 of 21 | 7 / 1 / 1 and 7 / 2 / 0 |
| DeepSeek R4 versus Flash Lite R4 | 12 / 8 / 1 | 16 / 5 / 0 | 17 of 21 | 8 / 0 / 1 and 9 / 0 / 0 |
| Flash Lite R4 versus Flash Lite R3 | 17 / 4 / 0 | | | 6 / 3 / 0 |
| DeepSeek R4 versus DeepSeek base (production) | 21 / 0 / 0 | | | 9 / 0 / 0 |

One production reply is unreadable and loses its pair in the last row.

- **R4 against R3 on DeepSeek:** R4 is scored higher on usefulness in 14 and 15 pairs against 1 and 2, and on flow in 17 and 13 against 0; coverage is level (3 to 4, and 3 to 1, the rest ties). Findings fall from R3 to R4: low-value items 42 and 34 to 23 and 20, other-chapter material 44 and 37 to 23 and 19, paraphrase alternatives 24 and 22 to 3 and 2, poor titles 20 and 17 to 5 and 7.
- **R4 against R3 on Flash Lite:** usefulness 15 pairs to 1 for R4, coverage 9 to 1 for R3. Low-value findings fall from 36 to 11; missing-item findings rise from 2 to 5.
- **DeepSeek against Flash Lite on R4:** usefulness is level (6 pairs to 8, and 7 to 7). DeepSeek is scored higher on coverage (11 to 0, and 18 to 0), flow (11 to 4, and 12 to 4) and correctness (5 to 1, and 6 to 1). DeepSeek has more other-chapter findings (23 and 20 against 5 and 7); Flash Lite has the missing-item findings (4 and 7 against none). Flash Lite's wins are mostly in the directions topics, where DeepSeek spills into sibling chapters; on the held-out topics DeepSeek wins all but one tie. With R3 the same comparison was 15 to 5 and 15 to 6 under this priority order.

## Findings

- **Usefulness rose without a coverage loss on DeepSeek.** Shorter chapters, one outcome-changing alternative per turn and the other-chapter rule removed about half of the low-value and other-chapter findings and nearly all paraphrase alternatives.
- **Flash Lite trades coverage for usefulness.** It follows the smaller sizes below the stated range (five Things to say, two exchanges) and loses coverage against its own R3 output.
- **The Words bound works as a schema rule** and DeepSeek uses it. At review time the parser still trimmed to ten; with adoption it keeps up to 24 and warns above 18.
- **Not fixed by the prompt:** speaker alternation (two DeepSeek rejections; with adoption it became a parser warning), people-centred exchange titles on DeepSeek ([todo](../../todo/backlog/exchange-titles.md)), and generic language in generic-titled topics, which the [/context check](2026-11-13-context-checklist-rule.md) addresses upstream ([todo](../../todo/backlog/context-checklist-specificity.md)).

## Limits

Two samples per cell; blind review on the first sample only; assistant reviewers, at most two per packet, no owner or native-speaker adjudication; every topic has been seen during earlier drafting; Spanish dominates (15 of 21 topics); R4 ran a day later than the replies it is compared with, and DeepSeek latency differs between windows. Translation (B) was not evaluated, including the cost of translating up to 18 Words per topic.
