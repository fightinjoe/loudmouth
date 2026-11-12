#!/usr/bin/env bash
# Start a long-running command (dev server, API, preview) in a visible tmux pane of the caller's
# window: below the bottom-right pane, or in a new right-hand pane when the window has only one
# column. The pane keeps an interactive shell, so Ctrl-C stops the server and leaves the pane open.
#
# Usage: scripts/tmux-server.sh <working-dir> <command> [args...]
# Example: scripts/tmux-server.sh web/app npm run dev
# Prints the new pane id. Exits 2 outside tmux; the caller then runs the server another way.
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <working-dir> <command> [args...]" >&2
  exit 64
fi
if [[ -z "${TMUX:-}" || -z "${TMUX_PANE:-}" ]]; then
  echo "tmux-server: not inside tmux (TMUX/TMUX_PANE unset)" >&2
  exit 2
fi

dir=$(cd "$1" && pwd)
shift
printf -v command '%q ' "$@"

window=$(tmux display-message -p -t "$TMUX_PANE" '#{session_name}:#{window_index}')
# Right column = panes that touch the right edge and do not start at the left edge.
target=$(tmux list-panes -t "$window" -F '#{pane_id} #{pane_left} #{pane_at_right} #{pane_at_bottom}' |
  awk '$2 > 0 && $3 == 1 && $4 == 1 { print $1; exit }')

if [[ -n "$target" ]]; then
  pane=$(tmux split-window -v -d -t "$target" -c "$dir" -P -F '#{pane_id}')
else
  pane=$(tmux split-window -h -d -t "$TMUX_PANE" -c "$dir" -P -F '#{pane_id}')
fi

tmux send-keys -t "$pane" -- "$command" Enter
echo "$pane"
