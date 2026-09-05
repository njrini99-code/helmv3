# Branch Protection Policy (apply via GitHub UI)

Apply these settings to `main` (and any release branch):

## Required status checks

Require aggregate checks instead of every leaf job. Leaf jobs still run and
remain visible on PRs, but branch protection depends on stable aggregate names
so a job split/rename does not silently break protection.

> ### ✅ MIGRATION COMPLETED — verified live 2026-08-19
>
> ```bash
> gh api repos/njrini99-code/helmv3/branches/main/protection \
>   -q '.required_status_checks | {strict, contexts}'
> # => {"strict": true, "contexts": [
> #      "Smoke checks", "CI aggregate", "Review Gate aggregate",
> #      "Analyze (actions)", "Analyze (javascript-typescript)", "Analyze (python)"
> #    ]}
> ```
>
> **Updated 2026-08-20:** `strict` is now `false` (owner decision); see
> **Other settings** below for the current, API-verified state. The six
> required contexts are unchanged.
>
> **Updated 2026-09-02: FIVE required contexts.** `Smoke checks` was removed
> from the required set (`DELETE …/protection/required_status_checks/contexts`,
> verified by reading the list back) and then its job was deleted from
> `playwright.yml` — in that order, so no PR was ever left waiting on a name
> nothing posts. The job was `npm ci` + `next build`, the exact steps ci.yml's
> `Next build` runs inside `CI aggregate`; every PR was paying two 9-minute
> builds and two runner slots for one fact. Live state now:
> `CI aggregate`, `Review Gate aggregate`, `Analyze (actions)`,
> `Analyze (javascript-typescript)`, `Analyze (python)`. Same day, ci.yml's
> nine tiny leaf jobs became steps of one `Static checks` job and ESLint
> joined the ratchets in `Lint`; review-gate.yml's eleven linters became steps
> of one `Review Gate checks` job. The aggregate names did not change, which
> is the whole reason branch protection depends on aggregates.
>
> **Updated 2026-09-05: `block-historical-edits` promoted to required —
> PENDING
> APPLICATION.** `migration-lockdown.yml`'s workflow-level `paths:
> supabase/migrations/**` filter is gone: the workflow now runs on every
> `pull_request` and `merge_group` event and always reports a conclusion (a
> first step checks whether any `supabase/migrations/*.sql` file changed and
> exits 0 without running the lockdown logic when none did, instead of the
> workflow simply never starting). That was the actual blocker to requiring
> it — a required context that only sometimes runs leaves every PR that
> doesn't trip its old path filter waiting on "Expected" forever, the exact
> failure this section spent 2026-08-19 fixing for `all` and `CodeQL`. This
> file lists the six-context target below; it is a specification until the
> PATCH is applied and read back, not the live GitHub state — verify with:
>
> ```bash
> gh api \
>   repos/njrini99-code/helmv3/branches/main/protection/required_status_checks \
>   -q '{strict, contexts}'
> ```
>
> before trusting this file over the API, per the standing rule two
> paragraphs below.
>
> **The window this section used to warn about was OPEN, and is now closed.**
> The job rename (`all` → `CI aggregate` / `Review Gate aggregate`) had already
> landed on `main`, but the required-context list had not been updated — exactly
> the Option A failure mode described below. `all` was a required context that
> nothing could ever post again. Every PR-based merge was unsatisfiable, masked
> only by `enforce_admins: false` letting the owner push straight past it.
>
> **`CodeQL` was a phantom too, and the migration plan below did not catch it.**
> Both orderings above end with `contexts[]=CodeQL`, but no check run and no
> commit status is named `CodeQL` — this workflow's matrix posts three separate
> runs, `Analyze (actions)`, `Analyze (javascript-typescript)` and
> `Analyze (python)`. So of the three contexts formerly required, **two were
> phantoms and only `Smoke checks` was real.** Verified by asking for the names
> that actually exist rather than the ones the docs assumed:
>
> ```bash
> gh api repos/njrini99-code/helmv3/commits/<sha>/check-runs --paginate \
>   -q '.check_runs[] | .name' | sort -u
> gh api repos/njrini99-code/helmv3/commits/<sha>/status -q '.statuses[] | .context'
> ```
>
> Do that before adding any context to this list. A required context is matched
> by NAME against what actually posts; a name that posts nothing is
> indistinguishable from a check that never finishes, and GitHub will not warn
> you.
>
> All six required contexts were confirmed to run on **both** `push` to `main`
> and on `pull_request` with no path filters, so none of them can hang a PR:
> `ci.yml` and `review-gate.yml` trigger on `pull_request` unrestricted,
> `playwright.yml`'s `smoke` job has `if: push || pull_request`, and
> `codeql.yml` has all three matrix legs on `push`/`pull_request` to `main`.
>
> **Also changed 2026-08-19:** `allow_force_pushes` **true → false**. Until now
> `.claude/hooks/guard-bash.sh` (deleted 2026-08-27) was the only thing
> preventing a rewrite of
> shared history on `main`; the hook stays as belt-and-braces, but it is no
> longer load-bearing. Note `CLAUDE.md` rule 0 still describes force pushes as
> "ENABLED on GitHub" — that sentence is now stale.
>
> **Not required, but real:** CircleCI posts two commit statuses,
> `ci/circleci: android-compile` and `ci/circleci: ios-compile`. They are
> genuine gates that nothing enforces. They were deliberately NOT added here,
> because the `ios` workflow only triggers on `main`/`release/*`/`ios/*`/
> `capacitor/*` — requiring a context that does not post on every PR
> re-creates the exact bug this section documents.
>
> `CodeRabbit` is **no longer required** (dropped 2026-07-20). The bullet below is
> kept struck through rather than deleted so the change is visible to anyone
> re-applying these settings from this file.

- `CI aggregate` (was `CI / all`) — hard aggregate for:
  - `Static checks` (since 2026-09-02, one job whose named steps are the
    former `Database types drift`, `Schema invariants`, `Feature knowledge`,
    `Control plane`, `Bridge env drift`, `Edge functions (Deno)`,
    `Business contracts`, `Route Hygiene P0/P1` and `Import-cycle ratchet`
    jobs)
  - `TypeScript`
  - `Lint` (ESLint plus the former `Lint ratchet` steps)
  - `Unit tests`
  - `Next build`
  - `Supabase lint + RLS tests`
  - `BaseballHelm authenticated smoke` (coach + player, #372) — as of PR #1125
    this seeds a throwaway Supabase stack on the runner instead of production, so
    it needs **no repo secrets** and therefore **no longer skips** on
    fork/Dependabot PRs. Before that change it skipped (did not fail) on those
    runs, because they receive no secrets from GitHub by design — and a required
    gate that silently skipped for a whole class of PR was a hole in it
- `Review Gate aggregate` (was `Review Gate / all`) — hard aggregate for
  `Review Gate checks` (ast-grep, gitleaks, actionlint, yamllint, shellcheck,
  markdownlint, ruff+pylint, sqlfluff, hadolint, env-secrets as named steps
  of one job since 2026-09-02) and `semgrep (custom rules)`.
- `block-historical-edits` (`migration-lockdown.yml`) —
  **PROMOTED 2026-09-05**
  from advisory (see below for why it wasn't required before this date).
- ~~`Playwright E2E / Smoke checks`~~ — **REMOVED 2026-09-02** (context first,
  then job). It was `npm ci` + `next build`, a duplicate of `Next build`
  above. The full `Playwright (chromium)` suite is manual `workflow_dispatch`
  only and remains advisory.
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
- ~~`the external review bot`~~ — **DELETED 2026-07-20**; the retired rules directory is gone.
- `Playwright PR smoke (a11y)` — public routes only, path-filtered within PRs
- `Playwright (chromium)` — main + manual only
- `Course picker screenshots` — manual `workflow_dispatch` only
- `BaseballHelm seeded smoke (advisory)` — main + manual only

`Supabase lint + RLS tests` was promoted from advisory into the hard
`CI / all` aggregate once the baseball pgTAP RLS suite went green on `main`
(#517, supersedes #423). RLS regressions now block merge.

`migration-lockdown / block-historical-edits` was promoted the same way on
2026-09-05: it enforces a real invariant (historical migrations are
immutable past the alignment baseline) but until this date it structurally
could not gate anything, for the same reason `all` and `CodeQL` were
phantoms above — its workflow had a `pull_request: paths:
supabase/migrations/**` filter, so a PR that never touched a migration file
never started the workflow at all, and GitHub cannot require a context that
sometimes never posts. The filter is gone; the workflow now runs on every
PR and reports a conclusion every time (see `migration-lockdown.yml`'s own
header comment). See the PENDING APPLICATION callout above for the exact
`gh api` call to add it to `required_status_checks.contexts` — that step is
the orchestrator's, not this commit's; this file records the target so the
next reader isn't chasing a fifth context that quietly became six.

`BaseballHelm authenticated smoke` (the `baseball-auth-smoke` job in
`ci.yml`) was promoted the same way (#372): the coach/player smoke suite
(`e2e/baseball-smoke.spec.ts` + `e2e/baseball-onboarding-smoke.spec.ts`) and
its fail-loud auth setup already existed and ran on every `main` push via
`playwright.yml`'s `e2e` job, but only post-merge — a real authenticated
regression could land on `main` before this ever ran. `ci.yml` ran the
same specs (steps copied, not moved) as a required PR gate until 2026-08-26,
when the owner moved it out of the PR gate (out of `CI aggregate`'s `needs`,
`if:` limited to push-to-`main`) after two consecutive PR runs died to runner
shutdowns mid-build without executing a test. Post-merge coverage on `main`
remains; a red run there blocks the next production promote rather than PR
merges. See the job's own comment in `ci.yml` for the revert recipe.

**HISTORICAL (both AI reviewers were dropped 2026-07-20).** `the external review bot` was
intentionally advisory, not required: its `its config` skipped
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

> **Verified live against the GitHub API 2026-08-20** (`gh api …/branches/main/protection`).
> This list is the ACTUAL state, not the aspiration — several items were relaxed
> by owner decision and this doc had drifted from them until this sync.

- Require branches to be up to date before merging: **OFF** — `strict` was set to
  `false` on 2026-08-20 (owner decision). With multiple sessions landing commits,
  `strict: true` forced every open PR to restart its full check suite each time
  `main` moved, starving small PRs. Squash-merge already linearizes history, so the
  up-to-date requirement bought little here; the compensating control is
  `git pull main` before branching.
- Require linear history: **ON**
- Require pull request reviews before merging: **OFF** — 0 approvals required
  (owner works solo and is the only reviewer).
- Dismiss stale pull request approvals when new commits are pushed: **N/A** (no
  reviews required).
- Restrict who can push to matching branches: **OFF** (no push-restriction list).
- Do not allow bypassing the above settings: **OFF** — `enforce_admins` is
  disabled, so the owner can direct-push to `main`.
- Allow force pushes: **OFF**. Required status checks, live as of 2026-09-02:
  CI aggregate, Review Gate aggregate, Analyze (actions / javascript-typescript /
  python). `block-historical-edits` is the target sixth context (see the
  PENDING APPLICATION callout above) — read the API before trusting a count
  in this file.

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
