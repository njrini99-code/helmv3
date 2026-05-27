-- Drill library seed (Foundation F4, ~60 drills).
--
-- Categories map 1:1 to golf_coach_insights.category. Tags match the
-- vocabulary the mining generators will emit in `drill_tags` (distance
-- buckets, miss biases, strategy labels, etc.).
--
-- All drills are established golf practice patterns — no invented nonsense.
-- Safe to re-run: ON CONFLICT (slug) DO NOTHING keeps it idempotent.

INSERT INTO public.golf_drills (slug, title, category, tags, description, duration_min, difficulty) VALUES

-- =========================================================================
-- PUTTING (15)
-- =========================================================================
('putt_gate_3ft', 'Gate Drill (3-foot putts)',
  'putting', ARRAY['0_3ft','face_alignment'],
  'Set two tees just wider than the putter head 3 feet from the cup. Hit 20 putts without clipping a tee. Trains a square face and solid strike from a make-it distance.',
  10, 'beginner'),

('putt_clock_3ft', 'Clock Drill (3 feet)',
  'putting', ARRAY['0_3ft','face_alignment','under_read','over_read'],
  'Place six balls in a circle 3 feet from the cup. Make all six, consecutively. Reset if you miss. Forces read-commit and repeatable stroke.',
  10, 'beginner'),

('putt_gate_6ft', 'Gate Drill (6-foot putts)',
  'putting', ARRAY['3_6ft','face_alignment'],
  'Same gate, extended to 6 feet with a slight break. Ten makes in a row. Builds confidence in the scoring zone.',
  15, 'intermediate'),

('putt_tiger_4ball', 'Tiger 4-Ball Drill',
  'putting', ARRAY['3_6ft','speed_control','face_alignment'],
  'Place balls at 3, 4, 5, 6 feet on the same line. Must make all four to count. Reset on any miss. Ten-minute drill that exposes stroke repeatability.',
  15, 'intermediate'),

('putt_edge_6_10', '6–10ft Edge Drill',
  'putting', ARRAY['6_10ft','speed_control','leave_short','leave_long'],
  'Hit 20 putts from 8 feet with the intent to just roll the ball 12 inches past the cup on misses. Measures make-pct AND speed discipline together.',
  15, 'intermediate'),

('putt_one_handed_6_10', 'One-Handed Release (6–10ft)',
  'putting', ARRAY['6_10ft','face_alignment'],
  'Hit trail-hand-only putts from 8 feet. Teaches face rotation and contact; cures yippy strokes under pressure.',
  10, 'intermediate'),

('putt_break_read_station', 'Three-Break Read Station',
  'putting', ARRAY['6_10ft','10_15ft','green_reading','under_read','over_read'],
  'Pick a slope, hit 5 balls from 10 feet, aim the apex-pointer exactly. Chart makes and which side of the cup the ball exits. Calibrates break read.',
  20, 'intermediate'),

('putt_15ft_cluster', '15-foot Cluster',
  'putting', ARRAY['10_15ft','speed_control','leave_short'],
  'Hit 10 putts from 15 feet. Goal: finish inside a 3-foot circle around the cup on 8+ of 10. Trains lag from a make-able distance.',
  15, 'intermediate'),

('putt_ladder_lag', 'Ladder Drill (Lag Putting)',
  'putting', ARRAY['20+ft','speed_control','leave_short','leave_long'],
  'Hit putts at 20, 30, 40, 50 feet. Each must finish closer to the hole than the previous. Best lag-speed drill in the book.',
  15, 'intermediate'),

('putt_around_world', 'Around-the-World Long',
  'putting', ARRAY['15_20ft','20+ft','speed_control'],
  'Place balls at 15, 20, 25, 30 feet around a hole. Two-putt every location three times in a row. Reset on a three-putt.',
  20, 'intermediate'),

('putt_speed_only', 'No-Cup Speed Drill',
  'putting', ARRAY['20+ft','speed_control'],
  'Roll putts from 30–40 feet to an imaginary line on the fringe — NOT a cup. Trains pure speed without the distraction of a target.',
  15, 'beginner'),

