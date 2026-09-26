---
name: add_worktree
description: Create a ready-to-run Loudmouth sibling worktree with its own feature branch, dependencies, remote-accessible API URL, isolated web/API/test ports, and a three-pane tmux window. Use when the user requests /add_worktree or asks to start a parallel worktree.
disable-model-invocation: true
---

# Add a Loudmouth worktree

Run only on an explicit user request. Do not merge, commit, or push as part of creation. The helper starts OMP and both dev servers in a new tmux window.

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
   Require the `loudmouth` tmux session and `omp` executable before creating a worktree; the helper checks both and fails before mutation if either is unavailable.
2. Run the bundled helper from a checkout of this repository using Python 3:

   ```text
   python3 <skill-directory>/scripts/add_worktree.py <short-name> [--id XYZ]
   ```

   Resolve `<skill-directory>` to this file's actual directory. Use argument arrays or proper shell quoting; never interpolate arbitrary task prose into shell code.
3. The helper reserves allocation with a lock in the shared Git directory, checks registered worktrees, sibling directories, branches, and all three ports, and creates a new worktree. Never bypass a lock or collision. Port checks are advisory until launch; strict server startup catches subsequent collisions.
4. The helper installs dependencies separately with `npm ci` in `web/app` and `api/src`. Never symlink `node_modules`, build output, local configuration, or live databases between worktrees.
5. Local configuration is generated, not inherited wholesale:
   - `web/app/.env.local`: `VITE_DEV_PORT=XYZ0`, `VITE_API_URL=http://tiny:XYZ1`, and `PLAYWRIGHT_PORT=XYZ2`. `tiny` is the API host's Tailscale MagicDNS name; remote clients must be on the tailnet and able to reach it.
   - `api/.env.local`: `PORT=XYZ1`.
   - Only the main checkout's ignored, untracked `api/.env` may be copied into the new worktree, with private permissions. This is the approved credential-file allowlist. Never print its contents, add it to Git, or copy other secret files automatically. Existing machine-level Google application-default credentials are not duplicated.
   - Do not copy main's web `.env.local`: it can route requests to the wrong worktree. If additional local overrides are needed, obtain explicit approval for the keys/files first.

6. After installation the helper creates a detached window named `loudmouth-XYZ-short-name` in tmux session `loudmouth`: left pane runs `omp` from the worktree root, upper-right runs `env __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=tiny npm run dev` from `web/app`, and lower-right runs `npm run dev` from `api/src`. The web command explicitly allows the advertised MagicDNS host through Vite's process-environment override, including when local `main` predates the `server.allowedHosts: ['tiny']` config. Do not set `allowedHosts: true`; keep other hosts blocked. This override must be in the process environment, not just `.env.local`. Inspect the panes for startup failures; successful tmux command dispatch does not guarantee server readiness. If window setup fails, the worktree is retained for recovery.
7. Confirm success output names the actual directory, branch, base commit, all three ports, and tmux window. After web startup, verify `curl --noproxy '*' -H 'Host: tiny:XYZ0' http://127.0.0.1:XYZ0/` returns the app rather than Vite's blocked-host response; listening on a port alone is insufficient. Check that the new worktree is clean and the generated environment files are ignored. If credentials were absent, report that API startup/configuration may still need `api/.env` or existing process credentials; do not fabricate credentials or make paid API calls.

## Working in parallel

The helper starts `omp` and both dev servers in the tmux window. For manual restarts, use:

- `<new-worktree>/api/src`: `npm run dev`
- `<new-worktree>/web/app`: `env __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=tiny npm run dev`
- `<new-worktree>/web/app`: `npm run test:e2e` (separate `XYZ2` preview port; never reuses another worktree's server)

Use the reported `http://tiny:XYZ0` web origin from remote machines (or `http://localhost:XYZ0` locally); the web app contacts `http://tiny:XYZ1`. Ports isolate browser IndexedDB, localStorage, and service-worker scope. Do not reuse the main checkout's browser origin for feature testing. The helper-owned tmux panes own their server processes: inspect their output before relying on readiness, and do not start duplicate servers via a separate supervisor. Never kill a process merely because it occupies a desired port.

The allowlist adds only `tiny`; Vite's normal localhost and IP-address access remains available. If repairing an existing checkout, add `tiny` to `server.allowedHosts` in `web/app/vite.config.js`, or restart its web pane with the process-environment command above. Verify both HTTP 200 for `Host: tiny` and HTTP 403 for an unrelated hostname; never solve this error by disabling host validation.

The helper leaves a partially created worktree intact on installation/configuration failure and reports its path. Repair that worktree and rerun only the failed setup step; do not blindly rerun creation, delete it, or claim it is ready. A leftover allocation lock requires checking its owner before removing it.

After a successful squash merge, retire this feature branch. Start the next task in a new worktree from updated main rather than continuing the old branch's history.
