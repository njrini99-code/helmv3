-- ============================================================================
-- Migration: 20260624000095_baseball_team_and_season_settings.sql
-- Packet: qa-screens (BaseballHelm Wave 4 — Settings routes coverage completeness)
--
-- Purpose: Close the two settings surfaces that had NO editing home in the
--          v4 route map (v4_settings_admin_integrations_permissions §Team And
--          Season Settings):
--
--   * TEAM settings  — join policy controls that the program_type-level
--                      baseball_program_settings doc does NOT cover at the
--                      TEAM grain: invite policy, player self-join, and
--                      coach-approval-required. (join_code already lives on
--                      baseball_teams; identity columns program_type/
--                      competition_level/region_state/timezone/season_label
--                      were added by 20260624000090.) We add the join-policy
--                      columns DIRECTLY to baseball_teams (additive) so they
--                      sit next to join_code — never a clone table.
--
--   * SEASON settings — fall / winter / preseason / in-season / postseason /
--                      summer-showcase phases with archive status and the
--                      season-specific module toggles (roster / schedule /
--                      stats / practice-templates / lift-groups / performance
--                      baselines / player-status). A team has MANY seasons over
--                      time, so this is a child table keyed by team_id, with a
--                      single current/active season per team.
--
-- ZIP NON-NEGOTIABLES honored:
--   * EXTEND existing baseball_teams (additive columns) — never clone.
--   * Sensitive changes audited via the existing baseball_settings_audit_log
--     (the server action writes the rows; no schema change needed here).
--   * No vendor anything; pure operating-control settings.
--
-- SAFETY CONTRACT (CLAUDE.md hard rules):
--   * ADDITIVE ONLY. ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS /
--     CREATE INDEX IF NOT EXISTS / DROP POLICY IF EXISTS then CREATE POLICY.
--     No DROP/destructive rename. Safe to (re)run on a live DB.
--   * RLS ENABLED on every new table with explicit policies. NEVER GRANT anon.
--   * Reuses the Wave-1 capability helpers has_baseball_staff_capability(team,cap),
--     is_baseball_team_staff(team), is_baseball_team_member(team).
--   * Sport-prefixed names only (baseball_*).
--
-- This file is WRITTEN, NOT APPLIED.
-- ============================================================================

-- ============================================================================
-- SECTION 1 — TEAM JOIN-POLICY COLUMNS ON baseball_teams (additive)
-- ============================================================================
-- join_code already exists. These add the policy that governs how the code is
-- used (v4 §Team Settings: invite policy / player self-join allowed / coach
-- approval required). invite_policy is the controlling enum; the two booleans
-- are convenience flags some surfaces read directly.
--   invite_policy = 'invite_only'      -> code shares but every join needs a
--                                          coach to approve (default; safest).
--   invite_policy = 'code_self_join'   -> a valid code self-joins immediately.
--   invite_policy = 'closed'           -> no new joins (roster locked).

ALTER TABLE public.baseball_teams
  ADD COLUMN IF NOT EXISTS invite_policy text NOT NULL DEFAULT 'invite_only'
    CHECK (invite_policy IN ('invite_only', 'code_self_join', 'closed')),
  ADD COLUMN IF NOT EXISTS allow_player_self_join boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_coach_approval  boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.baseball_teams.invite_policy IS
  'How new members join (v4 §Team Settings): invite_only (code + coach approval), code_self_join (valid code joins immediately), closed (roster locked).';
COMMENT ON COLUMN public.baseball_teams.allow_player_self_join IS
  'Convenience flag: a valid join code lets a player self-join without an explicit invite row. Mirrors invite_policy = code_self_join.';
COMMENT ON COLUMN public.baseball_teams.require_coach_approval IS
  'When true, a self-joined / invited player lands in a pending state until a coach approves. Independent of invite_policy so coaches can require approval even on code_self_join.';

-- ============================================================================
-- SECTION 2 — baseball_seasons (season records per team)
-- ============================================================================
-- v4 §Team And Season Settings. A team has many seasons over time. Exactly one
-- season per team is the "current" one (enforced by a partial unique index).
-- The season-specific module toggles let a program scope what each season runs
-- (e.g. a fall ID season runs stats + practice but not lift groups).

