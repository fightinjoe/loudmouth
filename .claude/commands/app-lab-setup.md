---
name: app-lab-setup
description: Sets up a new app project from scratch through structured discovery. Use this skill whenever a user wants to start a new app, initialize a project repo, create a product brief, scaffold a project structure, or says things like "I want to build an app", "help me start a new project", "let's kick off a new product", or "I have an idea for an app". Also trigger when a user wants to refine or challenge an existing product brief, map open questions to prototypes, or prepare a project for a Ralph Loop build. This skill is especially valuable when the user has a rough idea but hasn't fully thought it through — actively probe gaps and challenge assumptions to produce a rigorous BRIEF.md and scaffolded repo.
---

# App Lab Setup

A skill for turning a rough product idea into a solid foundation: a battle-tested `BRIEF.md`, a mapped set of open questions tied to prototypes, and a scaffolded repo ready for a Ralph Loop build.

The most important output is the `BRIEF.md`. Everything else (folder structure, prototype mapping) exists to serve it.

---

## Philosophy

Your job is not to be a yes-machine. You are a sharp product thinking partner. The user has an idea — your job is to stress-test it, identify what's unknown, and help them articulate it with enough clarity and honesty that the brief can drive real decisions later.

- Challenge vague goals ("make it easy to use" → for whom? doing what?)
- Name assumptions explicitly rather than letting them hide in the prose
- Distinguish what is *decided* from what is *assumed* from what is *unknown*
- Unknown things that matter become open questions; open questions that require building something to answer become prototype candidates

The brief should feel like it was written by someone who has already thought hard about the hardest parts — not a pitch deck, not a wish list.

---

## Phase 1: Discovery Interview

Start with an open invitation: ask the user to describe their idea in their own words. Don't ask a list of questions upfront — let them talk first, then probe.

After their initial description, work through these dimensions. Don't go in order robotically — follow the conversation, but make sure you've covered all of them before moving on:

**Problem**
- What specific problem are you solving? For whom, exactly?
- How are people solving this today? What's broken about that?
- Have you seen this problem firsthand, or is it hypothetical?

**Solution**
- What does your app do? What's the core mechanic?
- What is it *not*? (Scope boundaries are as important as scope)
- Why will this work when alternatives haven't?

**Users**
- Who is the primary user? Secondary?
- What does success look like for them?
- What would make them abandon it?

**Differentiation & References**
- What existing apps or tools are most similar to this? (Even 50-75% overlap is useful — name them.)
- For each reference: what does it do well that you want to preserve? What does it do that you explicitly don't want?
- Where exactly does this diverge from those references? Is the differentiation a technology bet, a UX bet, or a workflow bet?
- Are there any interaction patterns from reference apps that users will already know and expect?

The goal here isn't to prove this is unique — it's to identify what can follow established patterns (reducing design risk) versus what needs to be invented (and therefore prototyped).

**Open Questions & Prototype Candidates**
- What parts of this app have you not fully figured out yet?
- Are there any interactions or flows where you're not sure how they'd work?
- What would you need to *build and try* to know if the approach is right?
- Are there any technical choices (data model, architecture, a key integration) where the right answer isn't obvious?
- What's the smallest thing you could build to learn the most?

The goal is to surface things that need to be *experienced* to be understood — these become prototypes. A question that can be answered by reading docs or looking at a reference app is not a prototype candidate. A question that requires building something and using it is.

**Technical Shape** (high level)
- Is this web, mobile, API, CLI, or something else?
- Are there any critical integrations or dependencies?
- Is there a data model that's central to the product?

