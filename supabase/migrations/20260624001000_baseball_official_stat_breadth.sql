-- ============================================================================
-- Migration: 20260624001000_baseball_official_stat_breadth.sql
-- Packet: qa-screens (BaseballHelm — stats) — DEEPEN "Live Stats Center"
-- Purpose: Close the official-stat breadth gap between the box-score read model
--          (stats-center.ts) and the V6 "Official Batting / Pitching Stats"
--          field list. The Stats Center was box-score-only and captured ~15
--          counting fields + avg/obp/slg/ops; this migration ADDS the V6
--          official counting columns that genuinely need stored capture (the
--          rest — PA, singles, total bases, ISO, BB%, K%, BB/K, XBH%, SB%,
--          runs-created, wOBA-estimate, strike%, K/9, BB/9, HR/9, H/9, oppBA,
--          LOB% — are DERIVED in the read model and need no storage).
--
-- GROUNDING (V6 = deepest controlling spec for elite stats; V10 Stats Lab
--   §"official game stats view" confirms the breadth requirement; newer v11/v12
--   do not cut official-stat breadth):
--   * docs/.../20_stats_integrations_coachhelm_deep_dive_v6/v6_elite_baseball_stat_universe.md
--       §"Official Batting Stats" lines 24-56, §"Official Pitching Stats" 222-253.
--   * docs/.../25_premium_ui_coachhelm_v10/v10_claude_prompt_delta...md packet 6
--       "official game stats view ... catching/defense/baserunning views".
--
-- WHY ADDITIVE COLUMNS (not derived): these are independent box-score inputs
-- that cannot be reconstructed from the existing AB/H/2B/3B/HR/BB/... totals:
--   batting : ibb, gidp, roe, ci, pickoffs, two_out_rbi, productive_outs,
--             runners_advanced, ph_ab, ph_h, pr_app, def_position
--             (singles + total_bases are DERIVED, not stored)
--   pitching: gs, gf, holds, blown_saves, complete_game, shutout, bf, hbp,
--             ibb, wp, balk, doubles_allowed, triples_allowed,
--             first_pitch_strikes, inherited_runners, inherited_runners_scored
--
-- SAFETY CONTRACT (CLAUDE.md hard rules — WRITTEN, NOT APPLIED to any DB):
--   * ADDITIVE ONLY. ADD COLUMN IF NOT EXISTS with NON-NULL safe defaults so the
--     existing recalc + reads never break. No DROP, no destructive UPDATE/DELETE.
--     Safe to re-run.
--   * Sport-prefixed names only (baseball_*).
--   * No new tables, no new RLS surface — these columns inherit the existing
--     box-score table policies. No RPC, no anon grant touched.
--   * The recalc function is REPLACED additively: it now also rolls the new
--     batting counting columns into baseball_player_season_stats (new season
--     columns added below). Existing behavior (the 15 original fields + rates)
--     is preserved byte-for-byte; we only ADD to the SELECT/INSERT/UPDATE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Box-score BATTING — V6 official counting columns not yet stored.
-- ----------------------------------------------------------------------------
ALTER TABLE public.baseball_box_score_batting
  ADD COLUMN IF NOT EXISTS ibb              integer NOT NULL DEFAULT 0,  -- intentional walks
  ADD COLUMN IF NOT EXISTS gidp             integer NOT NULL DEFAULT 0,  -- ground into DP
  ADD COLUMN IF NOT EXISTS roe              integer NOT NULL DEFAULT 0,  -- reached on error
  ADD COLUMN IF NOT EXISTS ci               integer NOT NULL DEFAULT 0,  -- catcher interference reached
  ADD COLUMN IF NOT EXISTS pickoffs         integer NOT NULL DEFAULT 0,  -- picked off
  ADD COLUMN IF NOT EXISTS two_out_rbi      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS productive_outs  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS runners_advanced integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ph_ab            integer NOT NULL DEFAULT 0,  -- pinch-hit AB
  ADD COLUMN IF NOT EXISTS ph_h             integer NOT NULL DEFAULT 0,  -- pinch-hit hits
  ADD COLUMN IF NOT EXISTS pr_app           integer NOT NULL DEFAULT 0,  -- pinch-run appearances
  ADD COLUMN IF NOT EXISTS def_position     text;                        -- defensive position started

