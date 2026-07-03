-- ============================================================================
-- Advisors cleanup, mechanical half:
-- 1. Drop the four literal duplicate indexes (duplicate_index findings) —
--    each pair indexes identical columns on the same table. Kept index named
--    in each comment. golf_prediction_model_performance is guarded: the
--    *_key index backs a UNIQUE constraint, so only the standalone duplicate
--    is droppable, whichever that turns out to be.
-- 2. Pin search_path on the two flagged trigger functions
--    (function_search_path_mutable findings).
--
-- APPLIED TO PROD 2026-07-03 via MCP (drop_duplicate_indexes_pin_search_paths)
-- before this file merged; kept in-repo as source of truth.
-- ============================================================================

-- keep idx_admin_analytics_events_created
DROP INDEX IF EXISTS public.idx_analytics_events_created_at;
-- keep idx_admin_events_dashboard
DROP INDEX IF EXISTS public.idx_admin_events_event_severity_created;
-- keep idx_email_events_occurred_at (btree serves DESC scans too)
DROP INDEX IF EXISTS public.idx_email_events_occurred_at_desc;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class i ON i.oid = c.conindid
    WHERE i.relname = 'golf_prediction_model_performance_natural_key'
  ) THEN
    DROP INDEX IF EXISTS public.golf_prediction_model_performance_natural_key;
  ELSE
    RAISE NOTICE 'natural_key backs a constraint — dropping the sibling instead';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class i ON i.oid = c.conindid
      WHERE i.relname = 'golf_prediction_model_perform_team_id_model_type_period_sta_key'
    ) THEN
      DROP INDEX IF EXISTS public.golf_prediction_model_perform_team_id_model_type_period_sta_key;
    END IF;
  END IF;
END $$;

ALTER FUNCTION public.golf_recruit_documents_assert_same_team() SET search_path = public, pg_temp;
ALTER FUNCTION public.golf_recruit_documents_touch_updated_at() SET search_path = public, pg_temp;
