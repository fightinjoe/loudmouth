---
name: add_worktree
description: Create a ready-to-run Loudmouth sibling worktree with its own feature branch, dependencies, local API configuration, and isolated web/API/test ports. Use when the user requests /add_worktree or asks to start a parallel worktree.
disable-model-invocation: true
---

# Add a Loudmouth worktree

Run only on an explicit user request. Do not merge, commit, push, or start servers as part of creation.

## Inputs and layout

Accept a short task name and optional `--id XYZ`, for example:

```text
/add_worktree card-layout
/add_worktree card-layout --id 527
```

Codex invokes this same skill as `$add_worktree card-layout --id 527` or through `/skills`.
OMP also supports `/skill:add_worktree`; the repository's `.agents/commands` provides the short slash alias.

Use a lowercase hyphen-separated task slug. Infer a short slug from a supplied task description; ask only if no task/name was supplied. Never silently change an explicit identifier.

- Directory: a sibling of the main checkout, `loudmouth-XYZ-short-name`.
- Branch: `feat/XYZ-short-name`, newly created from local `main`.
- `XYZ`: automatically chosen unused three-digit identifier from 103 through 999, unless explicitly supplied. Exclude 172, 506, and 600 because they produce browser-restricted ports. All assigned ports are unprivileged.
- Web: `XYZ0`; API: `XYZ1`; Playwright preview: `XYZ2`.
- Keep the main checkout for serial integration. One active writer per worktree.

## Execute

1. Locate this repository with `git rev-parse --show-toplevel`; locate its checked-out `main` with `git worktree list --porcelain`. Do not assume the current checkout is main or hardcode an absolute machine path. Main must be clean, including staged and untracked changes, with no in-progress Git operation. Never stash or commit unrelated changes to bypass this requirement. Do not fetch, pull, or push automatically; use the current local main and report its commit.
2. Run the bundled helper from a checkout of this repository using Python 3:

   ```text
   python3 <skill-directory>/scripts/add_worktree.py <short-name> [--id XYZ]
   ```

   Resolve `<skill-directory>` to this file's actual directory. Use argument arrays or proper shell quoting; never interpolate arbitrary task prose into shell code.
3. The helper reserves allocation with a lock in the shared Git directory, checks registered worktrees, sibling directories, branches, and all three ports, and creates a new worktree. Never bypass a lock or collision. Port checks are advisory until launch; strict server startup catches subsequent collisions.
4. The helper installs dependencies separately with `npm ci` in `web/app` and `api/src`. Never symlink `node_modules`, build output, local configuration, or live databases between worktrees.
5. Local configuration is generated, not inherited wholesale:
   - `web/app/.env.local`: `VITE_DEV_PORT=XYZ0`, `VITE_API_URL=http://localhost:XYZ1`, and `PLAYWRIGHT_PORT=XYZ2`.
   - `api/.env.local`: `PORT=XYZ1`.
   - Only the main checkout's ignored, untracked `api/.env` may be copied into the new worktree, with private permissions. This is the approved credential-file allowlist. Never print its contents, add it to Git, or copy other secret files automatically. Existing machine-level Google application-default credentials are not duplicated.
   - Do not copy main's web `.env.local`: it can route requests to the wrong worktree. If additional local overrides are needed, obtain explicit approval for the keys/files first.
6. Confirm success output names the actual directory, branch, base commit, and all three ports. Check that the new worktree is clean and the generated environment files are ignored. If credentials were absent, report that API startup/configuration may still need `api/.env` or existing process credentials; do not fabricate credentials or make paid API calls.

## Working in parallel

Report commands with their working directories, without starting them:

- `<new-worktree>/api/src`: `npm run dev`
- `<new-worktree>/web/app`: `npm run dev`
- `<new-worktree>/web/app`: `npm run test:e2e` (separate `XYZ2` preview port; never reuses another worktree's server)

Use the reported localhost origins consistently; ports isolate browser IndexedDB, localStorage, and service-worker scope. Do not reuse the main checkout's browser origin for feature testing. If servers are requested later, use the host tool's supervised process facility (OMP: `hub start`) and unique names containing `XYZ`; verify readiness and record ownership. Never kill a process merely because it occupies a desired port.

The helper leaves a partially created worktree intact on installation/configuration failure and reports its path. Repair that worktree and rerun only the failed setup step; do not blindly rerun creation, delete it, or claim it is ready. A leftover allocation lock requires checking its owner before removing it.

After a successful squash merge, retire this feature branch. Start the next task in a new worktree from updated main rather than continuing the old branch's history.
