# Branch Protection Policy (apply via GitHub UI)

Apply these settings to `main` (and any release branch):

## Required status checks

- `build` (from `ci.yml` build job — includes typecheck, lint, vitest, next build)
- `Supabase lint + RLS tests` (from `ci.yml` supabase job, added in Plan 01)
- `Review Gate / all` (from `review-gate.yml` — aggregates ast-grep, semgrep,
  gitleaks, actionlint, yamllint, shellcheck, markdownlint, ruff+pylint,
  sqlfluff, hadolint — mirrors the AI reviewers' pre-merge gate so merges
  are blocked even if either reviewer is offline)
- `CodeRabbit` (the bot's own status check — assertive review, blocking
  custom checks defined in `.coderabbit.yaml`)
- `Greptile` (the bot's own status check — whole-codebase review,
  hard rules defined in `.greptile/instructions.md`; enable in the
  Greptile dashboard at https://app.greptile.com after installing the
  GitHub App on this repo)
- `ci/circleci: ios-compile` (from `.circleci/config.yml` — iOS
  Capacitor compile on M-series macOS; required only for branches
  that touch `ios/**` or `capacitor.config.ts`). Leave as a
  non-blocking check until you're ready to enforce green iOS on
  every iOS-touching PR.
- `Playwright (chromium)` — from `.github/workflows/playwright.yml`. Wraps
  failures with `|| echo` for now (suite-stabilization phase). Flip to a
  hard `npm run test:e2e` and add as a required status check once the
  suite has been green for a week. Closes Plan 02 Task 9.
- `lighthouse-preview` (CircleCI) — runs Lighthouse against the Vercel
  preview URL on every push. a11y + CLS asserts are hard errors. Add as
  a required check after first green run.

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
