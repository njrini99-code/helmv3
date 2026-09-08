---
description: Create an isolated task workspace when concurrent writes need one
---

Follow AGENTS.md for workspace ownership. If this task needs isolation, run
`scripts/new-worktree.sh <task>` and report the actual path and branch.
The default checkout-count warning is advisory. An explicitly configured
cap and the disk reserve remain enforced. Do not delete another task to
make room. Work in the existing checkout on disjoint files when appropriate.
Install dependencies only when they are needed and incompatible or missing.
