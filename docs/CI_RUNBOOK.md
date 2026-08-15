# CI Runbook — Triaging Pending / Red PR Checks

> Closes #390. Use this when a PR shows pending or failing checks and you
> need to know: is this a real blocker, a transient queue, or a failure
> inherited from `main`? And if it's stuck, how do I rerun it?

This runbook is operational guidance only. `.github/branch-protection.md` is
the authoritative source of truth for which checks are actually enforced —
if the two ever disagree, branch protection wins and this doc should be
updated.

## 1. Status classification — hard gate vs. advisory

**THREE** required contexts are actually enforced on `main` — read live from the
API, not from this table:

```bash
gh api repos/njrini99-code/helmv3/branches/main/protection \
  -q '.required_status_checks | {strict, contexts}'
# => {"strict": true, "contexts": ["CodeQL", "all", "Smoke checks"]}
```

`CodeRabbit` **is no longer one of them** — dropped by founder decision on
2026-07-20 and removed from the required set (the app itself still needs an owner
uninstall). This section said "four … including CodeRabbit" until 2026-07-30.

> ### ⚠️ `all` IS AMBIGUOUS, AND A GREEN `all` DOES NOT MEAN CI PASSED
>
> `ci.yml` and `review-gate.yml` **both** define a job named `all`, so both emit a
> check run named `all` — and `all` is a required context. GitHub cannot tell them
> apart by name.
>
> **Observed on PR #1125, 2026-07-30:** a check-runs query scoped to the head commit
> returned `all → success` while `BaseballHelm authenticated smoke`, a job that
> CI's `all` explicitly `needs`, was still `in_progress`. The green was **Review
> Gate's**. That smoke job then **failed**, and CI's `all` failed with it. A
> name-based readiness check reads green before CI has finished, and can read green
> while CI is red.
>
> This is the most likely explanation for a PR with failing **Unit tests** merging on
> 2026-07-29. Note `Unit tests` is *not* a required context by name — it is required
> only transitively, because CI's `all` job `needs` it.
>
> **Never decide "ready to merge" from a check named `all`.** Resolve the PR's head
> SHA, find the run whose `.name == "CI"`, and read that run's own jobs:
>
> ```bash
> sha=$(gh pr view <PR> --json headRefOid -q .headRefOid)
> rid=$(gh api "repos/njrini99-code/helmv3/actions/runs?head_sha=$sha&per_page=50" \
>         -q '[.workflow_runs[]|select(.name=="CI")][0].id')
> gh api "repos/njrini99-code/helmv3/actions/runs/$rid/jobs?per_page=60" \
>   -q '.jobs[]|"\(.conclusion // .status)\t\(.name)"'
> ```
>
> To identify which workflow a given check run came from, read its `html_url` — it
> contains the run id.
>
> **Fixing this needs the repo owner, so do not do it unilaterally.** Renaming
> either job changes its check-run name, and branch protection would then wait
> forever for a context named `all` that no longer exists — blocking every PR. The
> rename and the `required_status_checks` update have to land together.

