# Health Audit — 2026-08-18

**Scope:** repo infrastructure + a 25-agent read-only code audit (12 dimensions,
each adversarially verified by a skeptic).
**Tree at time of audit:** `main` @ `e9ed10511`.
**Status:** code audit COMPLETE. Structural audit (worktrees / nesting / DB drift /
config) was still running when this was written — its findings append to §4.

## Label scheme

| Field | Values |
|---|---|
| **ID** | `SEC` security · `BUG` correctness · `GATE` test/CI integrity · `DUP` duplication · `DEAD` dead code · `DOC` doc/config drift · `INFRA` repo structure |
| **Sev** | **P0** user-visible harm or data exposure · **P1** silently wrong output or a control that cannot fire · **P2** wasted time, false signal · **P3** tidiness |
| **Status** | `VERIFIED` I read the line myself · `SKEPTIC` survived an adversarial verifier · `UNVERIFIED` reported, not yet confirmed |
| **Action** | `SAFE` apply without a decision · `DECISION` needs the owner to choose |

---

## 1. Observations — Security

### SEC-01 · P0 · VERIFIED · SAFE
**Two admin API routes bypass `requireSuperAdmin()`, adding a third auth authority.**

```
src/app/admin/actions/*.ts               all 6 call requireSuperAdmin()   ✓
src/app/api/admin/debug-rollup/route.ts:78     role !== 'admin'   0 imports
src/app/api/admin/crm/send-email/route.ts:60   role !== 'admin'   0 imports
```

`src/lib/admin/require-super-admin.ts` documents that the 2026-07-29 incident was
caused by two auth authorities (`SUPER_ADMIN_USER_IDS` vs `admin_allowlist`)
drifting apart. These routes introduce a **third** — the `users.role` column —
reproducing the same class. One of the two is a **mass-outreach CRM email
sender**. The server-action sweep landed; the API-route sweep never happened.

**Fix:** call `requireSuperAdmin()` as the first line of both handlers.
**Check for more:** `grep -rln "auth.getUser" src/app/api/admin --include=route.ts`
then confirm each imports the helper rather than reading `.role`.

### SEC-02 · P1 · VERIFIED · SAFE
**3 of 22 cron routes still compare their secret with `!==`.**

`src/lib/cron/auth.ts` exists specifically to replace string `!==` with
`timingSafeEqual` — its docstring notes `!==` short-circuits at the first
differing byte, leaking a prefix-match oracle through response latency. 19 routes
use it. These three do not:

- `src/app/api/cron/log-retention/route.ts:157`
- `src/app/api/cron/integrity-check/route.ts:55`
- `src/app/api/cron/event-reminders/route.ts:105`

**Fix:** import `cronSecretMatches` / `requireCronAuth` in all three.

### SEC-03 · P1 · SKEPTIC · SAFE
**Two golf server actions trust a caller-supplied `teamId`; one has no auth at all.**

- `src/app/golf/actions/team-category-insights.ts:322-352, 691-721` —
  `getTeamOverview` / `getTeamCategoryInsights` confirm *a* coach is logged in,
  then use the caller's `teamId` verbatim. Their sibling in
  `stats-intelligence.ts` calls `validateCoachTeamAccess` on the identical
  parameter shape.
- `src/app/golf/actions/player-hub-data.ts:76-117` — `getPlayerHubSummaryData`
  has no auth check in the function at all.

Today RLS degrades both to empty results. That is incidental, not a property of
this code: any RLS relaxation or service-role path turns either into a
cross-team leak with no code change required.

**Fix:** add `validateCoachTeamAccess(...)` to both impls; add a
`getGolfSessionProfile()` check to `getPlayerHubSummaryDataImpl` before its
`Promise.all`.

### SEC-04 · P1 · UNVERIFIED · DECISION
**A known cross-tenant RLS leak is still open, and `SECURITY DEFINER` functions
were never audited.**

`get_baseball_conversations_with_details` was filed 2026-07-29 as a HIGH
cross-tenant leak and is still unfixed. No dimension of this audit rediscovered
it — meaning the methodology never extended to `SECURITY DEFINER` functions or
RLS policies directly.

