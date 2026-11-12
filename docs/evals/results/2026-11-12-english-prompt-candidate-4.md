---
kind: record
status: current
summary: English-generation study 2026-11-02 to 2026-11-12 (baseline, reasoning, models, prompt candidates, provider latency); prompt candidate 4 adopted.
verified: 2026-11-12
---

# English-generation study and prompt candidate 4

From 2026-11-02 to 2026-11-12 the `/phrasebook` English-generation stage (lane A) was evaluated with the Spanish `basics` requests in [baseline inputs](../baseline.md): DeepSeek v4.1 Flash through OpenRouter, pinned to Relace, reasoning off, as in production at the time. All runs used single attempts, no retries and no paid judging; reviews were by the owner and the assistant against the [rubric](../rubric.md). Raw replies, plans and findings were local and have been deleted; they are not replayable. Rules learned from the reviews are in the [rubric decision log](../rubric.md#decision-log); follow-up work is in [to-do](../../todo/index.md).

**Outcome:** prompt candidate 4 was adopted in `api/src/phrasebook/prompt.txt` on 2026-11-12. Its deployment is tracked in [v4 release](../../todo/v4-release.md).

## Studies

| Study | Scope | Outcome |
|---|---|---|
| Baseline | All 22 topics, DeepSeek v4.1 Flash (Relace, reasoning off) | Coverage mostly strong. Owner and assistant reviews found long or fused openers, paraphrase alternatives, opening-line alternatives, "Do you speak English?" fallbacks, and repeated vocabulary. Parser: 17 accepted, 2 Word lists trimmed, 3 surfing topics rejected (five-turn exchanges, array text). |
| Reasoning | Walking topics 1–6; reasoning off (repeat), low, medium, high | Rejected for latency: median 52–74 s per topic with reasoning versus 3–6 s without. At 6,000 output tokens, 1–4 of 6 calls per level were cut off or timed out. |
| Models | Walking topics 1–3; Claude Haiku 5.5, GPT-6 Luna, DeepSeek 1017 snapshot, Gemini 3.5 Flash Lite and Muse Ember (minimal reasoning) | No candidate beat DeepSeek v4.1 Flash in owner or assistant review. Gemini and Muse Ember reject disabled reasoning; Gemini 3.5 Flash Lite needs minimal reasoning effort set explicitly (2026-11-11); Luna and Muse Ember each returned one invalid JSON reply; the DeepSeek snapshot was too slow (6–9 s). |
| Prompt | Four candidates against the previous prompt, calls alternated; final check on the first three topics of all four requests | Candidate 4 adopted; see [below](#prompt-candidate-4). Candidate 1 repeated "Excuse me." in every topic; candidate 3 invented over-specific learner facts; both were fixed before adoption. |
| Latency | Production prompt across five DeepSeek providers, plus OpenRouter timing for earlier calls | Slowness on 2026-11-11 came from Relace output speed, not the prompt; see [latency](#latency). |

## Prompt candidate 4

Changes against the previous prompt: no generic language in Things to say or Words, single-option exchange openers, no English fallback, no contractions instruction.

Interleaved comparison with the previous prompt on 8 paired topics (walking, transit, surfing, dinner):

- Equal or better rubric scores on every topic.
- Generic Things to say 7 → 2; opener alternatives 11/21 → 0/26.
- About 200 more input tokens per call (+12%), similar output length, $0.00002 more per call, same latency.
- Remaining finding: thanks addressed to hosts ("Thank you for inviting me to your home.") still appears in Things to say; the owner ruled it generic on 2026-11-12.
- The production prompt produced one unprompted placeholder ("I'm [name], [partner]'s partner.", 2026-11-12).

## Invalid JSON

The 2026-11-11 interleaved prompt tests produced two invalid replies, both a one-item `text` array closed with the wrong bracket (`["About five stops.")`). They were reported with their cause and not counted against the prompt.

## Parser rejections

`validateGenerationResponse` rejected replies with five-turn exchanges (four allowed): three surfing topics in the 2026-11-02 baseline and two candidate replies on 2026-11-11.

## Latency

On 2026-11-02 Relace took 2.2–4.0 s per topic; on 2026-11-11 it took up to 39.4 s. Time to first token stayed normal; output speed fell from 195–294 to as low as 18 tokens/s. A same-window probe of the production prompt (3 calls each, all valid) took:

| Provider | Seconds per topic |
|---|---|
| Relace | 6.6–8.5 |
| Morph | 4.3–6.4 |
| Fireworks | 3.6–5.9 |
| Together | 1.3–4.1 |
| Google Vertex | 4.0–7.5 |

Providers serve different quantizations; output quality was not compared across them.

## Rate limits

Four concurrent calls returned 429 with Relace `upstream_provider_shared_pool`. On 2026-11-12 the first six of 24 serial evaluation calls also returned 429.

## Limits

Spanish context, `basics` ability, one or two samples per topic and condition, assistant and owner review only (no native-speaker adjudication). Translation (B) was not evaluated.
