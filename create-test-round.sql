-- ============================================================================
-- CREATE TEST GOLF ROUND for rinin376@gmail.com
-- ============================================================================

-- Insert a golf round
INSERT INTO golf_rounds (
  player_id,
  course_name,
  date_played,
  total_score,
  course_rating,
  slope_rating,
  tee_color,
  weather_conditions,
  notes
) VALUES (
  '5bab961e-4ea4-4c88-812f-68a9469f8156',  -- Nick Rini's player ID
  'Pebble Beach Golf Links',
  '2026-01-02',
  78,
  72.0,
  145,
  'Blue',
  'Sunny, 15mph wind',
  'Great round! Really happy with my putting today.'
)
RETURNING id;

-- You'll need to copy the returned ID and use it below
-- For now, let's assume the round ID - you'll need to replace this with actual ID

-- Create a variable for the round_id (PostgreSQL)
DO $$
DECLARE
  round_id uuid;
BEGIN
  -- Get the most recently created round for this player
  SELECT id INTO round_id
  FROM golf_rounds
  WHERE player_id = '5bab961e-4ea4-4c88-812f-68a9469f8156'
  ORDER BY created_at DESC
  LIMIT 1;

  -- Insert 18 holes with realistic scores
  INSERT INTO golf_round_holes (round_id, hole_number, par, score, putts, fairway_hit, gir, penalty_strokes, notes) VALUES
    (round_id, 1, 4, 4, 2, true, true, 0, 'Nice par save'),
    (round_id, 2, 5, 5, 2, true, false, 0, 'Two-putt par'),
    (round_id, 3, 3, 3, 2, NULL, true, 0, 'Great tee shot'),
    (round_id, 4, 4, 5, 3, false, false, 0, 'Missed fairway left'),
    (round_id, 5, 4, 4, 2, true, true, 0, 'Solid birdie putt missed'),
    (round_id, 6, 5, 4, 1, true, true, 0, 'BIRDIE! Great approach'),
    (round_id, 7, 3, 4, 2, NULL, false, 0, 'Bogey, tough pin'),
    (round_id, 8, 4, 4, 2, true, false, 0, 'Good up and down'),
    (round_id, 9, 4, 5, 3, true, false, 0, 'Three-putt bogey'),
    (round_id, 10, 4, 4, 2, true, true, 0, 'Par'),
    (round_id, 11, 5, 5, 2, true, true, 0, 'Easy two-putt'),
    (round_id, 12, 3, 2, 1, NULL, true, 0, 'BIRDIE! One-putt!'),
    (round_id, 13, 4, 4, 2, false, true, 0, 'Scramble par'),
    (round_id, 14, 4, 5, 2, false, false, 0, 'Bogey'),
    (round_id, 15, 5, 6, 3, true, false, 1, 'Lost ball, penalty'),
    (round_id, 16, 3, 3, 2, NULL, true, 0, 'Par'),
    (round_id, 17, 4, 4, 2, true, false, 0, 'Good chip'),
    (round_id, 18, 4, 5, 3, true, false, 0, 'Tough finish');
END $$;

-- Verify the round was created
SELECT
  r.id,
  r.course_name,
  r.date_played,
  r.total_score,
  COUNT(h.id) as holes_recorded
FROM golf_rounds r
LEFT JOIN golf_round_holes h ON h.round_id = r.id
WHERE r.player_id = '5bab961e-4ea4-4c88-812f-68a9469f8156'
GROUP BY r.id, r.course_name, r.date_played, r.total_score
ORDER BY r.date_played DESC
LIMIT 1;
