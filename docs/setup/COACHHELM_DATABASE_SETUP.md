# CoachHelm Database Setup

## Step 1: Run this SQL in Supabase

Go to your Supabase Dashboard → SQL Editor → New Query, then copy/paste and run this:

```sql
-- TABLE: golf_coach_insights
CREATE TABLE IF NOT EXISTS golf_coach_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES golf_coaches(id) ON DELETE CASCADE,
  team_id UUID REFERENCES golf_teams(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'scoring_decline', 'stat_regression', 'tournament_pressure', 'plateau',
    'bubble_player', 'surge_player', 'streak', 'recurring_weakness',
    'closing_holes', 'par_3_issues', 'team_trend', 'roster_recommendation'
  )),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  player_id UUID REFERENCES golf_players(id) ON DELETE CASCADE,
  round_id UUID REFERENCES golf_rounds(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  recommendation TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'dismissed')),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  CONSTRAINT coach_insights_player_check CHECK (
    (insight_type IN ('team_trend', 'roster_recommendation') AND player_id IS NULL) OR
    (insight_type NOT IN ('team_trend', 'roster_recommendation') AND player_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_coach_insights_coach ON golf_coach_insights(coach_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coach_insights_player ON golf_coach_insights(player_id, status) WHERE player_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coach_insights_active ON golf_coach_insights(coach_id, status) WHERE status = 'active';

-- TABLE: golf_player_focus_areas
CREATE TABLE IF NOT EXISTS golf_player_focus_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES golf_coaches(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'ball_striking', 'short_game', 'putting', 'course_management', 'mental_game', 'tournament_performance'
  )),
  priority_rank INTEGER NOT NULL CHECK (priority_rank BETWEEN 1 AND 5),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  specific_drills TEXT[],
  current_performance JSONB DEFAULT '{}'::jsonb,
  target_improvement TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'in_progress', 'improved', 'archived')),
  progress_notes TEXT,
  is_auto_generated BOOLEAN NOT NULL DEFAULT TRUE,
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, category)
);

CREATE INDEX IF NOT EXISTS idx_player_focus_areas_player ON golf_player_focus_areas(player_id, status, priority_rank);

-- TABLE: golf_insight_generation_log
CREATE TABLE IF NOT EXISTS golf_insight_generation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES golf_coaches(id) ON DELETE CASCADE,
  generation_type TEXT NOT NULL CHECK (generation_type IN ('manual', 'scheduled', 'triggered')),
  trigger_event TEXT,
  insights_created INTEGER NOT NULL DEFAULT 0,
  focus_areas_updated INTEGER NOT NULL DEFAULT 0,
  players_analyzed INTEGER NOT NULL DEFAULT 0,
  execution_time_ms INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABLE: golf_player_performance_snapshots
CREATE TABLE IF NOT EXISTS golf_player_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  rounds_in_period INTEGER NOT NULL DEFAULT 0,
  scoring_average DECIMAL(5,2),
  best_round INTEGER,
  worst_round INTEGER,
  stats JSONB DEFAULT '{}'::jsonb,
  trend_direction TEXT CHECK (trend_direction IN ('improving', 'declining', 'stable', 'insufficient_data')),
  trend_magnitude DECIMAL(4,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_performance_snapshots_player ON golf_player_performance_snapshots(player_id, snapshot_date DESC);

-- RLS POLICIES
ALTER TABLE golf_coach_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_player_focus_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_insight_generation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_player_performance_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches can view own insights" ON golf_coach_insights;
CREATE POLICY "Coaches can view own insights" ON golf_coach_insights FOR SELECT
  USING (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Coaches can update own insights" ON golf_coach_insights;
CREATE POLICY "Coaches can update own insights" ON golf_coach_insights FOR UPDATE
  USING (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "System can insert insights" ON golf_coach_insights;
CREATE POLICY "System can insert insights" ON golf_coach_insights FOR INSERT
  WITH CHECK (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Players can view own focus areas" ON golf_player_focus_areas;
CREATE POLICY "Players can view own focus areas" ON golf_player_focus_areas FOR SELECT
  USING (
    player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
    OR coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Coaches can manage player focus areas" ON golf_player_focus_areas;
CREATE POLICY "Coaches can manage player focus areas" ON golf_player_focus_areas FOR ALL
  USING (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Coaches can view own generation log" ON golf_insight_generation_log;
CREATE POLICY "Coaches can view own generation log" ON golf_insight_generation_log FOR SELECT
  USING (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "System can insert generation log" ON golf_insight_generation_log;
CREATE POLICY "System can insert generation log" ON golf_insight_generation_log FOR INSERT
  WITH CHECK (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view relevant snapshots" ON golf_player_performance_snapshots;
CREATE POLICY "Users can view relevant snapshots" ON golf_player_performance_snapshots FOR SELECT
  USING (
    player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
    OR player_id IN (
      SELECT gp.id FROM golf_players gp
      JOIN golf_coaches gc ON gp.team_id = gc.team_id
      WHERE gc.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "System can manage snapshots" ON golf_player_performance_snapshots;
CREATE POLICY "System can manage snapshots" ON golf_player_performance_snapshots FOR ALL
  USING (
    player_id IN (
      SELECT gp.id FROM golf_players gp
      JOIN golf_coaches gc ON gp.team_id = gc.team_id
      WHERE gc.user_id = auth.uid()
    )
  );
```

## Step 2: Verify Tables Created

Run this query to check:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE 'golf_%insight%' 
  OR table_name LIKE 'golf_%focus%';
```

You should see:
- `golf_coach_insights`
- `golf_player_focus_areas`
- `golf_insight_generation_log`
- `golf_player_performance_snapshots`

## Next Steps

After running the migration, the TypeScript types and insight generation logic will be built next.
