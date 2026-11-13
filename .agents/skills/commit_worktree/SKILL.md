---
name: commit_worktree
description: "Commit the current work in a Catchphrase feature worktree: remove temporary files, mark finished todos done, update affected wiki pages, run the docs check and fast tests, commit explicit paths and append to worktree.md. Use only when the user requests /commit_worktree. Never pushes, amends or commits on main."
disable-model-invocation: true
---

Read `docs/skills/commit_worktree.md` from the repository root and follow it. Resolve it against the repository root even when invoked from a subdirectory.
