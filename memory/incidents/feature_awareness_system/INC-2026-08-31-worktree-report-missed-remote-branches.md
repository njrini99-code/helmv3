# INC-2026-08-31 — worktree lifecycle report enumerated local branches only

- Feature: `feature_awareness_system`

## What happened

`worktree-lifecycle.mjs` enumerated `refs/heads` only. A branch whose local
copy had been pruned — every branch merged with `--delete-branch`, plus
anything pushed from another machine — was invisible to it. Measured that
day: three such branches existed, one a PR MERGED for days, while the
report said "0 branches to delete" and GitHub's branch list still showed it.

## Impact

A cleanup tool that cannot see the residue it exists to remove reports
success at having looked at the wrong place.

## Fix / where it lives now

The tool now reports on remote branches as well as local ones, and remote
deletion carries its own verdict (`DELETE_REMOTE`, a `git push origin
--delete`) rendered separately from `DELETE_BRANCH` — one is recoverable
from the reflog, the other is not. It also refuses to present a total
PR-lookup outage as a clean `0`, exiting `INFRASTRUCTURE_FAILURE` instead.
