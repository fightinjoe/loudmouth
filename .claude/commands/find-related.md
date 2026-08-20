---
name: find-related
description: >
  Prototype for the /find-related API — given a deck's context plus a word, phrase, or
  a previously-returned group, returns clustered related content biased by that context.
  This is the "choose your own adventure" mechanic: clicking into a group re-runs
  find-related seeded by that group, producing a narrower, more specific next set of
  groups. English-only for now (translation is a separate, already-solved concern) —
  this prototype exists to hand-test whether deck context actually narrows branching
  to something useful, instead of clustering by an unbounded, ungrounded audience guess.
---

# Find Related (prototype)

Prototype for the `/find-related` endpoint described in the v2 graph-of-relations
design (see `~/.gstack/projects/fightinjoe-loudmouth/awheeler-v2-design-*.md` if
present).

**What this actually tests:** not "is this one cluster set good," but "does deck
context, plus clicking into a group, get the learner somewhere narrower and more
useful than where they started." The real product experience is choose-your-own-
adventure: the learner starts broad (a single word or topic) *within a deck that
already carries context about their trip/situation*, and communicates what they
want more of by clicking into groups that interest them — each click re-seeds the
next round of groups. This command simulates that click-through by hand, one round
at a time, so you can judge whether context-grounded branching holds up.

**Why deck context, not a per-group persona guess:** an earlier version of this
prototype tried to solve audience-fit by labeling each *group* with a guessed
assumed-user and difficulty (e.g. "for: first-time visitor, no language ability").
That failed — real trips don't reduce to one persona. A single traveler can be
simultaneously zero-language-ability AND deeply embedded with a host family, which
means half their interactions are formal/transactional (hotel staff, waiters) and
half are casual/playful with people who already know them ("I'm getting fat!").
No single per-group persona label can represent that; the context needs to live at
the **deck** level, set once, and bias every round of clustering — not be re-guessed
from scratch on every call.

**Who this is for:** the learner is not studying toward a proficiency test or a
curriculum level. They're learning a second language for a more immersive cultural
experience — to communicate, build real relationships, and share experiences with
people in the target culture. Every piece of content this command produces should
be judged against that bar: would a person actually say this to someone they're
trying to connect with? Reject anything that's technically correct but stiff,
formal, or exam-flavored.

## Scope (this prototype only)

- **English only, no translation.** Both input and output stay in English. Translation
  is a separate, already-solved problem (`/translation-api`) — mixing it in here would
  make it impossible to tell whether a bad result is a clustering problem or a
  translation problem. Skip target-language output entirely for now.
- **Word/phrase separation is enforced, not optional.** Every round of results must
  produce groups cleanly typed as either **terms** (single words) or **phrases**
  (multi-word expressions) — never mixed within one group. If a round's content
  doesn't naturally split into both, still produce at least one of each rather than
  silently dropping the missing type.
- **No JSON schema commitment.** This is a hand-testing tool, not the real endpoint
  contract.

## Input

### Deck context (gather once per session, reuse across rounds)

Deck context has four fields: familiarity, formality, language ability, free text.
Familiarity and formality are independent axes, not a single "relationship type" —
e.g. a work colleague can be high-formality but grow high-familiarity over time; a
stranger you're bantering with is low-familiarity but can still be low-formality.

If the user hasn't set deck context yet this session, use the **AskUserQuestion
tool** (not plain markdown text) for whichever fields are still missing — one field
at a time, in order, waiting for each answer before asking the next. AskUserQuestion
renders as an interactive picker (arrow-key/native selection), and it always offers
a free-form "Other" alongside listed choices, so the user can pick an option OR
describe it their own way without that needing to be a listed option itself. Skip any
field the user already gave upfront (e.g. if they open with "deck is for a trip with
no language ability," don't re-ask language ability, just ask the remaining three,
in order, via the same tool).