('putt_high_side_preference', 'High-Side Commit Drill',
  'putting', ARRAY['6_10ft','10_15ft','under_read'],
  'On every breaking putt, aim two cups higher than your read. 10 putts. Fixes chronic under-read tendency.',
  10, 'intermediate'),

('putt_low_side_discipline', 'Pro-Line Low-Side Drill',
  'putting', ARRAY['6_10ft','10_15ft','over_read'],
  'Aim at a pro-line (inside of the cup) on every breaking putt. Forces committed strike on slower putts and cures over-reading.',
  10, 'intermediate'),

('putt_uphill_downhill', 'Uphill / Downhill Pair',
  'putting', ARRAY['10_15ft','15_20ft','speed_control','leave_short','leave_long'],
  'Alternate an uphill 15-footer and a downhill 15-footer. 10 of each. Teaches distinct stroke length for grain and slope.',
  20, 'intermediate'),

('putt_aim_point_station', 'AimPoint Express Station',
  'putting', ARRAY['6_10ft','10_15ft','15_20ft','green_reading'],
  'Straddle the putt, feel the slope, set number of fingers equal to slope%. Extend arm, align finger to cup for aim point. Calibrate over 20 putts on varied slopes.',
  20, 'advanced'),

-- =========================================================================
-- TEE (10)
-- =========================================================================
('tee_gates_driver', 'Driver Tee Gates',
  'tee', ARRAY['driver_dispersion','accuracy_over_distance'],
  'Set two alignment sticks 8 yards apart 30 yards in front of the tee. Hit 20 drivers through the gate. Tightens dispersion without overswinging.',
  20, 'intermediate'),

('tee_step_through', 'Step-Through Driver',
  'tee', ARRAY['tempo','swing_path'],
  'Start feet together, step into the ball on the downswing. Rebuilds tempo and sequencing on pull-hook days.',
  15, 'intermediate'),

('tee_9_to_3', '9-to-3 Driver',
  'tee', ARRAY['face_alignment','swing_path','tempo'],
  'Swing only from hip-high to hip-high with the driver, ball teed low. 30 reps. Isolates face and path without big-swing variables.',
  10, 'beginner'),

('tee_toe_heel_check', 'Toe/Heel Face-Tape Drill',
  'tee', ARRAY['face_alignment','driver_dispersion'],
  'Put impact tape on the driver face. Hit 15 balls. Chart strike pattern. Exposes whether dispersion is face-angle vs. strike location.',
  15, 'intermediate'),

('tee_3wood_fairway_finder', '3-Wood Fairway Finder',
  'tee', ARRAY['accuracy_over_distance','driver_dispersion'],
  'Rotate driver/3w/driver/3w for 20 shots to the same fairway. Trains decision-making for tight tee shots during rounds.',
  20, 'intermediate'),

('tee_push_pull_split', 'Push / Pull Split',
  'tee', ARRAY['face_alignment','swing_path','driver_dispersion'],
  'Chart every tee shot left/right over 15 swings. Identify bias. Adjust setup (ball position, stance closed/open) for next 15 to neutralize. Data-driven fix.',
  25, 'intermediate'),

('tee_wind_low_bullet', 'Low-Bullet Wind Driver',
  'tee', ARRAY['tempo','accuracy_over_distance'],
  'Tee ball low, ball back, hands ahead. 10 reps trying to keep it under 20 feet of peak height. For headwind rounds.',
  15, 'advanced'),

('tee_slow_mo_tempo', 'Slow-Motion Tempo Driver',
  'tee', ARRAY['tempo','swing_path'],
  'Hit 10 drivers at 75% speed with an audible 1-2 tempo count. Resets tempo when swings get quick under pressure.',
  10, 'beginner'),

('tee_stock_shape_lock', 'Stock Shape Lock-In',
  'tee', ARRAY['face_alignment','swing_path'],
  'Hit 25 drivers ONLY with your stock shape (e.g., small draw). Any other shape counts as a miss. Builds tournament-ready shape reliability.',
  25, 'intermediate'),

