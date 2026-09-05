# CI Runbook — Triaging Pending / Red PR Checks

> Closes #390. Use this when a PR shows pending or failing checks and you
> need to know: is this a real blocker, a transient queue, or a failure
> inherited from `main`? And if it's stuck, how do I rerun it?

This runbook is operational guidance only. `.github/branch-protection.md` is
the authoritative source of truth for which checks are actually enforced —
if the two ever disagree, branch protection wins and this doc should be
updated.

## 1. Status classification — hard gate vs. advisory

**FIVE** required contexts are enforced on `main` as of 2026-09-02 (six from
2026-08-19 until then) — read live from the API, not from this table:

```bash
gh api repos/njrini99-code/helmv3/branches/main/protection \
  -q '.required_status_checks | {strict, contexts}'
# => {"strict": false, "contexts": [
#      "CI aggregate", "Review Gate aggregate",
#      "Analyze (actions)", "Analyze (javascript-typescript)", "Analyze (python)"
#    ]}
```

`Smoke checks` **left the required set on 2026-09-02.** It was playwright.yml's
build-only job — `npm ci` + `next build`, the same steps `Next build` runs
inside `CI aggregate` — so every PR ran two identical 9-minute builds. The
context was deleted from branch protection FIRST and the job second, so no
PR waited on a name nothing posts. The same change turned ci.yml's nine
seconds-of-work leaf jobs into named steps of one `Static checks` job, folded
ESLint into `Lint`, and turned review-gate.yml's eleven linters into steps of
one `Review Gate checks` job: ~47 check runs per PR became ~19, on a runner
pool that behaves like 20 concurrent jobs.

`CodeRabbit` **is no longer one of them** — dropped by founder decision on
2026-07-20 and removed from the required set (the app itself still needs an owner
uninstall). This section said "four … including CodeRabbit" until 2026-07-30.

> ### ✅ RESOLVED 2026-08-19 — `all` is gone, and two contexts were PHANTOMS
>
> The ambiguity this section warned about is fixed, but not the way it expected.
> The job rename had already landed on `main` while the required-context list
> still said `all`, so for some time **no check could satisfy it** — `all` was a
> required context that nothing would ever post again. PRs were unsatisfiable;
> only `enforce_admins: false` hid it, by letting the owner push straight past.
>
> Worse, `CodeQL` was a phantom too. Nothing posts a check run or a commit
> status by that name — `codeql.yml` runs a three-language matrix that emits
> `Analyze (actions)`, `Analyze (javascript-typescript)` and `Analyze (python)`.
> **Of the three contexts formerly required, two matched nothing and only
> `Smoke checks` was real.**
>
> Required from then until 2026-09-02: `Smoke checks`, `CI aggregate`,
> `Review Gate aggregate`, and the three `Analyze (...)` runs (five now — see
> above). All six verified to run on both `push` to `main`
> and `pull_request`, with no path filters, so none can hang a PR.
>
> **The transferable lesson: a required context is matched by NAME against what
> actually posts, and a name that posts nothing looks exactly like a check that
> has not finished yet.** GitHub never warns you. Before adding a context, ask
> for the names that exist:
>
> ```bash
> gh api repos/njrini99-code/helmv3/commits/<sha>/check-runs --paginate \
>   -q '.check_runs[] | .name' | sort -u
> gh api repos/njrini99-code/helmv3/commits/<sha>/status -q '.statuses[] | .context'
> ```
>
> The advice below still stands for reading a PR's real state: resolve the head
> SHA, find the run whose `.name == "CI"`, and read that run's own jobs rather
> than trusting an aggregate check name.
>
> ```bash
> sha=$(gh pr view <PR> --json headRefOid -q .headRefOid)
> rid=$(gh api "repos/njrini99-code/helmv3/actions/runs?head_sha=$sha&per_page=50" \
>         -q '[.workflow_runs[]|select(.name=="CI")][0].id')
> gh api "repos/njrini99-code/helmv3/actions/runs/$rid/jobs?per_page=60" \
>   -q '.jobs[]|"\(.conclusion // .status)\t\(.name)"'
> ```
>
> **Historical, for why this mattered:** on PR #1125 (2026-07-30) a check-runs
> query returned `all → success` while `BaseballHelm authenticated smoke` — a
> job CI's `all` explicitly `needs` — was still `in_progress`. The green was
> Review Gate's. That smoke then failed. This is the most likely explanation for
> a PR with failing **Unit tests** merging on 2026-07-29.

