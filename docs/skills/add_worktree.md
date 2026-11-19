---
kind: skill
status: current
summary: Create a port-isolated sibling worktree with its own feature branch, worktree.md intent notes, dependencies and an OMP tmux window; dev servers start separately.
sources: [scripts/worktree/add_worktree.py, .gitignore, web/app/vite.config.js, web/app/playwright.config.js]
verified: 2026-11-19
---

# Add a worktree

Run only on an explicit user request. Do not merge, commit, or push as part of creation. Creation opens a tmux window running OMP in the new worktree; it does not start the dev servers. Start them when needed with [`/ajw_start_web_server`](ajw_start_web_server.md) and [`/ajw_start_api_server`](ajw_start_api_server.md).

Supporting script: `scripts/worktree/add_worktree.py`, one subcommand per step: `create`, `install`, `window`, `verify`. Pass arguments as an argument array; never interpolate the intent or other user prose into shell code.

## Inputs and layout

Accept a short task name, an optional `--id XYZ`, and the branch intent, for example:

```text
/add_worktree card-layout
/add_worktree card-layout --id 527
```

Hosts expose the same skill differently: Claude Code discovers the `.claude/skills` symlinks, OMP uses `/skill:add_worktree` or the `.agents/commands` slash alias, and Codex uses `$add_worktree card-layout --id 527` or the `/skills` picker. Restart or reload the host if a newly added skill or command is not visible.

Use a lowercase hyphen-separated task slug. Infer a short slug from a supplied task description; ask only if no task/name was supplied. Never silently change an explicit identifier.

**Intent.** If the user has not described what the branch is for, ask before running the helper: one or two sentences on the goal and scope. A supplied task description, or a named todo milestone or record, counts as the intent; write it from that page. The helper writes it to the worktree's `worktree.md`, which later anchors `/commit_worktree`, `/finalize_worktree` and `/merge_worktree`.

- Directory: a sibling of the main checkout, `loudmouth-XYZ-short-name`.
- Branch: `feat/XYZ-short-name`, newly created from local `main`.
- `XYZ`: automatically chosen unused three-digit identifier from 103 through 999, unless explicitly supplied. Exclude 172, 506, and 600 because they produce browser-restricted ports. All assigned ports are unprivileged.
- Web: `XYZ0`; API: `XYZ1`; Playwright preview: `XYZ2`. For example, `--id 527` gives web 5270, API 5271 and Playwright 5272.
- Keep the main checkout for serial integration. One active writer per worktree.

## 1. Create

```text
python3 scripts/worktree/add_worktree.py create <short-name> --intent <text> [--id XYZ]
```

Resolve the script against the repository root. Python 3, npm, tmux, the `omp` executable and an existing `loudmouth` tmux session are required; the script fails before any change if one is missing. It does not fetch, pull or push; it uses the current local main and reports its commit.

What `create` does, in order:

1. Takes an allocation lock in the shared Git directory, finds the checkout of `main`, and requires it to be clean (including staged and untracked files) with no Git operation or integration lock in progress. If main is dirty, stop and ask the user; never stash or commit unrelated changes to get past it.
2. Requires main's committed `.gitignore` to ignore `/worktree.md` and the generated environment files, picks `XYZ`, checks registered worktrees, sibling directories, branches and all three ports, and runs `git worktree add`. Never bypass the lock or a collision. Port checks are advisory until launch; strict server startup catches later collisions.
3. Writes `<worktree>/worktree.md` (ignored; never committed):

   ```markdown
   # feat/527-card-layout

   ## Intent

   <intent text>

   ## Setup

   - Created: 2026-11-12
   - Base commit: <short sha>
   - Web port: 5270
   - API port: 5271
   - Playwright port: 5272
   - tmux window: loudmouth:loudmouth-527-card-layout

   ## Changelog

   ```

   `/commit_worktree` appends one ``- YYYY-MM-DD `<sha>` <subject>`` line per commit to the changelog.
4. Generates local configuration rather than inheriting it: `web/app/.env.local` with `VITE_DEV_PORT=XYZ0`, `VITE_API_URL=http://tiny:XYZ1` and `PLAYWRIGHT_PORT=XYZ2` (`tiny` is the API host's Tailscale MagicDNS name; remote clients must be on the tailnet), and `api/.env.local` with `PORT=XYZ1`. Only main's ignored, untracked `api/.env` is copied, with private permissions; it is the approved credential allowlist. Never print it, add it to Git, or copy other secret files. Do not copy main's web `.env.local`: it can route requests to the wrong worktree. Additional local overrides need explicit approval first.
5. Runs `npm ci` in `web/app` and `api/src`. Never symlink `node_modules`, build output, local configuration, or live databases between worktrees.
6. Opens a detached window named `loudmouth-XYZ-short-name` in tmux session `loudmouth` with one pane running `omp` at the worktree root.
7. Runs `verify` and prints its checklist.

## 2. Recover a partial worktree

On failure after `git worktree add`, the script keeps the worktree and branch and prints the remaining steps. Fix the cause, then run only the failed steps:

```text
python3 scripts/worktree/add_worktree.py install <worktree>   # npm ci in both packages
python3 scripts/worktree/add_worktree.py window <worktree>    # OMP window, unless one already has a pane at the root
python3 scripts/worktree/add_worktree.py verify <worktree>
```

Do not rerun `create`, delete the worktree, or claim it is ready. A leftover allocation lock requires checking its owner before removing it.

## 3. Report

Relay the `create` output: directory, branch, base commit, the three ports, the `worktree.md` path and the tmux window, plus the `verify` checklist. `verify` fails on a dirty worktree, missing or unignored generated files, wrong ports in them, or missing `node_modules`; it warns when `api/.env` or the tmux window is absent. If credentials were absent, report that the API may need `api/.env` or process credentials; do not fabricate credentials or make paid API calls. Relay npm warnings (engine mismatches, audit findings, blocked install scripts) that are not already tracked in [`docs/todo`](../todo/index.md).

## Working in parallel

Start servers with [`/ajw_start_web_server`](ajw_start_web_server.md) and [`/ajw_start_api_server`](ajw_start_api_server.md); they read this worktree's ports, place panes in its window and check readiness. `npm run test:e2e` in `<worktree>/web/app` runs Playwright.

Playwright (`web/app/playwright.config.js`) previews on `PLAYWRIGHT_PORT` from the process environment, else from `.env.local`, else 4173, and never reuses an existing server. Do not run simultaneous builds or E2E runs in one worktree: they share its `dist` and report directories. The preview is a production build, and Playwright gives that build its own synthetic [online generation inputs](../web/development.md#build), so an E2E run works with the `.env.local` this skill writes. A plain `npm run build` does not: `web/app/vite.config.js` requires the six inputs and rejects a local API URL, so pass synthetic non-local values in the process environment for a build check.

Use the `http://tiny:XYZ0` web origin from remote machines (or `http://localhost:XYZ0` locally); the web app contacts `http://tiny:XYZ1`. Ports isolate browser IndexedDB, localStorage, and service-worker scope. Do not reuse the main checkout's browser origin for feature testing. HTTP worktree origins work because the app's IDs come from `crypto.getRandomValues` (`web/app/src/js/utils.ts`), not the secure-context-only `crypto.randomUUID`.

Commit progress with [`/commit_worktree`](commit_worktree.md), prepare review with [`/finalize_worktree`](finalize_worktree.md), and integrate with [`/merge_worktree`](merge_worktree.md). After a successful squash merge, retire this feature branch. Start the next task in a new worktree from updated main rather than continuing the old branch's history.
