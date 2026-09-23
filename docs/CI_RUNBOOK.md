# CI Runbook — Triaging Pending / Red PR Checks

> Closes #390. Use this when a PR shows pending or failing checks and you
> need to know: is this a real blocker, a transient queue, or a failure
> inherited from `main`? And if it's stuck, how do I rerun it?

This runbook is operational guidance only. `.github/branch-protection.md` is
the authoritative source of truth for which checks are actually enforced —
if the two ever disagree, branch protection wins and this doc should be
updated.

## What changed on 2026-09-23, and why

Measured that day: about 42% of PRs failed their first push, mostly for
reasons the PR did not cause, and queueing was 64% of the wait before a PR
went green (the account runs at most 20 jobs at once). The changes:

- **Types drift left the PR gate.** `Database types drift` compared every
  PR to the live production schema, so one production apply turned every
  open PR red: 10 of 16 real first-push failures on 2026-09-23.
  `types-regen.yml` now runs it after `db-apply`, on push to `main`, every
  3 h and on dispatch, and opens or updates the `types/auto-regen` PR.
- **Generated artifacts fail a PR only for drift it introduced.** The
  inventory, World Model, document inventory, feature map, enforcement
  inventory and tool-authority matrix checks ran on the PR merged into the
  current `main`, so a stale `main`, or two PRs regenerating the same
  file, failed every open PR. They now run through
  `scripts/github/pr-drift-gate.mjs`, and `Docs Regen` regenerates on
  `main` (it opens `docs/auto-regen`).
- **Dead references count only new ones.** CI runs `docs:dead-refs` with
  `--introduced-since <base>`; the whole-tree count failed every PR once
  `main` itself passed the baseline ("REGRESSION 4 -> 6").
- **Action-count tests are floors.** `coverage-contract.foundation` and
  `feature-registry` asserted exact totals, so two PRs that each added an
  action collided ("expected 430 to be 429").
