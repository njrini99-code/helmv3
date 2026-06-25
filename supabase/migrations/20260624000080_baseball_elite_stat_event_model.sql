-- ============================================================================
-- Migration: 20260624000080_baseball_elite_stat_event_model.sql
-- Packet: elite-stats (BaseballHelm — stats-integrations)
-- Purpose: The elite, source-aware EVENT model. Pitch / swing / batted-ball /
--          fielding / catching / baserunning event tables + a source registry,
--          a generic source-linked stat-fact table, saved import field-mapping
--          profiles, plate-appearance grain, and player development-metric
--          snapshots. Every event row separates OFFICIAL vs SCRIMMAGE vs
--          PRACTICE/BULLPEN/CAGE vs SENSOR context and carries source +
--          import lineage + trust tier + visibility so the stat universe stays
--          provenance-true (V6 stat universe + V6 data model + V2 contracts).
--
-- GROUNDING (spec lines implemented):
--   * v6_stats_data_model_and_import_contract.md §"Tables To Add":
--       baseball_stat_sources, baseball_stat_facts, baseball_plate_appearances,
--       baseball_pitch_events, baseball_batted_ball_events, baseball_swing_events,
--       baseball_fielding_events, baseball_catching_events,
--       baseball_workload_events, baseball_video_events,
--       baseball_import_field_mappings. (external identities / import_runs /
--       import_rows / lifting / readiness already exist from 0020/0061; we
--       EXTEND not clone.)
--   * v6_elite_baseball_stat_universe.md: per-event field sets for pitch / swing
--       / batted-ball / fielding / catching, the development metric families,
--       and the official-vs-development separation.
--   * v10_baseball_stat_visual_contracts.md §"Data Contexts": the data_context
--       enum (official_game / scrimmage / practice / bullpen / cage / showcase /
--       sensor / video / lift / readiness / manual) every visual filters on.
--   * v6 §"Source Trust and Metric Authority": trust_tier + visibility on every
--       fact-bearing row.
--
-- SAFETY CONTRACT (CLAUDE.md hard rules — this file is WRITTEN, NOT APPLIED):
--   * ADDITIVE ONLY. CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS /
--     CREATE INDEX IF NOT EXISTS / DROP POLICY IF EXISTS then CREATE POLICY.
--     No DROP TABLE/COLUMN, no destructive UPDATE/DELETE. Safe to re-run.
--   * Sport-prefixed names only (baseball_*).
--   * RLS ENABLED on every new table; every CRUD verb has an explicit,
--     team-scoped, TO authenticated policy. NO grant to anon. service_role
--     bypasses RLS by design (engine / import / recalc writes).
--   * Reuses the 0050 capability helpers (has_baseball_staff_capability,
--     can_view_baseball_player, get_my_baseball_player_id, is_baseball_team_staff)
--     so policy text stays consistent with the rest of the schema. Every table
--     block is to_regclass-guarded so this is safe to apply AFTER 0010..0061
--     even if a sibling has not landed.
--   * No SECURITY DEFINER helpers added here (we reuse 0050's, which already pin
--     search_path = public, pg_temp and revoke anon).
-- ============================================================================

-- ============================================================================
-- SHARED ENUM-LIKE DOMAINS (as CHECK constraints, not pg enums, so they stay
-- additive/extensible without ALTER TYPE locks). The vocabulary below is the
-- single source of truth referenced by every event table.
--
--   data_context : official_game | scrimmage | practice | bullpen | cage |
--                  showcase | sensor | video | lift | readiness | manual
--   trust_tier   : official | verified_vendor | coach_reviewed |
--                  player_submitted | unverified | inferred
--   visibility   : staff_only | player_visible | restricted
-- ============================================================================

