---
kind: skill
status: current
summary: Start the local API dev server for the current checkout or a worktree in a placed tmux pane, verify it is listening and report its URLs.
sources: [scripts/dev-server.py, scripts/tmux-server.sh, api/src/dev.js]
verified: 2026-11-12
---

# Start the API server

Use when the user asks to run or start the local API, or when the web app or a verification step needs it. It applies the server rules in [`AGENTS.md`](../../AGENTS.md#local-servers) to the API.

Supporting scripts: `scripts/dev-server.py` (starts, reuses and verifies the server) and `scripts/tmux-server.sh` (places the pane).

## Run

```text
python3 scripts/dev-server.py api [--checkout <dir>] [--timeout <seconds>]
```

Run it from the repository root of the checkout to serve, or pass `--checkout` with the worktree path. The script:

1. Reads the port from `api/.env.local` (`PORT`; a worktree gets `XYZ1` from [`/add_worktree`](add_worktree.md)), then `api/.env`, else the Functions Framework default 8080. Only the `PORT` line is read; credentials are never printed.
2. Reuses a server of this checkout already listening on that port. A port held by any other process is an error; it never stops that process. Report the owner and ask the user.
3. Otherwise opens a pane with `scripts/tmux-server.sh` in the window of a tmux pane that belongs to the checkout (normally its OMP pane), else in your own window: below the bottom-right pane, or as a new right-hand column. It runs `npm run dev` in `api/src`, which builds the shared schema (`predev`) and loads `api/.env` then `api/.env.local` ([API operations](../api/operations.md#local-development)).
4. Waits until a process from this checkout listens on the port, then prints the localhost, `tiny` and LAN URLs.

Exit 0 means ready. Exit 1 prints the pane's last lines: fix the cause (missing `node_modules`: run `npm ci` in `api/src`, or `add_worktree.py install` for a worktree; missing credentials: `api/.env`) and rerun. Exit 2 means there is no tmux pane to use: run `npm run dev` in `api/src` as a named background service and tell the user how to stop it.

## Then

- Listening is not a working request path. Do not make paid model calls to check it unless the user authorizes them.
- The API does not watch files: after changing API source, prompts or the shared schema, stop it with Ctrl-C in its pane and run this skill again.
- Report the URLs and that Ctrl-C in the pane stops the server. `/finalize_worktree` stops worktree servers.
