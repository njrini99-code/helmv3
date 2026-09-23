# INC-2026-09-04 — sandboxed `npm run dev` logged Ready while serving nothing

- Feature: `feature_awareness_system`

## What happened

`npm run dev` inside the Bash sandbox flooded
`Watchpack Error (watcher): Error: EMFILE: too many open files, watch`
(the sandbox's own fd limit, not the shell's `ulimit -n`), then looped
deleting and recreating `.next/dev`, each time logging
`✓ Ready in 133ms`. The log said READY. `curl localhost:3000` said
`Empty reply from server`, then `Failed to connect`.

## Root cause

The obvious diagnosis — a second dev server fighting over `.next/` — was
checked via `lsof -a -p <pid> -d cwd` and ruled out; the other `next`
processes found were in unrelated worktrees with their own `.next` and were
innocent. The sandbox's file-watch limits were the actual cause.

## Fix / where it lives now

`.claude/rules/shipping.md` requires running `npm run dev` with
`dangerouslyDisableSandbox: true` and `curl`ing it before reporting the
server as up — the log alone cannot distinguish a genuinely serving process
from this failure mode.
