# Branch Protection Policy (apply via GitHub UI)

Apply these settings to `main` (and any release branch):

## Required status checks

- `build` (from `ci.yml` build job — includes typecheck, lint, vitest, next build)
- `Supabase lint + RLS tests` (from `ci.yml` supabase job, added in Plan 01)
- `Review Gate / all` (from `review-gate.yml` — aggregates ast-grep, semgrep,
  gitleaks, actionlint, yamllint, shellcheck, markdownlint, ruff+pylint,
  sqlfluff, hadolint — mirrors CodeRabbit's pre-merge gate so merges are
  blocked even if CodeRabbit is offline)
- `CodeRabbit` (the bot's own status check — assertive review, blocking
  custom checks defined in `.coderabbit.yaml`)
- `Playwright E2E` — to be added in a follow-up to Plan 02 Task 9 (CI workflow currently does not run Playwright)

## Other settings

- Require branches to be up to date before merging: **ON**
- Require linear history: **ON** (or rebase-only — team preference)
- Require pull request reviews before merging: **ON**, 1 approval minimum
- Dismiss stale pull request approvals when new commits are pushed: **ON**
- Restrict who can push to matching branches: **ON** (admins only)
- **Do not allow bypassing the above settings: ON** (no admin bypass)

## Why this matters

The 2026-05-17 audit found the test suite was red (17 files / 50 specs failing)
but CI claimed green — either branch protection wasn't requiring the test
check, or admin bypass was permitted. These settings close that gap.

## Verification

After applying:

```bash
# Open a PR that intentionally breaks a test; confirm merge is blocked.
gh pr create --title "test(branch-protection): verify red CI blocks merge" --body "Intentional failure."
# Push a commit that breaks vitest.
# Confirm "build" appears as a Required check that hasn't passed.
# Close the PR without merging.
```

If merge is allowed despite a failing check, the protection rule isn't
configured correctly.
