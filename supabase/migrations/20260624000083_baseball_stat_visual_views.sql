-- ============================================================================
-- Migration: 20260624000083_baseball_stat_visual_views.sql
-- Packet: stat-visuals (BaseballHelm — stats-integrations)
-- Purpose: ADDITIVE per-user persistence for the V10 stat-visual chart library.
--          Stores a coach's/player's saved chart filter+tab state and which
--          charts a player pinned to their profile snapshot. This is the ONLY
--          new table the stat-visual fan-out introduces — every chart otherwise
--          reads from the existing baseball_* event tables (never cloned).
--
-- SAFETY CONTRACT (CLAUDE.md hard rules):
--   * ADDITIVE ONLY. CREATE TABLE IF NOT EXISTS. No DROP, no destructive write.
--   * RLS ENABLED. Per-user rows: a user can only see/manage their OWN views,
--     and only on a team they belong to (team-scoped via is_baseball_team_member).
--   * No policy targets anon. EXECUTE/privileges never granted to anon.
--   * Re-runnable: IF NOT EXISTS on table/index; DROP POLICY IF EXISTS then
--     CREATE POLICY. Guarded with to_regclass() so it is safe even if the
--     RLS-helper migration (..0050) has not yet landed.
--
-- This file is WRITTEN, NOT APPLIED.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.baseball_stat_visual_views (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES public.baseball_teams (id) ON DELETE CASCADE,
  -- The owning user. Views are PER-USER, never global — a coach's saved EV/LA
  -- filter must not leak into another staffer's or a player's surface.
  owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- Stable chart key, e.g. 'ev_la_matrix', 'pitch_shape_map', 'player_dna'.
  visual_key    text NOT NULL CHECK (char_length(visual_key) BETWEEN 1 AND 80),
  -- Optional player this saved view is scoped to (player-profile pins).
  player_id     uuid REFERENCES public.baseball_players (id) ON DELETE CASCADE,
  -- Serialized filter/tab state (context filter, pitch-type tab, date window).
  view_state    jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Whether the player pinned this chart to their profile snapshot.
  is_pinned     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- One saved view per (user, chart, player-scope). Upsert target — never
  -- delete-then-insert (CLAUDE.md: no destructive writes in save paths).
  CONSTRAINT baseball_stat_visual_views_unique
    UNIQUE (owner_user_id, visual_key, player_id)
);

CREATE INDEX IF NOT EXISTS baseball_stat_visual_views_owner_idx
  ON public.baseball_stat_visual_views (owner_user_id, team_id);

CREATE INDEX IF NOT EXISTS baseball_stat_visual_views_player_idx
  ON public.baseball_stat_visual_views (player_id)
  WHERE player_id IS NOT NULL;

ALTER TABLE public.baseball_stat_visual_views ENABLE ROW LEVEL SECURITY;
-- FORCE so even the table owner is subject to RLS (defense in depth).
ALTER TABLE public.baseball_stat_visual_views FORCE ROW LEVEL SECURITY;

-- updated_at maintenance (reuse the platform trigger fn if present; create a
-- local one defensively so this migration is self-contained).
CREATE OR REPLACE FUNCTION public.baseball_stat_visual_views_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_baseball_stat_visual_views_touch
  ON public.baseball_stat_visual_views;
CREATE TRIGGER trg_baseball_stat_visual_views_touch
  BEFORE UPDATE ON public.baseball_stat_visual_views
  FOR EACH ROW EXECUTE FUNCTION public.baseball_stat_visual_views_touch();

-- ----------------------------------------------------------------------------
-- RLS policies — owner-scoped AND team-scoped. A user may only touch their own
-- rows, and only on a team they are a member of. No anon. The team-membership
-- guard tolerates the helper fn not existing yet (to_regprocedure() check).
-- ----------------------------------------------------------------------------
DO $rls$
DECLARE
  has_member_fn boolean :=
    to_regprocedure('public.is_baseball_team_member(uuid)') IS NOT NULL;
  member_clause text :=
    CASE WHEN has_member_fn
      THEN ' AND public.is_baseball_team_member(team_id)'
      ELSE '' END;
BEGIN
  IF to_regclass('public.baseball_stat_visual_views') IS NULL THEN
    RAISE NOTICE 'baseball_stat_visual_views missing — skipping policies';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS baseball_stat_visual_views_select
    ON public.baseball_stat_visual_views;
  EXECUTE format($p$
    CREATE POLICY baseball_stat_visual_views_select
      ON public.baseball_stat_visual_views
      FOR SELECT TO authenticated
      USING (owner_user_id = auth.uid()%s)
  $p$, member_clause);

  DROP POLICY IF EXISTS baseball_stat_visual_views_insert
    ON public.baseball_stat_visual_views;
  EXECUTE format($p$
    CREATE POLICY baseball_stat_visual_views_insert
      ON public.baseball_stat_visual_views
      FOR INSERT TO authenticated
      WITH CHECK (owner_user_id = auth.uid()%s)
  $p$, member_clause);

  DROP POLICY IF EXISTS baseball_stat_visual_views_update
    ON public.baseball_stat_visual_views;
  EXECUTE format($p$
    CREATE POLICY baseball_stat_visual_views_update
      ON public.baseball_stat_visual_views
      FOR UPDATE TO authenticated
      USING (owner_user_id = auth.uid()%s)
      WITH CHECK (owner_user_id = auth.uid()%s)
  $p$, member_clause, member_clause);

  DROP POLICY IF EXISTS baseball_stat_visual_views_delete
    ON public.baseball_stat_visual_views;
  EXECUTE format($p$
    CREATE POLICY baseball_stat_visual_views_delete
      ON public.baseball_stat_visual_views
      FOR DELETE TO authenticated
      USING (owner_user_id = auth.uid()%s)
  $p$, member_clause);
END
$rls$;

-- Privileges: authenticated + service_role only. NEVER anon.
REVOKE ALL ON public.baseball_stat_visual_views FROM PUBLIC;
REVOKE ALL ON public.baseball_stat_visual_views FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.baseball_stat_visual_views TO authenticated;
GRANT ALL ON public.baseball_stat_visual_views TO service_role;

REVOKE ALL ON FUNCTION public.baseball_stat_visual_views_touch() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.baseball_stat_visual_views_touch() FROM anon;
