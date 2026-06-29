# Helm Repo Operating System

## Current Work

Current work lives in GitHub:

- GitHub Issues: tasks, bugs, features, cleanup, DB/RLS work.
- GitHub Project: priority and status.
- Pull Requests: implementation review and merge readiness.

Do not treat `.helm/ACTIONS.md`, `.helm/ISSUES.md`, old audit reports, or one-off markdown plans as live queues unless a current GitHub issue points to them.

## Repo Knowledge

Use these files to understand the system:

- `memory/registry.yml`: maps files to feature docs and checks.
- `memory/features/*.md`: current-state feature behavior.
- `memory/context/*.md`: database, product, and platform context.
- `docs/current/*.md`: high-level command center.
- `docs/operations/*.md`: gates, runbooks, and hot files.
- `AGENTS.md` and `CLAUDE.md`: agent workflow rules.

## Gate Rules

- Normal code changes are not done until `npm run verify` passes or the blocker is named.
- Database-sensitive work should run `npm run verify:db`.
- Broad/high-risk work should run `npm run verify:full`.
- Do not update `.lint-baseline.json` just to pass CI. Use `npm run lint:ratchet:update` only after warning counts intentionally decrease or an explicit cleanup decision is made.
- Playwright Smoke is a hard gate; the full Playwright suite is advisory until stabilized.

## Agent Work Orders

Agent-safe work should include:

- Objective.
- Feature registry key.
- Allowed files.
- Forbidden files.
- Required docs to read.
- Required commands.
- Acceptance criteria.
- Out-of-scope notes.

Use `.github/ISSUE_TEMPLATE/agent-task.yml` for this.

## Historical Material

- `docs/audits/`: historical reports and findings.
- `docs/operations/`: runbooks and incident history that may still matter.
- `archive/old-task-systems/`: retired task systems.
- `.helm/`: legacy Helm Intelligence output. Useful context, not current truth.
