-- Gate the two ungated CRM SECURITY DEFINER RPCs to admins only.
-- Both were executable by ANY authenticated user (coach/player), exposing
-- CRM calendar events and outreach analytics. Same admin-gate pattern as
-- get_audit_log_recent (ERRCODE 42501).
-- APPLIED to prod 2026-07-04 via MCP (mirrored here for the record).

CREATE OR REPLACE FUNCTION public.get_crm_events_in_range(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(id uuid, title text, description text, event_type crm_event_type, start_time timestamp with time zone, end_time timestamp with time zone, all_day boolean, location text, meeting_url text, coach_id uuid, coach_name text, coach_school text, status text, google_event_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT
    e.id, e.title, e.description, e.event_type,
    e.start_time, e.end_time, e.all_day, e.location, e.meeting_url,
    e.coach_id, c.name as coach_name, c.school as coach_school,
    e.status, e.google_event_id
  FROM crm_events e
  LEFT JOIN crm_coaches c ON c.id = e.coach_id
  WHERE e.start_time >= p_start AND e.start_time < p_end
  ORDER BY e.start_time;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_crm_time_to_open(p_window text DEFAULT '30d'::text)
 RETURNS TABLE(bucket_min integer, bucket_max integer, count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH window_days AS (
    SELECT (CASE p_window WHEN '7d' THEN now() - interval '7 days' WHEN '30d' THEN now() - interval '30 days' WHEN '90d' THEN now() - interval '90 days' ELSE now() - interval '30 days' END) AS since
  ),
  paired AS (
    SELECT sent.contact_log_id, EXTRACT(EPOCH FROM (MIN(opened.occurred_at) - sent.occurred_at)) AS seconds_to_open
    FROM email_events sent
    JOIN email_events opened ON opened.contact_log_id = sent.contact_log_id AND opened.event_type = 'email.opened' AND opened.occurred_at > sent.occurred_at
    WHERE sent.event_type = 'email.sent' AND sent.occurred_at >= (SELECT since FROM window_days)
    GROUP BY sent.contact_log_id, sent.occurred_at
  ),
  bucketed AS (
    SELECT CASE WHEN seconds_to_open < 60 THEN '0-60' WHEN seconds_to_open < 600 THEN '60-600' WHEN seconds_to_open < 3600 THEN '600-3600' WHEN seconds_to_open < 14400 THEN '3600-14400' WHEN seconds_to_open < 86400 THEN '14400-86400' ELSE '86400+' END AS bucket FROM paired
  )
  SELECT (split_part(bucket, '-', 1))::int, CASE WHEN bucket = '86400+' THEN 999999 ELSE (split_part(bucket, '-', 2))::int END, COUNT(*)::int
  FROM bucketed GROUP BY bucket ORDER BY 1;
END;
$function$;
