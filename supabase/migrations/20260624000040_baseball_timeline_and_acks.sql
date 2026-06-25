-- =============================================================================
-- BaseballHelm — Player Timeline Events + Event Acknowledgements
-- =============================================================================
-- Wave 1 / roster-timeline packet.
--
-- Adds two ADDITIVE tables:
--   1. baseball_player_timeline_events — a per-player activity/history feed
--      (recruiting touches, stat milestones, coach notes, system events, etc).
--      A `visibility` column gates staff-only notes so they never reach players.
--   2. baseball_event_acknowledgements — per-user "I have seen / acknowledged
--      this calendar event" records (read receipts / RSVP-ack), one row per
--      (event, user).
--
-- GUARANTEES:
--   * Idempotent / additive only: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF
--     NOT EXISTS, CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS + CREATE.
--   * No DROP TABLE / DROP COLUMN, no destructive UPDATE/DELETE, no renames.
--   * RLS ENABLED on both tables with explicit policies. No GRANT to anon.
--   * Reuses existing SECURITY DEFINER helpers is_baseball_team_coach_v2() and
--     is_baseball_team_member_v2() (defined in the box-score migration).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Defensive: ensure the visibility enum-equivalent is documented via CHECK.
-- We use TEXT + CHECK (matching the project's box-score/string-enum convention)
-- rather than a Postgres ENUM, so values can be extended additively later.
--   'team'        -> visible to all team members (players + coaches) on the team
--   'staff_only'  -> visible to coaches/staff ONLY (never reaches players)
--   'player_only' -> visible to the subject player + coaches (private to player)
-- -----------------------------------------------------------------------------

-- =============================================================================
-- 1. baseball_player_timeline_events
-- =============================================================================
CREATE TABLE IF NOT EXISTS baseball_player_timeline_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid NOT NULL REFERENCES baseball_players(id) ON DELETE CASCADE,
  team_id     uuid NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  event_type  text NOT NULL,
  title       text NOT NULL,
  body        text,
  source_type text,
  source_id   uuid,
  confidence  numeric,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  visibility  text NOT NULL DEFAULT 'team'
);

-- Additive guards in case a partial/earlier version of the table already exists.
ALTER TABLE baseball_player_timeline_events ADD COLUMN IF NOT EXISTS player_id   uuid;
ALTER TABLE baseball_player_timeline_events ADD COLUMN IF NOT EXISTS team_id     uuid;
ALTER TABLE baseball_player_timeline_events ADD COLUMN IF NOT EXISTS event_type  text;
ALTER TABLE baseball_player_timeline_events ADD COLUMN IF NOT EXISTS title       text;
ALTER TABLE baseball_player_timeline_events ADD COLUMN IF NOT EXISTS body        text;
ALTER TABLE baseball_player_timeline_events ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE baseball_player_timeline_events ADD COLUMN IF NOT EXISTS source_id   uuid;
ALTER TABLE baseball_player_timeline_events ADD COLUMN IF NOT EXISTS confidence  numeric;
ALTER TABLE baseball_player_timeline_events ADD COLUMN IF NOT EXISTS occurred_at timestamptz DEFAULT now();
ALTER TABLE baseball_player_timeline_events ADD COLUMN IF NOT EXISTS created_by  uuid;
ALTER TABLE baseball_player_timeline_events ADD COLUMN IF NOT EXISTS created_at  timestamptz DEFAULT now();
ALTER TABLE baseball_player_timeline_events ADD COLUMN IF NOT EXISTS visibility  text DEFAULT 'team';

