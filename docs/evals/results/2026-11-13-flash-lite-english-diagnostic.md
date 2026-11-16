---
kind: record
status: current
summary: English-generation diagnostic 2026-11-13, Gemini 3.5 Flash Lite versus production DeepSeek v4.1 Flash on 12 baseline topics with the unchanged prompt; Flash Lite output is about half the size and mirrors the prompt's JSON skeleton.
verified: 2026-11-13
---

# Gemini 3.5 Flash Lite diagnostic for English generation

On 2026-11-13 the `/phrasebook` English-generation stage (lane A) ran on the first three topics of each of the four Spanish `basics` requests in [baseline inputs](../baseline.md): 12 singleton-topic calls per model, serial, no retries, unchanged production prompt (candidate 4) and 6,000-token output cap. The suite was built with `evals/baseline/prepare-english.mjs` and dispatched by Prompt Romp under an owner-approved brief and exact plans. The purpose was a failure profile for Flash Lite beside DeepSeek before any prompt redesign, not an adoption decision. Review was by the assistant against the [rubric](../rubric.md); it was not blind and has no owner or native-speaker adjudication. Raw replies are in an ignored local run directory and are not committed.

**Outcome:** informational. On the same prompt the two models fail in opposite directions: Flash Lite under-fills and reproduces the shape of the prompt's JSON skeleton; DeepSeek over-fills and breaks stated limits.

## Configurations

| | DeepSeek | Flash Lite |
|---|---|---|
| Model | `deepseek/deepseek-v4.1-flash` | `google/gemini-3.5-flash-lite` |
| Provider (OpenRouter, pinned, no fallback) | Relace | Google Vertex `global` |
| Reasoning | disabled | effort `minimal` (0 reasoning tokens reported) |
| Price per M tokens (2026-11-13) | $0.12 in / $0.50 out | $0.30 in / $2.50 out |

## Technical results

| Measure | DeepSeek | Flash Lite |
|---|---|---|
| Accepted by `validateGenerationResponse` | 11/12 | 11/12 |
| Recovered with Words trimmed | 4 (11 or 12 → 10) | 0 |
| Rejected | 1: five-turn exchange (`directions-transit-es--1`) | 1: invalid JSON, one extra closing brace after a complete object (`family-dinner-first-meeting-es--3`) |
| Seconds per topic, median (range) | 2.43 (1.5–5.1) | 1.49 (1.3–2.2) |
| Output tokens per topic, median | 680 | 323 |
| Reported cost, 12 topics | $0.0048 | $0.0175 |

Latency is through OpenRouter in one window; a direct Vertex call was not measured.

## Structure of the content

Counts are over replies that parse as JSON: 12 DeepSeek topics, 11 Flash Lite topics.

| Per topic, median (range) | DeepSeek | Flash Lite |
|---|---|---|
| Things to say | 6.5 (4–8) | 4 (3–4) |
| Likely exchanges | 3 (2–4) | 1 (1–2); 8 of 11 topics have one |
| Turns per exchange | 3 (2–5) | 3 (3–3) |
| Words | 8 (4–12) | 4 (3–8) |
| Word families | 2 (1–3) | 1 (1–2) |
| Example conversation turns | 6 (5–9) | 4 (2–5); 4 of 11 have two turns |

- **Skeleton mirroring.** All 14 Flash Lite exchanges have the shape of the one exchange in the prompt's JSON skeleton: learner opener, partner turn with exactly two options, learner follow-up. None is partner-initiated (DeepSeek: 18 of 37). The four two-turn example conversations are learner then partner, as in the skeleton.
- **Opener alternatives:** 0 of 37 (DeepSeek) and 0 of 14 (Flash Lite). The Flash Lite reply with invalid JSON has two-option partner openers in both exchanges.

## Quality review

**Flash Lite**

- **Thin.** See the counts above. "Get someone's attention" (transit) has three Things to say, one exchange, one three-word family ("subway, bus, train") and a two-turn example.
- **Generic.** The answer label "A landmark or monument" becomes the destination: "Where is the historical monument?", "How do I reach the historic landmark by public transport?", "Is the memorial near this station?". The reply "It is three blocks straight ahead." appears in four topics. Families are single broad buckets ("relationship terms: mother, father, son, daughter", "Food and home descriptors: delicious, savory, cozy, spacious").
- **Unnatural.** Written register with no contractions in any line (DeepSeek: 72): "What are the wave conditions like today?", "I need a surfboard rental for a beginner." against DeepSeek's "How are the waves today?". Eight learner lines announce the next action with "I will": "Thank you, I will walk straight.", "Thank you, I will stay on for three stops.", "Great, I will include the rental." Supplied facts are packed into one line: "I need a surfboard for a beginner staying at a surf camp." The rubric does not score contractions; they are reported here as part of the register.
- **Invented facts.** "I have heard so much about you from your son." (assumes gender), "I brought this wine to share with dinner tonight.", "for five days".
- **Strengths.** Alternatives usually change the information and are paired with follow-ups ("It is about a ten-minute walk." / "It is too far to walk from here." → "That is close enough, thank you." / "Then I need to find another way."). No count overruns. One generic Things to say entry (host thanks).

**DeepSeek**

- Coverage is broader than Flash Lite on every accepted topic, and the register is spoken throughout.
- All four Things to say in "Get someone's attention" (walking) start with "Excuse me,"; the transit version opens with a two-sentence entry and drifts into the next topic ("Which bus or metro line goes to the landmark?").
- Host thanks in Things to say in two dinner topics ("Thank you for having me in your home."). Off-topic fact under "Book a surf lesson" ("I'm staying at the surf camp.").
- Paraphrase or number-swap alternatives ("About four blocks." / "It's about six blocks from here.", "Good evening, please come in." / "Welcome, please come in.").

## Limits

One sample per topic and model; Spanish `basics` only; 12 of 22 baseline topics; assistant review only, not blind. Whether the JSON skeleton causes the Flash Lite shape is an inference from the match, not a tested effect. Translation (B) was not evaluated.
