# OBSERVATIONS — Lane C (worker-ci) — Wave L, CI honesty

Branch: worktree-agent-a6757af3a0dbf47a5 (worktree at
`.claude/worktrees/agent-a6757af3a0dbf47a5`)

Status: COMPLETE (L1-L5, L7-L10; L6 was never assigned). This file is
appended to throughout, not written at the end.

## Quick index — 8 commits, all on this branch, none pushed anywhere

| # | Item | Commit | What |
|---|---|---|---|
| 1 | L2 | `42e30b34f` | Renamed both `all` jobs (name-only) to break the required-check ambiguity |
| 2 | L2 | `ad16e41e0` | Made the rename's migration window explicit; offered two safe orderings |
| 3 | L3 | `d8fc94248` | Converted sqlfluff/markdownlint from `\|\| true` no-ops into ratchets |
| 4 | L4 | `a4c9a2153` | Fixed 3 stale entries in `src/test/SKIPPED.md` |
| 5 | L3 | `3b117f975` | Made the ratchets print what they don't cover (backlog-not-scope-drift) |
| 6 | L1 | `405ce50ca` | Raised timeout on the specific assertions that flaked under `workers: 3` |
| 7 | L5 | `32a84c57a` | Deleted a fake-coverage React #310 test; 2 more `SKIPPED.md` corrections |
| 8 | L7/L10 | `809745981` | Fixed CircleCI's `sqlfluff-full` false-green; fixed 2 stale trigger comments |

