<!--
STATUS: SUPERSEDED
DATE: 2026-07-10
SUPERSEDED BY / WHY: Dated 2026-07-01, "Status: NOT production-ready today." Superseded a week later by docs/audits/PRODUCTION_READINESS_MISSION_2026-07-09.md, whose commit message explicitly states it supersedes in-flight notes.
KEPT FOR HISTORY -- do not delete this file.
-->

<!-- BaseballHelm — PRODUCTION READINESS MASTER PLAN.
     Supersedes-by-absorption: docs/baseball/ui-migration-execution-plan.md is the WS-UI workstream (referenced, not duplicated).
     Author: Fable 5 lead planner · 2026-07-01 · Branch: batch/baseball-fixes · Deploy vehicle: PR #650.
     Audience: Sonnet 5 execution agents with ZERO prior context. Every task is a self-contained spec block. -->

# BaseballHelm — Production Readiness Master Plan

**Status: NOT production-ready today. Ship path: 4 phases, ~55 tasks, 2 hard blockers first.**

---

## 0. Executive verdict

BaseballHelm's codebase is structurally healthy — typecheck green, lint under every ratchet ceiling,
~90 unit/integration suites (855/860 passing), 33 pgTAP RLS suites CI-enforced, and a mature
Living-Annual design system with two flagship surfaces already migrated. But **production is actively
broken in two places right now**: (1) **#651 schema drift** — 11 of 12 columns the code queries are
confirmed missing from the live DB (verified via `information_schema`, not just the filed issue),
silently zeroing Stats Center's official catching/fielding/baserunning splits for every team; and
(2) **#652** — a mutual RLS recursion between `baseball_announcements` and
`baseball_announcement_recipients` throwing 42P17 on player reads in prod logs. These two are why
**PR #650's CI is fully red** (build, unit, contracts, Supabase RLS, Playwright, smoke). On top of
that, three correctness defects survived the fleet: the #434 innings-pitched decimal-sum bug was
fixed in `stats-center.ts`/`BoxScoreView.tsx` but **not** in `player-passport.ts` or
`scout-packet.ts` (wrong ERA/WHIP on the two recruiting-facing documents), a live-failing ERA
invariant test whose stale raw-float expectation contradicts the correct thirds-aware code (the test
gets rewritten, not the code — WS0.4), and an unpaginated 1000-row-capped read on the
highest-cardinality event tables.
Meanwhile 22 redundant fleet PRs (#550–#571, #641–#649) sit open against `main` duplicating content
already merged into `batch/baseball-fixes` — pure noise that must be closed.

**The plan:** Phase 1 clears the release blockers and gets #650 green; Phase 2 hardens correctness,
security, and tests; **#650 merges and deploys at the Phase-2 gate**; Phase 3 runs the already-planned
Living-Annual UI migration (WS-UI, absorbed from `ui-migration-execution-plan.md`) on a successor
batch branch; Phase 4 closes performance, observability, demo, and docs. Every task below is written
so a fresh Sonnet 5 agent cannot fail: exact files owned, preserve-list, verification command, gotchas,
effort, dependencies.

---

## 1. How execution runs (guardrails — read before ANY task)

- **Model split:** Sonnet 5 executes every task. Fable/Opus plans only. One task = one agent = one PR.
- **Repo:** `/Users/ricknini/Downloads/helmv3`. **All PRs target `batch/baseball-fixes`** (NOT `main`)
  until the Phase-2 deploy gate; after #650 merges, Phase 3+ PRs target the successor branch
  `batch/baseball-ui-annual`. **≤15 files per PR.** Rebase onto the batch tip immediately before merge
  (the branch actively receives merges).
- **PR #650 is the deploy vehicle.** Nobody edits its diff to "fix CI" — CI goes green by landing the
  root-cause tasks (WS0) on the batch branch. Its documented deploy sequence (re-enable Vercel builds →
  apply migration `20260701020000` → merge) is authoritative; do not alter it.
- **The prime directive:** never touch `src/lib/baseball/read-models/`, `**/actions/**`, hooks,
  `supabase/`, or RLS **unless the task explicitly IS a data/security fix and lists that file under
  "Files owned."** A reviewer must reject any diff touching an unowned file.
- **Frozen shared files (owner-only, no exceptions):** `src/lib/baseball/nav-registry.ts`,
  `src/app/baseball/(dashboard)/BaseballFairwayShell.tsx`, `src/app/baseball/(dashboard)/layout.tsx`,
  `src/components/baseball/living-annual/molecules/EmptyIssue.tsx` (presets added once by owner in
  WS-UI Batch 0), the living-annual barrels, `Header`, `ui/*`.
- **Verification gate (every task, before claiming done):** run the task's listed verification
  command(s) AND `npm run typecheck` AND `npm run lint` (0 new warnings — ratchet
  `node scripts/lint-ratchet.mjs` must not trip). Paste command output in the PR body. No
  evidence → no merge.
- **Database rules (shared golf+baseball prod DB):**
  - Migrations are **additive only** (`ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`,
    `DROP POLICY IF EXISTS` + recreate). Never DROP/RENAME columns or touch any `golf_*` object.
  - Apply via `mcp__supabase__apply_migration`, never raw DDL through `execute_sql`.
  - **`schema_migrations` is UNRELIABLE** — a migration can be recorded-but-unran. ALWAYS verify DDL
    took effect via a direct `information_schema` / `pg_policies` / `pg_proc` query after applying.
  - **Recurring project gotcha:** creating/replacing functions, matviews, or tables in `public`
    auto-grants to `anon` + `authenticated`. Every new object gets an explicit
    `REVOKE ALL ... FROM anon;` and the PR must show a `pg_proc.proacl`/`pg_class.relacl` check.
- **Rollback:** every code task reverts with `git revert <merge-commit>` on the batch branch (no
  destructive DB coupling). Migration tasks are additive-only, so rollback = ship a follow-up
  migration reverting only the objects the task created (columns may stay — they're nullable/additive
  and harmless); never `DROP COLUMN` in a rollback on the shared prod DB. If a deploy of #650
  regresses prod, re-promote the previous Vercel deployment (instant), then revert on the branch.
- **Ledger discipline:** `docs/audits/HELMV3_ISSUE_LEDGER_2026-06-30.md` + `CLEANSLATE_JOB_LIST.md`
  remain the wave-sequencing source of truth for issue numbers; check an issue's ledger status before
  re-fixing (e.g., anything marked "after #394" — confirm #394 first).

---

## 2. Workstreams

Severity legend: **P0** = blocks the #650 deploy · **P1** = must land before GA sign-off · **P2** = post-deploy fast-follow.
Effort: S ≤ half-day · M ≤ 1 day · L = multi-PR (split ≤15 files each).

---

### WS0 — Release blockers (P0 · 6 tasks · everything else queues behind these)

#### WS0.1 · #651 schema-drift reconcile migration (P0 · S)
- **What:** Create `supabase/migrations/<new_timestamp>_baseball_651_column_reconcile.sql` with
  `ADD COLUMN IF NOT EXISTS` for all 11 confirmed-missing columns, copying the exact types/defaults/
  CHECKs from their original source migrations:
  - `baseball_practice_effectiveness_reviews.disposition`, `.focus_area` → types/CHECK in
    `supabase/migrations/20260624000094_baseball_practice_effectiveness.sql` (~lines 68, 113, 156–157)
  - `baseball_stat_sources.source_name`; `baseball_fielding_events.measured_at`, `.chance_difficulty`
    (~342–369); `baseball_baserunning_events.measured_at`, `.runner_id` (~456–483);
    `baseball_catching_events.measured_at`, `.catcher_id` (~388–437);
    `baseball_plate_appearances.data_context` (~144) → all in
    `supabase/migrations/20260624000080_baseball_elite_stat_event_model.sql`
  - `baseball_decision_log.detail` → `supabase/migrations/20260624000310_baseball_decision_log.sql` (~62)
  Apply via `mcp__supabase__apply_migration`.
- **Files owned:** `supabase/migrations/<new_timestamp>_baseball_651_column_reconcile.sql` (CREATE).
- **Preserve:** additive-only; no DROP/RENAME/type-change; no RLS changes in this migration; do not
  alter any live CHECK constraint (verify via `information_schema.check_constraints` first if a
  column already exists with a different CHECK); zero golf_* objects.
- **Verify:** `mcp__supabase__execute_sql`:
  `select table_name, column_name from information_schema.columns where (table_name,column_name) in (('baseball_practice_effectiveness_reviews','disposition'),('baseball_practice_effectiveness_reviews','focus_area'),('baseball_stat_sources','source_name'),('baseball_fielding_events','measured_at'),('baseball_fielding_events','chance_difficulty'),('baseball_baserunning_events','measured_at'),('baseball_baserunning_events','runner_id'),('baseball_catching_events','measured_at'),('baseball_catching_events','catcher_id'),('baseball_plate_appearances','data_context'),('baseball_decision_log','detail'));`
  → **must return all 11 rows.** Then load `/baseball/dashboard/stats-center` for a team with official
  games: fielding/catching/baserunning splits non-zero (previously silently empty).
- **Gotchas:** `mcp__supabase__list_migrations` says these migrations are "applied" — that tracking is
  known-unreliable (20260624000310's own header says "NOT applied"). Trust only `information_schema`.
- **Depends on:** nothing. Blocks: WS0.6, WS6.1, WS8.1, all CI-green claims.

#### WS0.2 · #652 announcements RLS infinite recursion (P0 · S–M)
- **What:** Break the confirmed mutual-recursion cycle: `baseball_announcements_select_player`
  (baseline SQL `supabase/migrations/20260527000000_prod_public_baseline.sql:17718`) runs EXISTS
  subqueries on `baseball_announcement_recipients`, while exactly three recipients policies — full
  verbatim names **`baseball_ann_recipients_select_coach`**, **`baseball_ann_recipients_insert`**,
  **`baseball_ann_recipients_delete`** (baseline :17675–17692; note NO `_select` infix on the
  insert/delete ones — use these EXACT strings in `DROP POLICY IF EXISTS`, since a misspelled name
  silently no-ops and leaves the recursion in place) — subquery `baseball_announcements` back →
  42P17. A FOURTH recipients policy, **`baseball_ann_recipients_select_player`** (baseline :17693,
  qual `player_id = get_my_player_id()`), is NON-recursive and NOT part of the cycle — leave it
  completely untouched. New migration
  `supabase/migrations/<new_timestamp>_baseball_652_announcements_rls_fix.sql`:
  1. Create three `SECURITY DEFINER STABLE` helpers with `SET search_path = ''`:
     `public.baseball_announcement_has_recipients(p_announcement_id uuid) returns boolean`,
     `public.baseball_announcement_is_recipient(p_announcement_id uuid) returns boolean` (compares
     against `public.get_my_player_id()`), and
     `public.baseball_is_announcement_coach(p_announcement_id uuid) returns boolean` (looks up
     `team_id` from `public.baseball_announcements` then `public.is_baseball_team_coach(team_id)`).
  2. `REVOKE ALL ON FUNCTION ... FROM public, anon; GRANT EXECUTE ... TO authenticated;` for each.
  3. `DROP POLICY IF EXISTS` + recreate `baseball_announcements_select_player` using helpers 1+2
     (same visibility semantics: member AND (no recipients OR is recipient)); recreate the three
     recipients policies — `baseball_ann_recipients_select_coach`, `baseball_ann_recipients_insert`,
     `baseball_ann_recipients_delete`, exactly those names — using helper 3 in place of the
     announcements subquery. Do NOT drop or recreate `baseball_ann_recipients_select_player`.
  Apply via `mcp__supabase__apply_migration`. Add a pgTAP suite
  `supabase/tests/rls/baseball_announcements_recursion.sql` (copy the harness pattern from an
  existing `supabase/tests/rls/baseball_*.sql` suite) asserting: player on team reads broadcast +
  targeted-to-them announcements, cannot read targeted-to-others; coach reads all team announcements
  and recipients rows; **no 42P17 raised** on any of those reads.
- **Files owned:** the new migration (CREATE), `supabase/tests/rls/baseball_announcements_recursion.sql` (CREATE).
- **Preserve:** exact visibility semantics of the current policies (member-broadcast OR
  targeted-recipient for players; coach full-team); `is_baseball_team_member`/`is_baseball_team_coach`/
  `get_my_player_id` helpers unchanged; INSERT/UPDATE announcement policies unchanged;
  `baseball_ann_recipients_select_player` untouched (non-recursive); no app-code changes.
- **Verify:** `supabase test db` (or CI "Supabase lint + RLS tests" job) green incl. the new suite;
  `mcp__supabase__execute_sql`: `select policyname, qual from pg_policies where tablename in ('baseball_announcements','baseball_announcement_recipients');`
  → confirm EXACTLY these three recipients policies now show helper-based quals
  (`baseball_ann_recipients_select_coach`, `baseball_ann_recipients_insert`,
  `baseball_ann_recipients_delete`) plus the helper-based `baseball_announcements_select_player`,
  AND that `baseball_ann_recipients_select_player` still has its original qual
  (`player_id = get_my_player_id()`) unchanged — if any of the three still shows a
  `baseball_announcements` subquery, the DROP name was wrong and silently no-opped;
  `select proname, proacl from pg_proc where proname like 'baseball_announcement%' or proname='baseball_is_announcement_coach';`
  shows **no anon** in proacl; `mcp__supabase__get_logs` (postgres) shows zero new 42P17 for
  `baseball_announcements` after the fix.
- **Gotchas:** the recurring project failure mode is agents shipping `GRANT ... TO anon` on new
  SECURITY DEFINER functions — REVOKE first and paste the proacl check. Do NOT fold this into WS0.1's
  migration (separate concerns, separate rollback).
- **Depends on:** nothing (parallel with WS0.1). Blocks: WS0.6; announcements UI work in WS-UI Batch A.

#### WS0.3 · Close the 22 redundant fleet PRs (P0-hygiene · S · no code)
- **What:** PRs #550, 552, 553, 554, 557, 559, 560, 566–571, 641–649 (base=`main`, all BLOCKED /
  CHANGES_REQUESTED) duplicate content already merged into `batch/baseball-fixes` (verified 1:1 by
  merge-commit branch names). Close each with a comment citing the matching
  `Merge remote-tracking branch 'origin/fix/baseball-…'` commit SHA on `batch/baseball-fixes`
  (find via `git log --oneline origin/batch/baseball-fixes | grep <branch>`), then delete the dead
  `fix/baseball-*` source branches.
- **Files owned:** none — GitHub admin only (`gh pr close`, `git push origin --delete`).
- **Preserve:** `batch/baseball-fixes`, PR #650, `main` — untouched. Do NOT close #650.
- **Verify:**
  `gh pr list --state open --json number --jq '.[].number' | grep -Ex '(550|552|553|554|557|559|560|56[6-9]|57[01]|64[1-9])'`
  → MUST output nothing. (Do NOT grep for a `#` prefix — piped `gh pr list` prints bare numbers, so a
  `#`-anchored grep passes vacuously even while all 22 PRs are still open. `-x` exact-line match also
  prevents false hits on unrelated PRs like 551/556/558/561–565 if they ever open.) Then
  `git fetch --prune && git branch -r | grep 'fix/baseball'` → empty (prune FIRST — stale local
  remote-tracking refs will false-fail this check after the remote branches are deleted).
- **Depends on:** nothing. Parallel with everything.

#### WS0.4 · Live-failing ERA invariant — the TEST is stale, the code is CORRECT (P0 · S)
- **What:** `npx vitest run --project unit src/contracts/baseball/stats/pitching-invariants.test.ts`
  currently FAILS at line ~70. **Decision (settled — do not re-litigate): product intent IS
  thirds-aware innings.** `finalizePitching` (`src/lib/baseball/read-models/stats-center.ts:434–437`)
  already divides ERA/WHIP/K9/BB9/HR9/H9 by `ipToInnings(p.ip)` with an explicit `(#434)` comment —
  that thirds-aware denominator IS the intended #434 fix, and WS1.1 installs the identical
  `ipToInnings` denominators in player-passport/scout-packet for consistency. **Do NOT modify
  `finalizePitching` or any denominator in stats-center.ts.** The stale side is the test: the case at
  `pitching-invariants.test.ts:63–71` (it-block titled "innings accumulate as raw float addition with
  no thirds-notation conversion…", whose own comment labels it "the documented needs-decision gap")
  encodes pre-#434 behavior. Rewrite that case to feed VALID thirds notation and expect thirds-aware
  math: `const ip = sumInningsPitched([0.2, 0.2]);` (import from `@/lib/baseball/innings`) → assert
  `ip` toBeCloseTo `1.1`; then `finalizePitching(pitchingFixture({ ip, er: 1, bb: 0, h: 0, k: 0 }))`
  → assert `p.era` toBeCloseTo `(1 * 9) / ipToInnings(1.1)` === **6.75** (1 ER over 4 outs = 1⅓ true
  innings). Rewrite the it() title (e.g. "innings accumulate thirds-aware via sumInningsPitched and
  rates divide by true innings (#434 contract)") and replace the "needs-decision gap" comment with a
  note that the decision is made: thirds-aware per #434.
- **Files owned:** `src/contracts/baseball/stats/pitching-invariants.test.ts` ONLY.
  (`src/lib/baseball/read-models/stats-center.ts` is read-only reference for this task — if you
  conclude it needs an edit, STOP and escalate; changing it here regresses #434 on Stats Center.)
- **Preserve:** `finalizePitching`'s `ipToInnings` denominators (stats-center.ts:434–437) — FORBIDDEN
  to change; every other passing assertion in `pitching-invariants.test.ts` and
  `batting-invariants.test.ts`; the #434 `sumInningsPitched` accumulation at stats-center.ts:929–930.
- **Verify:** `npx vitest run --project unit src/contracts/baseball/stats/pitching-invariants.test.ts` green;
  `npx vitest run --project unit baseball` shows the failure count drop by exactly this test;
  `git diff --name-only` for the PR contains ONLY the test file (no stats-center.ts change).
- **Gotchas:** the old fixture's ip=0.4 is NOT valid thirds notation (the tenths digit is an out
  count, max .2) — that's why the old raw-float expectation (era 22.5) can never match the
  thirds-aware code (which reads 0.4 as 4 outs → era 6.75). Do NOT "fix" by reverting the code to
  raw-float division, and do not keep an invalid `.4` fixture.
- **Depends on:** nothing. Blocks: WS0.6 (unit-test CI leg).

#### WS0.5 · Failing nav tests triage (P0 · S)
- **What:** Two suites fail on the batch branch:
  `src/lib/baseball/__tests__/nav-manifest.test.ts` (an alias href resolves to no on-disk route) and
  `src/lib/baseball/__tests__/program-type-nav-variants.test.ts` (3 ordering/set-conservation
  assertions across College vs Showcase: `events`/`teams`/`organization` drift). Trace whether
  `BASEBALL_NAV_MANIFEST` / nav-registry was edited by an in-flight merge without updating fixtures;
  fix the manifest data or update expectations to the intentional new nav set — with a PR-body
  justification for whichever side changes.
- **Files owned:** the two test files; `src/lib/baseball/nav-manifest.ts` (or wherever
  `BASEBALL_NAV_MANIFEST` lives — locate via `grep -rn "BASEBALL_NAV_MANIFEST" src/lib/baseball`).
  **NOT** `src/lib/baseball/nav-registry.ts` if the fix can avoid it (frozen file — if the root cause
  is genuinely in nav-registry.ts, escalate to the owner rather than editing).
- **Preserve:** the invariants themselves — do NOT delete/skip/weaken assertions to force green;
  set-conservation across program types and no-dead-alias are real UX contracts.
- **Verify:** `npx vitest run --project unit src/lib/baseball/__tests__/nav-manifest.test.ts src/lib/baseball/__tests__/program-type-nav-variants.test.ts` green.
- **Depends on:** nothing. Blocks: WS0.6.

#### WS0.6 · Re-run PR #650 CI → green gate (P0 · S · no code)
- **What:** After WS0.1, WS0.2, WS0.4, WS0.5, WS1.1 land on `batch/baseball-fixes` AND WS8.1's
  re-seed has run against the live DB, re-run checks on #650 and confirm the previously-failing legs
  pass: Next build, Unit tests, Business contracts, Supabase lint + RLS, Playwright (chromium),
  Smoke checks, seeded smoke (goes green only after WS8.1 — if it is the sole red leg, confirm WS8.1
  actually ran before filing anything). Do NOT edit code under this task — any remaining red leg
  spawns a new root-cause task, filed against this plan.
- **Files owned:** none.
- **Verify:** `gh pr checks 650` → all listed legs pass (CodeRabbit review latency expected; branch
  protection on main requires CodeRabbit + CodeQL + "all" + "Smoke checks").
- **Depends on:** WS0.1, WS0.2, WS0.4, WS0.5, WS1.1, WS8.1.

---

### WS1 — Data & stat correctness (P0/P1 · 3 tasks)

#### WS1.1 · #434 residual: innings-pitched decimal-sum in player-passport + scout-packet (P0 · S)
- **What:** Propagate the #434 fix. In `src/lib/baseball/read-models/player-passport.ts`: add
  `import { sumInningsPitched, ipToInnings } from '@/lib/baseball/innings';` (mirror
  stats-center.ts:47); replace line ~1188 `ip += Number(p.ip ?? 0);` with
  `ip = sumInningsPitched([ip, p.ip]);`; after the loop compute
  `const trueInnings = ipToInnings(ip);` and use it as the era/whip denominator at ~1219–1220
  (`era: trueInnings > 0 ? r2((er * 9) / trueInnings) : null`, same for whip with `(bbPit + pH)`);
  keep `ip: r2(ip)` for display. Apply the identical change in
  `src/lib/baseball/read-models/scout-packet.ts` at ~516 and ~540/544–545 (same variable names).
  Add regression test `src/lib/baseball/read-models/__tests__/player-passport-ip.test.ts`: rows with
  ip=6.1 and ip=6.2 → summary ip === 13.0 (not 12.3), era computed against 13-true-innings.
- **Files owned:** `src/lib/baseball/read-models/player-passport.ts`,
  `src/lib/baseball/read-models/scout-packet.ts`,
  `src/lib/baseball/read-models/__tests__/player-passport-ip.test.ts` (CREATE).
- **Preserve:** batting slash-line math (already correct); `officialGameIds` filtering; the returned
  `pitchingSummary`/`pitchingLine` object shapes — only ip accumulation + era/whip denominator change.
- **Verify:** `npx vitest run --project unit src/lib/baseball/read-models/__tests__/player-passport-ip.test.ts`
  green; `npx vitest run --project unit src/lib/baseball/innings.test.ts` still green.
- **Gotchas:** do NOT re-fix stats-center.ts or BoxScoreView.tsx — verified already correct; do NOT
  re-flag #436 (OBP/SLG/OPS — done, columns confirmed live) or #445 (resolved by design).
- **Depends on:** nothing. Feeds WS0.6.

#### WS1.2 · elite-stat-events unpaginated 1000-row cap (P1 · M)
- **What:** `src/lib/baseball/read-models/elite-stat-events.ts` `buildQuery()` (~1063–1090) reads
  `baseball_pitch_events` / `baseball_batted_ball_events` / `baseball_swing_events` /
  `baseball_plate_appearances` with no pagination → silent non-deterministic 1000-row truncation
  (PostgREST server cap; `.limit()` does NOT lift it). Import `fetchAllRowsResult` from
  `'@/lib/supabase/fetch-all-rows'` (as stats-center.ts:46 does); add
  `.order('id', { ascending: true })`; replace the 4-way `Promise.all` of direct builders with 4
  `fetchAllRowsResult<RowType>((from, to) => …​.range(from, to))` calls, copying the exact pattern at
  stats-center.ts:756–814 including the optional-`playerId` `.or()`/`.eq()` ternary before `.range()`.
- **Files owned:** `src/lib/baseball/read-models/elite-stat-events.ts` + its test file (extend or
  CREATE `src/lib/baseball/read-models/__tests__/elite-stat-events-pagination.test.ts`).
- **Preserve:** downstream aggregation (hitterPitches/pitcherPitches Maps, summary counters); the
  `hasBaseballCapability` staff gate; the existing soft-degrade `if (…error)` handling — swap query
  construction only.
- **Verify:** vitest test mocking >1 page of rows asserts full count returned (not 1000);
  `grep -n "select('\\*')" src/lib/baseball/read-models/elite-stat-events.ts` — every hit paired with
  `.range(` in its chain; `npm run typecheck`.
- **Depends on:** WS0.1 (same tables get their missing columns first — avoids test churn).

#### WS1.3 · recalculateTeamAggregates N+1 batching (P2 · M)
- **What:** `src/app/baseball/actions/stats.ts` ~659–666 loops
  `await recalculatePlayerAggregates(member.player_id, teamId)` sequentially (60+ round trips for a
  30-man roster; serverless-timeout risk). Preferred: single
  `SELECT * FROM baseball_player_stats WHERE team_id=$1`, group in memory by player_id, one
  `upsert(array, { onConflict: 'player_id,team_id' })` reusing the exact math in
  `recalculatePlayerAggregatesAction`. Minimum acceptable: `Promise.all` over the existing per-player calls.
- **Files owned:** `src/app/baseball/actions/stats.ts` (+ a test if one exists for this action).
- **Preserve:** identical aggregate math (career_avg/obp/slg/ops, practice_avg, game_avg,
  pressure_gap, recent_trend, trend_data); the `can_manage_stats` capability gate.
- **Verify:** `npm run typecheck`; existing stats action tests green; before/after wall-clock on a
  25+ player team (console.time or Vercel function duration).
- **Gotchas:** the ledger marks #436-adjacent stats.ts work "after #394" — confirm #394's status in
  `docs/audits/HELMV3_ISSUE_LEDGER_2026-06-30.md` before touching stats.ts. Supabase upsert with
  onConflict needs the authenticated UPDATE grant (known project gotcha) — it exists for this table
  (the current code already upserts); don't add grants.
- **Depends on:** #394 status check. Phase 4.

---

### WS2 — Security / RLS / PII (P0→P1 · 3 tasks; WS0.2 is the P0 security fix)

#### WS2.1 · Post-fix RLS verification sweep on the announcements family (P1 · S)
- **What:** After WS0.2, run the full pgTAP RLS suite locally (`supabase test db`) and audit
  `pg_policies` for the whole announcements family (`baseball_announcements`,
  `baseball_announcement_recipients`, plus any `baseball_announcement_*` siblings) for remaining
  cross-table policy references that could recreate a cycle; cross-check
  `docs/BASEBALL_RLS_SECURITY_AUDIT.md` rows for these tables and update its status column.
- **Files owned:** `docs/BASEBALL_RLS_SECURITY_AUDIT.md` (status rows only).
- **Preserve:** no policy changes in this task — findings become new WS2 tasks.
- **Verify:** `supabase test db` green (all 33+ suites);
  `select tablename, policyname from pg_policies where tablename like 'baseball_announcement%';`
  output pasted in PR body with a one-line cycle-freedom argument per policy.
- **Depends on:** WS0.2.

#### WS2.2 · anon-grant sweep on all objects created by this plan (P1 · S)
- **What:** The documented recurring failure: new functions/matviews/tables in `public` auto-grant to
  `anon`. After WS0.1 + WS0.2 (and again at the Phase-2 gate), run:
  `select proname, proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like 'baseball%' and proacl::text like '%anon%';`
  and the `pg_class.relacl` equivalent for tables/views. Any hit → `REVOKE` migration + re-verify.
- **Files owned:** a revoke migration IF needed (CREATE); otherwise evidence-only.
- **Verify:** both queries return zero rows; paste output.
- **Depends on:** WS0.1, WS0.2.

#### WS2.3 · Recruiting PII spot-check on scout-packet export (P1 · S · VERIFY-ONLY)
- **What:** Scout-packet entry points in `src/app/baseball/actions/scout-packet.ts`
  (`mintScoutPacketLink`, `getScoutPacketPreview`, `resolveScoutPacketByToken`, and every other
  exported action there) are STAFF exports of the coach's OWN roster player. They are deliberately
  gated by a **three-layer gate, NOT by `assertCoachCanRecruitPlayer`** (the file header says "the
  scout-packet read model is the gate"). Verify — do not modify code: (1) every exported entry point
  carries the capability wrapper `requiredCapability: 'can_export_reports'` (grep currently shows it
  at lines ~127/192/212/232/276/367); (2) `readVisibilityState` (~:92) filters packet content per
  passport `visibility_state`; (3) the `scoutExportEnabled` (~:109) program-settings gate is checked
  on mint/preview/resolve paths; (4) `withheldFieldCount` honesty (the packet reports how many fields
  were withheld rather than silently omitting) survives WS1.1's math edits.
  **HARD RULE: do NOT add `assertCoachCanRecruitPlayer` to any own-roster staff export/preview path —
  it denies with reason `on_own_roster` and would break every legitimate staff export while the unit
  suite stays green (this path is not covered by it).** Only if you find a CROSS-TEAM,
  recruiting/scout-facing entry point with NO gate at all: do not patch inline — file a new
  spec-block task against this plan with the exact function name and line.
- **Files owned:** none — evidence-only. (A new task gets filed if a genuine gap is found.)
- **Preserve:** `scout-packet.ts` untouched; watchlist.ts untouched; `recruitability.ts` untouched.
- **Verify:** grep output pasted in the PR/issue comment showing the `can_export_reports` wrapper +
  `readVisibilityState` + `scoutExportEnabled` at every exported entry point of scout-packet.ts
  (`grep -n "export async function\|can_export_reports\|readVisibilityState\|scoutExportEnabled\|withheldFieldCount" src/app/baseball/actions/scout-packet.ts`);
  `npx vitest run --project unit baseball` green (nothing changed).
- **Depends on:** WS1.1 (the file settles first). WS3.1 dependency dropped — verify-only, no mocks needed.

---

### WS3 — Tests (P0-coverage→P1 · 3 tasks)

#### WS3.1 · Recruiting activation gate unit tests (P0-coverage · M)
- **What:** `assertCoachCanRecruitPlayer` (`src/lib/baseball/recruitability.ts`, 7 denial reasons,
  gates every watchlist add at watchlist.ts:105/:502) has ZERO tests. Create
  `src/lib/baseball/__tests__/recruitability.test.ts` mocking the Supabase
  `.from().select().eq().in().maybeSingle()` chain (copy the pattern in
  `src/lib/baseball/__tests__/player-access-enforcement.test.ts`). Cover, in current precedence
  order: (1) coachType `high_school`/`showcase` → `coach_type_mismatch` before any DB call;
  (2) `player_not_found`; (3) `college_player`; (4) `recruiting_off`; (5) juco↔juco
  `coach_type_mismatch`; (6) `profile_private`; (7) `on_own_roster`; (8) `not_on_discoverable_team`;
  (9) all-pass → `allowed:true`, no reason. Assert both `allowed` and `reason` per case.
- **Files owned:** `src/lib/baseball/__tests__/recruitability.test.ts` (CREATE).
- **Preserve:** `recruitability.ts` and `watchlist.ts` UNTOUCHED — pure test addition; encode current
  precedence even if it looks reorderable.
- **Verify:** `npx vitest run --project unit src/lib/baseball/__tests__/recruitability.test.ts` green.
- **Depends on:** nothing.

#### WS3.2 · Pipeline stage-transition tests (P1 · S)
- **What:** Create `src/lib/recruiting/__tests__/stages.test.ts` for `getNextStage()` +
  `PIPELINE_STAGES` in `src/lib/recruiting/stages.ts`. Assert these EXACT observed values
  (`uninterested` is `PIPELINE_STAGES[4]`, the last array element): forward chain
  `getNextStage('watchlist') === 'high_priority'`, `getNextStage('high_priority') === 'offer_extended'`,
  `getNextStage('offer_extended') === 'committed'`; **`getNextStage('committed') === 'uninterested'`**
  (NOT null — the helper walks the array and `uninterested` is array-last; add a test comment flagging
  this semantic oddity: "committed 'advances' to uninterested because uninterested sits last in
  PIPELINE_STAGES — encoded as observed behavior, review if the pipeline UI ever auto-advances");
  `getNextStage('uninterested') === null`; stage ids in UI order —
  `PIPELINE_STAGES.map(s => s.id)` deep-equals
  `['watchlist','high_priority','offer_extended','committed','uninterested']` and
  `PIPELINE_STAGES.length === 5`; colors present —
  `PIPELINE_STAGES.every(s => s.color.length > 0)`. Do NOT attempt a runtime assertion on
  `PipelineStageColor` itself — it is a TypeScript type (line ~41), not a runtime value.
- **Files owned:** `src/lib/recruiting/__tests__/stages.test.ts` (CREATE).
- **Preserve:** `stages.ts` untouched. If observed behavior diverges from the CLAUDE.md spec, test
  the OBSERVED behavior and flag the discrepancy in a comment — don't silently assert the spec.
- **Verify:** `npx vitest run --project unit src/lib/recruiting/__tests__/stages.test.ts` green.
- **Depends on:** nothing.

#### WS3.3 · Decision-room readiness aggregation tests (P1 · M)
- **What:** `src/lib/baseball/read-models/decision-room/readiness.ts` (coach-facing rollup) is
  untested while its per-player compute (`src/lib/baseball/lifting/readiness-compute.ts`) has strong
  honesty invariants. Create tests covering: (1) correct per-player→roster band rollup; (2) a player
  with stale/missing check-ins is neither dropped nor defaulted to green (mirror the "NEVER emits a
  confident green on stale data" invariant); (3) empty-roster / all-missing → honest empty/
  low-confidence result, no throw, no fabricated data. Follow the fixture pattern in
  `src/lib/baseball/lifting/__tests__/readiness-compute.test.ts`.
- **Files owned:** `src/lib/baseball/read-models/decision-room/__tests__/readiness.test.ts` (CREATE).
- **Preserve:** `readiness.ts` and `readiness-compute.ts` untouched.
- **Verify:** `npx vitest run --project unit src/lib/baseball/read-models/decision-room/__tests__/readiness.test.ts` green.
- **Depends on:** nothing.

*Backlog note (not tasked, next triage seam):* untested read-models — player-today, player-passport,
lift-builder, strength-groups, player-lift, video-classes, live-weight-room, practice-effectiveness,
postgame, scout-packet, performance-command, signal-inbox, lift-programs, command-center-adapter,
coach-daily-contracts, timeline, coach-notes, remaining decision-room/*. Triage by grepping for
exported functions in read-models with no matching `__tests__` file after Phase 3.

---

### WS-UI — Living-Annual migration (P1 · 31 tasks · ABSORBED, not duplicated)

**The authoritative spec is `docs/baseball/ui-migration-execution-plan.md`** (per-surface specs,
kit cheat-sheet, fork-collapse recipe, verification checklist) + `docs/baseball/ui-migration-map.md`
(coverage matrix). This master plan **absorbs it as workstream WS-UI verbatim** — 29 surfaces
(Pressbox 16 · War Room 6 · Passport 7) + owner Batch 0 (EmptyIssue presets) + owner Batch H
(PlayerPassportCard deletion, doc ticks) = **31 tasks**, its internal batches 0/A–H and its conflict
map stand as written, with these reconciliations:

- **Runs in Phase 3, on the successor branch** `batch/baseball-ui-annual` (created off `main` after
  #650 deploys). Do not start Batch A until the Phase-2 gate — the announcements surface reads a
  table that 42P17s until WS0.2 lands, and Playwright/smoke can't verify UI on a red base.
- **PR #555 gate: CLEARED** (merged) — `travel` is unblocked in its Batch C slot.
- **command-center + stats-center: DONE — do not touch** (reference implementations).
- Fairway frames for roster/calendar/tasks/announcements/documents/messages already merged
  (#629–#639) → those surfaces start from Shape A of the fork-collapse recipe.
- Its non-negotiables (presentation-only, no read-model/action/RLS edits, EmptyIssue-not-amber,
  StatReadout numbers, ink discipline, reduced-motion) are enforced by the same reviewer-reject rule
  as this plan. Its §5 checklist is the per-surface verification gate.
- **WS5.1 (dashboard-shell.tsx) is explicitly OUTSIDE WS-UI ownership** — no UI batch owns that file;
  the legacy shell stays load-bearing for (coach-dashboard)/(player-dashboard) route groups.

---

### WS4 — Performance (P2 · 1 task; WS1.2/WS1.3 carry the other perf wins)

#### WS4.1 · Parallelize strength-groups read-model queries (P2 · S)
- **What:** `getStrengthGroupsBoard()` in `src/lib/baseball/read-models/strength-groups.ts` runs five
  mutually-independent awaited blocks sequentially (workload ~148–176, availability ~182–192,
  readiness+soreness ~197–222, bodyweight ~227–235, lift sessions ~241–249) — all depending only on
  teamId/playerIds/sinceYmd. Wrap the five in one `await Promise.all([...])` of extracted helpers.
  Keep roster (~110–120) and groups/members (~123–141) fetches sequential (playerIds dependency).
- **Files owned:** `src/lib/baseball/read-models/strength-groups.ts`.
- **Preserve:** exported signatures (`getStrengthGroupsBoard`, `getStrengthGroupDetail`);
  `StrengthGroupsBoardData` shape; the rule-engine call site; the batched `.in(...)` pattern — no
  per-player N+1.
- **Verify:** `npm run typecheck`; `npx vitest run --project unit strength-groups` (if a suite
  exists); dev Network tab on `/baseball/dashboard/performance/groups` shows overlapping Supabase
  calls, identical rendered data.
- **Depends on:** nothing. Phase 4. (Conflict note: WS-UI Batch C `performance` surface owns the
  page/client presentation — different files; land WS4.1 before or after, never concurrently with an
  agent editing the same read-model — which none do.)

---

### WS5 — Mobile / iOS / A11y (P1 · 2 tasks)

#### WS5.1 · #483 safe-area-top on the legacy baseball shell (P1 · S)
- **What:** `src/components/baseball/dashboard-shell.tsx:241` sticky header
  (`sticky top-0 z-30 flex min-h-14 … px-4 py-2 …`) has no `env(safe-area-inset-top)` — content sits
  under the iOS notch in the Capacitor WebView. This file is the LIVE shell for the
  (coach-dashboard)/coach and (player-dashboard)/player route groups (via
  `src/components/baseball/BaseballShellLayout.tsx` — confirmed; do NOT misroute the fix to
  `BaseballFairwayShell.tsx`, which is a nested content shell that already handles insets). Add
  `pt-[env(safe-area-inset-top)]` to the sticky bar's className (pattern:
  `src/components/fairway/app-shell/FairwayTopBar.tsx:143`; this file already uses safe-area at
  line ~234). If sticky descendants (hub sub-nav, page headers) offset from the bar, introduce
  `--baseball-mobile-header-offset: env(safe-area-inset-top, 0px)` (mirror golf's
  `--golf-mobile-header-offset` in `src/app/golf/(dashboard)/FairwayDashboardShell.tsx:683`) or use
  the existing `.safe-area-top` utility (globals.css ~1908).
- **Files owned:** `src/components/baseball/dashboard-shell.tsx` ONLY.
- **Preserve:** min-h-14 / z-30 / border / backdrop classes; Sidebar, MobileBottomNav, HubSubNav
  untouched; do NOT migrate/delete this shell (route groups depend on it verbatim); zero golf files;
  `BaseballFairwayShell.tsx` frozen.
- **Verify:** `npm run typecheck`; Chrome DevTools device toolbar (iPhone 15 Pro preset) on
  `/baseball/coach/*` and `/baseball/player/*`: NotificationBell/top-row not clipped by the status
  bar; desktop unchanged (env() → 0px).
- **Depends on:** nothing — fully parallel with WS0.1/WS0.2 (disjoint files). Land in Batch 0.

#### WS5.2 · Device pass: tap targets + Capacitor offline behavior (P1 · M · audit)
- **What:** Two explicitly-unverified areas from the mobile facet: (a) tap-target sizing (≥44px) on
  `FairwayBottomNav` and the legacy `MobileBottomNav` (locate both via
  `grep -rln "BottomNav" src/components/baseball src/components/fairway`); (b) Capacitor iOS
  offline/end-to-end behavior against the route-contract runbook
  (`docs/baseballhelm-finish-runbook.md`). Produce findings as new scoped tasks; fix only
  single-file tap-target CSS inline if trivial (<15 lines).
- **Files owned:** audit-only + at most the two bottom-nav component files for CSS-only sizing fixes.
- **Preserve:** navigation logic, route contracts, nav-registry.ts (frozen).
- **Verify:** `npm run typecheck`; DevTools tap-target overlay (or chrome-devtools a11y audit) shows
  every bottom-nav hit area ≥44×44 on a 390px viewport.
- **Depends on:** Phase 3+ (after WS-UI Batch A so the audit covers the kit-era surfaces).

---

### WS6 — Observability & error-honesty (P1 · 2 tasks)
*(The attached observability facet assessment was a placeholder; these tasks derive from confirmed
in-code contracts and the Mission Control error funnel.)*

#### WS6.1 · Stats Center silent-degrade → logged, honest degrade (P1 · M)
- **What:** `src/lib/baseball/read-models/stats-center.ts` (~828–830) documents "Event reads degrade
  SILENTLY" — the exact contract that let #651 zero out official splits for weeks with no signal.
  After WS0.1: (1) on each event-read error, `console.error('[baseball:stats-center] <table> read
  degraded', error.code, error.message)` so Vercel/Sentry funnels capture it (Sentry is wired
  app-wide; no new SDK setup); (2) thread a boolean per degraded family (e.g.
  `catchingDegraded: true`) into the read-model's returned payload; (3) in the already-migrated
  `StatsCenterClient.tsx`, render the degraded family's section as `<EmptyIssue variant="stats">`
  (or a ghost `RuledStatLine`) instead of zeros — honest-empty, never fabricated zeros, never an
  amber warning box.
- **Files owned:** `src/lib/baseball/read-models/stats-center.ts`,
  `src/components/baseball/stats-center/StatsCenterClient.tsx`, their test files.
- **Preserve:** all stat math — especially `finalizePitching`'s thirds-aware `ipToInnings`
  denominators (stats-center.ts:434–437, the #434 contract that WS0.4's test now locks in; WS0.4
  merges FIRST so the invariant suite is green before this file is edited); the soft-degrade
  principle itself (never throw a whole-page error for one family); pagination blocks at 756–814;
  payload fields existing consumers read (additive flags only).
- **Verify:** `npx vitest run --project unit stats-center` green (extend the suite: mocked read error
  → degraded flag true + no fabricated zeros); `npm run typecheck`; grep diff for `bg-amber|bg-yellow` → none.
- **Depends on:** WS0.1, WS0.4 (same-file sequencing).

#### WS6.2 · Prod error-funnel verification post-deploy (P1 · S · no code)
- **What:** After the Phase-2 deploy, confirm the two Mission-Control-detected error classes are
  gone: `mcp__supabase__get_logs` (postgres) over the retention window shows zero new 42703
  (`column … does not exist` on baseball_*) and zero 42P17 (`baseball_announcements`); check the
  Sentry helm-xs project for new baseball issues since deploy. Any recurrence → file a root-cause
  task against this plan.
- **Files owned:** none (evidence in a comment on PR #650 / the ledger).
- **Verify:** log query outputs pasted; Sentry search link.
- **Depends on:** #650 deployed.

---

### WS7 — Feature-completeness & dead-code (P2 · 2 tasks)

#### WS7.1 · Ledger reconciliation: 22 absorbed fleet issues (P2 · M · audit)
- **What:** The 22 closed fleet PRs (WS0.3) claimed fixes for issues #427…#509 etc. For each, verify
  the acceptance criterion actually holds on `batch/baseball-fixes` (the merge could have been
  content-complete but conflict-resolved wrong): re-run each issue's stated repro/verification from
  `docs/audits/HELMV3_ISSUE_LEDGER_2026-06-30.md`, close verified issues with evidence, reopen (as
  new scoped tasks) anything that regressed.
- **Files owned:** none (GitHub + ledger doc status updates only:
  `docs/audits/HELMV3_ISSUE_LEDGER_2026-06-30.md`).
- **Verify:** each issue closed carries a pasted verification-command output.
- **Depends on:** WS0.6 (verify on a green base).

#### WS7.2 · Post-migration dead-code + feature-matrix truth pass (P2 · S)
- **What:** After WS-UI Batch H: run `npx knip` (or the repo's dead-export tooling) scoped to
  `src/components/baseball` + `src/app/baseball`; delete orphans the UI migration left; update
  `docs/operations/BASEBALLHELM_FEATURE_READINESS_MATRIX.md` and
  `memory/context/baseballhelm-features.md` so every row reflects post-plan reality. (Per the
  BaseballHelm remediation rules: spec-first, delete dead code, keep the features memory current.)
- **Files owned:** deleted orphan components (list in PR); the two docs above.
- **Preserve:** anything imported anywhere (verify with grep before each delete); frozen shared files.
- **Verify:** `npm run typecheck` + `npm run lint` green after deletions; `grep -rn "<DeletedName>" src` → empty per deletion.
- **Depends on:** WS-UI Batch H.

---

### WS8 — Seed / Demo (P0-gate · 1 task — runs in Batch 1, NOT the deploy gate)

#### WS8.1 · Re-seed demo + seeded smoke green (P0-gate · S · Batch 1)
- **What:** The Rini University Baseball demo (team `2acc63ce`; coach njrini99 / player rinin376) was
  seeded before #651's columns existed, so demo rows have NULLs in the reconciled columns and the
  "BaseballHelm seeded smoke (advisory)" CI leg on PR #650 is red. **This task MUST run in Batch 1 —
  before the WS0.6 green gate — because the seeded-smoke leg is part of WS0.6's all-green requirement
  and can only turn green after the re-seed.** Its only dependency (WS0.1) applies the #651 migration
  to the live DB immediately in Batch 0, so re-seeding can run pre-gate. Steps: after WS0.1's columns
  are confirmed via `information_schema`, re-run `scripts/seed-rini-baseball-demo.ts` (npx tsx; read
  its header for required env) to repopulate incl. the new columns; then trigger a fresh check run on
  #650 and confirm the seeded-smoke leg.
- **Files owned:** `scripts/seed-rini-baseball-demo.ts` (only if it needs the new columns added to
  its inserts — additive edits only).
- **Preserve:** golf demo data untouched (shared DB); existing demo credentials; do NOT
  delete-then-reinsert if the script offers upsert paths (house rule: no destructive writes).
- **Verify:** "BaseballHelm seeded smoke (advisory)" leg passes on the next #650 check run (i.e.
  BEFORE #650 merges — this verify is impossible post-merge, another reason this task cannot sit in
  the deploy-gate batch); demo login shows non-zero Stats Center splits.
- **Depends on:** WS0.1 (migration applied to live DB). Blocks: WS0.6 (seeded-smoke leg).

---

### WS9 — CI / Gates / Docs (P1 · 2 tasks)

#### WS9.1 · Merge & deploy PR #650 (P0 execution step · S · owner)
- **What:** At the Phase-2 gate (WS0 complete, WS1.1, WS3.1 landed, CI green): execute #650's own
  documented deploy sequence exactly — re-enable Vercel builds → apply migration `20260701020000`
  (OBP/SLG/OPS) if not already live (verify via `information_schema`, not schema_migrations) → merge
  #650 to main (branch protection: CodeRabbit + CodeQL + "all" + Smoke). Then create
  `batch/baseball-ui-annual` off the new main for Phase 3.
- **Files owned:** none.
- **Verify:** `gh pr view 650 --json state` → MERGED; prod Vercel deployment healthy; WS6.2 funnel
  check scheduled.
- **Depends on:** WS0.6.

#### WS9.2 · Docs + ratchet close-out (P1 · S)
- **What:** After each phase gate: (a) update `docs/audits/BASEBALLHELM_PRODUCTION_VERDICT.md` with
  the new verdict + evidence; (b) optionally re-lock the lint ratchet
  (`npm run lint:ratchet -- --update`) ONLY if counts dropped (never to admit new warnings); (c) tick
  this plan's task table (add a ✅ column as tasks land); (d) keep `CLAUDE.md`'s baseball routing
  line current per WS-UI §6.
- **Files owned:** the docs listed; `.lint-baseline.json` (down-only).
- **Verify:** `node scripts/lint-ratchet.mjs` green; docs render.
- **Depends on:** each phase gate.

---

## 3. Batch schedule (conflict-free, reconciled with the live pipeline)

All Phase 1–2 PRs → `batch/baseball-fixes` (≤15 files, rebase-before-merge). Phase 3–4 PRs →
`batch/baseball-ui-annual`. Tasks inside a batch own disjoint files → run concurrently.

| Batch | Phase | Tasks (concurrent) | Gate to exit |
|---|---|---|---|
| **Batch 0 — release-blockers** (blocks all) | 1 | **WS0.1** #651 migration · **WS0.2** #652 RLS · **WS0.3** close 22 fleet PRs · **WS5.1** #483 safe-area (disjoint: 2 new migrations + 1 pgTAP file + dashboard-shell.tsx + GitHub admin) | information_schema shows 11 cols; pg_policies helper-based; no 42P17 in logs; fleet PRs closed |
| **Batch 1 — CI-green correctness** | 1 | **WS0.4** ERA invariant test fix (pitching-invariants.test.ts only) · **WS0.5** nav tests · **WS1.1** #434 residual (passport/scout-packet) · **WS8.1** re-seed demo → seeded-smoke leg (needs WS0.1's live migration from Batch 0; must run BEFORE the gate) — all file-disjoint | **WS0.6**: `gh pr checks 650` all green incl. seeded smoke |
| **Batch 2 — harden before deploy** | 2 | **WS3.1** recruitability tests · **WS3.2** stages tests · **WS3.3** readiness tests · **WS2.1** RLS sweep · **WS2.2** anon sweep · **WS1.2** elite-stat-events pagination · **WS6.1** stats-center honesty (AFTER WS0.4 — same file) · **WS2.3** scout-packet gate (AFTER WS1.1) | full unit suite + `supabase test db` green |
| **DEPLOY GATE** | 2 | **WS9.1** merge #650 → main → prod · **WS6.2** funnel check · WS9.2 verdict update (WS8.1 already done in Batch 1 — its verify runs against #650 pre-merge and is impossible after) | prod healthy; zero 42703/42P17 |
| **Batch 3 — WS-UI Batch 0** (owner) | 3 | EmptyIssue presets (announcements/travel/discover/dev-plan); freeze restated | presets in; `npm run typecheck` |
| **Batches 4–10 — WS-UI A→H** | 3 | Per `ui-migration-execution-plan.md` §4.2 verbatim: A (calendar·announcements·tasks·documents·messages/[id]) → B (roster·my-stats·analytics·practice-effectiveness·postgame) → C (practice·import·performance·settings×2·travel[unblocked]) → D (scout-packets·discover·watchlist) → E (pipeline·signals·decision-room) → F (passport·dev-plan·profile·activate) → G (today·timeline·college-interest) → H (owner cleanup: delete PlayerPassportCard, doc ticks). A–G may overlap across lanes; hard edges: 0-before-all, F apart from G, H after F+G | its §5 checklist per surface |
| **Batch 11 — long tail** | 4 | **WS1.3** stats.ts batching (confirm #394 first) · **WS4.1** strength-groups parallelize · **WS5.2** device pass · **WS7.1** ledger reconciliation · **WS7.2** dead-code + matrix · **WS9.2** final docs | full gates green; PRODUCTION_VERDICT updated to SHIP |

---

## 4. Cross-surface conflict map (file-ownership; a reviewer rejects any PR crossing a line)

| Shared/contended file | Owner task(s) | Rule |
|---|---|---|
| `src/lib/baseball/read-models/stats-center.ts` | WS6.1 only (WS0.4 is read-only on it) | WS6.1 (Batch 2) makes the only edit; WS0.4 (Batch 1) merges first but touches only its test file. WS-UI never touches read-models. |
| `src/components/baseball/stats-center/StatsCenterClient.tsx` | WS6.1 | Already migrated (do-not-touch for WS-UI); WS6.1 makes the only sanctioned edit (degrade rendering). |
| `src/app/baseball/actions/stats.ts` | WS1.3 only | Confirm #394 in the ledger first. No other task touches it. |
| `src/lib/baseball/read-models/{player-passport,scout-packet}.ts` | WS1.1 | WS-UI Batch F `passport` + Batch D `scout-packets` consume them read-only (presentation). WS1.1 lands Phase 1, long before Batch D/F. |
| `src/components/baseball/dashboard-shell.tsx` | WS5.1 only | NOT part of WS-UI; legacy shell stays live for coach/player route groups. Nobody migrates/deletes it in this plan. |
| `nav-registry.ts` · `BaseballFairwayShell.tsx` · `(dashboard)/layout.tsx` · living-annual barrels · `Header` · `ui/*` | FROZEN (owner) | No task in this plan edits them. WS0.5 escalates to owner if nav-registry is the root cause. |
| `molecules/EmptyIssue.tsx` | WS-UI Batch 0 owner, once | Surface agents + WS6.1 consume presets; never edit. |
| `supabase/migrations/*` (new) | WS0.1 and WS0.2 each own their OWN file | Never share a migration file across tasks; additive-only; golf_* untouchable. |
| `PlayerPassportCard.tsx` | WS-UI Batch H owner deletes | Batches F and G build new files and stop importing it first (per UI plan). |
| `src/lib/baseball/recruitability.ts` · `watchlist.ts` · `stages.ts` · `readiness*.ts` · `actions/scout-packet.ts` | NOBODY (test tasks are additive-only; WS2.3 is verify-only) | WS3.x create test files only; WS2.3 touches nothing (evidence-only — a genuine gap becomes a NEW filed task, never an inline patch). |
| `.lint-baseline.json` | WS9.2 owner | Down-only re-locks. |

**Placeholder-assessment note:** four of the ten attached facet assessments were schema-validation
placeholders (facet "test" ×3 and the observability facet body); their fake blockers (`a.ts`,
`a.sql`) are **discarded** — no tasks derive from them. WS6 was reconstructed from confirmed in-code
contracts + the Mission Control error funnel instead. Duplicates merged: #483 appeared in two
assessments (one canonical task, WS5.1); #651/#652/#650-CI causality appeared in two (WS0.1/WS0.2/
WS0.6); #434-residual and the ERA failure are distinct defects (WS1.1 vs WS0.4) despite both being
"pitching math".

---

## 5. Definition of SHIP

BaseballHelm is production-ready when: (1) #650 merged + deployed, prod logs show zero baseball
42703/42P17 for 72h (WS6.2); (2) the full unit project + 33+ pgTAP suites + contracts + Playwright +
smoke are green on main; (3) the recruiting gate, stage machine, and readiness rollup have invariant
tests (WS3); (4) every one of the 29 WS-UI surfaces is checked off in `ui-migration-map.md` with
legacy deleted; (5) `BASEBALLHELM_PRODUCTION_VERDICT.md` re-issued as SHIP with command evidence;
(6) the feature-readiness matrix and `baseballhelm-features.md` match reality. Anything discovered
en route becomes a new spec-block task in this file — no drive-by fixes.
