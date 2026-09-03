-- Agent Flight Recorder
--
-- RISK TIER: R3 (privileged) per memory/system/golfhelm-engineering-os.md.
-- Adds a table to the existing `helm_debug` schema and three owner-rights
-- (security-definer) facades. Daily reliability work may investigate and
-- prepare this file but must never apply it; only the owner executes the
-- production apply, and db-migration-reviewer review is mandatory before
-- that happens. See supabase/migrations/HELD.md for this file's status.
--
-- DEPENDS ON: 20260825200811_helm_flight_recorder.sql — APPLIED 2026-08-26
-- (see HELD.md), which created the `helm_debug` schema and revoked it from
-- public. This file does not recreate the schema; it only adds a table and
-- facades inside it.
--
-- WHY
-- ---
-- ADR-2026-09-03-control-plane-owner-decisions.md's
-- AGENT_FLIGHT_RECORDER_STORAGE row: a new, narrow `helm_debug.agent_runs`
-- table, RPC-gated and service-role only, reusing the golf Flight
-- Recorder's storage pattern
-- (a private schema PostgREST cannot see, reached only through
-- SECURITY DEFINER facades) rather than a jsonb blob bolted onto
-- `background_job_logs`. This is a record of autonomous Claude runs
-- (Diagnose/Repair today; any future workflow tomorrow) — charter,
-- hypotheses considered, context loaded, tools used, files changed,
-- verification evidence, and production outcome — distinct from the golf
-- round Flight Recorder (`helm_debug.trace_runs` / `trace_steps`), which
-- traces one database mutation, not one agent's reasoning.
--
-- ONE TABLE, NOT A RUN+STEPS PAIR. An agent run is coarser-grained than a
-- golf round trace: it does not have a fixed, enumerable step schema the
-- way a round submit does (insert holes / insert shots / recalculate). The
-- caller (src/lib/admin/agent-runs/record.ts) accumulates the run's state
-- in memory and writes the FULL current snapshot on every call — the write
-- facade below overwrites structured columns on conflict rather than
-- attempting a partial merge, so callers must always pass the run's
-- complete current state, not a delta.
--
-- FAIL-OPEN, NO PII, NO RAW PROMPTS: `helm_private.agent_run_safe_payload`
-- strips the same category of accidental top-level secrets
-- `helm_private.trace_safe_metadata` (20260825200811) does, plus a
-- `raw_prompt` key this table must never carry — only short structured
-- summaries (hypothesis text, file paths, tool names), never full prompts
-- or model transcripts.
--
-- VERIFIED: cannot verify prod state for a table this migration itself
-- creates and which has not been applied. Once applied, verify with:
--   select count(*) from helm_debug.agent_runs;
--   select proname from pg_proc where proname like 'helm_debug_%agent_run%';
--
-- ROLLBACK: DROP FUNCTION
--           public.helm_debug_record_agent_run(uuid,text,text,jsonb);
--           DROP FUNCTION public.helm_debug_list_agent_runs(integer,text,text);
--           DROP FUNCTION public.helm_debug_get_agent_run(uuid);
--           DROP TABLE helm_debug.agent_runs;
--           DROP FUNCTION helm_private.agent_run_safe_payload(jsonb);
--           -- safe: no other migration references any of the above, and this
--           -- file defines no triggers on any existing table.

create table if not exists helm_debug.agent_runs (
    id uuid primary key default gen_random_uuid(),
    run_id uuid not null unique,
    -- Free-form `namespace.verb` (e.g. 'selfheal.diagnose', 'selfheal.repair').
    -- Deliberately NOT constrained to a fixed prefix by CHECK: the writer
    -- (record.ts) is fail-open, and a CHECK that rejects an unrecognized
    -- workflow value would turn a swallowed insert into a silently blind
    -- recorder -- the exact failure class 20260901140000's header describes
    -- for the golf trace recorder (1,097 blind traces before that fix).
    workflow text not null,
    status text not null default 'started'
    check (status in ('started', 'success', 'failure', 'rejected', 'pending')),
    incident_fingerprint text,
    charter text,
    hypotheses jsonb not null default '[]'::jsonb,
    context_loaded jsonb not null default '[]'::jsonb,
    tools_used jsonb not null default '[]'::jsonb,
    files_changed jsonb not null default '[]'::jsonb,
    -- Per-role verdicts once the verification ensemble (ADR: no new model
    -- cost, default OFF) is wired up: {"adversary": {...}, "security": {...},
    -- "product": {...}, "judge": {...}}. Empty object until then.
    verification jsonb not null default '{}'::jsonb,
    verifier_verdict text
    check (
        verifier_verdict is null
        or verifier_verdict in ('accept', 'reject', 'not_run')
    ),
    production_outcome text
    check (
        production_outcome is null
        or production_outcome in ('proven', 'regressed', 'unknown', 'pending')
    ),
    -- App-level convention (matches
    -- src/lib/admin/incidents/release-context.ts's
    -- classifyReleaseRelationship): never write 1.0. Not a DB CHECK -- the
    -- constraint that matters is "never claim certainty from correlation
    -- alone," which is a derivation-time decision, not a storage-time one.
    confidence numeric
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
    started_at timestamptz not null default clock_timestamp(),
    finished_at timestamptz,
    duration_ms integer check (duration_ms is null or duration_ms >= 0),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default clock_timestamp(),
    updated_at timestamptz not null default clock_timestamp()
);

