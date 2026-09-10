-- Helm Jobs — fix `helm_jobs_depth()` (20260906140000): it never ran.
--
-- `returns table (queue text, …)` makes `queue` a PL/pgSQL OUT variable, so
-- the unqualified `select queue, count(*) … group by queue` inside the body
-- is ambiguous and the function fails on every call:
--   ERROR 42702: column reference "queue" is ambiguous
-- Found by the post-apply smoke test on 2026-09-09, the first time the D6
-- migration ran against a real database (HELD.md: pgTAP suite "not run
-- locally"). Same signature, same grants; only the subquery is qualified.
--
-- ROLLBACK: not needed — the prior body was unusable.

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
        select d.queue as dl_queue, count(*) as cnt
        from helm_jobs.dead_letters d
        group by d.queue
    ) dl on dl.dl_queue = m.queue_name
    where m.queue_name in ('coachhelm_analysis', 'email_send', 'push_send');
end;
$$;

revoke execute on function public.helm_jobs_depth() from public,
anon,
authenticated;
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
