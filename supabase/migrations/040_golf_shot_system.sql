-- Migration 040: Golf Shot System Enhancement
-- Enhances golf_shots table and creates stats cache tables for the comprehensive calculator
-- Reference: src/lib/utils/golf-stats-calculator-shots.ts (1693 lines, 100+ calculated metrics)

-- ============================================================================
-- 1. ALTER golf_shots table - Add missing columns for RawShot interface
-- ============================================================================

-- club_type is needed for strokes gained calculation (driver vs non_driver vs putter)
-- Reference: STROKES_GAINED_BENCHMARKS in calculator uses club_type for lookup
ALTER TABLE golf_shots ADD COLUMN IF NOT EXISTS club_type TEXT;
COMMENT ON COLUMN golf_shots.club_type IS 'driver | non_driver | putter - used for strokes gained benchmarks';

-- Separate distance units for before/after (calculator normalizes yards/feet)
-- The calculator uses normalizeToYards() and normalizeToFeet() based on these
ALTER TABLE golf_shots ADD COLUMN IF NOT EXISTS distance_unit_before TEXT DEFAULT 'yards';
ALTER TABLE golf_shots ADD COLUMN IF NOT EXISTS distance_unit_after TEXT DEFAULT 'yards';
COMMENT ON COLUMN golf_shots.distance_unit_before IS 'yards | feet - unit for distance_to_hole_before';
COMMENT ON COLUMN golf_shots.distance_unit_after IS 'yards | feet - unit for distance_to_hole_after';

-- miss_direction for approach shot analysis
-- Used in calculateApproachMissStats() for tracking miss patterns
ALTER TABLE golf_shots ADD COLUMN IF NOT EXISTS miss_direction TEXT;
COMMENT ON COLUMN golf_shots.miss_direction IS 'left | right | short | long - for approach miss tracking';

-- Add updated_at for data integrity if not exists
ALTER TABLE golf_shots ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ---------------------------------------------------------------------------
-- Backfill columns that prod has (added via Supabase dashboard before the
-- migration backfill discipline was enforced) but no migration declares.
-- Without these idempotent adds, fresh `supabase start` fails when the
-- CHECK constraints + indexes below reference them (SQLSTATE 42703),
-- which silently breaks every CI pgTAP suite. `IF NOT EXISTS` makes these
-- no-ops on prod and column creations on fresh stacks.
--
-- Discovered via CI failure on PR #94 / #95 / #96 (2026-05-26). FK on
-- round_id is intentionally omitted here — prod already has it; fresh
-- stacks just need the column for the constraint/index to compile.
-- ---------------------------------------------------------------------------
ALTER TABLE golf_shots ADD COLUMN IF NOT EXISTS shot_type TEXT;
ALTER TABLE golf_shots ADD COLUMN IF NOT EXISTS lie_before TEXT;
ALTER TABLE golf_shots ADD COLUMN IF NOT EXISTS putt_break TEXT;
ALTER TABLE golf_shots ADD COLUMN IF NOT EXISTS round_id UUID;
ALTER TABLE golf_shots ADD COLUMN IF NOT EXISTS hole_number INTEGER;

COMMENT ON COLUMN golf_shots.shot_type IS 'tee | approach | around_green | putting | penalty — see CHECK constraint below.';
COMMENT ON COLUMN golf_shots.lie_before IS 'tee | fairway | rough | sand | green | other — see CHECK constraint below.';
COMMENT ON COLUMN golf_shots.putt_break IS 'left_to_right | right_to_left | straight | multiple — see CHECK constraint below.';

-- Convert `result` from enum to text. In prod this column was changed
-- to TEXT via dashboard so the wider value set in the CHECK constraint
-- below ('fairway' | 'rough' | 'sand' | 'green' | 'hole' | 'other' |
-- 'penalty') would fit. In fresh stacks it's still the original enum
-- `golf_shot_result` from migration 001 ('excellent' | 'good' |
-- 'average' | 'poor' | 'miss'), and the constraint below rejects
-- 'fairway' with SQLSTATE 22P02. Guarded so prod (already TEXT) is a
-- no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'golf_shots'
      AND column_name = 'result'
      AND udt_name = 'golf_shot_result'
  ) THEN
    ALTER TABLE golf_shots ALTER COLUMN result TYPE TEXT USING result::text;
  END IF;
