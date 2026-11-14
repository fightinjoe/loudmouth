---
kind: skill
status: current
summary: "Prepare a feature worktree for human review: cleanup, todo and milestone lifecycle, docs ingest, verification and server shutdown; never commits."
sources: [scripts/check-docs.mjs, scripts/worktree/add_worktree.py]
verified: 2026-11-14
---

# Finalize a worktree for human review

This workflow prepares a branch for review; it does not commit, integrate or retire the worktree. Invocation authorizes removal of identified intermediate evaluation artifacts, todo and wiki updates, and stopping positively identified worktree development servers. Never stage, commit, amend, merge, rebase, push, delete a branch/worktree, stash changes, or reset the index. Commits come from [`/commit_worktree`](commit_worktree.md); integration from [`/merge_worktree`](merge_worktree.md).

Accept an optional registered worktree path, branch, or unambiguous XYZ identifier, for example `/finalize_worktree 570`. Codex uses `$finalize_worktree 570` or `/skills`; OMP also exposes `/skill:finalize_worktree` and the repository command alias. With no argument, use the current feature worktree. Do not invoke this workflow merely because implementation appears finished.

## 1. Establish the review boundary

1. Resolve the repository, current branch, and registered worktrees using `git rev-parse --show-toplevel` and `git worktree list --porcelain`. Run subsequent commands with the resolved target as their working directory. Reject main, detached HEAD, locked/prunable worktrees, and in-progress merge/rebase/cherry-pick/revert operations. If a supplied identifier is ambiguous, ask rather than guess.
2. Read `<worktree>/worktree.md`: its intent and changelog define what the branch is for. If it is absent, ask the user for the intent and create it as [`/commit_worktree`](commit_worktree.md) describes. The branch diff is `git diff main...HEAD` plus uncommitted work.
3. Inspect staged, unstaged, untracked, and relevant ignored files without exposing secrets. Leave existing staged selections and all unrelated user work untouched. Use the intent, the actual changes, and repository conventions to identify what belongs to the branch; do not assume every dirty file does. Coordinate with active writers before cleanup.
4. State any missing release consideration supported by the changes: incompatible API/client contracts, storage migrations or fresh namespaces, deployment order, unavailable verification, or unresolved defects. Distinguish a merge prerequisite from a release constraint; release work belongs in `docs/todo/`. Do not invent extra feature work or silently fix unrelated problems.
5. Read this worktree's web/API ports from the `## Setup` section of `worktree.md` and validate them against nonsecret local settings and process ownership. The [`/add_worktree`](add_worktree.md) convention is `XYZ0` for web, `XYZ1` for API and `XYZ2` for Playwright. Never hardcode ports or infer them solely from a branch name. Read only needed port values, not whole credential files.

## 2. Remove intermediate evaluation data

1. Inventory run directories and references before deleting. Typical disposable material includes raw responses, receipts, logs, approvals for completed runs, frozen execution plans, obsolete prompt candidates, revision comparisons, calibration/baseline result packets, experiment diaries, and temporary smoke captures. Inspect ignored `.prompt-romp/`, `evals/.runs/`, generated failure/artifact directories, and relevant temporary captures as well as tracked files.
2. Preserve production prompts, reusable evaluators/contracts, authored input and regression fixtures, current rubrics, and independent design work. A directory called `baseline` may contain reusable inputs rather than historical outputs; classify by contents and consumers, not its name. Do not delete credentials, local configuration, browser libraries/databases, dependencies, `worktree.md`, or unknown ignored data under this authorization. Ask only where ownership or disposability remains materially ambiguous.
3. Extract useful current decisions, limitations, and results before removing their source records: results become rows in the [evaluation results ledger](../evals/results.md) with an optional record. Delete identified intermediate data rather than archiving it elsewhere. Do not claim deleted runs remain replayable.
4. Migrate or remove obsolete evaluator paths and options that depend on deleted artifacts. Keep retained tooling runnable against current contracts. Do not change production prompts or runtime behavior as incidental cleanup; prompt changes require separate approval and the repository's evaluation procedure.
5. Remove stale references from code, commands, skills, and documentation. Follow existing ignore conventions for generated captures. Do not use blanket `git clean`, worktree-wide deletion, or indiscriminate recursive removal.

