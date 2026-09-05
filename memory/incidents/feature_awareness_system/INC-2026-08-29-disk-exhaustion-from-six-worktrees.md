# INC-2026-08-29 — six worktrees in one day ran the volume to zero free bytes

- Feature: `feature_awareness_system`

## What happened

One session created six worktrees, ran the lifecycle tool six times, and it
printed "retirable" six times — but retirement was report-only with owner
approval required, and nothing ever invoked it. Volume hit zero bytes free
before anyone acted; at that point no command could run at all, because
even writing a command's output needs disk.

## Root cause

An approval-gated cleanup step that nobody has time to act on before the
next worktree is created is not a safety net, it is a queue that never
drains.

## Fix / where it lives now

`--retire` now carries standing owner authorization for anything the tool
itself verdicts PARKABLE, and for branch deletion under `DELETE_MERGED_EXACT`
— no human approval step in between. `HELM_MAX_MUTATION_WORKTREES` (default
3) also caps how many mutation workspaces can exist at once, refusing new
ones before they're created. Both live in `scripts/worktree-lifecycle.mjs`
and `scripts/new-worktree.sh`, documented in `AGENTS.md`.