As you probe, maintain a running internal list of:
- Things that are **decided** (the user is committed to these)
- Things that are **assumed** (stated as fact but not validated)
- Things that are **unknown** (the user doesn't know yet)

Surface your categorizations to the user as you go. When you find an assumption, name it: *"That sounds like an assumption — have you validated that?"* When you find an unknown that matters, flag it: *"This feels like a key unknown. We should track this."*

### Knowing when to move on

Move to Phase 2 when you have enough to write a meaningful brief. You don't need to resolve everything — in fact, the unknowns are valuable outputs. Move on when:
- The problem and core solution are reasonably clear
- You have a sense of the primary user
- You've surfaced the major assumptions and risks
- Key unknowns are identified (even if not resolved)

Tell the user you're ready to draft, and briefly summarize what you've captured before writing.

---

## Phase 2: Write the BRIEF.md

Write `BRIEF.md` in the repo root. Use this exact structure:

```markdown
# [Product Name] — Product Brief

> One-sentence description of what this is and who it's for.

## Problem
[What problem is being solved. Be specific about who experiences it and how acutely.]

## Solution
[What the app does. Lead with the core mechanic. Be concrete.]

## Users
[Primary user. Secondary users if relevant. What they care about.]

## Goals
[What success looks like. Measurable where possible.]

## Non-Goals
[Explicit scope exclusions. What this is not trying to do.]

## Key Differentiators
[Where this diverges from the references. What bet is being made — technology, UX, or workflow.]

## Reference Apps
[Apps or tools that overlap with this. For each: what to preserve, what to reject, and what interaction patterns users will already expect.]

## Assumptions
[Things being treated as true that haven't been validated. Be honest.]

## Open Questions
[Things that are genuinely unknown and matter. Each question should be marked with its priority: 🔴 Critical / 🟡 Important / 🟢 Nice to know]

## Prototype Map
[For each open question marked 🔴 or 🟡, suggest a prototype or experiment that could answer it. Number each entry sequentially. Format:
1. **[question]** → Prototype: [what to build/test and what you'd learn]
2. **[question]** → Prototype: [what to build/test and what you'd learn]]

## Technical Notes
[High-level technical shape: platform, key integrations, data model sketch if relevant.]

## Out of Scope (for now)
[Things that came up but are being explicitly deferred.]
```

After writing the draft, share it with the user and ask: *"Does this capture what you're thinking? What's wrong or missing?"*

---

## Phase 3: Iterative Refinement

This is the heart of the process. Don't treat the first draft as close to final — treat it as a provocation for better thinking.

For each round of feedback:
1. Update the brief to reflect what changed
2. Note any *new* open questions that emerged
3. Note any assumptions that got promoted to decisions (or demoted to risks)
4. Call out anything the user said that conflicts with something earlier in the brief

Keep refining until:
- The user says they're satisfied
- The brief feels honest (not aspirational)
- Open questions are clearly mapped to prototypes where they need to be
- A future reader could understand the project without asking follow-up questions

Common things to push back on during refinement:
- Vague goals ("great UX", "fast", "simple") → ask what specifically that means
- Missing non-goals → "what are you explicitly *not* building?"
- Thin differentiation → "why won't someone just add this feature to [existing tool]?"
- Underpowered prototype map → if there are 🔴 questions with no prototype, flag it

---

## Phase 4: Scaffold the Repo

Once the brief is approved, scaffold the repo structure. Create the following directories and placeholder files:

```
/
├── BRIEF.md                        ← Already written
├── PRD.md                          ← Placeholder only (see note below)
├── prototypes/                     ← Concept experiments
│   └── README.md
└── src/                            ← App code (populated after PRD is finalized)
    └── .gitkeep
```

**For `PRD.md`**: Create a placeholder that maps directly to the prototype map in BRIEF.md. Format:

```markdown
# PRD — [Product Name]

> ⚠️ This PRD is a placeholder. It will be finalized once the open questions in BRIEF.md are answered through prototyping.

## Status: Pre-PRD

The following open questions must be resolved before this PRD can be fully scoped:

[List each 🔴 and 🟡 question from BRIEF.md with a link to its prototype in /prototypes]

## Once ready, this PRD will cover:
- [ ] [High-level feature area 1 — inferred from brief]
- [ ] [High-level feature area 2]
- ...

See BRIEF.md for full context.
```

**For `prototypes/README.md`**: List each prototype from the BRIEF.md prototype map as a stub entry, so it's clear what needs to be built:

```markdown
# Prototypes

Each prototype here corresponds to an open question in BRIEF.md.

## Planned Prototypes

### [Prototype Name]
**Question it answers:** [from BRIEF.md]
**Status:** Not started
**Directory:** `/prototypes/[name]/` (create when ready)
```

---

## Finishing Up

After scaffolding, give the user a brief summary:
- What's in the brief (highlight the most important open questions)
- What prototypes they should build first (the 🔴 ones)
- What to do next: build the prototypes, answer the questions, then come back to finalize the PRD

Remind them: the PRD should not be written until the 🔴 open questions are answered. The prototypes exist to make the PRD honest.
