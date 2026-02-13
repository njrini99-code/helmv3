-- Backfill golf_rounds.team_id for rounds that were created without it.
-- The saveRoundDraft() function previously omitted team_id, so some rounds
-- have NULL team_id. This sets it from the player's active team membership.

-- Ensure column exists (may have been added outside migrations)
ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES golf_teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_golf_rounds_team ON golf_rounds(team_id) WHERE team_id IS NOT NULL;

UPDATE golf_rounds gr
SET team_id = (
  SELECT gtm.team_id FROM golf_team_members gtm
  WHERE gtm.player_id = gr.player_id AND gtm.status = 'active' LIMIT 1
)
WHERE gr.team_id IS NULL
  AND EXISTS (
    SELECT 1 FROM golf_team_members gtm
    WHERE gtm.player_id = gr.player_id AND gtm.status = 'active'
  );