END $$;

-- Migrate existing distance_unit data to new columns if needed.
-- Guarded with information_schema so fresh CI databases (which never
-- had the legacy `distance_unit` column) don't fail at SQLSTATE 42703.
-- Production already ran this UPDATE successfully when the column
-- existed; the guard is for fresh `supabase start` runs.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'golf_shots'
      AND column_name = 'distance_unit'
  ) THEN
    EXECUTE $migrate$
      UPDATE golf_shots
      SET distance_unit_before = COALESCE(distance_unit, 'yards'),
          distance_unit_after = COALESCE(distance_unit, 'yards')
      WHERE distance_unit_before IS NULL OR distance_unit_after IS NULL
    $migrate$;
  END IF;
END $$;

-- ============================================================================
-- 2. Add CHECK constraints for enum validation
-- These ensure data integrity matches the TypeScript types in RawShot interface
-- ============================================================================

-- shot_type: 'tee' | 'approach' | 'around_green' | 'putting' | 'penalty'
ALTER TABLE golf_shots DROP CONSTRAINT IF EXISTS golf_shots_shot_type_check;
ALTER TABLE golf_shots ADD CONSTRAINT golf_shots_shot_type_check
  CHECK (shot_type IS NULL OR shot_type IN ('tee', 'approach', 'around_green', 'putting', 'penalty'));

-- club_type: 'driver' | 'non_driver' | 'putter'
ALTER TABLE golf_shots DROP CONSTRAINT IF EXISTS golf_shots_club_type_check;
ALTER TABLE golf_shots ADD CONSTRAINT golf_shots_club_type_check
  CHECK (club_type IS NULL OR club_type IN ('driver', 'non_driver', 'putter'));

-- lie_before: 'tee' | 'fairway' | 'rough' | 'sand' | 'green' | 'other'
ALTER TABLE golf_shots DROP CONSTRAINT IF EXISTS golf_shots_lie_before_check;
ALTER TABLE golf_shots ADD CONSTRAINT golf_shots_lie_before_check
  CHECK (lie_before IS NULL OR lie_before IN ('tee', 'fairway', 'rough', 'sand', 'green', 'other'));

-- result: 'fairway' | 'rough' | 'sand' | 'green' | 'hole' | 'other' | 'penalty'
ALTER TABLE golf_shots DROP CONSTRAINT IF EXISTS golf_shots_result_check;
ALTER TABLE golf_shots ADD CONSTRAINT golf_shots_result_check
  CHECK (result IS NULL OR result IN ('fairway', 'rough', 'sand', 'green', 'hole', 'other', 'penalty'));

-- putt_break: 'left_to_right' | 'right_to_left' | 'straight' | 'multiple'
ALTER TABLE golf_shots DROP CONSTRAINT IF EXISTS golf_shots_putt_break_check;
ALTER TABLE golf_shots ADD CONSTRAINT golf_shots_putt_break_check
  CHECK (putt_break IS NULL OR putt_break IN ('left_to_right', 'right_to_left', 'straight', 'multiple'));

-- distance_unit_before: 'yards' | 'feet'
ALTER TABLE golf_shots DROP CONSTRAINT IF EXISTS golf_shots_distance_unit_before_check;
ALTER TABLE golf_shots ADD CONSTRAINT golf_shots_distance_unit_before_check
  CHECK (distance_unit_before IS NULL OR distance_unit_before IN ('yards', 'feet'));

-- distance_unit_after: 'yards' | 'feet'
ALTER TABLE golf_shots DROP CONSTRAINT IF EXISTS golf_shots_distance_unit_after_check;
ALTER TABLE golf_shots ADD CONSTRAINT golf_shots_distance_unit_after_check
  CHECK (distance_unit_after IS NULL OR distance_unit_after IN ('yards', 'feet'));

