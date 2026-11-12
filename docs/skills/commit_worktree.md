---
kind: skill
status: current
summary: Commit the current work in a feature worktree after cleanup, todo and wiki ingest, docs check and fast tests; appends to worktree.md.
sources: [scripts/check-docs.mjs, scripts/worktree/add_worktree.py]
verified: 2026-11-12
---

# Commit a worktree

Explicit invocation authorizes one local commit of the current work in a **feature worktree**. Never commit on main, push, amend, rebase, squash, reset, stash, or force-add ignored files. Run it as often as the work warrants; [`/finalize_worktree`](finalize_worktree.md) and [`/merge_worktree`](merge_worktree.md) come later.

Accept an optional registered worktree path, branch, or unambiguous XYZ identifier, for example `/commit_worktree 527`, and an optional note on what the commit covers. Codex uses `$commit_worktree` or `/skills`; OMP also exposes `/skill:commit_worktree` and the `.agents/commands` alias. With no argument, use the current feature worktree.

## 1. Resolve the worktree

1. Resolve the repository and registered worktrees with `git rev-parse --show-toplevel` and `git worktree list --porcelain`. Run every later command with the target as its working directory. If an identifier is ambiguous, ask rather than guess.
2. Reject main, detached HEAD, locked or prunable worktrees, and any in-progress merge, rebase, cherry-pick, revert or sequencer operation (check Git-resolved paths such as `MERGE_HEAD` and `rebase-merge`). Stop; do not repair them.
3. Read `<worktree>/worktree.md` (written by [`/add_worktree`](add_worktree.md)). If it is absent, ask the user for the branch intent and create it in the same format: `# <branch>`, `## Intent`, `## Setup` (created date, base commit short sha from `git merge-base main HEAD`, web/API/Playwright ports from `web/app/.env.local` and `api/.env.local` if present, tmux window if known) and an empty `## Changelog`. Confirm `git check-ignore -q worktree.md` before writing; if it is not ignored, stop and report that main's `.gitignore` needs `/worktree.md`.

## 2. Inventory and boundary

1. List staged, unstaged and untracked files (`git status --porcelain=v1 --untracked-files=all`) and relevant ignored files (`git status --ignored --porcelain=v1`), without printing secrets.
2. Use the intent, the user's note and the actual diffs to decide what this commit contains. Preserve unrelated work and existing staged selections; do not assume every dirty file belongs to the commit. When intended and unrelated edits share a file, ask how to split it. Coordinate with any other active writer in the worktree before touching files.

## 3. Remove temporary files

1. Inventory candidates before deleting anything and list them in the report. Disposable material no longer needed going forward includes ignored `.prompt-romp/`, `evals/.runs/` and `**/evals/failures/` output, temporary captures under `tmp/`, and throwaway scripts or notes created for this work.
2. Never delete credentials, `.env` files, `node_modules`, build output the user relies on, browser profiles or databases, `worktree.md`, or unknown data. Ask when ownership or disposability is unclear. No blanket `git clean` or recursive deletion of broad paths.
3. Remove references that pointed at deleted files.

## 4. Todos and wiki ingest

Follow [the wiki conventions](../wiki.md).

1. **Todos.** For each todo in `docs/todo/*.md` that this commit completes, set its status to `done` with today's date, per the [todo lifecycle](../wiki.md#todo-lifecycle). Mark partially done work `in-progress` only if that row exists. Do not close milestones here; `/finalize_worktree` does. Add a todo row only for planned follow-up the user asked to track.
2. **Ingest.** For every fact this work changed (behavior, contracts, commands, limits, paths), update the page that owns it, and set its `verified` date to today once you have re-read the page against the code. Pages whose `sources` include changed files are the starting list; a change usually touches a few pages. Record evaluation or test runs worth keeping as ledger rows, not paragraphs.
3. Run `node scripts/check-docs.mjs --fix`, then `node scripts/check-docs.mjs`. Errors block the commit: fix them. Report remaining warnings; resolve staleness warnings for pages whose sources this commit changed.

## 5. Fast checks

Run the fast checks for packages the commit touches, serially within a package:

- `api/src`: `npm test`
- `web/app`: `npm test`
- `evals/pipelines`: `bun test evals/pipelines` from the repository root

Docs-only commits need only the docs check. No paid provider calls. A failing check blocks the commit: fix in-scope failures and rerun the affected check, or stop and report. Do not weaken or skip tests to get a pass.

## 6. Commit

1. Stage explicit paths only, including intended deletions and the doc updates above. Never `git add .`/`-A` over unknown work; never force-add ignored files. Run `git diff --cached --check` and review `git diff --cached --stat`.
2. Write the message from the `worktree.md` intent and the staged diff: a concise imperative subject (about 72 characters at most) and a short body covering what changed and why, plus any breaking contract or storage change. Pass the message as an argument array or file, never through shell interpolation of user prose. Commit with `git commit` (no `--amend`, no `--no-verify`).
3. Append ``- YYYY-MM-DD `<short sha>` <subject>`` to the `## Changelog` section of `worktree.md`.

## Delivery

Report the branch and worktree, the commit sha and full message, files removed as temporary, todos marked done, wiki pages updated, exactly which checks ran and their results, docs-check warnings, and any files intentionally left unstaged or untracked. Confirm nothing was pushed.
