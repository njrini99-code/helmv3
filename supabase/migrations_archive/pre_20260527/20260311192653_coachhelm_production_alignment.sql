-- CoachHelm production alignment
-- Restores live tables still required by the V2 engine and backfills
-- settings rows so coach-scoped RLS and application code agree.

BEGIN;

-- Keep coach settings rows fully linked to their owning coach/user/team.
UPDATE golf_coachhelm_settings AS gcs
SET
  user_id = gc.user_id,
  team_id = COALESCE(gcs.team_id, gt.id)
FROM golf_coaches AS gc
LEFT JOIN golf_teams AS gt
  ON gt.organization_id = gc.organization_id
WHERE gcs.coach_id = gc.id
  AND (
    gcs.user_id IS DISTINCT FROM gc.user_id
    OR (gcs.team_id IS NULL AND gt.id IS NOT NULL)
  );

CREATE TABLE IF NOT EXISTS golf_causal_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES golf_players(id) ON DELETE CASCADE,
  team_id UUID REFERENCES golf_teams(id) ON DELETE CASCADE,
  cause TEXT NOT NULL,
  cause_metric TEXT,
  effect TEXT NOT NULL,
  effect_metric TEXT,
  relationship_type TEXT NOT NULL
    CHECK (relationship_type IN ('direct', 'mediated', 'moderated', 'bidirectional')),
  strength NUMERIC(5,4) NOT NULL DEFAULT 0,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
  mechanism TEXT NOT NULL,
  confounders JSONB NOT NULL DEFAULT '[]'::jsonb,
  dose_response BOOLEAN NOT NULL DEFAULT FALSE,
  intervention_potential NUMERIC(5,4) NOT NULL DEFAULT 0,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_causal_relationships_player
  ON golf_causal_relationships(player_id);

CREATE INDEX IF NOT EXISTS idx_golf_causal_relationships_team
  ON golf_causal_relationships(team_id)
  WHERE team_id IS NOT NULL;

ALTER TABLE golf_causal_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "golf_causal_relationships_select_player" ON golf_causal_relationships;
CREATE POLICY "golf_causal_relationships_select_player"
ON golf_causal_relationships FOR SELECT
USING (
  player_id IN (
    SELECT gp.id
    FROM golf_players AS gp
    WHERE gp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "golf_causal_relationships_select_coach" ON golf_causal_relationships;
CREATE POLICY "golf_causal_relationships_select_coach"
ON golf_causal_relationships FOR SELECT
USING (
  player_id IN (
    SELECT gp.id
    FROM golf_players AS gp
    JOIN golf_team_members AS gtm ON gtm.player_id = gp.id
    JOIN golf_teams AS gt ON gt.id = gtm.team_id
    JOIN golf_coaches AS gc ON gc.organization_id = gt.organization_id
    WHERE gc.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "golf_causal_relationships_service_role_all" ON golf_causal_relationships;
CREATE POLICY "golf_causal_relationships_service_role_all"
ON golf_causal_relationships FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_golf_causal_relationships_timestamp ON golf_causal_relationships;
CREATE TRIGGER update_golf_causal_relationships_timestamp
  BEFORE UPDATE ON golf_causal_relationships
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS golf_confidence_calibration (
  bucket NUMERIC(3,1) NOT NULL,
  prediction_type TEXT NOT NULL,
  predictions_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  actual_accuracy NUMERIC(5,4) NOT NULL DEFAULT 0,
  sample_size INTEGER NOT NULL DEFAULT 0,
  calibration_error NUMERIC(5,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bucket, prediction_type)
);

ALTER TABLE golf_confidence_calibration ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "golf_confidence_calibration_service_role_all" ON golf_confidence_calibration;
CREATE POLICY "golf_confidence_calibration_service_role_all"
ON golf_confidence_calibration FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "golf_confidence_calibration_admin_read_all" ON golf_confidence_calibration;
CREATE POLICY "golf_confidence_calibration_admin_read_all"
ON golf_confidence_calibration FOR SELECT
USING (is_admin());

DROP TRIGGER IF EXISTS update_golf_confidence_calibration_timestamp ON golf_confidence_calibration;
CREATE TRIGGER update_golf_confidence_calibration_timestamp
  BEFORE UPDATE ON golf_confidence_calibration
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMIT;
