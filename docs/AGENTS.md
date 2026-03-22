# Ralph Agent Instructions

## Overview

Ralph is an autonomous AI agent loop that runs AI coding tools (Amp or Claude Code) repeatedly until all tasks for a given project are complete. Each iteration is a fresh instance with clean context.


## Patterns

- Each iteration spawns a fresh AI instance (Amp or Claude Code) with clean context
- Memory persists via the project's `progress.txt`, and `prd.json` files
- Tasks should be small enough to complete in one context window
- Always update AGENTS.md with discovered patterns for future iterations