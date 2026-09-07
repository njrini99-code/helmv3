<!--
STATUS: SUPERSEDED
DATE: 2026-07-10
SUPERSEDED BY / WHY: Superseded by docs/audits/COACHHELM_MASTER_ENGINE_FEATURE_REMEDIATION_AUDIT_2026-06-21.md (302-finding scrub, 13 days later). Its direct sequel COACHHELM_TO_95_REGRADE_2026-06-09.md already lives in docs/archive/2026-06/audits/ — this file was left behind.
KEPT FOR HISTORY -- do not delete this file.
-->

# CoachHelm 55-to-95 Audit

Date: 2026-06-08
Branch: `feat/coachhelm-to-90`
Scope: CoachHelm v3 validity, read-path correctness, migration/RLS release safety, local verification gates, and remaining evidence required before claiming a 95-grade release.

## Verdict

The branch is much stronger than the earlier 55-grade state and now clears the main local release gates after one build-blocking issue was fixed during this audit. I would not honestly call it a 95 yet.

Current assessed grade: 88-90 locally verified.

The gap to 95 is not ordinary test coverage. It is live-data proof and lifecycle closure:

1. The causality attribution cron still selects old insights without the same v3/lifecycle/status filters used by delivery surfaces.
2. The documented stale-row cleanup remains a systemic dependency for generators that stop emitting rows.
3. The Phase H post-deploy smoke is still unchecked, so there is no evidence that attribution rows and moved coach weights exist after deployment.
4. New migrations replay through unit/RLS tests, but local Supabase database lint could not run because the local database was not running.

## Release Blocker Fixed During Audit

`npm run build` initially failed because `src/app/golf/actions/insight-delivery.ts` is a top-level `'use server'` file and exported synchronous helpers. Next treats value exports from that file as server actions, so production compilation rejected `rankEvidenceInsights` and `collapseParScoring`.

Fix:

- Moved pure ranking/dedupe/par-collapse helpers into `src/app/golf/actions/insight-delivery-ranking.ts`.
- Updated ranking and insight-delivery tests to import helpers from the non-server module.
- Re-ran focused tests, typecheck, and production build successfully.

## Verification Run

Passed:

- `npm run typecheck`
- `DOTENV_CONFIG_PATH=.env.local npm run check:stats`
- `npx vitest run`
- `npx vitest run src/app/golf/actions/__tests__/insight-delivery-rank.test.ts src/app/golf/actions/__tests__/insight-delivery-coach-feed.test.ts src/test/golf/actions/insight-delivery.test.ts`
- `npm run build`
- `npm run test:rls`

Not completed:

- `npx supabase db lint --schema public` failed because the local Supabase database was not listening on `127.0.0.1:54322`.
- Formal multi-agent security/product audit was not run because the current tool requires explicit user authorization before spawning subagents.
- Post-deploy Phase H live cron and SQL verification was not run.

## Findings

### P1: Causality attribution can learn from rows delivery would never show

File: `src/app/api/cron/v3/causality-attribute/route.ts`

The cron candidate query selects from `golf_coach_insights` by age and player presence only:

- `created_at <= cutoff`
- `player_id is not null`
- no `engine_version = v3`
- no `signature like v3:%`
- no lifecycle visibility filter
- no `status != dismissed`

The delivery read path explicitly protects coaches and players with v3, lifecycle, and dismissed filters. The attribution cron should use the same eligibility boundary unless there is a deliberate reason to learn from archived, dismissed, stale, or non-v3 rows.

Risk: old/stale insights can write attribution rows and coach-weight updates even though the product has decided those rows should not be surfaced.

Recommendation: add the same v3/lifecycle/status predicate to the cron candidate query, then add a regression test with v2, archived, dismissed, and valid v3 candidates.

### P1: 95-grade live causality proof is still missing

File: `docs/archive/2026-06/superpowers/plans/2026-06-07-coachhelm-to-90.md`

Task H5 explicitly requires a post-deploy smoke proving:

- the cron attributes at least one insight
- `golf_insight_outcome_attribution` is no longer empty
- `golf_coachhelm_coach_weights` is no longer empty
- at least one weight moves off `1.0`
- weights are not pinned to old binary `1.5` / `0.5` values

That evidence is not present in this local audit. Until it is run against the deployed environment, the adaptive learning loop should be treated as code-complete but not production-proven.

Recommendation: after deployment, run the H5 curl and Supabase SQL exactly as documented and attach the counts/distribution to the PR or release note.

### P2: Stale-row cleanup is still a systemic release dependency

Files:

- `docs/archive/2026-06/audits/COACHHELM_VALIDITY_REMEDIATION_2026-06-07.md`
- `src/lib/coachhelm/v3/generators/pressure-gap.ts`

