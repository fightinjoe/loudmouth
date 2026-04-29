---
name: todo
description: Work through TODO.md one item at a time. Picks the highest-priority unchecked item, completes it, marks it done, then recommends the next item.
---

# Todo

Work through [`docs/TODO.md`](../../../docs/TODO.md) one task at a time.

## Step 1: Load the TODO list

Read `docs/TODO.md` and identify all top-level sections (e.g. "Inconsistencies", "Design migration", "Improvements") and their unchecked items.

## Step 2: Ask the user which section to focus on

Present the top three **recommended** sections (prefer sections with the most actionable unchecked items, or sections that unblock other work). Format:

```
Which section should we focus on?

Suggested:
  1. <Section name> — <one-line reason>
  2. <Section name> — <one-line reason>
  3. <Section name> — <one-line reason>

(Or say "any" to let me pick across all sections, or name a different section.)
```

Wait for the user's reply before continuing.

## Step 3: Choose the highest-priority item

Within the chosen section (or across all sections if "any"), identify the single **highest-priority unchecked item**:

- Prefer items that unblock other items or affect both platforms (web + iOS).
- Prefer items earlier in the list within a section (they were added first for a reason).
- If the chosen section has no remaining unchecked items, say so and suggest the top item from another section.

Present the chosen item to the user:

```
Next up: <item title>

<One or two sentences describing what needs to be done and why it matters.>

Ready to start? (or suggest a different item)
```

Wait for the user's confirmation before beginning work.

## Step 4: Complete the item

Load any relevant project docs referenced in CLAUDE.md (BRIEF.md, DESIGN.md, API README, CARD_SCHEMA.md) as needed for context. Then implement the task:

- Make the necessary code changes.
- Keep changes focused — do not refactor surrounding code or fix unrelated issues.
- Follow the project's existing conventions.

## Step 5: Present work for review

After completing the work, summarize what was changed:

```
Done! Here's what I changed:

- <file or component>: <one-line description of change>
- <file or component>: <one-line description of change>
...

Does this look right? (say "ok" to accept, describe any changes you'd like, or say "revert" to undo)
```

Wait for the user's reply:

- **"ok" / approval** — proceed to Step 6.
- **Change request** — apply the requested changes, re-summarize the diff, and ask again. Repeat until approved.
- **"revert"** — undo the changes (restore files to their previous state) and return to Step 3 to choose a different item or re-attempt this one.

## Step 6: Mark the item as done

Once the user approves the work, edit `docs/TODO.md` and change the item's `- [ ]` to `- [x]`.

## Step 7: Recommend the next item

Read the updated `docs/TODO.md`. Within the active section (or across all if "any"), find the next highest-priority unchecked item and present it:

```
✓ <completed item title> marked done.

Next suggested item:
  <item title> — <one-line description>

Start this one? (or switch sections, or stop here)
```

Wait for the user's reply. If they confirm, return to Step 4 with the new item. If they want to switch sections, return to Step 2.
