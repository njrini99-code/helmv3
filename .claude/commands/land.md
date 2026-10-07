---
description: Land a PR through the sole landing script and report the result
---

`/land <pr>` — merge and clean up PR `<pr>` through the one door:

```bash
npm run pr:land -- <pr>
```

Check the PR's head and that its required checks are green, then land it (a red
`CI aggregate` on a draft PR is expected; mark it ready first). Prefer this
script for merge, canonical sync and worktree retirement. Fix red checks
instead of bypassing them.

The script lands `agent/*` branches; pass `--any-branch` for another branch.
Merging does not deploy (AGENTS.md "Production"): deploy afterwards if the
change should be live.

Report the merge, sync and retirement outcomes separately. On failure, report
the exit code and keep the task's branch and files.