The remediation doc states that regen refreshes emitted signatures but does not archive active rows that current generators no longer emit. The pressure-gap generator comment repeats the dependency: stale stored HIGH pressure rows are retracted by lifecycle/cleanup, not by the generator.

Risk: if a player falls below a generator's sample gate or a previous composite no longer qualifies, stale active rows can remain unless the cleanup path actually runs and is verified.

Recommendation: make stale-row cleanup an explicit release gate. Prove the latest run touches or archives all non-coach-touched detected v3 rows that the generator set no longer emits.

### P2: Per-player feed still ranks from a capped newest-first prefetch

File: `src/app/golf/actions/insight-delivery.ts`

The player feed fetches at most `PRE_RANK_FETCH = min(100, max(50, limit * 5))`, orders by newest first, then applies composite ranking and dedupe. The team-wide coach feed was upgraded to paginate all visible rows before ranking, but the per-player path still assumes the visible set is under 100.

Risk: a player with more than 100 visible v3 insights can still lose an older high-impact row before ranking ever sees it.

Recommendation: either prove the per-player visible set cannot exceed 100 in production, add a season/window predicate, or paginate the player path the same way as the team-wide coach path.

### P3: New migrations lack the documented `VERIFIED` / `ROLLBACK` audit comments

Files:

- `supabase/migrations/20260608120000_charge_penalties_in_sg.sql`
- `supabase/migrations/20260608130000_cache_proximity_miss_puttspergir_alignment.sql`
- `supabase/migrations/20260608140000_cache_penalty_from_golf_holes_canonical.sql`
- `supabase/migrations/20260608150000_v3_relax_attribution_metric_fk.sql`
- `supabase/migrations/20260609090000_cache_putt_band_attempts_and_lifetime_span.sql`
- `supabase/migrations/20260609120000_pressure_gate_count_ge_3.sql`

`docs/v3-testing-standards.md` requires v3 PR verification gates and the repo's recent migration style expects explicit verification/rollback notes. These migrations appear operationally plausible and RLS tests passed, but they do not carry the audit breadcrumbs expected for a 95-grade release.

Recommendation: add concise verification and rollback comments, then run local DB lint/reset or equivalent replay validation.

## Strong Signals

- Delivery surfaces now use v3 read-path filtering (`engine_version = v3` or `signature like v3:%`) and lifecycle/status filtering.
- Team-wide coach feed paginates the full visible set before ranking, avoiding the earlier newest-100 truncation bug.
- Ranking uses the shared composite scoring helper with urgency, confidence, impact, coachability, goal boosts, and sample damping.
- The stats consistency check passed across 19 players with 0 divergent surfaces.
- Full unit test, focused ranking/feed tests, RLS tests, typecheck, and production build all pass.

## Path To A Real 95

1. Patch causality attribution candidate filtering to match v3 visible eligibility. — **DONE 2026-06-09 (addendum below)**
2. Add/verify stale-row archive sweep for generator dequalification and stale composites.
3. Run a local Supabase replay/lint gate once the local DB is available.
4. Deploy and execute Phase H post-deploy causality smoke.
5. Run the full prior-style parallel audit with explicit subagent authorization, then compare findings against this report.

## Addendum 2026-06-09 — Continuation

### P1 FIXED — and the risk it predicted materialized on prod first

The deployed (pre-Phase-H) cron wrote its FIRST attribution row on prod at
06:01 UTC today: insight `243947c8` is `engine_version='v2'` with signature
`mock-driver-fwhit-trend` — a v2 MOCK row from 2026-04-20 — and it moved coach
`71e75118`'s `tee/general` weight to exactly the old binary `1.5` (`sample_n=1`).
The H1 FK drop unblocked inserts for the OLD deployed code, so until the branch
deploys, the live loop learns from rows delivery would never show, ~50
candidates per daily run. **This raises deploy urgency** — every day undeployed
adds junk attribution rows and binary-pinned weights that the post-deploy H5
smoke will then have to distinguish from real Phase-H output. Consider wiping
`golf_insight_outcome_attribution` + `golf_coachhelm_coach_weights` (both
poison-only as of today: 1 row each) immediately after deploy, before the first
new cron run, to restore the documented zero baseline.

Fix shipped: shared `src/lib/coachhelm/v3/insight-visibility.ts`
(`V3_ENGINE_FILTER` + `VISIBLE_LIFECYCLE_STATES`) now sources BOTH the delivery
read paths and the cron candidate query (`.or(V3_ENGINE_FILTER)`,
`.in('lifecycle_state', ...)`, `.neq('status','dismissed')`). Behavioral
regression test at `src/test/api/cron/causality-attribute.test.ts` simulates
the PostgREST predicates over mixed v2/archived/tentative/dismissed/valid-v3
fixtures and fails if any predicate is dropped.

### P2 (player feed cap) FIXED

