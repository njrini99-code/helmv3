-- Helm Debug — let the query-statistics snapshot resolve pg_stat_statements.
--
-- 20260903180200 created public.helm_debug_stat_statements_snapshot with a
-- pinned `search_path = pg_catalog, helm_debug`, which is the right instinct
-- for a definer-rights function: a caller must not be able to shadow the
-- objects it reads. But on this project `pg_stat_statements` 1.11 is installed
-- into the `extensions` schema, not `pg_catalog`, so the function's unqualified
-- references to `pg_stat_statements_info` and `pg_stat_statements` resolved to
-- nothing and every call failed with 42P01 "relation does not exist".
--
-- Measured against production on 2026-09-03, immediately after the owner-
-- authorised apply of 20260903180000-180300:
--   select public.helm_debug_stat_statements_snapshot(5);
--   ERROR: 42P01 relation "pg_stat_statements_info" does not exist
-- and:
--   select extname, extversion, n.nspname from pg_extension e
--     join pg_namespace n on n.oid = e.extnamespace
--     where extname = 'pg_stat_statements';
--   -> pg_stat_statements | 1.11 | extensions
--
-- Left unfixed, /api/cron/db-stat-delta would have raised this every 15
-- minutes forever and the delta engine would never have recorded a row.
--
-- The fix adds exactly one schema to the pinned path. It does NOT add `public`
-- and does NOT unpin the path, so the hardening the original migration reached
-- for is preserved: `extensions` is platform-owned and is not writable by
-- `anon`, `authenticated`, or any application role, so it cannot be used to
-- shadow anything. The body is untouched — ALTER FUNCTION ... SET is used
-- rather than CREATE OR REPLACE precisely so this migration cannot silently
-- change classification logic it does not mention.

alter function public.helm_debug_stat_statements_snapshot(integer)
  set search_path = pg_catalog, extensions, helm_debug;

-- Tripwire: the grant surface must be exactly what 20260903180200 left behind.
-- ALTER FUNCTION ... SET does not touch ACLs; this asserts that rather than
-- assuming it.
do $$
declare
  v_fn oid := 'public.helm_debug_stat_statements_snapshot(integer)'::regprocedure;
begin
  if has_function_privilege('anon', v_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception
      'helm_debug_stat_statements_snapshot is EXECUTE-able by anon or authenticated; it must be service_role only';
  end if;
  if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
    raise exception
      'helm_debug_stat_statements_snapshot is not EXECUTE-able by service_role; the collector cannot run';
  end if;
end
$$;
