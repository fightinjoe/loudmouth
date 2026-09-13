# /phrasebook — generation, v09

- **Model:** `gemini-3.5-flash-lite`, `responseMimeType: application/json`
- **Date:** 2026-09-12

## Changes from v08

One clause: vocab dictionary form now "singular nouns, base verbs" (was verbs only) —
fixes English-side plural lemmas ("waves", "pills").

## Design backlog (user, captured)

Vocab cards will likely want an example phrase/sentence (`notes` field). Split of labor
when built: for words drawn from a conversation the API attaches the source line free
(`notes.source`, the /textbook convention); only expansion words (no source line) need
the prompt to supply an example. Deferred to card-assembly time.

## Runs (all 5 fixtures at `basics`)

| tag | lang | latency | in | out | lines | vocab/conv |
|---|---|---|---|---|---|---|
| salsa | es | 1.76s* | 1235 | 512 | 6/5/6 | 5/5/6 |
| surf | es | ~2.2s | — | — | 7/7/6 | 6/6/6 |
| vegan | ja | ~1.8s | — | — | 5/7/6 | 6/5/6 |
| directions | cs | ~1.8s | — | — | 6/5/5 | 6/5/4 |
| sick | zh | ~1.7s | — | — | 6/6/6 | 5/5/5 |

(*full metrics in `responses/`; run overlapped a free-tier 429 event — see translate
v02 NOTES.)

## Scorecard

- ✅ English-side lemmas singular ("song", "wave", "pill").
- ✅ Nested vocab schema stable across all 5 seeds; totals 15–18 pre-dedup.
- Nit: sick "Explain allergies" conversation gained an off-topic opener about side
  effects; vocab has near-dupes "allergic"+"allergy" in one conversation.

## Verdict

**ACCEPTED** (2026-09-12) as the Step C generation baseline, paired with translate/v05.
Full English outputs: `responses/response_<tag>.json`; the same lines appear inline in
`translate/v03/NOTES.md` scorecard context and the translate responses.

## Service-owed work recorded at acceptance

1. Ruby normalization: drop any `[…]` not immediately preceded by a kanji/hanzi run
   (closes zh punctuation junk + ja kana-run junk deterministically).
2. Per-chunk count validation (lines & vocab) + one retry on mismatch or inner-JSON
   parse failure (both observed and recovered during hand-testing); 502 only after.
3. 429 retry with backoff (free-tier evidence; paid tier still needs it).
4. Vocab pooling + dedup by English word (keep first), service-side caps.
5. ja romanization: mechanical kana→rōmaji from inline readings at card assembly.
6. Card assembly per CARD_SCHEMA.md; `notes.source` example lines for drawn vocab
   (prompt supplies examples only for expansion words — future).
7. `/context` revision track: accept `ability`, offer preset phrase packs
   ("Making sure you understand" etc.), server-static pack content.

## Baseline transcript (English, all 5 fixtures at `basics`)

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
