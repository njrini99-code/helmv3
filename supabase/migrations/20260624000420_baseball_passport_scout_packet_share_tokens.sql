-- =============================================================================
-- BaseballHelm — Player Passport SCOUT PACKET share tokens
-- =============================================================================
-- V5 system: v5_player_passport_and_recruiting_showcase_system.md §Scout Packet
--   "Export forms: web packet · PDF later · CSV summary"
--   Showcase variant: "scout packet export · college coach viewer access"
--
-- The Scout Packet vertical needs a SOURCE -> SIGNAL -> ACTION -> OUTCOME chain
-- that reaches an UNAUTHENTICATED college coach. RLS protects every table from
-- anon, so an external scout cannot read the passport directly. Instead, staff
-- with can_export_reports mint a single-purpose, revocable SHARE TOKEN that
-- points at exactly one (player, team) passport. A server-only public route
-- resolves the token (server role), enforces the visibility_state gate and the
-- VISIBILITY_RANK>=2 field filter in the read model, and renders the viewerRole
-- 'other' web packet. The token NEVER grants table access to anon — it is an
-- opaque capability the SERVER trades for a tightly-filtered, assembled packet.
--
-- This migration adds ONE additive table. It does NOT modify
-- baseball_player_passport_settings or any existing table.
--
-- GUARANTEES:
--   * Idempotent / additive only: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT
--     EXISTS, CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS + CREATE.
--   * No DROP TABLE / DROP COLUMN, no destructive UPDATE/DELETE, no renames.
--   * RLS ENABLED with explicit policies. NO grant to anon (REVOKE ALL FROM anon
--     at the end). The public route reads this table with the SERVER role only.
--   * Reuses existing SECURITY DEFINER helpers:
--       is_baseball_team_coach_v2(team)  (box-score migration)
--       get_my_baseball_player_id()      (migration 0050)
-- =============================================================================

-- =============================================================================
-- baseball_player_passport_share_tokens
-- =============================================================================
-- One row per minted scout-packet share link. A staff member with export rights
-- mints a token for a (player, team) whose passport is exposed
-- (visibility_state in 'public_profile' | 'scout_packet'). The token:
--   * is an opaque, URL-safe secret (generated app-side; stored as-is so it can
--     be re-displayed to the coach who minted it — it is a share capability, not
--     a password hash, and is only ever readable by team staff via RLS / the
--     server role).
--   * may carry an optional recipient label (e.g. "Coach Davis, Texas A&M") and
--     an expiry. An expired or revoked token resolves to an honest "link
--     expired" state — never a leaked packet.
--   * records lightweight, non-PII access telemetry (view count + last viewed)
--     so staff can see whether the packet was actually opened.
-- =============================================================================
CREATE TABLE IF NOT EXISTS baseball_player_passport_share_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       uuid NOT NULL REFERENCES baseball_players(id) ON DELETE CASCADE,
  team_id         uuid NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  token           text NOT NULL,
  recipient_label text,
  -- 'scout' (college-coach packet, scout-ranked fields) is the only kind today;
  -- the column lets later packet kinds (e.g. 'transfer') reuse the same plumbing.
  packet_kind     text NOT NULL DEFAULT 'scout',
  status          text NOT NULL DEFAULT 'active',
  expires_at      timestamptz,
  view_count      integer NOT NULL DEFAULT 0,
  last_viewed_at  timestamptz,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT baseball_passport_share_token_key UNIQUE (token)
);

