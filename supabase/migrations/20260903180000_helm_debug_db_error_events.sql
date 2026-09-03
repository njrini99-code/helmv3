-- Helm Debug — private database error event store (brief §8)
--
-- RISK TIER: R3 (privileged) per memory/system/golfhelm-engineering-os.md.
-- Adds a new table + a SECURITY DEFINER RPC facade + grant changes on a
-- production schema. HELD — see supabase/migrations/HELD.md. Never applied
-- by an agent; owner-apply-only after db-migration-reviewer sign-off.
--
-- WHY
-- ---
-- `helm_debug.trace_runs`/`trace_steps` (20260825200811) answer "walk me
-- through one traced workflow." This table answers a different question:
-- "what Supabase/Postgres failures has the app actually observed, deduped,
-- with enough context to triage without a log drain." It is the durable
-- half of brief §2's design: a rolled-back transaction erases its own
-- writes, so the out-of-band write happens in a SEPARATE transaction, after
-- the failed request already returned to its caller
-- (src/lib/observability/supabase/record-db-error.ts).
--
-- ISOLATION, same pattern as 20260825200811 (see its header comment): this
-- schema is revoked from public/anon/authenticated, is not exposed to
-- PostgREST, and the only access path is the SECURITY DEFINER facade below.
-- Measured against production 2026-09-03
-- (docs/observability/SUPABASE_OBSERVABILITY_MEASURED_TRUTH.md §3):
-- `has_schema_privilege('service_role','helm_debug','USAGE')` is FALSE even
-- for service_role — access is mediated entirely by owner-rights functions,
-- never by direct table grants. This migration follows that same design.
--
-- DEDUPE MODEL (brief §8) — "hybrid": most failures are aggregated by
-- fingerprint + hour bucket (occurrence_count/first_seen_at/last_seen_at,
-- refreshing the latest safe_details/safe_hint/normalized_message on each
-- occurrence); `p_force_individual_row => true` (reserved for P0/P1
-- data-integrity or security-critical events a caller wants one row per
-- occurrence for) always inserts a fresh row instead of upserting.
--
-- PRIVACY (brief §6) — every text column here is written by
-- `buildSupabaseErrorEnvelope`/`sanitizeSupabaseFreeText`
-- (src/lib/observability/supabase/envelope.ts), which strips UUIDs, masks
-- emails, strips embedded URL secrets and bounds length BEFORE this
-- function ever sees the value. This migration cannot re-verify that at the
-- SQL layer (no way to prove a string wasn't secret-shaped), so it does the
-- one thing SQL can enforce structurally: no column here accepts a JWT,
-- cookie, password, or raw request-body/SQL-parameter shape by design —
-- there is no such column at all.
--
-- ROLLBACK: DROP FUNCTION public.record_db_error_event(...); DROP TABLE
-- helm_debug.db_error_events; — safe, no other migration/table references
-- either object.

-- helm_debug already exists in production (confirmed 2026-09-03, see the
-- measured-truth doc) via 20260825200811; `create schema if not exists`
-- keeps this migration independently applicable in an environment where
-- that migration has not run (e.g. a fresh local stack applying all
-- migrations from zero).
create schema if not exists helm_debug;
revoke all on schema helm_debug from public;

create table if not exists helm_debug.db_error_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default clock_timestamp(),
  occurred_at timestamptz not null default clock_timestamp(),
  -- Hour bucket of occurred_at — a real column (not computed at query time)
  -- so the aggregate-path unique index below can key on it directly.
  bucket_started_at timestamptz not null default date_trunc('hour', clock_timestamp()),
  source text not null default 'supabase' check (source = 'supabase'),
  service text not null check (service in (
    'postgrest', 'postgres', 'auth', 'storage', 'realtime',
    'edge_function', 'pg_cron', 'pg_net'
  )),
  environment text not null default 'unknown',
  release_sha text,
  runtime text not null check (runtime in ('browser', 'node', 'edge', 'postgres')),
  sport text,
  feature text not null,
  action text not null,
  journey text,
  operation text not null check (operation in (
    'select', 'insert', 'update', 'delete', 'upsert', 'rpc', 'auth',
    'upload', 'download', 'subscribe', 'invoke', 'job'
  )),
  relation_name text,
  rpc_name text,
  function_name text,
  bucket_class text,
  error_code text,
  sqlstate text,
  postgrest_code text,
  auth_code text,
  storage_code text,
  http_status integer,
  severity text not null check (severity in ('info', 'warning', 'error', 'critical')),
  expectedness text not null check (expectedness in (
    'expected', 'routine_recovery', 'unexpected', 'unknown'
  )),
  retryability text not null check (retryability in ('yes', 'no', 'conditional', 'unknown')),
  terminal boolean not null default true,
  fingerprint text not null,
  normalized_message text not null,
  safe_details text,
  safe_hint text,
  helm_trace_id text,
  sentry_trace_id text,
  sentry_span_id text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  attempt integer check (attempt is null or attempt >= 0),
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  first_seen_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  -- Small closed jsonb bag; the writer never places an unsanitized value
  -- here (see file header). Not a schema-level guarantee — a code-review
  -- surface, same trust boundary trace_safe_metadata documents for
  -- 20260825200811's helm_private.trace_safe_metadata().
  safe_metadata jsonb not null default '{}'::jsonb
);

