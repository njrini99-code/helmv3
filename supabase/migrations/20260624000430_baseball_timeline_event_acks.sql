-- =============================================================================
-- BaseballHelm — Player Timeline EVENT acknowledgements
-- =============================================================================
-- Closes the source -> signal -> action -> TIMELINE -> OUTCOME loop at display.
--
-- WHY A NEW TABLE (not baseball_event_acknowledgements):
--   baseball_event_acknowledgements (migration 20260624000040 SECTION 2) is for
--   CALENDAR events (FK -> baseball_events). Its event_id FK would REJECT a
--   baseball_player_timeline_events id, and its RLS is scoped to calendar event
--   ownership. Acknowledging a TIMELINE event (a coach saying "I have seen this
--   stat milestone / import / AI insight", or a player acknowledging a note that
--   is visible to them) is a distinct concept with its own visibility-aware
--   boundary, so it gets its own table.
--
-- WHO MAY ACKNOWLEDGE A TIMELINE EVENT:
--   Anyone who can SEE the underlying timeline event may acknowledge it as
--   themselves. "Can see" is exactly the baseball_player_timeline_events SELECT
--   policy (coach/staff of the team, OR the subject player for non-staff_only
--   rows). We therefore phrase the ack RLS in terms of "the event is visible to
--   me", reusing the same predicate so a player can NEVER ack a staff_only row
--   they cannot even read.
--
-- GUARANTEES:
--   * Idempotent / additive only: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT
--     EXISTS, CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS + CREATE.
--   * No DROP TABLE / DROP COLUMN, no destructive UPDATE/DELETE, no renames.
--   * RLS ENABLED with explicit policies. REVOKE ALL FROM anon (no anon access).
--   * The single write invariant is user_id = auth.uid() (ack/unack as self).
-- =============================================================================

CREATE TABLE IF NOT EXISTS baseball_timeline_event_acks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_event_id uuid NOT NULL
    REFERENCES baseball_player_timeline_events(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT baseball_timeline_event_acks_event_user_key
    UNIQUE (timeline_event_id, user_id)
);

-- Additive guards for partial/earlier versions of the table.
ALTER TABLE baseball_timeline_event_acks
  ADD COLUMN IF NOT EXISTS timeline_event_id uuid;
ALTER TABLE baseball_timeline_event_acks
  ADD COLUMN IF NOT EXISTS user_id           uuid;
ALTER TABLE baseball_timeline_event_acks
  ADD COLUMN IF NOT EXISTS acknowledged_at   timestamptz DEFAULT now();

-- Ensure the unique pair constraint exists (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'baseball_timeline_event_acks_event_user_key'
  ) THEN
    ALTER TABLE baseball_timeline_event_acks
      ADD CONSTRAINT baseball_timeline_event_acks_event_user_key
      UNIQUE (timeline_event_id, user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_baseball_timeline_acks_event_id
  ON baseball_timeline_event_acks (timeline_event_id);
CREATE INDEX IF NOT EXISTS idx_baseball_timeline_acks_user_id
  ON baseball_timeline_event_acks (user_id);
-- Common access pattern: "which of these events have I acknowledged".
CREATE INDEX IF NOT EXISTS idx_baseball_timeline_acks_user_event
  ON baseball_timeline_event_acks (user_id, timeline_event_id);

ALTER TABLE baseball_timeline_event_acks ENABLE ROW LEVEL SECURITY;

-- SELECT:
--   A user can always see their own acks.
--   Coaches/staff of the team owning the underlying timeline event can see all
--   acks for that event (to know who has acknowledged a milestone/insight).
DROP POLICY IF EXISTS "baseball_timeline_acks_select" ON baseball_timeline_event_acks;
CREATE POLICY "baseball_timeline_acks_select"
  ON baseball_timeline_event_acks FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM baseball_player_timeline_events e
      WHERE e.id = baseball_timeline_event_acks.timeline_event_id
        AND is_baseball_team_coach_v2(e.team_id)
    )
  );

-- INSERT:
--   A user may only ack AS THEMSELVES, and only an event they can actually SEE
--   (mirrors the timeline SELECT predicate so a player cannot ack a staff_only
--   row). Coaches/staff can ack any event on their team.
DROP POLICY IF EXISTS "baseball_timeline_acks_insert" ON baseball_timeline_event_acks;
CREATE POLICY "baseball_timeline_acks_insert"
  ON baseball_timeline_event_acks FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM baseball_player_timeline_events e
      WHERE e.id = baseball_timeline_event_acks.timeline_event_id
        AND (
          is_baseball_team_coach_v2(e.team_id)
          OR (
            e.visibility <> 'staff_only'
            AND e.player_id = (
              SELECT id FROM baseball_players WHERE user_id = auth.uid() LIMIT 1
            )
          )
        )
    )
  );

-- UPDATE: a user may only refresh their own ack (e.g. re-ack timestamp).
DROP POLICY IF EXISTS "baseball_timeline_acks_update" ON baseball_timeline_event_acks;
CREATE POLICY "baseball_timeline_acks_update"
  ON baseball_timeline_event_acks FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: a user may withdraw their own ack.
DROP POLICY IF EXISTS "baseball_timeline_acks_delete" ON baseball_timeline_event_acks;
CREATE POLICY "baseball_timeline_acks_delete"
  ON baseball_timeline_event_acks FOR DELETE
  USING (user_id = auth.uid());

-- No anon access. RLS is the boundary; this REVOKE is belt-and-suspenders so a
-- public/anon role can never read or write the table even if a future default
-- privilege grant leaks in.
REVOKE ALL ON baseball_timeline_event_acks FROM anon;

COMMENT ON TABLE baseball_timeline_event_acks IS
  'Per-user acknowledgement (read receipt) of a baseball_player_timeline_events row. Unique per (timeline_event_id, user_id). RLS: ack only events you can see; visibility-aware.';
