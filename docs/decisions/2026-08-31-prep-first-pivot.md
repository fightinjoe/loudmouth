---
kind: record
status: current
summary: Why Catchphrase moved from term look-up to prep-first, conversation-centred phrasebooks.
verified: 2026-11-12
---

# Prep-first pivot and its successors

## Context (2026-08-31)

The `/lookup` prototype took one term and returned branching groups of related phrases that the learner curated into a phrasebook. It disappointed for three reasons: too many settings before any result (audience, level, "vibe"); branching contexts that were not useful for conversation; and a dictionary feel far from the goal of being able to communicate. A prompt-only prototype that took a situation, asked a few dynamic questions and wrote a whole textbook chapter (words, phrases, grammar notes and one worked conversation) produced clearly better material.

## Decisions

- **Prep is the primary job.** "I have dinner with my partner's Mandarin-speaking parents on Friday; build me the chapter." In-the-moment capture is a possible separate mode later.
- **The app does the bookkeeping.** The learner never files, reorders or regroups content.
- **Opinionated and bounded.** Generate a good chapter and stop: no endless reroll, no fully editable canvas.
- **Conversation first (2026-09-03).** The generated dialogue produced the best content but was buried as the last group. Real situations branch, so the phrasebook became several short conversations, one per checked scene, with vocabulary and starred cards alongside.

## What happened next

- 2026-09-14: `/lookup` and `/textbook` were removed and the flow became `/context` → `/phrasebook`.
- 2026-10-29: the four-section v4 phrasebook (Things to say, Likely exchanges, Words, Example conversation) replaced the conversation tabs. The principles above carried over and now live in [the brief](../brief.md).

The original design documents were deleted on 2026-11-12; they remain in git history before that date.
