# CI Runbook — Triaging Pending / Red PR Checks

> Closes #390. Use this when a PR shows pending or failing checks and you
> need to know: is this a real blocker, a transient queue, or a failure
> inherited from `main`? And if it's stuck, how do I rerun it?

This runbook is operational guidance only. `.github/branch-protection.md` is
the authoritative source of truth for which checks are actually enforced —
if the two ever disagree, branch protection wins and this doc should be
updated.

## 1. Status classification — hard gate vs. advisory

The four **required contexts** actually enforced on `main` are: `all`,
`Smoke checks`, `CodeRabbit`, `CodeQL`. Everything below labeled "Hard gate"
rolls up into one of those. (The context name `all` is shared by both the
`CI / all` and `Review Gate / all` aggregate jobs, so both must pass.)

| Check | Source | What it validates | Gate type |
|---|---|---|---|
| `all` (CI) | `ci.yml` | aggregate: DB-types drift, schema invariants, feature knowledge, typecheck, ESLint, lint-ratchet, unit tests, business contracts, `next build`, route hygiene, **Supabase lint + RLS tests** | **Hard gate** (required context `all`) |
| `all` (Review Gate) | `review-gate.yml` | aggregate: ast-grep, semgrep, gitleaks, actionlint, yamllint, shellcheck, markdownlint, ruff+pylint, sqlfluff, hadolint | **Hard gate** (required context `all`) |
| `Smoke checks` | `playwright.yml` | build-only smoke: `npm ci` + `next build` (no E2E) | **Hard gate** |
| `CodeRabbit` | CodeRabbit GitHub App | assertive line-level review + blocking custom checks (`.coderabbit.yaml`) | **Hard gate** |
| `CodeQL` | `codeql.yml` | code-scanning security analysis | **Hard gate** |
| `Greptile Review` | Greptile GitHub App | whole-codebase review + hard rules (`.greptile/instructions.md`) | Advisory — *not* a required context; Greptile skips `dependabot` PRs, so requiring it would block the bot flow. CodeRabbit is the blocking AI reviewer. |
| `Playwright (chromium)` / `Course picker screenshots` | `playwright.yml` | full E2E suite — advisory until stable for a week (see `.github/branch-protection.md`) | Advisory |
| `ci/circleci: lighthouse-preview` | CircleCI | Lighthouse against the Vercel preview URL; a11y + CLS are hard errors *within the job*, but the check itself is advisory | Advisory |
| `ci/circleci: ios-compile` | CircleCI | iOS Capacitor compile, only relevant when `ios/**` / `capacitor.config.ts` changed | Advisory unless the PR touches iOS |
| `migration-lockdown / block-historical-edits` | `migration-lockdown.yml` | blocks edits to already-applied migrations | Advisory |
| `Vercel` / `Vercel Preview Comments` | Vercel | preview build/deploy status | Advisory (informational; Lighthouse depends on it reaching `READY`) |

## 2. Expected wait windows

Don't treat a check as "stuck" before its normal window has passed:

- **Vercel preview** — standard Vercel build pipeline, no custom wait
  configured in `vercel.json`. Lighthouse polls for the preview to reach
  `READY` via `.circleci/scripts/wait-for-vercel-preview.sh` before it runs.
- **CodeRabbit / Greptile** — both re-queue automatically on every new
  commit; expect a short pending window while the new review is generated.
- **Playwright `e2e` job** — 30-minute job budget, 2 CI retries, 1 worker
  (serial execution). `picker-screenshots` has a 20-minute budget.
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
- `lighthouse-preview` depends on a successful Vercel preview — rerun it
  only after the preview shows `READY`, otherwise it will fail for an
  unrelated reason.

### Vercel / CodeRabbit / Greptile

- These re-trigger on new commits, not via a GHA-style "rerun" button.
  Use their own dashboards (Vercel: redeploy; CodeRabbit/Greptile: request a
  fresh review per `docs/operations/coderabbit-review-workflow.md`) if you
  need to force one without pushing a commit.

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

---

See also: [`docs/operations/coderabbit-review-workflow.md`](operations/coderabbit-review-workflow.md)
for clearing a stale CodeRabbit review decision specifically, and
[`.github/branch-protection.md`](../.github/branch-protection.md) for the
enforcement policy this runbook describes.
