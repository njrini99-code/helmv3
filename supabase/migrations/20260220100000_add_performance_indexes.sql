-- Performance indexes for hot query patterns
-- Applied: 2026-02-20

CREATE INDEX IF NOT EXISTS idx_golf_messages_conversation_created
  ON golf_messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_golf_events_start_time
  ON golf_events(start_time)
  WHERE start_time IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_holes_round_order
  ON golf_holes(round_id, hole_number);

CREATE INDEX IF NOT EXISTS idx_golf_rounds_team_created
  ON golf_rounds(team_id, created_at DESC)
  WHERE team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golf_coach_insights_player_created
  ON golf_coach_insights(player_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_golf_predictions_player_created
  ON golf_predictions(player_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_golf_round_reviews_player_created
  ON golf_round_reviews(player_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_golf_conversations_team_updated
  ON golf_conversations(team_id, updated_at DESC);
