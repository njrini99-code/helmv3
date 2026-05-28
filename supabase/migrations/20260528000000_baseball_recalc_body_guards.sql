-- Body-level guard for the two baseball recalc RPCs.
--
-- PR #115 locked the GRANTs (revoked anon; kept authenticated for the two
-- server actions in src/app/baseball/actions/games.ts that need them) and
-- pinned search_path. This migration adds a coach-only check inside the
-- function bodies so any authenticated caller hitting the PostgREST RPC
-- endpoint directly cannot bypass the app-layer verifyTeamAccess gate.
--
-- Belt-and-suspenders: the server actions still validate first, but a
-- future action that forgets the app-layer check will now fail closed at
-- the DB layer instead of writing aggregate rows to baseball_player_season_stats.
--
-- See: docs/operations/2026-05-27-baseball-tables-scope.md

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
  v_g integer := 0;
  v_ab integer := 0;
  v_r integer := 0;
  v_h integer := 0;
  v_doubles integer := 0;
  v_triples integer := 0;
  v_hr integer := 0;
  v_rbi integer := 0;
  v_bb integer := 0;
  v_k integer := 0;
  v_sb integer := 0;
  v_cs integer := 0;
  v_hbp integer := 0;
  v_sac integer := 0;
  v_sf integer := 0;
  v_avg numeric(5,3);
  v_obp numeric(5,3);
  v_slg numeric(5,3);
  v_ops numeric(5,3);
  v_g_p integer := 0;
  v_w integer := 0;
  v_l integer := 0;
  v_sv integer := 0;
  v_ip numeric(6,1) := 0;
  v_h_allowed integer := 0;
  v_r_allowed integer := 0;
  v_er integer := 0;
  v_bb_allowed integer := 0;
  v_k_thrown integer := 0;
  v_hr_allowed integer := 0;
  v_era numeric(5,2);
  v_whip numeric(5,3);
  v_k9 numeric(5,2);
  v_bb9 numeric(5,2);
  v_singles integer;
  v_pa integer;
BEGIN
  -- Body-level guard: caller must be a coach of the target team.
  -- service_role bypasses by leaving auth.uid() NULL → is_baseball_team_coach_v2
  -- returns false, so we explicitly let service_role through for cron paths.
  IF current_setting('request.jwt.claims', true) IS NOT NULL
     AND coalesce(auth.role(), '') <> 'service_role'
     AND NOT public.is_baseball_team_coach_v2(p_team_id)
  THEN
    RAISE EXCEPTION 'forbidden: caller is not a coach of team %', p_team_id
      USING ERRCODE = '42501';
  END IF;

  -- Batting aggregation
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
    COALESCE(SUM(bsb.sf), 0)::integer
  INTO
    v_g, v_ab, v_r, v_h, v_doubles, v_triples, v_hr, v_rbi,
    v_bb, v_k, v_sb, v_cs, v_hbp, v_sac, v_sf
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

  -- Pitching aggregation
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
    COALESCE(SUM(bsp.hr), 0)::integer
  INTO
    v_g_p, v_w, v_l, v_sv, v_ip, v_h_allowed, v_r_allowed, v_er, v_bb_allowed, v_k_thrown, v_hr_allowed
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

  -- Upsert season stats
  INSERT INTO baseball_player_season_stats (
    player_id, team_id, season_year,
    g, ab, r, h, doubles, triples, hr, rbi, bb, k, sb, cs, hbp, sac, sf,
    avg, obp, slg, ops,
    g_p, gs, w, l, sv, ip, h_allowed, r_allowed, er, bb_allowed, k_thrown, hr_allowed,
    era, whip, k9, bb9,
    last_updated
  )
  VALUES (
    p_player_id, p_team_id, p_season_year,
    v_g, v_ab, v_r, v_h, v_doubles, v_triples, v_hr, v_rbi, v_bb, v_k, v_sb, v_cs, v_hbp, v_sac, v_sf,
    v_avg, v_obp, v_slg, v_ops,
    v_g_p, 0, v_w, v_l, v_sv, v_ip, v_h_allowed, v_r_allowed, v_er, v_bb_allowed, v_k_thrown, v_hr_allowed,
    v_era, v_whip, v_k9, v_bb9,
    now()
  )
  ON CONFLICT (player_id, team_id, season_year)
  DO UPDATE SET
    g = EXCLUDED.g,
    ab = EXCLUDED.ab,
    r = EXCLUDED.r,
    h = EXCLUDED.h,
    doubles = EXCLUDED.doubles,
    triples = EXCLUDED.triples,
    hr = EXCLUDED.hr,
    rbi = EXCLUDED.rbi,
    bb = EXCLUDED.bb,
    k = EXCLUDED.k,
    sb = EXCLUDED.sb,
    cs = EXCLUDED.cs,
    hbp = EXCLUDED.hbp,
    sac = EXCLUDED.sac,
    sf = EXCLUDED.sf,
    avg = EXCLUDED.avg,
    obp = EXCLUDED.obp,
    slg = EXCLUDED.slg,
    ops = EXCLUDED.ops,
    g_p = EXCLUDED.g_p,
    w = EXCLUDED.w,
    l = EXCLUDED.l,
    sv = EXCLUDED.sv,
    ip = EXCLUDED.ip,
    h_allowed = EXCLUDED.h_allowed,
    r_allowed = EXCLUDED.r_allowed,
    er = EXCLUDED.er,
    bb_allowed = EXCLUDED.bb_allowed,
    k_thrown = EXCLUDED.k_thrown,
    hr_allowed = EXCLUDED.hr_allowed,
    era = EXCLUDED.era,
    whip = EXCLUDED.whip,
    k9 = EXCLUDED.k9,
    bb9 = EXCLUDED.bb9,
    last_updated = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_team_baseball_season_stats(
  p_team_id uuid,
  p_season_year integer DEFAULT (EXTRACT(year FROM now()))::integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_player_id uuid;
BEGIN
  -- Body-level guard mirroring recalculate_baseball_season_stats.
  IF current_setting('request.jwt.claims', true) IS NOT NULL
     AND coalesce(auth.role(), '') <> 'service_role'
     AND NOT public.is_baseball_team_coach_v2(p_team_id)
  THEN
    RAISE EXCEPTION 'forbidden: caller is not a coach of team %', p_team_id
      USING ERRCODE = '42501';
  END IF;

  FOR v_player_id IN
    SELECT DISTINCT player_id FROM baseball_team_members WHERE team_id = p_team_id
  LOOP
    PERFORM recalculate_baseball_season_stats(v_player_id, p_team_id, p_season_year);
  END LOOP;
END;
$function$;
