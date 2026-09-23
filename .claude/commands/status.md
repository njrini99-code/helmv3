---
description: Repo/branch/worktree/control-plane health, summarized in under ten lines
---

`/status` — run each of the following, capture to a file, and report the exit
code observed (never inferred from output):

```bash
D=$(mktemp -d)
set -o pipefail; git rev-parse --abbrev-ref HEAD | tee $D/status-branch.txt; echo "exit=$?"
set -o pipefail; npm run release:status 2>&1 | tee $D/status-release.txt; echo "exit=$?"
set -o pipefail; npm run worktrees 2>&1 | tee $D/status-worktrees.txt; echo "exit=$?"
set -o pipefail; npm run doctor 2>&1 | tee $D/status-doctor.txt; echo "exit=$?"
set -o pipefail; npm run control-plane:verify 2>&1 | tee $D/status-controlplane.txt; echo "exit=$?"
```

Summarize in under ten lines: current branch, one line each for release
status / worktree verdicts / doctor / control-plane:verify (pass, fail, or
the specific check that failed), and nothing else. Point at the captured
file for detail instead of pasting full output.
