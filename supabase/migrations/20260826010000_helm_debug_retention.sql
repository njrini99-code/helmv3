-- Helm Debug Retention
--
-- RISK TIER: R3 (privileged) per memory/system/golfhelm-engineering-os.md.
-- This migration defines an owner-rights (security-definer) function,
-- changes grants on a production schema, and prunes rows from a live table.
-- Daily reliability work may investigate and prepare it but must never
-- apply it; only the owner executes the production apply, and
-- db-migration-reviewer review is mandatory before that happens. See
-- supabase/migrations/HELD.md for this file's current apply status.
--
-- DEPENDS ON: 20260825200811_helm_flight_recorder.sql — NOT YET APPLIED as of
-- this writing (see supabase/migrations/HELD.md: helm_debug schema confirmed
-- absent from the production catalog, 2026-08-25 read-only check). Apply the
-- two together. This file's function body references helm_debug.trace_runs /
-- helm_debug.trace_steps by name only inside PL/pgSQL, so CREATE FUNCTION
-- itself will succeed even if the recorder migration has not run yet in a
-- given environment — but calling public.helm_debug_prune() before that
-- schema exists fails at execution time with an undefined-table error. This
-- migration does not create helm_debug; it only prunes it.
--
-- WHY
-- ---
-- helm_debug.trace_runs / trace_steps are flight-recorder diagnostics for
-- reconstructing a failed round-submit transaction, not business records —
-- they exist to be read for a few days after an incident, not kept forever.
-- Without a retention path the tables grow unbounded (every traced
-- submit_round_atomic / save_partial_round_atomic call writes a run plus one
-- row per checkpoint). This migration adds the prune function only; nothing
-- in this file schedules it — see "Scheduling options" below.
--
-- FK order: helm_debug.trace_steps.trace_id REFERENCES
-- helm_debug.trace_runs(trace_id) ON DELETE CASCADE (20260825200811, line
-- 50). Deleting helm_debug.trace_runs alone would already cascade-delete its
-- trace_steps, but this function deletes trace_steps explicitly first so it
-- can report an accurate deleted-step count instead of only a run count.
--
-- VERIFIED: cannot verify prod state for a table this migration's own
-- dependency has not yet created (see DEPENDS ON above). Once
-- 20260825200811 is live, verify with:
--   select count(*) from helm_debug.trace_runs
--   where started_at < now() - interval '30 days';
--
-- ROLLBACK: DROP FUNCTION public.helm_debug_prune(integer); — safe, this
-- file defines no tables and no other migration calls this function.

create or replace function public.helm_debug_prune(
    p_retention_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, helm_debug
as $$
declare
  v_retention_days integer := greatest(1, least(coalesce(p_retention_days, 30), 3650));
  v_cutoff timestamptz := clock_timestamp() - make_interval(days => v_retention_days);
  v_deleted_steps bigint := 0;
  v_deleted_runs bigint := 0;
begin
  -- Child rows first (see FK-order note in the header comment above).
  -- DELETE and its WHERE stay on one line by convention in this repo (see
  -- this file's own guard-sql.sh: a DELETE whose WHERE clause is not on the
  -- same line is indistinguishable, to a line-based scanner, from a DELETE
  -- with no WHERE clause at all).
  with doomed_runs as (
    select trace_id from helm_debug.trace_runs where started_at < v_cutoff
  ),
  deleted_steps as (
    delete from helm_debug.trace_steps where trace_id in (select trace_id from doomed_runs)
    returning 1
  )
  select count(*) into v_deleted_steps from deleted_steps;

  with deleted_runs as (
    delete from helm_debug.trace_runs where started_at < v_cutoff
    returning 1
  )
  select count(*) into v_deleted_runs from deleted_runs;

  return jsonb_build_object(
    'cutoff', v_cutoff,
    'retention_days', v_retention_days,
    'deleted_trace_steps', v_deleted_steps,
    'deleted_trace_runs', v_deleted_runs
  );
end;
$$;

revoke execute on function public.helm_debug_prune(integer)
from public, anon, authenticated;
grant execute on function public.helm_debug_prune(integer) to service_role;

-- Standard ACL-assertion tripwire (matches 20260704130000's
-- run_integrity_checks pattern), fixed to resolve by full signature instead
-- of name only: a bare "WHERE proname = ..." SELECT ... INTO is not STRICT,
-- so if an overload of this function is ever added it would silently keep
-- an arbitrary matching row instead of failing loud. The ::regprocedure
-- cast itself raises if no function matches the exact signature, and can
-- never resolve to more than one row.
do $$
declare v_fn oid := 'public.helm_debug_prune(integer)'::regprocedure;
begin
  if has_function_privilege('public', v_fn, 'EXECUTE')
     or has_function_privilege('anon', v_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception
      'ACL check failed: helm_debug_prune(integer) callable by public/anon/authenticated';
  end if;

  if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
    raise exception
      'ACL check failed: helm_debug_prune(integer) not executable by service_role';
  end if;
end $$;

-- Scheduling options for the owner (nothing below is executed by this
-- migration — pick one, or wire it up separately, once both this file and
-- 20260825200811 are applied together):
--
-- Option A — pg_cron, in-database (mirrors 20260703043000's
-- admin_events retention job; requires the pg_cron extension):
--
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--
--   SELECT cron.schedule(
--     'prune-helm-debug-traces',
--     '30 4 * * *',
--     $job$ SELECT public.helm_debug_prune(30); $job$
--   );
--
-- Option B — Vercel cron hitting an API route that calls this RPC on the
-- service-role client (keeps scheduling out of the database):
--
--   // vercel.json
--   { "crons": [{ "path": "/api/cron/helm-debug-prune",
--                "schedule": "30 4 * * *" }] }
--
--   // src/app/api/cron/helm-debug-prune/route.ts (sketch — verify the
--   // shared cron-auth check used by other /api/cron routes before shipping)
--   const supabase = createAdminClient();
--   const { data, error } = await supabase
--     .rpc('helm_debug_prune', { p_retention_days: 30 });
