# /phrasebook — Step B (phrases + vocab), v07

- **Model:** `gemini-3.5-flash-lite`, `responseMimeType: application/json`, no other config
- **Date:** 2026-09-12
- **Step:** B — pooled vocabulary, iteration 2.

## Changes from v06

One clause in VOCAB: "English words only — translation happens later." (v06 leaked
Spanish "mover" into salsa vocab.)

## Step C design note (user, recorded for later)

Watch for English-first artifacts at translation time: an isolated vocab word like
"break" (salsa) is ambiguous in English. Mitigation to try first: translate vocab
anchored to its source conversation (context is in the same response), not in
isolation. If disambiguation still fails, test the user's alternative hypothesis —
construct conversations in the target language first, then translate to English
(premise: English is homonym-heavier than the target languages).

## Runs (all 5 fixtures at `basics`)

| tag | lang | latency | in | out | lines | vocab |
|---|---|---|---|---|---|---|
| salsa | es | 1.56s | 1215 | 472 | 5/5/6 | 12 |
| surf | es | 2.23s | 1214 | 653 | 8/7/7 | 14 |
| vegan | ja | 1.82s | 1225 | 553 | 5/6/6 | 14 |
| directions | cs | 2.05s | 1214 | 558 | 6/6/6 | 13 |
| sick | zh | 1.81s | 1221 | 567 | 7/7/6 | 12 |

## Scorecard vs. v07 targets

- ✅ Language leak: zero non-English words across all 65 vocab items. Guard worked
  first try.
- ✅ Vocab quality up, not just clean: salsa gained "lead, follow, step, rhythm" —
  domain-perfect expansions v06 didn't find. vegan gained "kelp" (safety-relevant,
  drawn from its own conversation).
- ✅ Conversations held quality: vegan topic 3's kelp/bonito exchange follows the
  confirm-ingredients-before-claiming-safe pattern; directions gained transit content
  (line number, transfer).

## Nits (fold into next real revision)

- Noun lemmas: "waves", "pills" plural (dictionary-form rule only names verbs).
- sick topic 3 opener "Am I allergic to this?" — learner asks the pharmacist something
  only the learner can know; "Does this contain penicillin?" is the coherent version.

## Verdict

**ACCEPTED** (2026-09-12) as the Step B baseline. Carried nits: plural noun lemmas
("waves", "pills"); sick topic 3 opener coherence ("Am I allergic to this?").

## Baseline transcript (all 5 fixtures at `basics`)

### salsa — es (1.56s)

**Accept or decline a dance:** partner: Wanna dance? / you: I'd love to. / you (or):
Maybe later. / partner: Awesome. / partner (or): No worries.
**Compliment someone's dancing:** you: You're a great dancer. / partner: Thanks so
much. / you: I'm still learning. / partner: You're doing fine. / partner (or): Keep it up.
**Chat between songs:** partner: Come here often? / you: Not really. / you (or): Every
weekend. / partner: I'm loving this music. / you: Me too. / partner: See you around.
**vocab (12):** dance, music, beginner, great, awesome, weekend, lead, follow, step,
rhythm, fun, good

### surf — es (2.23s)

**Rent a surfboard:** you: I need to rent a surfboard. / partner: What size do you
want? / you: I'd like a mid-length board, please. / you (or): I'll take a longboard,
please. / partner: How many days? / you: Just for today. / you (or): For three days,
please. / partner: That's twenty dollars.
**Ask about wave conditions:** you: How are the waves today? / partner: They're pretty
big right now. / partner (or): They're small and clean. / you: Where's the best spot
for intermediates? / partner: Try the point break down the beach. / partner (or): Stay
near the river mouth. / you: Thanks for the tip.
**Get local food recommendations:** you: Where's a good place to eat nearby? /
partner: Try the soda on the main road. / you: What's the best dish here? / partner:
Get the fish casado. / partner (or): The chicken rice is really good. / you: Is it
close by? / partner: It's a five-minute walk.
**vocab (14):** board, size, day, waves, spot, beach, food, road, fish, rent, want,
big, small, close

### vegan — ja (1.82s)

**State my dietary restrictions:** you: I'm vegan. / partner: Are you okay with fish
broth? / you: No, I don't eat fish or meat. / you (or): No animal products at all,
please. / partner: Got it.
**Ask about hidden ingredients:** you: Does this have dairy in it? / partner: Yes, it
contains butter. / partner (or): No, it's completely plant-based. / you: What about
egg or honey? / partner: There's no egg, but it has honey. / partner (or): Neither of
those are in it.
**Order vegan dishes:** you: I'll take the vegetable ramen, please. / partner: The
broth is made with kelp. / you: That's great. / you (or): Could you make it without
bonito flakes? / partner: Sure. Anything else? / you: That's everything, thank you.
**vocab (14):** vegan, meat, fish, dairy, egg, honey, butter, broth, vegetable,
plant-based, ingredient, contain, without, kelp

### directions — cs (2.05s)

**Ask for a specific place:** you: Where's the train station, please? / partner: It's
far from here. / partner (or): It's just around the corner. / you: Can I take the
tram? / partner: Yes, line nine goes there. / partner (or): No, you need the metro.
**Understand basic directions:** partner: Go straight ahead. / partner: Turn left at
the traffic light. / partner (or): Turn right at the corner. / you: Is it on the right
side? / partner: Yes, you can't miss it. / partner (or): No, it's on the left.
**Ask to repeat or slow down:** partner: Take the second stop and transfer. / you:
Could you speak slower, please? / partner: Sure. Take the second stop. / you: Could
you repeat that, please? / partner: Transfer to bus five. / you: Thanks a lot.
**vocab (13):** station, tram, metro, stop, transfer, straight, left, right, corner,
slow, repeat, far, near

### sick — zh (1.81s)

**Describe my symptoms:** you: My stomach hurts. / partner: What's wrong? / you: I
have nausea. / you (or): I have diarrhea. / partner: How long has it hurt? / you:
Since this morning. / you (or): Since yesterday.
**Ask about medication:** you: What do you suggest for stomachache? / partner: Do you
want capsules or liquid? / you: Capsules, please. / you (or): Liquid, please. /
partner: Take two pills after meals. / you: How many times a day? / partner: Three
times a day.
**Explain allergies:** you: Am I allergic to this? / partner: Do you have any
allergies? / you: I'm allergic to penicillin. / you (or): I don't have any
allergies. / partner: This is safe for you. / you: Thank you.
**vocab (12):** stomach, nausea, diarrhea, morning, capsule, liquid, pills, meals,
allergic, penicillin, safe, suggest
