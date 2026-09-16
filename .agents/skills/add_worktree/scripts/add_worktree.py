#!/usr/bin/env python3
"""Create a port-isolated Loudmouth worktree from the local main checkout."""

from __future__ import annotations

import argparse
import contextlib
import errno
import os
from pathlib import Path
import re
import secrets
import shlex
import shutil
import socket
import stat
import subprocess
import sys
import time
from typing import Iterator


SLUG_RE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
WORKTREE_ID_RE = re.compile(r"loudmouth-(\d{3})(?:-|$)")
BRANCH_ID_RE = re.compile(r"refs/heads/feat/(\d{3})(?:-|$)")
MIN_ID = 103
MAX_ID = 999
CHROMIUM_RESTRICTED_IDS = {
    172: (1720,),
    506: (5060, 5061),
    600: (6000,),
}
LOCK_NAME = "loudmouth-add-worktree.lock"


class SetupError(RuntimeError):
    pass


def slug(value: str) -> str:
    if not SLUG_RE.fullmatch(value):
        raise argparse.ArgumentTypeError(
            "short-name must be a lowercase slug (letters/digits joined by single hyphens)"
        )
    return value


def worktree_id(value: str) -> int:
    if not re.fullmatch(r"\d{3}", value):
        raise argparse.ArgumentTypeError("--id must be exactly three digits")
    number = int(value)
    if not MIN_ID <= number <= MAX_ID:
        raise argparse.ArgumentTypeError(f"--id must be between {MIN_ID} and {MAX_ID}")
    if number in CHROMIUM_RESTRICTED_IDS:
        ports = ", ".join(str(port) for port in CHROMIUM_RESTRICTED_IDS[number])
        raise argparse.ArgumentTypeError(
            f"--id {number:03d} is unavailable because Chromium restricts port(s) {ports}"
        )
    return number