-- ============================================================================
-- 3. Performance indexes for stats calculation queries
-- These optimize the heavy queries used in calculateStatsFromShots()
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_golf_shots_round_hole ON golf_shots(round_id, hole_number);
CREATE INDEX IF NOT EXISTS idx_golf_shots_shot_type ON golf_shots(shot_type);
CREATE INDEX IF NOT EXISTS idx_golf_shots_round_created ON golf_shots(round_id, created_at);
CREATE INDEX IF NOT EXISTS idx_golf_shots_lie_before ON golf_shots(lie_before);
CREATE INDEX IF NOT EXISTS idx_golf_shots_result ON golf_shots(result);

-- ============================================================================
-- 4. golf_player_stats_cache - Stores calculated GolfStats interface metrics
-- Reference: GolfStats interface in calculator (100+ fields)
-- This caches expensive calculations for quick retrieval
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_player_stats_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,

  -- ========== Scoring Stats ==========
  scoring_average NUMERIC(5,2),
  scoring_average_vs_par NUMERIC(5,2),
  rounds_played INTEGER DEFAULT 0,
  best_round INTEGER,
  worst_round INTEGER,

  -- ========== Par Performance (averages by par) ==========
  par3_average NUMERIC(5,2),
  par4_average NUMERIC(5,2),
  par5_average NUMERIC(5,2),

  -- ========== Scoring Distribution ==========
  eagles INTEGER DEFAULT 0,
  birdies INTEGER DEFAULT 0,
  pars INTEGER DEFAULT 0,
  bogeys INTEGER DEFAULT 0,
  double_bogeys INTEGER DEFAULT 0,
  triple_plus INTEGER DEFAULT 0,

  -- ========== Strokes Gained (PGA Tour benchmarks) ==========
  -- Reference: STROKES_GAINED_BENCHMARKS in calculator
  strokes_gained_total NUMERIC(5,2),
  strokes_gained_tee NUMERIC(5,2),
  strokes_gained_approach NUMERIC(5,2),
  strokes_gained_around_green NUMERIC(5,2),
  strokes_gained_putting NUMERIC(5,2),

  -- ========== Driving ==========
  driving_accuracy_percentage NUMERIC(5,2),
  fairways_hit INTEGER DEFAULT 0,
  fairways_total INTEGER DEFAULT 0,
  driving_distance_average NUMERIC(6,1),

  -- ========== Approach / GIR ==========
  gir_percentage NUMERIC(5,2),
  greens_hit INTEGER DEFAULT 0,
  greens_total INTEGER DEFAULT 0,
  approach_proximity_average NUMERIC(6,1),

  -- ========== Short Game ==========
  scrambling_percentage NUMERIC(5,2),
  scrambles_converted INTEGER DEFAULT 0,
  scramble_attempts INTEGER DEFAULT 0,
  sand_save_percentage NUMERIC(5,2),
  sand_saves INTEGER DEFAULT 0,
  sand_attempts INTEGER DEFAULT 0,
  up_and_down_percentage NUMERIC(5,2),

  -- ========== Putting Overall ==========
  putts_per_round NUMERIC(4,2),
  putts_per_gir NUMERIC(4,2),
  one_putt_percentage NUMERIC(5,2),
  three_putt_percentage NUMERIC(5,2),
  total_putts INTEGER DEFAULT 0,

  -- ========== Putting by Distance ==========
  -- Reference: calculatePuttingByDistance() in calculator
  putt_make_pct_0_3ft NUMERIC(5,2),
  putt_make_pct_3_5ft NUMERIC(5,2),
  putt_make_pct_5_10ft NUMERIC(5,2),
  putt_make_pct_10_15ft NUMERIC(5,2),
  putt_make_pct_15_20ft NUMERIC(5,2),
  putt_make_pct_20_plus_ft NUMERIC(5,2),

  -- ========== Putting by Break Type ==========
  -- Reference: PuttingBreakStats interface in calculator
  putt_make_pct_left_to_right NUMERIC(5,2),
  putt_make_pct_right_to_left NUMERIC(5,2),
  putt_make_pct_straight NUMERIC(5,2),

  -- ========== Penalties ==========
  penalty_strokes_per_round NUMERIC(4,2),
  total_penalties INTEGER DEFAULT 0,

  -- ========== Approach Miss Patterns ==========
  approach_miss_left_pct NUMERIC(5,2),
  approach_miss_right_pct NUMERIC(5,2),
  approach_miss_short_pct NUMERIC(5,2),
  approach_miss_long_pct NUMERIC(5,2),

  -- ========== Metadata ==========
  last_round_date DATE,
  rounds_in_calculation INTEGER DEFAULT 0,
  calculation_period_start DATE,
  calculation_period_end DATE,
  engine_version TEXT DEFAULT 'v2',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(player_id)
);