-- ----------------------------------------------------------------------------
-- 2) Box-score PITCHING — V6 official counting columns not yet stored.
-- ----------------------------------------------------------------------------
ALTER TABLE public.baseball_box_score_pitching
  ADD COLUMN IF NOT EXISTS gs                       integer NOT NULL DEFAULT 0,  -- 1 if started
  ADD COLUMN IF NOT EXISTS gf                       integer NOT NULL DEFAULT 0,  -- 1 if finished
  ADD COLUMN IF NOT EXISTS holds                    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blown_saves              integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS complete_game            integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shutout                  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bf                       integer NOT NULL DEFAULT 0,  -- batters faced
  ADD COLUMN IF NOT EXISTS hbp                      integer NOT NULL DEFAULT 0,  -- hit batters
  ADD COLUMN IF NOT EXISTS ibb                      integer NOT NULL DEFAULT 0,  -- intentional walks
  ADD COLUMN IF NOT EXISTS wp                       integer NOT NULL DEFAULT 0,  -- wild pitches
  ADD COLUMN IF NOT EXISTS balk                     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS doubles_allowed          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS triples_allowed          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_pitch_strikes      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inherited_runners        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inherited_runners_scored integer NOT NULL DEFAULT 0;

-- ----------------------------------------------------------------------------
-- 3) Season-stat aggregate — store the new batting counting columns so the
--    reconcile target stays a superset of the read-model splits. (Rates remain
--    derived in the read model; we only persist counting totals here.)
-- ----------------------------------------------------------------------------
ALTER TABLE public.baseball_player_season_stats
  ADD COLUMN IF NOT EXISTS ibb              integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gidp             integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS roe              integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS two_out_rbi      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lob              integer NOT NULL DEFAULT 0,
  -- pitching superset
  ADD COLUMN IF NOT EXISTS gf               integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS holds            integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blown_saves      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bf               integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS p_hbp            integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wp               integer NOT NULL DEFAULT 0;