**Start:** `grep -rn "SECURITY DEFINER" supabase/migrations/*.sql | grep -i baseball`,
then check each function's `WHERE`/`EXISTS` against caller-supplied IDs.

---

## 2. Observations — Correctness

### BUG-01 · P1 · SKEPTIC · SAFE
**CoachHelm's approach-proximity insights are silently suppressed by a unit bug.**

`src/lib/coachhelm/v3/counterfactual/compute.ts:94-101`,
`cohort-baselines.ts:55-57`

`cohortAnchor()` is consulted before `pga_value` with no unit guard. For
`approach_proximity_*` metrics the anchor table stores green-hit **percentages**
(42–80) while the metric's unit is **feet**. Every real call site passes
`cohort_gender`, so this fires for every player of both genders whenever the
cohort average is unpopulated: the gap computes negative and the counterfactual
is discarded as `no_gap`.

The display path was fixed (`gender-anchor.ts`); this strokes-impact path never
was. The test that should catch it never sets `cohort_gender`, so it exercises
the correct fallback and passes.

**Why it matters:** this is the one finding that actively falsifies the product's
core promise — accurate strokes-impact coaching — silently, for everyone, today.

**Fix:** restrict `cohortAnchor()` to metric families it is unit-correct for
(`putts_made_*`, `scrambling_pct_*`, `gir_pct`), or replace the percent anchors
with real feet values already seeded in `golf_pga_standards` / LPGA (18/30/45
men, 26/38/55 women). Add a test that sets `cohort_gender` on an
`approach_proximity_*` metric.

### BUG-02 · P1 · VERIFIED · SAFE
**A security control that cannot fire: native-app idle timeout.**

`src/lib/auth/session-idle-shared.ts:58, 97, 116-122`

`NATIVE_APP_SESSION_IDLE_TIMEOUT_MS` and `SESSION_IDLE_COOKIE_MAX_AGE_S` are
both exactly 30 days, and `isSessionIdleExpired` fails open when the cookie is
missing. The cookie carries `lastActivity` — so by the time real time crosses 30
days the cookie has already been evicted, the check reads "not idle", and
middleware silently re-bootstraps a fresh 30-day session. The control is
inoperative for exactly the lost/abandoned-device case it exists to cover. The
only covering test fabricates the stale cookie by hand, so it cannot see
eviction.

**Fix:** set the timeout well below the cookie Max-Age (~21–25 days). Add a test
that omits the cookie entirely at `lastActivity + timeout + slack` and asserts
forced re-auth.

### BUG-03 · P2 · SKEPTIC · SAFE
**Two putts-per-round formulas produce different numbers for the same round.**

- `src/lib/cache/golf-stats-calculator.ts:711-713` — divides by *all holes played*
- `src/lib/golf/putts-per-round.ts:61-64` — divides by *holes with a recorded putt*

The cache path runs on every round completion. Any round with an unlogged-putt
hole makes the two diverge, trips `isStatsCacheOutOfSync`'s 0.5 tolerance, and
fires needless `refresh_player_stats_cache` retries plus false "stats cache out
of sync" telemetry. `src/lib/golf/stat-formulas.ts:57-64` additionally documents
the *wrong* formula as canonical, so it will keep getting copied.

**Fix:** route both through `calculatePuttsPerRound()`; correct or delete the
`stat-formulas.ts` docstring.

---

## 3. Observations — Gate integrity

The same defect appears four ways. Treat it as one problem.

### GATE-01 · P1 · VERIFIED · FIXED TONIGHT
**Main's E2E runs cancelled each other.** `cancel-in-progress: true` keyed on
`github.ref` meant every push to main killed the previous commit's run. Three
pushes in 32 minutes (two 43s apart) produced a wall of `cancelled`, which reads
as "not red". Fixed in `e9ed10511` — cancellation now applies to PR branches only.

### GATE-02 · P1 · VERIFIED · DECISION
**A PR's green "Playwright E2E" means the suite never ran.**
`.github/workflows/playwright.yml` — the `e2e` job is
`if: github.event_name == 'push' || (workflow_dispatch && full_e2e)`. It does not
run on `pull_request`. Confirmed instance: run on `7669f16f3` shows
`Playwright E2E completed/success` with no suite behind it.