CREATE INDEX IF NOT EXISTS idx_golf_player_stats_cache_player ON golf_player_stats_cache(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_player_stats_cache_updated ON golf_player_stats_cache(updated_at DESC);

-- ============================================================================
-- 5. golf_round_stats_cache - Per-round calculated stats
-- Used for quick round review lookups without recalculating
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_round_stats_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES golf_rounds(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,

  -- ========== Basic Scoring ==========
  total_score INTEGER,
  score_to_par INTEGER,
  front_nine INTEGER,
  back_nine INTEGER,

  -- ========== Strokes Gained for this Round ==========
  strokes_gained_total NUMERIC(5,2),
  strokes_gained_tee NUMERIC(5,2),
  strokes_gained_approach NUMERIC(5,2),
  strokes_gained_around_green NUMERIC(5,2),
  strokes_gained_putting NUMERIC(5,2),

  -- ========== Driving this Round ==========
  fairways_hit INTEGER,
  fairways_total INTEGER,
  driving_distance_avg NUMERIC(6,1),

  -- ========== GIR this Round ==========
  greens_hit INTEGER,
  greens_total INTEGER,

  -- ========== Putting this Round ==========
  total_putts INTEGER,
  one_putts INTEGER,
  three_putts INTEGER,

  -- ========== Scrambling this Round ==========
  scrambles_converted INTEGER,
  scramble_attempts INTEGER,
  sand_saves INTEGER,
  sand_attempts INTEGER,

  -- ========== Scoring Distribution ==========
  eagles INTEGER DEFAULT 0,
  birdies INTEGER DEFAULT 0,
  pars INTEGER DEFAULT 0,
  bogeys INTEGER DEFAULT 0,
  double_bogeys INTEGER DEFAULT 0,
  triple_plus INTEGER DEFAULT 0,

  -- ========== Penalties ==========
  penalty_strokes INTEGER DEFAULT 0,

  -- ========== Full Stats JSON ==========
  -- Stores complete GolfStats output for detailed analysis
  detailed_stats JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(round_id)
);

CREATE INDEX IF NOT EXISTS idx_golf_round_stats_cache_round ON golf_round_stats_cache(round_id);
CREATE INDEX IF NOT EXISTS idx_golf_round_stats_cache_player ON golf_round_stats_cache(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_round_stats_cache_player_date ON golf_round_stats_cache(player_id, created_at DESC);

-- ============================================================================
-- 6. golf_putting_tendencies - Putting patterns by break type
-- Reference: PuttingBreakStats interface in calculator
-- Used for coaching insights about player weaknesses
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_putting_tendencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,

  -- ========== Overall Tendencies ==========
  total_putts_analyzed INTEGER DEFAULT 0,
  make_percentage_overall NUMERIC(5,2),

  -- ========== By Break Type ==========
  -- Left to right breaks
  left_to_right_attempts INTEGER DEFAULT 0,
  left_to_right_made INTEGER DEFAULT 0,
  left_to_right_pct NUMERIC(5,2),

  -- Right to left breaks
  right_to_left_attempts INTEGER DEFAULT 0,
  right_to_left_made INTEGER DEFAULT 0,
  right_to_left_pct NUMERIC(5,2),

  -- Straight putts
  straight_attempts INTEGER DEFAULT 0,
  straight_made INTEGER DEFAULT 0,
  straight_pct NUMERIC(5,2),

  -- ========== Miss Tendencies ==========
  miss_left_percentage NUMERIC(5,2),
  miss_right_percentage NUMERIC(5,2),
  miss_short_percentage NUMERIC(5,2),
  miss_long_percentage NUMERIC(5,2),

  -- ========== Distance Tendencies ==========
  avg_distance_on_makes_ft NUMERIC(5,1),
  avg_distance_on_misses_ft NUMERIC(5,1),

  -- ========== Pressure Putting (inside 5 feet) ==========
  short_putt_attempts INTEGER DEFAULT 0,
  short_putt_made INTEGER DEFAULT 0,
  short_putt_pct NUMERIC(5,2),

  -- ========== Metadata ==========
  last_calculated TIMESTAMPTZ,
  rounds_in_sample INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(player_id)
);

CREATE INDEX IF NOT EXISTS idx_golf_putting_tendencies_player ON golf_putting_tendencies(player_id);

-- ============================================================================
-- 7. RLS Policies for stats cache tables
-- ============================================================================

-- golf_player_stats_cache RLS
ALTER TABLE golf_player_stats_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view own stats" ON golf_player_stats_cache
  FOR SELECT TO authenticated
  USING (
    player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
  );

CREATE POLICY "Coaches can view team player stats" ON golf_player_stats_cache
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players p
      JOIN golf_coaches c ON c.team_id = p.team_id
      WHERE p.id = golf_player_stats_cache.player_id
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can manage team stats cache" ON golf_player_stats_cache
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players p
      JOIN golf_coaches c ON c.team_id = p.team_id
      WHERE p.id = golf_player_stats_cache.player_id
      AND c.user_id = auth.uid()
    )
  );

