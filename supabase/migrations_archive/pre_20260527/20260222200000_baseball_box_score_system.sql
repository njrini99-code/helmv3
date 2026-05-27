-- =====================================================================
-- BASEBALL BOX SCORE SYSTEM
-- Migration: 20260222200000_baseball_box_score_system
-- 
-- Creates:
--   - baseball_games: official game/scrimmage records
--   - baseball_box_score_batting: per-player batting lines
--   - baseball_box_score_pitching: per-player pitching lines
--   - baseball_player_season_stats: auto-calculated season aggregates
--   - baseball_box_score_uploads: upload tracking for CSV/PDF
--   - RPC: recalculate_baseball_season_stats()
-- =====================================================================

-- -----------------------------------------------------------------------
-- baseball_games
-- -----------------------------------------------------------------------
CREATE TABLE baseball_games (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  event_id uuid REFERENCES baseball_events(id) ON DELETE SET NULL,
  game_date date NOT NULL,
  game_type text NOT NULL DEFAULT 'game' CHECK (game_type IN ('game', 'scrimmage')),
  opponent_name text,
  location text,
  home_away text CHECK (home_away IN ('home', 'away', 'neutral')),
  our_score integer,
  opponent_score integer,
  innings_played integer DEFAULT 9,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'postponed')),
  notes text,
  weather text,
  created_by uuid REFERENCES baseball_coaches(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- -----------------------------------------------------------------------
-- baseball_box_score_batting
-- -----------------------------------------------------------------------
CREATE TABLE baseball_box_score_batting (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES baseball_games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES baseball_players(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  -- Standard batting line
  ab integer NOT NULL DEFAULT 0,
  r integer NOT NULL DEFAULT 0,
  h integer NOT NULL DEFAULT 0,
  doubles integer NOT NULL DEFAULT 0,
  triples integer NOT NULL DEFAULT 0,
  hr integer NOT NULL DEFAULT 0,
  rbi integer NOT NULL DEFAULT 0,
  bb integer NOT NULL DEFAULT 0,
  k integer NOT NULL DEFAULT 0,
  sb integer NOT NULL DEFAULT 0,
  cs integer NOT NULL DEFAULT 0,
  hbp integer NOT NULL DEFAULT 0,
  sac integer NOT NULL DEFAULT 0,
  sf integer NOT NULL DEFAULT 0,
  lob integer NOT NULL DEFAULT 0,
  batting_order integer,
  -- Computed rates (stored for query performance)
  avg numeric(5,3),
  obp numeric(5,3),
  slg numeric(5,3),
  ops numeric(5,3),
  created_at timestamptz DEFAULT now(),
  UNIQUE(game_id, player_id)
);

-- -----------------------------------------------------------------------
-- baseball_box_score_pitching
-- -----------------------------------------------------------------------
CREATE TABLE baseball_box_score_pitching (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES baseball_games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES baseball_players(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  -- Standard pitching line (ip stored as decimal: 6.2 = 6 and 2/3 innings)
  ip numeric(4,1) NOT NULL DEFAULT 0,
  h integer NOT NULL DEFAULT 0,
  r integer NOT NULL DEFAULT 0,
  er integer NOT NULL DEFAULT 0,
  bb integer NOT NULL DEFAULT 0,
  k integer NOT NULL DEFAULT 0,
  hr integer NOT NULL DEFAULT 0,
  pitch_count integer,
  strikes integer,
  result text CHECK (result IN ('W','L','S','H','BS','ND')),
  -- Computed rates
  era numeric(5,2),
  whip numeric(5,3),
  k9 numeric(5,2),
  bb9 numeric(5,2),
  created_at timestamptz DEFAULT now(),
  UNIQUE(game_id, player_id)
);

-- -----------------------------------------------------------------------
-- baseball_player_season_stats (auto-calculated aggregates)
-- -----------------------------------------------------------------------
CREATE TABLE baseball_player_season_stats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES baseball_players(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  season_year integer NOT NULL DEFAULT EXTRACT(YEAR FROM now())::integer,
  -- Batting totals
  g integer NOT NULL DEFAULT 0,
  ab integer NOT NULL DEFAULT 0,
  r integer NOT NULL DEFAULT 0,
  h integer NOT NULL DEFAULT 0,
  doubles integer NOT NULL DEFAULT 0,
  triples integer NOT NULL DEFAULT 0,
  hr integer NOT NULL DEFAULT 0,
  rbi integer NOT NULL DEFAULT 0,
  bb integer NOT NULL DEFAULT 0,
  k integer NOT NULL DEFAULT 0,
  sb integer NOT NULL DEFAULT 0,
  cs integer NOT NULL DEFAULT 0,
  hbp integer NOT NULL DEFAULT 0,
  sac integer NOT NULL DEFAULT 0,
  sf integer NOT NULL DEFAULT 0,
  -- Batting rates (auto-calculated)
  avg numeric(5,3),
  obp numeric(5,3),
  slg numeric(5,3),
  ops numeric(5,3),
  -- Pitching totals
  g_p integer NOT NULL DEFAULT 0,
  gs integer NOT NULL DEFAULT 0,
  w integer NOT NULL DEFAULT 0,
  l integer NOT NULL DEFAULT 0,
  sv integer NOT NULL DEFAULT 0,
  ip numeric(6,1) NOT NULL DEFAULT 0,
  h_allowed integer NOT NULL DEFAULT 0,
  r_allowed integer NOT NULL DEFAULT 0,
  er integer NOT NULL DEFAULT 0,
  bb_allowed integer NOT NULL DEFAULT 0,
  k_thrown integer NOT NULL DEFAULT 0,
  hr_allowed integer NOT NULL DEFAULT 0,
  -- Pitching rates (auto-calculated)
  era numeric(5,2),
  whip numeric(5,3),
  k9 numeric(5,2),
  bb9 numeric(5,2),
  last_updated timestamptz DEFAULT now(),
  UNIQUE(player_id, team_id, season_year)
);

-- -----------------------------------------------------------------------
-- baseball_box_score_uploads (CSV/PDF upload tracking)
-- -----------------------------------------------------------------------
CREATE TABLE baseball_box_score_uploads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  game_id uuid REFERENCES baseball_games(id) ON DELETE SET NULL,
  coach_id uuid NOT NULL REFERENCES baseball_coaches(id),
  filename text NOT NULL,
  upload_type text NOT NULL DEFAULT 'manual' CHECK (upload_type IN ('csv', 'pdf', 'manual')),
  raw_content text,
  parsed_data jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'review_needed', 'completed', 'failed')),
  matched_players jsonb DEFAULT '[]'::jsonb,
  unmatched_players jsonb DEFAULT '[]'::jsonb,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- -----------------------------------------------------------------------
-- INDEXES
-- -----------------------------------------------------------------------
CREATE INDEX idx_baseball_games_team_id ON baseball_games(team_id);
CREATE INDEX idx_baseball_games_event_id ON baseball_games(event_id);
CREATE INDEX idx_baseball_games_game_date ON baseball_games(game_date DESC);
CREATE INDEX idx_baseball_games_status ON baseball_games(status);
CREATE INDEX idx_baseball_games_created_by ON baseball_games(created_by);

CREATE INDEX idx_baseball_bsb_game_id ON baseball_box_score_batting(game_id);
CREATE INDEX idx_baseball_bsb_player_id ON baseball_box_score_batting(player_id);
CREATE INDEX idx_baseball_bsb_team_id ON baseball_box_score_batting(team_id);

CREATE INDEX idx_baseball_bsp_game_id ON baseball_box_score_pitching(game_id);
CREATE INDEX idx_baseball_bsp_player_id ON baseball_box_score_pitching(player_id);
CREATE INDEX idx_baseball_bsp_team_id ON baseball_box_score_pitching(team_id);

CREATE INDEX idx_baseball_pss_player_id ON baseball_player_season_stats(player_id);
CREATE INDEX idx_baseball_pss_team_id ON baseball_player_season_stats(team_id);
CREATE INDEX idx_baseball_pss_season_year ON baseball_player_season_stats(season_year);

CREATE INDEX idx_baseball_bsu_team_id ON baseball_box_score_uploads(team_id);
CREATE INDEX idx_baseball_bsu_game_id ON baseball_box_score_uploads(game_id);
CREATE INDEX idx_baseball_bsu_coach_id ON baseball_box_score_uploads(coach_id);

-- -----------------------------------------------------------------------
-- RLS POLICIES
-- -----------------------------------------------------------------------
ALTER TABLE baseball_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_box_score_batting ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_box_score_pitching ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_player_season_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_box_score_uploads ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user a coach on the given team?
CREATE OR REPLACE FUNCTION is_baseball_team_coach_v2(p_team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM baseball_team_coach_staff
    WHERE team_id = p_team_id
      AND coach_id = (SELECT id FROM baseball_coaches WHERE user_id = auth.uid() LIMIT 1)
  );
$$;

-- Helper: is the current user a member of the given team?
CREATE OR REPLACE FUNCTION is_baseball_team_member_v2(p_team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM baseball_team_members
    WHERE team_id = p_team_id
      AND player_id = (SELECT id FROM baseball_players WHERE user_id = auth.uid() LIMIT 1)
  );
$$;

-- baseball_games policies
CREATE POLICY "Team members and coaches can view games"
  ON baseball_games FOR SELECT
  USING (
    is_baseball_team_member_v2(team_id)
    OR is_baseball_team_coach_v2(team_id)
  );

CREATE POLICY "Coaches can insert games"
  ON baseball_games FOR INSERT
  WITH CHECK (is_baseball_team_coach_v2(team_id));

CREATE POLICY "Coaches can update games"
  ON baseball_games FOR UPDATE
  USING (is_baseball_team_coach_v2(team_id));

CREATE POLICY "Coaches can delete games"
  ON baseball_games FOR DELETE
  USING (is_baseball_team_coach_v2(team_id));

-- baseball_box_score_batting policies
CREATE POLICY "Players see own + coaches see team batting"
  ON baseball_box_score_batting FOR SELECT
  USING (
    player_id = (SELECT id FROM baseball_players WHERE user_id = auth.uid() LIMIT 1)
    OR is_baseball_team_coach_v2(team_id)
  );

CREATE POLICY "Coaches can insert batting stats"
  ON baseball_box_score_batting FOR INSERT
  WITH CHECK (is_baseball_team_coach_v2(team_id));

CREATE POLICY "Coaches can update batting stats"
  ON baseball_box_score_batting FOR UPDATE
  USING (is_baseball_team_coach_v2(team_id));

CREATE POLICY "Coaches can delete batting stats"
  ON baseball_box_score_batting FOR DELETE
  USING (is_baseball_team_coach_v2(team_id));

-- baseball_box_score_pitching policies
CREATE POLICY "Players see own + coaches see team pitching"
  ON baseball_box_score_pitching FOR SELECT
  USING (
    player_id = (SELECT id FROM baseball_players WHERE user_id = auth.uid() LIMIT 1)
    OR is_baseball_team_coach_v2(team_id)
  );

CREATE POLICY "Coaches can insert pitching stats"
  ON baseball_box_score_pitching FOR INSERT
  WITH CHECK (is_baseball_team_coach_v2(team_id));

CREATE POLICY "Coaches can update pitching stats"
  ON baseball_box_score_pitching FOR UPDATE
  USING (is_baseball_team_coach_v2(team_id));

CREATE POLICY "Coaches can delete pitching stats"
  ON baseball_box_score_pitching FOR DELETE
  USING (is_baseball_team_coach_v2(team_id));

-- baseball_player_season_stats policies
CREATE POLICY "Players see own + coaches see team season stats"
  ON baseball_player_season_stats FOR SELECT
  USING (
    player_id = (SELECT id FROM baseball_players WHERE user_id = auth.uid() LIMIT 1)
    OR is_baseball_team_coach_v2(team_id)
  );

CREATE POLICY "Coaches can manage season stats"
  ON baseball_player_season_stats FOR ALL
  USING (is_baseball_team_coach_v2(team_id))
  WITH CHECK (is_baseball_team_coach_v2(team_id));

-- baseball_box_score_uploads: coach-only
CREATE POLICY "Coaches can manage their uploads"
  ON baseball_box_score_uploads FOR ALL
  USING (
    coach_id = (SELECT id FROM baseball_coaches WHERE user_id = auth.uid() LIMIT 1)
  )
  WITH CHECK (
    coach_id = (SELECT id FROM baseball_coaches WHERE user_id = auth.uid() LIMIT 1)
  );

-- -----------------------------------------------------------------------
-- RPC: recalculate_baseball_season_stats
-- Called after every box score save to keep season stats current
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_baseball_season_stats(
  p_player_id uuid,
  p_team_id uuid,
  p_season_year integer DEFAULT EXTRACT(YEAR FROM now())::integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
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
  -- Pitching
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
  -- ---- Batting aggregation ----
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

  -- Calculate batting rates
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

  -- ---- Pitching aggregation ----
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

  -- Calculate pitching rates
  IF v_ip > 0 THEN
    v_era := ROUND(9.0 * v_er / v_ip, 2);
    v_whip := ROUND((v_bb_allowed + v_h_allowed)::numeric / v_ip, 3);
    v_k9 := ROUND(9.0 * v_k_thrown / v_ip, 2);
    v_bb9 := ROUND(9.0 * v_bb_allowed / v_ip, 2);
  END IF;

  -- ---- Upsert season stats ----
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
$$;

-- RPC: Recalculate all players on a team for a given season
CREATE OR REPLACE FUNCTION recalculate_team_baseball_season_stats(
  p_team_id uuid,
  p_season_year integer DEFAULT EXTRACT(YEAR FROM now())::integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_player_id uuid;
BEGIN
  FOR v_player_id IN
    SELECT DISTINCT player_id FROM baseball_team_members WHERE team_id = p_team_id
  LOOP
    PERFORM recalculate_baseball_season_stats(v_player_id, p_team_id, p_season_year);
  END LOOP;
END;
$$;