### GATE-03 · P1 · VERIFIED · DECISION
**Playwright is not a required check.** Branch protection requires `CodeQL`,
`all`, `Smoke checks`. Combined with GATE-02, every auto-merged PR lands with
zero E2E signal — onto a main whose E2E is already red, where pre-existing red
camouflages the next real regression.

### GATE-04 · P1 · SKEPTIC · SAFE
**Golf coach-role E2E has never run.** `e2e/fixtures/golf-auth.ts:80-82` requires
`GOLFHELM_COACH_EMAIL` / `GOLFHELM_COACH_PASSWORD`, set nowhere in
`.github/workflows/`. Every coach block in `golf-critical-paths.spec.ts` and
`golf-qualifier.spec.ts` — roster, calendar, messaging, intelligence — has been
silently skipped since it was written.

### GATE-05 · P2 · SKEPTIC · SAFE
**A regression test that cannot catch its own regression.**
`src/test/golf/players/genome-not-found-hooks.test.tsx:21-63, 118-128` was written
to guard 4 confirmed production React #310 crashes, but never imports the real
`SmoothScrollMount` — it hand-writes a mock, and the second test ends in
`expect(true).toBe(true)`.

### GATE-06 · P2 · UNVERIFIED · DECISION
**E2E parallelism may be buying flake.** Workers 1 → 3 took chromium 30m40s → ~8m,
but failures *moved* rather than shrank, including `page.goto` timing out at 30s —
which is contention, not spec drift. Settle it with one targeted run of the two
suspect specs at `--workers=1` against the same deploy.

---

## 4. Observations — Structure (fixed tonight)

| ID | What | Status |
|---|---|---|
| INFRA-01 | Nested worktree `.worktrees/codex-golf-team-operations` put **4,314** duplicate `.ts/.tsx` in front of every search (real `src/` has 3,884), so agents edited a shipped branch's copy | FIXED |
| INFRA-02 | `core.fsmonitor=true` with a broken daemon erroring on nearly every git call; documented as able to leave a `checkout -b` half-applied | FIXED |
| INFRA-03 | 10 abandoned Playwright/Chrome processes (idle 6–8h) holding cwd inside a worktree | FIXED |
| INFRA-04 | 3 fossil `refs/original/*` refs from a 7-month-old `filter-branch` pinning dead objects | FIXED |
| INFRA-05 | Stop hook read the **whole** dirty tree, so with 4 sessions sharing one checkout it blamed whoever ended a turn — blocked one session 5× over 17–21 files it never touched | FIXED |
| INFRA-06 | Worktree convention undocumented, so the nested worktree would recur | FIXED |
| INFRA-07 | **Prod migration history rewritten mid-audit** by a peer: 280/300 local migrations were unknown to prod; 248 marked applied on a name/content match; **32 unaccounted** | OPEN · DECISION |
| INFRA-08 | Sibling worktree symlinks all four `.env` files, giving sandbox-denied secrets a second, unprotected path | OPEN · DECISION |
| INFRA-09 | 4 Dependabot alerts (3 high, 1 moderate), all `scope: development`: `extract-zip` (no patch), `sharp`, `adm-zip`, `uuid` | OPEN · SAFE |
| INFRA-10 | **Repo is PUBLIC** (`njrini99-code/helmv3`) — worth an explicit decision given CI seeds production and `.env` files are symlinked between worktrees | OPEN · DECISION |

### Structural audit results (25 agents, 12 dimensions — 56 kept, 3 refuted)

Verdict: **not structurally sound.** Three independent layers carry verified
high-severity defects at once — database drift, an ambiguous required check, and
stale agent-facing entry points.

#### INFRA-11 · P0 · VERIFIED · **TIME-BOXED**
**Three orphaned stashes hold real work and are aging toward reflog expiry.**

```
stash@{2}  2026-07-25  24d old   2 files  +4,858 / −2,655   ← ~6 days left
stash@{1}  2026-07-29  20d old  18 files    +923 / −159
stash@{0}  2026-08-13   5d old  10 files    +234 / −437
```

