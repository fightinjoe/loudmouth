# /phrasebook generation prompt — ACCEPTED baseline (was v09)

- **Model:** `gemini-3.5-flash-lite`, `responseMimeType: application/json`
- **Accepted:** 2026-09-12, after v00–v09 (superseded versions deleted; lessons below)
- **Companion:** `translate/` (translation prompt, accepted same day). Full pipeline
  measured ≈ 2.6–3.3s end to end (gen ~1.7–2.5s + translate wall ~0.9–1.5s) vs <10s target.

## What the prompt does

One call. Inputs: `{{SEED}}`, `{{LANGUAGE}}`, `{{ANSWERS}}` (Q→A lines), `{{TOPICS}}`
(3 selected checklist items), `{{ABILITY}}` (`none | basics | conversational`).
Output: one English dialogue per topic (`you`/`partner` lines, optional `"or": true`
branch lines) with a per-conversation `vocab` list (3–6 English words). Translation is
a separate prompt; the service fans out one translate call per conversation.

## Key design decisions (with user rulings)

- **English-first**: lines are intent specs, translated later as a native speaker would
  express them — never word-for-word. Watch item: idioms with no English seed
  ("pura vida") can only surface if an English line invites them.
- **`or` = alternatives, not mutual exclusivity** (user ruling): what you say at
  breakfast may differ from dinner. Same speaker as the line it replaces. Interleaved
  alternatives can break anchoring — a schema/rendering question, not a prompt defect.
- **Branch rule**: when the partner asks the learner a question, give 2 alternative
  answers covering likely realities — unless known learner facts decide it. Firing is
  stochastic run-to-run; that's acceptable.
- **Repair phrases banned from conversations** (they pause/repair the exchange itself);
  they belong to future static preset packs ("Making sure you understand", etc. —
  server-static, API decides inclusion). An explicit checklist topic requesting repair
  ("Ask to repeat or slow down") correctly overrides the ban.
- **Ability** (`none|basics|conversational`) = which conversations are worth preparing,
  NOT difficulty. `comfortable` was dropped: purely subtractive definition collapsed
  when other subtractive rules stacked. Differentiation is seed-dependent (salsa flat,
  vegan strong: deictic "I'll take this one, please" at `none`).
- **Vocab per conversation** (not pooled): pre-anchors polysemy context for translation,
  same-chunk transliteration consistency, unlocks per-topic gen fan-out later. Service
  pools + dedups by English word. Mixed POS; singular nouns, base verbs; English only.

## Prompt-engineering lessons (from deleted v00–v08)

1. Never quote a bad phrase as a negative example — it gets echoed verbatim.
2. Soft style bias fails; explicit clauses work. Contractions required a direct
   "prefer everyday contractions" clause; "actually" required a hard per-word ban
   after two soft attempts. This model obeys absolute rules, not example lists.
3. Scope subtractive rules: "every word must earn its place" bled into line-count
   economy until "cut words, not phrases" was added. Stacked subtractive rules
   collapse output size.
4. Line counts vary ±25% run-to-run at fixed prompt. Rerun before legislating —
   two of our worst "regressions" were single-run variance.
