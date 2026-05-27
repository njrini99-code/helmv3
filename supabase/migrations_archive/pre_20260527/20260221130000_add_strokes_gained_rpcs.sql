-- ============================================================================
-- Strokes Gained RPC Functions
-- Generated: 2026-02-21 (v2 — uses shot_type for classification, not lie_before)
--
-- Creates two functions called from invalidateOnRoundComplete():
--   1. recalculate_round_strokes_gained(p_round_id UUID)
--   2. update_player_stats_strokes_gained(p_player_id UUID)
--
-- Mirrors the PGA_BASELINE_DATA in src/lib/golf/strokes-gained.ts
-- Key fix: classification uses shot_type (not lie_before) to avoid
--   approach shots on the green being mis-categorized as putts.
-- ============================================================================

-- Drop existing versions if present (idempotent)
DROP FUNCTION IF EXISTS recalculate_round_strokes_gained(UUID);
DROP FUNCTION IF EXISTS update_player_stats_strokes_gained(UUID);
DROP FUNCTION IF EXISTS sg_estimate_from_holes(UUID);
DROP FUNCTION IF EXISTS sg_expected_strokes(TEXT, NUMERIC);
DROP FUNCTION IF EXISTS sg_normalize_lie(TEXT);

-- ============================================================================
-- HELPER: Normalize lie string to one of: tee|fairway|rough|sand|green
-- ============================================================================
CREATE OR REPLACE FUNCTION sg_normalize_lie(p_lie TEXT)
RETURNS TEXT AS $$
BEGIN
  CASE lower(coalesce(p_lie, 'fairway'))
    WHEN 'tee', 'teebox'                                           THEN RETURN 'tee';
    WHEN 'fairway'                                                 THEN RETURN 'fairway';
    WHEN 'rough', 'primary_rough'                                  THEN RETURN 'rough';
    WHEN 'sand', 'bunker', 'greenside_bunker', 'fairway_bunker'    THEN RETURN 'sand';
    WHEN 'green', 'fringe'                                         THEN RETURN 'green';
    ELSE                                                                RETURN 'fairway';
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ============================================================================
-- HELPER: Expected strokes from a lie + distance (linear interpolation)
-- Distance input is YARDS. For 'green' lie, converts to feet internally.
-- ============================================================================
CREATE OR REPLACE FUNCTION sg_expected_strokes(p_lie TEXT, p_distance_yards NUMERIC)
RETURNS NUMERIC AS $$
DECLARE
  v_distances NUMERIC[];
  v_strokes   NUMERIC[];
  v_distance  NUMERIC;
  n           INTEGER;
  i           INTEGER;
  ud          NUMERIC; ld NUMERIC; us NUMERIC; ls NUMERIC;
