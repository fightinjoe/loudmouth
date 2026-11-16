---
kind: record
status: current
summary: /context evaluation 2026-11-13 of one added checklist rule against courtesy and repair topics, 10 seeds on Gemini 3.5 Flash Lite; such items fall from 16 to 5 with no change in validity, size or latency; not adopted.
verified: 2026-11-13
---

# /context checklist rule against courtesy and repair topics

On 2026-11-13 the production `/context` prompt (`api/src/context/prompt.txt`) was compared with a candidate that adds one checklist rule: no item for a step that belongs to every conversation (getting attention, greeting, thanking, saying goodbye, apologizing, asking someone to repeat, slow down or clarify). The check was run because generic-titled topics such as "Get someone's attention" were the weakest topics in the [English prompt reframing study](2026-11-13-english-prompt-reframing.md). Dispatch was by Prompt Romp under an owner-approved brief and exact plans: 40 calls, serial, no retries, no paid judge. Raw replies and the candidate text are in an ignored local run directory.

**Outcome:** informational; the production prompt is unchanged. The [preset-pack backlog item](../../todo/backlog/preset-packs.md) keeps repair topics in `/context` until replacements exist, so the rule is evidence for that work, not a pending change.

## Setup

- **Seeds (10):** the three requests in `evals/fixtures/baseline-context.json`; three seeds taken from `api/evals/fixtures/baseline/` (salsa in Spanish, feeling sick in Mandarin, directions in Czech, no ability); four assistant-written seeds (hotel check-in, Japanese, `none`; train ticket, Ukrainian, `basics`; airport taxi, Mandarin, `basics`; pottery class, Spanish, `conversational`). Two samples each.
- **Model:** `google/gemini-3.5-flash-lite` on Google Vertex `global` through OpenRouter, reasoning effort `minimal`, JSON-object mode, the production 2,000-token cap. Production calls Vertex directly without a reasoning setting, so latency and behavior may differ slightly.
- **Candidate rule,** inserted after the first checklist bullet: "Every item is specific to this situation. Never spend an item on a step that belongs to every conversation: getting someone's attention, greeting, thanking, saying goodbye, apologizing, or asking someone to repeat, slow down or clarify. The phrasebook already teaches those inside each conversation. Name what the learner does in this situation instead: not "Ask them to repeat" but "Check the price I heard"."

## Results

| Measure (20 replies each) | Production prompt | Candidate |
|---|---|---|
| Accepted by `validateContextResponse` | 20 | 20 |
| Seconds, median | 1.82 | 1.83 |
| Output tokens, median | 496 | 495 |
| Input tokens, median | 1,618 | 1,713 |
| Reported cost | $0.035 | $0.036 |
| Questions, median | 2 | 2 |
| Checklist items, median (checked) | 6 (5) | 6 (4) |
| Courtesy or repair-only items | 16 of 119 | 5 of 117 |
| Replies with at least one such item | 11 | 4 |

The last two rows are the assistant's reading of every checklist label. Counted as courtesy or repair-only: getting attention, a bare greeting, thanking, saying goodbye, and unspecific clarification. Not counted: items that add situation content, such as "Greet and introduce myself" or "Clarify left or right".

- **Production prompt:** all four directions replies contain an attention item and a thanks item ("Get someone's attention", "Thank the helper"); the dinner and salsa replies end with thanks and goodbye; pottery and one hotel reply open with "Greet the instructor" or "Greet the receptionist".
- **Candidate:** the directions replies have none and add situation items instead ("Confirm the walking route", "Check if I passed it"). The five remaining items are greetings and goodbyes in the dinner and salsa seeds ("Greet the parents", "Thank them and say goodbye", "Say goodbye politely").
- Question labels are of the same kind in both arms; no regression was seen.

## Limits

Two samples per seed, one model, assistant reading only; four of the ten seeds are assistant-written; `imagePrompt` content was not reviewed beyond validation.
