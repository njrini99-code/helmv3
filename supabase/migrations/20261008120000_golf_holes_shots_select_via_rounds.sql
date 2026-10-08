-- STATUS: WRITTEN, NOT APPLIED. HOLD in supabase/migrations/HELD.md (owner
-- applies). Apply: npm run db:apply --
-- supabase/migrations/20261008120000_golf_holes_shots_select_via_rounds.sql
-- Risk: MEDIUM (SELECT RLS on the two hottest golf tables; no write policy,
-- function, grant or data change).
--
-- WHAT: golf_holes and golf_shots each get ONE SELECT policy for
-- authenticated:
--     round_id IN (SELECT gr.id FROM public.golf_rounds gr)
-- The subquery is uncorrelated, so it runs once per statement (hashed
-- SubPlan) under the CALLER's golf_rounds RLS, instead of once per hole/shot
-- row. Holes and shots are readable exactly when their round is readable.
-- INSERT, UPDATE and DELETE policies are not touched.
--
-- WHY (production, read-only, 2026-10-08, demo coach, one team of 125 rounds):
--   select ... from golf_shots where round_id in (team's rounds)
--   current policies   506-553 ms; SubPlan re-checks golf_rounds RLS plus
--                      is_golf_team_coach / is_golf_team_player / is_admin
--                      for each of 6,977 shot rows
--   RLS bypassed         4.7 ms
--   the new subquery   150 ms once per statement (seq scan of 778 rounds with
--                      the golf_rounds policy helpers per round). Expected
--                      total about 155 ms, roughly 3x faster. Its cost grows
--                      with the whole golf_rounds table, not with the
--                      caller's rounds.
--   TRADE-OFF: the subquery is paid by EVERY statement, including a read of
--   one round (current: 7.9 ms for 70 shots; after: ~111 ms warm, ~14x
--   slower) and UPDATE/DELETE/RETURNING, which also evaluate SELECT policies.
--   pg_stat_statements' hottest golf_shots/golf_holes statements are
--   multi-round PostgREST reads averaging 0.7-2.5 s, which this speeds up.
--   Unmeasured: 20261007100000 (SQL-language helpers) may cut the per-round
--   cost of the subquery roughly 10x (0.0125 ms vs 0.19 ms per round locally).
--
-- EQUIVALENCE
--   golf_shots, before: golf_shots_select = EXISTS(round gr visible under
--     golf_rounds RLS AND (own player OR is_golf_team_coach OR
--     is_golf_team_player)) OR admin_read_all = is_admin().
--   golf_rounds SELECT = is_admin() OR golf_rounds_select (own player OR
--     team coach OR team player) OR golf_rounds_select_team (team coach).
--   So "round visible" = own OR coach OR player OR admin, which is exactly
--   the old golf_shots union. golf_shots.round_id is NOT NULL (0 null rows
--   live), so admin_read_all granted nothing beyond the round path and is
--   dropped: the table goes from 2 SELECT policies to 1.
--   golf_holes, before: golf_holes_select (same shape as golf_shots_select)
--     OR golf_holes_select_team (team coach, a subset). No admin policy.
--   golf_holes, after: the same set PLUS admin read. This is the one access
--     change: admins could already read every round and every shot, now
--     they can read the holes too. golf_holes.round_id is NOT NULL.
--   Proven by the old-vs-new oracle in
--   supabase/tests/rls/golf_holes_shots_select_via_rounds.sql.
--
-- ORDER vs 20261007101000_golf_holes_shots_policy_consolidation.sql (merged,
-- NOT applied; it moves the same two SELECT policies onto the SECURITY
-- DEFINER golf_readable_round_ids()). This file is correct in either order:
--   * this after 101000: golf_holes_select is replaced, golf_shots_select is
--     altered, golf_readable_round_ids() stays defined but unused.
--   * 101000 after this: 101000 re-creates golf_holes_select and alters
--     golf_shots_select onto its function. Same access minus admin hole
--     read, which 101000 never had; admin_read_all on golf_shots stays
--     dropped, so admins would lose shot read too. Apply this file LAST.
--     101000's own VERIFY expects 5 golf_shots policies including
--     admin_read_all, so it fails if this file went first.
--
-- golf_shots_select is ALTERed, not dropped and re-created: the schema guard
-- src/test/schema/golf-shots-select-policy-count.test.ts replays CREATE then
-- DROP per file and would read a drop-and-recreate as the policy removed.
--
-- ROLLBACK: supabase/rollbacks/20261008120000_golf_holes_shots_select_via_rounds.rollback.sql
-- ROLLBACK: recreates the exact production SELECT policies of 2026-10-08
-- ROLLBACK: (verbatim from pg_policies): golf_holes_select, golf_holes_select_team,
-- ROLLBACK: golf_shots_select and golf_shots admin_read_all. Kept in that file and
-- ROLLBACK: not here because the schema guard above parses comments too.
--
-- VERIFY: select 1 where (select count(*) from pg_policies where schemaname = 'public' and tablename = 'golf_holes' and cmd = 'SELECT') = 1;
-- VERIFY: select 1 where (select count(*) from pg_policies where schemaname = 'public' and tablename = 'golf_shots' and cmd = 'SELECT') = 1;
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'golf_holes' and policyname = 'golf_holes_select' and roles = '{authenticated}' and qual like '%round_id IN ( SELECT gr.id%FROM golf_rounds gr))';
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'golf_shots' and policyname = 'golf_shots_select' and roles = '{authenticated}' and qual like '%round_id IN ( SELECT gr.id%FROM golf_rounds gr))';

SET LOCAL lock_timeout = '3s';

-- golf_holes -----------------------------------------------------------------
DROP POLICY IF EXISTS golf_holes_select ON public.golf_holes;
DROP POLICY IF EXISTS golf_holes_select_team ON public.golf_holes;

CREATE POLICY golf_holes_select ON public.golf_holes
FOR SELECT TO authenticated
USING (round_id IN (SELECT gr.id FROM public.golf_rounds gr));

-- golf_shots -----------------------------------------------------------------
DROP POLICY IF EXISTS admin_read_all ON public.golf_shots;

ALTER POLICY golf_shots_select ON public.golf_shots
TO authenticated
USING (round_id IN (SELECT gr.id FROM public.golf_rounds gr));
