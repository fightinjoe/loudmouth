#!/usr/bin/env bash
# Start a long-running command (dev server, API, preview) in a visible tmux pane: below the
# bottom-right pane of the window, or in a new right-hand pane when the window has only one
# column. The pane keeps an interactive shell, so Ctrl-C stops the server and leaves the pane open.
#
# Usage: scripts/tmux-server.sh [-t <pane>] <working-dir> <command> [args...]
#   -t <pane>  place the server in this pane's window (for example a worktree's OMP pane) instead
#              of the caller's window; works from outside tmux while the tmux server runs.
# Example: scripts/tmux-server.sh web/app npm run dev
# Prints the new pane id. Exits 2 when there is no anchor pane (outside tmux and no -t); the caller
# then runs the server another way.
set -euo pipefail

anchor="${TMUX_PANE:-}"
if [[ "${1:-}" == "-t" ]]; then
  anchor="${2:?-t needs a pane id}"
  shift 2
fi
if [[ $# -lt 2 ]]; then
  echo "usage: $0 [-t <pane>] <working-dir> <command> [args...]" >&2
  exit 64
fi
if [[ -z "$anchor" ]]; then
  echo "tmux-server: not inside tmux (TMUX_PANE unset) and no -t pane given" >&2
  exit 2
fi

dir=$(cd "$1" && pwd)
shift
printf -v command '%q ' "$@"

window=$(tmux display-message -p -t "$anchor" '#{session_name}:#{window_id}')
# Right column = panes that touch the right edge and do not start at the left edge.
target=$(tmux list-panes -t "$window" -F '#{pane_id} #{pane_left} #{pane_at_right} #{pane_at_bottom}' |
  awk '$2 > 0 && $3 == 1 && $4 == 1 { print $1; exit }')

if [[ -n "$target" ]]; then
  pane=$(tmux split-window -v -d -t "$target" -c "$dir" -P -F '#{pane_id}')
else
  pane=$(tmux split-window -h -d -p 35 -t "$anchor" -c "$dir" -P -F '#{pane_id}')
fi

tmux send-keys -t "$pane" -- "$command" Enter
echo "$pane"
