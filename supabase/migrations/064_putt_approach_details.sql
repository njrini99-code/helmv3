-- ============================================================================
-- Migration 064: Putt + Approach Miss Detail Tables
-- Adds detailed shot metadata tables with RLS and updated_at triggers.
-- ============================================================================

-- ============================================================================
-- 1. putt_details
-- ============================================================================

CREATE TABLE IF NOT EXISTS putt_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shot_id uuid NOT NULL REFERENCES golf_shots(id) ON DELETE CASCADE,
  miss_tags text[] DEFAULT '{}',
  break_direction text CHECK (break_direction IN ('left_to_right', 'right_to_left', 'straight', 'multiple')),
  estimated_break_inches integer CHECK (estimated_break_inches >= 0 AND estimated_break_inches <= 48),
  distance_feet numeric CHECK (distance_feet >= 0 AND distance_feet <= 200),
  made boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  CONSTRAINT putt_details_shot_id_unique UNIQUE (shot_id)
);

CREATE INDEX IF NOT EXISTS idx_putt_details_shot_id ON putt_details(shot_id);

DROP TRIGGER IF EXISTS update_putt_details_updated_at ON putt_details;
CREATE TRIGGER update_putt_details_updated_at
  BEFORE UPDATE ON putt_details
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE putt_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "putt_details_select_own" ON putt_details;
DROP POLICY IF EXISTS "putt_details_select_team" ON putt_details;
DROP POLICY IF EXISTS "putt_details_insert_own" ON putt_details;
DROP POLICY IF EXISTS "putt_details_update_own" ON putt_details;
DROP POLICY IF EXISTS "putt_details_delete_own" ON putt_details;

-- Players can view their own putt details
CREATE POLICY "putt_details_select_own"
ON putt_details FOR SELECT TO authenticated
USING (
  shot_id IN (
    SELECT gs.id FROM golf_shots gs
    JOIN golf_holes gh ON gh.id = gs.hole_id
    JOIN golf_rounds gr ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
);

-- Coaches can view putt details for players in their organization
CREATE POLICY "putt_details_select_team"
ON putt_details FOR SELECT TO authenticated
USING (
  shot_id IN (
    SELECT gs.id FROM golf_shots gs
    JOIN golf_holes gh ON gh.id = gs.hole_id
    JOIN golf_rounds gr ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    JOIN golf_team_members gtm ON gtm.player_id = gp.id
    JOIN golf_teams gt ON gt.id = gtm.team_id
    JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
    WHERE gc.user_id = auth.uid()
  )
);

CREATE POLICY "putt_details_insert_own"
ON putt_details FOR INSERT TO authenticated
WITH CHECK (
  shot_id IN (
    SELECT gs.id FROM golf_shots gs
    JOIN golf_holes gh ON gh.id = gs.hole_id
    JOIN golf_rounds gr ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
);

CREATE POLICY "putt_details_update_own"
ON putt_details FOR UPDATE TO authenticated
USING (
  shot_id IN (
    SELECT gs.id FROM golf_shots gs
    JOIN golf_holes gh ON gh.id = gs.hole_id
    JOIN golf_rounds gr ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
)
WITH CHECK (
  shot_id IN (
    SELECT gs.id FROM golf_shots gs
    JOIN golf_holes gh ON gh.id = gs.hole_id
    JOIN golf_rounds gr ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
);

CREATE POLICY "putt_details_delete_own"
ON putt_details FOR DELETE TO authenticated
USING (
  shot_id IN (
    SELECT gs.id FROM golf_shots gs
    JOIN golf_holes gh ON gh.id = gs.hole_id
    JOIN golf_rounds gr ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON putt_details TO authenticated;

-- ============================================================================
-- 2. approach_miss_details
-- ============================================================================

CREATE TABLE IF NOT EXISTS approach_miss_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shot_id uuid NOT NULL REFERENCES golf_shots(id) ON DELETE CASCADE,
  miss_direction text CHECK (miss_direction IN (
    'short', 'long', 'left', 'right',
    'short_left', 'short_right', 'long_left', 'long_right'
  )),
  lie_type text CHECK (lie_type IN ('fairway', 'rough', 'sand', 'recovery', 'hazard')),
  distance_from_green_yards numeric CHECK (distance_from_green_yards >= 0),
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  CONSTRAINT approach_miss_details_shot_id_unique UNIQUE (shot_id)
);

CREATE INDEX IF NOT EXISTS idx_approach_miss_details_shot_id ON approach_miss_details(shot_id);

DROP TRIGGER IF EXISTS update_approach_miss_details_updated_at ON approach_miss_details;
CREATE TRIGGER update_approach_miss_details_updated_at
  BEFORE UPDATE ON approach_miss_details
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE approach_miss_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approach_miss_details_select_own" ON approach_miss_details;
DROP POLICY IF EXISTS "approach_miss_details_select_team" ON approach_miss_details;
DROP POLICY IF EXISTS "approach_miss_details_insert_own" ON approach_miss_details;
DROP POLICY IF EXISTS "approach_miss_details_update_own" ON approach_miss_details;
DROP POLICY IF EXISTS "approach_miss_details_delete_own" ON approach_miss_details;

-- Players can view their own approach miss details
CREATE POLICY "approach_miss_details_select_own"
ON approach_miss_details FOR SELECT TO authenticated
USING (
  shot_id IN (
    SELECT gs.id FROM golf_shots gs
    JOIN golf_holes gh ON gh.id = gs.hole_id
    JOIN golf_rounds gr ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
);

-- Coaches can view approach miss details for players in their organization
CREATE POLICY "approach_miss_details_select_team"
ON approach_miss_details FOR SELECT TO authenticated
USING (
  shot_id IN (
    SELECT gs.id FROM golf_shots gs
    JOIN golf_holes gh ON gh.id = gs.hole_id
    JOIN golf_rounds gr ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    JOIN golf_team_members gtm ON gtm.player_id = gp.id
    JOIN golf_teams gt ON gt.id = gtm.team_id
    JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
    WHERE gc.user_id = auth.uid()
  )
);

CREATE POLICY "approach_miss_details_insert_own"
ON approach_miss_details FOR INSERT TO authenticated
WITH CHECK (
  shot_id IN (
    SELECT gs.id FROM golf_shots gs
    JOIN golf_holes gh ON gh.id = gs.hole_id
    JOIN golf_rounds gr ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
);

CREATE POLICY "approach_miss_details_update_own"
ON approach_miss_details FOR UPDATE TO authenticated
USING (
  shot_id IN (
    SELECT gs.id FROM golf_shots gs
    JOIN golf_holes gh ON gh.id = gs.hole_id
    JOIN golf_rounds gr ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
)
WITH CHECK (
  shot_id IN (
    SELECT gs.id FROM golf_shots gs
    JOIN golf_holes gh ON gh.id = gs.hole_id
    JOIN golf_rounds gr ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
);

CREATE POLICY "approach_miss_details_delete_own"
ON approach_miss_details FOR DELETE TO authenticated
USING (
  shot_id IN (
    SELECT gs.id FROM golf_shots gs
    JOIN golf_holes gh ON gh.id = gs.hole_id
    JOIN golf_rounds gr ON gr.id = gh.round_id
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gp.user_id = auth.uid()
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON approach_miss_details TO authenticated;
