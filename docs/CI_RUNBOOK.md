# CI Runbook — Triaging Pending / Red PR Checks

## 2026-10-07 — Plan phase 5: what moved, and the rules that came with it

- **Advisory browser jobs left `main`'s push path.** `Playwright PR smoke
  (a11y)` and `Capture + upload Sentry snapshots` moved from `ci.yml` to
  `nightly.yml`, behind one `Next build (advisory browser jobs)` that builds
  main once and hands both the `.next` output. They run nightly and on demand:
  `gh workflow run nightly.yml --ref <branch>`. The `ci:e2e` PR label no
  longer does anything. `ci.yml`'s own `Next build` now uploads its artifact
  only on a push to `main` (the one remaining consumer is a manual
  `playwright.yml` run, which builds when there is no artifact).
- **The npm cache is saved only on `main`.** `.github/actions/setup-node-npm`
  replaces `setup-node` with `cache: npm` plus `npm ci` in `ci.yml`,
  `nightly.yml` and `clubhouse-quality.yml`. It restores `~/.npm` everywhere
  (exact lockfile key, then the newest `main` entry) and saves with
  `actions/cache/save` only when `github.ref` is `main` and the exact key
  missed. PRs write nothing, so a lockfile change no longer parks a cache
  entry in the 10 GB budget. Other workflows (scheduled, dispatch, push to
  `main`) keep `setup-node`'s own cache.
- **Auto-retry is infrastructure-only.** `ci-retry-failed.yml` used to re-run
  every failed CI job once (owner decision 2026-09-27: "for all PRs"). It now
  reads the run's jobs and re-runs only when every failed job, other than
  `CI aggregate`, either has no failed step (runner shutdown, lost contact) or
  failed in a setup or install step (checkout, setup-node and `npm ci`, Deno,
  artifact download, Playwright browser install: registry 429s and cache
  outages). A build, a test shard, lint, a type check, a ratchet or the
  Supabase stack is never retried, and a draft PR (only the aggregate fails)
  never retries. The rule and its tests are `scripts/github/ci-retry-classify.mjs`.
  This narrows the 2026-09-27 decision; the owner can widen it by editing that
  list. Manual reruns are unchanged (section 3).
- **`Clubhouse presentation quality` skips drafts** and now also runs on
  `ready_for_review`.
- **`Static checks` and `Lint` say what broke.** Each writes the failing
  step's name and its first error line to the run's summary page. The
  mechanism: both jobs run their `run:` steps through
  `scripts/github/step-shell.sh` (GitHub's default `bash -eo pipefail` plus a
  copy of the output in `$RUNNER_TEMP/step-logs/<step id>.log`), and the
  aggregate step is `scripts/github/step-summary.mjs`, which maps step ids to
  names from the workflow file. A skipped step still counts as a failure.
- **`TypeScript` and `Lint` are two parallel jobs again.** The PR gate
  type-checks with `tsgo` (`npm run typecheck:fast`); `tsc` still runs on every
  push to `main`, so a difference between the compilers cannot hide. `CI
  aggregate` needs both. `Lint` also lints `e2e/`, `.claude/hooks/` and
  `supabase/functions/` with zero warnings (`scripts/` stays under the
  ratchet).
- **The World Model graph check runs only when it can have changed.** In
  `Static checks`, only when `memory/**`, `docs/**` or `scripts/knowledge/**`
  changed (`knowledge` in `.github/path-filters.yml`); every push to `main`
  still runs it. The step exits 0 early rather than carrying an `if:`, because
  the aggregate treats a skipped step as a failure.
- **`Detect changes` runs twice per event, not four times.** `ci.yml` and
  `codeql.yml` still call it. `migration-lockdown.yml` and
  `feature-awareness.yml` now decide inside a job that already has a checkout.
  It cannot run once: CI and CodeQL are separate workflows that post required
  checks under their own names, and sharing one job's outputs across workflows
  means making them reusable workflows of a parent, which renames `Analyze
  (...)` and breaks branch protection (an owner-side change). `frontend`,
  `e2e`, `migrations` and the docs-only outputs are gone with their last
  consumers; `knowledge` is new.
- **No `merge_group` triggers.** There is no merge queue: the repo is
  user-owned and `gh api repos/{o}/{r}/rulesets` is empty. If the owner ever
  applies `scripts/github/merge-queue-ruleset.json`, add `merge_group:` back
  to `ci.yml`, `codeql.yml`, `review-gate.yml` and `migration-lockdown.yml`
  first, or every queued merge waits forever for contexts that never arrive.
- **BaseballHelm smoke is two jobs.** `baseball-smoke-build` (stack for its
  URL and anon key, then `next build`) and `baseball-auth-smoke` (stack, seed,
  Playwright). The build records the pair it baked in; the smoke job refuses
  to run on a stack that reports a different pair. Not verified in CI from the
  PR that made it (workflows cannot run before merge): the first nightly is
  the test. The ghcr.io `toomanyrequests` retry with backoff and mirror
  fallback was already in `scripts/db/supabase-start-with-retry.sh`; there is
  no Docker Hub secret, so no `docker/login-action` step.
- **Stale workflow registrations disabled.** Eight workflows were still
  registered in GitHub with no file behind them. They were disabled
  (`gh workflow disable`, reversible). Deleting a registration means deleting
  its run history, which cannot be undone, so that is the owner's call:

  ```bash
  for id in 306245476 304388517 304413490 304041944 304997359 306824105 320929151 304413514; do
    gh run list --workflow "$id" --limit 1000 --json databaseId --jq '.[].databaseId' \
      | xargs -I{} gh run delete {}
  done
  ```

  (Entry World frames, Free Production Readiness, meticulous-advisory,
  Playwright Smoke, Qodo Issue Context, Repomix Context, Semgrep, ZAP Baseline
  Scan.) `Dependabot Updates` and `Dependency Graph` are GitHub-managed and
  stay.
- **Every `uses:` is pinned to a commit SHA** (checked 2026-10-07; none were
  floating). Owner-side: turn on "Require actions to be pinned to a full-length
  commit SHA" (Settings, Actions, General, or `PUT
  /repos/{o}/{r}/actions/permissions` with `sha_pinning_required: true`) so a
  future unpinned action fails at the platform rather than in review.
- **oxlint (TODO).** Not measured: oxlint is not installed and this change adds
  no dependency. To decide whether it should replace the ESLint pre-pass in
  `check:changed`, install it in a scratch checkout and time
  `npx oxlint $(git ls-files 'src/**/*.ts' | head -20)` against
  `npx eslint` on the same twenty files.
