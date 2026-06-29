# Branch Protection

Required checks for `main` should match the hard blockers in `docs/operations/GATE_MATRIX.md`.

## Required GitHub Actions Checks

- `Database types drift`
- `Schema invariants`
- `Feature knowledge`
- `TypeScript`
- `ESLint`
- `Lint ratchet`
- `Unit tests`
- `Next build`
- `Supabase lint + RLS tests`
- `Playwright Smoke / Smoke checks`
- `Review Gate / all`
- `CodeRabbit`

## Advisory Checks

Do not require these until they are stable enough to block everyday work:

- `Playwright E2E Advisory`
- `Course picker screenshots`
- CircleCI weekly radar jobs
- Lighthouse preview jobs

## Change Rule

When a required check changes name, update this file in the same PR as the workflow change.

## Current Repository Settings

- Require branches to be up to date before merging: **ON**
- Require linear history: **ON**
- Require pull request reviews before merging: **ON**, 1 approval minimum
- Dismiss stale pull request approvals when new commits are pushed: **ON**
- Require conversation resolution before merging: **ON**
- Include administrators: **ON**
