# Branch Protection Policy (apply via GitHub UI)

Apply these settings to `main` (and any release branch):

## Required status checks

Require aggregate checks instead of every leaf job. Leaf jobs still run and
remain visible on PRs, but branch protection depends on stable aggregate names
so a job split/rename does not silently break protection.

> ### ⚠️ WHAT IS ACTUALLY ENFORCED — verified live 2026-07-30
>
> ```bash
> gh api repos/njrini99-code/helmv3/branches/main/protection \
>   -q '.required_status_checks | {strict, contexts}'
> # => {"strict": true, "contexts": ["CodeQL", "all", "Smoke checks"]}
> ```
>
> **THREE contexts, and the names are bare** — `all`, not `CI / all`. That matters,
> because **both `ci.yml` and `review-gate.yml` define a job named `all`**, so the
> single required context `all` cannot distinguish them. On PR #1125 a check-runs
> query returned `all → success` while the `BaseballHelm authenticated smoke` job
> that CI's `all` `needs` was still `in_progress` — the green was Review Gate's, and
> the smoke then failed. This is very likely how a PR with failing `Unit tests`
> merged on 2026-07-29. See `docs/CI_RUNBOOK.md` §1 for the CI-run-scoped query to
> use instead of trusting the name.
>
> **Fixing it needs both halves at once:** rename one aggregate job AND update
> `required_status_checks` in the same change. Renaming alone leaves protection
> waiting forever for a context named `all` that no longer exists, which blocks
> every PR.
>
> `CodeRabbit` is **no longer required** (dropped 2026-07-20). The bullet below is
> kept struck through rather than deleted so the change is visible to anyone
> re-applying these settings from this file.

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
  - `BaseballHelm authenticated smoke` (coach + player, #372) — as of PR #1125
    this seeds a throwaway Supabase stack on the runner instead of production, so
    it needs **no repo secrets** and therefore **no longer skips** on
    fork/Dependabot PRs. Before that change it skipped (did not fail) on those
    runs, because they receive no secrets from GitHub by design — and a required
    gate that silently skipped for a whole class of PR was a hole in it
- `Review Gate / all` — hard aggregate for ast-grep, semgrep, gitleaks,
  actionlint, yamllint, shellcheck, markdownlint, ruff+pylint, sqlfluff, and
  hadolint.
- `Playwright E2E / Smoke checks` — hard smoke build check on pull requests
  and `main` pushes (`playwright.yml`: `npm ci` + `next build`). The full
  `Playwright (chromium)` suite runs on `main` pushes and manual
  `workflow_dispatch` only and remains advisory.
- `CodeQL` — GitHub code-scanning status.
- ~~`CodeRabbit` — CodeRabbit's own status check, with assertive review,
  pre-merge checks, issue enrichment, and auto-planning configured in
  `.coderabbit.yaml`.~~ **DROPPED 2026-07-20** by founder decision and removed
  from the required set: its credit quota had become the slowest step in shipping,
  and the Review Gate + CodeQL cover the same hard rules deterministically.
  `.coderabbit.yaml` is now a disable stub. The custom rule packs under
  `.coderabbit/ast-grep/` and `.coderabbit/semgrep/` REMAIN — CI consumes them
  directly — so treat that directory name as historical. The GitHub App itself
  still needs an owner uninstall.

Advisory checks:

- `Vercel` and `Vercel Preview Comments` (non-main preview builds skipped —
  see `docs/operations/COST_CONTROLS.md`)
- ~~`Greptile Review`~~ — **DELETED 2026-07-20**; `.greptile/` is gone.
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

**HISTORICAL (both AI reviewers were dropped 2026-07-20).** `Greptile Review` was
intentionally advisory, not required: its `.greptile/config.json` skipped
`dependabot`-titled PRs, so it never posted a passing status on them, and making it
a required context would have left every Dependabot PR permanently un-mergeable
without an admin override. CodeRabbit was the blocking AI reviewer.

The reasoning is kept because it generalises — **a check that structurally cannot
report on a class of PR must not be a required context.** The same trap applied to
`BaseballHelm authenticated smoke` while it needed repo secrets: it skipped on
fork/Dependabot PRs, which meant a *required* gate silently waved through a whole
class of change. PR #1125 removed the secret dependency and with it the skip, rather
than leaving the hole in place.

Today neither AI reviewer is a gate: the deterministic Review Gate (ast-grep,
semgrep, gitleaks, actionlint, yamllint, shellcheck, markdownlint, ruff+pylint,
sqlfluff, hadolint) plus CodeQL cover the same hard rules and report on every PR.

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