**Not done, decisions or follow-ups for the owner** (all detailed below):
live branch-protection update (L2 — two safe orderings prepared, owner
picks); watching the next 5 real CI runs after the L1 fix lands (can't
trigger real CI from this worktree); `hadolint --no-fail`, CircleCI's
`stryker-coachhelm`/`squawk-migrations` `\|\| true` (same defect class,
not measured/fixed — see CHECKS THAT STILL LIE); CircleCI weekly
schedule's actual existence (L8 — unverifiable from the repo, Sentry
Cron Monitor design proposed); Lighthouse red-vs-green discrepancy (L9 —
code says it should skip gracefully, you/memory say it's been failing;
couldn't resolve without real run logs).

Two background tasks spawned (chips shown to the user, not auto-run):
clarifying whether a player-visible "Add to focus areas" action is
intentional or a regression (InsightCard, found during L4); finding the
real cause of a still-possibly-open React #310 crash on genome routes
(the actual bug the deleted L5 test never actually guarded against).

**Delivery note**: none of the 8 commits above were ever pushed anywhere by
me — I stayed on this local branch the whole session, as instructed. Main
briefly believed the timeout fix (`405ce50ca`) had already landed on `main`
and asked me to measure real CI against it; I checked (branch not found on
GitHub, commit not found, and the live file content on `main` fetched via
the GitHub API was still the unfixed version) and reported the discrepancy
instead of fabricating a flake-rate number against a tree that didn't have
the fix. Main confirmed the mix-up (conflated my SHAs with commits pushed
elsewhere that afternoon) and is cherry-picking these 8 commits onto `main`
directly from this worktree's object store — no push, no rebase of this
branch needed. Recorded here so the sequence is auditable, not because it
reflects on any of the 8 commits' own correctness.

---

## WHAT I CHANGED

### L2 — de-duplicated the ambiguous `all` required-check job name (prepared, not live)

Files: `.github/workflows/ci.yml` (job `all` name-only rename to `CI aggregate`),
`.github/workflows/review-gate.yml` (job `all` name-only rename to
`Review Gate aggregate`), `.github/branch-protection.md` and
`docs/CI_RUNBOOK.md` (added a "MIGRATION PREPARED, NOT YET LIVE" note with
the exact owner-run `gh api` sequence).

**Why it's safe**: only the job-level `name:` field changed in each
workflow — same `needs:`, same steps, same `if: always()` logic. Verified
with `grep -rn "needs:.*\ball\b|jobs\.all"` across `.github/workflows/*.yml`
that nothing references the job id `all` (which I left unchanged); ran
`actionlint` on both edited files (clean) and `python3 -c "yaml.safe_load(...)"`
on both (parses clean). This is a docs+CI-config change with zero effect on
what any job actually does — it only changes the name GitHub shows for the
check run, which is precisely the thing that needs to change to break the
ambiguity documented in both branch-protection.md and CI_RUNBOOK.md (the
PR #1125 incident where Review Gate's `all` reported green while CI's `all`
was still running and later failed).

**What I did NOT do**: touch the live branch protection required-checks
list. That's the owner-level step, written out verbatim in
`.github/branch-protection.md`'s new note as TWO alternative safe
orderings (see addendum immediately below — main flagged a real gap in
my first draft of this).

### L2 addendum — migration window made explicit per review feedback

Main caught a real gap in my first pass: I sequenced "merge rename → confirm
new names post green → swap required contexts" without naming that the gap
between merge and swap leaves `main` blocked on a required context (`all`)
that nothing will ever post again — true for any PR-based merge or any
non-owner push, not a property of who happens to be pushing today.

Rewrote `.github/branch-protection.md`'s note (commit `ad16e41e0`) to:
- state the window plainly, with an instruction not to start it unless the
  whole thing can be finished in one sitting
- add a PRECONDITION check at the top (`gh api .../required_status_checks.contexts`,
  confirm `"all"` is still there) since the doc may be read/executed hours
  after being written
- offer a second ordering as an explicit alternative: drop `"all"` from
  required contexts FIRST, then merge the rename, then add the two new names
  back — trades a blocked-merge window for a briefly-reduced-protection
  window (main runs with only `CodeQL` + `Smoke checks` enforced for that
  gap). Framed both as a judgment call for the owner, not a technical
  question with one right answer.

Mirrored the corrected framing into `docs/CI_RUNBOOK.md`. Still nothing live
touched — both orderings are prepared text + copy-paste `gh api` commands
only.

### L3 — sqlfluff and markdownlint converted from `|| true` no-ops into ratchets

Both jobs in `review-gate.yml` had two problems stacked: (1) they only
linted the PR's *changed* files, and (2) the lint command itself ended in
`|| true`, so the step's exit code was always 0 regardless of what it
found. Both jobs sit in the required `all` (now `Review Gate aggregate`)
aggregate, so they were "gating" nothing while looking exactly like real
checks — precisely the "structurally incapable of failing" class the owner
flagged.

**Measured first, then decided** (per instructions — did not guess):
- `sqlfluff lint --dialect postgres --rules core` across
  `supabase/migrations/*.sql` + `supabase/seed/*.sql`: **7,649 violations**
  across 12 rule codes, 264 of 303 files (the other 18 are skipped by
  sqlfluff's own 20KB large-file safety limit — one of them is the 859KB
  `20260527000000_prod_public_baseline.sql` dump). Dominant rules: LT02
  (indent, 3,928), LT05 (long lines, 1,918), LT01 (whitespace, 1,459).
- `markdownlint-cli2` across `docs/**/*.md` + `CLAUDE.md` + `AGENTS.md`
  (no `CLAUDE_CODE_GUIDE.md` present), excluding `archive/` and
  `.full-review*/`: **34,576 violations** across 34 rule codes, 291 of 296
  files. Dominant rules: MD013 line-length (20,425) and MD060
  table-column-style (6,833) — both rules this repo has evidently never
  enforced on prose docs.

Both backlogs are far too large to unmask as a hard "zero violations" gate
— that would fail almost every PR that touches a migration or a doc, for
sins that predate the PR. So, matching the instruction to model this on the
four ratchets that already exist (`lint:ratchet`, `audit:supabase-errors`,
`audit:fail-open`, `audit:paginated-reads`):

- **New**: `scripts/sql-lint-ratchet.mjs`, `scripts/markdown-lint-ratchet.mjs`
  — same shape as `scripts/lint-ratchet.mjs`: run the linter over the FULL
  scope (not just changed files — a baseline count is only meaningful if
  the scope it's measured over doesn't shift PR to PR), tally violations
  per rule code, compare against a checked-in baseline JSON, fail (exit 1)
  only if any rule's count goes UP. `--update` flag rewrites the baseline.
  Both scripts import only `node:` builtins — zero new npm dependencies,
  and CI invokes them directly (`node scripts/...`), not via `npm run`, so
  neither review-gate job needs an `npm ci` step added.
- **New baselines**: `.sqlfluff-baseline.json` (7,649 across 12 rules),
  `.markdownlint-baseline.json` (34,576 across 34 rules) — generated by
  running each script with `--update` against the measured backlog above.
- **New npm scripts**: `sql:ratchet`, `markdown:ratchet` (for local use;
  CI itself calls `node scripts/...` directly, see above).
- **review-gate.yml**: both jobs' lint steps replaced — `sqlfluff` gained an
    `actions/setup-node` step (it only had Python before) and now runs
  `node scripts/sql-lint-ratchet.mjs`; `markdownlint` now runs
  `node scripts/markdown-lint-ratchet.mjs` in place of the changed-files
  `mapfile` + `|| true` block. Both jobs keep their existing tool-install
  steps (`pip install sqlfluff`, `npm install -g markdownlint-cli2`).

**Verification before committing**:
- Ran both scripts with `--update` against my local sqlfluff/markdownlint
  installs (installed into scratch dirs — pip's own cache dir and the npm
  global cache both hit permission issues in this sandbox, worked around
  with an isolated `venv` and an isolated `npm_config_cache`+`--prefix`;
  see "WHAT I COULD NOT VERIFY" for what that means for provenance) — both
  reproduced the manually-measured totals (7649 sql / 34576 markdown)
  exactly.
- Re-ran both with no `--update`: both report `OK — N violations, no
  regressions` and exit 0, confirming the comparison path works, not just
  the write path.
- **Regression path sanity check**: manually edited `.sqlfluff-baseline.json`
  to drop one rule's count by 5, re-ran the script, confirmed it printed
  the correct "VIOLATION COUNT REGRESSION DETECTED" table (`AL03  5  10  +5`,
  `Total: 7644 → 7649 (net +5)`) and exited 1, then restored the baseline
  file (`git diff` on it is clean).
- `actionlint .github/workflows/review-gate.yml` and a `yaml.safe_load`
  parse both clean after the edit.

**What I did NOT do**: run these two new jobs inside an actual GitHub
Actions runner (no CI access from this session) — the verification above is
the closest local equivalent, matching the exact commands and scope the
workflow YAML now specifies. Also did not touch `hadolint`'s `--no-fail`
flag (same "cannot fail" shape, different mechanism, not one of the two
named in this task) or `python`/pylint (already correctly fails on E/F-level
findings) — both noted below under "CHECKS THAT STILL LIE" /
"THINGS I NOTICED."

## DECISIONS NEEDED

### 0. [TOP PRIORITY, OWNER-LEVEL] The Playwright `e2e` job in .github/workflows/playwright.yml writes to PRODUCTION Supabase — confirmed, not changed

**Confirmed with evidence** (I did NOT touch this — read-only investigation per main's request):

- **Where**: `.github/workflows/playwright.yml`, job `e2e` (display name "Playwright
  (chromium)"), top-level `env:` block:
  - line 56: `NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy-ci-build.supabase.co' }}`
  - line 60: `SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}`
  - This job runs on `push` to `main` and `workflow_dispatch` (full_e2e=true) —
    **never on a PR** (PRs use `pr-smoke.yml`, and the required per-PR gate
    `ci.yml`'s `baseball-auth-smoke` job stands up a throwaway local Supabase
    stack instead — that migration is documented in ci.yml's own comments,
    dated 2026-07-30).
- **Corroboration the secret is real prod, not a preview project**:
  - `scripts/seed-baseball-box-scores.mjs:36` and `scripts/seed-baseball-stats.mjs:85`
    both hardcode `KNOWN_PROD_PROJECT_REF = 'qmnssrrolpinvwjjnufo'` and refuse to
    run against it without `--allow-prod`.
  - `qmnssrrolpinvwjjnufo.supabase.co` is individually named in this very
    session's Bash-tool network allowlist (alongside the `*.supabase.co`
    wildcard) — i.e. it's the specific project this checkout's tooling talks to.
  - `playwright.yml` says so itself, in-repo, out loud: the step at line ~172
    is headed "⚠️ THESE TWO STEPS STILL WRITE TO PRODUCTION, and now say so out
    loud", and the step name literally reads "Seed BaseballHelm E2E fixtures
    into PRODUCTION (issue 375)".
- **Golf specs — the question that mattered most**: I grepped all four golf
  e2e specs (`golf-critical-paths`, `golf-dashboard`, `golf-qualifier`,
  `golf-round`) plus `course-library.spec.ts` for `delete`, `DELETE`,
  `service_role`, `createClient(` — **zero matches**. No golf spec
  instantiates a service-role client or issues a delete. `golf-round.spec.ts`
  DOES create real rounds via the UI as the real `E2E_GOLF_EMAIL` account
  ("E2E Test Course", "Progress Test Course", "Network Error Test") with
  **no cleanup at all** — so it's accumulation, not the destructive-delete
  pattern feared, but it does mean production `golf_rounds`/`golf_shots`
  rows grow by a few per CI run, forever, and 3x worker concurrency makes
  that accumulation 3x faster, not the reverse.
- **Baseball specs that DO use service-role delete**:
  `e2e/baseball-box-score.spec.ts` and `e2e/baseball-stats-smoke.spec.ts`
  use `scripts/e2e-supabase-admin.ts`'s `getE2eAdminClient()` and a
  `test.afterAll` sweep that deletes only the `baseball_games` +
  `baseball_events` rows the file itself created (by ID), scoped to a
  dedicated fixture team ("E2E Test University", `testcoach@helm.test` /
  `testplayer@helm.test`) — this is a **deliberate, documented pattern**
  from issue #375, not an accidental landmine. It predates the workers:1→3
  change and the file already self-serializes internally
  (`test.describe.configure({ mode: 'serial' })`) specifically to avoid
  intra-file races, so it should be safe under file-level parallelism.
- **The `messages.spec.ts` symptom main flagged — confirmed real**: it
  writes into what its own comment calls "a durable seeded conversation"
  (`/baseball/dashboard/messages`), and a prior fix already patched the
  *symptom* — the assertion previously matched 200+ accumulated
  `"Test message from E2E test"` bubbles (a strict-mode violation) — by
  making the body unique per run (`Date.now()`). That fix does NOT address
  the root cause: this conversation, in production, gains one new message
  bubble every single time this job runs, forever. No cleanup exists for it.

**What I did NOT do**: change `NEXT_PUBLIC_SUPABASE_URL`, the workflow's
target, or add any cleanup code. Per main's explicit instruction and my own
mandate ("Do NOT change live branch protection... do not touch the
production database"), this is report-only.

**My recommendation** (not executed): the codebase already contains the
right fix pattern twice over — `ci.yml`'s `baseball-auth-smoke` job already
moved off production onto a throwaway per-run local Supabase stack
(`.github/actions/local-supabase-stack`), and `playwright.yml`'s own comment
on the seed step says explicitly *"Rehoming this job means seeding golf
locally first — a separate piece of work"* — i.e. the owner/team already
knows this job is the lagging one. Two concrete, low-risk next steps for the
owner to choose from, in order of blast radius:
  1. **Smallest fix, no target change**: give `messages.spec.ts` an
     `afterAll`/`afterEach` cleanup for the row it creates, same shape as
     `baseball-box-score.spec.ts`'s. Stops the one confirmed case of
     unbounded prod growth. Golf's accumulation (no delete pattern exists
     yet) would need the same treatment but is lower-severity since nothing
     is being deleted.
  2. **Bigger fix, matches the ci.yml precedent**: rehome `playwright.yml`'s
     `e2e` job onto a local throwaway Supabase stack the same way
     `baseball-auth-smoke` already did, seeding golf fixtures locally too.
     This is real work (a golf seed script doesn't currently exist for the
     local-stack path) and is exactly the follow-up `playwright.yml`'s own
     comment already names as owed.
  Either way this is an owner call, not mine to make at speed.


## CHECKS THAT STILL LIE

### `hadolint` — same "cannot fail" shape as sqlfluff/markdownlint had, different mechanism

`.github/workflows/review-gate.yml`'s `hadolint` job runs
`./hadolint --no-fail "${files[@]}"` — the `--no-fail` flag makes hadolint
itself always exit 0, so like the two jobs I fixed, this one is
structurally incapable of failing regardless of what it finds in a
Dockerfile. Not one of the two named in L3, so I measured but did not fix
it (see below) — flagging here rather than silently leaving it.

Measured: repo has very few Dockerfiles in scope (the job's own
`changed-files.sh` filter is `(^|/)Dockerfile[^/]*$`) — did not do a
full inventory pass since this wasn't in scope, but the fix, if wanted,
is mechanically identical to the sqlfluff one: drop `--no-fail`, or
convert to the same ratchet pattern if the backlog turns out non-trivial.
Left as a follow-up rather than expanding scope past what was asked.

### `python` (ruff + pylint) job — NOT a false-green, confirmed correct

Checked this one too since it's adjacent (same `review-gate.yml`, same
changed-files pattern). `ruff check` has no `|| true` and fails naturally
on any lint error. `pylint` uses `--exit-zero` (so pylint itself never
fails) but the step then greps its own output for `^[EF][0-9]+` (error/
fatal-level findings) and explicitly `exit 1`s if any are found — this is
a real, working gate, just structured differently (grep-the-output instead
of relying on the tool's own exit code). Confirmed correct, no change
made.

## L7 — full false-green scan, all 12 workflow files

Grepped every workflow in `.github/workflows/` (`baseball-readiness-matrix.yml`,
`ci.yml`, `claude-code.yml`, `codeql.yml`, `coderabbit-issue-enrichment.yml`,
`docs-regen.yml`, `feature-awareness.yml`, `migration-lockdown.yml`,
`playwright.yml`, `pr-smoke.yml`, `review-gate.yml`, `visual-audit.yml`) for
`|| true`, `|| echo`, `set +e`, `continue-on-error`, `exit 0`, and the
tool-flag equivalents (`--no-fail`, `--exit-zero`, `allow-failure`,
`soft-fail`, `--force` used as a masking flag). `set +e` appears nowhere in
any workflow. Six files (`baseball-readiness-matrix.yml`, `claude-code.yml`,
`codeql.yml`, `docs-regen.yml`, `feature-awareness.yml`, `visual-audit.yml`)
have none of these patterns at all — clean, nothing to report.

Judged every hit against the stated discriminator (masks a hard check's
exit code vs. legitimate cleanup / "grep found nothing, that's fine"):

**Already fixed this pass** (L3, above): `sqlfluff`, `markdownlint`.

**Real, unfixed defect, same mechanism class — already flagged above,
cross-referencing here so L7's sweep doesn't miss it**: `hadolint --no-fail`
(see "CHECKS THAT STILL LIE" above for the measurement and why it was left
as a follow-up rather than fixed in this pass).

**Confirmed legitimate — "no files in scope" early exit, the actual gate
runs unmasked afterward** (~10 sites, all the same shape:
`mapfile ... || true` / `|| :` feeding a `${#files[@]} -eq 0` check, then
`exit 0` only when there's nothing to lint): `ast-grep`, both `semgrep`
scans, `actionlint`, `yamllint`, `shellcheck`, and hadolint's own
file-detection step (separate from its `--no-fail` flag on the actual
run). Each was checked individually — the tool invocation AFTER the guard
has no masking of its own.

**Confirmed legitimate — documented, honest advisory, not hiding an
unknown defect**:
- `ci.yml`'s 4 `lint-ratchet` steps' `continue-on-error: true` — already
  covered under L3/DECISIONS; the aggregator step re-checks every
  `steps.*.outcome` and fails the job if any ratchet failed. This is the
  fix for a PAST incident (2026-08-18: sequential steps let one failure
  hide the rest), not a new problem.
- `playwright.yml`'s "Run BaseballHelm authenticated route crawler
  (advisory)" `continue-on-error: true` — explicitly named advisory in its
  own step name and a comment explaining why (new, unproven DOM-driven
  discovery logic; isolated so a flake here can't be confused with the
  already-proven mandatory smoke).
- `pr-smoke.yml`'s "Run public accessibility smoke" `continue-on-error: true`
  — the best-documented one in the repo: a code comment names the exact 2
  pre-existing WCAG-AA contrast violations being exempted, explains
  step-level vs. job-level `continue-on-error` semantics precisely correctly
  (step-level lets the check go green while still surfacing the annotation),
  and states the exact condition for re-arming it (fix the golf auth-page
  contrast in its own PR, then remove the flag). This is what an HONEST
  advisory check looks like — accepted, named debt, not a hidden hole.

**Confirmed legitimate — cleanup, not a check**: `supabase stop || true`
(×2, `ci.yml`), `kill "$(cat /tmp/dev-server.pid)" ... || true` (`pr-smoke.yml`),
`gh label create plan-me ... || true` (`coderabbit-issue-enrichment.yml` —
idempotent "ensure this label exists" setup, not a check of anything).

**Low-severity, theoretical, NOT fixed (flagged only)**: `migration-lockdown.yml`
and `pr-smoke.yml` both compute their changed-file list as
`git diff --name-only ... "$BASE_SHA" "$HEAD_SHA" || true`. Unlike the
grep-no-match pattern above, `git diff --name-only` does NOT need `|| true`
for the normal "nothing changed" case (that's empty output with exit 0) —
this specific `|| true` only fires on a genuine git-level error (e.g. a
malformed SHA), and would convert "the diff itself couldn't run" into "ran
clean, found nothing," which for `migration-lockdown.yml` specifically is a
security-relevant gate (blocks edits to historical migrations). In
practice this is very low risk: both workflows trigger only on
`pull_request` events, where GitHub always populates `base.sha`/`head.sha`
as valid full SHAs, so the error path this masks is close to unreachable
given the trigger. Reporting per L7's instruction to report every
mechanism "so it can be judged," not fixing — the fix (drop `|| true`,
let a genuine git failure fail the job loudly) is a one-line change if
wanted, but didn't feel worth the risk of touching a security gate's
control flow for a near-unreachable edge case without being asked.

### L7 extended — the same sweep, done against `.circleci/config.yml` too

L7 was written for `.github/workflows/`, but the L8 investigation below sent
me into `.circleci/config.yml`, and the exact same class of defect was
sitting right there — worth reporting under the same banner rather than
filing separately. `set +e` DOES appear once here (`lighthouse-preview`
job) — see L9 below for why that one is actually a sophisticated, mostly-
legitimate design, not a blanket mask.

**Fixed this pass**: `sqlfluff-full` (the weekly job) had the identical
`|| true`-with-no-downstream-check shape as the two review-gate.yml jobs —
fixed by pointing it at the same `scripts/sql-lint-ratchet.mjs` used there
(added a `node/install` step from the already-imported `circleci/node@5.2.0`
orb, since the job's `python` executor has no Node by default — the same
orb command already runs successfully on the `ios` executor elsewhere in
this file, so this isn't a new pattern). Kept the job rather than retiring
it as redundant-with-the-PR-level-fix: it's now genuine defense-in-depth
against the exact required-check ambiguity documented under DECISIONS
NEEDED (a red PR-level check could theoretically still merge if the wrong
`all`-named aggregate reported green).

**Reported, not fixed** (measuring backlogs for these would mean actually
running slow/expensive jobs — Stryker alone has a 30-minute
`no_output_timeout` — which felt like real scope creep beyond a CI-honesty
sweep):
- **`stryker-coachhelm`** — `npx stryker run || true`, and the generated
  `stryker.conf.json` has NO `thresholds.break` field, so even without the
  `|| true`, Stryker itself likely wouldn't set a meaningful exit code
  based on mutation score. Two-layer defect: no threshold to fail against,
  and the exit code masked on top of that. This is the most consequential
  one of the three — mutation testing exists specifically to catch a test
  suite that looks like coverage but doesn't actually detect bugs (the
  exact "false coverage" theme of L5), and right now nothing would notice
  if CoachHelm V2's mutation score quietly cratered. Needs a baseline run
  to pick a real `break` threshold before this can be fixed properly — not
  something to guess at.
- **`squawk-migrations`** — `npx squawk ... || true`, no downstream check.
  Migration safety scanning is exactly the kind of hard-rule class this
  repo cares about (`code-review-tooling.md` lists "destructive
  DELETE-then-INSERT" as one of the Review Gate's blocking rules), so a
  masked squawk run means a genuinely risky migration (e.g. a
  non-concurrent index on a large table) could sail through silently. Did
  not measure the current backlog.
- **`knip`** — `npx knip ... || true`, artifact-only, no aggregator.
  Lower-severity than the two above: dead-code detection is commonly run
  advisory-only industry-wide (false positives on intentionally-unused
  exports are common), so this may be legitimately "advisory by design,"
  just not labeled as such anywhere in the comments. Flagging rather than
  assuming either way.

**Confirmed legitimate**: `npm-audit`'s two `|| true`s are explicitly,
correctly documented in an inline comment — "Don't fail the weekly on
audit findings — they're often transitive and need manual triage. The
output is the value." Same honest-advisory bucket as `pr-smoke.yml`'s
accessibility check. The two `defaults write com.apple.dt.Xcode ... || true`
lines are macOS preference-setting, not checks. The `exit 0` sites at
lines 160/336/343/347/370 are all the same "nothing in scope, early exit"
shape already covered above.

## L8 — CircleCI weekly schedule: cannot verify from the repo, said so, proposed a design

**Cannot verify, and said so rather than asserting it works.** The `weekly`
workflow's trigger is entirely a CircleCI-dashboard artifact — Project
Settings → Triggers → Scheduled Pipelines, per `.circleci/README.md`'s own
setup instructions (step 3: "Add a new trigger... Schedule: `0 6 * * 1`...
Pipeline parameters: `run-weekly` = `true`"). Nothing in
`.circleci/config.yml` itself defines a cron schedule — it only defines
`workflows.weekly.when: << pipeline.parameters.run-weekly >>`, a condition
that's inert until something external sets that parameter true. I have no
CircleCI API token available in this session and `circleci.com` isn't in
this sandbox's default network allowlist (network access can be
force-enabled, same as it was for `pypi.org` during the L3 tooling
workaround, but a token is still required for any real per-project data —
schedule config, run history, pass/fail — and I have none). **I genuinely
cannot tell you whether this trigger was ever actually created, whether
it's still correctly configured, or whether it has ever fired
successfully.** This is exactly the class of claim this whole Wave exists
to stop taking on faith.

**Proposed in-repo design** (not implemented — creating it requires
Sentry-dashboard-side setup, an owner action similar in kind to the
CircleCI trigger itself, so implementing half of it risked shipping
something that silently no-ops just like the thing it's meant to fix):
add a Sentry Cron Monitor check-in as the last step of the `weekly`
workflow (e.g. a `curl`/`@sentry/cli` call using the `SENTRY_AUTH_TOKEN`
this repo's `ci.yml` `bridge-env` job already treats as a real secret,
against a named monitor slug like `helmv3-circleci-weekly`). This repo
already leans on Sentry for exactly this "did the recurring job actually
run" question — `memory/coachhelm-refresh-cron-deadlock-790.md` tracks a
different recurring job the same way — so it's the least-new-infrastructure
option, and Sentry Cron Monitors specifically alert on a MISSED check-in,
not just a failed one, which is the real gap here (a schedule that quietly
stopped firing looks identical, from the repo, to one that never existed).
Once the owner creates the monitor in Sentry and wires the auth token as a
CircleCI project env var, the code-side half is a small, low-risk addition
to the existing `weekly:` workflow.

## L9 — Lighthouse: RESOLVED — it's green, not red, and green because it does nothing

**Determined it has no real deployment target — this part is solid.**
`lighthouse-preview` polls the Vercel API for a preview deployment matching
the PR's commit SHA (`.circleci/scripts/wait-for-vercel-preview.sh`). But
`vercel.json` has carried `"git": {"deploymentEnabled": {"*": false}}`
since 2026-07-08 (per `CLAUDE.md` rule 0), meaning NO branch — main or
otherwise — gets an automatic Vercel deployment. There is structurally
nothing for this script to find. `docs/operations/COST_CONTROLS.md` says
this in its own words: *"With non-main Vercel builds skipped, preview
lookup usually finds no deployment and Lighthouse skips gracefully... No
change required for cost safety; do not re-enable Vercel previews for
Lighthouse without revisiting this doc."* So: confirmed, in the repo's own
current words, that this job has had no real target since 2026-07-08.

**Red vs. green — settled with real evidence, not guessed.** Main and
`memory/ci-lighthouse-preview-chronic-failure.md` both described this as
failing on essentially every commit. Reading the code, I couldn't find a
path that produces a genuine failure purely from Vercel being unavailable
(every message `wait-for-vercel-preview.sh` can emit is matched by
`config.yml`'s advisory-skip grep). Rather than trust either the code
reading or the memory note, pulled real data: **GitHub's commit-statuses
API exposes CircleCI's reported status without needing a CircleCI token at
all** — `gh api repos/njrini99-code/helmv3/commits/{sha}/statuses`, filtered
to `context == "ci/circleci: lighthouse-preview"`. Checked 3 commits on
`main` spanning ~15 hours (`71e64076` 2026-08-19 18:38 UTC, `89c28716`
17:33 UTC, `46f28655` 03:19 UTC): **all three `state: success`**,
`description: "Your tests passed on CircleCI!"`. Every run completes in
84-111 seconds (pending → success) — far too fast for a real Lighthouse
audit OR the script's own 120-600s graceful-timeout-then-skip path. That
timing points at the FASTEST exit in the script: the very first check,
`if [[ -z VERCEL_TOKEN || -z VERCEL_PROJECT_ID ]]; then exit 2` — near-
instant, no polling at all. Most likely explanation: `VERCEL_TOKEN`/
`VERCEL_PROJECT_ID` were never actually set as CircleCI project env
variables (README.md lists this as required one-time setup, step 4 — that
step may simply never have happened).

**Conclusion: the job is NOT failing. It is green, and green because it's
a fast no-op**, not because it ran anything. The memory note and my own
initial framing were both wrong about red vs. green — right about the
deeper point, which is that it provides zero real Lighthouse coverage
either way. Did not touch the job. Re-enabling Vercel branch previews
(needed for it to do real work at all) is the deliberate cost-control
decision in `docs/operations/COST_CONTROLS.md` — not mine to reverse.
Whoever wants real coverage back needs to set the two Vercel env vars in
CircleCI project settings AND revisit the `deploymentEnabled: false`
policy (the env vars alone don't help while there's structurally no
preview to point them at).

## L10 — mobile/iOS CI trigger comments described path-based gating; mechanism is branch-name based. Fixed the comments.

Two comments in `.circleci/config.yml` described file-path-based triggering
("runs on every PR that touches ios/**, capacitor.config.ts, or any
Capacitor plugin in package.json"; "the Android check can afford to run on
every android/** change") for jobs that are actually gated entirely by
`filters.branches.only` — a literal branch-NAME allowlist (`main`,
`release/*`, `ios/*`, `capacitor/*`, `agent/fix-circleci-ios-*` for iOS;
similarly for Android). A PR from a branch named anything else that edits
those exact files would NOT trigger either job, despite what the comments
say. `.circleci/README.md` already had this right — "To run iOS on a
feature branch, name it `ios/<thing>`... add the `circleci/path-filtering`
orb LATER for automatic detection based on changed files" (explicitly
future work, not current behavior) — so branch-name gating is confirmed as
the genuinely intended current model; **fixed the comments to match, did
NOT implement path-based gating** (that would be a real behavior change,
not what was asked, and the README already correctly scopes it as a future
upgrade). Both rewritten comments now name the actual filter mechanism,
list the real branch patterns inline, and point at the README's existing
"Future upgrades" section for anyone who wants true path-based gating
later.

## L1 — the workers=1→3 experiment: FINDING, confirmed against real CI history, not just local repro

**Verdict: the contention hypothesis is supported, not refuted. It is a real,
intermittent flake that appeared after the workers change, not a pre-existing
"spec drift" issue main correctly asked me to rule out first.**

### Why this isn't just my sandbox talking

My own local reproduction (below) is real, but it's a poor stand-in for the
actual CI runner — different hardware, no shared-DB writes (I have no golf
E2E credentials here). So before trusting it, I went to the actual GitHub
Actions run history (`gh run view --log`, sandbox-disabled — `gh`'s own config
dir is denied by default) and pulled the real `Playwright (chromium)` job logs
for the runs immediately before and after commit `686e5c8b4` (the workers
1→3 change, landed 2026-08-18 20:14 local / 2026-08-19T00:14 UTC). This is
primary evidence, not inference from reading the diff.

**Pre-change (workers=1), two runs found with usable data:**
- `86df0d4e2` (run `32157580706`, 2026-08-18 ~15:57): `golf-round.spec.ts`
  had a totally different, SEVERE, deterministic failure — all 6 tests failed
  on BOTH the original attempt and the retry, each taking ~30s (a real bug
  being actively fixed that day, unrelated to worker count).
  `marketing-navigation.spec.ts` passed clean.
- `e7a354eff` (run `32165337216`, 2026-08-18 ~17:23, **the last clean
  pre-change baseline** — this is "the three specs fixed" checkpoint the
  brief referred to): all 7 `golf-round.spec.ts` tests passed clean,
  `marketing-navigation.spec.ts` passed clean. Confirms: as of the last
  pre-change run, BOTH target specs were genuinely green — the failures that
  show up after the change are not a continuation of a pre-existing problem
  on these two files specifically. (Other files — `baseball-box-score.spec.ts`,
  `baseball-stats-smoke.spec.ts`, `messages.spec.ts`, `golf-qualifier.spec.ts`
  — WERE already failing in this same run, for unrelated reasons; this
  matches the documented "Playwright red since 2026-08-16" (#1486) history
  main flagged. Those are pre-existing and out of scope for this
  investigation; `messages.spec.ts`'s failure here is the same "201 elements"
  accumulated-production-data issue already written up under DECISIONS
  NEEDED above.)

**Post-change (workers=3), four runs where the `Run Playwright tests` step
actually executed (two others — `686e5c8b4` itself and `e9ed10511` — never
reached it because an EARLIER blocking step, baseball auth setup /
mobile-viewport, failed first and the job stopped; that's a separate,
possibly-related symptom I did not chase further — see "THINGS I NOTICED"):**

| Run (commit) | `marketing-navigation.spec.ts` | `golf-round.spec.ts` |
|---|---|---|
| `9570e1c7c` (`32204550791`) | pass, clean | all 7 pass, clean |
| `06d564199` (`32206251145`) | **FLAKY** — failed attempt 1, passed retry | 1 **definitive fail** ("should display stats after round completion"), 1 flaky |
| `ec96d9b8b` (`32215037340`) | pass, clean | all 7 pass, clean |
| `c31cfb1d6` (`32218389603`) | pass, clean | 1 flaky ("should display stats after round completion") |

Rate: `marketing-navigation.spec.ts` flaked in 1 of 4 post-change runs where
it actually ran (0 of 2 pre-change). `golf-round.spec.ts` flaked/failed in 2
of 4 post-change runs (0 of 1 clean pre-change baseline — the other
pre-change data point had unrelated pre-existing breakage, not comparable).

**The exact error text from `06d564199`'s real CI run**, for
`marketing-navigation.spec.ts`:
```
Error: expect(received).toBeGreaterThan(expected)
Expected: > 500
Received:   0
Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
  > 15 |   await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
```
This is **character-for-character identical** to what I reproduced locally
(below) — same assertion, same line, same "Received: 0" after a
`scrollTo()`. That's strong corroboration my local repro is the same failure
mode as production CI, not a sandbox artifact.

`golf-round.spec.ts`'s two post-change failures were a DIFFERENT assertion
each time (`06d564199`: a network/save-state issue at a different line;
`c31cfb1d6`: `getByRole('button', { name: /^Open Scoring/ })` visibility
timeout, 5000ms, "element(s) not found" on `/golf/dashboard/stats`) — not the
same line every time, which is itself informative: this doesn't look like a
single deterministic bug in one assertion, it looks like "whichever
assertion in whichever spec happens to be racing a not-yet-settled page at
the moment 3 workers are all mid-request" — i.e., genuine resource
contention, not a specific broken selector.

### My local reproduction (same target, same build, workers=1 vs workers=3)

Environment note: `golf-round.spec.ts` cannot execute for real in this
sandbox — no `E2E_GOLF_EMAIL`/`E2E_GOLF_PASSWORD` (no `.env.local` access,
no Docker for a local Supabase stack), so all 7 of its tests self-skip
regardless of worker count here. Said this plainly to main rather than
reporting a "clean comparison" that was really seven no-ops. This means my
local numbers below are `marketing-navigation.spec.ts`-only for the
pass/fail signal.

**Direct comparison, exactly the two named files, nothing else** (weak test —
`golf-round.spec.ts` contributes zero real network activity here, so there's
minimal genuine overlap to observe):
- workers=1: `marketing-navigation.spec.ts` passed, 5.1s test / 9.8s total run.
- workers=3: same test passed, 4.1s test / 6.0s total run (Playwright only
  spawns 2 workers — only 2 files to parallelize). No degradation.

**Broader batch** (golf-round + marketing-navigation + `accessibility.spec.ts`'s
5 public-route checks + `landing-motion-legibility.spec.ts`'s 2 scroll-choreography
tests — real concurrent page loads on public routes, no auth needed, giving
the contention hypothesis an actual fair test), same production build served
via `next start`, same machine, run twice each:
- workers=1 (n=1): 8 passed, 0 failed, 297s total.
- workers=3 (n=2): **run 1 — `marketing-navigation.spec.ts` FAILED** (7
  passed, 1 failed, 276s total; exact error above, matches real CI
  character-for-character); **run 2 — all 8 passed clean**, 277s total.

Local flake rate: 1/2 at workers=3, 0/1 at workers=1. Small samples (limited
by each `landing-motion-legibility.spec.ts` test taking 2.2–2.4 minutes,
which bounded how many repeats were practical in the time available), but
directionally consistent with the real-CI numbers above, and the ONE local
failure reproduces the exact real-CI error text.

### What this does and doesn't tell us

- **Timing win is real and not free**: 30m40s → ~8m is a genuine, large
  speedup (matches the commit's own claim), but it is trading some
  determinism for it — a ~25-50% flake rate on at least these two files,
  observed on real CI, not hypothesized.
- **Not a goto timeout specifically** — the brief described "one of them a
  `page.goto` timing out at 30s"; what I actually found (in both real CI and
  my local repro) is a different assertion timing out at 5000ms
  (`expect.poll` on scroll position, or `toBeVisible` on a button) after the
  page load itself apparently succeeded. Flagging this distinction plainly
  rather than rounding it off to match the brief — it's still the same CLASS
  of failure (page state not settled by the time a short-timeout assertion
  runs), just not literally the symptom named.
- **Which specific sibling file(s) cause the contention** was never
  resolved and — per an explicit decision from main — closed by decision,
  not chased further: the fix below is file-agnostic, so the answer
  wouldn't have changed what got done.

### L1 — RESOLVED: fixed the assertions, kept workers=3 (commit `405ce50ca`)

Main's call, in order, after reviewing the finding above: (1) fix the
fragile assertions rather than revert the workers config — the owner
explicitly wants the CI-time win and the failing assertions are "did it
happen" readiness checks with no perf-budget meaning of their own, so a
longer timeout doesn't weaken what's being verified; (2) keep `workers: 3`
in `playwright.config.ts` — untouched; (3) re-measure afterward and report
the sample size honestly, counting only runs where the test step actually
executed (`cancelled` ≠ `success` — this repo already has a documented
history of mistaking 20 straight cancelled runs for a passing gate).

**What changed** (`e2e/marketing-navigation.spec.ts`,
`e2e/golf-round.spec.ts`): raised `expect.poll`/`toBeVisible` timeouts from
Playwright's 5000ms default to 15000ms on exactly the assertions that
actually failed in real CI runs above — all four scroll-position polls in
`marketing-navigation.spec.ts`, and the three page-load-readiness
`toBeVisible` checks in `golf-round.spec.ts`'s "should display stats after
round completion." Each comment cites the specific CI run its timeout buys
back. A genuine scroll/render bug still fails at 15s; only false alarms
from sibling-worker contention are what this removes.

**Deliberately left untouched**: `golf-round.spec.ts`'s "should navigate
between stat categories" also flaked in `06d564199` (30.3s duration), but
that number is suspiciously close to Playwright's 30s TEST-level default,
not a single 5000ms assertion — it loops through 5 categories, each with
its own click + `toBeVisible`, so the failure looks like accumulated
per-iteration slowness pushing the WHOLE TEST over its budget, not one
assertion missing its own window. Raising each iteration's timeout
individually risks compounding the problem (a single test ballooning
toward or past 75s) rather than fixing it, and I wasn't confident enough in
a specific fix to guess — flagged rather than touched, per instruction.

**Verification**: both files parse clean (`npx playwright test --list`,
8/8 tests listed correctly) and typecheck was not run to completion
separately (see WHAT I COULD NOT VERIFY) but the edits are pure
option-object additions (`{ timeout: 15_000 }`), a shape already used
elsewhere in the same test files (e.g. `waitFor({ timeout: ... })` calls
in `golf-round.spec.ts`'s `closeCoursePicker` helper), so type risk is
low. Re-ran the local workers=3 batch with the fix applied (result below)
as a smoke check, but the number that actually matters is real CI —
**I cannot generate that from this worktree**: pushes to a non-`main`
branch don't trigger `playwright.yml`'s full E2E job (push-to-main or
manual `workflow_dispatch` only), and I was told not to push to main. Main
asked to "watch the next 5 completed CI runs" after this lands — that has
to happen after this commit reaches `main`, by whoever merges it. Recorded
under WHAT I COULD NOT VERIFY too so it doesn't get missed.

## L1 — infrastructure snag discovered mid-experiment (not a CI finding, a sandbox hazard)

First `npm run build` attempt in my own worktree
(`.claude/worktrees/agent-a6757af3a0dbf47a5`) failed with:
```
Error: Cannot find module '/Users/ricknini/Downloads/helmv3/node_modules/@swc/helpers/cjs/_interop_require_default.cjs'
```
Note the path: that's the MAIN repo's `node_modules`, not my worktree's own.
Diagnosed: my worktree's own `node_modules/@swc/helpers` is fully populated;
the MAIN repo's `node_modules/@swc/helpers` is empty (0 files under
`cjs`/`esm`/`scripts`/`src`, no `package.json` at all) — almost certainly
because another lane is running its own install in the shared main checkout
concurrently. Because my worktree lives NESTED inside the main repo
(`.claude/worktrees/agent-.../`, not a sibling per `autonomy.md`'s prescribed
`../helmv3-wt-N` pattern — this one wasn't mine to place, the harness put me
here), both directories have their own `package-lock.json`, and Next's
automatic `outputFileTracingRoot` root-detection walks upward from cwd
looking for the OUTERMOST directory with a lockfile — which resolves to the
main repo, not my worktree. Combined with Node's own upward node_modules
resolution walk, the build partially reached into the main repo's
(currently broken, mid-install) `node_modules` instead of staying inside my
own.

This is exactly the class of hazard `autonomy.md` already warns about for
`find`/`grep` across nested worktrees, showing up in a different tool
(Next.js's build tracing) instead. **Fix applied for MY run only**: extracted
a clean `git archive HEAD` checkout to
`$TMPDIR/.../scratchpad/e2e-experiment` (a true sibling, no lockfile in any
ancestor directory — verified explicitly), ran `npm ci` + `npm run build`
there instead. This is a local, throwaway directory, not a repo change — no
commit reflects this.

**Not filing this as a Wave-L finding** since it didn't originate in any of
the CI workflows I was asked to audit, but flagging it under "THINGS I
NOTICED" below since it's a real, reproducible hazard for any future agent
whose worktree lands nested inside the repo instead of as a sibling.

## L4 — skip audit

Swept `\.skip(` and `\.fixme(` across `e2e/` and `src/`: **63 total
occurrences**, 0 `.fixme()` anywhere in the repo, 0 bare `describe.skip(`
(all are `test.skip(...)` / `it.skip(...)`, some via role-scoped fixture
objects like `golfCoachTest.skip(...)`).

Categorized and checked each category, not just counted them:

1. **Credential-gated e2e skips** (the large majority — golf/baseball
   coach-or-player auth unavailable). Spot-checked the representative case,
   `e2e/fixtures/golf-auth.ts`: it reads `GOLFHELM_COACH_EMAIL` /
   `GOLFHELM_PLAYER_EMAIL` (falling back to `E2E_GOLF_EMAIL` for player) and
   fills `#golf-signin-email` / `#golf-signin-password`. Initially grepped
   the wrong directory (`src/components/golf/`) and got zero hits — before
   reporting a false "stale selector" finding, broadened the search and
   found the real form at `src/components/auth/golf-sign-in-form.tsx`,
   confirmed both ids exist verbatim. Correct and current; did not
   byte-for-byte audit every other credential-gated skip's login page (that
   would be its own multi-hour sweep), but the pattern is uniform across
   files (`hasGolfPlayerAuth`/`hasGolfCoachAuth` from the same fixture
   module), so one verified representative gives reasonable confidence in
   the rest.
2. **`RECRUITING_ENABLED` / `RECRUITING_SUNSET_REASON`** (5 files: watchlist,
   player-profile, discover, camps x2, baseball-pipeline x2). Traced to
   `src/lib/baseball/product-modules.ts`'s `isModuleEnabled('recruiting')` —
   a real, deliberate, well-documented product-level sunset gate (not a
   test-only flag), independently confirmed current. `e2e/helpers/product-modules.ts`'s
   own header comment already explains precisely why these are skipped
   rather than deleted (reversibility). No issue found.
3. **`VISUAL_AUDIT` gate** (`e2e/visual-audit.spec.ts`, 2 sites). Confirmed
   `.github/workflows/visual-audit.yml:56` sets `VISUAL_AUDIT: "1"` — the
   gate and its consumer still match. No issue found.
4. **Unconditional `test.skip(true, reason)` inside try/catch login
   helpers** (`baseball-box-score.spec.ts`, `camps.spec.ts`,
   `baseball-pipeline.spec.ts`) — at first glance these look like dead
   "always skip" code, which is exactly the shape the task warned about.
   Checked the call sites: each is inside a `try { await loginAsX(page) }
   catch { test.skip(true, '...') }` block — i.e. `test.skip(true, ...)`
   only executes when the login attempt in the `try` actually threw. This
   is a legitimate (if slightly unusual) Playwright idiom for "attempt
   login, skip with a clear reason if it fails" — functionally equivalent
   to the `test.skip(!ok, ...)` pattern used elsewhere in
   `baseball-stats-smoke.spec.ts`/`baseball-phase1.spec.ts`, just phrased
   as skip-in-catch instead of skip-on-a-precomputed-boolean. Not stale,
   not dead.
5. **`src/test/SKIPPED.md`-tracked unit-test skips** (6 total across
   `pattern-miner.test.ts` [1 remaining], `approach-analytics.test.ts` [2],
   `EvidencePanel.test.tsx` [1], `InsightCard.test.tsx` [2]) — this is
   where the real findings were. Full detail and the fix are in commit
   `a4c9a2153` and the "WHAT I CHANGED" section isn't listing it separately
   from L3 above by accident — putting the summary here instead:
   - **3 genuinely stale, fixed**: `putt-analytics.test.ts`,
     `scoring-context.test.ts`, `scrambling-analytics.test.ts` were listed
     as "pending Plan 03" but the files (and the generators they tested)
     were deleted three months ago by `79f485ecf` ("wave26: v2 sunset").
     `SKIPPED.md`'s own most recent pass (2026-07-30) fixed a different
     stale entry in the same document but missed these three. Corrected.
   - **3 re-verified as still genuinely blocked, but by actually running
     them**, not by reading the code and guessing: temporarily removed
     `.skip` from `EvidencePanel.test.tsx`'s and both
     `InsightCard.test.tsx` skips, ran `npx vitest run --project unit-dom`
     against each file, confirmed all three still fail, then reverted with
     `git checkout` (verified clean diff after revert). `approach-analytics.test.ts`'s
     two were checked by tracing the import graph instead (its stated
     blocker, `BaselineRegistry`, now exists as a module but
     `approach-analytics.ts` doesn't import it yet — still genuinely
     blocked).
   - **Correction, not just confirmation, on `InsightCard.test.tsx`**: both
     skips there still fail, but not for the "user-wip" reason the code
     comment and `SKIPPED.md` claimed — that referred to a Button a11y
     change which already shipped (`button.test.tsx` resolved 2026-07-30).
     The real current blockers are different: one is an architecture change
     (the focus-area button now opens a modal instead of calling `onAction`
     directly — a test-rewrite, not a docs fix); the other looks like it
     could be either an intentional redesign or a real regression (the
     coach-only "Add to focus areas" action now also renders for players)
     — flagged as a background task (`task_0fbb879c`) for product/design
     input rather than guessed at either way.

## THINGS I NOTICED BUT DID NOT ACT ON

- **`coderabbit-issue-enrichment.yml` is probably dead weight.** It fires on
  every issue open/reopen/edit and adds a `plan-me` label to trigger
  CodeRabbit's automatic issue planning — but `code-review-tooling.md`
  documents that the external AI reviewers were dropped 2026-07-20 by
  founder decision and the GitHub App still needs an owner uninstall. If
  the App is no longer authorized, this workflow either does nothing or
  errors quietly. Not in scope for Wave L (it's not a false-green — its own
  `|| true` is legitimate idempotent label-creation, see L7), and I didn't
  want to guess at GitHub App authorization state I can't observe from
  here. Worth a five-minute check once the owner uninstall happens.
- **`baseball-box-score.spec.ts`'s cleanup may not be fully reliable.** In
  the pre-workers-change CI run I pulled for L1 (`e7a354eff`), the "create
  a new game" test failed with a strict-mode violation —
  `getByText('E2E Created Opponent 1787074937343')` resolved to 3-4
  elements, meaning multiple runs' worth of "E2E Created Opponent" rows
  were visible simultaneously despite the file's own `afterAll` teardown
  (see L3/DECISIONS write-up on this file's service-role delete pattern).
  Either the teardown doesn't always run (a prior run crashed before
  reaching it) or it doesn't catch every row it should. I did not
  investigate further — found this incidentally while reading CI logs for
  an unrelated purpose (L1), and chasing it would mean auditing
  `deleteGamesAndEvents`'s selection logic, which is out of scope for a
  CI-honesty pass. Flagging since it's adjacent to the "does this
  production-write pattern actually clean up after itself" question raised
  under DECISIONS NEEDED above.
- **`playwright.yml`'s job never reaching the main test step is its own
  small pattern.** Two of the real CI runs I pulled for L1
  (`686e5c8b4`, `e9ed10511`) never reached the "Run Playwright tests" step
  at all — an earlier step ("Run BaseballHelm mandatory smoke + mobile
  viewport regression (blocking)") failed first and the job stopped
  (no `if: always()` on the later step). That earlier step failed with
  `browserContext.storageState: Target page, context or browser has been
  closed` in one case — a browser-context stability issue that could
  plausibly be the SAME resource-contention class as the L1 finding, just
  manifesting in the blocking smoke step instead of the broader suite. I
  did not chase this — main's decision closed the "which sibling file
  contends" question by fixing the assertions instead, and this is the
  same category of question one level up (which STEP contends). Noting it
  in case the timeout fix doesn't fully resolve the flake rate and this
  needs a second look.

## WHAT I COULD NOT VERIFY

- **Whether the L1 timeout fix (commit `405ce50ca`) actually reduces the
  flake rate on real CI.** I have no way to trigger a real
  `playwright.yml` `e2e` job run from this worktree (push-to-main or manual
  `workflow_dispatch` only) and was told not to push to main. My local
  re-run post-fix passed clean, but that's one data point on a machine
  that isn't the CI runner. Main's instruction to "watch the next 5
  completed CI runs" (counting only runs where the test step actually
  executed, not `cancelled`) has to happen after this commit reaches
  `main`, by whoever merges it.
- **The exact live output of `sql:ratchet` / `markdown:ratchet` running
  inside an actual GitHub Actions runner.** Verified locally with sqlfluff
  installed into a scratch venv and markdownlint-cli2 into an isolated npm
  prefix (both needed because this sandbox's default pip/npm caches hit
  permission errors — documented under L3). The commands and scope exactly
  match what `review-gate.yml` now runs, and `pip install sqlfluff` /
  `npm install -g markdownlint-cli2` are unchanged from before my edit, so
  I'm confident in this, but a real CI run is still the final proof.
- **Full inventory of every credential-gated e2e skip's login-page
  selectors.** Spot-checked the representative case (`e2e/fixtures/golf-auth.ts`)
  and found it current; did not individually verify every other
  credential-gated skip's target page against its actual DOM (baseball
  fixtures, coach-role golf fixtures, etc.) — that's a much larger sweep
  than L4 asked for.
- **Whether `hadolint`'s backlog (if unmasked) would be trivial or large.**
  Did not do a full inventory pass on Dockerfiles repo-wide — only noted
  that the job's own file filter is narrow (`(^|/)Dockerfile[^/]*$`) and
  left the actual measurement as a follow-up, since it wasn't one of the
  two files L3 named.
- **GitHub App authorization state for CodeRabbit** (see "THINGS I
  NOTICED" above) — not observable from this session.

---
