# INC-2026-08-16 — two agents, one `git checkout -b`, wrong-branch commit

- Feature: `feature_awareness_system`

## What happened

Two agents were dispatched in parallel into the canonical checkout and each
was told to `git checkout -b`. The second checkout moved `HEAD` out from
under the first, which was mid-edit. Nothing errored — the work simply
landed on the wrong branch. A follow-up `git add -A` then swept the other
agent's half-finished files into a commit on the wrong branch too.

## Root cause

Every agent spawned into this repo shares one checkout: one `HEAD`, one
index, one file set. Raw `git checkout -b` calls from concurrent agents are
not isolated from each other.

## Fix / where it lives now

`.claude/rules/autonomy.md` requires picking Serialize or per-agent
worktrees before dispatching more than one agent, and `git add <explicit
paths>` (never `-A`) in either mode. Worktrees now come only through
`scripts/new-worktree.sh`, the one door.