('tee_smash_factor_station', 'Smash Factor Station',
  'tee', ARRAY['driver_dispersion','accuracy_over_distance'],
  'If you have a launch monitor: 20 drivers, reject any smash under 1.45. Measures centerface quality, not swing speed.',
  25, 'advanced'),

-- =========================================================================
-- APPROACH (12)
-- =========================================================================
('approach_9_shot_matrix', '9-Shot Matrix',
  'approach', ARRAY['direction_bias','proximity','under_clubbing'],
  'Hit high/mid/low x left/straight/right — 9 shots with a single iron. Expands shot-making tools to escape trouble.',
  25, 'advanced'),

('approach_150_proximity', '150-yard Proximity Test',
  'approach', ARRAY['100_150yd','150_175yd','proximity','direction_bias'],
  'Hit 10 shots to a 150-yard flag. Measure average proximity. Track weekly. Scoring-zone benchmark for competitive golf.',
  20, 'intermediate'),

('approach_175_accuracy', '175-yard Accuracy Funnel',
  'approach', ARRAY['150_175yd','175_200yd','proximity','direction_bias'],
  'Aim at 175-yard flag. Draw mental funnel ±15 yards. Hit 10. Count shots inside the funnel. Targets the D2/D1 approach gap.',
  25, 'intermediate'),

('approach_200_long_iron', '200+ Yard Long-Iron Station',
  'approach', ARRAY['200+yd','under_clubbing','proximity'],
  'Hit 10 long-iron/hybrid approaches to a 200-yard target. Track whether you hit pin-high or short. Diagnoses club-up decisions.',
  25, 'advanced'),

('approach_pick_your_club', 'Pick Your Club Random-Yardage',
  'approach', ARRAY['100_150yd','150_175yd','175_200yd','under_clubbing'],
  'Have a partner call random yardages (112, 147, 163). You pick club and commit. Builds real-round decision speed.',
  25, 'intermediate'),

('approach_front_middle_back', 'Front / Middle / Back Flag',
  'approach', ARRAY['100_150yd','150_175yd','proximity','under_clubbing'],
  'Same distance target, three flag positions. Hit 3 shots to each. Teaches attacking back pins without going long.',
  20, 'intermediate'),

('approach_wind_trainer', 'Knock-Down Approach',
  'approach', ARRAY['150_175yd','175_200yd','proximity'],
  'Hit 15 three-quarter knock-downs with a mid iron. Same distance as a full shot, lower trajectory. Staple for windy events.',
  20, 'intermediate'),

('approach_miss_bias_fix', 'Miss-Bias Correction Station',
  'approach', ARRAY['direction_bias','proximity'],
  'Identify your miss side (e.g., long-right). Place a bunker / rope on your miss side. Hit 15 shots penalized for touching your bias. Trains the "good miss".',
  25, 'intermediate'),

('approach_yardage_gap_test', 'Yardage Gap Test',
  'approach', ARRAY['under_clubbing','100_150yd','150_175yd'],
  'Hit 5 balls with each wedge/short iron. Find the gaps. Write down your 3/4, full, and knock-down distance for every club.',
  30, 'intermediate'),

('approach_sloped_lie', 'Sloped-Lie Approach',
  'approach', ARRAY['direction_bias','proximity','150_175yd'],
  'Hit 10 mid-irons from uphill, downhill, side-hill lies. Real-course lies cause 70% of approach misses; practice-range ones do not prepare you.',
  20, 'advanced'),

('approach_green_light_red_light', 'Green-Light / Red-Light',
  'approach', ARRAY['proximity','direction_bias','under_clubbing'],
  'Before every shot, call it green-light (attack pin) or red-light (center green). 20 shots. Builds on-course discipline.',
  30, 'intermediate'),

('approach_pga_distance_control', 'PGA Distance-Control Ladder',
  'approach', ARRAY['proximity','100_150yd'],
  'Hit 110, 120, 130, 140 with same wedge (swing length only). 5 reps each. Rule: each ball must stop within 8 ft of its target yardage.',
  25, 'advanced'),

