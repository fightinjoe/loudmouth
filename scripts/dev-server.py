#!/usr/bin/env python3
"""Start the web or API dev server of a checkout in a visible tmux pane and wait until it is ready.

Usage: python3 scripts/dev-server.py {web,api} [--checkout DIR] [--timeout SECONDS]

The checkout defaults to the one containing the current directory (main or a feature worktree).
Ports come from the checkout's own settings: web `VITE_DEV_PORT` in `web/app/.env.local` (else the
`vite.config.js` default 8000); API `PORT` in `api/.env.local`, then `api/.env` (else 8080).

The pane is placed by `scripts/tmux-server.sh` in the window of a tmux pane that belongs to the
checkout (normally its OMP pane), else in the caller's window. A server of this checkout that is
already listening is reused, not restarted; a port held by anything else is an error, never killed.

Exit codes: 0 ready (started or reused), 1 failed or not ready, 2 no tmux pane to use, 64 usage.
"""

from __future__ import annotations

import argparse
import http.client
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import time
from urllib.parse import urlparse

WEB_DEFAULT_PORT = 8000  # vite.config.js parsePort fallback
API_DEFAULT_PORT = 8080  # Functions Framework default
WEB_COMMAND = ["env", "__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=tiny", "npm", "run", "dev"]
API_COMMAND = ["npm", "run", "dev"]


class Failure(RuntimeError):
    def __init__(self, message: str, code: int = 1) -> None:
        super().__init__(message)
        self.code = code


def run(*args: str, check: bool = True) -> str:
    result = subprocess.run(args, capture_output=True, text=True)
    if check and result.returncode:
        raise Failure(f"{' '.join(args)} failed: {result.stderr.strip() or result.returncode}")
    return result.stdout.strip()


def read_env(path: Path, key: str) -> str | None:
    """Return one key from a dotenv file without reading or printing anything else."""
    if not path.is_file():
        return None
    pattern = re.compile(rf"^\s*(?:export\s+)?{re.escape(key)}\s*=\s*(.*?)\s*$")
    for line in path.read_text().splitlines():
        match = pattern.match(line)
        if match:
            return match.group(1).strip("'\"") or None
    return None


def port_value(value: str | None, default: int, source: str) -> int:
    if value is None:
        return default
    if not value.isdigit() or not 0 < int(value) < 65536:
        raise Failure(f"{source} is not a valid port: {value!r}")
    return int(value)


def inside(path: str, root: Path) -> bool:
    return path == str(root) or path.startswith(f"{root}/")


def listeners(port: int) -> list[tuple[int, str]]:
    """PIDs listening on a TCP port with each process's working directory."""
    pids = run("lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t", check=False).split()
    found = []
    for pid in sorted({int(p) for p in pids}):
        cwd = next((l[1:] for l in run("lsof", "-a", "-p", str(pid), "-d", "cwd", "-Fn", check=False).splitlines() if l.startswith("n")), "?")
        found.append((pid, cwd))
    return found


def anchor_pane(root: Path) -> str | None:
    if run("tmux", "list-sessions", check=False) == "":
        return None
    caller = os.environ.get("TMUX_PANE")
    panes = [line.split("\t") for line in run("tmux", "list-panes", "-a", "-F", "#{pane_id}\t#{session_name}\t#{pane_current_path}").splitlines()]
    paths = {pane: path for pane, _, path in panes}
    if caller and inside(paths.get(caller, ""), root):
        return caller
    at_root = [p for p in panes if p[2] == str(root)]
    at_root.sort(key=lambda p: p[1] != "loudmouth")
    if at_root:
        return at_root[0][0]
    within = [p for p in panes if inside(p[2], root)]
    if within:
        return within[0][0]
    return caller


def http_status(port: int, host: str) -> int | None:
    try:
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
        connection.request("GET", "/", headers={"Host": host})
        status = connection.getresponse().status
        connection.close()
        return status
    except OSError:
        return None


