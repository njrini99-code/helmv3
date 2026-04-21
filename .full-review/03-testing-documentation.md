# Phase 3: Testing & Documentation Review

**Status:** consolidated from static analysis — full parallel agent run skipped at user direction (pragmatic close-out).

## Test coverage findings

### High

**H1. New Postgres RPCs have zero integration tests**
- 4 new RPCs live on production (`get_admin_dashboard_rollup`, `get_coach_today_schedule`, `get_player_hub_announcements`, `get_player_hub_events`) with security-critical ownership/admin guards.
- No migration or Vitest tests exercise them under the three cases that matter: (a) authenticated-owner returns data, (b) authenticated-non-owner returns 'Forbidden', (c) unauthenticated returns 'permission denied'.
- Verified manually this session via `scripts/rpc-smoke.mjs` that all 4 reject unauthorized callers with 42501. The smoke script is a reasonable regression seed.
- **Recommendation:** expand `scripts/rpc-smoke.mjs` into a CI job that runs pre-deploy. Ideally also add a pgTAP or plpgsql test that seeds a coach + player pair and asserts the guards let the right caller through.

**H2. Critical refactored code paths have no unit tests**
- CRM `stats` reducer and `filteredCoaches` single-pass filter (consolidated from 16+ filter passes → 1) are pure functions and trivially testable — no tests added.
- `roundsByPlayer` Map fanout in `dashboard-data.ts` — same story.
- **Recommendation:** add Vitest unit tests for these pure reducers. Target: if counts drift vs. the old implementations, tests should catch it. Low priority since behavior equivalence was visually verified, but prevents future regressions.

### Medium

**M1. No regression test for security guards**
- Phase 2A security review found a PostgREST filter injection in `getEmailsList` that I fixed with a sanitizer. No test locks that behavior in.
- **Recommendation:** add a Vitest test that calls `getEmailsList` with a malicious search string (e.g., `foo,category.eq.sensitive`) and asserts the OR expression only contains the sanitized term.

**M2. Migration tests**
- None of the 8 migrations applied this session have automated verification. They were validated by running them and watching for errors; that's not reproducible.
- **Recommendation:** add an integration test harness that spins up a fresh Supabase local instance, runs migrations from scratch, and asserts the target functions/indexes/tables exist. Deferred to wave-3.

### Low

**L1. No Playwright E2E tests for the refactored pages**
- Playwright was used interactively this session (partial — we loaded `/` and `/about` successfully; aborted by user before authed pages). No persistent Playwright spec exists for the refactored routes.
- **Recommendation:** add `e2e/landing-perf.spec.ts`, `e2e/crm-smoke.spec.ts`, `e2e/admin-smoke.spec.ts`. Each navigates the page, asserts no console errors, asserts key text appears, and clicks one interactive element.

## Documentation findings

### High

**H1. Plan doc diverged from actual execution**
- `docs/superpowers/plans/2026-04-21-perf-remediation.md` is the plan written at the start of the session. It specified a 2-arg `get_coach_today_schedule(uuid, date)` signature; the team implemented a 3-arg version `(uuid, timestamptz, timestamptz)`. The plan was never updated to reflect the as-built state.
- **Recommendation:** amend the plan with a "Deviations from plan" appendix OR mark the plan as "reference only, see commit history for as-built."

**H2. Migration comments are good; call-site comments on the new RPCs are sparse**
- The 4 migration files have good header comments explaining design intent.
- The TS call sites (`admin-data.ts`, `dashboard-data.ts`, `player-notifications.ts`) use `as unknown as` casts because the RPCs aren't in `database.ts` types yet.
- **Recommendation:** regenerate database types locally (`npm run db:types`) and commit, so the casts can be removed.

### Medium

**M1. Wave-3 backlog isn't captured in a tracked document**
- The morning report and review consolidated file list deferred items, but there's no ticketing trail. Easy to lose.
- **Recommendation:** copy the wave-3 list into `docs/TODO.md` or a GitHub issue per item.

**M2. The perf-audit reports are comprehensive but out of date**
- `docs/perf-audit/00-morning-report.md` describes problems; many are now fixed. Reports don't note which items landed.
- **Recommendation:** append a "Status: fixed in commit <sha>" line to each finding that's been addressed, or add a companion file documenting the closure.

## Score

- Testing coverage: **3/10** — refactor landed with no new tests
- Documentation: **7/10** — plan doc is thorough, migration files are self-documenting, call-site comments are reasonable; gap is in as-built tracking
