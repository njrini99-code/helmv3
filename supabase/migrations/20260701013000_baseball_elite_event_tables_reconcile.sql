-- ============================================================================
-- Migration: 20260701013000_baseball_elite_event_tables_reconcile.sql
-- Packet: elite-stats (BaseballHelm — stats-integrations)
--
-- PROBLEM: 20260624000080_baseball_elite_stat_event_model.sql defines the rich
-- pitch/batted-ball/swing event tables (data_context, trust_tier, visibility,
-- source_id, import_run_id, measured_at, external ids, the full V6 metric set)
-- but that migration ran as a no-op against pre-existing THIN
-- baseball_pitch_events / baseball_batted_ball_events / baseball_swing_events
-- tables (which instead use player_id, hit_distance, hit_result, source_refs,
-- etc.). The result: the concrete-adapter loader
-- (src/app/baseball/actions/stat-event-imports.ts applyEventImportPlan, ~line
-- 697-709 baseRow + row.fields from src/lib/baseball/adapters/event-rows.ts)
-- writes column names the LIVE tables never grew — pitcher_id, batter_id,
-- data_context, trust_tier, visibility, source_id, import_run_id, measured_at,
-- external_pitch_id/external_event_id/external_swing_id, and most of the
-- per-grain metric fields — so every insert 42703's and is silently counted
-- into `skipped` (see the app-side fix in the same PR that surfaces this
-- instead of swallowing it).
--
-- This migration reconciles the 3 elite event-grain tables to exactly what the
-- loader writes, verified against LIVE information_schema.columns (not
-- migration history, which is drifted). Every column below is (a) written by
-- the loader today and (b) confirmed MISSING on the live table. Types are
-- taken from 20260624000080's original definitions. Pre-existing thin-schema
-- columns (player_id, pa_id, hit_distance, hit_result, source_refs,
-- source_trust_level, contact_rate, chase_swing, etc.) are left untouched —
-- this is additive reconciliation, not a redesign.
--
-- Also closes the matching gap in 20260624000080's dup-guard unique indexes
-- (uq_baseball_pitch_external / uq_baseball_bb_external /
-- uq_baseball_swing_external), which never landed for the same reason and are
-- required for the commit path's supersede-lookup + dedupe
-- (applyEventImportPlan's `.eq(extCol, row.externalEventId).is('superseded_by_run_id', null)`
-- check, ~stat-event-imports.ts:712-719) to behave as a real duplicate guard
-- rather than relying on app-level races.
--
-- Live-verified via information_schema.columns / pg_indexes / pg_constraint
-- (2026-07-01): all 3 tables have zero rows, so NOT NULL DEFAULT columns below
-- backfill instantly and safely.
--
-- SAFETY CONTRACT (CLAUDE.md hard rules):
--   * ADDITIVE ONLY. ADD COLUMN IF NOT EXISTS / CREATE UNIQUE INDEX IF NOT
--     EXISTS. No DROP of any existing column, index, or data.
--   * No RLS policy changes (tables already have RLS from the thin schema —
--     out of scope here) and NO grants to anon.
--   * Idempotent / safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- baseball_pitch_events — add the primary FK the loader writes (pitcher_id;
-- the live table only has player_id) + the full provenance envelope + the
-- pitch-shape metric fields CanonicalPitchRow.fields carries that the thin
-- schema never grew.
-- ----------------------------------------------------------------------------
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS pitcher_id UUID REFERENCES baseball_players(id) ON DELETE SET NULL;
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS data_context TEXT NOT NULL DEFAULT 'official_game'
    CHECK (data_context IN (
      'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
      'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
    ));
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS pitch_call TEXT;
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS pitch_result TEXT;
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS spin_axis NUMERIC;
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS spin_efficiency NUMERIC;
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS induced_vertical_break NUMERIC;
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS horizontal_break NUMERIC;
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS release_height NUMERIC;
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS release_side NUMERIC;
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS extension NUMERIC;
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS plate_height NUMERIC;
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS plate_side NUMERIC;
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS is_in_zone BOOLEAN;
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS is_swing BOOLEAN;
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS is_whiff BOOLEAN;
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS batter_handedness TEXT CHECK (batter_handedness IN ('L', 'R', 'S'));
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS external_pitch_id TEXT;
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS import_run_id UUID REFERENCES baseball_import_runs(id) ON DELETE SET NULL;
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES baseball_stat_sources(id) ON DELETE SET NULL;
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS trust_tier TEXT NOT NULL DEFAULT 'unverified'
    CHECK (trust_tier IN (
      'official', 'verified_vendor', 'coach_reviewed', 'player_submitted',
      'unverified', 'inferred'
    ));
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'staff_only'
    CHECK (visibility IN ('staff_only', 'player_visible', 'restricted'));
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS measured_at TIMESTAMPTZ;

