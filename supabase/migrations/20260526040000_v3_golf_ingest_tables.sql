-- W39-41 — auto-ingest schema (3 tables + RLS).
--
-- One purpose: store OAuth tokens + sync history + raw practice
-- sessions for the Arccos / Garmin / TrackMan integrations.
--
-- Token encryption: column type is text and stores ciphertext. The
-- ingest adapter is responsible for round-tripping plaintext via
-- pgcrypto or an application-layer KMS — never store raw tokens.
--
-- VERIFIED 2026-05-26 against prod project qmnssrrolpinvwjjnufo:
--   SELECT to_regclass('public.golf_ingest_connections')::text;  -> null
--   SELECT to_regclass('public.golf_ingest_sync_log')::text;     -> null
--   SELECT to_regclass('public.golf_practice_sessions')::text;   -> null
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.golf_practice_sessions;
--   DROP TABLE IF EXISTS public.golf_ingest_sync_log;
--   DROP TABLE IF EXISTS public.golf_ingest_connections;

-- ---------------------------------------------------------------------------
-- 1. Connections: one row per (player, provider). Stores OAuth state.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.golf_ingest_connections (
  player_id                uuid        NOT NULL REFERENCES public.golf_players(id) ON DELETE CASCADE,
  provider                 text        NOT NULL,
  access_token_encrypted   text        NOT NULL,
  refresh_token_encrypted  text,
  expires_at               timestamptz,
  last_synced_at           timestamptz,
  state                    text        NOT NULL DEFAULT 'active',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, provider),
  CONSTRAINT golf_ingest_connections_provider_check
    CHECK (provider IN ('arccos', 'garmin', 'trackman')),
  CONSTRAINT golf_ingest_connections_state_check
    CHECK (state IN ('active', 'expired', 'revoked', 'error'))
);

COMMENT ON TABLE public.golf_ingest_connections IS
  'v3 W39-41 OAuth-state per (player, provider). access_token_encrypted is ciphertext — adapters round-trip plaintext via app-layer KMS.';

ALTER TABLE public.golf_ingest_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ingest_connections_player_only ON public.golf_ingest_connections;
CREATE POLICY ingest_connections_player_only
  ON public.golf_ingest_connections
  FOR ALL
  TO authenticated
  USING (player_id = public.current_player_id())
  WITH CHECK (player_id = public.current_player_id());

-- ---------------------------------------------------------------------------
-- 2. Sync log: append-only per-invocation record.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.golf_ingest_sync_log (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        uuid        NOT NULL,
  provider         text        NOT NULL,
  shots_inserted   int         NOT NULL DEFAULT 0 CHECK (shots_inserted >= 0),
  rounds_inserted  int         NOT NULL DEFAULT 0 CHECK (rounds_inserted >= 0),
  errors_count     int         NOT NULL DEFAULT 0 CHECK (errors_count >= 0),
  error_detail     text,
  ran_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS golf_ingest_sync_log_player_idx
  ON public.golf_ingest_sync_log(player_id, ran_at DESC);

ALTER TABLE public.golf_ingest_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ingest_sync_log_player_read ON public.golf_ingest_sync_log;
CREATE POLICY ingest_sync_log_player_read
  ON public.golf_ingest_sync_log
  FOR SELECT
  TO authenticated
  USING (player_id = public.current_player_id());

-- ---------------------------------------------------------------------------
-- 3. Practice sessions: raw practice JSON keyed off TrackMan etc.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.golf_practice_sessions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     uuid        NOT NULL REFERENCES public.golf_players(id) ON DELETE CASCADE,
  source        text        NOT NULL,
  session_date  date        NOT NULL,
  shots_data    jsonb       NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS golf_practice_sessions_player_idx
  ON public.golf_practice_sessions(player_id, session_date DESC);

ALTER TABLE public.golf_practice_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS practice_sessions_player_only ON public.golf_practice_sessions;
CREATE POLICY practice_sessions_player_only
  ON public.golf_practice_sessions
  FOR ALL
  TO authenticated
  USING (player_id = public.current_player_id())
  WITH CHECK (player_id = public.current_player_id());

-- Coach can read practice sessions for their team's players.
DROP POLICY IF EXISTS practice_sessions_coach_read ON public.golf_practice_sessions;
CREATE POLICY practice_sessions_coach_read
  ON public.golf_practice_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_team_members tm
      WHERE tm.player_id = golf_practice_sessions.player_id
        AND tm.status = 'active'
        AND public.is_team_coach(tm.team_id)
    )
  );