All three source branches (`agent/fairway-crm-ui`, `baseball/overnight-completion`,
`fix/provider-fault-code-through-soft-failure`) are **deleted**, so this content is
reachable only through `refs/stash`'s reflog. `gc.reflogExpireUnreachable` is unset
→ 30-day default.

**⚠️ Do NOT run `git gc --prune` until these are triaged.** An earlier
recommendation in this session to `gc --prune` after deleting fossil refs was wrong
for exactly this reason.
**Fix:** `git stash show -p stash@{N}` on each; keep via
`git stash branch recovered/<name> stash@{N}`, or drop deliberately.

#### INFRA-12 · P0 · SKEPTIC · DECISION
**`supabase/migrations/` can no longer rebuild production.**

- **32 migration files** have no entry in the 803-row applied ledger. Some ran
  out-of-band under different stamps (`20260807030400_gate_qualifier_leaderboard.sql`
  applied as `20260807044633`); others (`20260730030000_avatars_storage_bucket_rls.sql`,
  `20260801000000_crm_signal_spine.sql`) have no record at all, though the objects
  they describe exist live.
- **`crm_email_templates_backup_20260720`** — live, 40 rows, RLS enabled with
  **zero policies**, no primary key, and **no `CREATE TABLE` anywhere**. Its only
  migration is a guarded `ALTER` that silently no-ops on a fresh replay.
- **`v_crm_coaches_by_school`** — live view with `security_invoker=true`, created
  entirely out-of-band; its only referencing migration (`20260623131038`) was itself
  never applied, yet the hardening is present in prod.

**Why it matters:** "read the migrations to know what prod looks like" is the
assumption CI's shadow-DB reset, disaster recovery, and preview branches all rest
on. It is false today, and nothing detects when the gap widens.
**Caveat:** at least one of the 32 (`20260708141000_gate_secdef_ownership_and_redemption.sql`)
is a deliberately held draft. **Do not bulk-backfill** — reconcile file-by-file with
`supabase migration repair`.

#### INFRA-13 · P0 · SKEPTIC · DECISION
**The required check `all` is emitted by two unrelated workflows — and already let a
broken PR merge.** `ci.yml` and `review-gate.yml` both emit a job named `all` with no
way to tell them apart. Documented consequence: **PR #1125 merged with failing unit
tests.** Still unfixed; recurs on the next race.

#### INFRA-14 · P1 · SKEPTIC · SAFE
**`.git/hooks/pre-commit` is undocumented, hits the network, and mutates the staged
tree.** On any staged `supabase/migrations/*.sql` it runs `npm run db:types` and
`git add`s `src/lib/types/database.ts`. It appears in no hook table in CLAUDE.md, so
staging a migration triggers an unanticipated Supabase call that can hang in a
sandboxed session.

#### INFRA-15 · P1 · SKEPTIC · SAFE
**`merge.ours.driver=true` is configured with no `.gitattributes` anywhere.** The
moment any `.gitattributes` invokes it, merges silently keep "our" side and discard
the other branch's changes with no conflict marker.
**Fix:** `git config --local --unset merge.ours.driver`

#### INFRA-16 · P1 · SKEPTIC · SAFE
**A blanket `*.png` ignore rejects new images in directories that already track
dozens.** `.gitignore:88`, with no `!` exception for `public/` (16 tracked),
`design/` (10), or `ios/App/App/Assets.xcassets/` (4). Confirmed: `git add
public/new-graphic.png` is refused. A replaced app icon renders locally and never
reaches a commit.

#### INFRA-17 · P1 · SKEPTIC · SAFE
**`output/` has no ignore coverage** while six sibling scratch dirs are all ignored.
CLAUDE.md's own autonomy rule documents an incident where `git add -A` swept in
another agent's half-finished files from a directory exactly like this.
**Fix:** add `/output/` beside `/test-results/`.

#### INFRA-18 · P1 · SKEPTIC · DECISION
**A CI gate has been checking a 49-day-frozen snapshot.** `ci.yml`'s `route-hygiene`
job reads five JSON files under `docs/operations/generated/` and throws if absent —
but **nothing writes them**. All five share one commit (`b877e537f`, 2026-06-30)
while `.gitignore:119-120` claims they are "regenerated by CI/scripts."

