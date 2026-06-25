-- ============================================================================
-- Migration: 20260624001401_baseball_public_player_stats_rpc.sql
-- Packet: qa-screens (BaseballHelm — public recruiting profile)
-- Purpose: Surface REAL baseball performance on the PUBLIC recruiting profile.
--
-- THE DEFECT (verification fix):
--   The public profile page passed `player_stats: []` with a stale comment
--   ("No baseball stats table exists"). That comment is false — the season
--   aggregate (baseball_player_season_stats) and the box-score tables exist and
--   already back the STAFF stats page. The public StatsTab therefore showed only
--   static measurables (height/velo/GPA) and never AVG/OBP/SLG/OPS/ERA/WHIP or a
--   game log — the exact thing a recruiter opens the profile to see.
--
-- WHY AN RPC (not a plain page-level select):
--   baseball_player_season_stats RLS SELECT is "Players see own + coaches see
--   team season stats" (prod baseline line 17202) and the box-score tables are
--   coach/self-only too. An ANONYMOUS recruiter — the entire audience of the
--   public profile — is blocked by RLS, so a naive .from(...).select() returns
--   NOTHING for the very viewer this feature exists for. This SECURITY DEFINER
--   RPC reads under definer rights but RE-ENFORCES the public-profile gate in
--   its own body, so it only ever returns rows the player has chosen to expose.
--
-- THE GATE (authoritative, enforced server-side in the function body):
--   A row is returned when EITHER
--     (a) the viewer is staff of one of the player's teams, OR the subject
--         player themselves  (parity with the staff/self surfaces), OR
--     (b) ALL public conditions hold:
--           * player.recruiting_activated = true               (opted-in)
--           * player_settings.profile_visibility = 'public'    (not private/unlisted)
--           * at least one of the player's teams has
--             baseball_program_settings.public_profiles_enabled = true
--   Otherwise the function returns NULL (no stats leak).
--   NOTE: `profile_visibility` is the real player-level visibility column;
--   the client's `show_stats` flag has NO backing column (defaults open), so the
--   honest gate uses profile_visibility. show_academics is also honored below.
--
-- SAFETY CONTRACT (CLAUDE.md hard rules — WRITTEN, NOT APPLIED to any DB):
--   * ADDITIVE ONLY. New function, no schema/table/policy/column change. Safe to
--     re-run (CREATE OR REPLACE). No DROP of anything load-bearing, no
--     destructive write. Read-only function (returns json; no INSERT/UPDATE).
--   * Sport-prefixed name (get_baseball_public_player_stats).
--   * SECURITY DEFINER + pinned search_path = public, pg_temp (RLS-recursion-safe;
--     matches the existing baseball SECURITY DEFINER helpers in 20260624000050).
--   * REVOKE ALL FROM PUBLIC, then GRANT EXECUTE TO anon, authenticated,
--     service_role. anon EXECUTE is INTENTIONAL and REQUIRED here (the public
--     recruiting profile is served to logged-out college coaches); the function
--     body — not table grants — is the security boundary, and it only returns
--     player-opted-in public data.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_baseball_public_player_stats(
  p_player_id uuid,
  p_season_year integer DEFAULT (EXTRACT(year FROM now()))::integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_is_self          boolean := false;
  v_is_staff         boolean := false;
  v_public_ok        boolean := false;
  v_show_academics   boolean := true;
  v_stats            jsonb;
  v_batting_log      jsonb;
  v_pitching_log     jsonb;
BEGIN
  IF p_player_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- ---- Viewer relationship ------------------------------------------------
  -- Subject player themselves (always allowed to preview their own profile).
  SELECT EXISTS (
    SELECT 1 FROM baseball_players bp
    WHERE bp.id = p_player_id AND bp.user_id = auth.uid()
  ) INTO v_is_self;

  -- Staff of ANY team the player belongs to (parity with the staff surface).
  SELECT EXISTS (
    SELECT 1
    FROM baseball_team_members tm
    WHERE tm.player_id = p_player_id
      AND public.is_baseball_team_staff(tm.team_id)
  ) INTO v_is_staff;

  -- ---- Public-profile gate -------------------------------------------------
  -- recruiting_activated AND profile_visibility public AND a team that enables
  -- public profiles. Settings row may be absent → treat visibility as the
  -- 'public' default (the client defaults open the same way).
  SELECT
    COALESCE(bp.recruiting_activated, false)
    AND COALESCE(ps.profile_visibility, 'public') = 'public'
    AND EXISTS (
      SELECT 1
      FROM baseball_team_members tm
      JOIN baseball_program_settings pgs ON pgs.team_id = tm.team_id
      WHERE tm.player_id = p_player_id
        AND pgs.public_profiles_enabled = true
    ),
    COALESCE(ps.show_academics, true)
  INTO v_public_ok, v_show_academics
  FROM baseball_players bp
  LEFT JOIN baseball_player_settings ps ON ps.player_id = bp.id
  WHERE bp.id = p_player_id;

  -- Not viewable → leak nothing.
  IF NOT (v_is_self OR v_is_staff OR v_public_ok) THEN
    RETURN NULL;
  END IF;

  -- ---- Season aggregate (single row for the season) -----------------------
  SELECT to_jsonb(s.*) INTO v_stats
  FROM baseball_player_season_stats s
  WHERE s.player_id = p_player_id
    AND s.season_year = p_season_year
  ORDER BY s.last_updated DESC NULLS LAST
  LIMIT 1;

  -- ---- Batting game log (completed games only on the public surface) -------
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.game_date DESC NULLS LAST), '[]'::jsonb)
  INTO v_batting_log
  FROM (
    SELECT
      b.id, b.game_id, b.ab, b.r, b.h, b.doubles, b.triples, b.hr, b.rbi,
      b.bb, b.k, b.sb, b.cs, b.hbp, b.sac, b.sf, b.lob,
      b.avg, b.obp, b.slg, b.ops,
      g.game_date, g.opponent_name, g.game_type, g.our_score, g.opponent_score, g.status
    FROM baseball_box_score_batting b
    JOIN baseball_games g ON g.id = b.game_id
    WHERE b.player_id = p_player_id
      AND g.status = 'completed'
      AND EXTRACT(YEAR FROM g.game_date)::integer = p_season_year
  ) t;

  -- ---- Pitching game log ---------------------------------------------------
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.game_date DESC NULLS LAST), '[]'::jsonb)
  INTO v_pitching_log
  FROM (
    SELECT
      p.id, p.game_id, p.ip, p.h, p.r, p.er, p.bb, p.k, p.hr,
      p.era, p.whip, p.k9, p.bb9, p.result,
      g.game_date, g.opponent_name, g.game_type, g.our_score, g.opponent_score, g.status
    FROM baseball_box_score_pitching p
    JOIN baseball_games g ON g.id = p.game_id
    WHERE p.player_id = p_player_id
      AND g.status = 'completed'
      AND EXTRACT(YEAR FROM g.game_date)::integer = p_season_year
  ) t;

  RETURN jsonb_build_object(
    'season_year',   p_season_year,
    'show_academics', v_show_academics,
    'stats',         v_stats,                       -- null when no season row yet
    'batting_log',   COALESCE(v_batting_log, '[]'::jsonb),
    'pitching_log',  COALESCE(v_pitching_log, '[]'::jsonb)
  );
END;
$function$;

COMMENT ON FUNCTION public.get_baseball_public_player_stats(uuid, integer) IS
  'Public recruiting-profile season stats + game logs for a player. SECURITY DEFINER; re-enforces the public-profile gate (recruiting_activated + profile_visibility=public + a team with public_profiles_enabled) OR staff/self, returning NULL otherwise. anon EXECUTE is intentional — the function body is the security boundary, not table grants.';

-- Grants: function body is the boundary; anon must execute (logged-out coaches).
REVOKE ALL ON FUNCTION public.get_baseball_public_player_stats(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_baseball_public_player_stats(uuid, integer)
  TO anon, authenticated, service_role;
