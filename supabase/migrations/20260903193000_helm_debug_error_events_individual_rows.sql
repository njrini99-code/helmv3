-- Helm Debug — make the forced-individual error row actually individual.
--
-- 20260903180000 created db_error_events with a unique index it described as
-- partial:
--   create unique index db_error_events_fingerprint_bucket_idx
--     on helm_debug.db_error_events (fingerprint, bucket_started_at)
--     where occurrence_count >= 1;
-- but `occurrence_count` is `integer not null default 1 check (>= 1)`, so that
-- predicate is TRUE for every row that can exist. The index is therefore a full
-- unique index on (fingerprint, bucket_started_at), which is exactly what the
-- file's own comment said it was avoiding.
--
-- The consequence is in the writer, not the index. `record_db_error_event`'s
-- `p_force_individual_row => true` branch — reserved for P0/P1, live caller
-- src/lib/observability/supabase/integrity.ts — does a plain INSERT with no
-- conflict handling. A second forced occurrence with the same fingerprint in
-- the same hour raises 23505, and `record-db-error.ts` is deliberately
-- fail-open, so the write is swallowed and that occurrence is lost. The flag
-- exists precisely to guarantee one row per occurrence; it guaranteed the
-- opposite.
--
-- Fix: give the aggregation an explicit discriminator instead of a predicate
-- that is always true. `is_individual` marks the forced rows, the unique index
-- covers only the aggregated ones, and the upsert's ON CONFLICT names the same
-- predicate so it still matches the index.
--
-- Safe to run as a plain DDL migration: verified against production before
-- writing this, `select count(*) from helm_debug.db_error_events` = 0, so there
-- are no existing rows to backfill or to collide during the index swap.
-- Found by review of PR #1792, on a migration already applied to production.

alter table helm_debug.db_error_events
add column if not exists is_individual boolean not null default false;

comment on column helm_debug.db_error_events.is_individual is
'True for rows written through record_db_error_event with
p_force_individual_row => true: P0/P1 occurrences that must never be folded
into an hour bucket. The unique (fingerprint, bucket_started_at) index
deliberately excludes these rows.';

drop index if exists helm_debug.db_error_events_fingerprint_bucket_idx;

create unique index if not exists db_error_events_fingerprint_bucket_idx
on helm_debug.db_error_events (fingerprint, bucket_started_at)
where not is_individual;