CREATE TABLE IF NOT EXISTS public.baseball_seasons (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id                  uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,

  -- Identity
  label                    text NOT NULL,                 -- "Fall 2026", "2027 Spring"
  phase                    text NOT NULL DEFAULT 'preseason'
                             CHECK (phase IN (
                               'fall', 'winter', 'preseason', 'in_season',
                               'postseason', 'summer_showcase'
                             )),
  starts_on                date,
  ends_on                  date,

  -- Lifecycle
  status                   text NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'archived', 'upcoming')),
  is_current               boolean NOT NULL DEFAULT false,

  -- Season-specific module toggles (v4 §Season-specific). Scope what this
  -- season runs without affecting other seasons or the program-level settings.
  roster_enabled           boolean NOT NULL DEFAULT true,
  schedule_enabled         boolean NOT NULL DEFAULT true,
  stats_enabled            boolean NOT NULL DEFAULT true,
  practice_templates_enabled boolean NOT NULL DEFAULT true,
  lift_groups_enabled      boolean NOT NULL DEFAULT true,
  performance_baselines_enabled boolean NOT NULL DEFAULT true,
  player_status_tracking_enabled boolean NOT NULL DEFAULT true,

  created_by               uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.baseball_seasons IS
  'Per-team season records (v4 §Team And Season Settings): phase (fall/winter/preseason/in_season/postseason/summer_showcase), archive status, and season-specific module toggles (roster/schedule/stats/practice-templates/lift-groups/performance-baselines/player-status). Exactly one is_current season per team.';

CREATE INDEX IF NOT EXISTS baseball_seasons_team_idx
  ON public.baseball_seasons (team_id, status);

-- Exactly one current season per team (partial unique on is_current = true).
CREATE UNIQUE INDEX IF NOT EXISTS baseball_seasons_one_current_per_team
  ON public.baseball_seasons (team_id) WHERE is_current = true;

-- ============================================================================
-- SECTION 3 — updated_at touch trigger (reuse generic helper if present)
-- ============================================================================
DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_baseball_seasons_updated_at ON public.baseball_seasons;
    CREATE TRIGGER trg_baseball_seasons_updated_at
      BEFORE UPDATE ON public.baseball_seasons
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ============================================================================
-- SECTION 4 — RLS POLICIES (baseball_seasons)
-- ============================================================================
-- Read: any active team staff OR active team member (a player sees which season
-- is current + what modules it runs). Write: staff with can_manage_settings.

ALTER TABLE public.baseball_seasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_seasons_select" ON public.baseball_seasons;
DROP POLICY IF EXISTS "baseball_seasons_insert" ON public.baseball_seasons;
DROP POLICY IF EXISTS "baseball_seasons_update" ON public.baseball_seasons;
DROP POLICY IF EXISTS "baseball_seasons_delete" ON public.baseball_seasons;

CREATE POLICY "baseball_seasons_select" ON public.baseball_seasons
  FOR SELECT TO authenticated
  USING (
    public.is_baseball_team_staff(team_id)
    OR public.is_baseball_team_member(team_id)
  );
CREATE POLICY "baseball_seasons_insert" ON public.baseball_seasons
  FOR INSERT TO authenticated
  WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_settings'));
CREATE POLICY "baseball_seasons_update" ON public.baseball_seasons
  FOR UPDATE TO authenticated
  USING (public.has_baseball_staff_capability(team_id, 'can_manage_settings'))
  WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_settings'));
-- Delete: primary coach only (archiving is the normal flow; delete is rare).
CREATE POLICY "baseball_seasons_delete" ON public.baseball_seasons
  FOR DELETE TO authenticated
  USING (public.is_baseball_primary_coach(team_id));

-- ============================================================================
-- SECTION 5 — anon lockdown (defence in depth)
-- ============================================================================
REVOKE ALL ON public.baseball_seasons FROM anon;

-- ============================================================================
-- END — Team + Season settings. ADDITIVE. RLS-complete. NOT applied to any DB.
-- ============================================================================
