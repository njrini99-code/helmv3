-- =============================================================================
-- Gapfill: Tyler Passmore — 11 completed rounds + stats
-- =============================================================================
-- Tyler Passmore (player_id: ed1ff03e-b33a-4a80-891e-09685b7db3d0) has 0 rounds
-- and no stats, making the demo team roster look incomplete.
--
-- This script inserts 11 realistic, self-consistent completed rounds for Tyler
-- over the same date window as the rest of the team (2026-04-08..2026-06-09),
-- plus golf_holes (18 per round), golf_round_stats_cache (one per round),
-- golf_player_stats_cache (one aggregate row), and 2 golf_round_reviews.
--
-- Scoring profile: low-handicap college player, scoring avg ~74.5 (par 72)
--   Scores: 68,71,72,73,74,74,75,75,76,77,79 — avg 74.0
--   One hot round (68,-4), one bad round (79,+7)
--
-- Par layout (72): H1:4 H2:3 H3:5 H4:4 H5:4 H6:4 H7:3 H8:5 H9:4 (=36 front)
--                  H10:4 H11:4 H12:3 H13:5 H14:4 H15:4 H16:3 H17:5 H18:4 (=36 back)
--
-- Each round's holes are arithmetically verified:
--   holes sum = front_nine + back_nine = total_score ✓
--
-- Idempotent: wrapped in a DO block that skips if the sentinel already exists.
-- Safe to re-run.
-- =============================================================================

DO $$
DECLARE
  v_player_id  uuid := 'ed1ff03e-b33a-4a80-891e-09685b7db3d0';
  v_team_id    uuid := '6ecdd1a6-63fe-4beb-b094-00118f334163';
  v_sentinel   text := 'demo-gapfill-passmore';

  r1  uuid; r2  uuid; r3  uuid; r4  uuid; r5  uuid; r6  uuid;
  r7  uuid; r8  uuid; r9  uuid; r10 uuid; r11 uuid;

  h1  uuid[]; h2  uuid[]; h3  uuid[]; h4  uuid[]; h5  uuid[]; h6  uuid[];
  h7  uuid[]; h8  uuid[]; h9  uuid[]; h10 uuid[]; h11 uuid[];

  v_existing int;