def ready(kind: str, port: int, root: Path) -> str | None:
    """None when ready, else the reason it is not."""
    owned = [cwd for _, cwd in listeners(port) if inside(cwd, root)]
    if not owned:
        return f"nothing from this checkout listens on {port}"
    if kind == "api":
        return None
    tiny, other = http_status(port, f"tiny:{port}"), http_status(port, "blocked.invalid")
    if tiny != 200:
        return f"Host tiny:{port} returned {tiny}"
    if other != 403:
        return f"an unrelated Host returned {other}, expected 403"
    return None


def lan_addresses() -> list[str]:
    output = run("ifconfig", check=False)
    return [a for a in re.findall(r"^\s*inet (\d+\.\d+\.\d+\.\d+)", output, re.M) if not a.startswith("127.")]


def api_warning(root: Path) -> str | None:
    url = read_env(root / "web/app/.env.local", "VITE_API_URL")
    if url is None:
        return "VITE_API_URL is unset: the web app calls the deployed API Gateway."
    parsed = urlparse(url)
    if parsed.port is None:
        return None
    if not run("lsof", "-nP", f"-iTCP:{parsed.port}", "-sTCP:LISTEN", "-t", check=False):
        return f"the web app calls {url}, but nothing listens on port {parsed.port}; start the API with /ajw_start_api_server."
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("kind", choices=["web", "api"])
    parser.add_argument("--checkout", default=".", help="any directory inside the checkout (default: current directory)")
    parser.add_argument("--timeout", type=float, default=90, help="seconds to wait for readiness (default 90)")
    args = parser.parse_args()

    root = Path(run("git", "-C", args.checkout, "rev-parse", "--show-toplevel")).resolve()
    if args.kind == "web":
        directory = root / "web/app"
        port = port_value(read_env(directory / ".env.local", "VITE_DEV_PORT"), WEB_DEFAULT_PORT, "web/app/.env.local VITE_DEV_PORT")
        command = WEB_COMMAND
    else:
        directory = root / "api/src"
        local = read_env(root / "api/.env.local", "PORT")
        port = port_value(local or read_env(root / "api/.env", "PORT"), API_DEFAULT_PORT, "api PORT")
        command = API_COMMAND
    if not (directory / "node_modules").is_dir():
        raise Failure(f"{directory.relative_to(root)}/node_modules is missing; run npm ci there first")

    held = listeners(port)
    foreign = [(pid, cwd) for pid, cwd in held if not inside(cwd, root)]
    if foreign:
        pid, cwd = foreign[0]
        raise Failure(f"port {port} is held by pid {pid} (cwd {cwd}), not this checkout; it was not stopped")

    pane = None
    if held:
        print(f"Reusing the {args.kind} server already running from this checkout on port {port}.")
    else:
        anchor = anchor_pane(root)
        if anchor is None:
            raise Failure(f"no tmux pane to place the server in; run `{' '.join(command)}` in {directory} as a named background service", 2)
        script = Path(__file__).resolve().parent / "tmux-server.sh"
        pane = run(str(script), "-t", anchor, str(directory), *command)
        print(f"Started {args.kind} server in tmux pane {pane} ({run('tmux', 'display-message', '-p', '-t', pane, '#{session_name}:#{window_name}')}).")

    deadline = time.monotonic() + args.timeout
    reason = ready(args.kind, port, root)
    while reason and time.monotonic() < deadline:
        time.sleep(1)
        reason = ready(args.kind, port, root)
    if reason:
        if pane:
            print(run("tmux", "capture-pane", "-p", "-t", pane, "-S", "-30", check=False), file=sys.stderr)
        raise Failure(f"{args.kind} server not ready after {args.timeout:g}s: {reason}")

    print(f"Ready: {args.kind} on port {port} from {root}")
    print(f"  http://localhost:{port}/")
    print(f"  http://tiny:{port}/")
    for address in lan_addresses():
        print(f"  http://{address}:{port}/")
    if args.kind == "web" and (warning := api_warning(root)):
        print(f"Note: {warning}")
    print("Stop it with Ctrl-C in its pane." if pane else "Stop it with Ctrl-C in the pane that runs it.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Failure as failure:
        print(f"dev-server: {failure}", file=sys.stderr)
        raise SystemExit(failure.code)
