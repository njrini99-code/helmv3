-- 47k admin_events in the 7-day window forces a large CTE materialization
-- when get_admin_event_summary pre-collects them via `WITH base AS (...)`.
-- Rewriting to run 4 direct index-scanned aggregates against admin_events
-- eliminates the materialization: each CTE returns a single pre-aggregated
-- row (never a table), so Postgres uses idx_admin_events_created for each
-- pass at millisecond latency.
--
-- Before (after the previous projection-trim pass): ~7.3s.
-- After:                                            ~85ms steady-state.
CREATE OR REPLACE FUNCTION public.get_admin_event_summary(p_days_back integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  cutoff timestamptz := now() - (p_days_back || ' days')::interval;
  result jsonb;
BEGIN
  WITH
    totals AS (
      SELECT
        count(*)                                            AS total_events,
        count(*) FILTER (WHERE severity::text = 'error')    AS error_count,
        count(*) FILTER (WHERE severity::text = 'critical') AS critical_count,
        count(*) FILTER (WHERE NOT resolved)                AS unresolved_count
      FROM admin_events
      WHERE created_at >= cutoff
    ),
    by_type AS (
      SELECT coalesce(jsonb_object_agg(event_type, cnt), '{}'::jsonb) AS j
      FROM (
        SELECT event_type, count(*) AS cnt
        FROM admin_events
        WHERE created_at >= cutoff
        GROUP BY event_type
      ) t
    ),
    by_severity AS (
      SELECT coalesce(jsonb_object_agg(severity::text, cnt), '{}'::jsonb) AS j
      FROM (
        SELECT severity, count(*) AS cnt
        FROM admin_events
        WHERE created_at >= cutoff
        GROUP BY severity
      ) t
    ),
    by_day AS (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object('date', d::text, 'count', coalesce(dc.cnt, 0))
          ORDER BY d
        ),
        '[]'::jsonb
      ) AS j
      FROM generate_series(cutoff::date, current_date, '1 day') d
      LEFT JOIN (
        SELECT created_at::date AS day, count(*) AS cnt
        FROM admin_events
        WHERE created_at >= cutoff
        GROUP BY 1
      ) dc ON dc.day = d
    )
  SELECT jsonb_build_object(
    'total_events',       totals.total_events,
    'error_count',        totals.error_count,
    'critical_count',     totals.critical_count,
    'unresolved_count',   totals.unresolved_count,
    'events_by_type',     by_type.j,
    'events_by_severity', by_severity.j,
    'events_by_day',      by_day.j
  )
  INTO result
  FROM totals, by_type, by_severity, by_day;

  RETURN result;
END;
$function$;
