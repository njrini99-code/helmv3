# Helm Docs Index

Start with `docs/current/README.md`.

## Active Docs

- `docs/current/`: current repo command center.
- `docs/operations/`: CI, gates, branch protection, hot files, runbooks.
- `memory/registry.yml`: feature routing map for changed files.
- `memory/features/`: current-state feature behavior.
- `memory/context/`: domain and database context.

## Historical Docs

- `docs/audits/`: audit reports and findings.
- `docs/plans/`: plans that may be superseded by current GitHub issues.
- `docs/legacy/root-docs/`: older root-level audits, plans, reviews, and reports moved out of the repo root.
- `docs/legacy/full-review/`: older `.full-review/` audit workspace.
- `docs/legacy/full-stack-feature/`: older `.full-stack-feature/` planning workspace.
- `docs/legacy/full-review-2026-05-17-golfhelm-audit/`: tracked state from the May 17 GolfHelm audit workspace.
- `docs/redesign/`: redesign research and visual artifacts.
- `docs/baseballhelm_revolution_plan_v2/`: large BaseballHelm planning archive.
- `archive/`: retired reports and task systems.

## Rule

If a doc describes current behavior, keep it concise and link it from `docs/current/` or `memory/registry.yml`.

If a doc describes what happened, what was considered, or what used to be true, keep it historical and do not use it as the current work queue.