-- ----------------------------------------------------------------------------
-- baseball_stat_sources — source registry (official + development + sensor +
-- video + strength + academics + operations). One row per configured source per
-- team. Drives trust, default visibility, review requirement, and saved mapping.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS baseball_stat_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL CHECK (source_key IN (
    'manual', 'gamechanger_xml', 'statcrew_xml', 'ncaa_live_stats',
    'prestosports_xml', 'sidearm_xml', 'statbroadcast_xml',
    'trackman_csv', 'rapsodo_csv', 'yakkertech_csv', 'hittrax_csv',
    'pocket_radar_csv', 'blast_csv', 'diamond_kinetics_csv',
    'synergy_export', 'six_four_three_export', 'awre_video', 'onform_export',
    'armcare_csv', 'teambuildr_csv', 'teamworks_csv',
    'google_sheets', 'generic_csv', 'generic_xlsx', 'pdf_extract'
  )),
  source_name TEXT NOT NULL,
  source_category TEXT NOT NULL CHECK (source_category IN (
    'official_game', 'player_development', 'tracking', 'video',
    'strength', 'academics', 'operations'
  )),
  trust_tier TEXT NOT NULL DEFAULT 'unverified' CHECK (trust_tier IN (
    'official', 'verified_vendor', 'coach_reviewed', 'player_submitted',
    'unverified', 'inferred'
  )),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  default_visibility TEXT NOT NULL DEFAULT 'staff_only' CHECK (default_visibility IN (
    'staff_only', 'player_visible', 'restricted'
  )),
  requires_review BOOLEAN NOT NULL DEFAULT true,
  -- AI-use gate (V6 integration settings + zip non-negotiable: AI cites sources).
  ai_can_use BOOLEAN NOT NULL DEFAULT false,
  -- expected cadence (days) — powers the Source Coverage Board fresh/stale calc.
  expected_cadence_days INTEGER,
  field_mapping_profile JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_baseball_stat_sources_team_key
    UNIQUE (team_id, source_key, source_name)
);
CREATE INDEX IF NOT EXISTS idx_baseball_stat_sources_team
  ON baseball_stat_sources(team_id);
CREATE INDEX IF NOT EXISTS idx_baseball_stat_sources_category
  ON baseball_stat_sources(team_id, source_category);

-- ----------------------------------------------------------------------------
-- baseball_import_field_mappings — saved, user-confirmed header→canonical maps
-- so a recurring vendor file maps with no re-work (V6 §baseball_import_field_mappings).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS baseball_import_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  source_id UUID REFERENCES baseball_stat_sources(id) ON DELETE CASCADE,
  mapping_name TEXT NOT NULL,
  import_type TEXT NOT NULL,
  csv_header TEXT NOT NULL,
  canonical_field TEXT NOT NULL,
  transform_rule TEXT,
  unit TEXT,
  is_required BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_baseball_import_field_mappings_row
    UNIQUE (team_id, source_id, mapping_name, csv_header)
);
CREATE INDEX IF NOT EXISTS idx_baseball_import_field_mappings_team
  ON baseball_import_field_mappings(team_id);

-- ----------------------------------------------------------------------------
-- baseball_plate_appearances — PA grain; anchor for pitch/batted-ball events.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS baseball_plate_appearances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  game_id UUID REFERENCES baseball_games(id) ON DELETE SET NULL,
  practice_id UUID,
  batter_id UUID REFERENCES baseball_players(id) ON DELETE SET NULL,
  pitcher_id UUID REFERENCES baseball_players(id) ON DELETE SET NULL,
  pitcher_external_name TEXT,
  data_context TEXT NOT NULL DEFAULT 'official_game' CHECK (data_context IN (
    'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
    'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
  )),
  inning INTEGER,
  half TEXT CHECK (half IN ('top', 'bottom')),
  outs_before INTEGER,
  balls_before INTEGER,
  strikes_before INTEGER,
  base_state_before TEXT,
  score_diff_before INTEGER,
  lineup_slot INTEGER,
  result TEXT,
  rbi INTEGER,
  runs_scored INTEGER,
  is_quality_at_bat BOOLEAN,
  quality_at_bat_reasons JSONB,
  video_id UUID,
  import_run_id UUID REFERENCES baseball_import_runs(id) ON DELETE SET NULL,
  source_id UUID REFERENCES baseball_stat_sources(id) ON DELETE SET NULL,
  trust_tier TEXT NOT NULL DEFAULT 'unverified',
  visibility TEXT NOT NULL DEFAULT 'staff_only' CHECK (visibility IN (
    'staff_only', 'player_visible', 'restricted'
  )),
  measured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_baseball_pa_team_game
  ON baseball_plate_appearances(team_id, game_id);
CREATE INDEX IF NOT EXISTS idx_baseball_pa_batter
  ON baseball_plate_appearances(batter_id, data_context);
CREATE INDEX IF NOT EXISTS idx_baseball_pa_import
  ON baseball_plate_appearances(import_run_id);