-- Duplicate guard (20260624000080 ~line 243, never applied — the commit
-- writer's supersede-lookup + dedupe rely on this).
CREATE UNIQUE INDEX IF NOT EXISTS uq_baseball_pitch_external
  ON baseball_pitch_events(source_id, external_pitch_id)
  WHERE source_id IS NOT NULL AND external_pitch_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- baseball_batted_ball_events — add batter_id (live only has player_id) + the
-- provenance envelope + the batted-ball fields the loader writes that the
-- thin schema names differently (distance/result vs hit_distance/hit_result)
-- or never had (hang_time, is_hard_hit, is_barrel, is_sweet_spot, pitch_type).
-- ----------------------------------------------------------------------------
ALTER TABLE baseball_batted_ball_events
  ADD COLUMN IF NOT EXISTS batter_id UUID REFERENCES baseball_players(id) ON DELETE SET NULL;
ALTER TABLE baseball_batted_ball_events
  ADD COLUMN IF NOT EXISTS data_context TEXT NOT NULL DEFAULT 'official_game'
    CHECK (data_context IN (
      'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
      'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
    ));
ALTER TABLE baseball_batted_ball_events
  ADD COLUMN IF NOT EXISTS distance NUMERIC;
ALTER TABLE baseball_batted_ball_events
  ADD COLUMN IF NOT EXISTS hang_time NUMERIC;
ALTER TABLE baseball_batted_ball_events
  ADD COLUMN IF NOT EXISTS is_hard_hit BOOLEAN;
ALTER TABLE baseball_batted_ball_events
  ADD COLUMN IF NOT EXISTS is_barrel BOOLEAN;
ALTER TABLE baseball_batted_ball_events
  ADD COLUMN IF NOT EXISTS is_sweet_spot BOOLEAN;
ALTER TABLE baseball_batted_ball_events
  ADD COLUMN IF NOT EXISTS result TEXT;
ALTER TABLE baseball_batted_ball_events
  ADD COLUMN IF NOT EXISTS pitch_type TEXT;
ALTER TABLE baseball_batted_ball_events
  ADD COLUMN IF NOT EXISTS external_event_id TEXT;
ALTER TABLE baseball_batted_ball_events
  ADD COLUMN IF NOT EXISTS import_run_id UUID REFERENCES baseball_import_runs(id) ON DELETE SET NULL;
ALTER TABLE baseball_batted_ball_events
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES baseball_stat_sources(id) ON DELETE SET NULL;
ALTER TABLE baseball_batted_ball_events
  ADD COLUMN IF NOT EXISTS trust_tier TEXT NOT NULL DEFAULT 'unverified'
    CHECK (trust_tier IN (
      'official', 'verified_vendor', 'coach_reviewed', 'player_submitted',
      'unverified', 'inferred'
    ));
ALTER TABLE baseball_batted_ball_events
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'staff_only'
    CHECK (visibility IN ('staff_only', 'player_visible', 'restricted'));
ALTER TABLE baseball_batted_ball_events
  ADD COLUMN IF NOT EXISTS measured_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_baseball_bb_external
  ON baseball_batted_ball_events(source_id, external_event_id)
  WHERE source_id IS NOT NULL AND external_event_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- baseball_swing_events — add game_id (missing entirely on the live table,
-- unlike pitch/batted-ball which already have it) + the provenance envelope +
-- the full swing-sensor metric set CanonicalSwingRow.fields carries.
-- ----------------------------------------------------------------------------
ALTER TABLE baseball_swing_events
  ADD COLUMN IF NOT EXISTS game_id UUID REFERENCES baseball_games(id) ON DELETE SET NULL;
ALTER TABLE baseball_swing_events
  ADD COLUMN IF NOT EXISTS data_context TEXT NOT NULL DEFAULT 'sensor'
    CHECK (data_context IN (
      'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
      'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
    ));
ALTER TABLE baseball_swing_events
  ADD COLUMN IF NOT EXISTS vertical_bat_angle NUMERIC;
ALTER TABLE baseball_swing_events
  ADD COLUMN IF NOT EXISTS on_plane_efficiency NUMERIC;
ALTER TABLE baseball_swing_events
  ADD COLUMN IF NOT EXISTS time_to_contact NUMERIC;
ALTER TABLE baseball_swing_events
  ADD COLUMN IF NOT EXISTS rotational_acceleration NUMERIC;
ALTER TABLE baseball_swing_events
  ADD COLUMN IF NOT EXISTS connection_score NUMERIC;
ALTER TABLE baseball_swing_events
  ADD COLUMN IF NOT EXISTS early_connection NUMERIC;
ALTER TABLE baseball_swing_events
  ADD COLUMN IF NOT EXISTS connection_at_impact NUMERIC;
ALTER TABLE baseball_swing_events
  ADD COLUMN IF NOT EXISTS peak_hand_speed NUMERIC;
ALTER TABLE baseball_swing_events
  ADD COLUMN IF NOT EXISTS power_score NUMERIC;
ALTER TABLE baseball_swing_events
  ADD COLUMN IF NOT EXISTS max_barrel_speed NUMERIC;
ALTER TABLE baseball_swing_events
  ADD COLUMN IF NOT EXISTS max_acceleration NUMERIC;
ALTER TABLE baseball_swing_events
  ADD COLUMN IF NOT EXISTS impact_momentum NUMERIC;
ALTER TABLE baseball_swing_events
  ADD COLUMN IF NOT EXISTS contact_point TEXT;
ALTER TABLE baseball_swing_events
  ADD COLUMN IF NOT EXISTS external_swing_id TEXT;
ALTER TABLE baseball_swing_events
  ADD COLUMN IF NOT EXISTS import_run_id UUID REFERENCES baseball_import_runs(id) ON DELETE SET NULL;
ALTER TABLE baseball_swing_events
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES baseball_stat_sources(id) ON DELETE SET NULL;
-- Swing-sensor trust ceiling is verified_vendor (a device export), never
-- official — same constraint 20260624000080 defined for this table.
ALTER TABLE baseball_swing_events
  ADD COLUMN IF NOT EXISTS trust_tier TEXT NOT NULL DEFAULT 'unverified'
    CHECK (trust_tier <> 'official');
ALTER TABLE baseball_swing_events
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'staff_only'
    CHECK (visibility IN ('staff_only', 'player_visible', 'restricted'));
ALTER TABLE baseball_swing_events
  ADD COLUMN IF NOT EXISTS measured_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_baseball_swing_external
  ON baseball_swing_events(source_id, external_swing_id)
  WHERE source_id IS NOT NULL AND external_swing_id IS NOT NULL;

-- ============================================================================
-- END — elite event-table reconciliation. ADDITIVE. NOT applied to any DB
-- (per standing rule: this file is authored only; the parent applies it).
-- ============================================================================
