---
description: Land a PR through the sole landing script and report the result
---

`/land <pr>` — merge and clean up PR `<pr>` through the one door:

```bash
npm run pr:land -- <pr>
```

Confirm the intended PR, its current head, and required checks before landing.
Follow AGENTS.md authorization. Prefer this script for merge, canonical sync,
and retirement; use a direct authorized GitHub merge only when necessary and
never bypass required checks with `--admin`.

Report the actual merge, sync, and retirement outcomes separately. On failure,
report the command exit code and preserve the task's branch and files.
