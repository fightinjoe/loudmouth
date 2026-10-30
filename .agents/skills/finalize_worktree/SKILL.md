---
name: finalize_worktree
description: Prepare a Loudmouth feature worktree for final human review by removing intermediate evaluation artifacts, documenting the current state, verifying retained behavior, staging intended changes without committing, drafting a commit message, and stopping its development servers. Use only when explicitly requested.
disable-model-invocation: true
---

# Finalize a worktree for human review

This workflow prepares a milestone; it does not integrate or retire the worktree. Invocation authorizes removal of identified intermediate evaluation artifacts, appropriate documentation updates, staging intended milestone changes, and stopping positively identified worktree development servers. Never commit, amend, merge, rebase, push, delete a branch/worktree, stash changes, or reset the index. `/merge_worktree` is a separate workflow after the user reviews and commits.

Accept an optional registered worktree path, branch, or unambiguous XYZ identifier, for example `/finalize_worktree 570`. Codex uses `$finalize_worktree 570` or `/skills`; OMP also exposes `/skill:finalize_worktree` and the repository command alias. With no argument, use the current feature worktree. Do not invoke this workflow merely because implementation appears finished.

## 1. Establish the review boundary

1. Resolve the repository, current branch, and registered worktrees using `git rev-parse --show-toplevel` and `git worktree list --porcelain`. Run subsequent commands with the resolved target as their working directory. Reject main, detached HEAD, locked/prunable worktrees, and in-progress merge/rebase/cherry-pick/revert operations. If a supplied identifier is ambiguous, ask rather than guess.
2. Inspect staged, unstaged, untracked, and relevant ignored files without exposing secrets. Preserve existing staged selections and all unrelated user work. Use the task context, actual changes, and repository conventions to identify the milestone; do not assume every dirty file belongs to it. Coordinate with active writers before cleanup or staging.
3. State any missing release consideration supported by the changes: incompatible API/client contracts, storage migrations or fresh namespaces, deployment order, unavailable verification, or unresolved defects. Distinguish a merge prerequisite from a release constraint. Do not invent extra feature work or silently fix unrelated problems.
4. Identify this worktree's configured web/API ports from nonsecret local settings and process ownership. The `add_worktree` convention is `XYZ0` for web and `XYZ1` for API, with `XYZ2` for Playwright; validate it against actual configuration. Never hardcode 5700/5701 or infer ports solely from a branch name. Read only needed port values, not whole credential files.

## 2. Remove intermediate evaluation data

1. Inventory run directories and references before deleting. Typical disposable material includes raw responses, receipts, logs, approvals for completed runs, frozen execution plans, obsolete prompt candidates, revision comparisons, calibration/baseline result packets, experiment diaries, and temporary smoke captures. Inspect ignored `.prompt-romp/`, `evals/.runs/`, generated failure/artifact directories, and relevant temporary captures as well as tracked files.
2. Preserve production prompts, reusable evaluators/contracts, authored input and regression fixtures, current rubrics, and independent design work. A directory called `baseline` may contain reusable inputs rather than historical outputs; classify by contents and consumers, not its name. Do not delete credentials, local configuration, browser libraries/databases, dependencies, or unknown ignored data under this authorization. Ask only where ownership or disposability remains materially ambiguous.
3. Extract useful current decisions, limitations, and verification observations before removing their source records. Delete identified intermediate data rather than archiving it elsewhere. Do not claim deleted runs remain replayable, or preserve receipts and diaries disguised as current documentation.
4. Migrate or remove obsolete evaluator paths and options that depend on deleted artifacts. Keep retained tooling runnable against current contracts. Do not change production prompts or runtime behavior as incidental cleanup; prompt changes require separate approval and the repository's evaluation procedure.
5. Remove stale references from code, commands, skills, and documentation. Follow existing ignore conventions for generated captures so they are not accidentally staged later. Do not use blanket `git clean`, worktree-wide deletion, or indiscriminate recursive removal.

