# Model comparison — gemini-3.5-flash-lite vs gpt-5.6-luna

- **Date:** 2026-09-12
- **Method:** identical prompts (accepted generation v09 + translate v05, `basics`),
  identical fixtures. Translation inputs are the SAME accepted Gemini v09 English
  responses for both models, so translation is apples-to-apples. Luna via
  `chat.completions`, `response_format: json_object`, no temperature/max-token
  overrides. Raw Luna responses in `responses/` (gen_<tag>.json, tr_<tag>_convN.json).

## Latency (the primary metric)

| tag | gen gemini | gen luna | translate wall gemini | translate wall luna |
|---|---|---|---|---|
| salsa | ~1.8s | **30.8s** | 0.87s | 7.7s |
| surf | ~2.2s | **26.8s** | 0.91s | 6.3s |
| vegan | ~1.8s | **21.6s** | 1.24s | 11.4s |
| directions | ~1.8s | **9.8s** | 0.89s | 9.7s |
| sick | ~1.7s | **17.4s** | 1.46s | 16.7s |

Pipeline (gen + translate): Gemini **2.6–3.3s**; Luna **20–47s**. Luna alone blows the
<10s product budget on 4 of 5 seeds at the generation step. Root cause visible in
usage: Luna bills 1,154–2,927 completion tokens per gen call (hidden reasoning tokens
dominate — visible JSON is a fraction of that), and reasoning latency scales with it.

## Cost (per full request, est. at pricing.js rates)

- Gemini: ≈ $0.003–0.004 (gen + 3 translate chunks)
- Luna: ≈ $0.006 (suite total $0.030 for 5 seeds) — ~2× Gemini despite lower list
  rates, because of billed reasoning tokens.

## Reliability / structure

- Luna: 0 count mismatches in 15 chunks, 0 ruby orphan brackets (ja + zh) — cleaner
  annotation boundaries than flash-lite (which needed the v05 boundary rules and still
  leaves strippable residue).
- Gemini across the project: 2 corrupted chunks in ~60 (count drift, dropped quote),
  both recovered by single retry.

## Quality (spot review)

- Luna translation register skews formal/written: 服用 for "take (medicine)" where
  Gemini chose conversational 吃; 您 throughout sick (Gemini mixed 你/您). For a
  spoken-conversation product, Gemini's colloquial choices fit the brief better.
- Luna nailed neutral-tone detail 谢[xiè]谢[xie]; Czech "left → doleva" (the adverb a
  directions learner actually needs — nicer than Gemini's levý; relevant to the open
  levý/pravý nit).
- Luna generation is longer (8–10-line conversations, e.g. a price exchange added to
  sick) with occasional padding ("I'll take it." + "Thanks." consecutive you-lines).

## Conclusion

**Gemini 3.5 Flash Lite stays the default backend.** Luna's structural cleanliness is
real but strippable-residue-sized; its latency (7–15× slower) is disqualifying for the
interactive path, and it's still ~2× the cost. Luna is viable only as a non-interactive
fallback (e.g. an offline regeneration/QA pass), not for the live endpoint.
