-- ============================================================================
-- Migration: 043_critical_fixes.sql
-- Purpose: Critical fixes identified by comprehensive audit
-- Note: Applied as 4 separate migrations via Supabase MCP:
--   - 043_golf_messaging_rpc
--   - 044_golf_rls_fixes
--   - 045_column_fixes
--   - 046_player_putt_tendencies_view
-- ============================================================================

-- PART 1: GOLF MESSAGING RPC FUNCTION
CREATE OR REPLACE FUNCTION get_golf_conversations_with_details(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  creator_id UUID,
  last_message_content TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_sender_id UUID,
  unread_count BIGINT,
  participant_ids UUID[],
  participant_names TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.created_at,
    c.updated_at,
    c.created_by AS creator_id,
    (
      SELECT m.content FROM golf_messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC LIMIT 1
    ) AS last_message_content,
    (
      SELECT m.created_at FROM golf_messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC LIMIT 1
    ) AS last_message_at,
    (
      SELECT m.sender_id FROM golf_messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC LIMIT 1
    ) AS last_message_sender_id,
    (
      SELECT COUNT(*) FROM golf_messages m
      WHERE m.conversation_id = c.id
        AND m.read = FALSE
        AND m.sender_id != p_user_id
    ) AS unread_count,
    ARRAY(
      SELECT cp2.user_id FROM golf_conversation_participants cp2
      WHERE cp2.conversation_id = c.id
    ) AS participant_ids,
    ARRAY(
      SELECT COALESCE(u.email, 'Unknown')
      FROM golf_conversation_participants cp2
      JOIN users u ON u.id = cp2.user_id
      WHERE cp2.conversation_id = c.id
    ) AS participant_names
  FROM golf_conversations c
  JOIN golf_conversation_participants cp ON cp.conversation_id = c.id
  WHERE cp.user_id = p_user_id
  ORDER BY c.updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_golf_conversations_with_details IS 'Get golf conversations with details - optimized single query';

-- PART 2: PLAYER PUTT TENDENCIES VIEW
CREATE OR REPLACE VIEW player_putt_tendencies AS
SELECT
  gpt.id,
  gpt.player_id,
  gpt.total_putts_analyzed,
  gpt.make_percentage_overall,
  gpt.left_to_right_attempts,
  gpt.left_to_right_made,
  gpt.left_to_right_pct,
  gpt.right_to_left_attempts,
  gpt.right_to_left_made,
  gpt.right_to_left_pct,
  gpt.straight_attempts,
  gpt.straight_made,
  gpt.straight_pct,
  gpt.miss_left_percentage,
  gpt.miss_right_percentage,
  gpt.miss_short_percentage,
  gpt.miss_long_percentage,
  gpt.avg_distance_on_makes_ft,
  gpt.avg_distance_on_misses_ft,
  gpt.short_putt_attempts,
  gpt.short_putt_made,
  gpt.short_putt_pct,
  gpt.last_calculated,
  gpt.rounds_in_sample,
  gpt.created_at,
  gpt.updated_at,
  gp.first_name,
  gp.last_name,
  gp.user_id
FROM golf_putting_tendencies gpt
JOIN golf_players gp ON gp.id = gpt.player_id;

COMMENT ON VIEW player_putt_tendencies IS 'View combining putting tendencies with player info';

-- PART 3: GOLF_PLAYER_INSIGHTS RLS POLICIES
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'golf_player_insights') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Players view own insights' AND tablename = 'golf_player_insights') THEN
      CREATE POLICY "Players view own insights" ON golf_player_insights
        FOR SELECT TO authenticated
        USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Coaches view team insights' AND tablename = 'golf_player_insights') THEN
      CREATE POLICY "Coaches view team insights" ON golf_player_insights
        FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM golf_players p
            JOIN golf_coaches c ON c.team_id = p.team_id
            WHERE p.id = golf_player_insights.player_id
            AND c.user_id = auth.uid()
          )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Coaches create team insights' AND tablename = 'golf_player_insights') THEN
      CREATE POLICY "Coaches create team insights" ON golf_player_insights
        FOR INSERT TO authenticated
        WITH CHECK (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Coaches update own insights' AND tablename = 'golf_player_insights') THEN
      CREATE POLICY "Coaches update own insights" ON golf_player_insights
        FOR UPDATE TO authenticated
        USING (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()))
        WITH CHECK (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Coaches delete own insights' AND tablename = 'golf_player_insights') THEN
      CREATE POLICY "Coaches delete own insights" ON golf_player_insights
        FOR DELETE TO authenticated
        USING (coach_id IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));
    END IF;
  END IF;
END $$;

-- PART 4: GOLF_RECURRING_EVENTS RLS
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'golf_recurring_events') THEN
    ALTER TABLE golf_recurring_events ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Team members view recurring events' AND tablename = 'golf_recurring_events') THEN
      CREATE POLICY "Team members view recurring events" ON golf_recurring_events
        FOR SELECT TO authenticated
        USING (
          team_id IN (
            SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
            UNION
            SELECT team_id FROM golf_players WHERE user_id = auth.uid()
          )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Coaches create recurring events' AND tablename = 'golf_recurring_events') THEN
      CREATE POLICY "Coaches create recurring events" ON golf_recurring_events
        FOR INSERT TO authenticated
        WITH CHECK (
          team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
          AND created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid())
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Coaches update recurring events' AND tablename = 'golf_recurring_events') THEN
      CREATE POLICY "Coaches update recurring events" ON golf_recurring_events
        FOR UPDATE TO authenticated
        USING (created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()))
        WITH CHECK (created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Coaches delete recurring events' AND tablename = 'golf_recurring_events') THEN
      CREATE POLICY "Coaches delete recurring events" ON golf_recurring_events
        FOR DELETE TO authenticated
        USING (created_by IN (SELECT id FROM golf_coaches WHERE user_id = auth.uid()));
    END IF;
  END IF;
END $$;

-- PART 5: FIX GOLF_TEAM_MEMBERS RLS
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'golf_team_members') THEN
    DROP POLICY IF EXISTS "Authenticated users can view golf team members" ON golf_team_members;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Team members view own roster' AND tablename = 'golf_team_members') THEN
      CREATE POLICY "Team members view own roster" ON golf_team_members
        FOR SELECT TO authenticated
        USING (
          team_id IN (
            SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
            UNION
            SELECT team_id FROM golf_players WHERE user_id = auth.uid()
          )
        );
    END IF;
  END IF;
END $$;

-- PART 6: COLUMN NAME FIXES (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'golf_messages' AND column_name = 'is_read'
  ) THEN
    ALTER TABLE golf_messages RENAME COLUMN is_read TO read;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'golf_teams' AND column_name = 'invite_code'
  ) THEN
    ALTER TABLE golf_teams RENAME COLUMN invite_code TO join_code;
    DROP INDEX IF EXISTS idx_golf_teams_invite_code;
    CREATE INDEX IF NOT EXISTS idx_golf_teams_join_code ON golf_teams(join_code) WHERE join_code IS NOT NULL;
  END IF;
END $$;