-- golf_round_stats_cache RLS
ALTER TABLE golf_round_stats_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view own round stats" ON golf_round_stats_cache
  FOR SELECT TO authenticated
  USING (
    player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
  );

CREATE POLICY "Coaches can view team round stats" ON golf_round_stats_cache
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players p
      JOIN golf_coaches c ON c.team_id = p.team_id
      WHERE p.id = golf_round_stats_cache.player_id
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can manage round stats cache" ON golf_round_stats_cache
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players p
      JOIN golf_coaches c ON c.team_id = p.team_id
      WHERE p.id = golf_round_stats_cache.player_id
      AND c.user_id = auth.uid()
    )
  );

-- golf_putting_tendencies RLS
ALTER TABLE golf_putting_tendencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view own putting tendencies" ON golf_putting_tendencies
  FOR SELECT TO authenticated
  USING (
    player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
  );

CREATE POLICY "Coaches can view team putting tendencies" ON golf_putting_tendencies
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players p
      JOIN golf_coaches c ON c.team_id = p.team_id
      WHERE p.id = golf_putting_tendencies.player_id
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can manage putting tendencies" ON golf_putting_tendencies
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_players p
      JOIN golf_coaches c ON c.team_id = p.team_id
      WHERE p.id = golf_putting_tendencies.player_id
      AND c.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 8. Update triggers for updated_at
-- ============================================================================

-- Trigger for golf_shots updated_at
DROP TRIGGER IF EXISTS update_golf_shots_updated_at ON golf_shots;
CREATE TRIGGER update_golf_shots_updated_at
    BEFORE UPDATE ON golf_shots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for golf_player_stats_cache updated_at
DROP TRIGGER IF EXISTS update_golf_player_stats_cache_updated_at ON golf_player_stats_cache;
CREATE TRIGGER update_golf_player_stats_cache_updated_at
    BEFORE UPDATE ON golf_player_stats_cache
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for golf_round_stats_cache updated_at
DROP TRIGGER IF EXISTS update_golf_round_stats_cache_updated_at ON golf_round_stats_cache;
CREATE TRIGGER update_golf_round_stats_cache_updated_at
    BEFORE UPDATE ON golf_round_stats_cache
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for golf_putting_tendencies updated_at
DROP TRIGGER IF EXISTS update_golf_putting_tendencies_updated_at ON golf_putting_tendencies;
CREATE TRIGGER update_golf_putting_tendencies_updated_at
    BEFORE UPDATE ON golf_putting_tendencies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
