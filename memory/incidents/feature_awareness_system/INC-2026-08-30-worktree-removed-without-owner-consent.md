# INC-2026-08-30 — `--retire` removed a concurrent session's OPEN-PR worktree

- Feature: `feature_awareness_system`

## What happened

`worktree-lifecycle.mjs --retire` removed `agent/round-type-reclassify`
(PR #1681, OPEN and owned by a different, concurrently running session) on
the basis that it was clean, its tip matched the pushed remote, and no
process's cwd was visible to `lsof`. Nothing was lost — parking keeps the
branch — but the checkout had an owner the tool had no way to know about.

## Root cause

`lsof +D` samples one instant. A session between two tool calls has no
visible cwd, so `hasLiveProcess == false` was read as proof of inactivity
when it proves nothing — only `hasLiveProcess == true` is a sound signal.

## Fix / where it lives now

Two independent gates now apply before any automatic park/retire: an OPEN
PR is parkable only if `config/open-pr-dispositions.json` records
`PARK_IF_REPRODUCIBLE` for it, and a checkout is disposable only if its own
`.helm/workspace.json` says `parkPolicy: "PARK_IF_REPRODUCIBLE"` —
`new-worktree.sh` always writes `KEEP`. Documented in `AGENTS.md`'s Helm
agent canonicality section.
