-- ============================================================================
-- Migration: 20260701000000_baseball_rls_legacy_policy_cleanup.sql
-- Issues #405, #394, #501 — BaseballHelm: close a direct-PostgREST
--              capability/status bypass left by legacy baseline RLS policies.
--
-- FINDING (verified live against pg_policies on 2026-07-01): RLS is applied to
-- every BaseballHelm table (441 policies total), but ~9 tables still carry a
-- pre-capability-model baseline policy with `FOR ALL` and NO capability check
-- and NO staff-status check (e.g. "coach_id = my coach row" or "any staff row
-- exists for this team"). Postgres evaluates multiple PERMISSIVE policies on
-- the same command with OR — so on every affected table, that old ALL policy
-- OR's itself in alongside the newer, correctly capability-gated per-command
-- policies (has_baseball_staff_capability(team_id, '<cap>')), silently
-- overriding them. Net effect: ANY team staff row (regardless of capability
-- flags, and on several tables regardless of active/suspended/removed status)
-- can write via a direct PostgREST call, bypassing both the capability model
-- and the app-layer capability gate in src/lib/baseball/capabilities.ts.
--
-- This migration removes the legacy ALL policy on each table below and adds
-- the missing capability-gated per-command policy/policies so every write
-- path is capability-gated + status-gated (has_baseball_staff_capability()
-- itself enforces COALESCE(status,'active') = 'active', closing the status
-- bypass at the same time as the capability bypass).
--
-- ZIP NON-NEGOTIABLES honored:
--   * ADDITIVE / re-runnable — DROP POLICY IF EXISTS then CREATE POLICY,
--     guarded by to_regclass() so a re-run or a not-yet-migrated environment
--     is a no-op rather than an error. No destructive DROP TABLE/COLUMN.
--   * No new anon grants anywhere in this file.
--   * SELECT policies are NOT touched except where a table had literally no
--     existing SELECT policy at all (see box_score_uploads below) — player
--     and public visibility is left exactly as-is.
--   * This file is WRITTEN, NOT APPLIED. No apply_migration call was made.
--
-- Per-table capability choices (see PR body for the full rationale + the two
-- tables deliberately deferred out of this migration):
--   baseball_player_stats         -> can_manage_stats   (matches its own
--                                    already-gated INSERT/UPDATE policies)
--   baseball_staff_invitations    -> can_invite_staff    (matches its own
--                                    already-gated INSERT/UPDATE policies)
--   baseball_player_season_stats  -> can_manage_stats   (sibling of
--                                    baseball_player_stats; same stat-entry
--                                    workflow)
--   baseball_box_score_uploads    -> can_manage_imports (matches the sibling
--                                    baseball_stat_uploads table, which is
--                                    already correctly gated on this exact
--                                    capability for INSERT/UPDATE)
--   baseball_team_invitations     -> can_manage_roster  (this table generates
--                                    player join codes / roster growth; no
--                                    app-layer capability check exists today
--                                    to mirror, so can_manage_roster is the
--                                    closest existing "who's on my roster"
--                                    capability)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1 — baseball_player_stats
-- Drop the legacy ALL policy (any staff row on the team, no capability/status
-- check). INSERT and UPDATE are already gated on can_manage_stats via
-- baseball_player_stats_insert / baseball_player_stats_update; there was no
-- DELETE policy at all, so add one on the same capability.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_player_stats') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Coaches can manage player stats" ON public.baseball_player_stats';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_player_stats_delete" ON public.baseball_player_stats';
    EXECUTE $p$CREATE POLICY "baseball_player_stats_delete" ON public.baseball_player_stats
      FOR DELETE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_stats'))$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- SECTION 2 — baseball_staff_invitations
-- Drop the legacy ALL policy (gated by baseball_can_invite_staff(), which
-- checks is_head_coach/can_invite_staff but never staff status). INSERT and
-- UPDATE are already gated on can_invite_staff via
-- baseball_staff_invitations_insert / _update; there was no DELETE policy at
-- all, so add one on the same capability.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_staff_invitations') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "baseball_staff_invitations_manage" ON public.baseball_staff_invitations';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_staff_invitations_delete" ON public.baseball_staff_invitations';
    EXECUTE $p$CREATE POLICY "baseball_staff_invitations_delete" ON public.baseball_staff_invitations
      FOR DELETE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_invite_staff'))$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- SECTION 3 — baseball_player_season_stats
-- Drop the legacy ALL policy (gated by is_baseball_team_coach_v2(), which
-- checks team membership only — no capability, no status). There were NO
-- per-command write policies on this table at all, so add capability-gated
-- INSERT/UPDATE/DELETE. The existing SELECT policy ("Players see own +
-- coaches see team season stats") is untouched.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_player_season_stats') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Coaches can manage season stats" ON public.baseball_player_season_stats';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_player_season_stats_insert" ON public.baseball_player_season_stats';
    EXECUTE $p$CREATE POLICY "baseball_player_season_stats_insert" ON public.baseball_player_season_stats
      FOR INSERT TO authenticated
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_stats'))$p$;

    EXECUTE 'DROP POLICY IF EXISTS "baseball_player_season_stats_update" ON public.baseball_player_season_stats';
    EXECUTE $p$CREATE POLICY "baseball_player_season_stats_update" ON public.baseball_player_season_stats
      FOR UPDATE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_stats'))
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_stats'))$p$;

    EXECUTE 'DROP POLICY IF EXISTS "baseball_player_season_stats_delete" ON public.baseball_player_season_stats';
    EXECUTE $p$CREATE POLICY "baseball_player_season_stats_delete" ON public.baseball_player_season_stats
      FOR DELETE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_stats'))$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- SECTION 4 — baseball_box_score_uploads
-- Drop the legacy ALL policy (gated on raw coach_id ownership only — no
-- team-staff check, no capability, no status; it also does not scope by
-- team_id at all). This was the ONLY policy on the table (there was no
-- SELECT policy), so dropping it without replacement would remove read
-- access entirely and break the box-score processing flow in
-- src/app/baseball/actions/games.ts. Add a SELECT policy matching the
-- sibling baseball_stat_uploads_select pattern (team-staff visibility) plus
-- capability-gated INSERT/UPDATE/DELETE on can_manage_imports — the exact
-- capability the sibling baseball_stat_uploads table already uses for its
-- own INSERT/UPDATE policies.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_box_score_uploads') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Coaches can manage their uploads" ON public.baseball_box_score_uploads';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_box_score_uploads_select" ON public.baseball_box_score_uploads';
    EXECUTE $p$CREATE POLICY "baseball_box_score_uploads_select" ON public.baseball_box_score_uploads
      FOR SELECT TO authenticated
      USING (public.is_baseball_team_staff(team_id))$p$;

    EXECUTE 'DROP POLICY IF EXISTS "baseball_box_score_uploads_insert" ON public.baseball_box_score_uploads';
    EXECUTE $p$CREATE POLICY "baseball_box_score_uploads_insert" ON public.baseball_box_score_uploads
      FOR INSERT TO authenticated
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))$p$;

    EXECUTE 'DROP POLICY IF EXISTS "baseball_box_score_uploads_update" ON public.baseball_box_score_uploads';
    EXECUTE $p$CREATE POLICY "baseball_box_score_uploads_update" ON public.baseball_box_score_uploads
      FOR UPDATE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))$p$;

    EXECUTE 'DROP POLICY IF EXISTS "baseball_box_score_uploads_delete" ON public.baseball_box_score_uploads';
    EXECUTE $p$CREATE POLICY "baseball_box_score_uploads_delete" ON public.baseball_box_score_uploads
      FOR DELETE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- SECTION 5 — baseball_team_invitations
