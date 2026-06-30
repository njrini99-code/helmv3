# Branch Protection Policy (apply via GitHub UI)

Apply these settings to `main` (and any release branch):

## Required status checks

Require aggregate checks instead of every leaf job. Leaf jobs still run and
remain visible on PRs, but branch protection depends on stable aggregate names
so a job split/rename does not silently break protection.

- `CI / all` — hard aggregate for:
  - `Database types drift`
  - `Schema invariants`
  - `Feature knowledge`
  - `TypeScript`
  - `ESLint`
  - `Lint ratchet`
  - `Unit tests`
  - `Business contracts`
  - `Next build`
  - `Route Hygiene P0/P1`
- `Review Gate / all` — hard aggregate for ast-grep, semgrep, gitleaks,
  actionlint, yamllint, shellcheck, markdownlint, ruff+pylint, sqlfluff, and
  hadolint.
- `Playwright E2E / Smoke checks` — hard smoke build check. The full
  `Playwright (chromium)` suite remains advisory until it is stable enough to
  fail hard.
- `CodeQL` — GitHub code-scanning status.
- `CodeRabbit` — CodeRabbit's own status check, with assertive review,
  pre-merge checks, issue enrichment, and auto-planning configured in
  `.coderabbit.yaml`.

Advisory checks:

- `Vercel` and `Vercel Preview Comments`
- `Greptile Review`
- `Qodo Ticket Context / Ticket references`
- `ci/circleci: lighthouse-preview`
- `Playwright (chromium)`
- `Course picker screenshots`
- `migration-lockdown / block-historical-edits`
- `Supabase lint + RLS tests` — temporarily advisory: the baseball pgTAP RLS
  suite is red on `main`; its fix lands in PR #423. Promote back into the
  `CI / all` aggregate once that suite is green on `main`.

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
# Confirm `CI / all` appears as a Required check that has not passed.
# Close the PR without merging.
```

If merge is allowed despite a failing check, the protection rule isn't
configured correctly.
