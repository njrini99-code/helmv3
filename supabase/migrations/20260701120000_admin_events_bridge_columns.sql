-- W2: Helm Bridge additive columns on admin_events (90k+ rows, live writers in
-- ~230 files — ADDITIVE ONLY, writer API stays backward-compatible). Columns
-- land BEFORE any emitter references them (schema-drift gotcha: ingest against a
-- missing column silently drops the field).
ALTER TABLE public.admin_events
  ADD COLUMN IF NOT EXISTS sport text,
  ADD COLUMN IF NOT EXISTS team_id uuid,
  ADD COLUMN IF NOT EXISTS fingerprint text,
  ADD COLUMN IF NOT EXISTS source text;

-- NOT VALID so the ALTER takes no full-table validation lock on a 90k-row live
-- table; existing NULL rows pass anyway, new writes validate.
ALTER TABLE public.admin_events
  ADD CONSTRAINT admin_events_sport_check
  CHECK (sport IS NULL OR sport IN ('golf','baseball','shared')) NOT VALID;

ALTER TABLE public.admin_events
  ADD CONSTRAINT admin_events_source_check
  CHECK (source IS NULL OR source IN (
    'server_action','route_handler','server_component','background_job','request_hook',
    'rls_denial','auth','cron','integrity','client','system'
  )) NOT VALID;

-- Triage-queue indexes (partial where the queue reads).
CREATE INDEX IF NOT EXISTS idx_admin_events_fingerprint
  ON public.admin_events (fingerprint, created_at DESC)
  WHERE fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_events_unresolved_fingerprint
  ON public.admin_events (fingerprint, severity)
  WHERE NOT resolved AND fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_events_source_created
  ON public.admin_events (source, created_at DESC)
  WHERE source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_events_team
  ON public.admin_events (team_id, created_at DESC)
  WHERE team_id IS NOT NULL;

-- ── ACL hardening (reground §2.6 + W1 recon, confirmed against live policies) ──
-- admin_events carried a legacy table-level GRANT to anon + authenticated.
-- Live RLS policies are: SELECT/UPDATE -> authenticated WHERE role='admin'
-- (the still-live /golf/admin UI + its Realtime subscription use these via the
-- user-scoped client); INSERT -> service_role only. Therefore:
--   * REVOKE anon entirely — anon has NO policy, so the grant is pure latent risk.
--   * REVOKE authenticated INSERT — no authenticated INSERT policy exists (dead weight).
--   * KEEP authenticated SELECT + UPDATE — the legacy admin RLS needs them; removed
--     in W14 when /golf/admin is retired and Helm Bridge reads via service_role only.
REVOKE ALL ON TABLE public.admin_events FROM anon;
REVOKE INSERT ON TABLE public.admin_events FROM authenticated;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.admin_events', 'SELECT')
     OR has_table_privilege('anon', 'public.admin_events', 'INSERT')
     OR has_table_privilege('anon', 'public.admin_events', 'UPDATE')
     OR has_table_privilege('anon', 'public.admin_events', 'DELETE')
     OR has_table_privilege('authenticated', 'public.admin_events', 'INSERT') THEN
    RAISE EXCEPTION 'ACL check failed: admin_events over-granted (anon any / authenticated INSERT)';
  END IF;
  -- Assert the legacy authenticated read/update path is intact (must NOT be revoked here).
  IF NOT has_table_privilege('authenticated', 'public.admin_events', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.admin_events', 'UPDATE') THEN
    RAISE EXCEPTION 'ACL check failed: legacy authenticated SELECT/UPDATE on admin_events was dropped (breaks /golf/admin)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='admin_events' AND column_name='fingerprint'
  ) THEN
    RAISE EXCEPTION 'Column check failed: admin_events.fingerprint missing';
  END IF;
END $$;
