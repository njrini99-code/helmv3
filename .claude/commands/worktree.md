---
description: Create an isolated task workspace when concurrent writes need one
---

Follow AGENTS.md "Workspace and Git"; `docs/operations/WORKSPACES.md` has the
detail. If other sessions may be writing, make your own checkout, then report
the actual path and branch. Otherwise work in the current one; in a quiet
canonical checkout on `main` you can branch in place.

- **One command:** `scripts/new-worktree.sh <task>` creates `agent/<task>` under
  `~/worktrees/helmv3/<task>` from `origin/main` (`--base <ref>` to branch from
  something else, `--reattach` to bring back a parked branch, `--keep` to stop
  the sweep parking it). Do not use a raw `git worktree add`: it skips the
  marker and the checks.
- **`node_modules`:** every checkout gets its own APFS clone of the deps store
  entry for its lockfile (about 25 MB, 10-20 s). Never share or symlink one. A
  lockfile with no store entry costs one `npm ci`, which fills the store for
  every later checkout.
- **The only hard refusal is disk:** creation stops with `DISK_LOW` when under
  12 GiB is free. Free space with `npm run worktrees` (report), then
  `npm run worktrees:park` or `worktrees:retire`; do not delete another
  session's folder or branch to make room.
- **The checkout count is advice.** At 6 or more, creation prints a warning and
  carries on; nothing refuses unless `HELM_MAX_MUTATION_WORKTREES` is set.
- **Cleanup:** `npm run worktrees` reports, `worktrees:park` removes disposable
  checkouts and keeps their branches, `worktrees:retire` also deletes branches
  proven merged. `npm run pr:land -- <n>` retires the branch it just merged.