- **Superseded runs are not red.** `CI aggregate` and `Review Gate
  aggregate` excuse cancelled or skipped jobs only when the PR head has
  moved on. Drafts still fail on purpose (#2049).
- **Supabase job pulls less.** 19 of 26 failures of this job were ghcr.io
  `toomanyrequests`. It now starts only Postgres, Auth and Storage
  (`supabase start -x ...`) and runs `pg_prove` once over every suite
  instead of one container per file.
- **Fewer jobs per merge and per PR.** `unit-tests-timezone` and
  `baseball-auth-smoke` moved to `nightly.yml` (7 jobs off every merge).
  `pr-smoke-a11y` and `sentry-snapshot-capture` run on push to `main`,
  `workflow_dispatch`, or a PR labelled `ci:e2e`.
- **No detect hop.** `Unit tests`, `Next build` and `Supabase` apply the
  `code` filter (`.github/path-filters.yml`) inside the job instead of
  waiting on `detect-changes`, which was a second queue wait.
- **Shorter critical path.** Unit tests (which paced 66% of runs) run in 5
  shards. `TypeScript` and `Lint` are one job, which saves a slot and an
  install and still finishes before `Next build`. Every `npm ci` uses
  `--prefer-offline --no-audit --no-fund`.
- **Next cache stops thrashing.** `.next/cache` was saved per commit and
  filled the 10 GB cache (9.96 GB), which evicted what PRs restore; 27% of
  builds took over 7 min. It is now saved from `main` once per UTC day per
  lockfile, and the separate `next-smoke` cache is gone.

**Owner actions (optional; nothing here needs them to work):**

- Add a fine-grained `REGEN_PR_PAT` secret (contents: write, pull-requests:
  write). Then `types/auto-regen` and `docs/auto-regen` PRs get CI on their
  own. Without it, a human push to the branch triggers CI.
- Create the `ci:e2e` label (`gh label create ci:e2e`) so PRs can opt into
  the Playwright and Sentry jobs.
- GitHub Pro raises the concurrent-job cap from 20 to 40, which removes most
  of the remaining queue wait.

## 0. Before you push

`npm install` wires a `pre-push` git hook automatically (the `prepare`
lifecycle script, `scripts/setup-hooks.mjs` — sets `core.hooksPath` to the
tracked `.githooks/`; `npm run hooks:install` does the same by hand). The hook
keeps local work fast and range-scoped:

- `git diff --check` over each pushed commit range — blocks trailing
  whitespace and other patch-format errors before they reach the remote.
- `gitleaks git --redact --log-opts=<range>` over each pushed commit range —
  runs when `gitleaks` is installed and is skipped with a notice when it is
  unavailable. CI remains the authoritative full repository secret scan.

The hook does not run typecheck, ESLint, ratchets, generated-docs commands, or
the Review Gate locally. Those project-wide checks remain in CI, where they run
once per workflow. Skip the local hook for one push with
`HELM_SKIP_PREPUSH=1 git push`; CI still runs every required check.

The paired `pre-commit` hook scans staged content with redacted gitleaks output
when the tool is installed. A staged migration receives a reminder to run and
review `npm run db:types`; the hook does not contact Supabase, regenerate files,
or alter the index.

The `Feature knowledge registry` step in `ci.yml` is the single CI caller for
the static knowledge checks. `npm run knowledge:check` already runs registry
globs, document-inventory, and feature-map validation, so these are kept as
named stages inside that step rather than repeated standalone workflow steps.

The `Lint` job parses `src` and `scripts` once through `scripts/lint-ci.mjs
--scan`, enabling the three normally disabled audit rules. Separate named
steps consume that report: standard ESLint still requires zero warnings/errors
in `src/**/*.{ts,tsx}` (excluding the three audit rules); the generic ratchet
counts regular warnings and `ERROR:` diagnostics across both directories;
each audit counts only its own rule in `src`, retaining false-zero, slack,
regression, baseline-update, and report-only coverage behavior.

If an enabled audit rule consumes an `eslint-disable`, the producer rechecks
only that affected file with the default rules to preserve unused-disable
warnings in the hard lint and generic ratchet. It logs the number of affected
files; ordinary runs need no second scan.

The report lives in runner temporary storage and is bound to the checkout path,
workflow run, attempt, and SHA. The producer removes any previous report before
scanning and writes only after a valid complete-scope result. Exit 1 with valid
ESLint JSON is diagnostic output; tooling failures, missing/empty/malformed
reports, and mismatched run IDs fail the gate. The producer and every evaluator
remain in the final aggregate. Standalone lint and audit commands still scan
normally when `HELM_ESLINT_REPORT` is unset; the shared report is never cached or
uploaded for reuse across jobs.

## 1. Status classification — hard gate vs. advisory

**SIX** required contexts are enforced on `main` as of 2026-09-06 (`block-historical-edits`
was promoted from advisory back to required — verified against commit
`1e5d10a34`; see `.github/branch-protection.md`) — read live from the API,
not from this table:

```bash
gh api repos/njrini99-code/helmv3/branches/main/protection \
  -q '.required_status_checks | {strict, contexts}'
# => {"strict": false, "contexts": [
#      "CI aggregate", "Review Gate aggregate",
#      "Analyze (actions)", "Analyze (javascript-typescript)", "Analyze (python)",
#      "block-historical-edits"
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

**Once all six are green, land in one command**: `npm run pr:land -- <n>`
reads this same required-contexts list live from branch protection, refuses
if any is missing or non-`SUCCESS`, then merges (`--squash --delete-branch`),
fast-forwards the canonical checkout, and runs
`node scripts/worktree-lifecycle.mjs --retire`. Refuses a non-`agent/*`
branch unless `--any-branch` is passed; see `scripts/pr-land.mjs`.

| Check | Source | What it validates | Gate type |
|---|---|---|---|
| `CI aggregate` | `ci.yml` | aggregate: `Static checks` (schema invariants, feature knowledge, control plane, bridge env, Deno edge functions, business contracts, route hygiene, import cycles, generated artifacts — named steps of one job since 2026-09-02; DB-types drift moved to `types-regen.yml` 2026-09-23), `TypeScript + Lint` (tsc + ESLint + ratchets, one job since 2026-09-23) — these two ALWAYS run — plus `Unit tests` ×5, `Next build`, and **`Supabase lint + RLS tests`**, which finish green with every step skipped (an in-job path gate since 2026-09-23; they SKIPPED as jobs before) when `detect-changes` (`.github/workflows/detect-changes.yml`, a shared `dorny/paths-filter` reusable workflow, 2026-09-06) finds no changed path under `src/**`, `supabase/**`, `e2e/**`, `package*.json`, `next.config.*`, `tsconfig*.json`, `vitest.config.ts`, `eslint.config.mjs`, `tailwind.config.*`, `postcss.config.*`, `middleware.ts`, `scripts/**/*.{ts,mjs}`, or `ci.yml`/`detect-changes.yml` themselves. Those three heavy jobs run in parallel with everything else, with no `needs:` (2026-09-23) (2026-09-22; the 2026-09-06 `needs: [typecheck, lint]` ordering added ~4 min per PR to save runner minutes that are free on a public repo). `main` branch protection no longer requires branches to be up to date (2026-09-22): each merge used to force every open PR to rerun CI, and a merge queue is unavailable on a user-owned repo; push-to-main CI still runs the full set. A docs-only or config-only PR outside that list finishes in minutes (detect + static + typecheck + lint + aggregate, no install-heavy build/test/Supabase job); a `push` to `main` always runs the full set. | **Hard gate** — uniquely named since 2026-08-19; a green `CI aggregate` now really is CI's |
| `Review Gate aggregate` | `review-gate.yml` | aggregate: `Review Gate checks` (ast-grep, gitleaks, actionlint, yamllint, shellcheck, markdownlint, ruff+pylint, sqlfluff, hadolint, env-secrets as steps) + `semgrep (custom rules)` | **Hard gate** — uniquely named since 2026-08-19 |
| ~~`Smoke checks`~~ | ~~`playwright.yml`~~ | ~~build-only smoke: `npm ci` + `next build`~~ | **REMOVED 2026-09-02** — a duplicate of `Next build`; context dropped first, job second |
| `Playwright PR smoke (a11y)` | `ci.yml` (`pr-smoke-a11y` job) | public-route accessibility Playwright | Advisory — **folded in from the now-deleted `pr-smoke.yml` (2026-09-06)**; since 2026-09-23 runs only on push to `main`, `workflow_dispatch`, or a PR labelled `ci:e2e` (otherwise SKIPPED), and consumes `next-build`'s uploaded `.next` artifact instead of running `npm run dev` itself |
| `CodeRabbit` | CodeRabbit GitHub App | ~~assertive line-level review + blocking custom checks~~ | **DROPPED 2026-07-20** — removed from the required set by founder decision; `.coderabbit.yaml` is a disable stub. If a `CodeRabbit` status still appears, it is informational. The custom rule packs under `.coderabbit/` REMAIN and are consumed directly by the Review Gate. |
| `CodeQL` | GitHub's code-scanning app, posted for `codeql.yml`'s scans | summarizes alert-count deltas for the commit (distinct from the three `Analyze (...)` runs the callout above documents, which only assert the scan completed) | **Not required** — the callout above already says so; this row used to say "Hard gate" directly under it, contradicting it. It can show `failure` (new alerts introduced) while all three `Analyze (...)` show `success` simultaneously, so it is real signal that nothing currently blocks on. |
| `the external review bot` | the external review bot GitHub App | ~~whole-codebase review~~ | **DROPPED 2026-07-20** — the retired rules directory is deleted. Neither external AI reviewer is a gate any more; the deterministic Review Gate + CodeQL cover the same hard rules. |
| `Playwright (chromium)` / `Course picker screenshots` / `BaseballHelm seeded smoke` | `playwright.yml` | full E2E (mandatory Baseball smoke + mobile-viewport regression + broader chromium suite) — **main push + manual `workflow_dispatch` only** (not PRs) | Advisory on main; manual for feature branches. **Note:** `Playwright (chromium)`'s broader-suite step no longer masks its exit code (`|| echo ...` removed) — a red run here now means a real failure, not just "see artifact." **2026-09-06:** tries to download the `next-build` artifact from `ci.yml` for the same commit first, falling back to its own `npm run build` when there is none. |
| `ci/circleci: ios-compile` | CircleCI | iOS Capacitor compile, branch-gated: `main` / `release/*` / `ios/*` / `capacitor/*` / `agent/fix-circleci-ios-*` | Advisory unless the PR touches iOS |
| `ci/circleci: android-compile` | CircleCI | Android `assembleDebug` (no signing), branch-gated: `main` / `release/*` / `android/*` / `capacitor/*` / `ci/android-*` | Advisory unless the PR touches Android |
| `migration-lockdown / block-historical-edits` | `migration-lockdown.yml` | blocks edits to already-applied migrations | **Hard gate** — promoted to required 2026-09-05, applied and verified live 2026-09-06. Its own changed-path check now reads the shared `detect-changes.yml`'s `migrations` output (2026-09-06) instead of running its own `changed-files.sh` scan. |
| `Capture + upload Sentry snapshots` | `ci.yml` (`sentry-snapshot-capture` job) | visual diff of a curated screen set against Sentry Snapshots | Advisory — **folded in from the now-deleted `sentry-snapshots.yml` (2026-09-06)**; since 2026-09-23 runs only on push to `main`, `workflow_dispatch`, or a PR labelled `ci:e2e`, plus an in-job `SENTRY_SNAPSHOTS_AUTH_TOKEN` check step (the old separate "Check Sentry snapshot prerequisites" job is now a step); `push` to `main` always runs to refresh the base build; consumes `next-build`'s uploaded `.next` artifact instead of running its own `npm run build` <!-- markdownlint-disable-line MD013 --> |
| `check (advisory — routes + owner issues)` | `baseball-readiness-matrix.yml` | every route cited in the BaseballHelm readiness matrix resolves; every owner-issue link is open | Advisory, **not on `pull_request`** since 2026-09-06 (neither check depends on a PR's diff) — runs on `push` to `main` touching the matrix doc/scripts, plus a Wednesday 08:30 UTC `schedule` (`config/routines.yml`'s `baseball-readiness-matrix-weekly`) <!-- markdownlint-disable-line MD013 --> |
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
- **PR smoke** (`ci.yml`'s `pr-smoke-a11y` job, folded in from the deleted
  `pr-smoke.yml` on 2026-09-06) — optional `Playwright PR smoke (a11y)` ~12
  min. Since 2026-09-23 it runs on push to `main`, `workflow_dispatch`, or a
  PR labelled `ci:e2e` (add the label before the push you want covered), and
  needs `next-build` to have built; otherwise it shows SKIPPED. (The `Smoke checks`
  build is gone since 2026-09-02; `Next build` inside CI is the build
  verdict, ~6 min warm, and this job now downloads that same build instead
  of compiling its own.)
- **Full Playwright** (`playwright.yml`, manual `workflow_dispatch` only since
  2026-09-02) — `e2e` job, 120-minute budget.
- **`baseball-auth-smoke` (#372)** — `nightly.yml` since 2026-09-23 (and
  `gh workflow run nightly.yml`); never on a PR or a merge. 45-minute budget. It
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
  (`.github/actions/local-supabase-stack`) and seeds that, needs **no secrets**,
  and
  therefore **no longer skips for anyone**. Budget in practice: ~17 min for a clean
  run (`supabase start` ≈ 1m45s, `npm run build` ≈ 9-10 min under container
  contention, seed ≈ 1 min, the smoke itself ≈ 1m30s). A run where the smoke fails
  costs ~24 min because each spec retries twice — close enough to the 30-minute
  budget to matter: if the JOB timeout fires first, GitHub cancels outright and
  the
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
- Draft PRs skip every gated job, and `CI aggregate` and `Review Gate
  aggregate` fail on purpose, so a skipped run can never satisfy branch
  protection. Marking the PR ready (`ready_for_review`) starts the real run.
  Rerunning a draft-era run keeps its draft payload and fails again, so
  instead retrigger with `gh pr ready <pr> --undo && gh pr ready <pr>`.

### CircleCI

- UI: rerun the workflow **from start** or **from failed** on the pipeline
  page.
- Local dry-run before pushing: `circleci config validate` and
  `circleci local execute --job <job>` (see `.circleci/README.md`).
- There is no `lighthouse-preview` job — `.circleci/config.yml` has never
  defined one, and `.claude/rules/integrations.md` documents the same
  correction. `ios-compile` and `android-compile` are the only per-PR
  CircleCI checks; both are branch-name gated (see the table above), so a
  PR from a differently-named branch touching `ios/**`/`android/**` will not
  trigger them.

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

  **`baseball-auth-smoke` (#372) does not appear on PRs at all** — since
  2026-09-23 it lives in `nightly.yml` (off the PR gate since 2026-08-26,
  owner decision). What remains deliberate from the
  PR #1125 rework: it needs no secrets (it seeds a throwaway stack on the
  runner), so the nightly run is unconditional — a skip THERE is not
  expected.

## 5. `claude-code.yml`'s trigger gate — reviewed 2026-09-05

`.github/workflows/claude-code.yml` runs a Claude Code agent with
`contents: write`, `pull-requests: write`, `issues: write` and
`id-token: write` on three triggers: `issue_comment` (created),
`pull_request_review_comment` (created), and `issues` (labeled). On a public
repo, "who can post a comment or open an issue" is "anyone with a GitHub
account" — so the workflow's `if:` condition on the `claude` job is the whole
access-control boundary. This section records what that condition actually
allows, evidenced against the live repo, so the next person auditing it does
not have to re-derive it from the YAML.

**Who can trigger it, and how:**

- **Comment paths** (`issue_comment`, `pull_request_review_comment`): the
  comment body must contain `@claude` AND
  `github.event.comment.author_association` must be one of `OWNER`, `MEMBER`,
  `COLLABORATOR`. `CONTRIBUTOR` (someone with a past merged commit but no
  push access) and `FIRST_TIME_CONTRIBUTOR`/`NONE` (a fork PR author with no
  prior relationship to the repo) are excluded — a first-time or repeat
  outside contributor cannot trigger this by commenting, on their own PR or
  anyone else's.
- **Label path** (`issues`, `labeled`): triggers when the `agent:ready` label
  is applied — with no author-association check on the label event itself.
  This is safe only because GitHub's own permission model requires **triage**
  role or higher to add a label to an issue or PR; a fork contributor without
  that role cannot add `agent:ready` at all, so the label being present is
  itself evidence the actor who applied it already had elevated access. The
  workflow does not re-verify this — it relies entirely on GitHub's label
  permission, which is correct but worth stating explicitly since nothing in
  the YAML enforces it directly.
- **A plain fork PR triggers nothing.** `pull_request` / `pull_request_target`
  are not in the trigger list at all, so opening or pushing to a PR — from a
  fork or otherwise — cannot start this job by itself. It only starts from an
  explicit comment or label action, both gated as above. This avoids the
  classic `pull_request_target`-with-write-permissions exfiltration pattern
  outright, by never listening to that event.

**What a triggering actor's Claude run can actually do, once started:**

- `contents: write` cannot reach `main` directly. Verified live
  (`gh api repos/njrini99-code/helmv3/branches/main/protection`,
  2026-09-05): `required_pull_request_reviews: true`, `enforce_admins: true`,
  `required_linear_history: true`, `allow_force_pushes: false` — main accepts
  merges through a reviewed PR only, with no admin/token bypass. The Claude
  job's own system prompt also says "Branch + PR only; never push to main",
  but that is a request to the model, not a mechanical control — the
  mechanical control is branch protection, and it holds independently of
  whether the model follows the instruction.
- The "Refuse unsafe labels before agent run" step (a second, content-based
  gate on top of the author gate) blocks the run when the target issue/PR
  carries `risk:high`, `agent:needs-human-review`, `severity:p0`, or
  `source:security`.

**Gap found in that second gate, not previously documented:** the step reads
`context.payload.issue` and returns early (`if (!issue) return;`) when it is
absent. For `pull_request_review_comment` events, GitHub's webhook payload
carries `context.payload.pull_request`, not `.issue` — so on that trigger the
blocked-labels check is silently skipped, every time. A PR labeled
`risk:high` can still be driven by a `pull_request_review_comment` (inline
review comment) containing `@claude` from an OWNER/MEMBER/COLLABORATOR,
because the label check never runs for that event type. The primary author
gate (association check) still applies and is unaffected — this is a gap in
the second, content-based layer only, not the access-control boundary itself.

**Verdict:** the access-control boundary (who can start a run) is sound: no
event a fork PR generates on its own can trigger the job, and every trigger
that can requires either recorded repo access (`author_association`) or a
GitHub-enforced permission (adding a label). The blast radius of a triggered
run is also bounded independently by branch protection, not just by the
model's own instructions.

**Recommended change (not applied here — `claude-code.yml` is out of this
change's scope):** extend the "Refuse unsafe labels" step to also check
`context.payload.pull_request?.labels` when `context.payload.issue` is
undefined, so the blocked-labels gate applies uniformly across all three
trigger types instead of silently no-opping on one of them.

---

## Repo settings (dry-run script, owner-run)

`scripts/github/apply-repo-settings.sh` prints (dry-run, the default) or
applies (`--apply`) three repo-level settings changes: merge button config
(squash-only, PR title/body as the commit message), secret scanning
(`secret_scanning_non_provider_patterns` + `secret_scanning_validity_checks`),
and — only with both `--apply` and `--i-understand-protection-moves` — a
`merge-queue-main` repository ruleset built from
`scripts/github/merge-queue-ruleset.json`, whose required-status-checks list
is read live from branch protection at run time rather than hardcoded. No
agent runs this with `--apply`; it is not a repo setting, branch protection,
ruleset, or GitHub App change per this repo's rules — it is a script an
agent may write and the owner may run. Every step is idempotent and prints
"already set" when nothing needs to change. See the script's header comment
for why moving required checks into a ruleset needs the extra confirmation
flag (classic branch protection and a ruleset's own `required_status_checks`
rule can silently disagree if only one of them is updated).

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