| Check | Source | What it validates | Gate type |
|---|---|---|---|
| `all` (CI) | `ci.yml` | aggregate: DB-types drift, schema invariants, feature knowledge, typecheck, ESLint, lint-ratchet, unit tests, business contracts, `next build`, route hygiene, **Supabase lint + RLS tests**, **BaseballHelm authenticated coach/player smoke (#372)** | **Hard gate** — but see the ambiguity warning above: this shares the required context name `all` with the Review Gate job below, so a green `all` may not be this one |
| `all` (Review Gate) | `review-gate.yml` | aggregate: ast-grep, semgrep, gitleaks, actionlint, yamllint, shellcheck, markdownlint, ruff+pylint, sqlfluff, hadolint | **Hard gate** — same shared name; verify which workflow reported |
| `Smoke checks` | `playwright.yml` (PRs + main push) | build-only smoke: `npm ci` + `next build` (no full E2E) | **Hard gate** |
| `Playwright PR smoke (a11y)` | `pr-smoke.yml` | public-route accessibility Playwright only when frontend/e2e paths change | Advisory |
| `CodeRabbit` | CodeRabbit GitHub App | ~~assertive line-level review + blocking custom checks~~ | **DROPPED 2026-07-20** — removed from the required set by founder decision; `.coderabbit.yaml` is a disable stub. If a `CodeRabbit` status still appears, it is informational. The custom rule packs under `.coderabbit/` REMAIN and are consumed directly by the Review Gate. |
| `CodeQL` | `codeql.yml` | code-scanning security analysis | **Hard gate** |
| `Greptile Review` | Greptile GitHub App | ~~whole-codebase review~~ | **DROPPED 2026-07-20** — `.greptile/` is deleted. Neither external AI reviewer is a gate any more; the deterministic Review Gate + CodeQL cover the same hard rules. |
| `Playwright (chromium)` / `Course picker screenshots` / `BaseballHelm seeded smoke` | `playwright.yml` | full E2E (mandatory Baseball smoke + mobile-viewport regression + broader chromium suite) — **main push + manual `workflow_dispatch` only** (not PRs) | Advisory on main; manual for feature branches. **Note:** `Playwright (chromium)`'s broader-suite step no longer masks its exit code (`|| echo ...` removed) — a red run here now means a real failure, not just "see artifact." |
| `ci/circleci: lighthouse-preview` | CircleCI | Lighthouse against the Vercel preview URL; usually skips when no preview exists (non-main Vercel builds disabled) | Advisory |
| `ci/circleci: ios-compile` | CircleCI | iOS Capacitor compile, only relevant when `ios/**` / `capacitor.config.ts` changed | Advisory unless the PR touches iOS |
| `migration-lockdown / block-historical-edits` | `migration-lockdown.yml` | blocks edits to already-applied migrations | Advisory |
| `Vercel` / `Vercel Preview Comments` | Vercel | production deploy on `main` only; non-main branches skip build (`scripts/vercel-ignore-build.sh`) | Advisory (informational) |

## 2. Expected wait windows

Don't treat a check as "stuck" before its normal window has passed:

- **Vercel** — **nothing** builds automatically, `main` included. `vercel.json`
  has carried `"git": {"deploymentEnabled": {"*": false}}` since 2026-07-08
  (#789 / `d29deea4`); production is an on-demand CLI promote. Do not wait on a
  Vercel check that is never coming, and do not read a merge to `main` as a
  ship. CircleCI Lighthouse skips accordingly, since no preview URL exists.
  (This bullet said "only `main` builds automatically" until 2026-08-15 —
  five weeks after that stopped being true.)
- **CodeRabbit / Greptile** — gone. Dropped 2026-07-20 by founder decision;
  see `.claude/rules/code-review-tooling.md`. There is no AI review on a PR,
  so their absence is never a pending check. The Review Gate + CodeQL cover
  the same hard rules deterministically.
- **PR smoke** (`pr-smoke.yml`) — `Smoke checks` build ~15 min; optional
  `Playwright PR smoke (a11y)` ~12 min when frontend/e2e paths change.
- **Full Playwright** (`playwright.yml`, main + manual only) — `e2e` job
  75-minute budget; `picker-screenshots` and `baseball-smoke` 20 minutes each;
  main-push `Smoke checks` 15 minutes.
- **`CI / all`'s `baseball-auth-smoke` job (#372)** — 30-minute budget. It
  installs Playwright chromium, runs a full `npm run build`, seeds BaseballHelm
  CI accounts, then runs the mandatory coach/player smoke. Separate from — and in
  addition to — the broader `Smoke checks` build.

  **This job's target changed on 2026-07-30 (PR #1125).** Before: it seeded
  **production** using repo secrets, and **skipped** on fork/Dependabot PRs because
  those receive no secrets — so a skip there was expected, not stuck. After: it
  stands up a throwaway Supabase stack on the runner
  (`.github/actions/local-supabase-stack`) and seeds that, needs **no secrets**, and
  therefore **no longer skips for anyone**. Budget in practice: ~17 min for a clean
  run (`supabase start` ≈ 1m45s, `npm run build` ≈ 9-10 min under container
  contention, seed ≈ 1 min, the smoke itself ≈ 1m30s). A run where the smoke fails
  costs ~24 min because each spec retries twice — close enough to the 30-minute
  budget to matter: if the JOB timeout fires first, GitHub cancels outright and the
  `if: always()` report upload never runs, which is how #953 produced three
  consecutive `cancelled` runs with nothing to diagnose from.
- **Web server / auth waits** (why Playwright can be slow to even start) —
  120s dev-server startup, 45s auth navigation per spec.

**Rule of thumb:** wait at least the full budget above before assuming a
pending check has hung — then rerun (see below) rather than waiting longer.

## 3. Rerunning checks

### GitHub Actions

- UI: PR → **Checks** tab → **Re-run failed jobs** (or **Re-run all jobs**).
- CLI: `gh run rerun <run-id>`, or `gh run rerun --failed <run-id>` to only
  retry the failed jobs. List current statuses with `gh pr checks <pr>`.
- If a workflow doesn't expose a rerun option for its trigger, an empty
  commit (`git commit --allow-empty -m "ci: retrigger" && git push`)
  retriggers any `push`/`pull_request`-driven workflow.

### CircleCI

- UI: rerun the workflow **from start** or **from failed** on the pipeline
  page.
- Local dry-run before pushing: `circleci config validate` and
  `circleci local execute --job <job>` (see `.circleci/README.md`).
- `lighthouse-preview` polls for a Vercel preview URL — with non-main
  previews disabled it usually skips gracefully. Rerun only when a manual
  preview deploy exists and you need Lighthouse against it.

### Vercel

- Not a GHA-style "rerun" button — redeploy from the Vercel dashboard, or
  promote from the CLI. Since `git.deploymentEnabled` is `{"*": false}`, there
  is no git-triggered deploy to rerun in the first place.
- CodeRabbit and Greptile used to be listed here. Both were dropped
  2026-07-20 — there is nothing to re-request.

## 4. Inherited failures from `main`

Sometimes a check fails on your PR for a reason that has nothing to do with
your diff — `main` itself was already red when you branched.

- **Confirm it's inherited**: check the latest `main` run for the same
  workflow/job. If it's also failing there, and your changed files don't
  touch the code paths that job exercises (the same changed-files logic
  `review-gate.yml` uses to scope its checks), the failure pre-dates your PR.
- **For config/docs-only PRs**: don't chase a red `build` or
  `Supabase lint + RLS tests` status if your PR only touches `docs/**`,
  `*.md`, or CI config — note the inherited failure in the PR description
  and rebase/merge the latest `main` once it's green again, rather than
  trying to "fix" something your PR didn't break.
- **Don't misread intentional skips as failures**: Lighthouse skips
  `docs/*` and `*-noop` branches by design; Playwright specs self-skip when
  their env vars aren't set (`PLAYWRIGHT_BASEBALL_SEEDED`, `E2E_GOLF_*`,
  `GOLFHELM_*`). A skip is not a failure.

  **But `baseball-auth-smoke` (#372) no longer skips, and that is deliberate.**
  It used to skip on fork/Dependabot `pull_request` runs because those never
  receive repo secrets. As of PR #1125 it needs no secrets — it seeds a
  throwaway stack on the runner — so it runs everywhere. If you see it skipped
  now, that is *not* expected: check the job's `if:` condition rather than
  waving it through. A **required** gate that silently skipped for a whole class
  of PR was a hole in the gate, which is why the skip was removed rather than
  documented.

---

See also:

- [`docs/operations/COST_CONTROLS.md`](operations/COST_CONTROLS.md) — Vercel
  preview policy, PR vs main Playwright, manual full E2E, spend alerts
- [`.claude/rules/code-review-tooling.md`](../.claude/rules/code-review-tooling.md)
  — the authority on what reviews this repo actually runs
- [`.github/branch-protection.md`](../.github/branch-protection.md) — required
  checks enforcement policy

`docs/operations/coderabbit-review-workflow.md` still exists but describes a
tool dropped 2026-07-20. It is history, not procedure — do not follow it.
