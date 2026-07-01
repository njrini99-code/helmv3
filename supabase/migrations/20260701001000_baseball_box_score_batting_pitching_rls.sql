-- ============================================================================
-- Migration: 20260701001000_baseball_box_score_batting_pitching_rls.sql
-- NET-NEW (2026-07-01) — sibling of #549. Closes the same direct-PostgREST
--              capability/status write bypass on the game box-score stat tables.
--
-- FINDING (verified live against pg_policies on 2026-07-01, during the Wave-1
-- RLS audit): baseball_box_score_batting and baseball_box_score_pitching gate
-- INSERT / UPDATE / DELETE on is_baseball_team_coach_v2(team_id) only — that
-- helper checks team membership and NOTHING else: no capability flag, and no
-- active/suspended/removed status check. So ANY baseball_team_coach_staff row
-- for the team (regardless of can_manage_stats, regardless of status) can
-- insert/update/delete game batting & pitching lines via a direct PostgREST
-- call, bypassing the capability model and the app-layer gate. This is the
-- identical shape of gap #549 closed on baseball_player_stats /
-- baseball_player_season_stats; those two box-score tables were simply outside
-- #549's assigned table list.
--
-- FIX: replace the is_baseball_team_coach_v2 write policies with
-- has_baseball_staff_capability(team_id, 'can_manage_stats') — the exact
-- capability the sibling stat tables use in #549. has_baseball_staff_capability
-- enforces COALESCE(status,'active') = 'active' internally, so this closes the
-- capability bypass AND the status bypass at once, and head coaches still pass
-- (the function short-circuits to true for is_head_coach).
--
-- SCOPE / NON-NEGOTIABLES honored (same as #549):
--   * SELECT policies are NOT touched — read-path is lower severity and the
--     "Players see own + coaches see team ..." policy stays exactly as-is, so
--     no player/coach read is affected. This migration only tightens WRITES.
--   * ADDITIVE / re-runnable — DROP POLICY IF EXISTS then CREATE POLICY,
--     guarded by to_regclass() so a re-run or a not-yet-migrated environment
--     is a no-op rather than an error.
--   * No anon grants anywhere in this file.
--   * WRITTEN, NOT APPLIED. No apply_migration call was made.
--
-- NOTE (out of scope, tracked separately): baseball_team_lineups /
-- baseball_lineup_positions remain on their legacy no-capability ALL policies —
-- deferred because their capability (can_manage_lineups) references a column
-- that does not yet exist on baseball_team_coach_staff (see #549 PR body / the
-- NET-NEW NN-1 finding in docs/CLEANSLATE_JOB_LIST.md).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- baseball_box_score_batting
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_box_score_batting') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Coaches can insert batting stats" ON public.baseball_box_score_batting';
    EXECUTE $p$CREATE POLICY "baseball_box_score_batting_insert" ON public.baseball_box_score_batting
      FOR INSERT TO authenticated
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_stats'))$p$;

    EXECUTE 'DROP POLICY IF EXISTS "Coaches can update batting stats" ON public.baseball_box_score_batting';
    EXECUTE $p$CREATE POLICY "baseball_box_score_batting_update" ON public.baseball_box_score_batting
      FOR UPDATE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_stats'))
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_stats'))$p$;

    EXECUTE 'DROP POLICY IF EXISTS "Coaches can delete batting stats" ON public.baseball_box_score_batting';
    EXECUTE $p$CREATE POLICY "baseball_box_score_batting_delete" ON public.baseball_box_score_batting
      FOR DELETE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_stats'))$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- baseball_box_score_pitching
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_box_score_pitching') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Coaches can insert pitching stats" ON public.baseball_box_score_pitching';
    EXECUTE $p$CREATE POLICY "baseball_box_score_pitching_insert" ON public.baseball_box_score_pitching
      FOR INSERT TO authenticated
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_stats'))$p$;

    EXECUTE 'DROP POLICY IF EXISTS "Coaches can update pitching stats" ON public.baseball_box_score_pitching';
    EXECUTE $p$CREATE POLICY "baseball_box_score_pitching_update" ON public.baseball_box_score_pitching
      FOR UPDATE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_stats'))
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_stats'))$p$;

    EXECUTE 'DROP POLICY IF EXISTS "Coaches can delete pitching stats" ON public.baseball_box_score_pitching';
    EXECUTE $p$CREATE POLICY "baseball_box_score_pitching_delete" ON public.baseball_box_score_pitching
      FOR DELETE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_stats'))$p$;
  END IF;
END $$;

-- END — box-score batting/pitching capability+status hardening. ADDITIVE. NOT applied to any DB.
