---
kind: skill
status: current
summary: Create a port-isolated sibling worktree with its own feature branch, worktree.md intent notes, dependencies and a three-pane tmux window.
sources: [scripts/worktree/add_worktree.py, .gitignore, web/app/vite.config.js, web/app/playwright.config.js]
verified: 2026-11-12
---

# Add a worktree

Run only on an explicit user request. Do not merge, commit, or push as part of creation. The helper starts OMP and both dev servers in a new tmux window.

## Inputs and layout

Accept a short task name, an optional `--id XYZ`, and the branch intent, for example:

```text
/add_worktree card-layout
/add_worktree card-layout --id 527
```

Hosts expose the same skill differently: Claude Code discovers the `.claude/skills` symlinks, OMP uses `/skill:add_worktree` or the `.agents/commands` slash alias, and Codex uses `$add_worktree card-layout --id 527` or the `/skills` picker. Restart or reload the host if a newly added skill or command is not visible.

Use a lowercase hyphen-separated task slug. Infer a short slug from a supplied task description; ask only if no task/name was supplied. Never silently change an explicit identifier.

**Intent.** If the user has not described what the branch is for, ask before running the helper: one or two sentences on the goal and scope. A supplied task description counts as the intent. The helper writes it to the worktree's `worktree.md`, which later anchors `/commit_worktree`, `/finalize_worktree` and `/merge_worktree`.

- Directory: a sibling of the main checkout, `loudmouth-XYZ-short-name`.
- Branch: `feat/XYZ-short-name`, newly created from local `main`.
- `XYZ`: automatically chosen unused three-digit identifier from 103 through 999, unless explicitly supplied. Exclude 172, 506, and 600 because they produce browser-restricted ports. All assigned ports are unprivileged.
- Web: `XYZ0`; API: `XYZ1`; Playwright preview: `XYZ2`. For example, `--id 527` gives web 5270, API 5271 and Playwright 5272.
- Keep the main checkout for serial integration. One active writer per worktree.

## Execute

1. Locate this repository with `git rev-parse --show-toplevel`; locate its checked-out `main` with `git worktree list --porcelain`. Do not assume the current checkout is main or hardcode an absolute machine path. Main must be clean, including staged and untracked changes, with no in-progress Git operation. Never stash or commit unrelated changes to bypass this requirement. Do not fetch, pull, or push automatically; use the current local main and report its commit. Python 3, npm, tmux, the `omp` executable and an existing `loudmouth` tmux session are required; the helper checks tmux and OMP and fails before mutation if either is unavailable.
2. Run the helper from a checkout of this repository using Python 3, passing arguments as an argument array (never interpolate the intent or other user prose into shell code):

   ```text
   python3 scripts/worktree/add_worktree.py <short-name> --intent <text> [--id XYZ]
   ```

   Resolve `scripts/worktree/add_worktree.py` against the repository root. `--intent` is required; a missing or blank value is a usage error.
3. The helper reserves allocation with a lock in the shared Git directory, checks registered worktrees, sibling directories, branches, and all three ports, and creates a new worktree. Never bypass a lock or collision. Port checks are advisory until launch; strict server startup catches subsequent collisions.
4. Before creating anything, the helper requires main's committed `.gitignore` to ignore `/worktree.md` and stops with a message naming the missing entry otherwise. After `git worktree add` it confirms `git check-ignore -q worktree.md` in the new worktree, then writes `<worktree>/worktree.md`:

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

   `/commit_worktree` appends one ``- YYYY-MM-DD `<sha>` <subject>`` line per commit to the changelog. The file is never committed; git history and the wiki carry the lasting record.
