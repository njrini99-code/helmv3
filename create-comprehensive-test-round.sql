-- ============================================================================
-- CREATE COMPREHENSIVE TEST GOLF ROUND with FULL SHOT TRACKING
-- For player: rinin376@gmail.com (ID: 5bab961e-4ea4-4c88-812f-68a9469f8156)
-- Course: Pebble Beach Golf Links
-- Score: 78 (+6)
-- ============================================================================

DO $$
DECLARE
  v_round_id uuid;
  v_hole_id uuid;
BEGIN
  -- ========== CREATE ROUND ==========
  INSERT INTO golf_rounds (
    player_id,
    course_name,
    course_city,
    course_state,
    round_date,
    total_score,
    total_to_par,
    course_rating,
    course_slope,
    tees_played,
    round_type,
    starting_hole,
    fairways_hit,
    fairways_total,
    greens_in_regulation,
    greens_total,
    total_putts,
    is_verified
  ) VALUES (
    '5bab961e-4ea4-4c88-812f-68a9469f8156',
    'Pebble Beach Golf Links',
    'Pebble Beach',
    'CA',
    '2026-01-02',
    78,  -- total score
    6,   -- +6 over par
    72.0,
    145,
    'Blue',
    'practice',
    1,
    10,  -- fairways hit
    14,  -- total fairways (4 par 3s don't count)
    11,  -- greens in regulation
    18,  -- total greens
    32,  -- total putts
    false
  )
  RETURNING id INTO v_round_id;

  RAISE NOTICE 'Created round: %', v_round_id;

  -- ========== HOLE 1: Par 4, Score 4 (PAR) ==========
  -- Tee shot to fairway, approach to green, 2 putts
  INSERT INTO golf_holes (round_id, hole_number, par, score, score_to_par, yardage, putts, fairway_hit, green_in_regulation)
  VALUES (v_round_id, 1, 4, 4, 0, 380, 2, true, true)
  RETURNING id INTO v_hole_id;

  INSERT INTO golf_shots (round_id, hole_id, hole_number, shot_number, club_type, shot_type, shot_distance, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, lie_before, result, miss_direction) VALUES
  (v_round_id, v_hole_id, 1, 1, 'Driver', 'tee_shot', 260, 380, 120, 'yards', 'yards', 'tee', 'fairway', null),
  (v_round_id, v_hole_id, 1, 2, '9 Iron', 'approach', 118, 120, 15, 'yards', 'feet', 'fairway', 'green', null),
  (v_round_id, v_hole_id, 1, 3, 'Putter', 'putt', 15, 15, 3, 'feet', 'feet', 'green', 'good', null),
  (v_round_id, v_hole_id, 1, 4, 'Putter', 'putt', 3, 3, 0, 'feet', 'feet', 'green', 'hole', null);

  -- ========== HOLE 2: Par 5, Score 5 (PAR) ==========
  -- Tee shot fairway, layup, approach, 2 putts
  INSERT INTO golf_holes (round_id, hole_number, par, score, score_to_par, yardage, putts, fairway_hit, green_in_regulation)
  VALUES (v_round_id, 2, 5, 5, 0, 505, 2, true, false)
  RETURNING id INTO v_hole_id;

  INSERT INTO golf_shots (round_id, hole_id, hole_number, shot_number, club_type, shot_type, shot_distance, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, lie_before, result, miss_direction) VALUES
  (v_round_id, v_hole_id, 2, 1, 'Driver', 'tee_shot', 275, 505, 230, 'yards', 'yards', 'tee', 'fairway', null),
  (v_round_id, v_hole_id, 2, 2, '5 Iron', 'fairway', 180, 230, 50, 'yards', 'yards', 'fairway', 'fairway', null),
  (v_round_id, v_hole_id, 2, 3, 'Gap Wedge', 'approach', 48, 50, 8, 'yards', 'feet', 'fairway', 'green', null),
  (v_round_id, v_hole_id, 2, 4, 'Putter', 'putt', 8, 8, 2, 'feet', 'feet', 'green', 'good', null),
  (v_round_id, v_hole_id, 2, 5, 'Putter', 'putt', 2, 2, 0, 'feet', 'feet', 'green', 'hole', null);

  -- ========== HOLE 3: Par 3, Score 3 (PAR) ==========
  -- Tee shot to green, 2 putts
  INSERT INTO golf_holes (round_id, hole_number, par, score, score_to_par, yardage, putts, fairway_hit, green_in_regulation)
  VALUES (v_round_id, 3, 3, 3, 0, 188, 2, null, true)
  RETURNING id INTO v_hole_id;

  INSERT INTO golf_shots (round_id, hole_id, hole_number, shot_number, club_type, shot_type, shot_distance, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, lie_before, result, miss_direction) VALUES
  (v_round_id, v_hole_id, 3, 1, '5 Iron', 'tee_shot', 185, 188, 22, 'yards', 'feet', 'tee', 'green', null),
  (v_round_id, v_hole_id, 3, 2, 'Putter', 'putt', 22, 22, 3, 'feet', 'feet', 'green', 'good', null),
  (v_round_id, v_hole_id, 3, 3, 'Putter', 'putt', 3, 3, 0, 'feet', 'feet', 'green', 'hole', null);

  -- ========== HOLE 4: Par 4, Score 5 (BOGEY) ==========
  -- Tee shot into rough, recovery, approach short, chip, putt
  INSERT INTO golf_holes (round_id, hole_number, par, score, score_to_par, yardage, putts, fairway_hit, green_in_regulation)
  VALUES (v_round_id, 4, 4, 5, 1, 405, 2, false, false)
  RETURNING id INTO v_hole_id;

  INSERT INTO golf_shots (round_id, hole_id, hole_number, shot_number, club_type, shot_type, shot_distance, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, lie_before, result, miss_direction) VALUES
  (v_round_id, v_hole_id, 4, 1, 'Driver', 'tee_shot', 240, 405, 165, 'yards', 'yards', 'tee', 'poor', 'left'),
  (v_round_id, v_hole_id, 4, 2, '7 Iron', 'recovery', 140, 165, 25, 'yards', 'yards', 'rough', 'fairway', null),
  (v_round_id, v_hole_id, 4, 3, 'Lob Wedge', 'chip', 22, 25, 4, 'yards', 'feet', 'fringe', 'green', null),
  (v_round_id, v_hole_id, 4, 4, 'Putter', 'putt', 4, 4, 1, 'feet', 'feet', 'green', 'good', null),
  (v_round_id, v_hole_id, 4, 5, 'Putter', 'putt', 1, 1, 0, 'feet', 'inches', 'green', 'hole', null);

  -- ========== HOLE 5: Par 4, Score 4 (PAR) ==========
  -- Good tee shot, approach to green, 2 putts
  INSERT INTO golf_holes (round_id, hole_number, par, score, score_to_par, yardage, putts, fairway_hit, green_in_regulation)
  VALUES (v_round_id, 5, 4, 4, 0, 365, 2, true, true)
  RETURNING id INTO v_hole_id;

  INSERT INTO golf_shots (round_id, hole_id, hole_number, shot_number, club_type, shot_type, shot_distance, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, lie_before, result, miss_direction) VALUES
  (v_round_id, v_hole_id, 5, 1, 'Driver', 'tee_shot', 265, 365, 100, 'yards', 'yards', 'tee', 'fairway', null),
  (v_round_id, v_hole_id, 5, 2, 'Pitching Wedge', 'approach', 98, 100, 12, 'yards', 'feet', 'fairway', 'green', null),
  (v_round_id, v_hole_id, 5, 3, 'Putter', 'putt', 12, 12, 2, 'feet', 'feet', 'green', 'good', null),
  (v_round_id, v_hole_id, 5, 4, 'Putter', 'putt', 2, 2, 0, 'feet', 'inches', 'green', 'hole', null);

  -- ========== HOLE 6: Par 5, Score 4 (BIRDIE!) ==========
  -- Long drive, great 3-wood, wedge close, 1 putt
  INSERT INTO golf_holes (round_id, hole_number, par, score, score_to_par, yardage, putts, fairway_hit, green_in_regulation)
  VALUES (v_round_id, 6, 5, 4, -1, 525, 1, true, true)
  RETURNING id INTO v_hole_id;

  INSERT INTO golf_shots (round_id, hole_id, hole_number, shot_number, club_type, shot_type, shot_distance, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, lie_before, result, miss_direction) VALUES
  (v_round_id, v_hole_id, 6, 1, 'Driver', 'tee_shot', 285, 525, 240, 'yards', 'yards', 'tee', 'great', null),
  (v_round_id, v_hole_id, 6, 2, '3 Wood', 'fairway', 215, 240, 25, 'yards', 'yards', 'fairway', 'great', null),
  (v_round_id, v_hole_id, 6, 3, 'Lob Wedge', 'approach', 23, 25, 6, 'yards', 'feet', 'fairway', 'green', null),
  (v_round_id, v_hole_id, 6, 4, 'Putter', 'putt', 6, 6, 0, 'feet', 'feet', 'green', 'hole', null);

  -- ========== HOLE 7: Par 3, Score 4 (BOGEY) ==========
  -- Tee shot missed green right, chip, 2 putts
  INSERT INTO golf_holes (round_id, hole_number, par, score, score_to_par, yardage, putts, fairway_hit, green_in_regulation)
  VALUES (v_round_id, 7, 3, 4, 1, 175, 2, null, false)
  RETURNING id INTO v_hole_id;

  INSERT INTO golf_shots (round_id, hole_id, hole_number, shot_number, club_type, shot_type, shot_distance, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, lie_before, result, miss_direction) VALUES
  (v_round_id, v_hole_id, 7, 1, '6 Iron', 'tee_shot', 172, 175, 18, 'yards', 'yards', 'tee', 'poor', 'right'),
  (v_round_id, v_hole_id, 7, 2, 'Sand Wedge', 'chip', 16, 18, 8, 'yards', 'feet', 'rough', 'green', null),
  (v_round_id, v_hole_id, 7, 3, 'Putter', 'putt', 8, 8, 2, 'feet', 'feet', 'green', 'good', null),
  (v_round_id, v_hole_id, 7, 4, 'Putter', 'putt', 2, 2, 0, 'feet', 'inches', 'green', 'hole', null);

  -- ========== HOLE 8: Par 4, Score 4 (PAR) ==========
  -- Tee shot, approach just off green, chip, putt
  INSERT INTO golf_holes (round_id, hole_number, par, score, score_to_par, yardage, putts, fairway_hit, green_in_regulation)
  VALUES (v_round_id, 8, 4, 4, 0, 395, 1, true, false)
  RETURNING id INTO v_hole_id;

  INSERT INTO golf_shots (round_id, hole_id, hole_number, shot_number, club_type, shot_type, shot_distance, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, lie_before, result, miss_direction) VALUES
  (v_round_id, v_hole_id, 8, 1, 'Driver', 'tee_shot', 270, 395, 125, 'yards', 'yards', 'tee', 'fairway', null),
  (v_round_id, v_hole_id, 8, 2, '9 Iron', 'approach', 122, 125, 12, 'yards', 'feet', 'fairway', 'good', 'short'),
  (v_round_id, v_hole_id, 8, 3, 'Putter', 'chip', 12, 12, 2, 'feet', 'feet', 'fringe', 'great', null),
  (v_round_id, v_hole_id, 8, 4, 'Putter', 'putt', 2, 2, 0, 'feet', 'inches', 'green', 'hole', null);

  -- ========== HOLE 9: Par 4, Score 5 (BOGEY) ==========
  -- Tee shot fairway, approach, 3 putts
  INSERT INTO golf_holes (round_id, hole_number, par, score, score_to_par, yardage, putts, fairway_hit, green_in_regulation)
  VALUES (v_round_id, 9, 4, 5, 1, 410, 3, true, false)
  RETURNING id INTO v_hole_id;

  INSERT INTO golf_shots (round_id, hole_id, hole_number, shot_number, club_type, shot_type, shot_distance, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, lie_before, result, miss_direction, putt_break, putt_slope) VALUES
  (v_round_id, v_hole_id, 9, 1, 'Driver', 'tee_shot', 268, 410, 142, 'yards', 'yards', 'tee', 'fairway', null, null, null),
  (v_round_id, v_hole_id, 9, 2, '8 Iron', 'approach', 138, 142, 35, 'yards', 'feet', 'fairway', 'green', null, null, null),
  (v_round_id, v_hole_id, 9, 3, 'Putter', 'putt', 35, 35, 8, 'feet', 'feet', 'green', 'poor', 'long', 'left_to_right', 'downhill'),
  (v_round_id, v_hole_id, 9, 4, 'Putter', 'putt', 8, 8, 1, 'feet', 'feet', 'green', 'good', null, 'right_to_left', 'uphill'),
  (v_round_id, v_hole_id, 9, 5, 'Putter', 'putt', 1, 1, 0, 'feet', 'inches', 'green', 'hole', null, null, null);

  -- ========== HOLE 10: Par 4, Score 4 (PAR) ==========
  INSERT INTO golf_holes (round_id, hole_number, par, score, score_to_par, yardage, putts, fairway_hit, green_in_regulation)
  VALUES (v_round_id, 10, 4, 4, 0, 380, 2, true, true)
  RETURNING id INTO v_hole_id;

  INSERT INTO golf_shots (round_id, hole_id, hole_number, shot_number, club_type, shot_type, shot_distance, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, lie_before, result) VALUES
  (v_round_id, v_hole_id, 10, 1, 'Driver', 'tee_shot', 255, 380, 125, 'yards', 'yards', 'tee', 'fairway'),
  (v_round_id, v_hole_id, 10, 2, '9 Iron', 'approach', 120, 125, 18, 'yards', 'feet', 'fairway', 'green'),
  (v_round_id, v_hole_id, 10, 3, 'Putter', 'putt', 18, 18, 2, 'feet', 'feet', 'green', 'good'),
  (v_round_id, v_hole_id, 10, 4, 'Putter', 'putt', 2, 2, 0, 'feet', 'inches', 'green', 'hole');

  -- ========== HOLE 11: Par 5, Score 5 (PAR) ==========
  INSERT INTO golf_holes (round_id, hole_number, par, score, score_to_par, yardage, putts, fairway_hit, green_in_regulation)
  VALUES (v_round_id, 11, 5, 5, 0, 540, 2, true, true)
  RETURNING id INTO v_hole_id;

  INSERT INTO golf_shots (round_id, hole_id, hole_number, shot_number, club_type, shot_type, shot_distance, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, lie_before, result) VALUES
  (v_round_id, v_hole_id, 11, 1, 'Driver', 'tee_shot', 272, 540, 268, 'yards', 'yards', 'tee', 'fairway'),
  (v_round_id, v_hole_id, 11, 2, '4 Iron', 'fairway', 195, 268, 73, 'yards', 'yards', 'fairway', 'fairway'),
  (v_round_id, v_hole_id, 11, 3, 'Gap Wedge', 'approach', 70, 73, 20, 'yards', 'feet', 'fairway', 'green'),
  (v_round_id, v_hole_id, 11, 4, 'Putter', 'putt', 20, 20, 3, 'feet', 'feet', 'green', 'good'),
  (v_round_id, v_hole_id, 11, 5, 'Putter', 'putt', 3, 3, 0, 'feet', 'inches', 'green', 'hole');

  -- ========== HOLE 12: Par 3, Score 2 (BIRDIE!) ==========
  INSERT INTO golf_holes (round_id, hole_number, par, score, score_to_par, yardage, putts, fairway_hit, green_in_regulation)
  VALUES (v_round_id, 12, 3, 2, -1, 165, 1, null, true)
  RETURNING id INTO v_hole_id;

  INSERT INTO golf_shots (round_id, hole_id, hole_number, shot_number, club_type, shot_type, shot_distance, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, lie_before, result) VALUES
  (v_round_id, v_hole_id, 12, 1, '7 Iron', 'tee_shot', 162, 165, 5, 'yards', 'feet', 'tee', 'great'),
  (v_round_id, v_hole_id, 12, 2, 'Putter', 'putt', 5, 5, 0, 'feet', 'feet', 'green', 'hole');

  -- ========== HOLE 13: Par 4, Score 4 (PAR) ==========
  INSERT INTO golf_holes (round_id, hole_number, par, score, score_to_par, yardage, putts, fairway_hit, green_in_regulation)
  VALUES (v_round_id, 13, 4, 4, 0, 392, 2, false, true)
  RETURNING id INTO v_hole_id;

  INSERT INTO golf_shots (round_id, hole_id, hole_number, shot_number, club_type, shot_type, shot_distance, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, lie_before, result, miss_direction) VALUES
  (v_round_id, v_hole_id, 13, 1, 'Driver', 'tee_shot', 245, 392, 147, 'yards', 'yards', 'tee', 'poor', 'left'),
  (v_round_id, v_hole_id, 13, 2, '7 Iron', 'recovery', 142, 147, 16, 'yards', 'feet', 'rough', 'green'),
  (v_round_id, v_hole_id, 13, 3, 'Putter', 'putt', 16, 16, 3, 'feet', 'feet', 'green', 'good'),
  (v_round_id, v_hole_id, 13, 4, 'Putter', 'putt', 3, 3, 0, 'feet', 'inches', 'green', 'hole');

  -- ========== HOLE 14: Par 4, Score 5 (BOGEY) ==========
  INSERT INTO golf_holes (round_id, hole_number, par, score, score_to_par, yardage, putts, fairway_hit, green_in_regulation)
  VALUES (v_round_id, 14, 4, 5, 1, 405, 2, false, false)
  RETURNING id INTO v_hole_id;

  INSERT INTO golf_shots (round_id, hole_id, hole_number, shot_number, club_type, shot_type, shot_distance, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, lie_before, result, miss_direction) VALUES
  (v_round_id, v_hole_id, 14, 1, 'Driver', 'tee_shot', 235, 405, 170, 'yards', 'yards', 'tee', 'poor', 'right'),
  (v_round_id, v_hole_id, 14, 2, '6 Iron', 'recovery', 155, 170, 15, 'yards', 'yards', 'rough', 'fairway'),
  (v_round_id, v_hole_id, 14, 3, 'Lob Wedge', 'chip', 13, 15, 5, 'yards', 'feet', 'fringe', 'green'),
  (v_round_id, v_hole_id, 14, 4, 'Putter', 'putt', 5, 5, 1, 'feet', 'feet', 'green', 'good'),
  (v_round_id, v_hole_id, 14, 5, 'Putter', 'putt', 1, 1, 0, 'feet', 'inches', 'green', 'hole');

  -- ========== HOLE 15: Par 5, Score 6 (BOGEY + PENALTY) ==========
  INSERT INTO golf_holes (round_id, hole_number, par, score, score_to_par, yardage, putts, fairway_hit, green_in_regulation)
  VALUES (v_round_id, 15, 5, 6, 1, 515, 2, true, false)
  RETURNING id INTO v_hole_id;

  INSERT INTO golf_shots (round_id, hole_id, hole_number, shot_number, club_type, shot_type, shot_distance, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, lie_before, result, is_penalty, penalty_type, miss_direction) VALUES
  (v_round_id, v_hole_id, 15, 1, 'Driver', 'tee_shot', 180, 515, 335, 'yards', 'yards', 'tee', 'poor', true, 'water', 'right'),
  (v_round_id, v_hole_id, 15, 2, 'Driver', 'tee_shot', 265, 515, 250, 'yards', 'yards', 'tee', 'fairway', false, null, null), -- Re-tee after penalty
  (v_round_id, v_hole_id, 15, 3, '4 Iron', 'fairway', 185, 250, 65, 'yards', 'yards', 'fairway', 'fairway', false, null, null),
  (v_round_id, v_hole_id, 15, 4, 'Sand Wedge', 'approach', 60, 65, 25, 'yards', 'feet', 'fairway', 'green', false, null, null),
  (v_round_id, v_hole_id, 15, 5, 'Putter', 'putt', 25, 25, 2, 'feet', 'feet', 'green', 'good', false, null, null),
  (v_round_id, v_hole_id, 15, 6, 'Putter', 'putt', 2, 2, 0, 'feet', 'inches', 'green', 'hole', false, null, null);

  -- ========== HOLE 16: Par 3, Score 3 (PAR) ==========
  INSERT INTO golf_holes (round_id, hole_number, par, score, score_to_par, yardage, putts, fairway_hit, green_in_regulation)
  VALUES (v_round_id, 16, 3, 3, 0, 198, 2, null, true)
  RETURNING id INTO v_hole_id;

  INSERT INTO golf_shots (round_id, hole_id, hole_number, shot_number, club_type, shot_type, shot_distance, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, lie_before, result) VALUES
  (v_round_id, v_hole_id, 16, 1, '4 Iron', 'tee_shot', 195, 198, 28, 'yards', 'feet', 'tee', 'green'),
  (v_round_id, v_hole_id, 16, 2, 'Putter', 'putt', 28, 28, 3, 'feet', 'feet', 'green', 'good'),
  (v_round_id, v_hole_id, 16, 3, 'Putter', 'putt', 3, 3, 0, 'feet', 'inches', 'green', 'hole');

  -- ========== HOLE 17: Par 4, Score 4 (PAR) ==========
  INSERT INTO golf_holes (round_id, hole_number, par, score, score_to_par, yardage, putts, fairway_hit, green_in_regulation)
  VALUES (v_round_id, 17, 4, 4, 0, 372, 2, true, false)
  RETURNING id INTO v_hole_id;

  INSERT INTO golf_shots (round_id, hole_id, hole_number, shot_number, club_type, shot_type, shot_distance, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, lie_before, result) VALUES
  (v_round_id, v_hole_id, 17, 1, 'Driver', 'tee_shot', 258, 372, 114, 'yards', 'yards', 'tee', 'fairway'),
  (v_round_id, v_hole_id, 17, 2, 'Pitching Wedge', 'approach', 110, 114, 10, 'yards', 'feet', 'fairway', 'good', 'short'),
  (v_round_id, v_hole_id, 17, 3, 'Putter', 'chip', 10, 10, 2, 'feet', 'feet', 'fringe', 'great'),
  (v_round_id, v_hole_id, 17, 4, 'Putter', 'putt', 2, 2, 0, 'feet', 'inches', 'green', 'hole');

  -- ========== HOLE 18: Par 4, Score 5 (BOGEY) ==========
  INSERT INTO golf_holes (round_id, hole_number, par, score, score_to_par, yardage, putts, fairway_hit, green_in_regulation)
  VALUES (v_round_id, 18, 4, 5, 1, 420, 3, true, false)
  RETURNING id INTO v_hole_id;

  INSERT INTO golf_shots (round_id, hole_id, hole_number, shot_number, club_type, shot_type, shot_distance, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, lie_before, result, putt_break, putt_slope) VALUES
  (v_round_id, v_hole_id, 18, 1, 'Driver', 'tee_shot', 272, 420, 148, 'yards', 'yards', 'tee', 'fairway', null, null),
  (v_round_id, v_hole_id, 18, 2, '7 Iron', 'approach', 143, 148, 22, 'yards', 'feet', 'fairway', 'green', null, null),
  (v_round_id, v_hole_id, 18, 3, 'Putter', 'putt', 22, 22, 6, 'feet', 'feet', 'green', 'poor', 'left_to_right', 'downhill'),
  (v_round_id, v_hole_id, 18, 4, 'Putter', 'putt', 6, 6, 1, 'feet', 'feet', 'green', 'good', 'right_to_left', 'uphill'),
  (v_round_id, v_hole_id, 18, 5, 'Putter', 'putt', 1, 1, 0, 'feet', 'inches', 'green', 'hole', null, null);

  RAISE NOTICE '✅ Successfully created comprehensive round with 18 holes and % shots',
    (SELECT COUNT(*) FROM golf_shots WHERE round_id = v_round_id);

END $$;

-- ========== VERIFICATION QUERY ==========
SELECT
  r.id as round_id,
  r.course_name,
  r.round_date,
  r.total_score,
  r.total_to_par,
  r.fairways_hit || '/' || r.fairways_total as fairways,
  r.greens_in_regulation || '/' || r.greens_total as gir,
  r.total_putts,
  COUNT(DISTINCT h.id) as holes_count,
  COUNT(s.id) as total_shots
FROM golf_rounds r
LEFT JOIN golf_holes h ON h.round_id = r.id
LEFT JOIN golf_shots s ON s.round_id = r.id
WHERE r.player_id = '5bab961e-4ea4-4c88-812f-68a9469f8156'
GROUP BY r.id, r.course_name, r.round_date, r.total_score, r.total_to_par, r.fairways_hit, r.fairways_total, r.greens_in_regulation, r.greens_total, r.total_putts
ORDER BY r.round_date DESC
LIMIT 1;

-- View sample shots from the round
SELECT
  h.hole_number,
  h.par,
  h.score,
  s.shot_number,
  s.club_type,
  s.shot_type,
  s.shot_distance,
  s.distance_to_hole_before || ' ' || s.distance_unit_before as before_shot,
  s.distance_to_hole_after || ' ' || s.distance_unit_after as after_shot,
  s.lie_before,
  s.result,
  CASE WHEN s.is_penalty THEN '⚠️ ' || s.penalty_type ELSE '' END as penalty
FROM golf_holes h
JOIN golf_shots s ON s.hole_id = h.id
WHERE h.round_id = (
  SELECT id FROM golf_rounds
  WHERE player_id = '5bab961e-4ea4-4c88-812f-68a9469f8156'
  ORDER BY created_at DESC
  LIMIT 1
)
ORDER BY h.hole_number, s.shot_number;
