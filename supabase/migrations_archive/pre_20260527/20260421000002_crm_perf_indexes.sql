-- ============================================================================
-- CRM + Resend activity performance indexes
-- Task C.6 in docs/superpowers/plans/2026-04-21-perf-remediation.md
-- Audit: docs/perf-audit/06-crm.md (P0-1, P0-5, #2 in Resend specifics)
-- ============================================================================
-- Composite index to cover the CRM coach-table default sort:
--   ORDER BY is_starred DESC, priority DESC, updated_at DESC
-- Without this, Postgres does an in-memory sort of the full result after the
-- scan. Once the list payload is also narrowed (Task C.5), the sort becomes
-- the dominant cost at scale.
CREATE INDEX IF NOT EXISTS idx_crm_coaches_list_sort
  ON crm_coaches (is_starred DESC, priority DESC, updated_at DESC);

-- ============================================================================
-- Resend activity stats indexes
-- ============================================================================
-- The stats RPC filters with WHERE (sent_at >= X OR first_seen_at >= X). The
-- OR across two columns can't use either existing single-column index, so
-- it falls back to a sequential scan on every 60-second poll. These two
-- partial indexes cover each arm of the OR independently — the planner can
-- union the results instead of scanning the whole table.
--
-- Note: the `emails` snapshot table is the primary target here. If it does
-- not exist in this environment, these statements no-op (IF NOT EXISTS does
-- not help for missing tables; we guard with DO blocks).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'emails') THEN
    CREATE INDEX IF NOT EXISTS idx_emails_sent_at
      ON emails (sent_at DESC)
      WHERE sent_at IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_emails_first_seen_at
      ON emails (first_seen_at DESC)
      WHERE first_seen_at IS NOT NULL;
  END IF;
END$$;

-- ============================================================================
-- email_events — recent-events feed index
-- ============================================================================
-- LiveActivityFeed subscribes to INSERTs and also pulls the most-recent 50
-- rows on mount. An index on occurred_at DESC supports both the initial
-- load and any time-windowed filters added later (task C.7 adds a
-- server-side filter to the realtime subscription).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'email_events') THEN
    CREATE INDEX IF NOT EXISTS idx_email_events_occurred_at_desc
      ON email_events (occurred_at DESC);
  END IF;
END$$;