BEGIN
  IF p_lie = 'green' THEN
    -- convert yards → feet for green lookups
    v_distance  := p_distance_yards * 3.0;
    v_distances := ARRAY[90,80,70,60,55,50,45,40,35,30,28,26,24,22,20,
                         18,16,14,12,10,9,8,7,6,5,4,3,2,1,0]::NUMERIC[];
    v_strokes   := ARRAY[2.40,2.30,2.20,2.15,2.08,2.02,2.00,1.93,1.87,1.82,
                         1.78,1.75,1.72,1.68,1.63,1.58,1.53,1.47,1.42,1.32,
                         1.28,1.24,1.20,1.16,1.12,1.08,1.04,1.00,1.00,0]::NUMERIC[];

  ELSIF p_lie = 'tee' THEN
    v_distance  := p_distance_yards;
    v_distances := ARRAY[600,580,560,540,520,500,480,460,440,420,
                         400,380,360,340,320,300,280,260]::NUMERIC[];
    v_strokes   := ARRAY[4.90,4.85,4.80,4.75,4.70,4.65,4.60,4.55,4.50,4.45,
                         4.10,4.02,3.95,3.88,3.82,3.75,3.68,3.62]::NUMERIC[];

  ELSIF p_lie = 'fairway' THEN
    v_distance  := p_distance_yards;
    v_distances := ARRAY[275,250,225,200,190,180,175,170,165,160,155,150,145,140,
                         135,130,125,120,115,110,105,100,95,90,85,80,75,70,65,60,
                         55,50,45,40,35,30,25,20]::NUMERIC[];
    v_strokes   := ARRAY[3.45,3.30,3.15,2.99,2.92,2.86,2.82,2.78,2.75,2.71,2.68,
                         2.67,2.64,2.61,2.58,2.55,2.53,2.50,2.47,2.44,2.42,2.40,
                         2.37,2.35,2.32,2.30,2.27,2.25,2.22,2.20,2.17,2.15,2.12,
                         2.10,2.08,2.06,2.04,2.02]::NUMERIC[];

  ELSIF p_lie = 'rough' THEN
    v_distance  := p_distance_yards;
    v_distances := ARRAY[275,250,225,200,190,180,175,170,165,160,155,150,145,140,
                         135,130,125,120,115,110,105,100,95,90,85,80,75,70,65,60,
                         55,50,45,40,35,30,25,20]::NUMERIC[];
    v_strokes   := ARRAY[3.65,3.48,3.32,3.15,3.08,3.01,2.98,2.94,2.91,2.87,2.84,
                         2.82,2.79,2.76,2.73,2.70,2.68,2.65,2.62,2.59,2.56,2.54,
                         2.51,2.48,2.45,2.42,2.40,2.37,2.34,2.32,2.29,2.26,2.24,
                         2.21,2.18,2.16,2.14,2.12]::NUMERIC[];

  ELSIF p_lie = 'sand' THEN
    v_distance  := p_distance_yards;
    v_distances := ARRAY[40,35,30,28,26,24,22,20,18,16,14,12,10,8,6,5,4,3]::NUMERIC[];
    v_strokes   := ARRAY[2.65,2.58,2.53,2.48,2.44,2.40,2.36,2.32,2.28,2.24,2.20,
                         2.18,2.18,2.14,2.10,2.08,2.06,2.04]::NUMERIC[];

  ELSE -- unknown lie → use fairway baseline
    v_distance  := p_distance_yards;
    v_distances := ARRAY[275,200,150,100,50,20]::NUMERIC[];
    v_strokes   := ARRAY[3.45,2.99,2.67,2.40,2.15,2.02]::NUMERIC[];
  END IF;

  IF v_distance <= 0 THEN RETURN 0; END IF;

  n := array_length(v_distances, 1);

  IF v_distance >= v_distances[1]  THEN RETURN v_strokes[1]; END IF;
  IF v_distance <= v_distances[n]  THEN RETURN v_strokes[n]; END IF;

  FOR i IN 1..(n - 1) LOOP
    ud := v_distances[i];
    ld := v_distances[i + 1];
    IF v_distance <= ud AND v_distance >= ld THEN
      us := v_strokes[i];
      ls := v_strokes[i + 1];
      RETURN ls + (v_distance - ld) / (ud - ld) * (us - ls);
    END IF;
  END LOOP;

  RETURN 3.0;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ============================================================================
-- HELPER: Estimate SG from hole-level data when shot data is missing
-- ============================================================================
CREATE OR REPLACE FUNCTION sg_estimate_from_holes(p_round_id UUID)
RETURNS TABLE(
  sg_off_tee       NUMERIC,
  sg_approach      NUMERIC,
  sg_around_green  NUMERIC,
  sg_putting       NUMERIC
) AS $$
DECLARE
  r_off_tee      NUMERIC := 0;
  r_approach     NUMERIC := 0;
  r_around_green NUMERIC := 0;
  r_putting      NUMERIC := 0;
