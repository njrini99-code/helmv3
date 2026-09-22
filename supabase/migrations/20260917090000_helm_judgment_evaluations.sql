-- Helm Judgment Layer — private evaluation + calibration-label store
--
-- RISK TIER: R3 (privileged) per memory/system/golfhelm-engineering-os.md.
-- New tables + definer-rights RPC facades + grant changes on the private
-- helm_debug schema. HELD — see supabase/migrations/HELD.md. Never applied
-- by an agent; owner-apply-only after db-migration-reviewer sign-off.
--
-- WHY
-- ---
-- src/lib/ai/judgment/** asks Jev (TypeSafe System One) bounded typed
-- questions over compact evidence — shot-trace semantics, bug-triage
-- routing, CoachHelm claim honesty — and must keep every answer beside the
-- policy outcome so the judgments can be calibrated against what actually
-- happened before any of them is allowed to change product behaviour.
--
-- WHAT IS STORED: evaluator/policy versions, a sha256 of the provider state
-- (never the state), an allowlisted `evidence_summary`, the normalized
-- answers, the disposition and reason codes. `entity_key_hash` is a salted
-- hash, so a row can be correlated to its round/fingerprint by code that
-- holds the key without the key being readable here.
--
-- ISOLATION: identical to 20260825200811 / 20260903180000 — helm_debug is
-- revoked from public/anon/authenticated, not in PostgREST's exposed
-- schemas, and only the definer-rights facades below reach the tables. No
-- RLS policies, same reasoning as those files (a policy would read as
-- row-scoping where the real boundary is schema revocation + no grants).
--
-- RETENTION: `public.helm_debug_prune_judgments()` — unlabelled pass/observe
-- 30 d, escalate/block/unassessed 90 d, labelled rows 180 d — called from
-- /api/cron/db-observability-prune beside helm_debug_prune_observability.
--
-- ROLLBACK: drop function public.helm_debug_record_judgment(jsonb);
-- drop function public.helm_debug_label_judgment(uuid,text,text,text,boolean,text);
-- drop function public.helm_debug_list_judgments(integer,text,text,timestamptz);
-- drop function public.helm_debug_get_judgment(uuid);
-- drop function public.helm_debug_prune_judgments();
-- drop table helm_debug.judgment_labels; drop table helm_debug.judgment_evaluations;
-- — safe; nothing else references these objects.

create schema if not exists helm_debug;
revoke all on schema helm_debug from public;

create table if not exists helm_debug.judgment_evaluations (
  id uuid primary key default gen_random_uuid(),
  use_case text not null,
  evaluator_version text not null,
  policy_version text not null,
  provider text not null default 'typesafe-ai',
  model_id text not null default 'jev-latest',
  environment text not null,
  mode text not null,
  entity_type text not null,
  entity_key_hash text null,
  trace_id uuid null,
  state_hash text not null,
  evidence_summary jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  provider_metadata jsonb not null default '{}'::jsonb,
  disposition text not null,
  reason_codes text[] not null default '{}',
  duration_ms integer null check (duration_ms is null or duration_ms >= 0),
  provider_error_code text null,
  created_at timestamptz not null default clock_timestamp(),

  constraint judgment_use_case_check check (use_case in (
    'semantic_regression',
    'coachhelm_insight_quality',
    'self_heal_router',
    'release_canary',
    'state_integrity',
    'bug_triage',
    'shot_trace',
    'claim_honesty'
  )),
  constraint judgment_mode_check check (mode in ('off', 'shadow', 'enforce')),
  constraint judgment_disposition_check check (disposition in (
    'pass', 'observe', 'collect_more_evidence', 'escalate', 'block', 'unassessed'
  )),
  constraint judgment_state_hash_check check (state_hash ~ '^[0-9a-f]{64}$' or state_hash = '')
);

create index if not exists judgment_evaluations_created_idx
  on helm_debug.judgment_evaluations (created_at desc);
create index if not exists judgment_evaluations_use_case_created_idx
  on helm_debug.judgment_evaluations (use_case, created_at desc);
create index if not exists judgment_evaluations_trace_idx
  on helm_debug.judgment_evaluations (trace_id)
  where trace_id is not null;
create index if not exists judgment_evaluations_entity_idx
  on helm_debug.judgment_evaluations (entity_type, entity_key_hash, created_at desc)
  where entity_key_hash is not null;

create table if not exists helm_debug.judgment_labels (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references helm_debug.judgment_evaluations(id) on delete cascade,
  label_source text not null,
  expected_disposition text not null check (expected_disposition in (
    'pass', 'observe', 'collect_more_evidence', 'escalate', 'block', 'unassessed'
  )),
  actual_outcome text null,
  correct boolean null,
  notes text null,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists judgment_labels_evaluation_idx
  on helm_debug.judgment_labels (evaluation_id);

revoke all on all tables in schema helm_debug from public;
revoke all on all sequences in schema helm_debug from public;

-- WRITE facade. One jsonb row rather than 18 positional args: the writer
-- (src/lib/ai/judgment/persistence.ts) is the only caller and a typo in a
-- key fails the CHECK constraints below rather than silently shifting
-- columns. Bounded: text fields truncated, jsonb bags size-capped.
create or replace function public.helm_debug_record_judgment(p_row jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, helm_debug
as $$
declare
  v_id uuid;
  v_summary jsonb := coalesce(p_row->'evidence_summary', '{}'::jsonb);
  v_answers jsonb := coalesce(p_row->'answers', '{}'::jsonb);
  v_reason_codes text[];
begin
  if p_row is null or jsonb_typeof(p_row) <> 'object' then
    raise exception 'helm_debug_record_judgment: p_row must be a json object';
  end if;
  if pg_column_size(v_summary) > 8192 then
    raise exception 'helm_debug_record_judgment: evidence_summary exceeds 8 KiB';
  end if;
  if pg_column_size(v_answers) > 16384 then
    raise exception 'helm_debug_record_judgment: answers exceeds 16 KiB';
  end if;
  select coalesce(array_agg(left(value, 80)), '{}')
    into v_reason_codes
    from jsonb_array_elements_text(coalesce(p_row->'reason_codes', '[]'::jsonb));

  insert into helm_debug.judgment_evaluations (
    use_case, evaluator_version, policy_version, provider, model_id,
    environment, mode, entity_type, entity_key_hash, trace_id, state_hash,
    evidence_summary, answers, provider_metadata, disposition, reason_codes,
    duration_ms, provider_error_code
  ) values (
    p_row->>'use_case',
    left(p_row->>'evaluator_version', 80),
    left(p_row->>'policy_version', 80),
    coalesce(left(p_row->>'provider', 40), 'typesafe-ai'),
    coalesce(left(p_row->>'model_id', 80), 'jev-latest'),
    coalesce(left(p_row->>'environment', 32), 'unknown'),
    p_row->>'mode',
    left(p_row->>'entity_type', 80),
    left(p_row->>'entity_key_hash', 64),
    nullif(p_row->>'trace_id', '')::uuid,
    coalesce(p_row->>'state_hash', ''),
    v_summary,
    v_answers,
    coalesce(p_row->'provider_metadata', '{}'::jsonb),
    p_row->>'disposition',
    v_reason_codes,
    (p_row->>'duration_ms')::integer,
    left(p_row->>'provider_error_code', 80)
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.helm_debug_label_judgment(
  p_evaluation_id uuid,
  p_label_source text,
  p_expected_disposition text,
  p_actual_outcome text default null,
  p_correct boolean default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, helm_debug
as $$
declare
  v_id uuid;
begin
  insert into helm_debug.judgment_labels (
    evaluation_id, label_source, expected_disposition, actual_outcome, correct, notes
  ) values (
    p_evaluation_id, left(p_label_source, 80), p_expected_disposition,
    left(p_actual_outcome, 80), p_correct, left(p_notes, 1000)
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- READ facades for the Bridge and the calibration script. Labels are
-- folded in so one call returns an evaluation with its labels.
create or replace function public.helm_debug_list_judgments(
  p_limit integer default 100,
  p_use_case text default null,
  p_disposition text default null,
  p_since timestamptz default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, helm_debug
as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
  from (
    select e.*,
      (select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at), '[]'::jsonb)
         from helm_debug.judgment_labels l where l.evaluation_id = e.id) as labels
    from helm_debug.judgment_evaluations e
    where (p_use_case is null or e.use_case = p_use_case)
      and (p_disposition is null or e.disposition = p_disposition)
      and (p_since is null or e.created_at >= p_since)
    order by e.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) t
$$;

create or replace function public.helm_debug_get_judgment(p_evaluation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, helm_debug
as $$
  select to_jsonb(e) || jsonb_build_object(
    'labels',
    (select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at), '[]'::jsonb)
       from helm_debug.judgment_labels l where l.evaluation_id = e.id)
  )
  from helm_debug.judgment_evaluations e
  where e.id = p_evaluation_id
$$;

-- RETENTION. Fixed windows (not parameters) — same reasoning as v2/v3 of
-- helm_debug_prune_observability: a parameter nobody passes is a second,
-- ambiguous overload waiting to happen.
create or replace function public.helm_debug_prune_judgments()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, helm_debug
as $$
declare
  v_quiet_days constant integer := 30;
  v_flagged_days constant integer := 90;
  v_labelled_days constant integer := 180;
  v_deleted_quiet bigint := 0;
  v_deleted_flagged bigint := 0;
  v_deleted_labelled bigint := 0;
begin
  with deleted as (
    delete from helm_debug.judgment_evaluations e
    where e.disposition in ('pass', 'observe')
      and e.created_at < clock_timestamp() - make_interval(days => v_quiet_days)
      and not exists (select 1 from helm_debug.judgment_labels l where l.evaluation_id = e.id)
    returning 1
  )
  select count(*) into v_deleted_quiet from deleted;
  with deleted as (
    delete from helm_debug.judgment_evaluations e
    where e.disposition in ('collect_more_evidence', 'escalate', 'block', 'unassessed')
      and e.created_at < clock_timestamp() - make_interval(days => v_flagged_days)
      and not exists (select 1 from helm_debug.judgment_labels l where l.evaluation_id = e.id)
    returning 1
  )
  select count(*) into v_deleted_flagged from deleted;
  with deleted as (
    delete from helm_debug.judgment_evaluations e
    where e.created_at < clock_timestamp() - make_interval(days => v_labelled_days)
    returning 1
  )
  select count(*) into v_deleted_labelled from deleted;
  return jsonb_build_object(
    'deleted_quiet', v_deleted_quiet,
    'deleted_flagged', v_deleted_flagged,
    'deleted_labelled', v_deleted_labelled
  );
end;
$$;

revoke execute on function public.helm_debug_record_judgment(jsonb) from public, anon, authenticated;
grant execute on function public.helm_debug_record_judgment(jsonb) to service_role;
revoke execute on function public.helm_debug_label_judgment(uuid, text, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.helm_debug_label_judgment(uuid, text, text, text, boolean, text) to service_role;
revoke execute on function public.helm_debug_list_judgments(integer, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.helm_debug_list_judgments(integer, text, text, timestamptz) to service_role;
revoke execute on function public.helm_debug_get_judgment(uuid) from public, anon, authenticated;
grant execute on function public.helm_debug_get_judgment(uuid) to service_role;
revoke execute on function public.helm_debug_prune_judgments() from public, anon, authenticated;
grant execute on function public.helm_debug_prune_judgments() to service_role;

-- ACL-assertion tripwire, same pattern as 20260826010000 / 20260903180000.
do $$
declare
  v_fns text[] := array[
    'public.helm_debug_record_judgment(jsonb)',
    'public.helm_debug_label_judgment(uuid, text, text, text, boolean, text)',
    'public.helm_debug_list_judgments(integer, text, text, timestamptz)',
    'public.helm_debug_get_judgment(uuid)',
    'public.helm_debug_prune_judgments()'
  ];
  v_fn text;
  v_oid oid;
begin
  foreach v_fn in array v_fns loop
    v_oid := v_fn::regprocedure;
    if has_function_privilege('public', v_oid, 'EXECUTE')
       or has_function_privilege('anon', v_oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_oid, 'EXECUTE') then
      raise exception 'ACL check failed: % callable by public/anon/authenticated', v_fn;
    end if;
    if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
      raise exception 'ACL check failed: % not executable by service_role', v_fn;
    end if;
  end loop;
  if has_table_privilege('anon', 'helm_debug.judgment_evaluations', 'SELECT')
     or has_table_privilege('authenticated', 'helm_debug.judgment_evaluations', 'SELECT') then
    raise exception 'ACL check failed: judgment_evaluations readable by anon/authenticated';
  end if;
end $$;
