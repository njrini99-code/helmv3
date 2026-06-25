-- =============================================================================
-- BaseballHelm — Player Passport settings + Player Daily Contract
-- =============================================================================
-- V5 system: v5_player_passport_and_recruiting_showcase_system.md
--   "BaseballHelm should have proof." — a portable, source-backed development
--   identity packet, PLUS the daily commitment loop that compounds into it.
--
-- This migration adds TWO additive tables. It does NOT clone or modify
-- baseball_players, baseball_player_stats, or baseball_player_timeline_events —
-- the passport READS those existing tables; only the two new concerns below
-- (per-field visibility settings and the daily-contract loop) need storage.
--
--   1. baseball_player_passport_settings
--        Per-player passport exposure controls: the public/private state of the
--        passport itself, and a jsonb map of per-field visibility overrides.
--        The Passport read-model layers these over the V2 data-visibility rules
--        so a player/program controls exactly what a scout/coach packet exposes.
--        Section spec: "Visibility Controls" + "Each measurable: ... visibility".
--
--   2. baseball_player_daily_contracts
--        The Daily Contract MECHANIC (not just a screen): one row per
--        (player, team, contract_date). A player commits to up to a few concrete
--        daily intentions; each intention is a small jsonb item with its own
--        done/skipped state. Committing + completing writes a timeline event
--        (via the app layer) so the daily loop compounds into the Passport's
--        Development Story. Honesty: an uncommitted/empty day is NOT a streak.
--
-- GUARANTEES:
--   * Idempotent / additive only: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT
--     EXISTS, CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS + CREATE.
--   * No DROP TABLE / DROP COLUMN, no destructive UPDATE/DELETE, no renames.
--   * RLS ENABLED on both tables with explicit policies. No GRANT to anon;
--     REVOKE ALL FROM anon at the end as a belt-and-suspenders guard.
--   * Reuses existing SECURITY DEFINER helpers:
--       get_my_baseball_player_id()      (migration 0050)
--       is_baseball_team_coach_v2(team)  (box-score migration)
--       is_baseball_team_member_v2(team) (box-score migration)
-- =============================================================================

-- =============================================================================
-- 1. baseball_player_passport_settings
-- =============================================================================
-- One row per (player, team). The passport is team-scoped because a player on
-- multiple teams (HS + showcase) controls exposure per program.
--
-- visibility_state:
--   'staff_only'     -> passport visible only to team staff (default; internal
--                       roster-evaluation passport for college programs)
--   'player_visible' -> the player can view their own assembled passport
--   'public_profile' -> public/recruiting exposure passport is enabled
--   'scout_packet'   -> additionally exportable to a scout packet
-- field_visibility: jsonb map { "<passport_field_key>": "<visibility_level>" }
--   overriding the default per field. Absent keys fall back to the section
--   default in the read-model. Never widens a staff-private underlying record.
-- =============================================================================
CREATE TABLE IF NOT EXISTS baseball_player_passport_settings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        uuid NOT NULL REFERENCES baseball_players(id) ON DELETE CASCADE,
  team_id          uuid NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  visibility_state text NOT NULL DEFAULT 'staff_only',
  field_visibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  headline         text,
  updated_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT baseball_passport_settings_player_team_key UNIQUE (player_id, team_id)
);

