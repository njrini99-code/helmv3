-- Helm Jobs — OPTIONAL pg_cron + pg_net variant of the consumer trigger.
--
-- RISK TIER: R3 (privileged). HELD — see supabase/migrations/HELD.md. Do
-- NOT apply alongside relying on Vercel Cron for the same route; this file
-- is an ALTERNATIVE scheduler for /api/jobs/consume, not an addition to it.
-- The Vercel Cron entry (vercel.json, `* * * * *`) is the shipped default in
-- this PR. This migration exists only so the owner can choose to move the
-- tick from Vercel's scheduler into Postgres itself (pg_cron calling the
-- same route via pg_net) later, without a code change on the app side.
--
-- WHY THIS IS SEPARATE FROM THE APPLIED DEFAULT
-- ----------------------------------------------
-- pg_cron firing every minute against an HTTPS URL via pg_net is a
-- reasonable pattern, but it moves the failure mode from "Vercel's
-- scheduler" to "this database's pg_cron/pg_net extensions," and it
-- requires a secret to be readable from SQL — which this repo's hard
-- constraint says must come from Vault, never inlined as a literal. Both of
-- those are owner-weighed trade-offs, not something to default into.
--
-- OWNER STEPS BEFORE APPLYING (do these first; this file does not do them)
-- --------------------------------------------------------------------------
-- 1. Enable pg_cron and pg_net if not already on (Dashboard -> Database ->
--    Extensions, or `create extension if not exists pg_cron; create
--    extension if not exists pg_net;` run by a role with privilege).
-- 2. Store the cron secret in Vault — NEVER as a literal in this file or in
--    any SQL history:
--      select vault.create_secret(
--        '<the current CRON_SECRET value>', 'helm_jobs_cron_secret');
--    Rotate by calling `vault.update_secret` with the new value; this
--    migration reads the secret by NAME at call time, never by value.
-- 3. Confirm the deployed URL for /api/jobs/consume (production domain).
--
-- WHAT THIS FILE DOES
-- --------------------
-- Defines `helm_jobs_pg_cron_consume_tick()`, a small SECURITY DEFINER
-- wrapper that reads the Vault secret by name and fires one `pg_net.
-- http_post` at the consumer route with an `Authorization: Bearer <secret>`
-- header — the same header requireCronAuth (src/lib/cron/auth.ts) already
-- validates for the Vercel Cron path, so the app-side auth check is
-- unchanged either way. It does NOT schedule anything itself; the
-- `select cron.schedule(...)` call is commented out below and must be run
-- explicitly by the owner, once they have also REMOVED (or left disabled)
-- the corresponding vercel.json entry — running both schedulers against the
-- same route at once would double-process every tick (each individual
-- consume call is still race-safe via pgmq's own visibility-timeout locking,
-- but doubles read/ack traffic for no benefit).
--
-- ROLLBACK:
-- select cron.unschedule('helm-jobs-consume'); -- if scheduled
-- drop function public.helm_jobs_pg_cron_consume_tick();

create or replace function public.helm_jobs_pg_cron_consume_tick(
    p_target_url text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, vault, net
as $$
declare
    v_secret text;
    v_request_id bigint;
begin
    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'helm_jobs_cron_secret'
    limit 1;

    if v_secret is null then
        raise exception 'helm_jobs_pg_cron_consume_tick: vault secret "helm_jobs_cron_secret" not found — run vault.create_secret first (see this migration''s header)';
    end if;

    select net.http_post(
        url := p_target_url,
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || v_secret,
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 25000
    ) into v_request_id;

    return v_request_id;
end;
$$;

revoke execute on function public.helm_jobs_pg_cron_consume_tick(
    text
) from public,
anon,
authenticated;
grant execute on function public.helm_jobs_pg_cron_consume_tick(
    text
) to service_role;

do $$
declare v_fn oid := 'public.helm_jobs_pg_cron_consume_tick(text)'::regprocedure;
begin
    if has_function_privilege('public', v_fn, 'EXECUTE')
       or has_function_privilege('anon', v_fn, 'EXECUTE')
       or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
        raise exception 'ACL check failed: helm_jobs_pg_cron_consume_tick callable by public/anon/authenticated';
    end if;
    if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
        raise exception 'ACL check failed: helm_jobs_pg_cron_consume_tick not executable by service_role';
    end if;
end $$;

-- Owner-run only, AFTER removing/disabling the vercel.json cron entry for
-- /api/jobs/consume, with the real production URL substituted in:
--
-- select cron.schedule(
--   'helm-jobs-consume',
--   '* * * * *',
--   $$select public.helm_jobs_pg_cron_consume_tick(
--        'https://<production-domain>/api/jobs/consume');$$
-- );