-- =========================================================================
-- SHORT GAME (10)
-- =========================================================================
('shortgame_clock_chip', 'Clock-Face Chipping',
  'short_game', ARRAY['chip_proximity','bump_run'],
  'Use 7:30, 9:00, 10:30 backswing lengths with a single club. Chart distances. Builds three baked-in chip distances without club-switching.',
  20, 'beginner'),

('shortgame_one_club_wizardry', 'One-Club Short Game',
  'short_game', ARRAY['chip_proximity','pitch_control','bump_run','flop_shot'],
  'Play 20 different around-green shots with only a PW. Forces creativity, feel, and trajectory-by-technique.',
  25, 'advanced'),

('shortgame_sand_splash_line', 'Sand Splash-Line Drill',
  'short_game', ARRAY['bunker_fundamentals'],
  'Draw a line in the sand. Splash the sand, not the ball. 20 reps without a ball. Then add a ball for 10 more. Builds correct bunker contact.',
  20, 'beginner'),

('shortgame_fried_egg', 'Fried-Egg Bunker Recovery',
  'short_game', ARRAY['bunker_fundamentals'],
  'Step on 10 balls to create plugged lies. Escape each one. Tournaments always bring bad lies — prepare for them.',
  20, 'intermediate'),

('shortgame_20_30_40_pitch', '20-30-40-Yard Pitch Ladder',
  'short_game', ARRAY['pitch_control','chip_proximity'],
  'Hit 5 pitches to each of three targets at 20, 30, 40 yards. Measure average proximity. The scoring-zone money distance range.',
  25, 'intermediate'),

('shortgame_flop_to_towel', 'Flop-Shot Towel',
  'short_game', ARRAY['flop_shot'],
  'Lay a towel 10 feet away. Flop 15 high shots that land on the towel. Builds touch for tight-lie shortside escapes.',
  20, 'advanced'),

('shortgame_bump_run_links', 'Bump-and-Run Corridor',
  'short_game', ARRAY['bump_run','chip_proximity'],
  'From 10 yards off, use 8-iron through hybrid to run shots through a corridor of tees. Links-style scoring tool.',
  20, 'intermediate'),

('shortgame_up_and_down_game', 'Up-and-Down Game',
  'short_game', ARRAY['chip_proximity','pitch_control','bunker_fundamentals'],
  'Drop 10 balls randomly around the green (rough, sand, tight lies). Score up-and-down rate. Competitive self-test.',
  30, 'intermediate'),

('shortgame_spinners', 'Spinner Wedges',
  'short_game', ARRAY['pitch_control','chip_proximity'],
  'From 25 yards, hit 10 shots that land past the flag and zip back within 6 feet. Trains friction-face contact.',
  20, 'advanced'),

('shortgame_hybrid_chip', 'Hybrid Chip-and-Run',
  'short_game', ARRAY['bump_run','chip_proximity'],
  'From the fringe, 15 chips with a hybrid. Lowest-risk recovery when greens are receptive and the hole is far.',
  15, 'beginner'),

-- =========================================================================
-- SCORING (6)
-- =========================================================================
('scoring_par5_3shot_plan', 'Par-5 Three-Shot Blueprint',
  'scoring', ARRAY['par_5_strategy'],
  'On the range: simulate a par 5 (drive, layup, wedge). Must hit all three targets in sequence or restart. 5 rounds.',
  30, 'intermediate'),

('scoring_par3_green_hunt', 'Par-3 Green-Hunt',
  'scoring', ARRAY['par_3_recovery'],
  'Hit 10 par-3-length shots to a real green on the course (between groups if possible). Reject any that miss the green. Pure GIR-rate trainer.',
  25, 'intermediate'),

('scoring_short_par4_drive', 'Short Par-4 Driver vs. Layup',
  'scoring', ARRAY['short_par_4_strategy','risk_reward'],
  'Play the same short par 4 twice — once bombs-away driver, once layup + wedge. Chart scores over 10 rounds. Decision is yours.',
  45, 'advanced'),

