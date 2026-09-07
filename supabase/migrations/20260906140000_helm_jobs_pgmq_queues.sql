-- Helm Jobs — durable job queues on pgmq (D6, Database Plan)
--
-- RISK TIER: R3 (privileged) per memory/system/golfhelm-engineering-os.md.
-- HELD — see supabase/migrations/HELD.md. Never applied by an agent; owner-
-- apply-only, and only after db-migration-reviewer sign-off.
--
-- WHY
-- ---
-- Round analysis and notification sends today run inline via Next.js
-- `after()` (see src/app/golf/actions/golf.ts, src/lib/notifications/*),
-- with Inngest as an optional durable layer that production does not
-- currently have usable keys for (`isInngestConfigured()` — src/lib/inngest/
-- client.ts) and a 30-minute `coachhelm-safety-net` cron as the only other
-- retry path. This migration adds a Postgres-native alternative — pgmq — so
-- a queued job survives a torn-down function instance without depending on
-- an external provider's credentials. It does not remove Inngest or retire
-- the safety net; both stay in place until the queue has run clean in
-- production (see docs/operations/JOBS_QUEUE.md).
--
-- SCHEMA CHOICE
-- -------------
-- pgmq creates and owns its own `pgmq` schema (one `pgmq.q_<queue>` table
-- per queue, `pgmq.a_<queue>` for archived messages). This migration adds a
-- second, HAND-OWNED schema, `helm_jobs`, for the two tables pgmq doesn't
-- provide: dedupe bookkeeping and a dead-letter store. Named after the
-- repo's existing `helm_debug` precedent (20260825200811 and its
-- successors) rather than `public`, so a queue-internal table is never
-- mistaken for a PostgREST-exposed one. Every access path into either
-- schema is a SECURITY DEFINER facade in `public`, following the exact
-- isolation pattern `helm_debug` already established: schema revoked from
-- public/anon/authenticated, no direct table grant to any role, only
-- service_role can EXECUTE the facades.
--
-- QUEUES
-- ------
-- coachhelm_analysis  — round analysis (src/lib/coachhelm/v2/post-round-trigger.ts)
-- email_send          — src/lib/notifications/email.ts (routes through the
--                        same HELM_CUSTOMER_EMAIL_ENABLED gate a direct send
--                        does — see src/lib/email/outbound-gate.ts once
--                        agent/email-off lands; the queue is not a second
--                        path around that switch)
-- push_send           — src/lib/notifications/push.ts
--
-- DEDUPE MODEL
-- ------------
-- `helm_jobs_enqueue(queue, payload, dedupe_key)` is idempotent on
-- (queue, dedupe_key) within a rolling 24h window: a second enqueue call
-- with the same key inside that window returns the ALREADY-QUEUED message's
-- id without sending a duplicate; once the window has elapsed the same key
-- can be reused (e.g. a daily digest keyed by date). A dedupe_key is
-- optional — pass null to always enqueue.
--
-- RETRY / DEAD-LETTER MODEL
-- --------------------------
-- `helm_jobs_fail(queue, msg_id, error)` reads the message's own read_ct
-- (pgmq's built-in per-message read counter, incremented by every
-- `pgmq.read()`) as the attempt count. Attempts 1-4 get `pgmq.set_vt()`'d
-- forward with a capped exponential backoff (10s, 20s, 40s, 80s, capped at
-- 300s); attempt 5 is archived out of the live queue and copied into
-- `helm_jobs.dead_letters` with its payload and last error. RLS is enabled
-- on `dead_letters` with no policies — the same "schema-level revoke plus
-- no direct grant" boundary `helm_debug` uses, made explicit per-table here
-- because dead_letters is the one object a future admin surface might be
-- tempted to query directly instead of through a facade.
--
-- ROLLBACK:
-- select pgmq.drop_queue('coachhelm_analysis');
-- select pgmq.drop_queue('email_send');
-- select pgmq.drop_queue('push_send');
-- drop function public.helm_jobs_enqueue(text, jsonb, text);
-- drop function public.helm_jobs_read_batch(text, integer, integer);
-- drop function public.helm_jobs_ack(text, bigint);
-- drop function public.helm_jobs_fail(text, bigint, text);
-- drop function public.helm_jobs_depth();
-- drop schema helm_jobs cascade;
-- (pgmq extension itself is left in place — other queues may exist by then.)

-- Owner step, not run by this file: if the project's Postgres role lacks
-- CREATE privilege on extensions (common on hosted Supabase unless the
-- extension has been toggled on once via Dashboard -> Database ->
-- Extensions -> pgmq), enable it there FIRST, then apply this migration.
-- The IF NOT EXISTS guard makes re-running this line after a dashboard
-- enable a safe no-op either way.
-- Postgres does not create the target schema for an extension whose control
-- file names none; CI's fresh local stack failed at this statement with
-- `schema "pgmq" does not exist`. Create it first (no-op on hosted Supabase
-- where the dashboard toggle already made it).
create schema if not exists pgmq;
create extension if not exists pgmq schema pgmq;

select pgmq.create('coachhelm_analysis');
select pgmq.create('email_send');
select pgmq.create('push_send');

create schema if not exists helm_jobs;
revoke all on schema helm_jobs from public;

create table if not exists helm_jobs.dedupe_keys (
    queue text not null check (queue in ('coachhelm_analysis', 'email_send', 'push_send')),
    dedupe_key text not null,
    msg_id bigint,
    created_at timestamptz not null default clock_timestamp(),
    primary key (queue, dedupe_key)
);

create table if not exists helm_jobs.dead_letters (
    id uuid primary key default gen_random_uuid(),
    queue text not null check (queue in ('coachhelm_analysis', 'email_send', 'push_send')),
    msg_id bigint,
    payload jsonb not null,
    error text,
    attempts integer not null default 0 check (attempts >= 0),
    first_enqueued_at timestamptz,
    failed_at timestamptz not null default clock_timestamp()
);

create index if not exists dead_letters_queue_idx
on helm_jobs.dead_letters (queue, failed_at desc);

-- RLS enabled, deliberately zero policies: service_role bypasses RLS and is
-- the only role with any grant on this table (see revokes below), so this
-- is a second, structural line of defense — a future migration that
-- accidentally grants a table privilege to `authenticated` still cannot
-- read a row here without a matching policy.
alter table helm_jobs.dead_letters enable row level security;

revoke all on all tables in schema helm_jobs from public;
revoke all on all sequences in schema helm_jobs from public;

-- ============================================================================
-- helm_jobs_enqueue
-- ============================================================================
create or replace function public.helm_jobs_enqueue(
    p_queue text,
    p_payload jsonb,
    p_dedupe_key text default null
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, pgmq, helm_jobs
as $$
declare
    v_msg_id bigint;
    v_existing helm_jobs.dedupe_keys%rowtype;
begin
    if p_queue not in ('coachhelm_analysis', 'email_send', 'push_send') then
        raise exception 'helm_jobs_enqueue: unknown queue %', p_queue;
    end if;

    if p_dedupe_key is not null then
        select * into v_existing
        from helm_jobs.dedupe_keys
        where queue = p_queue and dedupe_key = p_dedupe_key
        for update;

        if found and v_existing.created_at > clock_timestamp() - interval '24 hours' then
            return v_existing.msg_id;
        end if;
    end if;

    v_msg_id := pgmq.send(p_queue, p_payload);

    if p_dedupe_key is not null then
        insert into helm_jobs.dedupe_keys (queue, dedupe_key, msg_id, created_at)
        values (p_queue, p_dedupe_key, v_msg_id, clock_timestamp())
        on conflict (queue, dedupe_key)
        do update set msg_id = excluded.msg_id, created_at = excluded.created_at;
    end if;

    return v_msg_id;
end;
$$;

revoke execute on function public.helm_jobs_enqueue(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.helm_jobs_enqueue(text, jsonb, text) to service_role;

do $$
declare v_fn oid := 'public.helm_jobs_enqueue(text, jsonb, text)'::regprocedure;
begin
    if has_function_privilege('public', v_fn, 'EXECUTE')
       or has_function_privilege('anon', v_fn, 'EXECUTE')
       or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
        raise exception 'ACL check failed: helm_jobs_enqueue callable by public/anon/authenticated';
    end if;
    if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
        raise exception 'ACL check failed: helm_jobs_enqueue not executable by service_role';
    end if;
end $$;

-- ============================================================================
-- helm_jobs_read_batch
-- ============================================================================
create or replace function public.helm_jobs_read_batch(
    p_queue text,
    p_n integer default 10,
    p_visibility_seconds integer default 30
)
returns table (
    msg_id bigint,
    read_ct integer,
    enqueued_at timestamptz,
    vt timestamptz,
    message jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, pgmq
as $$
begin
    if p_queue not in ('coachhelm_analysis', 'email_send', 'push_send') then
        raise exception 'helm_jobs_read_batch: unknown queue %', p_queue;
    end if;

    return query
    select r.msg_id, r.read_ct, r.enqueued_at, r.vt, r.message
    from pgmq.read(
        p_queue,
        greatest(1, least(coalesce(p_visibility_seconds, 30), 3600)),
        greatest(1, least(coalesce(p_n, 10), 100))
    ) r;
end;
$$;

revoke execute on function public.helm_jobs_read_batch(text, integer, integer) from public, anon, authenticated;
grant execute on function public.helm_jobs_read_batch(text, integer, integer) to service_role;

do $$
declare v_fn oid := 'public.helm_jobs_read_batch(text, integer, integer)'::regprocedure;
begin
    if has_function_privilege('public', v_fn, 'EXECUTE')
       or has_function_privilege('anon', v_fn, 'EXECUTE')
       or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
        raise exception 'ACL check failed: helm_jobs_read_batch callable by public/anon/authenticated';
    end if;
    if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
        raise exception 'ACL check failed: helm_jobs_read_batch not executable by service_role';
    end if;
end $$;

-- ============================================================================
-- helm_jobs_ack
-- ============================================================================
create or replace function public.helm_jobs_ack(
    p_queue text,
    p_msg_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pgmq
as $$
begin
    if p_queue not in ('coachhelm_analysis', 'email_send', 'push_send') then
        raise exception 'helm_jobs_ack: unknown queue %', p_queue;
    end if;

    return pgmq.delete(p_queue, p_msg_id);
end;
$$;

revoke execute on function public.helm_jobs_ack(text, bigint) from public, anon, authenticated;
grant execute on function public.helm_jobs_ack(text, bigint) to service_role;

do $$
declare v_fn oid := 'public.helm_jobs_ack(text, bigint)'::regprocedure;
begin
    if has_function_privilege('public', v_fn, 'EXECUTE')
       or has_function_privilege('anon', v_fn, 'EXECUTE')
       or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
        raise exception 'ACL check failed: helm_jobs_ack callable by public/anon/authenticated';
    end if;
    if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
        raise exception 'ACL check failed: helm_jobs_ack not executable by service_role';
    end if;
end $$;

-- ============================================================================
-- helm_jobs_fail — re-queue with backoff up to 5 attempts, then dead-letter.
-- ============================================================================
create or replace function public.helm_jobs_fail(
    p_queue text,
    p_msg_id bigint,
    p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pgmq, helm_jobs
as $$
declare
    v_read_ct integer;
    v_message jsonb;
    v_enqueued_at timestamptz;
    v_delay_seconds integer;
    v_max_attempts constant integer := 5;
begin
    if p_queue not in ('coachhelm_analysis', 'email_send', 'push_send') then
        raise exception 'helm_jobs_fail: unknown queue %', p_queue;
    end if;

    -- pgmq owns a per-queue table `pgmq.q_<queue>`; p_queue is constrained to
    -- the fixed allowlist above before it ever reaches this dynamic SQL, so
    -- this is not an injection surface.
    execute format('select read_ct, message, enqueued_at from pgmq.%I where msg_id = $1', 'q_' || p_queue)
    using p_msg_id
    into v_read_ct, v_message, v_enqueued_at;

    if v_read_ct is null then
        -- Already acked/archived by a concurrent worker — nothing to do.
        return jsonb_build_object('outcome', 'not_found');
    end if;

    if v_read_ct >= v_max_attempts then
        perform pgmq.delete(p_queue, p_msg_id);
        insert into helm_jobs.dead_letters (queue, msg_id, payload, error, attempts, first_enqueued_at)
        values (p_queue, p_msg_id, v_message, p_error, v_read_ct, v_enqueued_at);
        return jsonb_build_object('outcome', 'dead_lettered', 'attempts', v_read_ct);
    end if;

    v_delay_seconds := least(300, (2 ^ v_read_ct)::integer * 10);
    perform pgmq.set_vt(p_queue, p_msg_id, v_delay_seconds);
    return jsonb_build_object('outcome', 'requeued', 'attempts', v_read_ct, 'retry_in_seconds', v_delay_seconds);
end;
$$;

revoke execute on function public.helm_jobs_fail(text, bigint, text) from public, anon, authenticated;
grant execute on function public.helm_jobs_fail(text, bigint, text) to service_role;

do $$
declare v_fn oid := 'public.helm_jobs_fail(text, bigint, text)'::regprocedure;
begin
    if has_function_privilege('public', v_fn, 'EXECUTE')
       or has_function_privilege('anon', v_fn, 'EXECUTE')
       or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
        raise exception 'ACL check failed: helm_jobs_fail callable by public/anon/authenticated';
    end if;
    if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
        raise exception 'ACL check failed: helm_jobs_fail not executable by service_role';
    end if;
end $$;

-- ============================================================================
-- helm_jobs_depth — per-queue depth, oldest message age, dead-letter count.
-- ============================================================================
create or replace function public.helm_jobs_depth()
returns table (
    queue text,
    queue_length bigint,
    oldest_msg_age_seconds integer,
    dead_letter_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public, pgmq, helm_jobs
as $$
begin
    return query
    select
        m.queue_name::text,
        m.queue_length,
        m.oldest_msg_age_sec,
        coalesce(dl.cnt, 0)
    from pgmq.metrics_all() m
    left join (
        select queue, count(*) as cnt
        from helm_jobs.dead_letters
        group by queue
    ) dl on dl.queue = m.queue_name
    where m.queue_name in ('coachhelm_analysis', 'email_send', 'push_send');
end;
$$;

revoke execute on function public.helm_jobs_depth() from public, anon, authenticated;
grant execute on function public.helm_jobs_depth() to service_role;

do $$
declare v_fn oid := 'public.helm_jobs_depth()'::regprocedure;
begin
    if has_function_privilege('public', v_fn, 'EXECUTE')
       or has_function_privilege('anon', v_fn, 'EXECUTE')
       or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
        raise exception 'ACL check failed: helm_jobs_depth callable by public/anon/authenticated';
    end if;
    if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
        raise exception 'ACL check failed: helm_jobs_depth not executable by service_role';
    end if;
end $$;

-- ============================================================================
-- helm_jobs_requeue_dead_letter — Bridge "requeue" admin action. Re-enqueues
-- the stored payload as a brand-new pgmq message (attempts reset to 0) and
-- removes the dead-letter row. Never re-inserts into the SAME msg_id — pgmq
-- message ids are not reusable once archived/deleted.
-- ============================================================================
create or replace function public.helm_jobs_requeue_dead_letter(
    p_dead_letter_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, pgmq, helm_jobs
as $$
declare
    v_row helm_jobs.dead_letters%rowtype;
    v_msg_id bigint;
begin
    select * into v_row from helm_jobs.dead_letters where id = p_dead_letter_id;
    if not found then
        raise exception 'helm_jobs_requeue_dead_letter: no dead letter %', p_dead_letter_id;
    end if;

    v_msg_id := pgmq.send(v_row.queue, v_row.payload);
    delete from helm_jobs.dead_letters where id = p_dead_letter_id;

    return v_msg_id;
end;
$$;

revoke execute on function public.helm_jobs_requeue_dead_letter(uuid) from public, anon, authenticated;
grant execute on function public.helm_jobs_requeue_dead_letter(uuid) to service_role;

do $$
declare v_fn oid := 'public.helm_jobs_requeue_dead_letter(uuid)'::regprocedure;
begin
    if has_function_privilege('public', v_fn, 'EXECUTE')
       or has_function_privilege('anon', v_fn, 'EXECUTE')
       or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
        raise exception 'ACL check failed: helm_jobs_requeue_dead_letter callable by public/anon/authenticated';
    end if;
    if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
        raise exception 'ACL check failed: helm_jobs_requeue_dead_letter not executable by service_role';
    end if;
end $$;

-- ============================================================================
-- helm_jobs_list_dead_letters — Bridge read facade.
-- ============================================================================
create or replace function public.helm_jobs_list_dead_letters(
    p_queue text default null,
    p_limit integer default 50
)
returns table (
    id uuid,
    queue text,
    msg_id bigint,
    payload jsonb,
    error text,
    attempts integer,
    first_enqueued_at timestamptz,
    failed_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, helm_jobs
as $$
    select id, queue, msg_id, payload, error, attempts, first_enqueued_at, failed_at
    from helm_jobs.dead_letters
    where p_queue is null or queue = p_queue
    order by failed_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke execute on function public.helm_jobs_list_dead_letters(text, integer) from public, anon, authenticated;
grant execute on function public.helm_jobs_list_dead_letters(text, integer) to service_role;

do $$
declare v_fn oid := 'public.helm_jobs_list_dead_letters(text, integer)'::regprocedure;
begin
    if has_function_privilege('public', v_fn, 'EXECUTE')
       or has_function_privilege('anon', v_fn, 'EXECUTE')
       or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
        raise exception 'ACL check failed: helm_jobs_list_dead_letters callable by public/anon/authenticated';
    end if;
    if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
        raise exception 'ACL check failed: helm_jobs_list_dead_letters not executable by service_role';
    end if;
end $$;