-- Additive guards for partial/earlier versions.
ALTER TABLE baseball_player_passport_settings ADD COLUMN IF NOT EXISTS player_id        uuid;
ALTER TABLE baseball_player_passport_settings ADD COLUMN IF NOT EXISTS team_id          uuid;
ALTER TABLE baseball_player_passport_settings ADD COLUMN IF NOT EXISTS visibility_state text DEFAULT 'staff_only';
ALTER TABLE baseball_player_passport_settings ADD COLUMN IF NOT EXISTS field_visibility jsonb DEFAULT '{}'::jsonb;
ALTER TABLE baseball_player_passport_settings ADD COLUMN IF NOT EXISTS headline         text;
ALTER TABLE baseball_player_passport_settings ADD COLUMN IF NOT EXISTS updated_by       uuid;
ALTER TABLE baseball_player_passport_settings ADD COLUMN IF NOT EXISTS created_at       timestamptz DEFAULT now();
ALTER TABLE baseball_player_passport_settings ADD COLUMN IF NOT EXISTS updated_at       timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'baseball_passport_settings_visibility_check'
  ) THEN
    ALTER TABLE baseball_player_passport_settings
      ADD CONSTRAINT baseball_passport_settings_visibility_check
      CHECK (visibility_state IN ('staff_only', 'player_visible', 'public_profile', 'scout_packet'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'baseball_passport_settings_player_team_key'
  ) THEN
    ALTER TABLE baseball_player_passport_settings
      ADD CONSTRAINT baseball_passport_settings_player_team_key
      UNIQUE (player_id, team_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_baseball_passport_settings_player
  ON baseball_player_passport_settings (player_id);
CREATE INDEX IF NOT EXISTS idx_baseball_passport_settings_team
  ON baseball_player_passport_settings (team_id);

ALTER TABLE baseball_player_passport_settings ENABLE ROW LEVEL SECURITY;

-- SELECT: team coaches/staff see all settings for their team; the subject player
-- sees their own settings row.
DROP POLICY IF EXISTS "baseball_passport_settings_select" ON baseball_player_passport_settings;
CREATE POLICY "baseball_passport_settings_select"
  ON baseball_player_passport_settings FOR SELECT
  TO authenticated
  USING (
    is_baseball_team_coach_v2(team_id)
    OR player_id = public.get_my_baseball_player_id()
  );

-- INSERT: a coach/staff of the team OR the subject player may create the row.
DROP POLICY IF EXISTS "baseball_passport_settings_insert" ON baseball_player_passport_settings;
CREATE POLICY "baseball_passport_settings_insert"
  ON baseball_player_passport_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    is_baseball_team_coach_v2(team_id)
    OR player_id = public.get_my_baseball_player_id()
  );

-- UPDATE: a coach/staff of the team OR the subject player may edit their row.
DROP POLICY IF EXISTS "baseball_passport_settings_update" ON baseball_player_passport_settings;
CREATE POLICY "baseball_passport_settings_update"
  ON baseball_player_passport_settings FOR UPDATE
  TO authenticated
  USING (
    is_baseball_team_coach_v2(team_id)
    OR player_id = public.get_my_baseball_player_id()
  )
  WITH CHECK (
    is_baseball_team_coach_v2(team_id)
    OR player_id = public.get_my_baseball_player_id()
  );

-- DELETE: coaches/staff of the team only (a settings row is operational config).
DROP POLICY IF EXISTS "baseball_passport_settings_delete" ON baseball_player_passport_settings;
CREATE POLICY "baseball_passport_settings_delete"
  ON baseball_player_passport_settings FOR DELETE
  TO authenticated
  USING (is_baseball_team_coach_v2(team_id));

-- =============================================================================
-- 2. baseball_player_daily_contracts
-- =============================================================================
-- One row per (player, team, contract_date). The daily commitment loop.
--
-- status:
--   'draft'      -> player is composing; not yet committed (no streak credit)
--   'committed'  -> player committed to the day's intentions
--   'completed'  -> the player marked the day's contract done (all/honored)
--   'missed'     -> a committed day passed without completion (set by app layer)
-- items: jsonb array of intentions, each:
--   { "id": uuid-string, "label": text, "category": text,
--     "done": boolean, "skipped": boolean }
--   The done/skipped state lives inside the item so a partial day is honest.
-- reflection: optional short end-of-day note (player-private by default).
-- =============================================================================
CREATE TABLE IF NOT EXISTS baseball_player_daily_contracts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     uuid NOT NULL REFERENCES baseball_players(id) ON DELETE CASCADE,
  team_id       uuid NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  contract_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  status        text NOT NULL DEFAULT 'draft',
  items         jsonb NOT NULL DEFAULT '[]'::jsonb,
  reflection    text,
  committed_at  timestamptz,
  completed_at  timestamptz,
  visibility    text NOT NULL DEFAULT 'player_only',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT baseball_daily_contract_player_team_date_key
    UNIQUE (player_id, team_id, contract_date)
);