Use these four AskUserQuestion calls (options as shown; adapt header/labels to fit
the tool's format, keep the option count and meaning as specified):

**1. Familiarity** — "Who will you mostly be talking to?" (mention a deck can span
more than one, and mixed is fine as free-form input)
- Strangers — small talk with people I don't know
- Service providers — waiters, hotel staff, shopkeepers
- Acquaintances — people I know a little
- Close family or friends

**2. Formality** — "How formal do these interactions feel?"
- Casual — relaxed, playful, no need to be polite
- Neutral — polite but not stiff
- Formal — need to mind your manners

**3. Language ability** — "How much of the language do you already know?" (note this
is independent of familiarity/formality — zero language ability can still mean
high-familiarity, low-formality relationships, e.g. traveling with a host family who
speaks for them)
- None — I can't speak or understand it yet
- Basic — a few words and fixed phrases
- Conversational — I can follow along and improvise

**4. Free text** — always ask this one as an open question via AskUserQuestion with
no listed options (or a single "Nothing to add" option plus free-form), since it
exists specifically to catch what the three scales above can't: "Anything else about
the situation? (the trip, the people involved, an upcoming event, a tone you want, or
how the deck splits across different situations — e.g. 'traveling with an 11-person
Chinese family, half service interactions, half playful family time.')"

If AskUserQuestion is unavailable in the current environment, fall back to the plain
lettered-list format (A/B/C/D in markdown) so the flow still works, just without
arrow-key selection.

Once all four are set (answered or explicitly skipped), reuse them for every round
this session unless the user changes them.

### Round input

Either:

1. **A fresh seed** — a topic, word, or phrase in English (e.g. "dinner", "surf",
   "asking for directions"), OR
2. **A group to drill into** — the exact group label (and its parent seed/chain) from
   a previous round's output, simulating the learner clicking that group. Re-run
   find-related using that group's own content (its label + its items) as the new
   seed, one level narrower.

If the user just names a group from the last output ("click into 'ordering at a
restaurant'", or just the group label), treat that as case 2 automatically.

## Step 1: Determine groups for this round

For the current seed (fresh input, or a drilled-into group), generate 3-5 groups,
biased by the deck's context (familiarity, formality, language ability, free text).
Each group is EITHER a terms group OR a phrases group (never both).

- **Context sets the center of gravity, not a hard filter.** If the deck's free text
  says "mix of service interactions and close family time," the round's groups should
  span that mix (some low-familiarity/high-formality groups, some high-familiarity/
  low-formality groups) rather than averaging into one bland middle register.
- **Language ability shapes complexity, not just topic.** A "none" language-ability
  deck should get groups usable via short fixed phrases and gesture-friendly content;
  a "conversational" deck can get groups that assume the learner can follow up and
  improvise.
- **Don't invent audience variation the deck context didn't ask for.** Earlier
  versions of this prototype tried to guess a spread of personas per group; now that
  spread comes from the deck's own context (including its free text describing a
  mix), not from re-deriving it inside find-related each round.

**Group naming:** short, human-scannable label for the content itself (e.g. "ordering
at a restaurant," "asking about the menu," "inviting someone over," "cooking together,"
"teasing your host family"). The deck context is background, not baked into the label.

## Step 2: Populate each group

4-6 items per group, honoring the type split from Step 1 (terms group = single words
only; phrases group = multi-word expressions only).

Content rules:

- **Favor common, conversational, everyday content — not proficiency-test vocabulary.**
  Every item should be something a person would actually say out loud to another
  person. Reject anything technically correct but stiff, textbook-formal, or
  exam-flavored. When in doubt, prefer the phrase you'd use with someone you're trying
  to befriend over the "complete" or "precise" version.
- **Match the deck's context**, not a per-group guess: language ability caps
  complexity, familiarity/formality shape register and tone (playful vs. polite).
- **No cross-group near-duplicates** within the same round.
- English only — plain text, no target-language fields yet.

## Step 3: Output

Display deck context once at the top of the session (or when it changes), then each
round as a numbered, scannable list per group:

```
Deck context: familiarity=mixed (free text below) | formality=mixed | language ability=none
Free text: "Traveling with my Chinese wife's family (11 people) — half service
interactions (hotels, restaurants), half close family time, playful tone welcome."

Seed: "dinner"

[1] TERMS — "menu basics" (service / formal register)
  1. menu
  2. bill / check
  3. waiter / server
  4. reservation

[2] PHRASES — "ordering at a restaurant" (service / formal register)
  1. Can I have a table for two?
  2. What do you recommend?
  3. I'd like this one, please.
  4. Can I get the check?

[3] TERMS — "family dinner banter" (close family / casual register)
  1. full
  2. seconds
  3. delicious

[4] PHRASES — "playful family dinner talk" (close family / casual register)
  1. I'm getting fat!
  2. This is so good, I can't stop eating.
  3. Save me some for later!
  4. You're going to make me fat with this cooking.
```

Number groups so the next round can reference them by number OR by clicking/naming
the label directly. Note each group's register in parentheses (drawn from the deck's
familiarity/formality axes) so it's clear WHY a group looks the way it does, without
re-introducing a per-group persona system.

## Step 4: Drill down (the core mechanic)

After displaying a round, ask:

**"Click into a group to go deeper, try a new seed, or say what felt off."**

- If the user names/numbers a group → treat its label + items as the new seed, go
  back to Step 1, and produce the NEXT round — this should feel meaningfully narrower
  and more specific than the round you're drilling from, not just a re-shuffling of
  similar content. Deck context still applies at every depth.
- If the user gives a fresh seed → start a new round from scratch, same deck context.
- If the user wants to change deck context → update it and note that all subsequent
  rounds use the new context.
- If the user gives feedback → use it as a running quality note (per the design doc's
  Assignment: testing across multiple seeds and multiple drill-down levels, not
  iterating one round to perfection). Note whether the feedback is about: content
  quality (wrong register, too advanced/basic for the stated context), coverage
  (deck context's stated mix isn't actually showing up in the groups), or branch
  quality (drilling in didn't actually narrow anything).

There is no approval loop and no final "done" state — this is an exploratory
back-and-forth, matching the actual product mechanic it's prototyping.