-- Drop the legacy ALL policy (gated by a bare tcs+coaches join — no
-- capability, no status). Add capability-gated INSERT/UPDATE/DELETE on
-- can_manage_roster (this table issues player join codes, i.e. controls
-- roster growth; no app-layer capability check exists today to mirror — see
-- PR body). The existing "Anyone can view active invitations by code" SELECT
-- policy is untouched.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_team_invitations') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Coaches can manage their team invitations" ON public.baseball_team_invitations';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_team_invitations_insert" ON public.baseball_team_invitations';
    EXECUTE $p$CREATE POLICY "baseball_team_invitations_insert" ON public.baseball_team_invitations
      FOR INSERT TO authenticated
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_roster'))$p$;

    EXECUTE 'DROP POLICY IF EXISTS "baseball_team_invitations_update" ON public.baseball_team_invitations';
    EXECUTE $p$CREATE POLICY "baseball_team_invitations_update" ON public.baseball_team_invitations
      FOR UPDATE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_roster'))
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_roster'))$p$;

    EXECUTE 'DROP POLICY IF EXISTS "baseball_team_invitations_delete" ON public.baseball_team_invitations';
    EXECUTE $p$CREATE POLICY "baseball_team_invitations_delete" ON public.baseball_team_invitations
      FOR DELETE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_roster'))$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- DEFERRED — baseball_team_lineups / baseball_lineup_positions are NOT
-- touched by this migration. See PR body: the correct capability
-- (can_manage_lineups, confirmed via src/app/baseball/actions/lineups.ts +
-- src/lib/baseball/capabilities.ts) cannot be safely used in a SQL WITH CHECK
-- today — has_baseball_staff_capability()'s CASE branch for it references
-- baseball_team_coach_staff.can_manage_lineups, a column that does not exist
-- on that table (confirmed live: `column can_manage_lineups does not exist`,
-- SQLSTATE 42703). Gating these two tables on that capability now would risk
-- breaking every non-head-coach lineup write with a runtime error instead of
-- closing the bypass. Needs a follow-up migration adding the column first.
-- ============================================================================
