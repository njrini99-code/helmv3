# Saved workflows

Scripts the Workflow tool runs by name (`/helm-review`, `/helm-fix-ci`). Each is
plain JavaScript beginning with `export const meta`. They spawn the repo's own
agent definitions (`helm-reader` for read-only stages, `helm-worker` for stages
that edit inside a worktree) and never merge, deploy, or touch production.

- `helm-review.js` — five-dimension review of a PR (`/helm-review 1875`) or the
  working-tree diff (no args), each finding adversarially verified by three
  independent readers; two refutations kill a finding.
- `helm-fix-ci.js` — for each PR number passed, diagnose the red check from the
  job logs and fix only that in the PR's own worktree, then push.

Running a workflow is an explicit opt-in (it can spawn dozens of agents); the
Workflow tool asks unless the user said "use a workflow" or ran the slash name.
