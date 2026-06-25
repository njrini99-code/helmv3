-- =============================================================================
-- BaseballHelm — Daily Contract: MISSED roll-over (commitment-loop edge case)
-- =============================================================================
-- The base mechanic (migration 20260624000220) defines:
--     status text NOT NULL DEFAULT 'draft'
--       CHECK (status IN ('draft','committed','completed','missed'))
-- and its own comment is explicit:
--     'missed' -> a committed day passed without completion (set by app layer)
--
-- Nothing in the app layer ever set 'missed'. A player who COMMITTED to a day but
-- never COMPLETED it left a permanent 'committed' row: the streak broke correctly
-- (only 'completed' counts) but the abandoned day was never surfaced as 'missed'
-- to the player or to staff — the accountability half of the commitment loop was
-- silently dropped, and the row froze as a stale "in progress" forever.
--
-- This migration is the DB half of closing that gap. A daily Inngest roll-over
-- sweep (src/lib/inngest/functions.ts -> coachhelm-baseball-daily-contract-missed-
-- sweep, core in src/lib/baseball/daily-contract/missed-sweep.ts) transitions
-- yesterday-and-earlier still-'committed' contracts to 'missed'. That sweep needs:
--
--   1. A missed_at timestamp so the transition is auditable + the UI can show
--      WHEN a commitment lapsed (mirrors committed_at / completed_at).
--   2. A partial index over the sweep's discovery predicate (still-active past
--      rows) so the nightly scan is cheap as history grows.
--
-- GUARANTEES:
--   * Additive only: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS. No
--     DROP, no destructive DML. The status CHECK already permits 'missed' (it was
--     reserved in the base migration) — no constraint change is needed.
--   * RLS unchanged: the existing player-owned UPDATE policy already authorizes a
--     status transition on a player's own row. The sweep runs as service-role
--     (the trusted cron), bypassing RLS for a system-provenance roll-over only.
--   * No GRANT to anon; the table already REVOKEs anon. authenticated already
--     holds UPDATE from the base migration.
-- =============================================================================

-- 1. Additive column ------------------------------------------------------------
ALTER TABLE baseball_player_daily_contracts
  ADD COLUMN IF NOT EXISTS missed_at timestamptz;

-- 2. Sweep discovery index ------------------------------------------------------
-- The roll-over sweep selects rows for a team whose contract_date is strictly in
-- the past and whose status is still active ('committed'/'draft'). A partial index
-- over the active statuses keeps the nightly discovery + per-team scan cheap; once
-- a row is terminal ('completed'/'missed') it drops out of the index entirely.
CREATE INDEX IF NOT EXISTS idx_baseball_daily_contract_team_date_active
  ON baseball_player_daily_contracts (team_id, contract_date)
  WHERE status IN ('committed', 'draft');

-- 3. Documentation --------------------------------------------------------------
COMMENT ON COLUMN baseball_player_daily_contracts.missed_at IS
  'When a committed day rolled over to ''missed'' without completion. Set by the daily app-layer roll-over sweep (Inngest coachhelm-baseball-daily-contract-missed-sweep). Null unless status = ''missed''.';