## 3. Document the current state

1. Update existing relevant `docs/` files and operational/evaluation READMEs rather than adding another milestone diary. Endpoint docs own current I/O, pipeline, limits, recovery, and gaps; architecture/product/storage docs own their respective decisions.
2. Describe what is implemented now, supported contracts, storage compatibility, known quality limitations, and release/deployment requirements. Remove superseded experiment narratives and obsolete approval gates. Preserve deferred design work as explicitly deferred, not implemented behavior.
3. Retain concise, attributable verification evidence. Distinguish prior observations from checks run during this finalization, real provider results from mocks, structural validity from linguistic quality, and integration smoke checks from broad reliability claims. Do not fabricate metrics or treat earlier paid approvals as permission for new calls.

## 4. Verify the retained milestone

1. Run checks appropriate to the changes since the last verified state. Application changes require relevant package tests/builds and an actual changed-path smoke run; tooling changes require exercising retained commands safely, not just their help text. Cleanup should demonstrate that deleted data is no longer a runtime dependency. Prefer offline fixtures; no new paid provider calls without authorization.
2. For documentation-only changes, verify structure and local references. Search for dependencies on removed artifacts and inspect generated-output exclusions. For UI smoke work, use the repository-required browser skill, an isolated worktree origin, and only tabs/services you own.
3. Use existing package commands and the repository's working runtime. Run checks serially within a package where they share generated outputs. Do not weaken tests or silently narrow verification to obtain a pass. Fix in-scope failures, then rerun only affected checks. Report unavailable verification or unresolved failures explicitly; do not call the milestone merge-ready when a required check is blocked.
4. Remove temporary verification scripts/data created by this workflow. Keep useful current regression coverage, not one-off scaffolding or regenerated run archives.

## 5. Stop worktree development servers

1. After any verification that needs them, identify listeners on the resolved web/API ports and their owners, working directories, parent processes, and supervisor/tmux panes. Stop only processes positively associated with this target, including a worktree-owned watcher that would restart them. Close only browser tabs opened by this workflow. Preserve the user's agent/editor shell and unrelated services.
2. Prefer the owning supervisor's stop operation or graceful termination. Do not kill arbitrary PIDs merely because they occupy a port, kill an entire shared tmux session, or escalate to forced termination without justification and approval. A process on a requested port with unclear ownership requires clarification.
3. Verify the web/API ports have no listeners. If already free, record that as success. If shutdown is blocked, identify the remaining listener and do not claim completion. Stop any additional temporary test server started by this workflow as well.

## 6. Stage without committing

1. Review the final change inventory against the established milestone boundary. Stage all intended source, tests, docs, additions, and deletions with explicit paths. Never use blanket `git add .` or `git add -A` over unknown work; never force-add secrets, ignored captures, dependencies, or build output. If intended and unrelated edits share a file, preserve the user's selections and resolve the staging boundary explicitly.
2. Run `git diff --cached --check` and inspect final index/status. Confirm intended changes are staged and report any intentionally remaining unstaged/untracked files. Existing unrelated staged changes must remain untouched and be called out; a clean working tree is not permission to include unrelated work.
3. Draft a concise commit subject and body describing the whole milestone, not just finalization. Follow repository message conventions where established. Identify breaking contracts/storage changes explicitly. Share the draft in the final response; do not create a commit or commit-message file unless separately asked.

## Delivery

Report the branch/worktree, cleanup and documentation scope, staged state, exactly which checks ran and passed, any blockers or intentionally excluded files, and server/port shutdown results. Include the proposed commit message in a fenced text block and explicitly confirm that nothing was committed, merged, pushed, or deployed.

On a later invocation, inspect the actual current state and finish only outstanding work. Do not recreate deleted evidence, repeat paid evaluations, disturb unrelated staged work, or restart stopped servers unless needed for authorized verification. Final human review and committing remain the user's next step.