-- Additive guards.
ALTER TABLE baseball_player_daily_contracts ADD COLUMN IF NOT EXISTS player_id     uuid;
ALTER TABLE baseball_player_daily_contracts ADD COLUMN IF NOT EXISTS team_id       uuid;
ALTER TABLE baseball_player_daily_contracts ADD COLUMN IF NOT EXISTS contract_date date;
ALTER TABLE baseball_player_daily_contracts ADD COLUMN IF NOT EXISTS status        text DEFAULT 'draft';
ALTER TABLE baseball_player_daily_contracts ADD COLUMN IF NOT EXISTS items         jsonb DEFAULT '[]'::jsonb;
ALTER TABLE baseball_player_daily_contracts ADD COLUMN IF NOT EXISTS reflection    text;
ALTER TABLE baseball_player_daily_contracts ADD COLUMN IF NOT EXISTS committed_at  timestamptz;
ALTER TABLE baseball_player_daily_contracts ADD COLUMN IF NOT EXISTS completed_at  timestamptz;
ALTER TABLE baseball_player_daily_contracts ADD COLUMN IF NOT EXISTS visibility    text DEFAULT 'player_only';
ALTER TABLE baseball_player_daily_contracts ADD COLUMN IF NOT EXISTS created_at    timestamptz DEFAULT now();
ALTER TABLE baseball_player_daily_contracts ADD COLUMN IF NOT EXISTS updated_at    timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'baseball_daily_contract_status_check'
  ) THEN
    ALTER TABLE baseball_player_daily_contracts
      ADD CONSTRAINT baseball_daily_contract_status_check
      CHECK (status IN ('draft', 'committed', 'completed', 'missed'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'baseball_daily_contract_visibility_check'
  ) THEN
    ALTER TABLE baseball_player_daily_contracts
      ADD CONSTRAINT baseball_daily_contract_visibility_check
      CHECK (visibility IN ('player_only', 'team', 'staff_only'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'baseball_daily_contract_player_team_date_key'
  ) THEN
    ALTER TABLE baseball_player_daily_contracts
      ADD CONSTRAINT baseball_daily_contract_player_team_date_key
      UNIQUE (player_id, team_id, contract_date);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_baseball_daily_contract_player
  ON baseball_player_daily_contracts (player_id);
CREATE INDEX IF NOT EXISTS idx_baseball_daily_contract_team
  ON baseball_player_daily_contracts (team_id);
-- Common access: this player's recent contracts in reverse-chronological order.
CREATE INDEX IF NOT EXISTS idx_baseball_daily_contract_player_date
  ON baseball_player_daily_contracts (player_id, contract_date DESC);

ALTER TABLE baseball_player_daily_contracts ENABLE ROW LEVEL SECURITY;

-- SELECT:
--   The subject player always sees their own contracts.
--   Coaches/staff see contracts that are NOT 'player_only' (i.e. shared 'team' or
--   'staff_only' rows) for their team — the player's private reflections stay
--   private unless the player chose to share the day.
DROP POLICY IF EXISTS "baseball_daily_contract_select" ON baseball_player_daily_contracts;
CREATE POLICY "baseball_daily_contract_select"
  ON baseball_player_daily_contracts FOR SELECT
  TO authenticated
  USING (
    player_id = public.get_my_baseball_player_id()
    OR (
      visibility <> 'player_only'
      AND is_baseball_team_coach_v2(team_id)
    )
  );

-- INSERT: only the subject player may create their own contract (and must be a
-- member of the team they file it under).
DROP POLICY IF EXISTS "baseball_daily_contract_insert" ON baseball_player_daily_contracts;
CREATE POLICY "baseball_daily_contract_insert"
  ON baseball_player_daily_contracts FOR INSERT
  TO authenticated
  WITH CHECK (
    player_id = public.get_my_baseball_player_id()
    AND is_baseball_team_member_v2(team_id)
  );

-- UPDATE: only the subject player may edit their own contract.
DROP POLICY IF EXISTS "baseball_daily_contract_update" ON baseball_player_daily_contracts;
CREATE POLICY "baseball_daily_contract_update"
  ON baseball_player_daily_contracts FOR UPDATE
  TO authenticated
  USING (player_id = public.get_my_baseball_player_id())
  WITH CHECK (player_id = public.get_my_baseball_player_id());

-- DELETE: only the subject player may delete their own draft contract.
DROP POLICY IF EXISTS "baseball_daily_contract_delete" ON baseball_player_daily_contracts;
CREATE POLICY "baseball_daily_contract_delete"
  ON baseball_player_daily_contracts FOR DELETE
  TO authenticated
  USING (player_id = public.get_my_baseball_player_id());

-- =============================================================================
-- Belt-and-suspenders: ensure anon holds nothing on the new tables.
-- (No policy targets anon; this also removes any default table-level grant.)
-- =============================================================================
REVOKE ALL ON baseball_player_passport_settings FROM anon;
REVOKE ALL ON baseball_player_daily_contracts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON baseball_player_passport_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON baseball_player_daily_contracts TO authenticated;

-- =============================================================================
-- Documentation
-- =============================================================================
COMMENT ON TABLE baseball_player_passport_settings IS
  'Per-(player,team) Player Passport exposure controls: visibility_state + per-field visibility map. The passport READS baseball_players/stats/timeline; this stores only exposure config.';
COMMENT ON COLUMN baseball_player_passport_settings.field_visibility IS
  'jsonb map { passport_field_key: visibility_level } overriding section defaults; never widens a staff-private underlying record.';
COMMENT ON TABLE baseball_player_daily_contracts IS
  'Player Daily Contract loop: one row per (player,team,contract_date). Player-owned commitment; coaches see only non-player_only rows. Completing a committed day compounds into the Passport development story via a timeline event (app layer).';
COMMENT ON COLUMN baseball_player_daily_contracts.items IS
  'jsonb array of intentions: { id, label, category, done, skipped }. Per-item done/skipped keeps a partial day honest (a missed item is never shown as done).';