('scoring_bogey_save', 'Bogey-Save Rehearsal',
  'scoring', ARRAY['bogey_recovery','pressure'],
  'Drop 10 balls in bad spots (rough, trees, bunker). Score: did you salvage bogey? Rewards smart recovery, punishes hero-shot mistakes.',
  30, 'intermediate'),

('scoring_9_tough_pins', 'Nine Tough Pins',
  'scoring', ARRAY['par_3_recovery','short_par_4_strategy'],
  'Set 9 brutal pin locations on the practice green. Play to all 9 from approach distance. Trains decision-making under uncomfortable conditions.',
  45, 'advanced'),

('scoring_worst_ball', 'Worst-Ball',
  'scoring', ARRAY['bogey_recovery','par_5_strategy'],
  'Play 9 holes; hit two balls every shot, always play the worst. Teaches zero-throwaway golf.',
  90, 'advanced'),

-- =========================================================================
-- PRESSURE (5)
-- =========================================================================
('pressure_6ft_pressure', '6-foot Pressure 10-Makes',
  'pressure', ARRAY['tournament_simulation','pre_shot_routine'],
  'Make 10 consecutive 6-footers. Miss = restart at zero. Build tournament-putting nerves and routine discipline.',
  15, 'intermediate'),

('pressure_pre_shot_routine', 'Pre-Shot Routine Lock-In',
  'pressure', ARRAY['pre_shot_routine'],
  'Pick a 30-sec routine (visualize, rehearse, commit, strike). Run it identically on 20 range shots. Rep until automatic.',
  20, 'beginner'),

('pressure_box_breathing', 'Box-Breathing Between Shots',
  'pressure', ARRAY['breath_work','pre_shot_routine'],
  '4-4-4-4 box breath for 3 cycles between every shot during a range session. Drops heart rate and sharpens focus.',
  15, 'beginner'),

('pressure_back_nine_sim', 'Back-Nine Simulation',
  'pressure', ARRAY['tournament_simulation','back_nine_focus'],
  'Play a real 9 treating hole 10 as hole 1 of a tournament back nine — 3 over par or better or restart. Emotionally replicates a final nine.',
  90, 'advanced'),

('pressure_first_tee_sim', 'First-Tee Simulation',
  'pressure', ARRAY['tournament_simulation','pre_shot_routine','breath_work'],
  'Hit 1 driver. Only 1. Must hit fairway. If not, walk a lap. Simulates the no-warmup pressure of a first tournament tee ball.',
  20, 'intermediate'),

-- =========================================================================
-- COURSE MANAGEMENT (5)
-- =========================================================================
('cm_tee_strategy_map', 'Tee-Strategy Yardage Book',
  'course_management', ARRAY['tee_strategy','club_selection'],
  'For every par-4/par-5 on your home course, write down a default target, a conservative target, and which club. Make decisions on paper, not on the tee.',
  60, 'intermediate'),

('cm_preferred_yardage', 'Preferred-Yardage Planner',
  'course_management', ARRAY['tee_strategy','club_selection'],
  'Identify your best wedge yardage (e.g., 95 yds). Plan every par 5 and short par 4 to leave that number. Minimizes awkward distances.',
  30, 'intermediate'),

('cm_risk_reward_table', 'Risk-Reward Decision Table',
  'course_management', ARRAY['risk_reward','tee_strategy'],
  'For each par 5 and short par 4: compute expected score going for it vs. laying up, given your actual success rate. Brutal honesty with the numbers.',
  45, 'advanced'),

('cm_club_selection_matrix', 'Club-Selection Matrix',
  'course_management', ARRAY['club_selection'],
  'Build a matrix: wind (head/tail/cross), elevation (+/-10ft), lie (tight/fluffy). Populate it with your club adjustments. Reference during play.',
  30, 'intermediate'),

('cm_green_light_audit', 'Green-Light Audit',
  'course_management', ARRAY['risk_reward','club_selection'],
  'Review last 5 rounds. Count approach shots where you went at a sucker pin. Map how many cost you shots. Recalibrates aggression.',
  30, 'intermediate')

ON CONFLICT (slug) DO NOTHING;