#### INFRA-19 · P1 · SKEPTIC · SAFE
**`helm-website-ui/` was deleted from git 2026-07-15 but 376M of `node_modules`
remains**, and `docs/REPO_MAP.md:113-115` — the file CLAUDE.md routes agents to for
cross-product structure — still describes it as a live second Next.js app.
`tsconfig.json:69` and `vitest.config.ts:77,231,257` still exclude it.

#### INFRA-20 · P2 · SKEPTIC · SAFE
**13 non-standard refs pin ~35 days of dead PR-review objects** (`refs/pr666`,
`refs/review-pinned/*`, `refs/codex/turn-diffs/...` — the last pointing at a tree,
not a commit). None live under `refs/heads` or `refs/tags`, so `gc` can never reclaim
them; the pack is 251.97 MiB. Separately, **21 of 23** `branch.*` config sections are
dangling — consistent with the fsmonitor half-applied-checkout failure mode.

#### INFRA-21 · P2 · SKEPTIC · SAFE
**`scripts/deploy-prod.sh` — the mandated production deploy path — is referenced by
no doc in the repo.** CLAUDE.md discusses on-demand CLI promotion at length without
naming it. Its own header documents a 2026-08-16 incident where a bare
`vercel deploy --prod` left `VERCEL_GIT_COMMIT_SHA` unset.

#### INFRA-22 · P2 · UNVERIFIED · SAFE
**The doc rot CLAUDE.md cites as historical is still live.**
`memory/projects/golfhelm.md:207-222` lists "12 golf hooks" (naming 5 that no longer
exist; there are 48); `:111-172` lists "41 action files" (real count 114) — both
**outside** the AUTOGEN markers, so `docs:regen`/`docs:check` structurally cannot fix
them. `golfhelm-database.md:7` says 3,998 columns while its own AUTOGEN block at
`:1550` says 4,002. `baseballhelm-database.md:9-11` asserts 118 baseball tables;
there are 93 — a real, unexplained 21% drop.

#### INFRA-23 · P3 · SKEPTIC · DECISION
**Screenshot output is scattered across 7 top-level directories (~1.15G)** with no
canonical location — `grep -ni screenshot CLAUDE.md` returns nothing, so each run
picks an eighth. `docs/` is 81% archive (1,163 of 1,432 files); most of the remaining
bulk is `docs/qa/` (69M) and `docs/ui-audits/` (39M) — audit byproducts, not reference.

---

## 5. Observations — Sweep (P3)

**Duplication.** `formatToParShort` (`FairwayPlayerInsight.tsx:250-253`)
reimplements `formatToPar` with an ASCII hyphen instead of the Unicode minus, and
the single-source regression test's `\b` boundary cannot match a `*Short` suffix ·
`putts_per_round` is labelled `'Putts per Round'` in `src/lib/utils.ts:23-24` and
`'Putts Per Round'` in `focus-areas/catalog.ts:89`, both rendering in the same page
tree.

**Dead code reading as live.** `src/components/ui/` chart/nav kit (11 files) ·
baseball `living-annual` molecules · `baseball/ui/` barrel's `EvidencePill` /
`PlayerTile` / `StatusRibbon` (doc comments assert usage that does not exist) ·
`LiftLabWelcomeState` · golf `AlertTypeToggles`, `WeightDistributor`,
`HeroInsightCard`.

**Doc/config drift.** `coderabbit-issue-enrichment.yml` still fires on every issue
despite CodeRabbit being dropped 2026-07-20 · `CONTRIBUTING.md:10-16` tells
contributors to branch from main and wait on a CodeRabbit check, contradicting
CLAUDE.md §0 · `memory/registry.yml:34-37, 1085-1091` lists greptile/coderabbit as
active · `.circleci/config.yml:399-402` header contradicts lines 242-244 in the
same file · three `surface-registry.ts` entries share one non-routable href that
404s · `crm_email_templates_backup_20260720` is fully typed in `database.ts:9390`
with no `CREATE TABLE` in any migration.

---

## 6. Plan