- **The long header of `ci.yml`** moved to the last section of this file. The
  workflow keeps a pointer.

> Closes #390. Use this when a PR shows pending or failing checks and you
> need to know: is this a real blocker, a transient queue, or a failure
> inherited from `main`? And if it's stuck, how do I rerun it?

## 2026-10-06 — Change detector checkout timeout

PR #2155’s detector checkout fetched every branch/tag and reached its five-minute
job timeout. The build, static, type/lint, unit and RLS jobs passed, but the
aggregate correctly rejected the cancelled detector. The reusable detector now
checks out two commits deep: GitHub’s PR merge commit and both parents provide
the event base/head trees used by the existing two-dot diff. PR path filtering
and fail-closed classification are preserved; non-PR events still run all gates.
A local shallow-merge regression verifies both parent trees and identical diff
results. The workflow has no business-feature registry match; this runbook is
its operational documentation. Required gates and the timeout are unchanged.

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
| `CI aggregate` | `ci.yml` | aggregate: `Static checks` (schema invariants, feature knowledge, control plane, bridge env, Deno edge functions, business contracts, route hygiene, import cycles, generated artifacts — named steps of one job since 2026-09-02; DB-types drift moved to `types-regen.yml` 2026-09-23), `TypeScript` (tsgo on PRs, plus tsc on push to `main`) and `Lint` (ESLint + ratchets), parallel jobs since 2026-10-07 (one job from 2026-09-23 to then) — these three ALWAYS run — plus `Unit tests` ×5, `Next build`, and **`Supabase lint + RLS tests`**, which finish green with every step skipped (an in-job path gate since 2026-09-23; they SKIPPED as jobs before) when `detect-changes` (`.github/workflows/detect-changes.yml`, a shared `dorny/paths-filter` reusable workflow, 2026-09-06) finds no changed path under `src/**`, `supabase/**`, `e2e/**`, `package*.json`, `next.config.*`, `tsconfig*.json`, `vitest.config.ts`, `eslint.config.mjs`, `tailwind.config.*`, `postcss.config.*`, `middleware.ts`, `scripts/**/*.{ts,mjs}`, or `ci.yml`/`detect-changes.yml` themselves. Those three heavy jobs run in parallel with everything else, with no `needs:` (2026-09-23) (2026-09-22; the 2026-09-06 `needs: [typecheck, lint]` ordering added ~4 min per PR to save runner minutes that are free on a public repo). `main` branch protection no longer requires branches to be up to date (2026-09-22): each merge used to force every open PR to rerun CI, and a merge queue is unavailable on a user-owned repo; push-to-main CI still runs the full set. A docs-only or config-only PR outside that list finishes in minutes (detect + static + typecheck + lint + aggregate, no install-heavy build/test/Supabase job); a `push` to `main` always runs the full set. | **Hard gate** — uniquely named since 2026-08-19; a green `CI aggregate` now really is CI's |
| `Review Gate aggregate` | `review-gate.yml` | aggregate: `Review Gate checks` (ast-grep, gitleaks, actionlint, yamllint, shellcheck, markdownlint, ruff+pylint, sqlfluff, hadolint, env-secrets as steps) + `semgrep (custom rules)` | **Hard gate** — uniquely named since 2026-08-19 |
| ~~`Smoke checks`~~ | ~~`playwright.yml`~~ | ~~build-only smoke: `npm ci` + `next build`~~ | **REMOVED 2026-09-02** — a duplicate of `Next build`; context dropped first, job second |
| `Playwright PR smoke (a11y)` | `nightly.yml` (`pr-smoke-a11y` job) | public-route accessibility Playwright | Advisory — **folded in from the now-deleted `pr-smoke.yml` (2026-09-06)**; since 2026-10-07 lives in `nightly.yml` (nightly and `workflow_dispatch` only, never on a PR) behind its own `Next build (advisory browser jobs)`; between 2026-09-23 and then it ran on push to `main`, dispatch, or a PR labelled `ci:e2e` |
| `CodeRabbit` | CodeRabbit GitHub App | ~~assertive line-level review + blocking custom checks~~ | **DROPPED 2026-07-20** — removed from the required set by founder decision; `.coderabbit.yaml` is a disable stub. If a `CodeRabbit` status still appears, it is informational. The custom rule packs under `.coderabbit/` REMAIN and are consumed directly by the Review Gate. |
| `CodeQL` | GitHub's code-scanning app, posted for `codeql.yml`'s scans | summarizes alert-count deltas for the commit (distinct from the three `Analyze (...)` runs the callout above documents, which only assert the scan completed) | **Not required** — the callout above already says so; this row used to say "Hard gate" directly under it, contradicting it. It can show `failure` (new alerts introduced) while all three `Analyze (...)` show `success` simultaneously, so it is real signal that nothing currently blocks on. |
| `the external review bot` | the external review bot GitHub App | ~~whole-codebase review~~ | **DROPPED 2026-07-20** — the retired rules directory is deleted. Neither external AI reviewer is a gate any more; the deterministic Review Gate + CodeQL cover the same hard rules. |
| `Playwright (chromium)` / `Course picker screenshots` / `BaseballHelm seeded smoke` | `playwright.yml` | full E2E (mandatory Baseball smoke + mobile-viewport regression + broader chromium suite) — **main push + manual `workflow_dispatch` only** (not PRs) | Advisory on main; manual for feature branches. **Note:** `Playwright (chromium)`'s broader-suite step no longer masks its exit code (`|| echo ...` removed) — a red run here now means a real failure, not just "see artifact." **2026-09-06:** tries to download the `next-build` artifact from `ci.yml` for the same commit first, falling back to its own `npm run build` when there is none. |
| `ci/circleci: ios-compile` | CircleCI | iOS Capacitor compile, branch-gated: `main` / `release/*` / `ios/*` / `capacitor/*` / `agent/fix-circleci-ios-*` | Advisory unless the PR touches iOS |
| `ci/circleci: android-compile` | CircleCI | Android `assembleDebug` (no signing), branch-gated: `main` / `release/*` / `android/*` / `capacitor/*` / `ci/android-*` | Advisory unless the PR touches Android |
| `migration-lockdown / block-historical-edits` | `migration-lockdown.yml` | blocks edits to already-applied migrations | **Hard gate** — promoted to required 2026-09-05, applied and verified live 2026-09-06. Its changed-path check is its own `git diff` inside the job (2026-10-07); it read the shared `detect-changes.yml`'s `migrations` output from 2026-09-06 to then. |
| `Capture + upload Sentry snapshots` | `nightly.yml` (`sentry-snapshot-capture` job) | visual diff of a curated screen set against Sentry Snapshots | Advisory — **folded in from the now-deleted `sentry-snapshots.yml` (2026-09-06)**; since 2026-10-07 lives in `nightly.yml` (nightly and `workflow_dispatch` only), plus an in-job `SENTRY_SNAPSHOTS_AUTH_TOKEN` check step (the old separate "Check Sentry snapshot prerequisites" job is now a step); `push` to `main` always runs to refresh the base build; consumes `next-build`'s uploaded `.next` artifact instead of running its own `npm run build` <!-- markdownlint-disable-line MD013 --> |
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
  2026-08-26**: it runs on push to `main` only and no longer
  feeds `CI aggregate` — a red run on `main` is a reason to look before the next
  deploy, not a PR merge blocker. It had failed two consecutive PR runs with the
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