-- Additive guards for partial/earlier versions.
ALTER TABLE baseball_player_passport_share_tokens ADD COLUMN IF NOT EXISTS player_id       uuid;
ALTER TABLE baseball_player_passport_share_tokens ADD COLUMN IF NOT EXISTS team_id         uuid;
ALTER TABLE baseball_player_passport_share_tokens ADD COLUMN IF NOT EXISTS token           text;
ALTER TABLE baseball_player_passport_share_tokens ADD COLUMN IF NOT EXISTS recipient_label text;
ALTER TABLE baseball_player_passport_share_tokens ADD COLUMN IF NOT EXISTS packet_kind     text DEFAULT 'scout';
ALTER TABLE baseball_player_passport_share_tokens ADD COLUMN IF NOT EXISTS status          text DEFAULT 'active';
ALTER TABLE baseball_player_passport_share_tokens ADD COLUMN IF NOT EXISTS expires_at      timestamptz;
ALTER TABLE baseball_player_passport_share_tokens ADD COLUMN IF NOT EXISTS view_count      integer DEFAULT 0;
ALTER TABLE baseball_player_passport_share_tokens ADD COLUMN IF NOT EXISTS last_viewed_at  timestamptz;
ALTER TABLE baseball_player_passport_share_tokens ADD COLUMN IF NOT EXISTS created_by      uuid;
ALTER TABLE baseball_player_passport_share_tokens ADD COLUMN IF NOT EXISTS created_at      timestamptz DEFAULT now();
ALTER TABLE baseball_player_passport_share_tokens ADD COLUMN IF NOT EXISTS updated_at      timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'baseball_passport_share_token_status_check'
  ) THEN
    ALTER TABLE baseball_player_passport_share_tokens
      ADD CONSTRAINT baseball_passport_share_token_status_check
      CHECK (status IN ('active', 'revoked'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'baseball_passport_share_token_kind_check'
  ) THEN
    ALTER TABLE baseball_player_passport_share_tokens
      ADD CONSTRAINT baseball_passport_share_token_kind_check
      CHECK (packet_kind IN ('scout', 'transfer'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'baseball_passport_share_token_key'
  ) THEN
    ALTER TABLE baseball_player_passport_share_tokens
      ADD CONSTRAINT baseball_passport_share_token_key UNIQUE (token);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_baseball_passport_share_token_player
  ON baseball_player_passport_share_tokens (player_id, team_id);
CREATE INDEX IF NOT EXISTS idx_baseball_passport_share_token_team
  ON baseball_player_passport_share_tokens (team_id);
-- The public route resolves a token directly; the UNIQUE constraint already
-- provides the lookup index on (token).

ALTER TABLE baseball_player_passport_share_tokens ENABLE ROW LEVEL SECURITY;

-- SELECT: team coaches/staff see tokens for their team; the subject player sees
-- tokens minted for their own passport (transparency — a player can see who
-- their passport was shared with). Anon is never granted (REVOKE below); the
-- public route resolves tokens with the SERVER role, not via this policy.
DROP POLICY IF EXISTS "baseball_passport_share_token_select" ON baseball_player_passport_share_tokens;
CREATE POLICY "baseball_passport_share_token_select"
  ON baseball_player_passport_share_tokens FOR SELECT
  TO authenticated
  USING (
    is_baseball_team_coach_v2(team_id)
    OR player_id = public.get_my_baseball_player_id()
  );

-- INSERT: team coaches/staff only (minting is an export action gated further by
-- the can_export_reports capability in the server action).
DROP POLICY IF EXISTS "baseball_passport_share_token_insert" ON baseball_player_passport_share_tokens;
CREATE POLICY "baseball_passport_share_token_insert"
  ON baseball_player_passport_share_tokens FOR INSERT
  TO authenticated
  WITH CHECK (is_baseball_team_coach_v2(team_id));

-- UPDATE: team coaches/staff only (revoke / relabel). View-count increments run
-- under the SERVER role from the public route, bypassing this policy.
DROP POLICY IF EXISTS "baseball_passport_share_token_update" ON baseball_player_passport_share_tokens;
CREATE POLICY "baseball_passport_share_token_update"
  ON baseball_player_passport_share_tokens FOR UPDATE
  TO authenticated
  USING (is_baseball_team_coach_v2(team_id))
  WITH CHECK (is_baseball_team_coach_v2(team_id));

-- DELETE: team coaches/staff only. (Revoke is preferred over delete so the audit
-- trail survives; delete remains available for cleanup.)
DROP POLICY IF EXISTS "baseball_passport_share_token_delete" ON baseball_player_passport_share_tokens;
CREATE POLICY "baseball_passport_share_token_delete"
  ON baseball_player_passport_share_tokens FOR DELETE
  TO authenticated
  USING (is_baseball_team_coach_v2(team_id));

-- =============================================================================
-- Belt-and-suspenders: anon holds nothing on this table.
-- =============================================================================
REVOKE ALL ON baseball_player_passport_share_tokens FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON baseball_player_passport_share_tokens TO authenticated;

COMMENT ON TABLE baseball_player_passport_share_tokens IS
  'Scout Packet share links: opaque, revocable, per-(player,team) capability tokens an external college coach trades (server-side) for a viewerRole=other web packet. Never grants table access to anon; the public route resolves tokens with the server role and the read model enforces visibility_state + VISIBILITY_RANK>=2.';
COMMENT ON COLUMN baseball_player_passport_share_tokens.token IS
  'URL-safe opaque secret generated app-side. Readable only by team staff / subject player (RLS) and the server role; not a password hash (it is a share capability, re-displayable to the staff who minted it).';