-- ----------------------------------------------------------------------------
-- baseball_pitch_events — pitch grain (official PBP + bullpen + TrackMan/Rapsodo).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS baseball_pitch_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  game_id UUID REFERENCES baseball_games(id) ON DELETE SET NULL,
  practice_id UUID,
  plate_appearance_id UUID REFERENCES baseball_plate_appearances(id) ON DELETE SET NULL,
  pitcher_id UUID REFERENCES baseball_players(id) ON DELETE SET NULL,
  batter_id UUID REFERENCES baseball_players(id) ON DELETE SET NULL,
  catcher_id UUID REFERENCES baseball_players(id) ON DELETE SET NULL,
  data_context TEXT NOT NULL DEFAULT 'official_game' CHECK (data_context IN (
    'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
    'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
  )),
  pitch_number INTEGER,
  pitch_type TEXT,
  pitch_type_classified TEXT,
  pitch_call TEXT,
  pitch_result TEXT,
  velocity NUMERIC,
  spin_rate NUMERIC,
  spin_axis NUMERIC,
  spin_efficiency NUMERIC,
  seam_orientation TEXT,
  induced_vertical_break NUMERIC,
  horizontal_break NUMERIC,
  release_height NUMERIC,
  release_side NUMERIC,
  extension NUMERIC,
  plate_height NUMERIC,
  plate_side NUMERIC,
  zone INTEGER,
  intended_location TEXT,
  miss_distance NUMERIC,
  is_swing BOOLEAN,
  is_whiff BOOLEAN,
  is_chase BOOLEAN,
  is_called_strike BOOLEAN,
  is_in_zone BOOLEAN,
  count_state TEXT,
  batter_handedness TEXT CHECK (batter_handedness IN ('L', 'R', 'S')),
  video_id UUID,
  external_pitch_id TEXT,
  import_run_id UUID REFERENCES baseball_import_runs(id) ON DELETE SET NULL,
  source_id UUID REFERENCES baseball_stat_sources(id) ON DELETE SET NULL,
  trust_tier TEXT NOT NULL DEFAULT 'unverified',
  visibility TEXT NOT NULL DEFAULT 'staff_only' CHECK (visibility IN (
    'staff_only', 'player_visible', 'restricted'
  )),
  measured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_baseball_pitch_team_pitcher
  ON baseball_pitch_events(team_id, pitcher_id, data_context);
CREATE INDEX IF NOT EXISTS idx_baseball_pitch_batter
  ON baseball_pitch_events(batter_id, data_context);
CREATE INDEX IF NOT EXISTS idx_baseball_pitch_pa
  ON baseball_pitch_events(plate_appearance_id);
CREATE INDEX IF NOT EXISTS idx_baseball_pitch_import
  ON baseball_pitch_events(import_run_id);
-- Duplicate guard (V6 §Duplicate rules: pitch = source + external pitch id).
CREATE UNIQUE INDEX IF NOT EXISTS uq_baseball_pitch_external
  ON baseball_pitch_events(source_id, external_pitch_id)
  WHERE source_id IS NOT NULL AND external_pitch_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- baseball_batted_ball_events — contact-quality grain (EV/LA/spray).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS baseball_batted_ball_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  game_id UUID REFERENCES baseball_games(id) ON DELETE SET NULL,
  practice_id UUID,
  plate_appearance_id UUID REFERENCES baseball_plate_appearances(id) ON DELETE SET NULL,
  pitch_event_id UUID REFERENCES baseball_pitch_events(id) ON DELETE SET NULL,
  batter_id UUID REFERENCES baseball_players(id) ON DELETE SET NULL,
  pitcher_id UUID REFERENCES baseball_players(id) ON DELETE SET NULL,
  data_context TEXT NOT NULL DEFAULT 'official_game' CHECK (data_context IN (
    'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
    'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
  )),
  exit_velocity NUMERIC,
  launch_angle NUMERIC,
  spray_angle NUMERIC,
  distance NUMERIC,
  hang_time NUMERIC,
  batted_ball_type TEXT CHECK (batted_ball_type IN (
    'ground_ball', 'line_drive', 'fly_ball', 'popup'
  )),
  field_zone TEXT,
  is_hard_hit BOOLEAN,
  is_barrel BOOLEAN,
  is_sweet_spot BOOLEAN,
  result TEXT,
  pitch_type TEXT,
  video_id UUID,
  external_event_id TEXT,
  import_run_id UUID REFERENCES baseball_import_runs(id) ON DELETE SET NULL,
  source_id UUID REFERENCES baseball_stat_sources(id) ON DELETE SET NULL,
  trust_tier TEXT NOT NULL DEFAULT 'unverified',
  visibility TEXT NOT NULL DEFAULT 'staff_only' CHECK (visibility IN (
    'staff_only', 'player_visible', 'restricted'
  )),
  measured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_baseball_bb_team_batter
  ON baseball_batted_ball_events(team_id, batter_id, data_context);
