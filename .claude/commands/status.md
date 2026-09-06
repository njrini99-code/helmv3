---
description: Repo/branch/worktree/control-plane health, summarized in under ten lines
---

`/status` — run each of the following, capture to a file, and report the exit
code observed (never inferred from output):

```bash
set -o pipefail; git rev-parse --abbrev-ref HEAD | tee /tmp/status-branch.txt; echo "exit=$?"
set -o pipefail; npm run release:status 2>&1 | tee /tmp/status-release.txt; echo "exit=$?"
set -o pipefail; npm run worktrees 2>&1 | tee /tmp/status-worktrees.txt; echo "exit=$?"
set -o pipefail; npm run doctor 2>&1 | tee /tmp/status-doctor.txt; echo "exit=$?"
set -o pipefail; npm run control-plane:verify 2>&1 | tee /tmp/status-controlplane.txt; echo "exit=$?"
```

Summarize in under ten lines: current branch, one line each for release
status / worktree verdicts / doctor / control-plane:verify (pass, fail, or
the specific check that failed), and nothing else. Point at the captured
file for detail instead of pasting full output.