create or replace function public.record_db_error_event(
    p_service text,
    p_environment text,
    p_runtime text,
    p_feature text,
    p_action text,
    p_operation text,
    p_severity text,
    p_expectedness text,
    p_retryability text,
    p_fingerprint text,
    p_normalized_message text,
    p_terminal boolean default true,
    p_release_sha text default null::text,
    p_sport text default null::text,
    p_journey text default null::text,
    p_relation_name text default null::text,
    p_rpc_name text default null::text,
    p_function_name text default null::text,
    p_bucket_class text default null::text,
    p_error_code text default null::text,
    p_sqlstate text default null::text,
    p_postgrest_code text default null::text,
    p_auth_code text default null::text,
    p_storage_code text default null::text,
    p_http_status integer default null::integer,
    p_safe_details text default null::text,
    p_safe_hint text default null::text,
    p_helm_trace_id text default null::text,
    p_sentry_trace_id text default null::text,
    p_sentry_span_id text default null::text,
    p_duration_ms integer default null::integer,
    p_attempt integer default null::integer,
    p_safe_metadata jsonb default '{}'::jsonb,
    p_force_individual_row boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'helm_debug'
as $function$
declare
  v_id uuid;
  v_bucket timestamptz := date_trunc('hour', clock_timestamp());
  -- helm_private.trace_safe_metadata already exists (20260825200811) and
  -- strips the same accidental top-level secret keys; reused rather than
  -- redefined so the two observability writers cannot drift apart on this
  -- one rule.
  v_safe_metadata jsonb := helm_private.trace_safe_metadata(p_safe_metadata);
begin
  if p_force_individual_row then
    insert into helm_debug.db_error_events (
      service, environment, runtime, feature, action, operation, severity,
      expectedness, retryability, fingerprint, normalized_message, terminal,
      release_sha, sport, journey, relation_name, rpc_name, function_name,
      bucket_class, error_code, sqlstate, postgrest_code, auth_code,
      storage_code, http_status, safe_details, safe_hint, helm_trace_id,
      sentry_trace_id, sentry_span_id, duration_ms, attempt, safe_metadata,
      bucket_started_at, is_individual
    ) values (
      p_service, p_environment, p_runtime, p_feature, p_action, p_operation,
      p_severity, p_expectedness, p_retryability, p_fingerprint,
      p_normalized_message, p_terminal, p_release_sha, p_sport, p_journey,
      p_relation_name, p_rpc_name, p_function_name, p_bucket_class,
      p_error_code, p_sqlstate, p_postgrest_code, p_auth_code,
      p_storage_code, p_http_status, p_safe_details, p_safe_hint,
      p_helm_trace_id, p_sentry_trace_id, p_sentry_span_id, p_duration_ms,
      p_attempt, v_safe_metadata, v_bucket, true
    )
    returning id into v_id;
    return v_id;
  end if;

  insert into helm_debug.db_error_events (
    service, environment, runtime, feature, action, operation, severity,
    expectedness, retryability, fingerprint, normalized_message, terminal,
    release_sha, sport, journey, relation_name, rpc_name, function_name,
    bucket_class, error_code, sqlstate, postgrest_code, auth_code,
    storage_code, http_status, safe_details, safe_hint, helm_trace_id,
    sentry_trace_id, sentry_span_id, duration_ms, attempt, safe_metadata,
    bucket_started_at
  ) values (
    p_service, p_environment, p_runtime, p_feature, p_action, p_operation,
    p_severity, p_expectedness, p_retryability, p_fingerprint,
    p_normalized_message, p_terminal, p_release_sha, p_sport, p_journey,
    p_relation_name, p_rpc_name, p_function_name, p_bucket_class,
    p_error_code, p_sqlstate, p_postgrest_code, p_auth_code, p_storage_code,
    p_http_status, p_safe_details, p_safe_hint, p_helm_trace_id,
    p_sentry_trace_id, p_sentry_span_id, p_duration_ms, p_attempt,
    v_safe_metadata, v_bucket
  )
  on conflict (fingerprint, bucket_started_at) where not is_individual
  do update set
    occurrence_count = helm_debug.db_error_events.occurrence_count + 1,
    last_seen_at = clock_timestamp(),
    -- Refresh the evidence to the LATEST occurrence, not the first — a
    -- fingerprint's normalized_message/safe_details can legitimately vary
    -- occurrence to occurrence (e.g. a duration or a changed hint), and the
    -- most recent one is the more useful one for triage.
    normalized_message = excluded.normalized_message,
    safe_details = excluded.safe_details,
    safe_hint = excluded.safe_hint,
    duration_ms = excluded.duration_ms,
    attempt = excluded.attempt,
    helm_trace_id = excluded.helm_trace_id,
    sentry_trace_id = excluded.sentry_trace_id,
    sentry_span_id = excluded.sentry_span_id,
    severity = excluded.severity,
    expectedness = excluded.expectedness,
    terminal = excluded.terminal,
    safe_metadata = excluded.safe_metadata
  returning id into v_id;

  return v_id;
end;
$function$;

-- Tripwire: the grant surface must be exactly what 20260903180000 left behind,
-- and the index must no longer be unconditionally true.
do $tripwire$
declare
  v_fn oid := 'public.record_db_error_event(text, text, text, text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, text, text, text, text, text, text, integer, text, text, text, text, text, integer, integer, jsonb, boolean)'::regprocedure;
  v_pred text;
begin
  if has_function_privilege('anon', v_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'record_db_error_event is EXECUTE-able by anon or authenticated; it must be service_role only';
  end if;
  if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
    raise exception 'record_db_error_event is not EXECUTE-able by service_role; the writer cannot run';
  end if;

  select pg_get_expr(i.indpred, i.indrelid) into v_pred
  from pg_index i
  join pg_class c on c.oid = i.indexrelid
  where c.relname = 'db_error_events_fingerprint_bucket_idx';

  if v_pred is null or v_pred not like '%is_individual%' then
    raise exception
      'db_error_events_fingerprint_bucket_idx predicate is %, expected one naming is_individual', coalesce(v_pred, '<none>');
  end if;
end
$tripwire$;