-- ----------------------------------------------------------------------------
-- 4) Recalc function — ADDITIVELY roll the new counting columns into the season
--    aggregate. This is an EXACT SUPERSET of 20260528000000's body-guarded
--    version: same signature (incl. the season-year DEFAULT), same coach-only
--    body guard, same scrimmage-inclusive game scope (NOT changed here — the
--    official/scrimmage split lives in the read model, not the season row), same
--    NULL-safe declared defaults, same CONFLICT key. We ONLY add the new SUMs
--    and write the new columns; every original field + rate is byte-identical.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_baseball_season_stats(
  p_player_id uuid,
  p_team_id uuid,
  p_season_year integer DEFAULT (EXTRACT(year FROM now()))::integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_g integer := 0; v_ab integer := 0; v_r integer := 0; v_h integer := 0;
  v_doubles integer := 0; v_triples integer := 0; v_hr integer := 0; v_rbi integer := 0;
  v_bb integer := 0; v_k integer := 0; v_sb integer := 0; v_cs integer := 0;
  v_hbp integer := 0; v_sac integer := 0; v_sf integer := 0;
  v_ibb integer := 0; v_gidp integer := 0; v_roe integer := 0;
  v_two_out_rbi integer := 0; v_lob integer := 0;
  v_avg numeric(5,3); v_obp numeric(5,3); v_slg numeric(5,3); v_ops numeric(5,3);
  v_g_p integer := 0; v_w integer := 0; v_l integer := 0; v_sv integer := 0;
  v_ip numeric(6,1) := 0; v_h_allowed integer := 0; v_r_allowed integer := 0; v_er integer := 0;
  v_bb_allowed integer := 0; v_k_thrown integer := 0; v_hr_allowed integer := 0;
  v_gf integer := 0; v_holds integer := 0; v_blown integer := 0;
  v_bf integer := 0; v_p_hbp integer := 0; v_wp integer := 0;
  v_era numeric(5,2); v_whip numeric(5,3); v_k9 numeric(5,2); v_bb9 numeric(5,2);
  v_singles integer; v_pa integer;
BEGIN
  -- Body-level guard (preserved from 20260528000000): caller must be a coach of
  -- the target team; service_role bypasses for cron/import paths.
  IF current_setting('request.jwt.claims', true) IS NOT NULL
     AND coalesce(auth.role(), '') <> 'service_role'
     AND NOT public.is_baseball_team_coach_v2(p_team_id)
  THEN
    RAISE EXCEPTION 'forbidden: caller is not a coach of team %', p_team_id
      USING ERRCODE = '42501';
  END IF;

  -- ---- Batting aggregation (completed games — scope unchanged) ----
  SELECT
    COUNT(DISTINCT bsb.game_id)::integer,
    COALESCE(SUM(bsb.ab), 0)::integer,
    COALESCE(SUM(bsb.r), 0)::integer,
    COALESCE(SUM(bsb.h), 0)::integer,
    COALESCE(SUM(bsb.doubles), 0)::integer,
    COALESCE(SUM(bsb.triples), 0)::integer,
    COALESCE(SUM(bsb.hr), 0)::integer,
    COALESCE(SUM(bsb.rbi), 0)::integer,
    COALESCE(SUM(bsb.bb), 0)::integer,
    COALESCE(SUM(bsb.k), 0)::integer,
    COALESCE(SUM(bsb.sb), 0)::integer,
    COALESCE(SUM(bsb.cs), 0)::integer,
    COALESCE(SUM(bsb.hbp), 0)::integer,
    COALESCE(SUM(bsb.sac), 0)::integer,
    COALESCE(SUM(bsb.sf), 0)::integer,
    COALESCE(SUM(bsb.ibb), 0)::integer,
    COALESCE(SUM(bsb.gidp), 0)::integer,
    COALESCE(SUM(bsb.roe), 0)::integer,
    COALESCE(SUM(bsb.two_out_rbi), 0)::integer,
    COALESCE(SUM(bsb.lob), 0)::integer
  INTO
    v_g, v_ab, v_r, v_h, v_doubles, v_triples, v_hr, v_rbi,
    v_bb, v_k, v_sb, v_cs, v_hbp, v_sac, v_sf,
    v_ibb, v_gidp, v_roe, v_two_out_rbi, v_lob
  FROM baseball_box_score_batting bsb
  JOIN baseball_games g ON g.id = bsb.game_id
  WHERE bsb.player_id = p_player_id
    AND bsb.team_id = p_team_id
    AND g.status = 'completed'
    AND EXTRACT(YEAR FROM g.game_date)::integer = p_season_year;

  IF v_ab > 0 THEN
    v_avg := ROUND(v_h::numeric / v_ab, 3);
    v_singles := v_h - v_doubles - v_triples - v_hr;
    v_slg := ROUND((v_singles + 2 * v_doubles + 3 * v_triples + 4 * v_hr)::numeric / v_ab, 3);
  END IF;

  v_pa := v_ab + v_bb + v_hbp + v_sf;
  IF v_pa > 0 THEN
    v_obp := ROUND((v_h + v_bb + v_hbp)::numeric / v_pa, 3);
  END IF;
  IF v_obp IS NOT NULL AND v_slg IS NOT NULL THEN
    v_ops := ROUND(v_obp + v_slg, 3);
  END IF;

  -- ---- Pitching aggregation (scope unchanged) ----
  SELECT
    COUNT(DISTINCT bsp.game_id)::integer,
    COUNT(CASE WHEN bsp.result = 'W' THEN 1 END)::integer,
    COUNT(CASE WHEN bsp.result = 'L' THEN 1 END)::integer,
    COUNT(CASE WHEN bsp.result = 'S' THEN 1 END)::integer,
    COALESCE(SUM(bsp.ip), 0),
    COALESCE(SUM(bsp.h), 0)::integer,
    COALESCE(SUM(bsp.r), 0)::integer,
    COALESCE(SUM(bsp.er), 0)::integer,
    COALESCE(SUM(bsp.bb), 0)::integer,
    COALESCE(SUM(bsp.k), 0)::integer,
    COALESCE(SUM(bsp.hr), 0)::integer,
    COALESCE(SUM(bsp.gf), 0)::integer,
    COUNT(CASE WHEN bsp.result = 'H' THEN 1 END)::integer + COALESCE(SUM(bsp.holds), 0)::integer,
    COUNT(CASE WHEN bsp.result = 'BS' THEN 1 END)::integer + COALESCE(SUM(bsp.blown_saves), 0)::integer,
    COALESCE(SUM(bsp.bf), 0)::integer,
    COALESCE(SUM(bsp.hbp), 0)::integer,
    COALESCE(SUM(bsp.wp), 0)::integer
  INTO
    v_g_p, v_w, v_l, v_sv, v_ip, v_h_allowed, v_r_allowed, v_er,
    v_bb_allowed, v_k_thrown, v_hr_allowed,
    v_gf, v_holds, v_blown, v_bf, v_p_hbp, v_wp
  FROM baseball_box_score_pitching bsp
  JOIN baseball_games g ON g.id = bsp.game_id
  WHERE bsp.player_id = p_player_id
    AND bsp.team_id = p_team_id
    AND g.status = 'completed'
    AND EXTRACT(YEAR FROM g.game_date)::integer = p_season_year;

  IF v_ip > 0 THEN
    v_era := ROUND(9.0 * v_er / v_ip, 2);
    v_whip := ROUND((v_bb_allowed + v_h_allowed)::numeric / v_ip, 3);
    v_k9 := ROUND(9.0 * v_k_thrown / v_ip, 2);
    v_bb9 := ROUND(9.0 * v_bb_allowed / v_ip, 2);
  END IF;

  INSERT INTO baseball_player_season_stats (
    player_id, team_id, season_year,
    g, ab, r, h, doubles, triples, hr, rbi, bb, k, sb, cs, hbp, sac, sf,
    ibb, gidp, roe, two_out_rbi, lob,
    avg, obp, slg, ops,
    g_p, gs, w, l, sv, ip, h_allowed, r_allowed, er, bb_allowed, k_thrown, hr_allowed,
    gf, holds, blown_saves, bf, p_hbp, wp,
    era, whip, k9, bb9,
    last_updated
  )
  VALUES (
    p_player_id, p_team_id, p_season_year,
    v_g, v_ab, v_r, v_h, v_doubles, v_triples, v_hr, v_rbi, v_bb, v_k, v_sb, v_cs, v_hbp, v_sac, v_sf,
    v_ibb, v_gidp, v_roe, v_two_out_rbi, v_lob,
    v_avg, v_obp, v_slg, v_ops,
    v_g_p, 0, v_w, v_l, v_sv, v_ip, v_h_allowed, v_r_allowed, v_er, v_bb_allowed, v_k_thrown, v_hr_allowed,
    v_gf, v_holds, v_blown, v_bf, v_p_hbp, v_wp,
    v_era, v_whip, v_k9, v_bb9,
    now()
  )
  ON CONFLICT (player_id, team_id, season_year)
  DO UPDATE SET
    g = EXCLUDED.g, ab = EXCLUDED.ab, r = EXCLUDED.r, h = EXCLUDED.h,
    doubles = EXCLUDED.doubles, triples = EXCLUDED.triples, hr = EXCLUDED.hr,
    rbi = EXCLUDED.rbi, bb = EXCLUDED.bb, k = EXCLUDED.k, sb = EXCLUDED.sb,
    cs = EXCLUDED.cs, hbp = EXCLUDED.hbp, sac = EXCLUDED.sac, sf = EXCLUDED.sf,
    ibb = EXCLUDED.ibb, gidp = EXCLUDED.gidp, roe = EXCLUDED.roe,
    two_out_rbi = EXCLUDED.two_out_rbi, lob = EXCLUDED.lob,
    avg = EXCLUDED.avg, obp = EXCLUDED.obp, slg = EXCLUDED.slg, ops = EXCLUDED.ops,
    g_p = EXCLUDED.g_p, w = EXCLUDED.w, l = EXCLUDED.l, sv = EXCLUDED.sv,
    ip = EXCLUDED.ip, h_allowed = EXCLUDED.h_allowed, r_allowed = EXCLUDED.r_allowed,
    er = EXCLUDED.er, bb_allowed = EXCLUDED.bb_allowed, k_thrown = EXCLUDED.k_thrown,
    hr_allowed = EXCLUDED.hr_allowed,
    gf = EXCLUDED.gf, holds = EXCLUDED.holds, blown_saves = EXCLUDED.blown_saves,
    bf = EXCLUDED.bf, p_hbp = EXCLUDED.p_hbp, wp = EXCLUDED.wp,
    era = EXCLUDED.era, whip = EXCLUDED.whip, k9 = EXCLUDED.k9, bb9 = EXCLUDED.bb9,
    last_updated = now();
END;
$function$;

-- ============================================================================
-- END — official-stat breadth. ADDITIVE. NOT applied to any DB.
-- ============================================================================