## 3. Clean up todos

Follow the [todo lifecycle](../wiki.md#todo-lifecycle).

1. Todos in `docs/todo/*.md` completed by this branch are `done` with their completion date (set any that `/commit_worktree` missed).
2. For each milestone whose rows are now all `done`: if it is a [launch milestone](../wiki.md#launch-milestones), first write its release notes, a record in `docs/releases/` named after the milestone slug plus a row in [release notes](../releases.md), from its rows, records and notes. Then move decisions worth keeping to [decisions](../decisions.md) as ledger rows (with records where context is needed), set the milestone to `done` with today's date in [`docs/todo/index.md`](../todo/index.md) and remove its link, then delete the milestone page and its record folder. Remove links to them elsewhere.

## 4. Make the docs current

Follow [the wiki conventions](../wiki.md).

1. **Ingest.** Walk the branch diff against main. For every fact it changed, update the page that owns it: current behavior only, one owner per fact, no diaries. Pages whose `sources` include changed files are the starting list. Remove superseded narratives and obsolete approval gates; future designs belong in `docs/proposals/`, planned work in `docs/todo/`.
2. Set `verified` to today on each page you re-read against its sources.
3. Run `node scripts/check-docs.mjs --fix`, then `node scripts/check-docs.mjs` until it reports no errors. Resolve every staleness warning for a page whose sources changed in this branch; report any other warnings.

## 5. Verify the retained work

1. Run checks appropriate to the changes since the last verified state. Application changes require relevant package tests/builds (`api/src`: `npm test`; `web/app`: `npm test` and `npm run build`; `bun test evals/pipelines` for pipeline code) and an actual changed-path smoke run; tooling changes require exercising retained commands safely, not just their help text. Cleanup should demonstrate that deleted data is no longer a runtime dependency. Prefer offline fixtures; no new paid provider calls without authorization.
2. For documentation-only changes, the docs check above is the verification. Search for dependencies on removed artifacts and inspect generated-output exclusions. For UI smoke work, use the repository-required browser skill, an isolated worktree origin, and only tabs/services you own.
3. Use existing package commands and the repository's working runtime. Run checks serially within a package where they share generated outputs. Do not weaken tests or silently narrow verification to obtain a pass. Fix in-scope failures, then rerun only affected checks. Report unavailable verification or unresolved failures explicitly; do not call the branch merge-ready when a required check is blocked.
4. Remove temporary verification scripts/data created by this workflow. Keep useful current regression coverage, not one-off scaffolding or regenerated run archives.

## 6. Stop worktree development servers

1. After any verification that needs them, identify listeners on the resolved web/API ports and their owners, working directories, parent processes, and supervisor/tmux panes. Stop only processes positively associated with this target, including a worktree-owned watcher that would restart them. Close only browser tabs opened by this workflow. Preserve the user's agent/editor shell and unrelated services.
2. Prefer the owning supervisor's stop operation or graceful termination. Do not kill arbitrary PIDs merely because they occupy a port, kill an entire shared tmux session, or escalate to forced termination without justification and approval. A process on a requested port with unclear ownership requires clarification.
3. Verify the web/API ports have no listeners. If already free, record that as success. If shutdown is blocked, identify the remaining listener and do not claim completion. Stop any additional temporary test server started by this workflow as well.

## Delivery

Report the branch/worktree, cleanup scope, todo and milestone changes, wiki pages updated, exactly which checks ran and passed, docs-check warnings, any blockers or intentionally excluded files, and server/port shutdown results. Confirm that nothing was staged, committed, merged, pushed, or deployed. End by telling the user to review, then run `/commit_worktree` to commit the result and `/merge_worktree` to integrate it.

On a later invocation, inspect the actual current state and finish only outstanding work. Do not recreate deleted evidence, repeat paid evaluations, disturb unrelated staged work, or restart stopped servers unless needed for authorized verification.
