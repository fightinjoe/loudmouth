---
kind: skill
status: current
summary: Log planned work in docs/todo: add todos with records, move them between ledgers, create milestones, using scripts/todo.mjs.
sources: [scripts/todo.mjs]
verified: 2026-11-12
---

# Log a todo

Use when the user asks to log, track or capture planned work, to move a todo to another milestone or the backlog, or to create a milestone. Marking todos done and retiring milestones are not part of this skill; [`/commit_worktree`](commit_worktree.md) and [`/finalize_worktree`](finalize_worktree.md) own that ([todo lifecycle](../wiki.md#todo-lifecycle)).

Supporting script: `scripts/todo.mjs` (`add`, `move`, `milestone`). It writes the record header and body, inserts or moves ledger rows newest-first, rewrites every wiki link to a moved record, and finishes with `node scripts/check-docs.mjs --fix`. Its header comment lists every option. Text options are single lines; descriptions cannot contain `|`.

## 1. Load

Read [`docs/todo/index.md`](../todo/index.md), then every milestone page and the [backlog](../todo/backlog.md). Read the [wiki conventions](../wiki.md#ledgers) once if you have not this session.

## 2. Deduplicate

For each requested item, search the existing records (`docs/todo/**/*.md`) for overlapping work. If a record already covers it, extend that record (and `move` it if it belongs elsewhere) instead of adding a second one: one owner per fact. Tell the user which items you merged.

## 3. Place

- **Existing milestone** when the item is part of that milestone's stated scope or a gate for it.
- **New milestone** (`milestone`) when several items share a goal and depend on each other. Write an intro saying what the milestone covers and which page owns related state.
- **Backlog** otherwise. Do not ask the user where an item goes unless two placements would change what ships; state the choice in the report.

## 4. Gather evidence

A record must make sense months later without this conversation. Before writing:

- **Why:** who asked and when (for example "owner request, 2026-11-12"), plus the current facts that make the work necessary, cited as code paths in backticks or links to the owning wiki page. Verify each fact by reading the code or page; do not copy values that code owns. If no reason was given, write that it was not recorded, then the current facts.
- **What:** the change in one or two sentences, concrete enough to act on. Link designs (Figma, `explorations/`) the user supplies; when a design is readable with your tools, summarize what it contains as of today.
- **Open questions** (`--open`): unresolved choices that block starting. When the user answers one, edit the record: move the answer into What or Why with its date and remove it from the questions.
- **Done when:** an observable end state, including which wiki pages must describe the result. Use "to be defined" only when the user has given nothing to define it.
- Work that edits prompt `*.txt` files needs owner approval and before-and-after evaluations (`AGENTS.md`); say so in What.

## 5. Run the script

```bash
node scripts/todo.mjs add --ledger backlog --slug short-name --title "Record title" \
  --description "Ledger row text" --summary "One-line index summary." \
  --what "..." --why "..." --done "..." [--open "..."]
node scripts/todo.mjs move --from backlog --slug short-name --to public-launch
node scripts/todo.mjs milestone --slug public-launch --title "Public launch" \
  --summary "..." --description "Index row text" --intro "..."
```

Create a milestone before adding its todos. Exit code 2 is a usage error with a message; exit code 1 means the docs check failed after writing: fix the reported errors.

## 6. Finish by hand

- If the ledger's `summary` enumerates its contents (the backlog's does), update it, then run `node scripts/check-docs.mjs --fix`.
- After `move`, read the record's "Part of" line; rewrite prose that described the old ledger.
- Pages that say where a topic is tracked in prose without linking the record (for example a spec's "known gaps") need a link to the new record.
- `node scripts/check-docs.mjs` must report 0 errors.

## Report

List each todo with its ledger and record path, any merged or moved records, choices you made for the user, and open questions left in records.
