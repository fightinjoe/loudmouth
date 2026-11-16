---
kind: record
status: current
summary: English-generation screen 2026-11-13 of five open-weight flash-tier models against production DeepSeek on 12 baseline topics; only Qwen3.8 Flash comes close, none is adopted.
verified: 2026-11-13
---

# Open-weight flash-tier screen for English generation

On 2026-11-13 five open-weight flash-tier models were screened for the `/phrasebook` English-generation stage (lane A). They used the same suite, inputs, prompt (candidate 4), output cap and DeepSeek baseline run as the [Hydrogen comparison](2026-11-13-hydrogen-english-model-comparison.md): the first three topics of each Spanish `basics` baseline request, 12 singleton-topic calls per model, serial, no retries. Each model first got one probe call on `directions-walking-es--1`. The gate was reasoning off or `minimal`, output accepted by the production parser, and about 8 s or less. Models that passed ran the other 11 topics. Review was by the assistant against the [rubric](../rubric.md), scoring only rules the prompt asks for. It was not blind and has no owner or native-speaker review. Raw replies were local and have been deleted.

**Outcome:** none is adopted. Qwen3.8 Flash is the only model close to DeepSeek; the other four are worse.

## Configurations and gate

| Model | Provider (prices per M, 2026-11-13) | Reasoning | Probe |
|---|---|---|---|
| `qwen/qwen3.8-flash` | Alibaba ($0.15 / $0.47) | disabled | Pass: 4.95 s |
| `z-ai/glm-5.3-flash` | Z.ai fp8 ($0.15 / $0.50) | disabled rejected (HTTP 400, "Reasoning is mandatory for this endpoint and cannot be disabled."), then `minimal` | **Fail:** 9.81 s, slower than the gate |
| `minimax/minimax-m3.1-flash` | MiniMax ($0.075 / $0.30) | disabled rejected (same 400), then `minimal` | Pass: 3.92 s |
| `google/gemma-4-31b-it` | Crusoe bf16 ($0.14 / $0.40) | disabled | Pass: 3.30 s |
| `mistralai/mistral-small-2603` | Mistral ($0.15–0.165 / $0.60–0.66) | disabled | Pass: 2.05 s, near-empty content |

GLM was measured only on its first-party endpoint; other GLM providers may be faster.

## Technical results (12 topics)

| Measure | DeepSeek (baseline) | Qwen3.8 Flash | MiniMax M3.1 Flash | Gemma 4 31B | Mistral Small 4 |
|---|---|---|---|---|---|
| Accepted by `validateGenerationResponse` | 11 | 12 | 12 | 12 | 11 |
| Recovered with Words trimmed | 3 | 1 | 2 | 0 | 1 |
| Seconds per topic, median | 3.95 | 5.63 | 4.37 | 4.73 | 2.87 |
| Seconds per topic, range | 2.6–8.0 | 4.6–7.6 | 3.8–25.7 | 3.3–6.5 | 2.1–4.4 |
| Output tokens, median | 685 | 629 | 786 (227 reasoning) | 618 | 375 |
| Reported cost, 12 topics | $0.0049 | $0.0046 | $0.0041 | $0.0061 | $0.0036 |

Mistral's rejection: `directions-walking-es--3` has two consecutive partner turns. The DeepSeek baseline ran about an hour earlier, so the latency comparison is directional only. Screening spend was about $0.019 reported. The two rejected disabled-reasoning calls reported no cost.

## Quality review

- **Qwen3.8 Flash: close to DeepSeek.** Better on 4 topics, worse on 2, tied on 6. Better: walking distance, transit attention, transit where (DeepSeek was rejected there) and surf lesson booking. Alternatives change information ("Yes, just two blocks away." / "No, it is quite far from here."), and "Answer questions about myself" gives adaptable answers ("I work as a software engineer.", "I am learning Spanish to communicate better with your family."). Worse on the two dinner greeting and compliment topics: "Your son or daughter speaks very highly of you.", thanks to hosts ("I really appreciate your hospitality."), low-value alternatives ("It is my grandmother's recipe." / "I hope it turns out well for everyone."). It writes without contractions; the rubric does not score that.
- **MiniMax M3.1 Flash: worse.** Directions topics repeat one noun in every line ("Where is the monument? • How do I get to the monument? • Is the monument near here?"). It copies the answer label into dialogue ("A landmark or monument."). It invents facts ("your daughter's partner", "I hope you like Italian food.") and writes flat lines ("I will try the food."). It had three slow outliers (25.7, 14.2 and 11.4 s) even at `minimal` reasoning.
- **Gemma 4 31B: worse.** Content is thin: two-turn exchanges, Word families of two or three items, and the same "Is it far from here?" across topics. "Greet and introduce myself" is all generic greetings and thanks, with an unnatural line that also assumes gender ("Hello, I am the partner of your son"). It invents specifics ("I grew up in New York", "Go to Playa Tamarindo.").
- **Mistral Small 4: worse.** Content is close to empty: one Things to say entry on two topics, and answer labels echoed ("A landmark or monument.", "Using public transport."). It offers irrelevant landmarks ("The Eiffel Tower? | The Sagrada Família?").

## Limits

One sample per topic and model; Spanish `basics` only; assistant review only, not blind. Each model was pinned to one provider; other providers serve different quantizations and speeds.