5. The one-atomic-phrase-per-line and no-lead-in rules are load-bearing for
   memorizability (user's core quality bar: swap-one-word reusable patterns).

## Service-owed work recorded at acceptance

1. Ruby normalization: drop any `[…]` not immediately preceded by a kanji/hanzi run.
2. Per-chunk count validation (lines & vocab) + one retry on mismatch or inner-JSON
   parse failure (both failure modes observed and recovered in hand-testing); 502 after.
3. 429 retry with backoff (free tier = 15 req/min; a full request bursts 4 calls).
4. Vocab pooling + dedup by English word (keep first); service-side caps.
5. ja romanization: contextual modified Hepburn from the translation model, with mechanical WanaKana fallback for invalid entries (see `translate/NOTES.md`).
6. Card assembly per CARD_SCHEMA.md; `notes.source` example lines for drawn vocab
   (prompt-supplied examples only for expansion words — future).
7. `/context` revision track: accept `ability`, offer preset phrase packs.

## Open nits (non-blocking, carried)

- sick fixture: "Explain allergies" opener drifted off-topic once; vocab near-dupes
  (allergic/allergy).
- cs vocab lemma choice: levý/pravý (adjectives) where learners want vlevo/doleva
  (Luna chose doleva — see comparisons/luna/).
- Cross-chunk register variance (voseo in one chunk, tuteo in another, same seed) —
  candidate fix if it matters: service derives a one-line style hint injected into
  every chunk.

## Model comparison

See `comparisons/luna/NOTES.md`: gpt-5.6-luna = 7–15× slower (reasoning tokens),
~2× cost, cleaner structure, more formal register. flash-lite stays default.

## Baseline transcript (English, all 5 fixtures at `basics`)

Raw JSON: `responses/response_<tag>.json`. Translations: `translate/responses/`.

### salsa — es
**Accept or decline a dance:** partner: Do you want to dance? / you: I'd love to. /
you (or): I don't know how to dance salsa. / partner: I can teach you. / you: Let's do
it. / you (or): Maybe next time. — vocab: dance, learn, teach, love, next
**Compliment someone's dancing:** you: You're a great dancer. / partner: Thank you so
much. / you: I love your moves. / partner: You're doing great too. / you: Thanks for
the dance. — vocab: dancer, move, great, fun, good
**Chat between songs:** partner: Do you come here often? / you: This is my first
time. / you (or): I come here every week. / partner: How do you like the music? / you:
The band is amazing. / partner: They always play great songs. — vocab: music, band,
song, time, week, play

### surf — es
**Rent a surfboard:** you: Do you rent surfboards? / partner: Yeah, what size do you
need? / you: I need a longboard, please. / you (or): I need a shortboard, please. /
partner: How many days? / you: Just for today. / you (or): For three days, please. —
vocab: rent, surfboard, size, longboard, shortboard, day
**Ask about wave conditions:** you: How are the waves today? / partner: They're pretty
small right now. / partner (or): They're really big right now. / you: When is high
tide? / partner: Around noon. / you: Which beach is best for beginners? / partner:
Check out the north side. — vocab: wave, condition, tide, beach, small, big
**Get local food recommendations:** you: Where's a good place to eat near here? /
partner: Do you want local food or burgers? / you: I want local food. / you (or): I'd
like a burger, please. / partner: Try the soda down the street. / you: What's good
there? / partner: The fish is always fresh. — vocab: eat, food, local, street, fish, fresh

### vegan — ja
**State my dietary restrictions:** you: I'm vegan. / partner: Are you okay with fish
broth? / you: No, I don't eat fish broth. / you (or): I can't eat meat, fish, dairy,
or eggs. / partner: Got it. — vocab: vegan, meat, fish, dairy, egg, broth
**Ask about hidden ingredients:** you: Does this have meat? / partner: Yes, it has
chicken. / partner (or): No, it's vegetable only. / you: Does this contain fish
broth? / partner: Yes, it does. / partner (or): No, it doesn't. / you: What about
honey? — vocab: chicken, vegetable, contain, honey, ingredient
**Order vegan dishes:** you: I'll have the tofu salad, please. / partner: Sure. / you
(or): Could I get the vegetable tempura without egg? / partner: We can't remove the
egg from the batter. / partner (or): Yes, we can do that. / you: I'll take edamame
instead. — vocab: tofu, salad, tempura, batter, remove, instead

### directions — cs
**Ask for a specific place:** you: Where's the train station? / partner: It's near the
main square. / partner (or): It's far from here. / you: Can I take the bus there? /
partner: Yes, take bus twenty-two. / you: Thanks a lot. — vocab: station, square, bus,
near, far, take
**Understand basic directions:** partner: Go straight ahead. / partner (or): Turn left
at the corner. / you: Is it on the right? / partner: Yes, right beside the shop. /
you: Thank you. — vocab: straight, left, right, corner, shop
**Ask to repeat or slow down:** you: Could you speak slower, please? / partner: Sure,
go straight and turn right. / you: Could you repeat that? / partner: Turn right at the
traffic lights. / you: Got it, thanks. — vocab: slow, repeat, light, street

### sick — zh
**Describe my symptoms:** you: My stomach hurts. / partner: Where does it hurt? / you:
Right here. / partner: How long has it hurt? / you: Since yesterday. / you (or): Since
this morning. — vocab: stomach, hurt, yesterday, morning, pain
**Ask about medication:** you: What do you have for stomach ache? / partner: Take
these pills. / you: How many should I take? / partner: Take two pills after meals. /
you: Is it strong? / partner: It's moderate. — vocab: pill, meal, strong, take, dose
**Explain allergies:** you: Are there any side effects? / partner: Do you have any
allergies? / you: I'm allergic to penicillin. / you (or): I don't have any
allergies. / partner: This medicine is safe for you. / you: Thank you. — vocab:
allergic, allergy, safe, effect, medicine
