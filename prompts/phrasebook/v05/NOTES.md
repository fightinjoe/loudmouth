# /phrasebook — Step A (phrases only), v05

- **Model:** `gemini-3.5-flash-lite`, `responseMimeType: application/json`, no other config
- **Date:** 2026-09-12
- **Step:** A — English-only conversation lines.

## Changes from v04

1. Dropped `comfortable` — enum now `none | basics | conversational`. Rationale: unstable
   (best level in v03, worst in v04 — its purely subtractive definition collapsed when
   v04 added more subtractive rules); target user lives in none→conversational; less
   prompt surface. Re-addable later.
2. Answer-branch rule: when the partner asks the learner a question, give two "or"
   alternatives covering the likely realities — unless known learner facts decide it.
3. Filler rule scoped: "cut words, not phrases" (anti-shrinkage).
4. "actually" escalated from cut-list example to a hard ban ("never earns its place")
   after surviving two soft attempts.

## Runs (salsa fixture × 3 abilities)

| ability | latency | in | out | lines |
|---|---|---|---|---|
| none | 1.58s | 1048 | 435 | 5/6/6 |
| basics | 1.59s | 1048 | 372 | 4/5/5 |
| conversational | 1.73s | 1048 | 407 | 5/5/5 |

## Run 2 (same prompt, variance check)

| ability | latency | in | out | lines |
|---|---|---|---|---|
| none | 1.65s | 1048 | 442 | 5/5/6 |
| basics | 1.74s | 1048 | 416 | 5/5/6 |
| conversational | 1.54s | 1048 | 410 | 5/5/5 |

Diff vs run 1:
- **Branching is stochastic, not broken:** run 2 produced 8 `or` lines vs run 1's 4;
  the "come here often" branch fired at `none` AND `basics` this time, plus new
  partner-side branches ("I take classes downtown" / "I just practice a lot").
  Rule works; per-run application varies.
- **`none` introductions absent in BOTH runs** — v04's name exchange has not returned
  since the none-clause reframe. 2/2 runs → treat as real, not variance.
- **Ability differentiation weak in both runs:** topic 1 near-identical across levels
  both times; run 2 `none` even got a `comfortable`-grade line ("Where'd you learn to
  dance?"). May be seed-limited: salsa is casual/simple everywhere.
- Stable across both runs: zero repair lines, zero "actually", "Wanna dance?" at
  `basics` (2/2), line totals 14–17, latency 1.5–1.75s.

## Run 3: all five fixtures at `basics`

| tag | seed | lang | latency | in | out | lines |
|---|---|---|---|---|---|---|
| salsa | salsa dancing in Austin, TX | es | 1.45s | 1048 | 357 | 4/4/5 |
| surf | surf vacation in Costa Rica | es | 2.19s | 1047 | 670 | 9/9/8 |
| vegan | ordering vegan food | ja | 1.77s | 1058 | 476 | 5/6/7 |
| directions | asking directions | cs | 1.68s | 1047 | 485 | 5/7/6 |
| sick | feeling sick | zh | 1.45s | 1054 | 385 | 5/5/5 |

Findings:
- **Repair-rule collision resolved correctly:** directions fixture contains the topic
  "Ask to repeat or slow down" — the model generated it faithfully as its own coherent
  conversation AND kept repair lines out of the other two topics. Explicit topic beats
  the general repair rule. Until `/context` moves repair to preset packs, this is
  exactly the graceful behavior we want; no prompt change needed.
- **Swap-one-word branching shines cross-seed:** "seven-foot funboard / eight-foot
  longboard", "metro station / bus stop", "Since this morning / Since yesterday" — the
  product vision working. Partner-side comprehension branches too ("Go straight / Turn
  left / Turn right" triple).
- **Localization for free:** Costa Rica "soda", "fish casado"; vegan/ja surfaces dashi.
- **`or` misuse (hard finding):** vegan topic 1 marks "No eggs, no honey, no dashi." as
  an *alternative* to "No meat, no fish, no dairy." — but the learner is fully vegan;
  both are true simultaneously. "or" used for complementary continuation, implying a
  pick-one that would mislead.
- Nits: surf "Here's my passport." is a non-sequitur after the price line; vegan
  partner echo "Vegan?" is a low-value line; salsa run 3 shrank to 13 lines
  (topic-1 branches lost — variance, 3 runs now range 13–17).

## User ruling on `or` semantics

The vegan "No eggs, no honey, no dashi." finding is NOT a defect: `or` captures
*alternatives* (what you'd say varies by moment/location), not strictly mutually
exclusive options. Do not tighten `or` to mutual exclusivity.

## Run 4: vegan fixture × 3 abilities

| ability | latency | in | out | lines |
|---|---|---|---|---|
| none | 1.85s | 1058 | 537 | 7/9/6 |
| basics | 1.54s | 1058 | 434 | 5/6/5 |
| conversational | 1.95s | 1058 | 603 | 7/9/7 |

Findings:
- **Differentiation hypothesis confirmed — salsa was flat terrain.** On a stakes seed
  the axis grips hard: `none` gets attention-getting glue ("Hi." / "Excuse me." /
  "Yes?"), the simplest question form ("Is this vegan?"), and *deictic ordering*
  ("I'll take this one, please" — pointing); `basics` names dishes; `conversational`
  gets full self-explanations ("I don't eat any animal products at all"), compound
  asks ("dashi or fish broth"), and follow-up handling (rice / drink). Totals 22/16/23.
- `conversational` topic 2 is excellent comprehension training: per-ingredient
  yes/no partner answer pairs.
- **Cross-speaker `or` returned** (v01 defect recurrence): basics topic 2 interleaves
  alternative *questions* ("egg?" / "dairy?" / "honey?") with alternative *answers*,
  marking you-lines as alternatives to partner lines. Phrases all useful; marker
  semantics ("alternative to the line before it") break when alternatives interleave.
  Schema design question for client rendering more than a prompt defect.

## Scorecard vs. v05 targets

- ✅ "actually": zero occurrences, no awkward evasions. Hard ban worked where the
  quoted cut-list failed. (Model lesson: this model responds to absolute per-word rules,
  not example lists.)
- ✅ Branch rule honored its guard: dancing-ability lines stay unbranched (known fact);
  the exact desired branch appeared at `conversational`: "It's my first time here." /
  (or) "I come here all the time."
- ⚠️ Branch rule consistency: only 1 of 3 levels branched the "come here often" question;
  `none` and `basics` answered it flat.
- ⚠️ Shrinkage: flat vs v04 (14–17 lines), no recovery to v03's 17–20, but no further
  shrink; the floor-hugging level is gone.

## New regressions

- `none` lost its name-exchange/introductions material (v04's flagship none
  differentiator) — levels now look similar in topics 1 and 3. Could be single-run
  variance; check on next run before adding a rule.
- "Wanna dance?" at basics — very casual register; fine for salsa, watch on other seeds.

## Verdict

Pending user review.