create index if not exists agent_runs_started_at_idx
on helm_debug.agent_runs (started_at desc);
create index if not exists agent_runs_workflow_started_at_idx
on helm_debug.agent_runs (workflow, started_at desc);
create index if not exists agent_runs_status_started_at_idx
on helm_debug.agent_runs (status, started_at desc);
create index if not exists agent_runs_incident_fingerprint_idx
on helm_debug.agent_runs (incident_fingerprint)
where incident_fingerprint is not null;

-- 20260825200811's `revoke all on all tables in schema helm_debug from
-- public` ran before this table existed and does not retroactively cover
-- it -- a table created later needs its own explicit revoke.
revoke all on helm_debug.agent_runs from public, anon, authenticated;

-- No row-level policies, for the same reason 20260825200811's header gives
-- for `trace_runs`/`trace_steps`: the schema is revoked from public/anon/
-- authenticated and is not in PostgREST's exposed schema list, so the only
-- paths that ever reach this table are the service-role-only facades below,
-- and service_role bypasses RLS unconditionally regardless.

create or replace function helm_private.agent_run_safe_payload(p_payload jsonb)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(p_payload, '{}'::jsonb) - array[
    'authorization', 'cookie', 'cookies', 'token', 'access_token',
    'refresh_token', 'service_role', 'service_role_key', 'password',
    'raw_prompt', 'raw_transcript', 'headers', 'anthropic_api_key'
  ]
$$;

revoke all on function helm_private.agent_run_safe_payload(jsonb) from public;

-- The public wrapper is the only write gateway for the private schema. It
-- is SECURITY DEFINER by design: PostgREST cannot expose helm_debug, and
-- the service-role-only API keeps agent-run capture fail-open and out of
-- the caller's own transaction. Four parameters, not one per field -- a
-- wide parameter list has to be retyped identically in the REVOKE line,
-- the GRANT line and the ACL tripwire below; one drift in any of the three
-- either raises at apply time or silently narrows a REVOKE. Structured
-- fields are unpacked from `p_payload` instead.
create or replace function public.helm_debug_record_agent_run(
    p_run_id uuid,
    p_workflow text,
    p_status text,
    p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, helm_debug, helm_private
as $$
declare
  v_payload jsonb := helm_private.agent_run_safe_payload(p_payload);
  v_status text := coalesce(nullif(p_status, ''), 'started');
  v_finished_at timestamptz := case when v_status in ('success', 'failure', 'rejected') then clock_timestamp() else null end;
begin
  if p_run_id is null then
    raise exception using errcode = '22023', message = 'Agent flight recorder run_id is required.';
  end if;
  if p_workflow is null or length(trim(p_workflow)) = 0 then
    raise exception using errcode = '22023', message = 'Agent flight recorder workflow is required.';
  end if;

  insert into helm_debug.agent_runs (
    run_id, workflow, status, incident_fingerprint, charter,
    hypotheses, context_loaded, tools_used, files_changed,
    verification, verifier_verdict, production_outcome, confidence,
    started_at, finished_at, duration_ms, metadata
  ) values (
    p_run_id,
    p_workflow,
    v_status,
    nullif(v_payload ->> 'incident_fingerprint', ''),
    nullif(v_payload ->> 'charter', ''),
    coalesce(v_payload -> 'hypotheses', '[]'::jsonb),
    coalesce(v_payload -> 'context_loaded', '[]'::jsonb),
    coalesce(v_payload -> 'tools_used', '[]'::jsonb),
    coalesce(v_payload -> 'files_changed', '[]'::jsonb),
    coalesce(v_payload -> 'verification', '{}'::jsonb),
    nullif(v_payload ->> 'verifier_verdict', ''),
    nullif(v_payload ->> 'production_outcome', ''),
    nullif(v_payload ->> 'confidence', '')::numeric,
    coalesce(nullif(v_payload ->> 'started_at', '')::timestamptz, clock_timestamp()),
    v_finished_at,
    nullif(v_payload ->> 'duration_ms', '')::integer,
    v_payload
  )
  on conflict (run_id) do update set
    workflow = excluded.workflow,
    status = excluded.status,
    incident_fingerprint = excluded.incident_fingerprint,
    charter = excluded.charter,
    hypotheses = excluded.hypotheses,
    context_loaded = excluded.context_loaded,
    tools_used = excluded.tools_used,
    files_changed = excluded.files_changed,
    verification = excluded.verification,
    verifier_verdict = excluded.verifier_verdict,
    production_outcome = excluded.production_outcome,
    confidence = excluded.confidence,
    finished_at = coalesce(excluded.finished_at, helm_debug.agent_runs.finished_at),
    duration_ms = coalesce(excluded.duration_ms, helm_debug.agent_runs.duration_ms),
    metadata = helm_debug.agent_runs.metadata || excluded.metadata,
    updated_at = clock_timestamp();

  return p_run_id;
end;
$$;

create or replace function public.helm_debug_list_agent_runs(
    p_limit integer default 50,
    p_workflow text default null,
    p_status text default null
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, helm_debug
as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at desc), '[]'::jsonb)
  from (
    select run_id, workflow, status, incident_fingerprint, charter,
      verifier_verdict, production_outcome, confidence,
      started_at, finished_at, duration_ms
    from helm_debug.agent_runs
    where (p_workflow is null or workflow = p_workflow)
      and (p_status is null or status = p_status)
    order by started_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) r
$$;

create or replace function public.helm_debug_get_agent_run(p_run_id uuid)
returns jsonb
language sql
security definer
set search_path = pg_catalog, helm_debug
as $$
  select coalesce(to_jsonb(r), '{}'::jsonb)
  from helm_debug.agent_runs r
  where r.run_id = p_run_id
$$;

revoke all on function public.helm_debug_record_agent_run(
    uuid, text, text, jsonb
) from public,
anon,
authenticated;
revoke all on function public.helm_debug_list_agent_runs(
    integer, text, text
) from public,
anon,
authenticated;
revoke all on function public.helm_debug_get_agent_run(uuid) from public,
anon,
authenticated;
grant execute on function public.helm_debug_record_agent_run(
    uuid, text, text, jsonb
) to service_role;
grant execute on function public.helm_debug_list_agent_runs(
    integer, text, text
) to service_role;
grant execute on function public.helm_debug_get_agent_run(uuid) to service_role;

-- ACL-assertion tripwire, matching 20260825200811's (fixed) pattern:
-- resolve each function by full signature -- never by name only, which is
-- not STRICT and would silently accept an arbitrary overload if one is
-- ever added -- and fail the migration outright on any drift from
-- "service_role only".
do $$
DECLARE
  v_fn oid;
  v_signatures text[] := ARRAY[
    'public.helm_debug_record_agent_run(uuid,text,text,jsonb)',
    'public.helm_debug_list_agent_runs(integer,text,text)',
    'public.helm_debug_get_agent_run(uuid)'
  ];
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY v_signatures LOOP
    v_fn := v_sig::regprocedure;

    IF has_function_privilege('public', v_fn, 'EXECUTE')
       OR has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'ACL check failed: % callable by public/anon/authenticated', v_sig;
    END IF;

    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'ACL check failed: % not executable by service_role', v_sig;
    END IF;
  END LOOP;

  IF has_table_privilege('public', 'helm_debug.agent_runs', 'SELECT')
     OR has_table_privilege('anon', 'helm_debug.agent_runs', 'SELECT')
     OR has_table_privilege('authenticated', 'helm_debug.agent_runs', 'SELECT') THEN
    RAISE EXCEPTION 'ACL check failed: helm_debug.agent_runs readable by public/anon/authenticated';
  END IF;
END $$;