5. The helper installs dependencies separately with `npm ci` in `web/app` and `api/src`. Never symlink `node_modules`, build output, local configuration, or live databases between worktrees.
6. Local configuration is generated, not inherited wholesale:
   - `web/app/.env.local`: `VITE_DEV_PORT=XYZ0`, `VITE_API_URL=http://tiny:XYZ1`, and `PLAYWRIGHT_PORT=XYZ2`. `tiny` is the API host's Tailscale MagicDNS name; remote clients must be on the tailnet and able to reach it.
   - `api/.env.local`: `PORT=XYZ1`.
   - Only the main checkout's ignored, untracked `api/.env` may be copied into the new worktree, with private permissions. This is the approved credential-file allowlist. Never print its contents, add it to Git, or copy other secret files automatically. Existing machine-level Google application-default credentials are not duplicated.
   - Do not copy main's web `.env.local`: it can route requests to the wrong worktree. If additional local overrides are needed, obtain explicit approval for the keys/files first.
7. After installation the helper creates a detached window named `loudmouth-XYZ-short-name` in tmux session `loudmouth`: left pane runs `omp` from the worktree root, upper-right runs `env __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=tiny npm run dev` from `web/app`, and lower-right runs `npm run dev` from `api/src`. `web/app/vite.config.js` already allows the `tiny` host; the process-environment override keeps that working for checkouts whose config lacks it; it must be in the process environment, not `.env.local`. Do not set `allowedHosts: true`; keep other hosts blocked. Inspect the panes for startup failures; successful tmux command dispatch does not guarantee server readiness. If window setup fails, the helper removes the partial window and reports the retained worktree.
8. Confirm success output names the actual directory, branch, base commit, all three ports, the `worktree.md` path and the tmux window. After web startup, verify `curl --noproxy '*' -H 'Host: tiny:XYZ0' http://127.0.0.1:XYZ0/` returns the app rather than Vite's blocked-host response; listening on a port alone is insufficient. Check that the new worktree is clean and the generated environment files and `worktree.md` are ignored. If credentials were absent, report that API startup/configuration may still need `api/.env` or existing process credentials; do not fabricate credentials or make paid API calls.

## Working in parallel

The helper starts `omp` and both dev servers in the tmux window. For manual restarts, use:

- `<new-worktree>/api/src`: `npm run dev`
- `<new-worktree>/web/app`: `env __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=tiny npm run dev`
- `<new-worktree>/web/app`: `npm run test:e2e`

Playwright (`web/app/playwright.config.js`) previews on `PLAYWRIGHT_PORT` from the process environment, else from `.env.local`, else 4173, and never reuses an existing server. Do not run simultaneous builds or E2E runs in one worktree: they share its `dist` and report directories.

Use the reported `http://tiny:XYZ0` web origin from remote machines (or `http://localhost:XYZ0` locally); the web app contacts `http://tiny:XYZ1`. Ports isolate browser IndexedDB, localStorage, and service-worker scope. Do not reuse the main checkout's browser origin for feature testing. HTTP worktree origins work because the app's IDs come from `crypto.getRandomValues` (`web/app/src/js/utils.ts`), not the secure-context-only `crypto.randomUUID`.

The helper-owned tmux panes own their server processes: inspect their output before relying on readiness, and do not start duplicate servers via a separate supervisor. Never kill a process merely because it occupies a desired port.

The allowlist adds only `tiny`; Vite's normal localhost and IP-address access remains available. If repairing an existing checkout, add `tiny` to `server.allowedHosts` in `web/app/vite.config.js`, or restart its web pane with the process-environment command above. Verify both HTTP 200 for `Host: tiny` and HTTP 403 for an unrelated hostname; never solve this error by disabling host validation.

The helper leaves a partially created worktree intact on installation/configuration failure and reports its path. Repair that worktree and rerun only the failed setup step; do not blindly rerun creation, delete it, or claim it is ready. A leftover allocation lock requires checking its owner before removing it.

Commit progress with [`/commit_worktree`](commit_worktree.md), prepare review with [`/finalize_worktree`](finalize_worktree.md), and integrate with [`/merge_worktree`](merge_worktree.md). After a successful squash merge, retire this feature branch. Start the next task in a new worktree from updated main rather than continuing the old branch's history.
