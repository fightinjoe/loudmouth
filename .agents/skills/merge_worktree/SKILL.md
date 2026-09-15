---
name: merge_worktree
description: Verify and squash a clean Loudmouth feature worktree into local main, then remove its worktree directory and delete the feature branch. Use only when the user explicitly requests /merge_worktree or worktree integration and retirement. Never pushes.
disable-model-invocation: true
---

# Merge and retire a Loudmouth worktree

This is a local, destructive-on-success workflow. The user's invocation authorizes squash integration and removal of the selected worktree directory and feature branch, not deletion of unrelated data. Never push, auto-commit dirty source work, stash user changes, or force-remove a worktree.

Accept a worktree directory, branch, or unambiguous XYZ identifier, for example `/merge_worktree 527`. Codex uses `$merge_worktree 527` or `/skills`; OMP also exposes `/skill:merge_worktree`.

## Identify and protect

1. Discover the repository and main checkout using `git rev-parse --show-toplevel` and `git worktree list --porcelain`. Resolve the target to one registered non-main worktree in this repository. If omitted and the current checkout is a feature worktree, use it; otherwise ask the user to select among actual entries. Never guess an ambiguous identifier. Reject main, detached HEAD, missing/prunable or locked worktrees, and paths outside the registered target. Stop rather than silently repair or unlock anything.
2. Run every integration command with the **main checkout as its working directory**. If the current agent/editor/shell is running in the source worktree, move its session to main before removal (OMP: `/move` if available); if the host cannot relocate, complete integration but stop before removal and give the exact remaining cleanup command from main. Never delete the process's working directory and then claim the session remains usable.
3. Serialize integration with an atomic directory lock `<absolute-git-common-dir>/loudmouth-merge.lock` (`git rev-parse --path-format=absolute --git-common-dir`). Record the owner, main path, source path, and source branch. Acquire before changing main, hold through verification/commit/removal, and release only your own lock in a finally/cleanup path. If it exists, stop and identify the owner; never assume a lock is stale. Coordinate with other active agents: nobody else may edit main or the source during this operation. Creation uses its own allocation lock and may proceed only when main is clean.
4. Both main and source must have empty `git status --porcelain=v1 --untracked-files=all`. Check both for merge, rebase, cherry-pick, revert, and sequencer state using Git-resolved paths. Stop on any existing operation. Report dirty paths without printing secrets; ask the user to finish or commit source work separately. A commit count is not proof of unmerged changes after a squash.
5. Record exact `MAIN_BEFORE`, `SOURCE_SHA`, `SOURCE_BRANCH`, and `SOURCE_PATH`. The source branch must not be main and must still point to SOURCE_SHA before retirement. Inspect `git log main..SOURCE_BRANCH` and the proposed diff. Keep local main as-is; do not reset it to a remote or silently fetch/pull.
6. Inspect ignored files in the source before promising removal (`git ls-files --others --ignored --exclude-standard --directory`). Known disposable output includes node_modules, dist, Playwright reports, .gstack runtime logs, .DS_Store, generated web/app/.env.local and api/.env.local. The copied api/.env may be removed only if the main copy is still present and byte-identical (compare without printing values). Unknown ignored data, changed credentials, or scratch work such as tmp/ requires explicit preservation/removal approval. Do not confuse ignored files with safely disposable files; Git worktree removal deletes ignored files too.

## Squash and verify

1. With main still clean and source unchanged, run `git merge --squash SOURCE_BRANCH` in main. Quote/validate the resolved branch; do not evaluate input as shell code.
2. Resolve conflicts semantically, preserving main's newer behavior and the feature's intent. Read surrounding code and migrate affected callers/tests/docs. Never choose an entire side blindly. On uncertainty, stop with both worktrees intact. Squash conflicts do not normally set MERGE_HEAD, so do not prescribe `git merge --abort` as recovery; never run a hard reset without approval.
3. If Git reports no staged changes, distinguish an already-integrated feature from a failed/partial merge. Require evidence from the actual diff/history that the source changes are present in main. Do not make an empty commit. Only retire an already-integrated source when that evidence is clear; otherwise stop for investigation.
4. Verify the integrated result, not merely the source branch. Run the relevant package checks serially per package; install with `npm ci` if its lockfile changed or dependencies are absent. Default verification for application changes:
   - `api/src`: `npm test` for API changes.
   - `web/app`: `npm test` and `npm run build` for web changes.
   - For UI changes, launch and exercise the actual merged surface with a browser, including the changed interaction. Use an available explicit port, strict startup, and a dedicated browser origin; no paid provider calls without authorization. If a relevant Playwright scenario is usable, run it on a free `PLAYWRIGHT_PORT`, never against a reused server. Do not run multiple builds/Playwright runs simultaneously inside the same checkout.
   - For tooling-only changes, exercise the changed command in a disposable repository or other safe fixture. For docs-only changes, check references and rendered/structural correctness as appropriate.
   Record exactly what passed. Failed or unavailable required verification blocks commit/removal; preserve the source branch and worktree. Do not weaken checks to finish the merge.
5. Recheck SOURCE_SHA, main's HEAD against MAIN_BEFORE, and the staged changes. If either branch moved or unrelated files appeared, stop. Stage only reviewed integration/conflict resolutions, never `git add .` over unknown work. Commit with a descriptive squash message and a provenance trailer `Squashed-from: SOURCE_BRANCH SOURCE_SHA`. Capture the new main commit. Do not use `git commit --amend` or create a two-parent merge.

## Retire only after successful integration

1. Stop only supervised servers/watchers you can positively identify as belonging to the source worktree. Close only browser tabs you opened. Ask the owner of another active agent/session to stop; do not kill arbitrary PIDs or the current agent. If ownership cannot be established, leave the worktree until safe cleanup is possible.
2. Recheck source cleanliness, ignored-data decisions, and unchanged SOURCE_SHA. Confirm main is clean, its new commit is the verified integration commit, and that commit records the source SHA (or that an already-integrated case has equivalent evidence). Source work after verification must never be discarded.
3. From main, run `git worktree remove SOURCE_PATH` **without `--force`**. This removes both the Git registration and directory. If it fails, stop with the commit and branch intact; diagnose the reason, never fall back to `rm -rf` or unlock automatically.
4. Only after directory removal succeeds, delete the exact source branch with `git branch -D SOURCE_BRANCH`. Squash merges do not establish ancestry, so `-d` can reject an integrated branch; `-D` is authorized here only after the explicit SHA/provenance checks above. Never delete main, another branch, or remote branches. If the branch moved, do not delete it.
5. Verify source directory absence, worktree registration absence, branch absence, and clean main. Release your integration lock. Report squash commit, verification evidence, removed path and branch, and that nothing was pushed.

If stopped after committing but before cleanup, report the commit and remaining path/branch clearly. On a later retry, use the recorded source SHA/provenance and current state rather than creating a duplicate squash or deleting new work. Keep any unresolved source work available to the user.
