-- ============================================================================
-- Add Missing Indexes for Performance
-- ============================================================================

-- Users table
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Videos table
CREATE INDEX IF NOT EXISTS idx_videos_player ON videos(player_id);
CREATE INDEX IF NOT EXISTS idx_videos_primary ON videos(player_id, is_primary) WHERE is_primary = TRUE;

-- Messages table
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

-- Notifications table
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, created_at DESC) WHERE read = FALSE;

-- Conversation participants
CREATE INDEX IF NOT EXISTS idx_conv_participants_user ON conversation_participants(user_id);

-- Watchlists
CREATE INDEX IF NOT EXISTS idx_watchlists_stage ON watchlists(coach_id, pipeline_stage);

-- Player comparisons - GIN index for array searches
CREATE INDEX IF NOT EXISTS idx_comparisons_players ON player_comparisons USING gin(player_ids);