CREATE INDEX IF NOT EXISTS idx_baseball_bb_pa
  ON baseball_batted_ball_events(plate_appearance_id);
CREATE INDEX IF NOT EXISTS idx_baseball_bb_import
  ON baseball_batted_ball_events(import_run_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_baseball_bb_external
  ON baseball_batted_ball_events(source_id, external_event_id)
  WHERE source_id IS NOT NULL AND external_event_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- baseball_swing_events — swing-sensor grain (Blast / Diamond Kinetics).
-- DEVELOPMENTAL, never official (V6 §Swing Sensor Stats).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS baseball_swing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  player_id UUID REFERENCES baseball_players(id) ON DELETE SET NULL,
  game_id UUID REFERENCES baseball_games(id) ON DELETE SET NULL,
  practice_id UUID,
  pitch_event_id UUID REFERENCES baseball_pitch_events(id) ON DELETE SET NULL,
  -- Swing sensors are developmental: context defaults to sensor, never official.
  data_context TEXT NOT NULL DEFAULT 'sensor' CHECK (data_context IN (
    'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
    'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
  )),
  bat_speed NUMERIC,
  attack_angle NUMERIC,
  vertical_bat_angle NUMERIC,
  on_plane_efficiency NUMERIC,
  time_to_contact NUMERIC,
  rotational_acceleration NUMERIC,
  connection_score NUMERIC,
  early_connection NUMERIC,
  connection_at_impact NUMERIC,
  peak_hand_speed NUMERIC,
  power_score NUMERIC,
  max_barrel_speed NUMERIC,
  max_acceleration NUMERIC,
  impact_momentum NUMERIC,
  contact_point TEXT,
  pitch_context TEXT,
  drill_context TEXT,
  video_id UUID,
  external_swing_id TEXT,
  import_run_id UUID REFERENCES baseball_import_runs(id) ON DELETE SET NULL,
  source_id UUID REFERENCES baseball_stat_sources(id) ON DELETE SET NULL,
  -- Swing-sensor trust ceiling is verified_vendor (a device export), not official.
  trust_tier TEXT NOT NULL DEFAULT 'unverified'
    CHECK (trust_tier <> 'official'),
  visibility TEXT NOT NULL DEFAULT 'staff_only' CHECK (visibility IN (
    'staff_only', 'player_visible', 'restricted'
  )),
  measured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_baseball_swing_team_player
  ON baseball_swing_events(team_id, player_id, data_context);
CREATE INDEX IF NOT EXISTS idx_baseball_swing_import
  ON baseball_swing_events(import_run_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_baseball_swing_external
  ON baseball_swing_events(source_id, external_swing_id)
  WHERE source_id IS NOT NULL AND external_swing_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- baseball_fielding_events — defensive event grain (V6 §Fielding).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS baseball_fielding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  game_id UUID REFERENCES baseball_games(id) ON DELETE SET NULL,
  practice_id UUID,
  player_id UUID REFERENCES baseball_players(id) ON DELETE SET NULL,
  data_context TEXT NOT NULL DEFAULT 'official_game' CHECK (data_context IN (
    'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
    'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
  )),
  position TEXT,
  event_type TEXT,
  chance_difficulty TEXT,
  result TEXT,
  error_type TEXT,
  throw_velocity NUMERIC,
  exchange_time NUMERIC,
  arm_accuracy TEXT,
  route_grade TEXT,
  footwork_grade TEXT,
  communication_grade TEXT,
  field_x NUMERIC,
  field_y NUMERIC,
  video_id UUID,
  external_event_id TEXT,
  import_run_id UUID REFERENCES baseball_import_runs(id) ON DELETE SET NULL,
  source_id UUID REFERENCES baseball_stat_sources(id) ON DELETE SET NULL,
  trust_tier TEXT NOT NULL DEFAULT 'unverified',
  visibility TEXT NOT NULL DEFAULT 'staff_only' CHECK (visibility IN (
    'staff_only', 'player_visible', 'restricted'
  )),
  measured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_baseball_field_team_player
  ON baseball_fielding_events(team_id, player_id, data_context);
CREATE INDEX IF NOT EXISTS idx_baseball_field_import
  ON baseball_fielding_events(import_run_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_baseball_field_external
  ON baseball_fielding_events(source_id, external_event_id)
  WHERE source_id IS NOT NULL AND external_event_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- baseball_catching_events — catcher event grain (V6 §Catching).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS baseball_catching_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  game_id UUID REFERENCES baseball_games(id) ON DELETE SET NULL,
  practice_id UUID,
  catcher_id UUID REFERENCES baseball_players(id) ON DELETE SET NULL,
  pitcher_id UUID REFERENCES baseball_players(id) ON DELETE SET NULL,
  pitch_event_id UUID REFERENCES baseball_pitch_events(id) ON DELETE SET NULL,
  data_context TEXT NOT NULL DEFAULT 'official_game' CHECK (data_context IN (
    'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
    'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
  )),
  event_type TEXT CHECK (event_type IN (
    'receive', 'block', 'throwdown', 'game_call', 'mound_visit'
  )),
  pop_time NUMERIC,
  exchange_time NUMERIC,
  throw_velocity NUMERIC,
  throw_accuracy TEXT,
  block_result TEXT,
  framing_result TEXT,
  steal_result TEXT,
  video_id UUID,
  external_event_id TEXT,
  import_run_id UUID REFERENCES baseball_import_runs(id) ON DELETE SET NULL,
  source_id UUID REFERENCES baseball_stat_sources(id) ON DELETE SET NULL,
  trust_tier TEXT NOT NULL DEFAULT 'unverified',
  visibility TEXT NOT NULL DEFAULT 'staff_only' CHECK (visibility IN (
    'staff_only', 'player_visible', 'restricted'
  )),
  measured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_baseball_catch_team_catcher
  ON baseball_catching_events(team_id, catcher_id, data_context);
CREATE INDEX IF NOT EXISTS idx_baseball_catch_import
  ON baseball_catching_events(import_run_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_baseball_catch_external
  ON baseball_catching_events(source_id, external_event_id)
  WHERE source_id IS NOT NULL AND external_event_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- baseball_baserunning_events — baserunning event grain (V6 §Baserunning).
-- (Not in V6 §"Tables To Add" by name, but the stat universe enumerates the
--  fields and the V10 Speed/Decision Board needs an event grain — added here as
--  a first-class sibling rather than overloading stat_facts.)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS baseball_baserunning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  game_id UUID REFERENCES baseball_games(id) ON DELETE SET NULL,
  practice_id UUID,
  runner_id UUID REFERENCES baseball_players(id) ON DELETE SET NULL,
  data_context TEXT NOT NULL DEFAULT 'official_game' CHECK (data_context IN (
    'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
    'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
  )),
  event_type TEXT,
  result TEXT,
  lead_size NUMERIC,
  jump_time NUMERIC,
  home_to_first NUMERIC,
  first_to_third NUMERIC,
  second_to_home NUMERIC,
  sixty_time NUMERIC,
  sprint_speed NUMERIC,
  decision_quality TEXT,
  video_id UUID,
  external_event_id TEXT,
  import_run_id UUID REFERENCES baseball_import_runs(id) ON DELETE SET NULL,
  source_id UUID REFERENCES baseball_stat_sources(id) ON DELETE SET NULL,
  trust_tier TEXT NOT NULL DEFAULT 'unverified',
  visibility TEXT NOT NULL DEFAULT 'staff_only' CHECK (visibility IN (
    'staff_only', 'player_visible', 'restricted'
  )),
  measured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_baseball_baserun_team_runner
  ON baseball_baserunning_events(team_id, runner_id, data_context);
CREATE INDEX IF NOT EXISTS idx_baseball_baserun_import
  ON baseball_baserunning_events(import_run_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_baseball_baserun_external
  ON baseball_baserunning_events(source_id, external_event_id)
  WHERE source_id IS NOT NULL AND external_event_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- baseball_workload_events — pitch/throw/lift workload grain (V6 §Workload).
-- Powers Pitcher Workload Overlay + Catcher Workload Board.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS baseball_workload_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  player_id UUID REFERENCES baseball_players(id) ON DELETE SET NULL,
  game_id UUID REFERENCES baseball_games(id) ON DELETE SET NULL,
  practice_id UUID,
  event_date DATE NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'game_pitches', 'bullpen', 'flat_ground', 'long_toss', 'catch_play',
    'position_throwing', 'lift', 'sprint', 'recovery'
  )),
  count INTEGER,
  high_intent_count INTEGER,
  duration_minutes INTEGER,
  intensity TEXT,
  rpe NUMERIC,
  notes TEXT,
  import_run_id UUID REFERENCES baseball_import_runs(id) ON DELETE SET NULL,
  source_id UUID REFERENCES baseball_stat_sources(id) ON DELETE SET NULL,
  trust_tier TEXT NOT NULL DEFAULT 'unverified',
  visibility TEXT NOT NULL DEFAULT 'staff_only' CHECK (visibility IN (
    'staff_only', 'player_visible', 'restricted'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_baseball_workload_team_player_date
  ON baseball_workload_events(team_id, player_id, event_date);
CREATE INDEX IF NOT EXISTS idx_baseball_workload_import
  ON baseball_workload_events(import_run_id);

-- ----------------------------------------------------------------------------
-- baseball_video_events — index video without owning storage (V6 §Video events).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS baseball_video_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  player_id UUID REFERENCES baseball_players(id) ON DELETE SET NULL,
  video_id UUID,
  external_video_url TEXT,
  game_id UUID REFERENCES baseball_games(id) ON DELETE SET NULL,
  practice_id UUID,
  plate_appearance_id UUID REFERENCES baseball_plate_appearances(id) ON DELETE SET NULL,
  pitch_event_id UUID REFERENCES baseball_pitch_events(id) ON DELETE SET NULL,
  swing_event_id UUID REFERENCES baseball_swing_events(id) ON DELETE SET NULL,
  data_context TEXT NOT NULL DEFAULT 'video' CHECK (data_context IN (
    'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
    'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
  )),
  clip_start_time NUMERIC,
  clip_end_time NUMERIC,
  tag_family TEXT,
  tags JSONB,
  coach_annotation TEXT,
  player_response TEXT,
  linked_task_id UUID,
  linked_insight_id UUID,
  import_run_id UUID REFERENCES baseball_import_runs(id) ON DELETE SET NULL,
  source_id UUID REFERENCES baseball_stat_sources(id) ON DELETE SET NULL,
  trust_tier TEXT NOT NULL DEFAULT 'coach_reviewed',
  visibility TEXT NOT NULL DEFAULT 'staff_only' CHECK (visibility IN (
    'staff_only', 'player_visible', 'restricted'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_baseball_video_team_player
  ON baseball_video_events(team_id, player_id);
CREATE INDEX IF NOT EXISTS idx_baseball_video_import
  ON baseball_video_events(import_run_id);

-- ----------------------------------------------------------------------------
-- baseball_stat_facts — generic source-linked metric facts (V6 §baseball_stat_facts).
-- The escape hatch so a new vendor metric is never blocked on a bespoke table;
-- product-critical metrics get promoted into the structured tables above.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS baseball_stat_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  player_id UUID REFERENCES baseball_players(id) ON DELETE SET NULL,
  game_id UUID REFERENCES baseball_games(id) ON DELETE SET NULL,
  event_id UUID,
  practice_id UUID,
  video_id UUID,
  import_run_id UUID REFERENCES baseball_import_runs(id) ON DELETE SET NULL,
  source_id UUID REFERENCES baseball_stat_sources(id) ON DELETE SET NULL,
  data_context TEXT NOT NULL DEFAULT 'manual' CHECK (data_context IN (
    'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
    'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
  )),
  metric_key TEXT NOT NULL,
  metric_value_numeric NUMERIC,
  metric_value_text TEXT,
  metric_value_json JSONB,
  unit TEXT,
  context JSONB,
  measured_at TIMESTAMPTZ,
  trust_tier TEXT NOT NULL DEFAULT 'unverified',
  visibility TEXT NOT NULL DEFAULT 'staff_only' CHECK (visibility IN (
    'staff_only', 'player_visible', 'restricted'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_baseball_facts_team_player_metric
  ON baseball_stat_facts(team_id, player_id, metric_key);
CREATE INDEX IF NOT EXISTS idx_baseball_facts_import
  ON baseball_stat_facts(import_run_id);

-- ----------------------------------------------------------------------------
-- baseball_player_development_metrics — periodic development snapshots
-- (V6 §"Player development metrics" + §Derived insights). One row per player per
-- metric per as-of date per context: a calculated, source-attributed snapshot
-- (chase_rate, zone_contact_rate, hard_hit_rate, csw, fastball_shape_consistency,
-- game_vs_cage_gap, etc.). Kept distinct from official season stats so a coach
-- can see "development metrics" separately from "official record".
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS baseball_player_development_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES baseball_players(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  metric_group TEXT CHECK (metric_group IN (
    'hitting', 'pitching', 'catching', 'fielding', 'baserunning',
    'swing', 'readiness', 'workload', 'composite'
  )),
  data_context TEXT NOT NULL DEFAULT 'official_game' CHECK (data_context IN (
    'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
    'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
  )),
  as_of_date DATE NOT NULL,
  window_label TEXT,
  value_numeric NUMERIC,
  sample_size INTEGER,
  -- honest confidence (V10 source confidence model + zip non-negotiable: never
  -- emit a false "high"). 'high' requires meaningful sample at higher tiers.
  confidence TEXT NOT NULL DEFAULT 'low' CHECK (confidence IN (
    'high', 'medium', 'low', 'insufficient'
  )),
  trust_tier TEXT NOT NULL DEFAULT 'inferred',
  percentile NUMERIC,
  source_id UUID REFERENCES baseball_stat_sources(id) ON DELETE SET NULL,
  import_run_id UUID REFERENCES baseball_import_runs(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL DEFAULT 'staff_only' CHECK (visibility IN (
    'staff_only', 'player_visible', 'restricted'
  )),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_baseball_dev_metric_snapshot
    UNIQUE (team_id, player_id, metric_key, data_context, as_of_date)
);
CREATE INDEX IF NOT EXISTS idx_baseball_dev_metrics_player
  ON baseball_player_development_metrics(player_id, metric_key, as_of_date);
CREATE INDEX IF NOT EXISTS idx_baseball_dev_metrics_team_group
  ON baseball_player_development_metrics(team_id, metric_group);

-- ============================================================================
-- RLS — enable + team-scoped policies for every new table.
-- Reuses the 0050 capability helpers. Pattern:
--   * Event tables (pitch/PA/batted-ball/swing/fielding/catching/baserunning/
--     workload/video/facts): STAFF read/write scoped by can_view_baseball_player
--     on the row's primary player; PLAYER reads ONLY their own rows that are NOT
--     staff_only. Writes are staff-only (service_role bypasses for imports/AI).
--   * Sources + field mappings: gated on can_manage_imports.
--   * Development metrics: staff read scoped; player reads own player_visible.
-- ============================================================================

-- Helper inline note: "primary player" of a row differs per table; each block
-- names the correct column. All blocks are to_regclass-guarded.

-- ---- baseball_stat_sources (import capability) ----
DO $$
BEGIN
  IF to_regclass('public.baseball_stat_sources') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_stat_sources ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_stat_sources_select" ON public.baseball_stat_sources';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_stat_sources_insert" ON public.baseball_stat_sources';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_stat_sources_update" ON public.baseball_stat_sources';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_stat_sources_delete" ON public.baseball_stat_sources';
    -- Any team staff may READ the registry (needed to render source chips); only
    -- import-capable staff may mutate it.
    EXECUTE $p$CREATE POLICY "baseball_stat_sources_select" ON public.baseball_stat_sources
      FOR SELECT TO authenticated
      USING (public.is_baseball_team_staff(team_id))$p$;
    EXECUTE $p$CREATE POLICY "baseball_stat_sources_insert" ON public.baseball_stat_sources
      FOR INSERT TO authenticated
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))$p$;
    EXECUTE $p$CREATE POLICY "baseball_stat_sources_update" ON public.baseball_stat_sources
      FOR UPDATE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))$p$;
    EXECUTE $p$CREATE POLICY "baseball_stat_sources_delete" ON public.baseball_stat_sources
      FOR DELETE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))$p$;
  END IF;
END $$;

-- ---- baseball_import_field_mappings (import capability) ----
DO $$
BEGIN
  IF to_regclass('public.baseball_import_field_mappings') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_import_field_mappings ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_import_field_mappings_select" ON public.baseball_import_field_mappings';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_import_field_mappings_insert" ON public.baseball_import_field_mappings';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_import_field_mappings_update" ON public.baseball_import_field_mappings';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_import_field_mappings_delete" ON public.baseball_import_field_mappings';
    EXECUTE $p$CREATE POLICY "baseball_import_field_mappings_select" ON public.baseball_import_field_mappings
      FOR SELECT TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))$p$;
    EXECUTE $p$CREATE POLICY "baseball_import_field_mappings_insert" ON public.baseball_import_field_mappings
      FOR INSERT TO authenticated
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))$p$;
    EXECUTE $p$CREATE POLICY "baseball_import_field_mappings_update" ON public.baseball_import_field_mappings
      FOR UPDATE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))
      WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))$p$;
    EXECUTE $p$CREATE POLICY "baseball_import_field_mappings_delete" ON public.baseball_import_field_mappings
      FOR DELETE TO authenticated
      USING (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))$p$;
  END IF;
