-- STATUS: WRITTEN — NOT APPLIED. Owner applies after review
-- (npm run db:apply -- supabase/migrations/20261005120000_golf_shot_tables_hardening.sql).
--
-- Golf shot-table hardening. GOLF-ONLY: touches two golf functions, six golf
-- tables and two golf_shots indexes; no baseball_* / helm_lifting_* object.
-- Pure privilege + index DDL: no function body changes, no data changes.
-- Forward-only and idempotent; the apply path runs it in one transaction.
--
-- ---------------------------------------------------------------------------
-- A. Revoke direct EXECUTE on two SECURITY DEFINER golf functions
-- ---------------------------------------------------------------------------
-- public.calculate_round_strokes_gained(uuid) and
-- public.recompute_golf_round_totals(uuid) are SECURITY DEFINER, owned by
-- postgres, have no ownership check, and (live, 2026-10-05) carry
-- proacl {postgres=X, authenticated=X, service_role=X}. Any signed-in user
-- could call either one over PostgREST for ANY round id: the first returns
-- that round's strokes-gained breakdown (a cross-team read), the second
-- rewrites that round's total_putts / total_gir / total_fairways* columns.
--
-- Callers, checked live (pg_proc.prosrc, pg_trigger) and in the repo:
--   - calculate_round_strokes_gained: NO caller at all. No pg_proc body
--     references it (submit_round_atomic and recompute_team_sg call
--     recalculate_round_strokes_gained, a different function). No .rpc() in
--     src/, scripts/ or supabase/functions/. Only the pgTAP suite
--     strokes_gained_shot_rules.sql calls it, as the superuser test role.
--   - recompute_golf_round_totals: one caller, the trigger function
--     golf_holes_recompute_round_totals_fn (SECURITY DEFINER, owned by
--     postgres), fired by trigger golf_holes_recompute_round_totals on
--     golf_holes. No other pg_proc body, no trigger on golf_shots, no .rpc()
--     anywhere in the repo. (This settles the open question
--     20260905100000_revoke_secdef_execute_from_authenticated.sql left
--     behind: the HELD draft 20260708141000 claimed a golf_shots trigger and a
--     direct .rpc() caller; neither exists live or in code.)
-- A nested call from a postgres-owned SECURITY DEFINER function runs with the
-- owner's privileges, so revoking the direct grant breaks no caller. That is
-- why this is a REVOKE and not an in-body ownership check: it needs no body
-- change, so it is independent of 20260930150000 (which CREATE OR REPLACEs
-- calculate_round_strokes_gained; CREATE OR REPLACE keeps the ACL, and this
-- REVOKE applies cleanly before or after it). service_role keeps EXECUTE.
--
-- ---------------------------------------------------------------------------
-- B. Revoke every anon privilege on six golf round/shot tables
-- ---------------------------------------------------------------------------
-- Live (2026-10-05) anon holds DELETE, INSERT, REFERENCES, SELECT, TRIGGER,
-- TRUNCATE, UPDATE on golf_rounds (766 rows), golf_holes (13,050),
-- golf_shots (51,647), putt_details (16,064), approach_miss_details (4,078)
-- and golf_player_stats_cache (72). RLS is on for all six and no SELECT
-- policy applies to anon (the only TO public policies are the coach
-- INSERT/UPDATE/DELETE ones, which need auth.uid()), so a signed-out caller
-- already sees zero rows; TRUNCATE, however, is not governed by RLS at all.
-- No anon reader exists: no view depends on these tables, no anon-key-only
-- client exists in src/ (server/browser createClient carry the user session;
-- crons use createAdminClient), golf has no public (no-auth) route besides
-- its (auth) pages, and both API routes that read these tables 401 without a
-- user. No anon column-level grants exist. authenticated and service_role
-- are unchanged.
--
-- ---------------------------------------------------------------------------
-- C. Drop the two strictly redundant prefix indexes on golf_shots
-- ---------------------------------------------------------------------------
--   idx_golf_shots_round_id    (round_id)               1976 kB, 30,423 scans
--   idx_golf_shots_round_hole  (round_id, hole_number)  3976 kB,  1,080 scans
-- Both are leading prefixes of the UNIQUE index idx_golf_shots_round_hole_shot
-- (round_id, hole_number, shot_number), 4024 kB, and of
-- idx_golf_shots_round_id_covering (same keys + INCLUDE), so every lookup
-- they serve (round_id = ?, round_id = ? AND hole_number = ?, and the
-- golf_shots.round_id FK check on golf_rounds delete) is served by those.
-- Neither backs a constraint. Scans are since a stats wipe on 2026-10-03
-- (pg_stat_bgwriter.stats_reset 2026-10-03 03:31; oldest last_idx_scan
-- 03:31:43).
--
-- NOT dropped, deliberately: the seven golf_shots indexes at idx_scan = 0
-- (golf_shots_updated_at_idx, idx_golf_shots_distance_before, _lie_after,
-- _putt_made, _putting_analysis, _result, _round_created). Their zero counts
-- cover only the ~2.8 days since that wipe, and helm_debug.db_analysis_samples
-- (unused-index sampler, 560 runs 2026-09-09 .. 2026-10-03, each listing every
-- unused index down to 16 kB) never once listed any golf_shots index before
-- the wipe, i.e. all seven had idx_scan > 0 then. Re-evaluate after ~30 days
-- of post-wipe stats.
--
-- Plain DROP INDEX: scripts/db/apply.mjs refuses CONCURRENTLY (the
-- Management API runs the file in one transaction). The ACCESS EXCLUSIVE lock
-- on golf_shots (51,647 rows) is held only for the catalog change.
--
-- ROLLBACK:
--   GRANT EXECUTE ON FUNCTION public.calculate_round_strokes_gained(uuid) TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.recompute_golf_round_totals(uuid) TO authenticated;
--   GRANT ALL ON TABLE public.golf_rounds, public.golf_holes, public.golf_shots,
--     public.putt_details, public.approach_miss_details,
--     public.golf_player_stats_cache TO anon;
--   CREATE INDEX IF NOT EXISTS idx_golf_shots_round_id ON public.golf_shots USING btree (round_id);
--   CREATE INDEX IF NOT EXISTS idx_golf_shots_round_hole ON public.golf_shots USING btree (round_id, hole_number);
--
-- VERIFY: select 1 where not has_function_privilege('authenticated', 'public.calculate_round_strokes_gained(uuid)', 'EXECUTE') and not has_function_privilege('anon', 'public.calculate_round_strokes_gained(uuid)', 'EXECUTE') and has_function_privilege('service_role', 'public.calculate_round_strokes_gained(uuid)', 'EXECUTE');
-- VERIFY: select 1 where not has_function_privilege('authenticated', 'public.recompute_golf_round_totals(uuid)', 'EXECUTE') and not has_function_privilege('anon', 'public.recompute_golf_round_totals(uuid)', 'EXECUTE') and has_function_privilege('service_role', 'public.recompute_golf_round_totals(uuid)', 'EXECUTE');
-- VERIFY: select 1 where not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon' and table_name in ('golf_rounds', 'golf_holes', 'golf_shots', 'putt_details', 'approach_miss_details', 'golf_player_stats_cache'));
-- VERIFY: select 1 where not exists (select 1 from pg_indexes where schemaname = 'public' and indexname in ('idx_golf_shots_round_id', 'idx_golf_shots_round_hole')) and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_golf_shots_round_hole_shot');

-- A. -------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.calculate_round_strokes_gained(uuid)
FROM public, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.recompute_golf_round_totals(uuid)
FROM public, anon, authenticated;

-- B. -------------------------------------------------------------------------
REVOKE ALL ON TABLE public.golf_rounds FROM anon;
REVOKE ALL ON TABLE public.golf_holes FROM anon;
REVOKE ALL ON TABLE public.golf_shots FROM anon;
REVOKE ALL ON TABLE public.putt_details FROM anon;
REVOKE ALL ON TABLE public.approach_miss_details FROM anon;
REVOKE ALL ON TABLE public.golf_player_stats_cache FROM anon;

-- C. -------------------------------------------------------------------------
-- apply.mjs runs the file in one transaction, where CONCURRENTLY cannot run.
-- squawk-ignore require-concurrent-index-deletion
DROP INDEX IF EXISTS public.idx_golf_shots_round_id;

-- apply.mjs runs the file in one transaction, where CONCURRENTLY cannot run.
-- squawk-ignore require-concurrent-index-deletion
DROP INDEX IF EXISTS public.idx_golf_shots_round_hole;