| Check | Source | What it validates | Gate type |
|---|---|---|---|
| `CI aggregate` | `ci.yml` | aggregate: `Static checks` (DB-types drift, schema invariants, feature knowledge, control plane, bridge env, Deno edge functions, business contracts, route hygiene, import cycles — named steps of one job since 2026-09-02), `TypeScript`, `Lint` (ESLint + ratchets), `Unit tests` ×3, `Next build`, **`Supabase lint + RLS tests`** | **Hard gate** — uniquely named since 2026-08-19; a green `CI aggregate` now really is CI's |
| `Review Gate aggregate` | `review-gate.yml` | aggregate: `Review Gate checks` (ast-grep, gitleaks, actionlint, yamllint, shellcheck, markdownlint, ruff+pylint, sqlfluff, hadolint, env-secrets as steps) + `semgrep (custom rules)` | **Hard gate** — uniquely named since 2026-08-19 |
| ~~`Smoke checks`~~ | ~~`playwright.yml`~~ | ~~build-only smoke: `npm ci` + `next build`~~ | **REMOVED 2026-09-02** — a duplicate of `Next build`; context dropped first, job second |
| `Playwright PR smoke (a11y)` | `pr-smoke.yml` | public-route accessibility Playwright only when frontend/e2e paths change | Advisory |
| `CodeRabbit` | CodeRabbit GitHub App | ~~assertive line-level review + blocking custom checks~~ | **DROPPED 2026-07-20** — removed from the required set by founder decision; `.coderabbit.yaml` is a disable stub. If a `CodeRabbit` status still appears, it is informational. The custom rule packs under `.coderabbit/` REMAIN and are consumed directly by the Review Gate. |
| `CodeQL` | GitHub's code-scanning app, posted for `codeql.yml`'s scans | summarizes alert-count deltas for the commit (distinct from the three `Analyze (...)` runs the callout above documents, which only assert the scan completed) | **Not required** — the callout above already says so; this row used to say "Hard gate" directly under it, contradicting it. It can show `failure` (new alerts introduced) while all three `Analyze (...)` show `success` simultaneously, so it is real signal that nothing currently blocks on. |
| `the external review bot` | the external review bot GitHub App | ~~whole-codebase review~~ | **DROPPED 2026-07-20** — the retired rules directory is deleted. Neither external AI reviewer is a gate any more; the deterministic Review Gate + CodeQL cover the same hard rules. |
| `Playwright (chromium)` / `Course picker screenshots` / `BaseballHelm seeded smoke` | `playwright.yml` | full E2E (mandatory Baseball smoke + mobile-viewport regression + broader chromium suite) — **main push + manual `workflow_dispatch` only** (not PRs) | Advisory on main; manual for feature branches. **Note:** `Playwright (chromium)`'s broader-suite step no longer masks its exit code (`|| echo ...` removed) — a red run here now means a real failure, not just "see artifact." |
| `ci/circleci: lighthouse-preview` | CircleCI | Lighthouse against the Vercel preview URL; usually skips when no preview exists (non-main Vercel builds disabled) | Advisory |
| `ci/circleci: ios-compile` | CircleCI | iOS Capacitor compile, only relevant when `ios/**` / `capacitor.config.ts` changed | Advisory unless the PR touches iOS |
| `migration-lockdown / block-historical-edits` | `migration-lockdown.yml` | blocks edits to already-applied migrations | Advisory |
| `Vercel` / `Vercel Preview Comments` | Vercel GitHub App | was posting a Vercel Toolbar comment-sync status as recently as PR #1835; absent from every PR audited from #1839 on | **No longer posts on PRs.** Git deploys are disconnected (`vercel.json`'s `deploymentEnabled: {"*": false}`, no branch auto-deploys, production is an on-demand CLI promote) — there is nothing left for the GitHub App to report against. Do not wait on this check; its absence is expected, not stuck. |

## 2. Expected wait windows

Don't treat a check as "stuck" before its normal window has passed:

- **Vercel** — **nothing** builds automatically, `main` included. `vercel.json`
  has carried `"git": {"deploymentEnabled": {"*": false}}` since 2026-07-08
  (#789 / `d29deea4`); production is an on-demand CLI promote. Do not wait on a
  Vercel check that is never coming, and do not read a merge to `main` as a
  ship. CircleCI Lighthouse skips accordingly, since no preview URL exists.
  (This bullet said "only `main` builds automatically" until 2026-08-15 —
  five weeks after that stopped being true.)
- **CodeRabbit / the external review bot** — gone. Dropped 2026-07-20 by founder decision;
  see `.claude/rules/code-review-tooling.md`. There is no AI review on a PR,
  so their absence is never a pending check. The Review Gate + CodeQL cover
  the same hard rules deterministically.
- **PR smoke** (`pr-smoke.yml`) — optional `Playwright PR smoke (a11y)` ~12 min
  when frontend/e2e paths change. (The `Smoke checks` build is gone since
  2026-09-02; `Next build` inside CI is the build verdict, ~6 min warm.)
- **Full Playwright** (`playwright.yml`, manual `workflow_dispatch` only since
  2026-09-02) — `e2e` job, 120-minute budget.
- **`baseball-auth-smoke` (#372)** — 30-minute budget. It
  installs Playwright chromium, runs a full `npm run build`, seeds BaseballHelm
  CI accounts, then runs the coach/player smoke. Separate from — and in
  addition to — CI's `Next build`. **Out of the PR gate since
  2026-08-26 (owner decision)**: it runs on push to `main` only and no longer
  feeds `CI aggregate` — a red run on `main` blocks the next production
  promote, not PR merges. It had failed two consecutive PR runs with the
  runner dying ("shutdown signal") mid-TypeScript, before any test ran.

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
- the external review bots used to be listed here. Both were dropped
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

  **`baseball-auth-smoke` (#372) skipping on a PR is now expected** — since
  2026-08-26 (owner decision) its `if:` limits it to push-to-`main` events, so
  every `pull_request` run shows it skipped. What remains deliberate from the
  PR #1125 rework: it needs no secrets (it seeds a throwaway stack on the
  runner), so on `main` pushes it runs unconditionally — a skip THERE is not
  expected and means the `if:` or path-detect logic changed.

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
