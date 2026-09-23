# INC-2026-09-02 — runner-slot starvation forced a CI job consolidation

- Feature: `feature_awareness_system`

## What happened

Roughly 47 check runs were firing per PR against a runner pool that behaves
like 20 concurrent job slots, starving PRs of runners and stalling checks
well past their expected wait windows.

## Fix / where it lives now

Every tool except semgrep was moved to run as a named step of one
`Review Gate checks` job instead of its own job (semgrep keeps its pinned
container job); the aggregate reads `steps.*.outcome` so one failing tool
still cannot hide another. `ci.yml` made the same move (`Static checks`,
`Lint`). Twelve jobs became three; nothing stopped running.
`.claude/rules/code-review-tooling.md` and `.claude/rules/quality-gates.md`
describe the current shape; `docs/CI_RUNBOOK.md` has rerun commands.