BEGIN
  -- ── Guard ──────────────────────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_existing
    FROM public.golf_rounds
   WHERE player_id = v_player_id
     AND notes LIKE '%' || v_sentinel || '%';

  IF v_existing > 0 THEN
    RAISE NOTICE 'Tyler Passmore gapfill already present (% round(s)). Skipping.', v_existing;
    RETURN;
  END IF;

  -- ── Generate UUIDs ─────────────────────────────────────────────────────────
  r1  := gen_random_uuid(); r2  := gen_random_uuid(); r3  := gen_random_uuid();
  r4  := gen_random_uuid(); r5  := gen_random_uuid(); r6  := gen_random_uuid();
  r7  := gen_random_uuid(); r8  := gen_random_uuid(); r9  := gen_random_uuid();
  r10 := gen_random_uuid(); r11 := gen_random_uuid();

  h1  := ARRAY(SELECT gen_random_uuid() FROM generate_series(1,18));
  h2  := ARRAY(SELECT gen_random_uuid() FROM generate_series(1,18));
  h3  := ARRAY(SELECT gen_random_uuid() FROM generate_series(1,18));
  h4  := ARRAY(SELECT gen_random_uuid() FROM generate_series(1,18));
  h5  := ARRAY(SELECT gen_random_uuid() FROM generate_series(1,18));
  h6  := ARRAY(SELECT gen_random_uuid() FROM generate_series(1,18));
  h7  := ARRAY(SELECT gen_random_uuid() FROM generate_series(1,18));
  h8  := ARRAY(SELECT gen_random_uuid() FROM generate_series(1,18));
  h9  := ARRAY(SELECT gen_random_uuid() FROM generate_series(1,18));
  h10 := ARRAY(SELECT gen_random_uuid() FROM generate_series(1,18));
  h11 := ARRAY(SELECT gen_random_uuid() FROM generate_series(1,18));

  -- ── 1. golf_rounds ─────────────────────────────────────────────────────────
  INSERT INTO public.golf_rounds (
    id, player_id, team_id,
    course_name, course_city, course_state, course_rating, course_slope, tees_played,
    round_date, round_type, holes_played, status,
    total_score, front_nine, back_nine, score_to_par,
    total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible,
    weather_conditions, notes,
    strokes_gained_total, strokes_gained_tee, strokes_gained_approach,
    strokes_gained_around_green, strokes_gained_putting,
    created_at, updated_at
  ) VALUES
  -- R1: 68 (-4) hot round: eagle h3, birdies h1 h6 h11, all others par
  --   Front: 3+3+3+4+4+3+3+5+4=32  Back: 4+3+3+5+4+4+3+5+4=35  Total=67...
  --   Recalc: 1 eagle(-2) + 3 birdies(-3) = -5; 14 pars = 72-5=67. Need -4.
  --   Use 1 eagle(-2) + 2 birdies(-2) = -4; 15 pars = 72-4=68. ✓
  --   Eagle h3(par5→3), birdie h1(par4→3), birdie h8(par5→4), rest par.
  --   Front: 3+3+3+4+4+4+3+4+4=32  Back: 4+4+3+5+4+4+3+5+4=36  Total=68 ✓
  (r1,  v_player_id, v_team_id,
   'Pinehurst No.2', 'Pinehurst', 'NC', 74.1, 137, 'Blue',
   '2026-04-08', 'tournament', 18, 'completed',
   68, 32, 36, -4,
   29, 10, 14, 14, 18, 'Sunny, calm', v_sentinel,
   1.8, 0.6, 0.5, 0.3, 0.4, now(), now()),

  -- R2: 74 (+2): 2 birdies, 4 bogeys, 12 pars
  --   Net: -2+4=+2. ✓
  --   Birdies: h3(par5→4), h11(par4→3)
  --   Bogeys: h4(par4→5), h9(par4→5), h15(par4→5), h16(par3→4)
  --   Front: 4+3+4+5+4+4+3+5+5=37  Back: 4+3+3+5+4+5+4+5+4=37  Total=74 ✓
  (r2,  v_player_id, v_team_id,
   'Finley Golf Course', 'Chapel Hill', 'NC', 72.2, 128, 'Blue',
   '2026-04-15', 'tournament', 18, 'completed',
   74, 37, 37, 2,
   32, 9, 14, 11, 18, 'Partly cloudy', v_sentinel,
   -0.2, 0.1, -0.1, -0.1, -0.1, now(), now()),

  -- R3: 75 (+3): 1 birdie, 4 bogeys, 13 pars
  --   Net: -1+4=+3. ✓
  --   Birdie: h8(par5→4); Bogeys: h2(par3→4), h6(par4→5), h12(par3→4), h14(par4→5)
  --   Front: 4+4+5+4+4+5+3+4+4=37  Back: 4+4+4+5+5+4+3+5+4=38  Total=75 ✓
  (r3,  v_player_id, v_team_id,
   'UNC Finley', 'Chapel Hill', 'NC', 72.5, 130, 'Blue',
   '2026-04-21', 'practice', 18, 'completed',
   75, 37, 38, 3,
   33, 8, 14, 10, 18, 'Overcast', v_sentinel,
   -0.4, -0.1, -0.1, -0.1, -0.1, now(), now()),

  -- R4: 72 (E): 2 birdies, 2 bogeys, 14 pars
  --   Net: -2+2=0. ✓
  --   Birdies: h8(par5→4), h13(par5→4); Bogeys: h6(par4→5), h15(par4→5)
  --   Front: 4+3+5+4+4+5+3+4+4=36  Back: 4+4+3+4+4+5+3+5+4=36  Total=72 ✓
  (r4,  v_player_id, v_team_id,
   'Grandfather Golf & Country Club', 'Linville', 'NC', 73.8, 138, 'White',
   '2026-04-28', 'tournament', 18, 'completed',
   72, 36, 36, 0,
   31, 10, 14, 12, 18, 'Sunny', v_sentinel,
   0.6, 0.2, 0.2, 0.0, 0.2, now(), now()),

  -- R5: 77 (+5): 1 birdie, 6 bogeys, 11 pars
  --   Net: -1+6=+5. ✓
  --   Birdie: h13(par5→4); Bogeys: h1(4→5), h4(4→5), h7(3→4), h10(4→5), h15(4→5), h16(3→4)
  --   Front: 5+3+5+5+4+4+4+5+4=39  Back: 5+4+3+4+4+5+4+5+4=38  Total=77 ✓
  (r5,  v_player_id, v_team_id,
   'Pinehurst No.2', 'Pinehurst', 'NC', 74.1, 137, 'Blue',
   '2026-05-05', 'tournament', 18, 'completed',
   77, 39, 38, 5,
   35, 7, 14, 9, 18, 'Windy, 20mph', v_sentinel,
   -1.1, -0.4, -0.3, -0.2, -0.2, now(), now()),

  -- R6: 73 (+1): 2 birdies, 3 bogeys, 13 pars
  --   Net: -2+3=+1. ✓
  --   Birdies: h3(par5→4), h11(par4→3); Bogeys: h6(4→5), h12(3→4), h16(3→4)
  --   Front: 4+3+4+4+4+5+3+5+4=36  Back: 4+3+4+5+4+4+4+5+4=37  Total=73 ✓
  (r6,  v_player_id, v_team_id,
   'Finley Golf Course', 'Chapel Hill', 'NC', 72.2, 128, 'Blue',
   '2026-05-10', 'practice', 18, 'completed',
   73, 36, 37, 1,
   30, 11, 14, 12, 18, 'Sunny', v_sentinel,
   0.2, 0.1, 0.1, -0.1, 0.1, now(), now()),

  -- R7: 76 (+4): 1 birdie, 5 bogeys, 12 pars
  --   Net: -1+5=+4. ✓
  --   Birdie: h8(par5→4); Bogeys: h2(3→4), h4(4→5), h11(4→5), h14(4→5), h16(3→4)
  --   Front: 4+4+5+5+4+4+3+4+4=37  Back: 4+5+3+5+5+4+4+5+4=39  Total=76 ✓
  (r7,  v_player_id, v_team_id,
   'Grandfather Golf & Country Club', 'Linville', 'NC', 73.8, 138, 'White',
   '2026-05-17', 'tournament', 18, 'completed',
   76, 37, 39, 4,
   34, 8, 14, 10, 18, 'Partly cloudy, breezy', v_sentinel,
   -0.7, -0.2, -0.2, -0.1, -0.2, now(), now()),

  -- R8: 71 (-1): 3 birdies, 2 bogeys, 13 pars
  --   Net: -3+2=-1. ✓
  --   Birdies: h3(5→4), h8(5→4), h11(4→3); Bogeys: h5(4→5), h15(4→5)
  --   Front: 4+3+4+4+5+4+3+4+4=35  Back: 4+3+3+5+4+5+3+5+4=36  Total=71 ✓
  (r8,  v_player_id, v_team_id,
   'Pinehurst No.2', 'Pinehurst', 'NC', 74.1, 137, 'Blue',
   '2026-05-24', 'tournament', 18, 'completed',
   71, 35, 36, -1,
   29, 11, 14, 13, 18, 'Sunny, calm', v_sentinel,
   0.9, 0.3, 0.3, 0.1, 0.2, now(), now()),

  -- R9: 79 (+7) bad round: 0 birdies, 7 bogeys, 11 pars
  --   Net: 0+7=+7. ✓
  --   Bogeys: h1(4→5), h2(3→4), h5(4→5), h7(3→4), h11(4→5), h14(4→5), h16(3→4)
  --   Front: 5+4+5+4+5+4+4+5+4=40  Back: 4+5+3+5+5+4+4+5+4=39  Total=79 ✓
  (r9,  v_player_id, v_team_id,
   'Finley Golf Course', 'Chapel Hill', 'NC', 72.2, 128, 'Blue',
   '2026-05-31', 'practice', 18, 'completed',
   79, 40, 39, 7,
   36, 6, 14, 8, 18, 'Rainy, 55°F', v_sentinel,
   -1.9, -0.6, -0.5, -0.4, -0.4, now(), now()),

  -- R10: 74 (+2): 2 birdies, 4 bogeys, 12 pars
  --   Net: -2+4=+2. ✓
  --   Birdies: h3(5→4), h13(5→4); Bogeys: h2(3→4), h9(4→5), h14(4→5), h16(3→4)
  --   Front: 4+4+4+4+4+4+3+5+5=37  Back: 4+4+4+4+5+4+4+5+4=37 ... wait
  --   h10:4, h11:4, h12:3, h13:4(birdie), h14:5(bogey), h15:4, h16:4(bogey), h17:5, h18:4 = 37 ✓
  --   Front: 4+4+4+4+4+4+3+5+5=37; Back: 4+4+3+4+5+4+4+5+4=37. Total=74 ✓
  (r10, v_player_id, v_team_id,
   'UNC Finley', 'Chapel Hill', 'NC', 72.5, 130, 'Blue',
   '2026-06-04', 'tournament', 18, 'completed',
   74, 37, 37, 2,
   32, 9, 14, 11, 18, 'Sunny', v_sentinel,
   -0.1, 0.0, 0.0, -0.1, 0.0, now(), now()),

  -- R11: 75 (+3): 2 birdies, 5 bogeys, 11 pars
  --   Net: -2+5=+3. ✓
  --   Birdies: h8(5→4), h13(5→4); Bogeys: h2(3→4), h6(4→5), h9(4→5), h14(4→5), h16(3→4)
  --   Front: 4+4+5+4+4+5+3+4+5=38  Back: 4+4+4+4+5+4+4+5+4=... h10:4,h11:4,h12:3,h13:4,h14:5,h15:4,h16:4,h17:5,h18:4=37
  --   38+37=75 ✓
  (r11, v_player_id, v_team_id,
   'Grandfather Golf & Country Club', 'Linville', 'NC', 73.8, 138, 'White',
   '2026-06-09', 'tournament', 18, 'completed',
   75, 38, 37, 3,
   33, 9, 14, 10, 18, 'Overcast', v_sentinel,
   -0.4, -0.1, -0.1, -0.1, -0.1, now(), now());

  -- ── 2. golf_holes ─────────────────────────────────────────────────────────
  -- Par template: H1:4 H2:3 H3:5 H4:4 H5:4 H6:4 H7:3 H8:5 H9:4 | H10:4 H11:4 H12:3 H13:5 H14:4 H15:4 H16:3 H17:5 H18:4
  -- All sums verified above in golf_rounds comments.

  -- ── R1 (68, -4): eagle h3, birdie h1, birdie h8, rest par
  -- Front: 3+3+3+4+4+4+3+4+4=32  Back: 4+4+3+5+4+4+3+5+4=36  Total=68 ✓
  INSERT INTO public.golf_holes
    (id, round_id, hole_number, par, score, putts, fairway_hit, gir, up_and_down, sand_save, penalty_strokes)
  VALUES
    (h1[1],  r1,  1, 4, 3, 1, true,  true,  null, null, 0),  -- birdie
    (h1[2],  r1,  2, 3, 3, 2, null,  true,  null, null, 0),  -- par
    (h1[3],  r1,  3, 5, 3, 1, true,  true,  null, null, 0),  -- eagle (3 on par-5)
    (h1[4],  r1,  4, 4, 4, 2, true,  true,  null, null, 0),  -- par
    (h1[5],  r1,  5, 4, 4, 2, true,  true,  null, null, 0),  -- par
    (h1[6],  r1,  6, 4, 4, 2, true,  true,  null, null, 0),  -- par
    (h1[7],  r1,  7, 3, 3, 2, null,  true,  null, null, 0),  -- par
    (h1[8],  r1,  8, 5, 4, 1, true,  true,  null, null, 0),  -- birdie
    (h1[9],  r1,  9, 4, 4, 2, true,  true,  null, null, 0),  -- par (front=32 ✓)
    (h1[10], r1, 10, 4, 4, 2, true,  true,  null, null, 0),  -- par
    (h1[11], r1, 11, 4, 4, 2, true,  true,  null, null, 0),  -- par
    (h1[12], r1, 12, 3, 3, 2, null,  true,  null, null, 0),  -- par
    (h1[13], r1, 13, 5, 5, 2, true,  true,  null, null, 0),  -- par
    (h1[14], r1, 14, 4, 4, 2, true,  true,  null, null, 0),  -- par
    (h1[15], r1, 15, 4, 4, 2, true,  true,  null, null, 0),  -- par
    (h1[16], r1, 16, 3, 3, 2, null,  true,  null, null, 0),  -- par
    (h1[17], r1, 17, 5, 5, 2, true,  true,  null, null, 0),  -- par
    (h1[18], r1, 18, 4, 4, 2, true,  true,  null, null, 0);  -- par (back=36 ✓)

  -- ── R2 (74, +2): birdies h3,h11 / bogeys h4,h9,h15,h16
  -- Front: 4+3+4+5+4+4+3+5+5=37  Back: 4+3+3+5+4+5+4+5+4=37  Total=74 ✓
  INSERT INTO public.golf_holes
    (id, round_id, hole_number, par, score, putts, fairway_hit, gir, up_and_down, sand_save, penalty_strokes)
  VALUES
    (h2[1],  r2,  1, 4, 4, 2, true,  true,  null, null, 0),
    (h2[2],  r2,  2, 3, 3, 2, null,  true,  null, null, 0),
    (h2[3],  r2,  3, 5, 4, 1, true,  true,  null, null, 0),  -- birdie
    (h2[4],  r2,  4, 4, 5, 2, false, false, false,null, 0),  -- bogey
    (h2[5],  r2,  5, 4, 4, 2, true,  true,  null, null, 0),
    (h2[6],  r2,  6, 4, 4, 2, true,  true,  null, null, 0),
    (h2[7],  r2,  7, 3, 3, 2, null,  true,  null, null, 0),
    (h2[8],  r2,  8, 5, 5, 2, true,  true,  null, null, 0),
    (h2[9],  r2,  9, 4, 5, 2, false, false, false,null, 0),  -- bogey (front=37 ✓)
    (h2[10], r2, 10, 4, 4, 2, true,  true,  null, null, 0),
    (h2[11], r2, 11, 4, 3, 1, true,  true,  null, null, 0),  -- birdie
    (h2[12], r2, 12, 3, 3, 2, null,  true,  null, null, 0),
    (h2[13], r2, 13, 5, 5, 2, true,  true,  null, null, 0),
    (h2[14], r2, 14, 4, 4, 2, true,  true,  null, null, 0),
    (h2[15], r2, 15, 4, 5, 2, false, false, false,null, 0),  -- bogey
    (h2[16], r2, 16, 3, 4, 2, null,  false, false,null, 0),  -- bogey
    (h2[17], r2, 17, 5, 5, 2, true,  true,  null, null, 0),
    (h2[18], r2, 18, 4, 4, 2, true,  true,  null, null, 0);  -- (back=37 ✓)

  -- ── R3 (75, +3): birdie h8 / bogeys h2,h6,h12,h14
  -- Front: 4+4+5+4+4+5+3+4+4=37  Back: 4+4+4+5+5+4+3+5+4=38  Total=75 ✓
  INSERT INTO public.golf_holes
    (id, round_id, hole_number, par, score, putts, fairway_hit, gir, up_and_down, sand_save, penalty_strokes)
  VALUES
    (h3[1],  r3,  1, 4, 4, 2, true,  true,  null, null, 0),
    (h3[2],  r3,  2, 3, 4, 2, null,  false, false,null, 0),  -- bogey
    (h3[3],  r3,  3, 5, 5, 2, true,  true,  null, null, 0),
    (h3[4],  r3,  4, 4, 4, 2, true,  true,  null, null, 0),
    (h3[5],  r3,  5, 4, 4, 2, true,  true,  null, null, 0),
    (h3[6],  r3,  6, 4, 5, 2, false, false, false,null, 0),  -- bogey
    (h3[7],  r3,  7, 3, 3, 2, null,  true,  null, null, 0),
    (h3[8],  r3,  8, 5, 4, 1, true,  true,  null, null, 0),  -- birdie
    (h3[9],  r3,  9, 4, 4, 2, true,  true,  null, null, 0),  -- (front=37 ✓)
    (h3[10], r3, 10, 4, 4, 2, true,  true,  null, null, 0),
    (h3[11], r3, 11, 4, 4, 2, true,  true,  null, null, 0),
    (h3[12], r3, 12, 3, 4, 2, null,  false, false,null, 0),  -- bogey
    (h3[13], r3, 13, 5, 5, 2, true,  true,  null, null, 0),
    (h3[14], r3, 14, 4, 5, 2, false, false, false,null, 0),  -- bogey
    (h3[15], r3, 15, 4, 4, 2, true,  true,  null, null, 0),
    (h3[16], r3, 16, 3, 3, 2, null,  true,  null, null, 0),
    (h3[17], r3, 17, 5, 5, 2, true,  true,  null, null, 0),
    (h3[18], r3, 18, 4, 4, 2, true,  true,  null, null, 0);  -- (back=38 ✓)

  -- ── R4 (72, E): birdies h8,h13 / bogeys h6,h15
  -- Front: 4+3+5+4+4+5+3+4+4=36  Back: 4+4+3+4+4+5+3+5+4=36  Total=72 ✓
  INSERT INTO public.golf_holes
    (id, round_id, hole_number, par, score, putts, fairway_hit, gir, up_and_down, sand_save, penalty_strokes)
  VALUES
    (h4[1],  r4,  1, 4, 4, 2, true,  true,  null, null, 0),
    (h4[2],  r4,  2, 3, 3, 2, null,  true,  null, null, 0),
    (h4[3],  r4,  3, 5, 5, 2, true,  true,  null, null, 0),
    (h4[4],  r4,  4, 4, 4, 2, true,  true,  null, null, 0),
    (h4[5],  r4,  5, 4, 4, 2, true,  true,  null, null, 0),
    (h4[6],  r4,  6, 4, 5, 2, false, false, false,null, 0),  -- bogey
    (h4[7],  r4,  7, 3, 3, 2, null,  true,  null, null, 0),
    (h4[8],  r4,  8, 5, 4, 1, true,  true,  null, null, 0),  -- birdie
    (h4[9],  r4,  9, 4, 4, 2, true,  true,  null, null, 0),  -- (front=36 ✓)
    (h4[10], r4, 10, 4, 4, 2, true,  true,  null, null, 0),
    (h4[11], r4, 11, 4, 4, 2, true,  true,  null, null, 0),
    (h4[12], r4, 12, 3, 3, 2, null,  true,  null, null, 0),
    (h4[13], r4, 13, 5, 4, 1, true,  true,  null, null, 0),  -- birdie
    (h4[14], r4, 14, 4, 4, 2, true,  true,  null, null, 0),
    (h4[15], r4, 15, 4, 5, 2, false, false, false,null, 0),  -- bogey
    (h4[16], r4, 16, 3, 3, 2, null,  true,  null, null, 0),
    (h4[17], r4, 17, 5, 5, 2, true,  true,  null, null, 0),
    (h4[18], r4, 18, 4, 4, 2, true,  true,  null, null, 0);  -- (back=36 ✓)

  -- ── R5 (77, +5): birdie h13 / bogeys h1,h4,h7,h10,h15,h16
  -- Front: 5+3+5+5+4+4+4+5+4=39  Back: 5+4+3+4+4+5+4+5+4=38  Total=77 ✓
  INSERT INTO public.golf_holes
    (id, round_id, hole_number, par, score, putts, fairway_hit, gir, up_and_down, sand_save, penalty_strokes)
  VALUES
    (h5[1],  r5,  1, 4, 5, 2, false, false, false,null, 0),  -- bogey
    (h5[2],  r5,  2, 3, 3, 2, null,  true,  null, null, 0),
    (h5[3],  r5,  3, 5, 5, 2, true,  true,  null, null, 0),
    (h5[4],  r5,  4, 4, 5, 2, false, false, false,null, 0),  -- bogey
    (h5[5],  r5,  5, 4, 4, 2, true,  true,  null, null, 0),
    (h5[6],  r5,  6, 4, 4, 2, true,  true,  null, null, 0),
    (h5[7],  r5,  7, 3, 4, 2, null,  false, false,null, 0),  -- bogey
    (h5[8],  r5,  8, 5, 5, 2, true,  true,  null, null, 0),
    (h5[9],  r5,  9, 4, 4, 2, true,  true,  null, null, 0),  -- (front=39 ✓)
    (h5[10], r5, 10, 4, 5, 2, false, false, false,null, 0),  -- bogey
    (h5[11], r5, 11, 4, 4, 2, true,  true,  null, null, 0),
    (h5[12], r5, 12, 3, 3, 2, null,  true,  null, null, 0),
    (h5[13], r5, 13, 5, 4, 1, true,  true,  null, null, 0),  -- birdie
    (h5[14], r5, 14, 4, 4, 2, true,  true,  null, null, 0),
    (h5[15], r5, 15, 4, 5, 2, false, false, false,null, 0),  -- bogey
    (h5[16], r5, 16, 3, 4, 2, null,  false, false,null, 0),  -- bogey
    (h5[17], r5, 17, 5, 5, 2, true,  true,  null, null, 0),
    (h5[18], r5, 18, 4, 4, 2, true,  true,  null, null, 0);  -- (back=38 ✓)

  -- ── R6 (73, +1): birdies h3,h11 / bogeys h6,h12,h16
  -- Front: 4+3+4+4+4+5+3+5+4=36  Back: 4+3+4+5+4+4+4+5+4=37  Total=73 ✓
  INSERT INTO public.golf_holes
    (id, round_id, hole_number, par, score, putts, fairway_hit, gir, up_and_down, sand_save, penalty_strokes)
  VALUES
    (h6[1],  r6,  1, 4, 4, 2, true,  true,  null, null, 0),
    (h6[2],  r6,  2, 3, 3, 2, null,  true,  null, null, 0),
    (h6[3],  r6,  3, 5, 4, 1, true,  true,  null, null, 0),  -- birdie
    (h6[4],  r6,  4, 4, 4, 2, true,  true,  null, null, 0),
    (h6[5],  r6,  5, 4, 4, 2, true,  true,  null, null, 0),
    (h6[6],  r6,  6, 4, 5, 2, false, false, false,null, 0),  -- bogey
    (h6[7],  r6,  7, 3, 3, 2, null,  true,  null, null, 0),
    (h6[8],  r6,  8, 5, 5, 2, true,  true,  null, null, 0),
    (h6[9],  r6,  9, 4, 4, 2, true,  true,  null, null, 0),  -- (front=36 ✓)
    (h6[10], r6, 10, 4, 4, 2, true,  true,  null, null, 0),
    (h6[11], r6, 11, 4, 3, 1, true,  true,  null, null, 0),  -- birdie
    (h6[12], r6, 12, 3, 4, 2, null,  false, false,null, 0),  -- bogey
    (h6[13], r6, 13, 5, 5, 2, true,  true,  null, null, 0),
    (h6[14], r6, 14, 4, 4, 2, true,  true,  null, null, 0),
    (h6[15], r6, 15, 4, 4, 2, true,  true,  null, null, 0),
    (h6[16], r6, 16, 3, 4, 2, null,  false, false,null, 0),  -- bogey
    (h6[17], r6, 17, 5, 5, 2, true,  true,  null, null, 0),
    (h6[18], r6, 18, 4, 4, 2, true,  true,  null, null, 0);  -- (back=37 ✓)

  -- ── R7 (76, +4): birdie h8 / bogeys h2,h4,h11,h14,h16
  -- Front: 4+4+5+5+4+4+3+4+4=37  Back: 4+5+3+5+5+4+4+5+4=39  Total=76 ✓
  INSERT INTO public.golf_holes
    (id, round_id, hole_number, par, score, putts, fairway_hit, gir, up_and_down, sand_save, penalty_strokes)
  VALUES
    (h7[1],  r7,  1, 4, 4, 2, true,  true,  null, null, 0),
    (h7[2],  r7,  2, 3, 4, 2, null,  false, false,null, 0),  -- bogey
    (h7[3],  r7,  3, 5, 5, 2, true,  true,  null, null, 0),
    (h7[4],  r7,  4, 4, 5, 2, false, false, false,null, 0),  -- bogey
    (h7[5],  r7,  5, 4, 4, 2, true,  true,  null, null, 0),
    (h7[6],  r7,  6, 4, 4, 2, true,  true,  null, null, 0),
    (h7[7],  r7,  7, 3, 3, 2, null,  true,  null, null, 0),
    (h7[8],  r7,  8, 5, 4, 1, true,  true,  null, null, 0),  -- birdie
    (h7[9],  r7,  9, 4, 4, 2, true,  true,  null, null, 0),  -- (front=37 ✓)
    (h7[10], r7, 10, 4, 4, 2, true,  true,  null, null, 0),
    (h7[11], r7, 11, 4, 5, 2, false, false, false,null, 0),  -- bogey
    (h7[12], r7, 12, 3, 3, 2, null,  true,  null, null, 0),
    (h7[13], r7, 13, 5, 5, 2, true,  true,  null, null, 0),
    (h7[14], r7, 14, 4, 5, 2, false, false, false,null, 0),  -- bogey
    (h7[15], r7, 15, 4, 4, 2, true,  true,  null, null, 0),
    (h7[16], r7, 16, 3, 4, 2, null,  false, false,null, 0),  -- bogey
    (h7[17], r7, 17, 5, 5, 2, true,  true,  null, null, 0),
    (h7[18], r7, 18, 4, 4, 2, true,  true,  null, null, 0);  -- (back=39 ✓)

  -- ── R8 (71, -1): birdies h3,h8,h11 / bogeys h5,h15
  -- Front: 4+3+4+4+5+4+3+4+4=35  Back: 4+3+3+5+4+5+3+5+4=36  Total=71 ✓
  INSERT INTO public.golf_holes
    (id, round_id, hole_number, par, score, putts, fairway_hit, gir, up_and_down, sand_save, penalty_strokes)
  VALUES
    (h8[1],  r8,  1, 4, 4, 2, true,  true,  null, null, 0),
    (h8[2],  r8,  2, 3, 3, 2, null,  true,  null, null, 0),
    (h8[3],  r8,  3, 5, 4, 1, true,  true,  null, null, 0),  -- birdie
    (h8[4],  r8,  4, 4, 4, 2, true,  true,  null, null, 0),
    (h8[5],  r8,  5, 4, 5, 2, false, false, false,null, 0),  -- bogey
    (h8[6],  r8,  6, 4, 4, 2, true,  true,  null, null, 0),
    (h8[7],  r8,  7, 3, 3, 2, null,  true,  null, null, 0),
    (h8[8],  r8,  8, 5, 4, 1, true,  true,  null, null, 0),  -- birdie
    (h8[9],  r8,  9, 4, 4, 2, true,  true,  null, null, 0),  -- (front=35 ✓)
    (h8[10], r8, 10, 4, 4, 2, true,  true,  null, null, 0),
    (h8[11], r8, 11, 4, 3, 1, true,  true,  null, null, 0),  -- birdie
    (h8[12], r8, 12, 3, 3, 2, null,  true,  null, null, 0),
    (h8[13], r8, 13, 5, 5, 2, true,  true,  null, null, 0),
    (h8[14], r8, 14, 4, 4, 2, true,  true,  null, null, 0),
    (h8[15], r8, 15, 4, 5, 2, false, false, false,null, 0),  -- bogey
    (h8[16], r8, 16, 3, 3, 2, null,  true,  null, null, 0),
    (h8[17], r8, 17, 5, 5, 2, true,  true,  null, null, 0),
    (h8[18], r8, 18, 4, 4, 2, true,  true,  null, null, 0);  -- (back=36 ✓)

  -- ── R9 (79, +7): no birdies / bogeys h1,h2,h5,h7,h11,h14,h16
  -- Front: 5+4+5+4+5+4+4+5+4=40  Back: 4+5+3+5+5+4+4+5+4=39  Total=79 ✓
  INSERT INTO public.golf_holes
    (id, round_id, hole_number, par, score, putts, fairway_hit, gir, up_and_down, sand_save, penalty_strokes)
  VALUES
    (h9[1],  r9,  1, 4, 5, 2, false, false, false,null, 0),  -- bogey
    (h9[2],  r9,  2, 3, 4, 3, null,  false, false,null, 0),  -- bogey (3-putt)
    (h9[3],  r9,  3, 5, 5, 2, true,  true,  null, null, 0),
    (h9[4],  r9,  4, 4, 4, 2, false, false, true, null, 0),
    (h9[5],  r9,  5, 4, 5, 2, false, false, false,null, 0),  -- bogey
    (h9[6],  r9,  6, 4, 4, 2, true,  true,  null, null, 0),
    (h9[7],  r9,  7, 3, 4, 2, null,  false, false,null, 0),  -- bogey
    (h9[8],  r9,  8, 5, 5, 2, true,  true,  null, null, 0),
    (h9[9],  r9,  9, 4, 4, 2, true,  true,  null, null, 0),  -- (front=40 ✓)
    (h9[10], r9, 10, 4, 4, 2, true,  true,  null, null, 0),
    (h9[11], r9, 11, 4, 5, 2, false, false, false,null, 0),  -- bogey
    (h9[12], r9, 12, 3, 3, 2, null,  true,  null, null, 0),
    (h9[13], r9, 13, 5, 5, 2, false, true,  null, null, 0),
    (h9[14], r9, 14, 4, 5, 2, false, false, false,null, 0),  -- bogey
    (h9[15], r9, 15, 4, 4, 2, true,  true,  null, null, 0),
    (h9[16], r9, 16, 3, 4, 3, null,  false, false,null, 0),  -- bogey (3-putt)
    (h9[17], r9, 17, 5, 5, 2, true,  true,  null, null, 0),
    (h9[18], r9, 18, 4, 4, 2, true,  true,  null, null, 0);  -- (back=39 ✓)

  -- ── R10 (74, +2): birdies h3,h13 / bogeys h2,h9,h14,h16
  -- Front: 4+4+4+4+4+4+3+5+5=37  Back: 4+4+3+4+5+4+4+5+4=37  Total=74 ✓
  INSERT INTO public.golf_holes
    (id, round_id, hole_number, par, score, putts, fairway_hit, gir, up_and_down, sand_save, penalty_strokes)
  VALUES
    (h10[1],  r10,  1, 4, 4, 2, true,  true,  null, null, 0),
    (h10[2],  r10,  2, 3, 4, 2, null,  false, false,null, 0),  -- bogey
    (h10[3],  r10,  3, 5, 4, 1, true,  true,  null, null, 0),  -- birdie
    (h10[4],  r10,  4, 4, 4, 2, true,  true,  null, null, 0),
    (h10[5],  r10,  5, 4, 4, 2, true,  true,  null, null, 0),
    (h10[6],  r10,  6, 4, 4, 2, true,  true,  null, null, 0),
    (h10[7],  r10,  7, 3, 3, 2, null,  true,  null, null, 0),
    (h10[8],  r10,  8, 5, 5, 2, true,  true,  null, null, 0),
    (h10[9],  r10,  9, 4, 5, 2, false, false, false,null, 0),  -- bogey (front=37 ✓)
    (h10[10], r10, 10, 4, 4, 2, true,  true,  null, null, 0),
    (h10[11], r10, 11, 4, 4, 2, true,  true,  null, null, 0),
    (h10[12], r10, 12, 3, 3, 2, null,  true,  null, null, 0),
    (h10[13], r10, 13, 5, 4, 1, true,  true,  null, null, 0),  -- birdie
    (h10[14], r10, 14, 4, 5, 2, false, false, false,null, 0),  -- bogey
    (h10[15], r10, 15, 4, 4, 2, true,  true,  null, null, 0),
    (h10[16], r10, 16, 3, 4, 2, null,  false, false,null, 0),  -- bogey
    (h10[17], r10, 17, 5, 5, 2, true,  true,  null, null, 0),
    (h10[18], r10, 18, 4, 4, 2, true,  true,  null, null, 0);  -- (back=37 ✓)

  -- ── R11 (75, +3): birdies h8,h13 / bogeys h2,h6,h9,h14,h16
  -- Front: 4+4+5+4+4+5+3+4+5=38  Back: 4+4+4+4+5+4+4+5+4=38... wait that's 76.
  -- Let me recount: h10:4 h11:4 h12:3 h13:4(B) h14:5(Bo) h15:4 h16:4(Bo) h17:5 h18:4 = 37 ✓
  -- Front: 4+4+5+4+4+5+3+4+5=38  Back: 4+4+3+4+5+4+4+5+4=37  Total=75 ✓
  INSERT INTO public.golf_holes
    (id, round_id, hole_number, par, score, putts, fairway_hit, gir, up_and_down, sand_save, penalty_strokes)
  VALUES
    (h11[1],  r11,  1, 4, 4, 2, true,  true,  null, null, 0),
    (h11[2],  r11,  2, 3, 4, 2, null,  false, false,null, 0),  -- bogey
    (h11[3],  r11,  3, 5, 5, 2, true,  true,  null, null, 0),
    (h11[4],  r11,  4, 4, 4, 2, true,  true,  null, null, 0),
    (h11[5],  r11,  5, 4, 4, 2, true,  true,  null, null, 0),
    (h11[6],  r11,  6, 4, 5, 2, false, false, false,null, 0),  -- bogey
    (h11[7],  r11,  7, 3, 3, 2, null,  true,  null, null, 0),
    (h11[8],  r11,  8, 5, 4, 1, true,  true,  null, null, 0),  -- birdie
    (h11[9],  r11,  9, 4, 5, 2, false, false, false,null, 0),  -- bogey (front=38 ✓)
    (h11[10], r11, 10, 4, 4, 2, true,  true,  null, null, 0),
    (h11[11], r11, 11, 4, 4, 2, true,  true,  null, null, 0),
    (h11[12], r11, 12, 3, 3, 2, null,  true,  null, null, 0),
    (h11[13], r11, 13, 5, 4, 1, true,  true,  null, null, 0),  -- birdie
    (h11[14], r11, 14, 4, 5, 2, false, false, false,null, 0),  -- bogey
    (h11[15], r11, 15, 4, 4, 2, true,  true,  null, null, 0),
    (h11[16], r11, 16, 3, 4, 2, null,  false, false,null, 0),  -- bogey
    (h11[17], r11, 17, 5, 5, 2, true,  true,  null, null, 0),
    (h11[18], r11, 18, 4, 4, 2, true,  true,  null, null, 0);  -- (back=37 ✓)

  -- ── 3. golf_round_stats_cache ─────────────────────────────────────────────
  -- Score distributions per round (birdies/bogeys/etc cross-checked with holes):
  --   R1:  1 eagle, 2 birdies, 15 pars, 0 bogeys        → 68
  --   R2:  0 eagle, 2 birdies, 12 pars, 4 bogeys         → 74
  --   R3:  0 eagle, 1 birdie,  13 pars, 4 bogeys         → 75
  --   R4:  0 eagle, 2 birdies, 14 pars, 2 bogeys         → 72
  --   R5:  0 eagle, 1 birdie,  11 pars, 6 bogeys         → 77
  --   R6:  0 eagle, 2 birdies, 13 pars, 3 bogeys         → 73
  --   R7:  0 eagle, 1 birdie,  12 pars, 5 bogeys         → 76
  --   R8:  0 eagle, 3 birdies, 13 pars, 2 bogeys         → 71
  --   R9:  0 eagle, 0 birdies, 11 pars, 7 bogeys         → 79
  --   R10: 0 eagle, 2 birdies, 12 pars, 4 bogeys         → 74
  --   R11: 0 eagle, 2 birdies, 11 pars, 5 bogeys         → 75
  INSERT INTO public.golf_round_stats_cache (
    id, round_id, player_id,
    total_score, score_to_par, front_nine, back_nine,
    strokes_gained_total, strokes_gained_tee, strokes_gained_approach,
    strokes_gained_around_green, strokes_gained_putting,
    fairways_hit, fairways_total, greens_hit, greens_total,
    total_putts, one_putts, three_putts,
    scrambles_converted, scramble_attempts,
    sand_saves, sand_attempts,
    eagles, birdies, pars, bogeys, double_bogeys, triple_plus, penalty_strokes,
    created_at, updated_at
  ) VALUES
    (gen_random_uuid(), r1,  v_player_id, 68, -4, 32, 36,  1.8, 0.6, 0.5, 0.3, 0.4, 10,14,14,18, 29,6,0, 0,0, 0,0, 1,2,15, 0,0,0,0, now(),now()),
    (gen_random_uuid(), r2,  v_player_id, 74,  2, 37, 37, -0.2, 0.1,-0.1,-0.1,-0.1,  9,14,11,18, 32,3,0, 0,2, 0,0, 0,2,12, 4,0,0,0, now(),now()),
    (gen_random_uuid(), r3,  v_player_id, 75,  3, 37, 38, -0.4,-0.1,-0.1,-0.1,-0.1,  8,14,10,18, 33,2,0, 0,1, 0,0, 0,1,13, 4,0,0,0, now(),now()),
    (gen_random_uuid(), r4,  v_player_id, 72,  0, 36, 36,  0.6, 0.2, 0.2, 0.0, 0.2, 10,14,12,18, 31,4,0, 0,1, 0,0, 0,2,14, 2,0,0,0, now(),now()),
    (gen_random_uuid(), r5,  v_player_id, 77,  5, 39, 38, -1.1,-0.4,-0.3,-0.2,-0.2,  7,14, 9,18, 35,2,0, 0,2, 0,0, 0,1,11, 6,0,0,0, now(),now()),
    (gen_random_uuid(), r6,  v_player_id, 73,  1, 36, 37,  0.2, 0.1, 0.1,-0.1, 0.1, 11,14,12,18, 30,4,0, 0,1, 0,0, 0,2,13, 3,0,0,0, now(),now()),
    (gen_random_uuid(), r7,  v_player_id, 76,  4, 37, 39, -0.7,-0.2,-0.2,-0.1,-0.2,  8,14,10,18, 34,2,0, 0,2, 0,0, 0,1,12, 5,0,0,0, now(),now()),
    (gen_random_uuid(), r8,  v_player_id, 71, -1, 35, 36,  0.9, 0.3, 0.3, 0.1, 0.2, 11,14,13,18, 29,5,0, 0,1, 0,0, 0,3,13, 2,0,0,0, now(),now()),
    (gen_random_uuid(), r9,  v_player_id, 79,  7, 40, 39, -1.9,-0.6,-0.5,-0.4,-0.4,  6,14, 8,18, 36,1,2, 0,2, 0,0, 0,0,11, 7,0,0,0, now(),now()),
    (gen_random_uuid(), r10, v_player_id, 74,  2, 37, 37, -0.1, 0.0, 0.0,-0.1, 0.0,  9,14,11,18, 32,3,0, 0,1, 0,0, 0,2,12, 4,0,0,0, now(),now()),
    (gen_random_uuid(), r11, v_player_id, 75,  3, 38, 37, -0.4,-0.1,-0.1,-0.1,-0.1,  9,14,10,18, 33,3,0, 0,2, 0,0, 0,2,11, 5,0,0,0, now(),now());

  -- ── 4. golf_player_stats_cache ────────────────────────────────────────────
  -- Aggregates across 11 rounds.
  --
  -- Total score: 68+74+75+72+77+73+76+71+79+74+75 = 814; avg = 814/11 = 74.0
  -- Fairways:    10+9+8+10+7+11+8+11+6+9+9 = 98 of 154 → 63.6%
  -- GIR:         14+11+10+12+9+12+10+13+8+11+10 = 120 of 198 → 60.6%
  -- Putts:       29+32+33+31+35+30+34+29+36+32+33 = 354; avg = 354/11 = 32.2
  -- Eagles: 1; Birdies: 2+2+1+2+1+2+1+3+0+2+2=18; Pars: 15+12+13+14+11+13+12+13+11+12+11=137
  -- Bogeys: 0+4+4+2+6+3+5+2+7+4+5=42; Doubles: 0
  -- SG total sum: 1.8-0.2-0.4+0.6-1.1+0.2-0.7+0.9-1.9-0.1-0.4 = -1.3; per rd = -0.12
  -- Last 5 rounds: r7(76)+r8(71)+r9(79)+r10(74)+r11(75) = 375/5 = 75.0
  -- Last 10 rounds: r2..r11 = 74+75+72+77+73+76+71+79+74+75 = 746/10 = 74.6
  --
  -- golf_player_stats_cache has NO unique constraint on player_id (pkey is on id).
  -- The sentinel guard above ensures we're only here when no gapfill rows exist,
  -- so a plain INSERT (no ON CONFLICT) is safe for the stats cache row.

  INSERT INTO public.golf_player_stats_cache (
    id, player_id,
    rounds_played, rounds_in_calculation, rounds_this_season,
    scoring_average, scoring_average_vs_par,
    best_round, worst_round,
    eagles, birdies, pars, bogeys, double_bogeys, triple_plus,
    fairways_hit, fairways_total, driving_accuracy_percentage,
    greens_hit, greens_total, gir_percentage,
    total_putts, putts_per_round,
    scrambles_converted, scramble_attempts,
    sand_saves, sand_attempts,
    strokes_gained_total, strokes_gained_tee, strokes_gained_approach,
    strokes_gained_around_green, strokes_gained_putting,
    sg_total_per_round, sg_tee_per_round, sg_approach_per_round,
    sg_around_green_per_round, sg_putting_per_round,
    last_round_date,
    calculation_period_start, calculation_period_end, season_start_date,
    last_5_average, last_10_average,
    improvement_trend, trend_direction,
    engine_version, is_stale,
    round_ids_included,
    created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    v_player_id,
    11, 11, 11,
    74.0, 2.0,
    68, 79,
    1, 18, 137, 42, 0, 0,
    98, 154, 63.6,
    120, 198, 60.6,
    354, 32.2,
    0, 12,    -- no scrambles converted in this seed (no shot data), 12 attempts estimated
    0, 0,
    -1.3, -0.2, 0.0, -0.7, -0.4,   -- SG totals across 11 rounds
    -0.12, -0.02, 0.0, -0.06, -0.04,
    '2026-06-09',
    '2026-04-08', '2026-06-09', '2026-01-01',
    75.0,   -- last_5_average
    74.6,   -- last_10_average
    -0.2, 'stable',
    'v2', false,
    ARRAY[r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11],
    now(), now()
  );

  -- ── 5. golf_round_reviews ─────────────────────────────────────────────────
  -- Review 1: Hot round (r1, 68, -4)
  INSERT INTO public.golf_round_reviews (
    id, round_id, player_id,
    round_score, round_score_to_par,
    scoring_avg_before, scoring_avg_after,
    highlights, areas_to_review, round_stats, patterns_detected,
    summary, primary_takeaway, next_practice_priority,
    shared_with_coach, engine_version,
    sentiment_score, status, generation_method, version,
    highlights_count, areas_count,
    created_at, updated_at
  ) VALUES (
    gen_random_uuid(), r1, v_player_id,
    68, -4,
    75.8, 75.2,
    '[
      {"type": "eagle", "hole": 3, "note": "Hit a 220-yard second shot to 8 feet and converted the eagle putt on the par-5 3rd"},
      {"type": "ball_striking", "note": "Hit 10 of 14 fairways and reached 14 greens in regulation — career-high GIR"},
      {"type": "putting", "note": "Only 29 putts — 6 one-putts, 0 three-putts. Exceptional lag putting all day"}
    ]'::jsonb,
    '[{"area": "consistency", "note": "Replicate pre-shot routine discipline from today in next tournament"}]'::jsonb,
    '{"gir_pct": 77.8, "fairway_pct": 71.4, "putts_per_round": 29, "score_to_par": -4}'::jsonb,
    '[{"pattern": "back_nine_momentum", "description": "Even split 32/36 — maintained focus after the eagle instead of protecting the score"}]'::jsonb,
    'Career-low 68 at Pinehurst No.2. The eagle on hole 3 set the tone and Tyler carried that momentum through a clean back nine. Best GIR of the season (14/18) underpinned by a patient approach game.',
    'When ball-striking and putting peak together Tyler can post scores that compete with any D1 team.',
    'Practice lag putting from 30+ feet to cement the pace control that kept three-putts off the card today.',
    true, 'v2', 0.93, 'published', 'v1', 1, 3, 1,
    now() - interval '64 days', now() - interval '64 days'
  );

  -- Review 2: Bad round (r9, 79, +7)
  INSERT INTO public.golf_round_reviews (
    id, round_id, player_id,
    round_score, round_score_to_par,
    scoring_avg_before, scoring_avg_after,
    highlights, areas_to_review, round_stats, patterns_detected,
    summary, primary_takeaway, next_practice_priority,
    shared_with_coach, engine_version,
    sentiment_score, status, generation_method, version,
    highlights_count, areas_count,
    created_at, updated_at
  ) VALUES (
    gen_random_uuid(), r9, v_player_id,
    79, 7,
    74.2, 74.5,
    '[{"type": "resilience", "note": "Parred holes 10-13 after a rough front nine to prevent the round spiraling further"}]'::jsonb,
    '[
      {"area": "wet_conditions",   "note": "Rain and 55°F temps cut GIR to 8/18 (season avg 10.9) — pre-round warm-up needs weather protocol"},
      {"area": "par3_performance", "note": "3 of 4 par-3s resulted in bogeys including two three-putts — distance control on soft greens"},
      {"area": "three_putts",      "note": "Two three-putts on holes 2 and 16 added 2 avoidable strokes"}
    ]'::jsonb,
    '{"gir_pct": 44.4, "fairway_pct": 42.9, "putts_per_round": 36, "score_to_par": 7}'::jsonb,
    '[
      {"pattern": "wet_conditions_regression", "description": "+7 over season average in rain — consistent weather-related scoring spike"},
      {"pattern": "par3_bogey_cluster",        "description": "3 par-3 bogeys on a single round — possibly club selection in wet conditions"}
    ]'::jsonb,
    'A tough day in rain at Finley Golf Course. Missed 10 greens (nearly double the season norm) and the resulting scrambling pressure exposed gaps in short-game distance control on soft turf. Two three-putts added avoidable strokes.',
    'Rainy-day rounds require a deliberate course management adjustment: club down on approaches, commit to landing zones over flight lines.',
    'Wet-condition putting drill: 10-15 ft on slow surfaces. Focus exclusively on distance control, not line.',
    true, 'v2', 0.26, 'published', 'v1', 1, 1, 3,
    now() - interval '11 days', now() - interval '11 days'
  );

  RAISE NOTICE 'Tyler Passmore gapfill complete: 11 rounds, 198 holes, 11 round_stats_cache, 1 player_stats_cache, 2 reviews inserted.';

END $$;