BEGIN
  SELECT
    ROUND(SUM(1.75 - COALESCE(h.putts, 1.75))::NUMERIC, 2),
    ROUND(SUM(
      CASE WHEN h.par >= 4 THEN
        CASE h.fairway_hit WHEN TRUE THEN 0.20 WHEN FALSE THEN -0.15 ELSE 0 END
      ELSE 0 END
    )::NUMERIC, 2),
    ROUND(SUM(
      CASE h.gir WHEN TRUE THEN 0.25 WHEN FALSE THEN -0.20 ELSE 0 END
    )::NUMERIC, 2),
    ROUND(SUM(
      CASE
        WHEN h.gir = FALSE AND h.up_and_down = TRUE  THEN  0.50
        WHEN h.gir = FALSE AND h.up_and_down = FALSE THEN -0.30
        ELSE 0
      END +
      CASE
        WHEN h.sand_save = TRUE  THEN  0.30
        WHEN h.sand_save = FALSE THEN -0.40
        ELSE 0
      END
    )::NUMERIC, 2)
  INTO r_putting, r_off_tee, r_approach, r_around_green
  FROM golf_holes h
  WHERE h.round_id = p_round_id;

  RETURN QUERY SELECT
    COALESCE(r_off_tee,      0),
    COALESCE(r_approach,     0),
    COALESCE(r_around_green, 0),
    COALESCE(r_putting,      0);
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- MAIN: Recalculate strokes gained for a single round
-- ============================================================================
CREATE OR REPLACE FUNCTION recalculate_round_strokes_gained(p_round_id UUID)
RETURNS VOID AS $$
DECLARE
  v_player_id      UUID;
  v_shot_count     INTEGER;
  v_sg_off_tee     NUMERIC := 0;
  v_sg_approach    NUMERIC := 0;
  v_sg_around      NUMERIC := 0;
  v_sg_putting     NUMERIC := 0;
  v_sg_total       NUMERIC := 0;
