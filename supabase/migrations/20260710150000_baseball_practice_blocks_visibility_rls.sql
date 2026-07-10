-- ============================================================================
-- Migration: 20260710150000_baseball_practice_blocks_visibility_rls.sql
-- Packet: bb-practice-game (Feature-flow sweep, 2026-07-10)
--
-- CONFIRMED P0: baseball_practice_blocks_select (defined in
-- 20260630170248_harden_baseball_phase1_rls_rollup.sql, ALREADY APPLIED --
-- that file is NOT edited here, this is a forward-only replacement) checks
-- only practice.status = 'published' + team membership. It never references
-- the `visibility` column (added 20260624000200, values 'staff_only' |
-- 'player_visible' | 'restricted', NOT NULL DEFAULT 'player_visible').
--
-- IMPACT (both confirmed against live app code, not hypothetical):
--   1. RLS itself grants every team member (any authenticated player on the
--      team) full row access regardless of visibility -- so a player who
--      queries baseball_practice_blocks directly with their own session
--      (devtools / supabase-js) can read 'staff_only' AND 'restricted'
--      blocks for any published practice. The app's own filter
--      (src/app/baseball/actions/practice.ts, `visibility !== 'staff_only'`)
--      is the ONLY thing standing between a player and that content today --
--      not RLS, contradicting the player page's own comment that staff-only
--      blocks are "filtered server-side".
--   2. That same app filter only excludes 'staff_only', so 'restricted'
--      blocks render in the ordinary player practice view unconditionally --
--      a second, independent leak that exists even before this RLS gap.
--
-- FIX: make the database the enforcement boundary. Recreate ONLY the SELECT
-- policy on baseball_practice_blocks so a non-staff team member additionally
-- needs visibility IS NULL OR visibility = 'player_visible' to read a row.
-- Staff (is_baseball_team_staff) are unaffected -- they still see every block
-- regardless of visibility, exactly as before. INSERT/UPDATE/DELETE policies
-- are untouched (unaffected by this gap; already can_manage_practice-gated).
--
-- Existence-guarded (to_regclass) + DROP POLICY IF EXISTS / CREATE POLICY so
-- this replays safely on both the CI shadow DB (full chain from migration 0,
-- table + column always present by this point) and prod (where the policy
-- already exists in the pre-fix shape from 20260630170248). Purely additive
-- narrowing of an existing SELECT policy -- no data change, no new columns.
--
-- App-level filters in src/app/baseball/actions/practice.ts (:759) and
-- src/components/baseball/practice-planner/PracticePrintExport.tsx (:56-59)
-- should ALSO be corrected to `visibility === 'player_visible'` (excluding
-- both 'staff_only' and 'restricted') so the UI matches RLS exactly and
-- 'restricted' blocks stop rendering in the player view even before this
-- migration is applied in a given environment -- degrade-gracefully: until
-- this migration runs, the app-level filter is the ONLY enforcement (same
-- as today), so tightening it there closes the 'restricted' leak
-- immediately and independently of DB rollout. (PracticePrintExport.tsx is
-- fixed alongside this migration in the same packet; practice.ts is owned
-- by a different packet -- see sharedComponentRequests.)
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.baseball_practice_blocks') IS NOT NULL
     AND to_regclass('public.baseball_practices') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "baseball_practice_blocks_select" ON public.baseball_practice_blocks';
    EXECUTE $p$CREATE POLICY "baseball_practice_blocks_select" ON public.baseball_practice_blocks
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.baseball_practices p
          WHERE p.id = baseball_practice_blocks.practice_id
            AND baseball_practice_blocks.team_id = p.team_id
            AND (
              public.is_baseball_team_staff(p.team_id)
              OR (
                p.status = 'published'
                AND public.is_baseball_team_member(p.team_id)
                AND (
                  baseball_practice_blocks.visibility IS NULL
                  OR baseball_practice_blocks.visibility = 'player_visible'
                )
              )
            )
        )
      )$p$;
  END IF;
END $$;

-- VERIFY AFTER APPLY (paste output in the PR/approval record):
--   SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
--     FROM pg_policy WHERE polrelid = 'public.baseball_practice_blocks'::regclass
--     AND polname = 'baseball_practice_blocks_select';
--   -> using_expr must reference `visibility` in the player branch.
--
-- END -- practice-block visibility RLS fix. Forward-only. Does not touch the
-- historical 20260630170248 migration file.
-- ============================================================================