Sequenced so each wave is independently shippable. Waves 1–2 need no decisions.

### Wave 1 — Close the auth gaps (SAFE, ~1 hour)
1. `SEC-01` — `requireSuperAdmin()` in both admin API routes. Sweep
   `src/app/api/admin/**` for others.
2. `SEC-02` — import the cron auth helper in the 3 stragglers.
3. `SEC-03` — `validateCoachTeamAccess` in the two golf actions; auth check in
   `getPlayerHubSummaryDataImpl`.

Gate: `npm run typecheck && npm run lint && npm test`, plus `npm run build`
(SEC-03 touches `'use server'` files, where an exported non-function throws at
runtime while every other gate passes).

### Wave 2 — Fix what is silently wrong (SAFE, ~half a day)
4. `BUG-01` — the counterfactual unit bug, **with** the `cohort_gender` test that
   would have caught it.
5. `BUG-02` — drop the native idle timeout below the cookie Max-Age, and add the
   no-cookie eviction test.
6. `BUG-03` — one putts-per-round formula; fix the misleading docstring.

### Wave 3 — Make the gates mean something (DECISION)
7. Decide `GATE-02`/`GATE-03` together. Three options:
   - run the full suite on PRs — costs runner time and **multiplies the
     production seeding**;
   - keep PRs cheap but stop calling the skipped job "Playwright E2E", and make
     the real one required on main;
   - leave as is and accept that PR green carries no E2E signal.
   Doing nothing is a choice; it should be a stated one.
8. `GATE-04` — add the two golf coach secrets. Expect new failures: this is
   uncovered surface, not working surface.
9. `GATE-06` — one `--workers=1` run of the two suspect specs to separate flake
   from regression, before trusting any main verdict.
10. `GATE-05` — make the #310 test import the real component, or delete it.

### Wave 4 — Structure (DECISION where marked)
11. `INFRA-07` — review the **32 unaccounted migrations** per-file. Until then
    prod's migration table is not a trustworthy record. Highest-risk open item.
12. `INFRA-08` — decide whether worktrees may symlink `.env`.
13. `INFRA-09` — bump `sharp`, `adm-zip`, `uuid`; assess `extract-zip` (no patch).
14. `SEC-04` — audit `SECURITY DEFINER` functions; close the 2026-07-29 leak.

### Wave 5 — Sweep (P3, batch)
15. Delete the dead components in one commit.
16. Deduplicate `formatToPar*` and the metric labels.
17. Correct the drifted docs and the `surface-registry` hrefs.

### Wave 0 — Before anything else (TIME-BOXED, minutes)
0. **`INFRA-11`** — triage the three orphaned stashes. `stash@{2}` (4,858
   insertions) is ~6 days from reflog expiry and its branch is already deleted.
   **Do not run `git gc --prune` until this is done.**

### Do these three first
1. **INFRA-11** — the only item with a clock. Everything else waits; this doesn't.
2. **SEC-01** — a mass-email endpoint gated on a third, undocumented auth
   authority, of exactly the kind that already caused one outage here.
3. **INFRA-12** — the migration drift invalidates the assumption every other
   safety net rests on: that `supabase/migrations/` can rebuild production.

Runners-up, both cheap: **SEC-03** (copy a sibling's auth call, highest blast
radius) and **BUG-01** (the only finding actively producing wrong coaching output
for every player today).

---

## 7. Coverage gaps in this audit

State these so nobody reads the report as exhaustive.

- **Baseball business logic was never checked for correctness.** Every bug
  dimension skewed golf. Recruiting eligibility, roster/lineup rules and
  messaging are unaudited. `src/lib/inngest/functions.ts:141-145` also records
  that no baseball CoachHelm function is registered, while
  `src/app/baseball/actions/coachhelm.ts` references it as if live.
- **`SECURITY DEFINER` functions and RLS policies** were not read directly
  (see SEC-04).
- **Integrations** — Stripe, Inngest, email, notifications, Capacitor/iOS —
  went unexamined.
- **Nothing was executed.** No suite was run, because peer sessions had runs in
  flight in this shared checkout. Every claim here is from reading source, not
  from observing a failure.
