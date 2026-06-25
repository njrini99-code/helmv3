-- =============================================================================
-- BaseballHelm — Daily Contract: coach-side acknowledgement
-- =============================================================================
-- Deepens the Daily Contract loop with its STAFF half. The base mechanic
-- (migration 20260624000220) is player-owned: a player commits to a few daily
-- intentions, honors them, completes the day. The SELECT policy on
-- baseball_player_daily_contracts already lets a team coach READ any row whose
-- visibility <> 'player_only' — but the player had no way to *set* a shareable
-- visibility, and a coach had no way to *react*. This migration closes that:
--
--   1. Two additive columns on baseball_player_daily_contracts record a coach's
--      acknowledgement of a SHARED day (a lightweight "I saw this / nice work"
--      signal back to the player), without widening any private reflection.
--        coach_acknowledged_at  timestamptz  — when a coach acked the day
--        coach_acknowledged_by  uuid (auth.users) — which coach acked it
--
--   2. A new UPDATE policy lets a team coach write ONLY those two ack columns on
--      a SHARED (visibility <> 'player_only') row for their team — the existing
--      player-owned UPDATE policy is unchanged, so a coach can never edit a
--      player's intentions, status, reflection, or visibility. A WITH CHECK
--      guard pins the coach UPDATE to shared rows so a coach can never ack (and
--      thereby surface) a row a player kept private.
--
--   3. A partial index over the coach read path: the roster-wide "today's shared
--      contracts" query filters (team_id, contract_date) on shared rows only.
--
-- GUARANTEES:
--   * Additive only: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
--     DROP POLICY IF EXISTS + CREATE. No DROP TABLE/COLUMN, no destructive DML.
--   * RLS stays enabled; the player-owned UPDATE policy is untouched. The new
--     coach UPDATE policy is column-effectively scoped by the app layer (which
--     only ever sets the two ack columns) AND row-scoped by RLS to shared rows.
--   * No GRANT to anon; the table already REVOKEs anon. authenticated already
--     holds UPDATE from the base migration.
--   * Reuses the existing SECURITY DEFINER helper is_baseball_team_coach_v2(team).
-- =============================================================================

-- 1. Additive columns -----------------------------------------------------------
ALTER TABLE baseball_player_daily_contracts
  ADD COLUMN IF NOT EXISTS coach_acknowledged_at timestamptz;
ALTER TABLE baseball_player_daily_contracts
  ADD COLUMN IF NOT EXISTS coach_acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Coach UPDATE policy (ack-only, shared rows only) ---------------------------
-- A coach/staff of the team may UPDATE a row that the player chose to SHARE
-- (visibility <> 'player_only'). The app layer writes ONLY the two ack columns
-- through this path; RLS guarantees a coach can only ever touch SHARED rows (the
-- USING clause), and the WITH CHECK re-asserts the row stays shared + on-team so
-- a coach can neither hide nor re-home it. The player-owned UPDATE policy
-- ("baseball_daily_contract_update") is left in place untouched, so a player
-- retains full control of their own intentions/status/reflection/visibility.
--
-- NOTE: Postgres RLS is row-level, not column-level. True column scoping is
-- enforced in the application action (setContractCoachAck only ever sets
-- coach_acknowledged_at/by). This policy's job is the ROW boundary: a coach can
-- only write a row that is already shared and belongs to their team.
DROP POLICY IF EXISTS "baseball_daily_contract_coach_ack_update" ON baseball_player_daily_contracts;
CREATE POLICY "baseball_daily_contract_coach_ack_update"
  ON baseball_player_daily_contracts FOR UPDATE
  TO authenticated
  USING (
    visibility <> 'player_only'
    AND is_baseball_team_coach_v2(team_id)
  )
  WITH CHECK (
    visibility <> 'player_only'
    AND is_baseball_team_coach_v2(team_id)
  );

-- 3. Coach read-path index ------------------------------------------------------
-- The roster-wide read model selects shared rows for a team on a given date.
CREATE INDEX IF NOT EXISTS idx_baseball_daily_contract_team_date_shared
  ON baseball_player_daily_contracts (team_id, contract_date DESC)
  WHERE visibility <> 'player_only';

-- 4. Documentation --------------------------------------------------------------
COMMENT ON COLUMN baseball_player_daily_contracts.coach_acknowledged_at IS
  'When a team coach acknowledged this SHARED day (visibility <> player_only). Null = not yet acked. Coach ack also emits a coach->player timeline note (app layer).';
COMMENT ON COLUMN baseball_player_daily_contracts.coach_acknowledged_by IS
  'auth.users id of the coach who acknowledged this shared day. Set only via the ack-only coach UPDATE policy.';
