---
name: prototype-setup
description: Creates a brief and scaffolds a directory for a specific prototype listed in the project's BRIEF.md, and closes out completed prototypes by feeding findings back into BRIEF.md. Use when a user wants to start work on a prototype, says "let's work on prototype N", "set up the [name] prototype", or "I want to build the [question] experiment". Also trigger when a prototype is done and the user wants to record what they learned or update the main brief.
---

# Prototype Setup

A skill for turning a numbered prototype entry in `BRIEF.md` into a focused experiment brief and scaffolded directory — ready to build.

---

## Philosophy

A prototype exists to answer one specific question. Everything in the build should serve that question. Scope should be the absolute minimum needed to generate a real answer — not a polished feature, not a demo, not a proof-of-concept that also does three other things.

The prototype brief is not a mini-PRD. It's a hypothesis and a build plan. The question is already known; the job here is to define what "answered" looks like and what's worth building to get there.

---

## Step 1: Identify the Prototype

Read `BRIEF.md` and locate the Prototype Map. Ask the user which prototype they want to set up if it isn't already clear from context. Confirm:

- The prototype number and question
- That the question is still relevant (briefly check if anything in the brief has changed that would affect this)

---

## Step 2: Short Discovery

Before writing anything, ask a few focused questions:

**Hypothesis**
- What do you *expect* to find? (Even a rough guess — "I think it'll work" counts.)
- Is there a specific failure mode you're most worried about?

**Scope**
- What's the minimum you'd need to build to actually answer the question?
- Are there any constraints on how you want to build this? (e.g., no frameworks, specific device, real content vs. placeholder)

**Done condition**
- What does a useful result look like? What would "yes, this works" look like vs. "no, this doesn't"?
- Is there a case where the result is ambiguous — and what would you do then?

Keep this short. If the user already has clear answers, move straight to writing.

---

## Step 3: Write the Prototype BRIEF.md

Create `prototypes/{N}-{slug}/BRIEF.md`. Use the prototype number from the parent `BRIEF.md` and a short lowercase hyphenated slug derived from the question.

Use this exact structure:

```markdown
# Prototype {N}: {Name}

**Question:** {exact question text from BRIEF.md Prototype Map}

## Hypothesis

{What we expect to find. One to three sentences. It's fine if this is tentative.}

## Build Plan

What to build — the minimum needed to answer the question. Keep scope tight.

- [ ] {task}
- [ ] {task}
- [ ] {task}

## Test Protocol

How to actually run this experiment. Be specific: what device, what conditions, what actions to take.

{e.g., "Load index.html on iPhone 15 (iOS Safari). Tap the play button for each of the 5 test strings. Note whether audio plays, whether pronunciation is intelligible, and whether there are any API errors."}

## Success Criteria

What a clear answer looks like.

**Yes (proceed with confidence):** {what this looks like}
**No (needs rethinking):** {what this looks like}
**Ambiguous:** {what would be ambiguous, and what to do}

## Status

Not started
```

After writing, share with the user and ask: *"Does this capture what you're trying to learn? Anything missing from the build plan?"*

---

## Step 4: Scaffold the Directory

Create the prototype directory and a minimal starter file:

```
prototypes/
└── {N}-{slug}/
    ├── BRIEF.md        ← just written
    └── index.html      ← empty scaffold (see below)
```

For `index.html`, create a minimal scaffold — just enough to start:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prototype {N}: {Name}</title>
</head>
<body>
  <!-- Prototype {N}: {Name} -->
  <!-- Question: {question} -->
</body>
</html>
```

If the prototype is clearly not HTML-based (e.g., a data schema test, a CLI script), substitute an appropriate starter file and note it.

---

## Finishing Up (Setup)

Give the user a brief summary:

- The question this prototype answers and the hypothesis
- The build plan at a glance
- What "done" looks like (the success criteria)
- The directory path to start working in

Remind them: the goal is the smallest build that generates a real answer. If scope starts creeping, check it against the question.

---

## Step 5: Closeout — Recording Findings

When a prototype is done, use this step to capture the result and update the main brief. Trigger this when the user says the prototype is complete, or asks to "close out", "record findings", or "update the brief".

### 5a: Debrief

Ask the user what they found:

- What was the result? (yes / no / ambiguous — relative to the success criteria)
- What exactly did you observe? (Be specific — "it worked" is not enough. What worked, on what device, with what caveats?)
- Did anything surprise you?
- Does the result change anything about the product approach?

### 5b: Update the prototype BRIEF.md

Append a `## Findings` section to `prototypes/{N}-{slug}/BRIEF.md` and update the `Status` field:

```markdown
## Findings

**Result:** {Yes / No / Ambiguous}
**Date:** {date}

{What was observed. Be specific. Note device/platform if relevant.}

**Surprises:** {anything unexpected, or "None"}

## Status

Complete
```

### 5c: Update the main BRIEF.md

This is the most important part. The prototype existed to reduce uncertainty in the main brief — the findings must be reflected there.

Read the current `BRIEF.md` and make the following updates as appropriate:

**Open Questions:** If the prototype answered its question conclusively, remove the question or mark it resolved with a brief note inline (e.g., append `— ✅ Resolved: Web Speech API is sufficient on iOS/Android.` or `— ❌ Resolved: not viable, needs rethinking.`). If the result was ambiguous, update the question text to reflect what's now known and what remains open.

**Assumptions:** If the finding validates or invalidates an existing assumption, update it. If the finding surfaces a new assumption, add it.

**Prototype Map:** Update the prototype entry to reflect its status. Append the outcome inline:
`1. **Is Web Speech API adequate on mobile?** → ✅ Answered — see prototypes/1-web-speech/`

**Technical Notes / Solution / Non-Goals:** If the finding changes a technical approach, rules something in or out, or reframes scope, update the relevant section. Don't leave the brief contradicting what was learned.

After making changes, show the user a summary of what was updated in `BRIEF.md` and ask: *"Does this capture the impact correctly? Anything else that should change?"*

### 5d: Check remaining prototypes

After closeout, note how many 🔴 and 🟡 questions remain unanswered. If all 🔴 questions are resolved, remind the user that the PRD is now unblocked.