Both per-player read paths (`getInsightsForPlayer` and the `player_id` branch
of `getInsightsForCoach`) now paginate the full visible set via
`fetchAllRowsResult` (stable `id` ordering, one round trip for normal sets),
removing the `PRE_RANK_FETCH ≤ 100` assumption entirely — same shape as the A8
team-sweep fix.

### P3 (migration audit comments) DONE — with prod verification

All six migrations re-verified object-level against prod today (FK/constraint
state, pg_proc.prosrc predicates, cache columns existence + 20/20 population)
and stamped with `VERIFIED` / `HISTORY` / `ROLLBACK` blocks. Note: all six are
recorded in `supabase_migrations.schema_migrations` under their APPLY-TIME
versions (e.g. `20260608093936:v3_relax_attribution_metric_fk`), not their
filenames — the known apply_migration drift pattern; do not `db push` them.

### P2 (stale-row sweep) FIXED — plus a resurrection bug it would have amplified

`BaseGenerator` now owns retraction: generators declare an opt-in,
constructor-deterministic `signatureScope()`; on true-dequalification exits
(aggregate null / below the sample floor) and after a successful emit (keeping
the fresh signature) the base class soft-archives still-active, coach-untouched
`tentative`/`detected` rows in scope. Deliberately NO retraction on the
no-standing exit (infra lag — would flap rows), the team-toggle/philosophy
gates (product choices), or the error path. All nine generators declare scopes.
Pressure-gap's "external cleanup retracts my stale HIGH rows" dependency is
now closed in-code.

Found while building it: `updateExisting` in the v2 upsert NEVER un-archived —
any archived row whose signature re-emitted (today's age-based cron, or the new
sweep) silently received fresh evidence on a permanently invisible row. Both
update branches now resurrect archived rows to `detected` (clear `archived_at`,
stamp `metadata.redetected_at`) while leaving coach dismissals (`status`)
untouched. Tests: `generator-base-retraction.test.ts` (8 paths) +
`upsert-resurrection.test.ts` (3 branches).

### Item 3 (DB lint) — linked-prod half DONE

`npx supabase db lint --linked --schema public` against prod: **0 errors**;
only 2 pre-existing style warnings (shadowed/unused loop variable `i` in
`sg_expected_strokes`). The fresh-replay half (`supabase db reset` on a local
stack) still requires Docker, which is not running on this machine.

### Verification re-run 2026-06-09 (all of it, post-fixes)

- `npm run typecheck` — clean
- `npx vitest run` — 5,896 passed / 0 failed (517 files)
- `npm run test:rls` — 1,969 passed / 0 failed
- `npm run build` — clean
- `DOTENV_CONFIG_PATH=.env.local npm run check:stats` — 19 players, 0 divergent
- `npx supabase db lint --linked` — 0 errors

### Remaining (user-gated) — CLOSED 2026-06-09 evening

1. ~~Deploy~~ **DONE.** PR #247 had merged the branch the day before, but its
   production auto-deploy ERRORED on the 'use server' build blocker — prod was
   still serving pre-#247 code (which is what wrote the poison row). The six
   continuation commits landed via PR #248; the auto-deploy succeeded and
   `helmsportslabs.com` now serves main (`418a9923`+).
2. ~~Wipe + smoke~~ **Wipe DONE** (both poison rows deleted post-deploy; zero
   baseline restored). Manual smoke is moot: under the new eligibility filter
   there are 0 candidates — the oldest visible v3 row is 2026-05-26, so the
   21-day gate first clears **~2026-06-16**. Until then the correct daily
   06:00 UTC cron outcome is `considered: 0` with both learning tables EMPTY.
   Verify after ~06-16: attribution rows exist, weights move off 1.0, and are
   NOT pinned at the old binary 1.5/0.5.
3. Optional full parallel re-audit — still open.

### Cleanup 2026-06-09 (post-deploy)

- PR #238 merged + its table-wide `golf_rounds` UPDATE grant APPLIED to prod
  (recurring auto-save 42501 class closed; grant verified table-level).
- Six stale `_bk_*_20260606` remediation backup tables dropped from prod
  (29,591-row patterns snapshot + 5 others) — all superseded by later
  recomputes; restoring any would have regressed current state.
- Dependabot: critical (basic-ftp) + all highs in `tools/ultra-agent-audit`,
  `tools/ux-flow-auditor` (both now 0 vulns) and `helm-website-ui`
  (next 16.0.10 → 16.2.6) fixed. Remaining: 2 moderate postcss pins inside
  next's own node_modules (website), majors left to Dependabot PRs.
- PRs #243 (push dispatcher), #219 (warning-severity logging), #159 (docs
  regen) validated together locally (typecheck + 5,905 unit + 1,972 RLS +
  build, all green) but admin-merge was permission-blocked — awaiting a
  one-click merge each.