- Automatic: `ci-retry-failed.yml` re-runs a PR's failed CI jobs **once**,
  and **only for infrastructure failures** (first attempt only, only while
  that commit is still the PR head): every failed job, other than `CI
  aggregate`, must have no failed step (runner shutdown or lost contact) or
  have failed in a setup or install step (checkout, setup-node and `npm ci`,
  Deno, artifact download, Playwright browser install). A build, a test, a
  lint or type step, a ratchet or the Supabase stack is never retried, and
  neither is a draft run (only the aggregate fails). The run's summary page
  shows the decision and why. If the retry is red too, it is a real failure —
  read the log; nothing retries again. Rule: `scripts/github/ci-retry-classify.mjs`.
  A manual rerun of a build or test failure is a human's call, not the bot's.
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
  2026-09-23 it lives in `nightly.yml` (off the PR gate since 2026-08-26).
  What remains deliberate from the
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

## ci.yml: how it got its shape

Moved out of `.github/workflows/ci.yml`'s header on 2026-10-07 (plan 5.9) so the
workflow file keeps only the comments that explain a line. Historical: it
describes `ci.yml` as of 2026-09-23, before the parallel `TypeScript` job, the
nightly move of the browser jobs and the npm cache change above, which win
where they disagree.

```text
--- SHAPE OF THIS WORKFLOW (2026-09-02, PR throughput) ----------------------

Every pull request used to fan out into 22 jobs here, 15 of which each ran
their own checkout + setup-node + `npm ci` (68–103 s of install per job,
measured on run 33637620180) in front of a few seconds of actual checking:
`Route Hygiene P0/P1` did 0 s of work behind 89 s of install, `Bridge env
drift` 0 s behind 91 s, `Database types drift` 6 s behind 96 s, `Business
contracts` 9 s behind 75 s, `Feature knowledge` 3 s behind 81 s. With ~47
check runs per PR across all workflows and a runner pool that behaves like
20 concurrent jobs, two open PRs saturated the account and the third waited
40 minutes for a slot before running a single command.

The fix is not fewer CHECKS — every command that ran before still runs, and
every one still reports under its own name. It is fewer JOBS:

  Static checks   one job, one install, every check below as a named step
                  (the eight tiny jobs above plus schema invariants and the
                  Deno type-check, and steps added since — never count
                  these in a comment, `.claude/rules/shipping.md` §1's
                  "never write a count into prose" applies to workflow
                  comments too; count them with `grep -c '^\s*id:'` over
                  the job body when you need the number). Each step is
                  continue-on-error and an aggregate step at the end fails
                  the job naming every step that did not succeed — so one
                  failure cannot mask another, and a failing control still
                  surfaces under its own name (the reason `Control plane`
                  was once a dedicated job is preserved as a step).
  Lint            ESLint folded into the ratchet job; same aggregate pattern.
  Next build, Unit tests (3 shards), Supabase lint + RLS   skip when the
                  PR's diff touches nothing in `detect-changes`'s `code`
                  filter (src/**, supabase/**, e2e/**, package*.json,
                  next.config.*, tsconfig*.json, vitest.config.ts,
                  eslint.config.mjs, tailwind.config.*, postcss.config.*,
                  middleware.ts, scripts/**/*.{ts,mjs}, or this file
                  itself) — a docs-only or config-only PR that touches none
                  of these finishes without paying for a Next build, three
                  test shards, or a from-scratch Supabase stack. TypeScript,
                  Lint, and Static checks are NOT gated — they always run,
                  because a change to `memory/registry.yml`, a rule file,
                  or any other tracked path outside the `code` filter can
                  still be exactly what those three gates exist to check
                  (schema drift, path drift, the feature router, ESLint
                  rules that read config files, ratchets).
                  `CI aggregate` treats a SKIPPED gated job as passing only
                  when `detect-changes` classified the PR as `code=false` —
                  a skip on a code-relevant PR still fails the aggregate.
  Next build      restores its webpack cache on every run but SAVES it only
                  on push to main: the save step alone cost 99 s per PR run.

PR job count here: 22 → 10 (detect, static, typecheck, lint, 3 unit shards,
build, supabase, aggregate) on a code-relevant PR; detect, static,
typecheck, lint, aggregate (5) on a docs/config-only PR. Installs per run:
15 → 8 (code PR) or 15 → 3 (docs/config-only PR). The push-to-main-only
jobs (shifted-timezone unit tests, BaseballHelm authenticated smoke) are
untouched.

`npm ci` itself is NOT cached as a node_modules tarball, deliberately:
measured 2026-09-02 the tree is 3.7 GB, a restore of that size costs about
what the install does, and it would evict the Next build cache from the
repository's 10 GB cache budget within a few runs.

--- 2026-09-06 UPDATE: shared detector, build-once, fast-first ordering ----

`detect-changes` is now a call into .github/workflows/detect-changes.yml —
the same reusable workflow codeql.yml, feature-awareness.yml and
migration-lockdown.yml call, replacing four independent copies of
dorny/paths-filter (or, for feature-awareness, a hand-rolled git-diff
classifier) with one. Its `code` output is unchanged in meaning and path
list from the job it replaced.

`next-build` now uploads its `.next` directory (minus `.next/cache`) as
artifact `next-build-${{ github.sha }}`, 1-day retention. Two ADVISORY jobs
that used to be separate workflows now live here and consume that artifact
instead of rebuilding: `pr-smoke-a11y` ("Playwright PR smoke (a11y)",
formerly pr-smoke.yml) and `sentry-snapshot-capture` ("Capture + upload
Sentry snapshots", formerly sentry-snapshots.yml). Both `needs: next-build`
and are gated by `detect-changes`'s `frontend`/`e2e` outputs — neither is in
`CI aggregate`'s `needs`, and each keeps its test/capture step
`continue-on-error` so a failure there cannot block a merge, matching the
advisory status those two workflows always had. playwright.yml (the
manual/main full suite) is unaffected; it downloads the same artifact when
one exists for its SHA and falls back to building only when it doesn't.

PARALLEL ORDERING (2026-09-22, owner): `next-build`, the three `unit-tests`
shards, `unit-tests-timezone`, and `supabase` (Supabase lint + RLS tests)
need only `detect-changes` and start alongside `typecheck`/`lint`. The
2026-09-06 fast-first ordering (`needs: [typecheck, lint]`) saved runner
minutes, but the repo is public, so Actions minutes are free, and it added
~4 min to every code PR's critical path. Nothing is weaker: `CI aggregate`
still needs `typecheck`, `lint` and every heavy job, so any failure still
fails the required check.

--- 2026-09-23 UPDATE: red-by-default failures and PR wall time ----------

Measured that day: ~42% of PRs failed their first push, mostly for reasons
the PR did not cause; queueing was 64% of PR wait against the account's
20-job concurrency cap. What changed (docs/CI_RUNBOOK.md has the table):

  - `Database types drift` left `Static checks`; types-regen.yml owns it.
  - Generated-artifact and dead-reference checks fail a PR only for drift
    it introduced (scripts/github/pr-drift-gate.mjs, --introduced-since);
    Docs Regen regenerates on main.
  - `CI aggregate` excuses cancelled jobs only when the PR head has moved
    on (superseded run). Drafts still fail it (#2049, owner decision).
  - NO DETECT HOP: `unit-tests`, `next-build` and `supabase` no longer
    `needs: detect-changes`; each applies the same `code` filter
    (.github/path-filters.yml) in its first steps and finishes green with
    nothing to do on a docs/config-only PR. `detect-changes` still feeds
    the aggregate and the other workflows.
  - `typecheck` folded into `lint` ("TypeScript + Lint"); unit tests run in
    5 shards; `npm ci --prefer-offline --no-audit --no-fund` everywhere.
  - `unit-tests-timezone` and `baseball-auth-smoke` moved to nightly.yml;
    `pr-smoke-a11y` / `sentry-snapshot-capture` run on push to main,
    dispatch, or a PR labelled `ci:e2e`.
  - Next's .next/cache is saved from main once per UTC day per lockfile.
  - The Supabase job starts only db/auth/storage and runs pg_prove once.

Code-PR job count: 12 → 11 (detect, static, ts+lint, 5 unit shards,
build, supabase, aggregate); per merge to main: 20 → 13.
-----------------------------------------------------------------------------
```

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
