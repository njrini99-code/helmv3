---
description: Create a task worktree through the one door and report its path
---

`/worktree <task>` — create a worktree for `<task>` through the sole door:

```bash
scripts/new-worktree.sh <task>
```

Never `git worktree add`, `git checkout -b`, or `git switch -c` by hand —
the door supplies `--no-track`, the mutation-budget check, and the
`.helm/workspace.json` stamp the lifecycle tool relies on.

If the door refuses because `HELM_MAX_MUTATION_WORKTREES` is exceeded, report
the budget value and the verdict table from `npm run worktrees` — do not
override it, do not remove another worktree to make room without the user
saying so.

If the new worktree needs dependencies, run:

```bash
node scripts/ensure-worktree-deps.mjs <worktree-path>
```

On success, print the worktree path and branch (`~/worktrees/helmv3/<task>`,
`agent/<task>`) from the script's own summary line — do not guess the path.
