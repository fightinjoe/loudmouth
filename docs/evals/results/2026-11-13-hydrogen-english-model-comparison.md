---
kind: record
status: current
summary: English-generation model comparison 2026-11-13, Gemini 4 Hydrogen versus production DeepSeek v4.1 Flash on 12 baseline topics; Hydrogen not adopted.
verified: 2026-11-13
---

# Gemini 4 Hydrogen versus DeepSeek for English generation

On 2026-11-13 the `/phrasebook` English-generation stage (lane A) ran on the first three topics of each of the four Spanish `basics` requests in [baseline inputs](../baseline.md), 12 singleton-topic calls per model. Both used the production prompt (candidate 4) and the 6,000-token output cap, ran serially with no retries, and were dispatched by Prompt Romp from a suite built with `evals/baseline/prepare-english.mjs`. Review was by the assistant against the [rubric](../rubric.md), scoring only rules the prompt asks for, with no paid judge and no native-speaker review. Raw replies and Prompt Romp state were local and have been deleted; they are not replayable.

**Outcome:** Hydrogen is not adopted. It misses the decision rule (equal or better on every topic), is about 3× slower and about 40× more expensive per topic.

## Configurations

| | Baseline | Candidate |
|---|---|---|
| Model | `deepseek/deepseek-v4.1-flash` | `google/gemini-4-hydrogen` (served `-20261112`) |
| Provider | Relace only, no fallback | Google Vertex `global` only, no fallback |
| Reasoning | disabled | effort `minimal` |
| Price per M tokens (2026-11-13) | $0.12 in / $0.50 out | $1.50 in / $7.50 out |

The requested `google/gemini-4-hydrogen:batch` (Google Vertex, $0.75 / $3.75) was probed first: OpenRouter returned HTTP 404, "cannot be used with the chat/completions endpoint (adapter VertexGeminiBatchAdapter)". It is only reachable through OpenRouter's asynchronous batch API, which cannot serve the interactive endpoint or Prompt Romp. The owner then chose the standard model; the snapshot is the same.

## Technical results

| Measure | DeepSeek | Hydrogen |
|---|---|---|
| Accepted by `validateGenerationResponse` | 11/12 | 12/12 |
| Recovered with a warning | 3 (Words 12 → 10) | 0 |
| Seconds per topic, median (range) | 3.95 (2.6–8.0) | 11.45 (9.6–16.1) |
| Output tokens per topic, median | 685 | 1,765 (1,040 reasoning) |
| Reported cost, 12 topics | $0.0049 | $0.1983 |

- DeepSeek rejection: `directions-transit-es--2`, exchanges of 6 and 5 turns (four allowed), the same failure class as the earlier surfing baseline. Production would retry it.
- Hydrogen still spends about 60% of its output on reasoning at `minimal` effort; that is where the extra latency and cost come from. Four concurrent topics per phrasebook mean roughly 25–30 s for a six-topic phrasebook against roughly 10 s today.

## Quality review

Hydrogen was equal or better on 9 of 12 topics, worse on 3.

| Topic | Better | Main reason |
|---|---|---|
| Walking: get attention | DeepSeek | Hydrogen Things to say are compound: "I'm trying to walk to the main square—do you know which way it is?", "Are you from around here? I'm looking for the cathedral." |
| Walking: ask where | Tie | Both short and usable. |
| Walking: distance | Hydrogen | DeepSeek exchanges repeat Things to say ("How many minutes on foot?") and continue against the first option ("Yes, very short." → "Okay, I'll walk anyway."); plural Words ("minutes", "blocks"). |
| Transit: get attention | Hydrogen | DeepSeek opens with three paraphrases ("I'm looking for a famous monument nearby." / "Is there a well-known monument around here?") and a 13-word line ("Excuse me, sorry to bother you, but I'm trying to find the monument."). |
| Transit: ask where | Hydrogen | DeepSeek reply rejected by the parser; Hydrogen alternatives change the action ("Ask the driver to tell you when you reach the plaza."). |
| Transit: distance | Tie | Near-identical Things to say. |
| Surf: rent a board | Tie | Both strong. |
| Surf: book a lesson | Hydrogen | DeepSeek paraphrase alternatives ("Sure, what's your level?" / "Of course. Are you a beginner?") and an off-topic Word ("high tide" under booking times). |
| Surf: wave conditions | Tie | Both strong. |
| Dinner: greet and introduce | DeepSeek | **Hydrogen coverage gap:** no line introduces the learner. Both include thanks to hosts, which the owner ruled generic ("Thank you for inviting me to your home." / "Thank you for having me in your home."). DeepSeek has two two-option exchange openers ("This is my husband, Carlos." / "Make yourself at home."). |
| Dinner: compliments | Tie | Both usable. |
| Dinner: answer questions about myself | DeepSeek | **Hydrogen coverage gap:** no line answers anything. Things to say are meta ("What would you like to know about me?", "I'd love to tell you about my family."). Answers deflect ("I'd love to tell you about my job.", "It's a funny story."). DeepSeek gives adaptable illustrative answers ("I work as an engineer.", "I've been studying Spanish for a few months."). |

Hydrogen's strengths are alternatives that change information or action, and base-form Words. Its two coverage gaps both come from avoiding statements about the learner. That looks like the prompt's no-invented-facts rule over-applied [inference]. These are coverage findings, not English-surface issues.

## Limits

One sample per topic and model; Spanish `basics` only; assistant review only, not blind, no owner or native-speaker adjudication. Provider latency is one window on one day. Translation (B) was not evaluated.