-- Aggregate-path dedupe key. A partial unique index (not a table-wide
-- constraint) so `p_force_individual_row => true` rows — which never
-- populate this pair the same way twice by design — are never blocked by
-- it; those rows are distinguished at the RPC layer, not here.
create unique index if not exists db_error_events_fingerprint_bucket_idx
  on helm_debug.db_error_events (fingerprint, bucket_started_at)
  where occurrence_count >= 1;

create index if not exists db_error_events_occurred_at_idx
  on helm_debug.db_error_events (occurred_at desc);
create index if not exists db_error_events_fingerprint_idx
  on helm_debug.db_error_events (fingerprint, last_seen_at desc);
create index if not exists db_error_events_severity_idx
  on helm_debug.db_error_events (severity, occurred_at desc)
  where severity in ('error', 'critical');

revoke all on all tables in schema helm_debug from public;
revoke all on all sequences in schema helm_debug from public;

-- Owner-rights facade — the ONLY path that reaches db_error_events. Upserts
-- by (fingerprint, bucket_started_at) unless p_force_individual_row is true.
-- VOLATILE (writes), SECURITY DEFINER, search_path pinned per this repo's
-- SECURITY DEFINER convention (20260825200811, 20260826010000).
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
  p_release_sha text default null,
  p_sport text default null,
  p_journey text default null,
  p_relation_name text default null,
  p_rpc_name text default null,
  p_function_name text default null,
  p_bucket_class text default null,
  p_error_code text default null,
  p_sqlstate text default null,
  p_postgrest_code text default null,
  p_auth_code text default null,
  p_storage_code text default null,
  p_http_status integer default null,
  p_safe_details text default null,
  p_safe_hint text default null,
  p_helm_trace_id text default null,
  p_sentry_trace_id text default null,
  p_sentry_span_id text default null,
  p_duration_ms integer default null,
  p_attempt integer default null,
  p_safe_metadata jsonb default '{}'::jsonb,
  p_force_individual_row boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, helm_debug
as $$
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
      bucket_started_at
    ) values (
      p_service, p_environment, p_runtime, p_feature, p_action, p_operation,
      p_severity, p_expectedness, p_retryability, p_fingerprint,
      p_normalized_message, p_terminal, p_release_sha, p_sport, p_journey,
      p_relation_name, p_rpc_name, p_function_name, p_bucket_class,
      p_error_code, p_sqlstate, p_postgrest_code, p_auth_code,
      p_storage_code, p_http_status, p_safe_details, p_safe_hint,
      p_helm_trace_id, p_sentry_trace_id, p_sentry_span_id, p_duration_ms,
      p_attempt, v_safe_metadata, v_bucket
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
  on conflict (fingerprint, bucket_started_at) where occurrence_count >= 1
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
$$;

revoke execute on function public.record_db_error_event(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  jsonb,
  boolean
) from public, anon, authenticated;
grant execute on function public.record_db_error_event(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  jsonb,
  boolean
) to service_role;

-- ACL-assertion tripwire, same pattern as 20260826010000_helm_debug_retention.sql.
do $$
declare
  v_fn oid := 'public.record_db_error_event(text, text, text, text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, text, text, text, text, text, text, integer, text, text, text, text, text, integer, integer, jsonb, boolean)'::regprocedure;
begin
  if has_function_privilege('public', v_fn, 'EXECUTE')
     or has_function_privilege('anon', v_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'ACL check failed: record_db_error_event callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
    raise exception 'ACL check failed: record_db_error_event not executable by service_role';
  end if;
end $$;

-- No row-level policies: same reasoning as 20260825200811 — the schema is
-- revoked from public/anon/authenticated above and not in PostgREST's
-- exposed schema list, so the SECURITY DEFINER facade above is the only
-- path in, and service_role bypasses RLS regardless. A policy here would be
-- dead code that reads as "row-level scoping is enforced" when the real
-- boundary is schema-level revocation plus the absence of any direct grant.

-- READ facade for the Bridge (src/lib/admin/database/errors.ts). helm_debug
-- is not in PostgREST's exposed schema list, so a `.from('db_error_events')`
-- call from the admin client would fail regardless of grants — an RPC read
-- is the only path in, same as the write side above.
create or replace function public.helm_debug_read_db_error_events(
  p_limit integer default 100,
  p_since timestamptz default null,
  p_min_severity text default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, helm_debug
as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.last_seen_at desc), '[]'::jsonb)
  from (
    select *
    from helm_debug.db_error_events
    where (p_since is null or last_seen_at >= p_since)
      and (
        p_min_severity is null
        or (p_min_severity = 'warning' and severity in ('warning', 'error', 'critical'))
        or (p_min_severity = 'error' and severity in ('error', 'critical'))
        or (p_min_severity = 'critical' and severity = 'critical')
        or p_min_severity = 'info'
      )
    order by last_seen_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) t
$$;

revoke execute on function public.helm_debug_read_db_error_events(integer, timestamptz, text)
from public, anon, authenticated;
grant execute on function public.helm_debug_read_db_error_events(integer, timestamptz, text) to service_role;

do $$
declare v_fn oid := 'public.helm_debug_read_db_error_events(integer, timestamptz, text)'::regprocedure;
begin
  if has_function_privilege('public', v_fn, 'EXECUTE')
     or has_function_privilege('anon', v_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_read_db_error_events callable by public/anon/authenticated';
  end if;
  if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
    raise exception 'ACL check failed: helm_debug_read_db_error_events not executable by service_role';
  end if;
end $$;