def git(repo: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[bytes]:
    try:
        result = subprocess.run(
            ["git", "-C", os.fspath(repo), *args],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
    except FileNotFoundError as exc:
        raise SetupError("git is not installed or is not on PATH") from exc
    if check and result.returncode:
        detail = result.stderr.decode(errors="replace").strip()
        message = f"git {' '.join(args)} failed"
        if detail:
            message += f": {detail}"
        raise SetupError(message)
    return result


def worktree_records(repo: Path) -> list[dict[str, str]]:
    raw = git(repo, "worktree", "list", "--porcelain", "-z").stdout
    records: list[dict[str, str]] = []
    record: dict[str, str] = {}
    for field in raw.split(b"\0"):
        if not field:
            if record:
                records.append(record)
                record = {}
            continue
        key, separator, value = field.partition(b" ")
        record[key.decode("ascii")] = os.fsdecode(value) if separator else ""
    if record:
        records.append(record)
    return records


def main_checkout(records: list[dict[str, str]]) -> Path:
    matches = [record.get("worktree") for record in records if record.get("branch") == "refs/heads/main"]
    if len(matches) != 1 or matches[0] is None:
        raise SetupError(
            "expected exactly one registered worktree with local main checked out; "
            f"found {len(matches)}"
        )
    checkout = Path(matches[0]).resolve()
    if not checkout.is_dir():
        raise SetupError(f"registered main checkout is not an accessible directory: {checkout}")
    return checkout


def common_git_dir(repo: Path) -> Path:
    output = git(repo, "rev-parse", "--path-format=absolute", "--git-common-dir").stdout
    return Path(os.fsdecode(output).rstrip("\n")).resolve()


@contextlib.contextmanager
def allocation_lock(common_dir: Path) -> Iterator[None]:
    lock_path = common_dir / LOCK_NAME
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    flags |= getattr(os, "O_CLOEXEC", 0)
    try:
        descriptor = os.open(lock_path, flags, 0o600)
    except FileExistsError as exc:
        raise SetupError(
            f"allocation lock already exists at {lock_path}; another setup may be running. "
            "Verify the owning process before removing it manually; this helper never removes "
            "an existing or potentially stale lock."
        ) from exc
    except OSError as exc:
        raise SetupError(f"cannot create allocation lock {lock_path}: {exc}") from exc

    try:
        os.fchmod(descriptor, 0o600)
        details = f"pid={os.getpid()}\nstarted={time.strftime('%Y-%m-%dT%H:%M:%S%z')}\n"
        os.write(descriptor, details.encode())
        owned = os.fstat(descriptor)
        try:
            yield
        finally:
            current = os.stat(lock_path, follow_symlinks=False)
            if (current.st_dev, current.st_ino) != (owned.st_dev, owned.st_ino):
                raise SetupError(
                    f"allocation lock changed while held and was not removed: {lock_path}"
                )
            os.unlink(lock_path)
    except BaseException:
        try:
            current = os.stat(lock_path, follow_symlinks=False)
            opened = os.fstat(descriptor)
            if (current.st_dev, current.st_ino) == (opened.st_dev, opened.st_ino):
                os.unlink(lock_path)
        except FileNotFoundError:
            pass
        raise
    finally:
        os.close(descriptor)


def git_path(repo: Path, name: str) -> Path:
    output = git(
        repo, "rev-parse", "--path-format=absolute", "--git-path", name
    ).stdout
    return Path(os.fsdecode(output).rstrip("\n"))


def require_safe_main(main: Path) -> None:
    operations = (
        ("merge", "MERGE_HEAD"),
        ("cherry-pick", "CHERRY_PICK_HEAD"),
        ("revert", "REVERT_HEAD"),
        ("rebase", "rebase-merge"),
        ("rebase", "rebase-apply"),
        ("sequenced cherry-pick/revert", "sequencer"),
    )
    active = sorted({label for label, marker in operations if os.path.lexists(git_path(main, marker))})
    if active:
        raise SetupError(f"main checkout has an in-progress {'/'.join(active)} operation")

    status_output = git(
        main, "status", "--porcelain=v1", "-z", "--untracked-files=all"
    ).stdout
    if status_output:
        raise SetupError("main checkout is not clean (tracked or untracked changes are present)")


def is_tracked(repo: Path, relative_path: str) -> bool:
    return bool(git(repo, "ls-files", "-z", "--", relative_path).stdout)


def is_ignored(repo: Path, relative_path: str) -> bool:
    result = git(
        repo,
        "check-ignore",
        "--quiet",
        "--no-index",
        "--",
        relative_path,
        check=False,
    )
    if result.returncode not in (0, 1):
        detail = result.stderr.decode(errors="replace").strip()
        raise SetupError(f"could not verify ignore rule for {relative_path}: {detail}")
    return result.returncode == 0


def require_untracked_and_ignored(repo: Path, relative_path: str) -> None:
    if is_tracked(repo, relative_path):
        raise SetupError(f"refusing to write tracked local environment file: {relative_path}")
    if not is_ignored(repo, relative_path):
        raise SetupError(f"local environment file is not ignored by git: {relative_path}")


def add_used_id(used: dict[int, set[str]], name: str, pattern: re.Pattern[str], reason: str) -> None:
    match = pattern.match(name)
    if match:
        number = int(match.group(1))
        if MIN_ID <= number <= MAX_ID:
            used.setdefault(number, set()).add(reason)


def used_ids(
    main: Path, common_dir: Path, records: list[dict[str, str]]
) -> dict[int, set[str]]:
    used: dict[int, set[str]] = {}
    for record in records:
        path = record.get("worktree")
        if path:
            add_used_id(
                used,
                Path(path).name,
                WORKTREE_ID_RE,
                "registered worktree name",
            )

    administrative_dir = common_dir / "worktrees"
    if administrative_dir.is_dir():
        with os.scandir(administrative_dir) as entries:
            for entry in entries:
                add_used_id(
                    used,
                    entry.name,
                    WORKTREE_ID_RE,
                    "git worktree identifier",
                )

    with os.scandir(main.parent) as entries:
        for entry in entries:
            add_used_id(
                used,
                entry.name,
                WORKTREE_ID_RE,
                "existing sibling path",
            )

    branches = git(main, "for-each-ref", "--format=%(refname)", "refs/heads").stdout
    for branch in branches.decode(errors="surrogateescape").splitlines():
        add_used_id(used, branch, BRANCH_ID_RE, "local branch identifier")
    return used


def reserve_ports(number: int) -> tuple[list[socket.socket], list[str]]:
    held: list[socket.socket] = []
    problems: list[str] = []
    addresses = [(socket.AF_INET, "127.0.0.1", "IPv4")]
    if socket.has_ipv6:
        addresses.append((socket.AF_INET6, "::1", "IPv6"))

    for port in (number * 10, number * 10 + 1, number * 10 + 2):
        checked = 0
        for family, address, label in addresses:
            sock: socket.socket | None = None
            try:
                sock = socket.socket(family, socket.SOCK_STREAM)
                if family == socket.AF_INET6 and hasattr(socket, "IPV6_V6ONLY"):
                    try:
                        sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
                    except OSError:
                        pass
                sock.bind((address, port))
                held.append(sock)
                checked += 1
            except OSError as exc:
                if sock is not None:
                    sock.close()
                if exc.errno in (errno.EAFNOSUPPORT, errno.EPROTONOSUPPORT, errno.EADDRNOTAVAIL):
                    continue
                problems.append(f"{label} localhost port {port} is unavailable")
        if checked == 0 and not any(f"port {port} " in problem for problem in problems):
            problems.append(f"no localhost address was available to verify port {port}")

    if problems:
        for sock in held:
            sock.close()
        return [], problems
    return held, []


def choose_id(
    requested: int | None, used: dict[int, set[str]]
) -> tuple[int, list[socket.socket]]:
    if requested is not None:
        reasons = sorted(used.get(requested, ()))
        if reasons:
            raise SetupError(f"ID {requested:03d} collides with: {', '.join(reasons)}")
        sockets, problems = reserve_ports(requested)
        if problems:
            raise SetupError(f"ID {requested:03d} collides with: {'; '.join(problems)}")
        return requested, sockets

    candidates = list(range(MIN_ID, MAX_ID + 1))
    secrets.SystemRandom().shuffle(candidates)
    for candidate in candidates:
        if candidate in used or candidate in CHROMIUM_RESTRICTED_IDS:
            continue
        sockets, problems = reserve_ports(candidate)
        if not problems:
            return candidate, sockets
    raise SetupError(
        f"no unused worktree ID with free localhost ports was found in {MIN_ID}..{MAX_ID}; "
        "Chromium-restricted IDs 172, 506, and 600 were excluded"
    )


def secure_write(path: Path, contents: bytes) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    flags |= getattr(os, "O_CLOEXEC", 0)
    descriptor = os.open(path, flags, 0o600)
    with os.fdopen(descriptor, "wb") as destination:
        os.fchmod(destination.fileno(), 0o600)
        destination.write(contents)


def secure_copy(source: Path, destination: Path) -> None:
    source_flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0)
    source_flags |= getattr(os, "O_NOFOLLOW", 0)
    source_descriptor = os.open(source, source_flags)
    try:
        if not stat.S_ISREG(os.fstat(source_descriptor).st_mode):
            raise SetupError(f"credential source is not a regular file: {source}")
        destination_flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        destination_flags |= getattr(os, "O_CLOEXEC", 0)
        destination_descriptor = os.open(destination, destination_flags, 0o600)
        with os.fdopen(destination_descriptor, "wb") as target_file:
            os.fchmod(target_file.fileno(), 0o600)
            with os.fdopen(source_descriptor, "rb", closefd=False) as source_file:
                shutil.copyfileobj(source_file, target_file)
    finally:
        os.close(source_descriptor)


def npm_ci(directory: Path) -> None:
    print(f"Running npm ci in {directory}", flush=True)
    try:
        result = subprocess.run(["npm", "ci"], cwd=directory, check=False)
    except FileNotFoundError as exc:
        raise SetupError("npm is not installed or is not on PATH") from exc
    if result.returncode:
        raise SetupError(f"npm ci failed in {directory} (exit status {result.returncode})")


def setup(short_name: str, requested_id: int | None) -> dict[str, object]:
    script_checkout = Path(__file__).resolve().parents[4]
    initial_records = worktree_records(script_checkout)
    initial_main = main_checkout(initial_records)
    common_dir = common_git_dir(script_checkout)

    target: Path | None = None
    branch: str | None = None
    add_attempted = False
    try:
        with allocation_lock(common_dir):
            records = worktree_records(script_checkout)
            main = main_checkout(records)
            if common_git_dir(main) != common_dir or main != initial_main:
                raise SetupError("main worktree registration changed while acquiring the allocation lock")
            require_safe_main(main)
            if (common_dir / "loudmouth-merge.lock").exists():
                raise SetupError("main is reserved by an active worktree integration lock")
            base_commit = git(main, "rev-parse", "refs/heads/main").stdout.decode().strip()

            for local_file in ("web/app/.env.local", "api/.env.local"):
                require_untracked_and_ignored(main, local_file)

            credential_source = main / "api" / ".env"
            credentials_present = os.path.lexists(credential_source)
            if credentials_present:
                if not stat.S_ISREG(os.lstat(credential_source).st_mode):
                    raise SetupError(
                        f"credential source must be a regular, non-symlink file: {credential_source}"
                    )
                require_untracked_and_ignored(main, "api/.env")

            identifiers = used_ids(main, common_dir, records)
            number, held_sockets = choose_id(requested_id, identifiers)
            try:
                target = main.parent / f"loudmouth-{number:03d}-{short_name}"
                branch = f"feat/{number:03d}-{short_name}"
                main_real = main.resolve()
                target_real = target.resolve(strict=False)
                if target_real.parent != main_real.parent or target_real == main_real:
                    raise SetupError(f"target must be a sibling outside main: {target}")
                try:
                    target_real.relative_to(main_real)
                except ValueError:
                    pass
                else:
                    raise SetupError(f"target must be outside main: {target}")
                if os.path.lexists(target):
                    raise SetupError(f"target already exists: {target}")

                branch_check = git(main, "check-ref-format", "--branch", branch, check=False)
                if branch_check.returncode:
                    raise SetupError(f"generated branch name is invalid: {branch}")
                if git(main, "show-ref", "--verify", "--quiet", f"refs/heads/{branch}", check=False).returncode == 0:
                    raise SetupError(f"branch already exists: {branch}")

                add_attempted = True
                git(
                    main,
                    "worktree",
                    "add",
                    "-b",
                    branch,
                    os.fspath(target),
                    base_commit,
                )

                web_env = (
                    f"VITE_DEV_PORT={number}0\n"
                    f"VITE_API_URL=http://100.113.73.51:{number}1\n"
                    f"PLAYWRIGHT_PORT={number}2\n"
                ).encode()
                api_env = f"PORT={number}1\n".encode()
                secure_write(target / "web" / "app" / ".env.local", web_env)
                secure_write(target / "api" / ".env.local", api_env)
                if credentials_present:
                    secure_copy(credential_source, target / "api" / ".env")

                npm_ci(target / "web" / "app")
                npm_ci(target / "api" / "src")
            finally:
                for held_socket in held_sockets:
                    held_socket.close()

            return {
                "main": main,
                "target": target,
                "branch": branch,
                "base_commit": base_commit,
                "id": number,
                "credentials_present": credentials_present,
            }
    except BaseException:
        if add_attempted and target is not None and os.path.lexists(target):
            print(f"Worktree retained for recovery: {target}", file=sys.stderr)
            if branch:
                print(f"Branch retained: {branch}", file=sys.stderr)
            print(
                "After resolving the failure, continue setup with:\n"
                f"  (cd {shlex.quote(os.fspath(target / 'web' / 'app'))} && npm ci)\n"
                f"  (cd {shlex.quote(os.fspath(target / 'api' / 'src'))} && npm ci)",
                file=sys.stderr,
            )
        raise


def print_result(result: dict[str, object]) -> None:
    main = result["main"]
    target = result["target"]
    branch = result["branch"]
    number = result["id"]
    assert isinstance(main, Path)
    assert isinstance(target, Path)
    assert isinstance(branch, str)
    assert isinstance(number, int)

    print("Isolated worktree ready:")
    print(f"  Main checkout: {main}")
    print(f"  Worktree: {target}")
    print(f"  Branch: {branch}")
    print(f"  Base main commit: {result['base_commit']}")
    print(f"  Web app: {target / 'web' / 'app'}")
    print(f"  API: {target / 'api' / 'src'}")
    print("Ports:")
    print(f"  Web: {number}0")
    print(f"  API: {number}1")
    print(f"  Playwright: {number}2")
    print(f"Environment: {target / 'web' / 'app' / '.env.local'}")
    print(f"Environment: {target / 'api' / '.env.local'}")
    if result["credentials_present"]:
        print(f"API credentials copied privately to {target / 'api' / '.env'}")
    else:
        print(f"API credentials absent: main had no api/.env; create {target / 'api' / '.env'} before starting the API")
    print("Start commands (servers were not started):")
    print(f"  (cd {shlex.quote(os.fspath(target / 'web' / 'app'))} && npm run dev)")
    print(f"  (cd {shlex.quote(os.fspath(target / 'api' / 'src'))} && npm run dev)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("short_name", type=slug, metavar="short-name")
    parser.add_argument(
        "--id",
        type=worktree_id,
        dest="requested_id",
        metavar="XYZ",
        help=(
            "three-digit ID in 103..999; 172, 506, and 600 are excluded because "
            "their derived ports are restricted by Chromium"
        ),
    )
    return parser.parse_args()


def main() -> int:
    arguments = parse_args()
    try:
        result = setup(arguments.short_name, arguments.requested_id)
    except KeyboardInterrupt:
        print("error: interrupted; no automatic rollback was attempted", file=sys.stderr)
        return 130
    except (SetupError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print_result(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