END $$;

-- Generic event-table policy emitter: STAFF read+write scoped by the named
-- player column; PLAYER reads own non-staff_only rows. Applied per table below.
DO $$
DECLARE
  rec RECORD;
  tbl text;
  pcol text;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('baseball_plate_appearances', 'batter_id'),
      ('baseball_pitch_events',      'pitcher_id'),
      ('baseball_batted_ball_events','batter_id'),
      ('baseball_swing_events',      'player_id'),
      ('baseball_fielding_events',   'player_id'),
      ('baseball_catching_events',   'catcher_id'),
      ('baseball_baserunning_events','runner_id'),
      ('baseball_workload_events',   'player_id'),
      ('baseball_video_events',      'player_id'),
      ('baseball_stat_facts',        'player_id')
    ) AS t(tbl, pcol)
  LOOP
    tbl  := rec.tbl;
    pcol := rec.pcol;
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_select', tbl);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_insert', tbl);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_update', tbl);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_delete', tbl);

      -- SELECT: staff (coach-gated) can_view the row's player; OR the player
      -- themselves on their own rows that are not staff_only.
      EXECUTE format($f$CREATE POLICY %I ON public.%I
        FOR SELECT TO authenticated
        USING (
          (public.get_my_coach_id() IS NOT NULL
            AND public.can_view_baseball_player(team_id, %I))
          OR (%I = public.get_my_baseball_player_id()
            AND visibility <> 'staff_only')
        )$f$, tbl || '_select', tbl, pcol, pcol);

      -- INSERT/UPDATE/DELETE: staff-only (coach-gated, can_view the player).
      EXECUTE format($f$CREATE POLICY %I ON public.%I
        FOR INSERT TO authenticated
        WITH CHECK (public.get_my_coach_id() IS NOT NULL
          AND public.can_view_baseball_player(team_id, %I))$f$,
        tbl || '_insert', tbl, pcol);
      EXECUTE format($f$CREATE POLICY %I ON public.%I
        FOR UPDATE TO authenticated
        USING (public.get_my_coach_id() IS NOT NULL
          AND public.can_view_baseball_player(team_id, %I))
        WITH CHECK (public.get_my_coach_id() IS NOT NULL
          AND public.can_view_baseball_player(team_id, %I))$f$,
        tbl || '_update', tbl, pcol, pcol);
      EXECUTE format($f$CREATE POLICY %I ON public.%I
        FOR DELETE TO authenticated
        USING (public.get_my_coach_id() IS NOT NULL
          AND public.can_view_baseball_player(team_id, %I))$f$,
        tbl || '_delete', tbl, pcol);
    END IF;
  END LOOP;
