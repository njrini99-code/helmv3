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
  - `Supabase lint + RLS tests`
  - `BaseballHelm authenticated smoke` (coach + player, #372) — skips (does
    not fail) on fork/Dependabot PRs, which receive no repo secrets from
    GitHub by design
- `Review Gate / all` — hard aggregate for ast-grep, semgrep, gitleaks,
  actionlint, yamllint, shellcheck, markdownlint, ruff+pylint, sqlfluff, and
  hadolint.
- `Playwright E2E / Smoke checks` — hard smoke build check on pull requests
  and `main` pushes (`playwright.yml`: `npm ci` + `next build`). The full
  `Playwright (chromium)` suite runs on `main` pushes and manual
  `workflow_dispatch` only and remains advisory.
- `CodeQL` — GitHub code-scanning status.
- `CodeRabbit` — CodeRabbit's own status check, with assertive review,
  pre-merge checks, issue enrichment, and auto-planning configured in
  `.coderabbit.yaml`.

Advisory checks:

- `Vercel` and `Vercel Preview Comments` (non-main preview builds skipped —
  see `docs/operations/COST_CONTROLS.md`)
- `Greptile Review`
- `ci/circleci: lighthouse-preview`
- `Playwright PR smoke (a11y)` — public routes only, path-filtered within PRs
- `Playwright (chromium)` — main + manual only
- `Course picker screenshots` — manual `workflow_dispatch` only
- `BaseballHelm seeded smoke (advisory)` — main + manual only
- `migration-lockdown / block-historical-edits`

`Supabase lint + RLS tests` was promoted from advisory into the hard
`CI / all` aggregate once the baseball pgTAP RLS suite went green on `main`
(#517, supersedes #423). RLS regressions now block merge.

`BaseballHelm authenticated smoke` (the `baseball-auth-smoke` job in
`ci.yml`) was promoted the same way (#372): the coach/player smoke suite
(`e2e/baseball-smoke.spec.ts` + `e2e/baseball-onboarding-smoke.spec.ts`) and
its fail-loud auth setup already existed and ran on every `main` push via
`playwright.yml`'s `e2e` job, but only post-merge — a real authenticated
regression could land on `main` before this ever ran. `ci.yml` now runs the
same specs (steps copied, not moved) as a required PR gate. It skips rather
than fails on fork/Dependabot PRs (no repo secrets available to them);
same-repo, non-Dependabot pushes and PRs must have the required secrets
configured or the job fails loudly. Note the added cost: a second full
`npm run build` + Playwright-chromium install on every same-repo,
non-Dependabot PR, on top of the existing `Next build` / `Smoke checks`
builds.

`Greptile Review` is intentionally advisory, not a required check: Greptile's
`.greptile/config.json` skips `dependabot`-titled PRs, so it never posts a
passing `Greptile Review` on them — making it a required context would leave
every Dependabot PR permanently un-mergeable without an admin override.
CodeRabbit is the blocking AI reviewer.

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
