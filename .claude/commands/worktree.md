---
description: Create an isolated task workspace when concurrent writes need one
---

Follow AGENTS.md "Workspace and Git". If other sessions may be writing, run
`scripts/new-worktree.sh <task>` and report the actual path and branch;
otherwise work in the current checkout. In a quiet canonical checkout on `main`
you can branch in place, or work on disjoint files. The checkout-count warning
is advice; the disk reserve is real, so share `node_modules` and install
dependencies only when they are missing or incompatible. Do not delete another
session's folder or branch to make room.
