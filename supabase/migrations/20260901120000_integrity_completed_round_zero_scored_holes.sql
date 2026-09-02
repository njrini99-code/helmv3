-- Integrity check 6 — a COMPLETED round with no scored hole is not a round.
--
-- Found 2026-08-31 in production: four rounds with status='completed',
-- holes_played=18 and a total_score, backed by ZERO golf_holes rows carrying a
-- score. They are not a lifecycle failure — they are seeded fixtures, and the
-- evidence is in the ids: 0b000000-0000-4000-b000-00000000000{1,2,3,4}, three
-- of them sharing created_at to the microsecond (19:01:27.511173+00), every
-- updated_at equal to its created_at, no course_id, and current_hole=1 while
-- holes_played=18. No application path writes a patterned sequential uuid.
-- They reached the table through a direct service-role insert.
--
-- The check is added anyway, and deliberately fails on them: whether the cause
-- is a seed or a save path that lost its holes, "completed with nothing scored"
-- is a state a player can be shown and analytics will count, and nothing was
-- watching for it. `save_partial_round_atomic` is a REPLACE (it deletes a
-- round's holes and shots and rebuilds them from the client payload), so a
-- malformed payload arriving after a durable write is a real route into this
-- state, not only a seeding artifact.
--
-- Expect this to report `fail` with count=4 until the fixtures are removed.
-- That is the intended reading: the alert is correct and the DATA is wrong.
--
-- R3 (privileged: SECURITY DEFINER, service_role-only EXECUTE). Prepared by an
-- agent; only the owner applies. Verify before applying that the function has
-- not moved underneath this file — live md5 read 2026-09-01:
--   ae683fa1797204f933b261714d3dba84  (length 3789)
-- Re-run and STOP if it differs, because CREATE OR REPLACE silently discards
-- whatever changed:
--   select md5(
--     pg_get_functiondef('public.run_integrity_checks()'::regprocedure));
--
-- Checks 1-5 below are reproduced VERBATIM from that live definition. The only
-- addition is check 6.

CREATE OR REPLACE FUNCTION public.run_integrity_checks()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v jsonb := '[]'::jsonb;
  n bigint;
  sample jsonb;
BEGIN
  -- 1. Orphaned golf team members
  SELECT count(*), COALESCE(jsonb_agg(id) FILTER (WHERE rn <= 5), '[]'::jsonb)
  INTO n, sample
  FROM (
    SELECT m.id, row_number() OVER () AS rn
    FROM golf_team_members m
    LEFT JOIN golf_teams t ON t.id = m.team_id
    WHERE m.team_id IS NOT NULL AND t.id IS NULL
  ) q;
  v := v || jsonb_build_object('check', 'orphaned_golf_team_members',
    'status', CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 'count', n, 'sample', sample);

  -- 2. Stats-cache rows referencing deleted players
  SELECT count(*), COALESCE(jsonb_agg(id) FILTER (WHERE rn <= 5), '[]'::jsonb)
  INTO n, sample
  FROM (
    SELECT c.id, row_number() OVER () AS rn
    FROM golf_player_stats_cache c
    LEFT JOIN golf_players p ON p.id = c.player_id
    WHERE p.id IS NULL
  ) q;
  v := v || jsonb_build_object('check', 'stats_cache_deleted_players',
    'status', CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 'count', n, 'sample', sample);

  -- 3. Schema canaries
  SELECT count(*) INTO n FROM (
    SELECT 1 WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='admin_allowlist')
    UNION ALL
    SELECT 1 WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='admin_events' AND column_name='fingerprint')
    UNION ALL
    SELECT 1 WHERE NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
      WHERE ns.nspname='public' AND p.proname='is_super_admin')
  ) missing;
  v := v || jsonb_build_object('check', 'bridge_schema_canaries',
    'status', CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 'count', n, 'sample', '[]'::jsonb);

  -- 4. Anon-grant drift on Bridge-sensitive objects
  SELECT count(*), COALESCE(jsonb_agg(objname) FILTER (WHERE rn <= 5), '[]'::jsonb)
  INTO n, sample
  FROM (
    SELECT c.relname AS objname, row_number() OVER () AS rn
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public'
      AND c.relname IN ('admin_allowlist', 'admin_events', 'error_logs', 'background_job_logs', 'audit_log', 'login_attempts')
      AND (has_table_privilege('anon', c.oid, 'SELECT')
        OR has_table_privilege('anon', c.oid, 'INSERT')
        OR has_table_privilege('anon', c.oid, 'UPDATE')
        OR has_table_privilege('anon', c.oid, 'DELETE'))
  ) q;
  v := v || jsonb_build_object('check', 'anon_grant_drift',
    'status', CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 'count', n, 'sample', sample);

  -- 5. Admin-UI browser-client readability (count-vs-list tripwire)
  SELECT count(*), COALESCE(jsonb_agg(objname) FILTER (WHERE rn <= 15), '[]'::jsonb)
  INTO n, sample
  FROM (
    SELECT t.tbl AS objname, row_number() OVER () AS rn
    FROM unnest(ARRAY[
      'demo_requests', 'crm_coaches', 'crm_contact_log', 'crm_events',
      'crm_email_templates', 'crm_notes', 'crm_replies', 'crm_segments',
      'crm_sequences', 'crm_sequence_steps', 'crm_sequence_enrollments',
      'crm_tasks', 'crm_automations', 'crm_email_suppressions', 'email_events'
    ]) AS t(tbl)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = t.tbl
        AND p.cmd IN ('SELECT', 'ALL')
        AND p.roles && ARRAY['authenticated', 'public']::name[]
    )
  ) q;
  v := v || jsonb_build_object('check', 'admin_count_vs_list_readability',
    'status', CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 'count', n, 'sample', sample);

  -- 6. Completed rounds carrying no scored hole (NEW — 2026-09-01)
  --    Newest first, so the sample names the most recent occurrences rather
  --    than whichever rows the planner happened to emit first.
  SELECT count(*), COALESCE(jsonb_agg(id) FILTER (WHERE rn <= 5), '[]'::jsonb)
  INTO n, sample
  FROM (
    SELECT r.id, row_number() OVER (ORDER BY r.created_at DESC) AS rn
    FROM golf_rounds r
    WHERE r.status = 'completed'
      AND NOT EXISTS (
        SELECT 1 FROM golf_holes h
        WHERE h.round_id = r.id AND h.score IS NOT NULL
      )
  ) q;
  v := v || jsonb_build_object('check', 'completed_round_zero_scored_holes',
    'status', CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 'count', n, 'sample', sample);

  RETURN v;
END;
$function$;