END $$;

-- ---- baseball_player_development_metrics (staff read scoped; player own player_visible) ----
DO $$
BEGIN
  IF to_regclass('public.baseball_player_development_metrics') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_player_development_metrics ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_player_development_metrics_select" ON public.baseball_player_development_metrics';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_player_development_metrics_insert" ON public.baseball_player_development_metrics';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_player_development_metrics_update" ON public.baseball_player_development_metrics';
    EXECUTE 'DROP POLICY IF EXISTS "baseball_player_development_metrics_delete" ON public.baseball_player_development_metrics';
    EXECUTE $p$CREATE POLICY "baseball_player_development_metrics_select" ON public.baseball_player_development_metrics
      FOR SELECT TO authenticated
      USING (
        (public.get_my_coach_id() IS NOT NULL
          AND public.can_view_baseball_player(team_id, player_id))
        OR (player_id = public.get_my_baseball_player_id()
          AND visibility = 'player_visible')
      )$p$;
    EXECUTE $p$CREATE POLICY "baseball_player_development_metrics_insert" ON public.baseball_player_development_metrics
      FOR INSERT TO authenticated
      WITH CHECK (public.get_my_coach_id() IS NOT NULL
        AND public.can_view_baseball_player(team_id, player_id))$p$;
    EXECUTE $p$CREATE POLICY "baseball_player_development_metrics_update" ON public.baseball_player_development_metrics
      FOR UPDATE TO authenticated
      USING (public.get_my_coach_id() IS NOT NULL
        AND public.can_view_baseball_player(team_id, player_id))
      WITH CHECK (public.get_my_coach_id() IS NOT NULL
        AND public.can_view_baseball_player(team_id, player_id))$p$;
    EXECUTE $p$CREATE POLICY "baseball_player_development_metrics_delete" ON public.baseball_player_development_metrics
      FOR DELETE TO authenticated
      USING (public.get_my_coach_id() IS NOT NULL
        AND public.can_view_baseball_player(team_id, player_id))$p$;
  END IF;
END $$;

-- ============================================================================
-- END — elite stat EVENT model. ADDITIVE. RLS-complete. NOT applied to any DB.
-- ============================================================================
