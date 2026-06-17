-- =============================================================================
-- Demo Sessions Table — golf_demo_sessions
-- =============================================================================
-- Purpose: captures WHO enters the shared demo coach experience at /golf/demo.
-- Written by the DATA agent; executed by the orchestrator via Supabase MCP.
-- Reads: admin client (service-role) from the gate server action + admin view.
-- NO public select/insert policies — service-role bypasses RLS automatically.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS; policy guards wrapped in DO blocks.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.golf_demo_sessions (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  email       text        NOT NULL,
  school      text,                          -- org / college the visitor typed
  ip          text,
  user_agent  text,
  referrer    text,
  entered_at  timestamptz NOT NULL DEFAULT now(),
  metadata    jsonb       NOT NULL DEFAULT '{}',

  CONSTRAINT golf_demo_sessions_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE public.golf_demo_sessions IS
  'Captures every visitor who enters the shared demo coach experience. '
  'Written exclusively by the gate server action (admin/service-role client). '
  'No public access — service-role bypasses RLS for inserts; admin reads via createAdminClient().';

-- Enable RLS (no-op if already enabled).
ALTER TABLE public.golf_demo_sessions ENABLE ROW LEVEL SECURITY;

-- No public access. The service-role key bypasses RLS entirely, so the gate
-- action and admin view work without any grant. We still ship an explicit
-- RESTRICTIVE deny-all policy so the table's access model is unambiguous and to
-- satisfy the project rule that every RLS-enabled table defines >= 1 policy.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'golf_demo_sessions'
      AND policyname = 'golf_demo_sessions_deny_all'
  ) THEN
    CREATE POLICY "golf_demo_sessions_deny_all"
      ON public.golf_demo_sessions
      AS RESTRICTIVE
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- Speed index for the admin tracing view (list by entry time).
CREATE INDEX IF NOT EXISTS golf_demo_sessions_entered_at_idx
  ON public.golf_demo_sessions (entered_at DESC);

-- Optional: index by email for dedup / replay detection.
CREATE INDEX IF NOT EXISTS golf_demo_sessions_email_idx
  ON public.golf_demo_sessions (email);
