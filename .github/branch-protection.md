# Branch Protection Policy

Apply these settings to `main` and any release branch through the GitHub UI.

## Required Status Checks

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

Do not require these until they are intentionally promoted:

- `Playwright E2E Advisory`
- `Course picker screenshots`
- `ci/circleci: ios-compile`
- `lighthouse-preview`
- CircleCI weekly radar jobs

## Other Settings

- Require branches to be up to date before merging: **ON**
- Require linear history: **ON**
- Require pull request reviews before merging: **ON**, 1 approval minimum
- Dismiss stale pull request approvals when new commits are pushed: **ON**
- Restrict who can push to matching branches: **ON** for admins only
- Do not allow bypassing the above settings: **ON**
- Require conversation resolution before merging: **ON**

## Change Rule

When a workflow job name changes, update this file and `docs/operations/BRANCH_PROTECTION.md` in the same PR.

## Verification

After applying branch protection, open a PR that intentionally breaks a unit test and confirm merge is blocked by `Unit tests`.