BEGIN
  SELECT player_id INTO v_player_id FROM golf_rounds WHERE id = p_round_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Count shots usable for shot-level SG:
  -- Must have shot_type, lie_before, and starting distance
  SELECT COUNT(*) INTO v_shot_count
  FROM golf_shots gs
  WHERE gs.round_id = p_round_id
    AND gs.shot_type IS NOT NULL
    AND gs.lie_before IS NOT NULL
    AND gs.distance_to_hole_before IS NOT NULL
    AND gs.distance_to_hole_before > 0
    AND (
      gs.distance_to_hole_after IS NOT NULL
      OR gs.putt_made = TRUE
      OR gs.result IN ('holed', 'hole')
    );

  IF v_shot_count > 0 THEN
    -- ── Shot-level SG ─────────────────────────────────────────────────────
    WITH normalized AS (
      SELECT
        gs.shot_type,
        gs.shot_number,
        gh.par,

        -- ── Lie before (for expected_before lookup) ─────────────────────
        -- Putts always use 'green'; others use normalized lie_before
        CASE
          WHEN gs.shot_type = 'putting' THEN 'green'
          ELSE sg_normalize_lie(gs.lie_before)
        END AS lie_before_norm,

        -- ── Distance before in YARDS ─────────────────────────────────────
        -- Putts are stored in feet → divide by 3
        -- All others are stored in yards
        CASE
          WHEN gs.shot_type = 'putting' THEN
            CASE WHEN gs.distance_unit_before = 'feet'
              THEN gs.distance_to_hole_before / 3.0
              ELSE gs.distance_to_hole_before    -- already yards (rare edge case)
            END
          ELSE
            CASE WHEN gs.distance_unit_before = 'feet'
              THEN gs.distance_to_hole_before / 3.0
              ELSE gs.distance_to_hole_before
            END
        END AS dist_before_yards,

        -- ── Is holed? ────────────────────────────────────────────────────
        (gs.putt_made = TRUE OR gs.result IN ('holed', 'hole')) AS is_holed,

        -- ── Distance after in YARDS ──────────────────────────────────────
        -- Use explicit after-distance, or fallback to next shot's before-distance
        CASE
          WHEN gs.putt_made = TRUE OR gs.result IN ('holed', 'hole') THEN 0
          WHEN gs.distance_to_hole_after IS NOT NULL THEN
            CASE
              WHEN gs.shot_type = 'putting' THEN
                CASE WHEN gs.distance_unit_after = 'feet'
                  THEN gs.distance_to_hole_after / 3.0
                  ELSE gs.distance_to_hole_after
                END
              ELSE
                CASE WHEN gs.distance_unit_after = 'feet'
                  THEN gs.distance_to_hole_after / 3.0
                  ELSE gs.distance_to_hole_after
                END
            END
          ELSE
            -- Fallback: next shot's distance_to_hole_before (window within hole)
            CASE
              WHEN LEAD(gs.distance_unit_before) OVER w = 'feet'
              THEN COALESCE(LEAD(gs.distance_to_hole_before) OVER w, 0) / 3.0
              ELSE COALESCE(LEAD(gs.distance_to_hole_before) OVER w, 0)
            END
        END AS dist_after_yards,

        -- ── Lie after (for expected_after lookup) ────────────────────────
        CASE
          WHEN gs.putt_made = TRUE OR gs.result IN ('holed', 'hole') THEN 'green'
          WHEN gs.lie_after IS NOT NULL THEN sg_normalize_lie(gs.lie_after)
          -- Fallback: next shot's lie_before
          ELSE sg_normalize_lie(LEAD(gs.lie_before) OVER w)
        END AS lie_after_norm,

        COALESCE(gs.is_penalty, FALSE) AS is_penalty

      FROM golf_shots gs
      JOIN golf_holes gh ON gh.id = gs.hole_id
      WHERE gs.round_id = p_round_id
        AND gs.shot_type IS NOT NULL
        AND gs.distance_to_hole_before IS NOT NULL
        AND gs.distance_to_hole_before > 0
      WINDOW w AS (PARTITION BY gs.hole_id ORDER BY gs.shot_number)
    ),
    categorized AS (
      SELECT
        -- Category via shot_type (most reliable)
        CASE
          WHEN is_penalty                   THEN NULL
          WHEN shot_type = 'putting'        THEN 'putting'
          WHEN shot_type = 'tee'            THEN 'off_tee'
          WHEN shot_type = 'around_green'   THEN 'around_green'
          ELSE                                   'approach'  -- approach, recovery, etc.
        END AS category,

        -- Expected strokes before this shot
        sg_expected_strokes(lie_before_norm, dist_before_yards) AS exp_before,

        -- Expected strokes after (0 if holed)
        CASE
          WHEN is_holed        THEN 0
          WHEN dist_after_yards > 0
          THEN sg_expected_strokes(lie_after_norm, dist_after_yards)
          ELSE 0
        END AS exp_after,

        -- Shots with valid after-distance (or holed)
        (is_holed OR dist_after_yards > 0) AS has_after

      FROM normalized
      WHERE dist_before_yards > 0
    )
    SELECT
      ROUND(COALESCE(SUM(CASE WHEN category = 'off_tee'      AND has_after THEN exp_before - exp_after - 1 END), 0)::NUMERIC, 3),
      ROUND(COALESCE(SUM(CASE WHEN category = 'approach'     AND has_after THEN exp_before - exp_after - 1 END), 0)::NUMERIC, 3),
      ROUND(COALESCE(SUM(CASE WHEN category = 'around_green' AND has_after THEN exp_before - exp_after - 1 END), 0)::NUMERIC, 3),
      ROUND(COALESCE(SUM(CASE WHEN category = 'putting'      AND has_after THEN exp_before - exp_after - 1 END), 0)::NUMERIC, 3)
    INTO v_sg_off_tee, v_sg_approach, v_sg_around, v_sg_putting
    FROM categorized;

  ELSE
    -- ── Hole-level estimation fallback ────────────────────────────────────
    SELECT sg_off_tee, sg_approach, sg_around_green, sg_putting
    INTO v_sg_off_tee, v_sg_approach, v_sg_around, v_sg_putting
    FROM sg_estimate_from_holes(p_round_id);
  END IF;

  v_sg_total := ROUND((
    COALESCE(v_sg_off_tee,  0)
    + COALESCE(v_sg_approach, 0)
    + COALESCE(v_sg_around,   0)
    + COALESCE(v_sg_putting,  0)
  )::NUMERIC, 3);

  -- ── Upsert into golf_round_stats_cache ────────────────────────────────────
  INSERT INTO golf_round_stats_cache (
    id, round_id, player_id,
    strokes_gained_total, strokes_gained_tee, strokes_gained_approach,
    strokes_gained_around_green, strokes_gained_putting,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(), p_round_id, v_player_id,
    v_sg_total, v_sg_off_tee, v_sg_approach, v_sg_around, v_sg_putting,
    now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM golf_round_stats_cache WHERE round_id = p_round_id
  );

  UPDATE golf_round_stats_cache
  SET
    strokes_gained_total        = v_sg_total,
    strokes_gained_tee          = v_sg_off_tee,
    strokes_gained_approach     = v_sg_approach,
    strokes_gained_around_green = v_sg_around,
    strokes_gained_putting      = v_sg_putting,
    updated_at                  = now()
  WHERE round_id = p_round_id;

