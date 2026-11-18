---
kind: skill
status: current
summary: Start the web app dev server for the current checkout or a worktree in a placed tmux pane, verify it and report its URLs.
sources: [scripts/dev-server.py, scripts/tmux-server.sh, web/app/vite.config.js]
verified: 2026-11-17
---

# Start the web server

Use when the user asks to run, start or view the web app, or when verification needs it running. It applies the server rules in [`AGENTS.md`](../../AGENTS.md#local-servers) to the web app.

Supporting scripts: `scripts/dev-server.py` (starts, reuses and verifies the server) and `scripts/tmux-server.sh` (places the pane).

## Run

```text
python3 scripts/dev-server.py web [--checkout <dir>] [--timeout <seconds>]
```

Run it from the repository root of the checkout to serve, or pass `--checkout` with the worktree path. The script:

1. Reads the port from `web/app/.env.local` (`VITE_DEV_PORT`; a worktree gets `XYZ0` from [`/add_worktree`](add_worktree.md)), else the `vite.config.js` default 8000.
2. Reuses a server of this checkout already listening on that port. A port held by any other process is an error; it never stops that process. Report the owner and ask the user.
3. Otherwise opens a pane with `scripts/tmux-server.sh` in the window of a tmux pane that belongs to the checkout (normally its OMP pane), else in your own window: below the bottom-right pane, or as a new right-hand column. It runs `env __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=tiny npm run dev` in `web/app`, which runs `predev` and uses the configured port.
4. Waits until a request with `Host: tiny:<port>` returns 200 and an unrelated host returns 403. `vite.config.js` already allows `tiny`; the environment override keeps older checkouts working and must stay in the process environment, not `.env.local`. Never set `allowedHosts: true`.
5. Prints the localhost, `tiny` and LAN URLs, and a note when `VITE_API_URL` points at a local API that is not running, or is unset. The client has no hosted fallback: with `VITE_API_URL` unset, generation is unavailable until the [online generation inputs](../web/development.md#online-generation-configuration) are set.

Exit 0 means ready. Exit 1 prints the pane's last lines: fix the cause (missing `node_modules`: run `npm ci` in `web/app`, or `add_worktree.py install` for a worktree) and rerun. Exit 2 means there is no tmux pane to use: run the same command as a named background service in `web/app` and tell the user how to stop it.

## Then

- If the note says the local API is down and the work needs it, run [`/ajw_start_api_server`](ajw_start_api_server.md).
- Report the URLs and that Ctrl-C in the pane stops the server. `/finalize_worktree` stops worktree servers.
