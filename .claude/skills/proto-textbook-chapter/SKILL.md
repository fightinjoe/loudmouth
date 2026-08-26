---
name: proto-textbook-chapter
description: Create a bespoke, concise language-textbook chapter tailored to one learner and one real situation (e.g. "dinner with my girlfriend's Mandarin-speaking parents"). Trigger when the user wants to learn words/grammar/phrases for a specific upcoming scenario, asks for a custom chapter, phrasebook, or crash-course, or references the existing chapters in tmp/chapters/. Produces a single Markdown file at tmp/chapters/<language>-<title>.md.
note: This is a prototype for Catchphrase v2 to test better phrasebook creation
---

# Custom Textbook Chapter

Build a short, situation-specific chapter for a learner who has little time. The chapter must be
practical enough to use *tonight*: high-frequency phrases, minimal grammar, one worked dialogue.
Favor warmth and correctness over breadth. Concise beats expansive.

## When to use

The user is about to enter a concrete situation in a language they don't speak well (a dinner, a
job interview, meeting a partner's family, a market, a clinic visit) and wants targeted material.
If they instead want a full course or reference grammar, this skill is the wrong tool.

## Step 1 — Interview (fast, only what changes the content)

Ask a small batch of questions at once, then build. Do not ask things the conversation already
answers. Cover:

1. **Language & variety** — target language; regional variety or formality register if it matters
   (e.g. Latin American vs. Castilian Spanish, formal vs. casual).
2. **The situation & relationship** — who they'll talk to and the social dynamic (elders, in-laws,
   strangers, staff). This drives the politeness register.
3. **Top goal(s)** — what they most want to accomplish (be polite, praise food, introduce
   themselves, negotiate, ask directions). Offer an "all, balanced" option.
4. **Script/pronunciation needs** — for languages with a non-Latin script, ask romanization-only
   vs. romanization + native script. Ask whether to include a short pronunciation primer.
5. **Learner specifics that affect wording** — the learner's gender (for gendered languages),
   nationality, and any names/relationships to slot into example lines.

Pick sensible defaults and proceed if the user is in a hurry; state the defaults you chose.

## Step 2 — Adapt the structure to the language

Use the section skeleton below, but **tailor it to how the language actually works** rather than
translating a fixed template:

- Replace the politeness section with the language's real politeness axis (e.g. 您/你 in Mandarin,
  usted/tú in Spanish, keigo in Japanese, T–V distinction generally).
- Put etiquette/culture tips inline as short blockquotes where they're actionable (toasting
  customs, honorifics, how to address the people, declining food/drink gracefully).
- Handle gender agreement explicitly for gendered languages; mark alternate endings (e.g.
  encantado/encantada) or, if learner gender is known, write only their form.
- Keep grammar to ~5 tiny, high-leverage rules that unlock the phrases actually used in the chapter.

## Step 3 — Write the file

Save exactly one Markdown file to `tmp/chapters/<language>-<title>.md`.

- `<language>` = the target language, lowercase (e.g. `mandarin`, `spanish`, `japanese`).
- `<title>` = a short kebab-case slug for the scenario (e.g. `dinner-with-parents`,
  `job-interview`, `farmers-market`).
- Example: `tmp/chapters/mandarin-dinner-with-parents.md`.

### Chapter skeleton

```markdown
# <Language> for <Situation> — A Bespoke Chapter

For: <one-line description of the learner's situation and goal>.
Format: **<romanization> — <native script if used> — English**. Learn the ★ starred lines first.

## How to read it (30 seconds)
<pronunciation primer, only if requested/useful; keep to a few lines>

## The one big politeness rule
<the language's real register/politeness axis, stated as an actionable rule>

## 1. Core survival words
<compact table: greetings, thanks, sorry, yes/no, very, a little, you/I, sir/ma'am>

## 2. Greetings & first impressions
<how to address the people, meet-you phrases, name, thanks-for-having-me>

## 3. <Primary goal section — e.g. Praising the food>
<the learner's power-move phrases + one etiquette blockquote>

## 4. <Secondary goal section — e.g. Toasting & drinks>
<phrases + one etiquette blockquote>

## 5. Talking about yourself & <the relationship>
<nationality, "I'm learning X", "I speak a little", warm relationship lines>

## 6. When you get lost
<"I don't understand", "say it again", "slower please", and: smile + thanks>

## 7. Grammar in 5 tiny rules
<exactly the few rules needed to bend the chapter's phrases>

## 8. Example dinner/scenario conversation
<a short worked dialogue that strings the ★ phrases together, with English glosses>

## 9. Pocket cheat-sheet (memorize these 8)
<the 8 highest-value lines, numbered>

> **If you remember nothing else:** <2–3 warmth-first fallbacks>
```

Adjust section count/titles to the scenario; sections 1, 2, 6, 8, and 9 are the non-negotiable
core. Drop or merge others when the situation doesn't need them.

## Quality bar before declaring done

- Every phrase is in the correct politeness register for the relationship.
- Native script (if requested) and romanization both present and consistent.
- Gendered forms are correct for the learner, or clearly marked as alternates.
- The example dialogue only uses vocabulary/grammar introduced in the chapter.
- The cheat-sheet is genuinely the 8 most useful lines, not the first 8.
- Placeholders (nationality, names) are either filled from the interview or flagged for the user.
- The file is saved at `tmp/chapters/<language>-<title>.md` and nowhere else.

After saving, tell the user the path and offer to fill any remaining placeholders or produce a
one-page print version (cheat-sheet + dialogue only).