END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- MAIN: Update player-level SG aggregates in golf_player_stats_cache
-- ============================================================================
CREATE OR REPLACE FUNCTION update_player_stats_strokes_gained(p_player_id UUID)
RETURNS VOID AS $$
DECLARE
  v_count          INTEGER;
  v_sg_total       NUMERIC;
  v_sg_tee         NUMERIC;
  v_sg_approach    NUMERIC;
  v_sg_around      NUMERIC;
  v_sg_putting     NUMERIC;
BEGIN
  SELECT
    COUNT(*),
    SUM(rsc.strokes_gained_total),
    SUM(rsc.strokes_gained_tee),
    SUM(rsc.strokes_gained_approach),
    SUM(rsc.strokes_gained_around_green),
    SUM(rsc.strokes_gained_putting)
  INTO v_count, v_sg_total, v_sg_tee, v_sg_approach, v_sg_around, v_sg_putting
  FROM golf_round_stats_cache rsc
  JOIN golf_rounds r ON r.id = rsc.round_id
  WHERE rsc.player_id    = p_player_id
    AND r.status         = 'completed'
    AND rsc.strokes_gained_total IS NOT NULL;

  IF v_count = 0 THEN RETURN; END IF;

  UPDATE golf_player_stats_cache
  SET
    strokes_gained_total        = ROUND(v_sg_total::NUMERIC,    3),
    strokes_gained_tee          = ROUND(v_sg_tee::NUMERIC,      3),
    strokes_gained_approach     = ROUND(v_sg_approach::NUMERIC, 3),
    strokes_gained_around_green = ROUND(v_sg_around::NUMERIC,   3),
    strokes_gained_putting      = ROUND(v_sg_putting::NUMERIC,  3),
    sg_total_per_round          = ROUND((v_sg_total    / v_count)::NUMERIC, 3),
    sg_tee_per_round            = ROUND((v_sg_tee      / v_count)::NUMERIC, 3),
    sg_approach_per_round       = ROUND((v_sg_approach / v_count)::NUMERIC, 3),
    sg_around_green_per_round   = ROUND((v_sg_around   / v_count)::NUMERIC, 3),
    sg_putting_per_round        = ROUND((v_sg_putting  / v_count)::NUMERIC, 3),
    updated_at                  = now()
  WHERE player_id = p_player_id;

  IF NOT FOUND THEN
    INSERT INTO golf_player_stats_cache (
      id, player_id,
      strokes_gained_total, strokes_gained_tee, strokes_gained_approach,
      strokes_gained_around_green, strokes_gained_putting,
      sg_total_per_round, sg_tee_per_round, sg_approach_per_round,
      sg_around_green_per_round, sg_putting_per_round,
      rounds_played, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), p_player_id,
      ROUND(v_sg_total::NUMERIC,    3),
      ROUND(v_sg_tee::NUMERIC,      3),
      ROUND(v_sg_approach::NUMERIC, 3),
      ROUND(v_sg_around::NUMERIC,   3),
      ROUND(v_sg_putting::NUMERIC,  3),
      ROUND((v_sg_total    / v_count)::NUMERIC, 3),
      ROUND((v_sg_tee      / v_count)::NUMERIC, 3),
      ROUND((v_sg_approach / v_count)::NUMERIC, 3),
      ROUND((v_sg_around   / v_count)::NUMERIC, 3),
      ROUND((v_sg_putting  / v_count)::NUMERIC, 3),
      v_count, now(), now()
    );
  END IF;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- BACKFILL: Recalculate SG for all existing completed rounds
-- ============================================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT gr.id AS round_id, gr.player_id
    FROM golf_rounds gr
    WHERE gr.status = 'completed'
    ORDER BY gr.id
  LOOP
    PERFORM recalculate_round_strokes_gained(r.round_id);
  END LOOP;

  FOR r IN
    SELECT DISTINCT rsc.player_id
    FROM golf_round_stats_cache rsc
    WHERE rsc.strokes_gained_total IS NOT NULL
  LOOP
    PERFORM update_player_stats_strokes_gained(r.player_id);
  END LOOP;
END $$;