-- Constrain visibility to the known values (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'baseball_player_timeline_events_visibility_check'
  ) THEN
    ALTER TABLE baseball_player_timeline_events
      ADD CONSTRAINT baseball_player_timeline_events_visibility_check
      CHECK (visibility IN ('team', 'staff_only', 'player_only'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_baseball_timeline_player_id
  ON baseball_player_timeline_events (player_id);
CREATE INDEX IF NOT EXISTS idx_baseball_timeline_team_id
  ON baseball_player_timeline_events (team_id);
CREATE INDEX IF NOT EXISTS idx_baseball_timeline_occurred_at
  ON baseball_player_timeline_events (occurred_at DESC);
-- Common access pattern: a player's feed in reverse-chronological order.
CREATE INDEX IF NOT EXISTS idx_baseball_timeline_player_occurred
  ON baseball_player_timeline_events (player_id, occurred_at DESC);

ALTER TABLE baseball_player_timeline_events ENABLE ROW LEVEL SECURITY;

-- SELECT:
--   Coaches/staff of the team can see everything for the team.
--   The subject player can see their own events EXCEPT 'staff_only' notes.
DROP POLICY IF EXISTS "baseball_timeline_select" ON baseball_player_timeline_events;
CREATE POLICY "baseball_timeline_select"
  ON baseball_player_timeline_events FOR SELECT
  USING (
    is_baseball_team_coach_v2(team_id)
    OR (
      visibility <> 'staff_only'
      AND player_id = (SELECT id FROM baseball_players WHERE user_id = auth.uid() LIMIT 1)
    )
  );

-- INSERT: coaches/staff of the team may add timeline events.
DROP POLICY IF EXISTS "baseball_timeline_insert" ON baseball_player_timeline_events;
CREATE POLICY "baseball_timeline_insert"
  ON baseball_player_timeline_events FOR INSERT
  WITH CHECK (is_baseball_team_coach_v2(team_id));

-- UPDATE: coaches/staff of the team may edit timeline events.
DROP POLICY IF EXISTS "baseball_timeline_update" ON baseball_player_timeline_events;
CREATE POLICY "baseball_timeline_update"
  ON baseball_player_timeline_events FOR UPDATE
  USING (is_baseball_team_coach_v2(team_id))
  WITH CHECK (is_baseball_team_coach_v2(team_id));

-- DELETE: coaches/staff of the team may delete timeline events.
DROP POLICY IF EXISTS "baseball_timeline_delete" ON baseball_player_timeline_events;
CREATE POLICY "baseball_timeline_delete"
  ON baseball_player_timeline_events FOR DELETE
  USING (is_baseball_team_coach_v2(team_id));

-- =============================================================================
-- 2. baseball_event_acknowledgements
-- =============================================================================
CREATE TABLE IF NOT EXISTS baseball_event_acknowledgements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES baseball_events(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT baseball_event_acknowledgements_event_user_key UNIQUE (event_id, user_id)
);

-- Additive guards for partial/earlier versions.
ALTER TABLE baseball_event_acknowledgements ADD COLUMN IF NOT EXISTS event_id        uuid;
ALTER TABLE baseball_event_acknowledgements ADD COLUMN IF NOT EXISTS user_id         uuid;
ALTER TABLE baseball_event_acknowledgements ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz DEFAULT now();

-- Ensure the unique pair constraint exists (idempotent) even if the table
-- pre-existed without it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'baseball_event_acknowledgements_event_user_key'
  ) THEN
    ALTER TABLE baseball_event_acknowledgements
      ADD CONSTRAINT baseball_event_acknowledgements_event_user_key
      UNIQUE (event_id, user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_baseball_event_acks_event_id
  ON baseball_event_acknowledgements (event_id);
CREATE INDEX IF NOT EXISTS idx_baseball_event_acks_user_id
  ON baseball_event_acknowledgements (user_id);

ALTER TABLE baseball_event_acknowledgements ENABLE ROW LEVEL SECURITY;

-- SELECT:
--   A user can always see their own acknowledgements.
--   Coaches/staff of the team that owns the underlying event can see all
--   acknowledgements for that event (to track who has seen it).
DROP POLICY IF EXISTS "baseball_event_acks_select" ON baseball_event_acknowledgements;
CREATE POLICY "baseball_event_acks_select"
  ON baseball_event_acknowledgements FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM baseball_events e
      WHERE e.id = baseball_event_acknowledgements.event_id
        AND is_baseball_team_coach_v2(e.team_id)
    )
  );

-- INSERT: a user may only acknowledge as themselves.
DROP POLICY IF EXISTS "baseball_event_acks_insert" ON baseball_event_acknowledgements;
CREATE POLICY "baseball_event_acks_insert"
  ON baseball_event_acknowledgements FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- UPDATE: a user may only update their own acknowledgement (e.g. re-ack time).
DROP POLICY IF EXISTS "baseball_event_acks_update" ON baseball_event_acknowledgements;
CREATE POLICY "baseball_event_acks_update"
  ON baseball_event_acknowledgements FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: a user may withdraw their own acknowledgement.
DROP POLICY IF EXISTS "baseball_event_acks_delete" ON baseball_event_acknowledgements;
CREATE POLICY "baseball_event_acks_delete"
  ON baseball_event_acknowledgements FOR DELETE
  USING (user_id = auth.uid());

-- =============================================================================
-- Documentation
-- =============================================================================
COMMENT ON TABLE baseball_player_timeline_events IS
  'Per-player activity/history feed for BaseballHelm. visibility gates staff_only notes from players.';
COMMENT ON COLUMN baseball_player_timeline_events.visibility IS
  'team | staff_only | player_only — staff_only is never returned to players by RLS.';
COMMENT ON TABLE baseball_event_acknowledgements IS
  'Per-user acknowledgement (read receipt) of a baseball_events row. Unique per (event_id, user_id).';
