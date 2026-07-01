-- ============================================================================
-- Migration: 20260701003000_baseball_lineups_rls_capability.sql
-- NN-2 (docs/CLEANSLATE_JOB_LIST.md) — close the same direct-PostgREST
-- capability/status bypass fixed in #549 for the two tables that PR
-- deliberately deferred: baseball_team_lineups and baseball_lineup_positions.
--
-- FINDING (verified live against pg_policies on 2026-07-01): both tables
-- still carry a legacy `FOR ALL` policy with no capability check and no
-- staff-status check ("Coaches can manage their team lineups" /
-- "Coaches can manage lineup positions"), which OR's in alongside no other
-- write policy and silently grants any team staff row (any status) full
-- write access. #549 deferred these two tables because the correct
-- capability, can_manage_lineups — confirmed via
-- src/app/baseball/actions/lineups.ts (requireBaseballCapability(teamId,
-- 'can_manage_lineups')) and src/lib/baseball/capabilities.ts — referenced a
-- column that didn't exist on baseball_team_coach_staff, so gating on it
-- would have risked a runtime error instead of closing the bypass.
--
-- REQUIRES 20260701002000_baseball_staff_capability_columns.sql (NN-1) to
-- have already added baseball_team_coach_staff.can_manage_lineups. Both ship
-- in this PR, ordered by filename so the column-add applies first.
--
-- ZIP NON-NEGOTIABLES honored:
--   * ADDITIVE / re-runnable — to_regclass()-guarded DO blocks, DROP POLICY
--     IF EXISTS then CREATE POLICY, TO authenticated only. No destructive
--     DROP TABLE/COLUMN.
--   * No new anon grants.
--   * The existing player-facing SELECT policies ("Players can view their
--     team lineups" / "Players can view lineup positions") are untouched.
--
-- Self-review before writing this:
--   * Read path: the dropped ALL policy was ALSO the coaches' only read
--     path on both tables (the remaining SELECT policy on each is
--     player-only). A staff SELECT policy is added on both tables so
--     coaches keep read access after the ALL policy is gone.
--   * Head-coach writes: has_baseball_staff_capability() short-circuits to
--     true for is_head_coach regardless of the specific capability column,
--     so head coaches keep write access with no dependency on NN-1's
--     backfill.
--   * Primary-but-not-head-coach writes: has_baseball_staff_capability()
--     does NOT short-circuit on is_primary, so these coaches depend on
--     NN-1's backfill (can_manage_lineups = true where is_primary = true)
--     to keep write access. Verified live: 5/5 current
--     baseball_team_coach_staff rows are is_primary = true, so this is a
--     verified no-op for every staff member who can write today.
--   * baseball_lineup_positions has no team_id column (confirmed via
--     information_schema) — the capability check must resolve team_id
--     through the parent lineup (lineup_id -> baseball_team_lineups.team_id).
--     This subquery only needs the coach's own staff row on that team; it
--     does not touch baseball_players or player_id at all, so it resolves
--     identically regardless of whether a player row exists for anyone
--     involved.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1 — baseball_team_lineups
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_team_lineups') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Coaches can manage their team lineups" ON public.baseball_team_lineups';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_team_lineups_staff_select" ON public.baseball_team_lineups';
    EXECUTE $p$CREATE POLICY "baseball_team_lineups_staff_select" ON public.baseball_team_lineups
      FOR SELECT TO authenticated
      USING (public.is_baseball_team_staff(team_id))$p$;

    EXECUTE 'DROP POLICY IF EXISTS "baseball_team_lineups_insert" ON public.baseball_team_lineups';
    EXECUTE $p$CREATE POLICY "baseball_team_lineups_insert" ON public.baseball_team_lineups
      FOR INSERT TO authenticated
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_lineups'))$p$;

    EXECUTE 'DROP POLICY IF EXISTS "baseball_team_lineups_update" ON public.baseball_team_lineups';
    EXECUTE $p$CREATE POLICY "baseball_team_lineups_update" ON public.baseball_team_lineups
      FOR UPDATE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_lineups'))
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_lineups'))$p$;

    EXECUTE 'DROP POLICY IF EXISTS "baseball_team_lineups_delete" ON public.baseball_team_lineups';
    EXECUTE $p$CREATE POLICY "baseball_team_lineups_delete" ON public.baseball_team_lineups
      FOR DELETE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_lineups'))$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- SECTION 2 — baseball_lineup_positions (scoped via parent lineup; no
-- team_id column of its own)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_lineup_positions') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Coaches can manage lineup positions" ON public.baseball_lineup_positions';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_lineup_positions_staff_select" ON public.baseball_lineup_positions';
    EXECUTE $p$CREATE POLICY "baseball_lineup_positions_staff_select" ON public.baseball_lineup_positions
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.baseball_team_lineups l
          WHERE l.id = baseball_lineup_positions.lineup_id
            AND public.is_baseball_team_staff(l.team_id)
        )
      )$p$;

    EXECUTE 'DROP POLICY IF EXISTS "baseball_lineup_positions_insert" ON public.baseball_lineup_positions';
    EXECUTE $p$CREATE POLICY "baseball_lineup_positions_insert" ON public.baseball_lineup_positions
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.baseball_team_lineups l
          WHERE l.id = baseball_lineup_positions.lineup_id
            AND public.has_baseball_staff_capability(l.team_id, 'can_manage_lineups')
        )
      )$p$;

    EXECUTE 'DROP POLICY IF EXISTS "baseball_lineup_positions_update" ON public.baseball_lineup_positions';
    EXECUTE $p$CREATE POLICY "baseball_lineup_positions_update" ON public.baseball_lineup_positions
      FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.baseball_team_lineups l
          WHERE l.id = baseball_lineup_positions.lineup_id
            AND public.has_baseball_staff_capability(l.team_id, 'can_manage_lineups')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.baseball_team_lineups l
          WHERE l.id = baseball_lineup_positions.lineup_id
            AND public.has_baseball_staff_capability(l.team_id, 'can_manage_lineups')
        )
      )$p$;

    EXECUTE 'DROP POLICY IF EXISTS "baseball_lineup_positions_delete" ON public.baseball_lineup_positions';
    EXECUTE $p$CREATE POLICY "baseball_lineup_positions_delete" ON public.baseball_lineup_positions
      FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.baseball_team_lineups l
          WHERE l.id = baseball_lineup_positions.lineup_id
            AND public.has_baseball_staff_capability(l.team_id, 'can_manage_lineups')
        )
      )$p$;
  END IF;
END $$;
-- ============================================================================
