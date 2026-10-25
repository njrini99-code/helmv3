-- DECLARATIVE: exempt scheduler only; a function that reads Vault and calls
-- pg_net, and a cron.schedule the owner runs by hand
-- STATUS: WRITTEN — HOLD — ALTERNATIVE. Do not apply unless the Vercel cron
-- /api/cron/class-holds-release is removed from vercel.json (plan owner call
-- 8b).
--
-- Clubhouse P-10 alternative scheduler. Mirrors
-- 20260906141000_helm_jobs_pg_cron_consume_variant.sql: pg_cron fires every
-- minute
-- and pg_net posts to the same route with the cron secret read from Vault by
-- name.
-- Composing and sending stay in the app (they need the APNs edge-function path
-- and
-- the TypeScript summary composer); only the clock moves.
--
-- WHY THIS IS NOT THE DEFAULT. The Vercel cron adds no new moving part and
-- matches
-- 26 existing crons. This file exists so the owner can move the tick into
-- Postgres
-- later without a code change. Applying both schedulers would double the ticks
-- (harmless thanks to SKIP LOCKED and claim tokens, but wasteful and
-- confusing).
--
-- OWNER STEPS BEFORE APPLYING (this file does not do them)
--   1. Enable pg_cron and pg_net (Dashboard -> Database -> Extensions). pg_cron
-- is
--      not declared in supabase/schemas/shared/01_extensions.sql, so it is
--      unverified in production; the DO block below only raises a NOTICE if
-- either
--      extension is missing (the function is still created, and fails when
-- called).
--   2. The Vault secret 'helm_jobs_cron_secret' must hold the current
-- CRON_SECRET
--      (the same name 20260906141000 reads). Never a literal in this file.
--   3. Pass the production URL of /api/cron/class-holds-release to the schedule
-- call.
--
-- WHAT THIS FILE DOES. Defines golf_class_holds_release_tick(p_target_url), a
-- SECURITY DEFINER wrapper that reads the Vault secret by name and fires one
-- pg_net.http_post with 'Authorization: Bearer <secret>', the header
-- requireCronAuth
-- already validates. It schedules nothing: the cron.schedule call is commented
-- out
-- at the bottom and is owner-run.
--
-- Risk: MEDIUM (privileged: reads Vault, makes an outbound call). service_role
-- only.
--
-- ROLLBACK: select cron.unschedule('class-holds-release'); -- if it was
-- scheduled
-- ROLLBACK: drop function public.golf_class_holds_release_tick(text);
-- VERIFY: select 1 where exists (select 1 from pg_proc where oid =
-- VERIFY: 'public.golf_class_holds_release_tick(text)'::regprocedure) and not
-- VERIFY: has_function_privilege('anon',
-- VERIFY: 'public.golf_class_holds_release_tick(text)', 'execute') and not
-- VERIFY: has_function_privilege('authenticated',
-- VERIFY: 'public.golf_class_holds_release_tick(text)', 'execute') and
-- VERIFY: has_function_privilege('service_role',
-- VERIFY: 'public.golf_class_holds_release_tick(text)', 'execute');

SET lock_timeout = '3s';

-- S-15: say plainly when the extensions are missing, and carry on. Applying
-- this file (CI applies every migration, held ones
-- included, to a stack with neither extension) must not fail on a missing
-- extension: the function below is only text until it is
-- called, and it is only called by the owner-run schedule, which needs both
-- extensions.
DO $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'golf_class_holds_release_tick: the pg_cron extension is not enabled; the schedule cannot be created until it is (see this migration''s header)';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'golf_class_holds_release_tick: the pg_net extension is not enabled; the function will fail when called until it is (see this migration''s header)';
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.golf_class_holds_release_tick(
    p_target_url text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, vault, net
AS $$
declare
    v_secret text;
    v_request_id bigint;
begin
    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'helm_jobs_cron_secret'
    limit 1;

    if v_secret is null then
        raise exception 'golf_class_holds_release_tick: vault secret "helm_jobs_cron_secret" not found; run vault.create_secret first (see this migration''s header)';
    end if;

    select net.http_post(
        url := p_target_url,
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || v_secret,
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
    ) into v_request_id;

    return v_request_id;
end;
$$;

REVOKE EXECUTE ON FUNCTION public.golf_class_holds_release_tick(
    text
) FROM public,
anon,
authenticated;
GRANT EXECUTE ON FUNCTION public.golf_class_holds_release_tick(
    text
) TO service_role;

-- Owner-run only, AFTER removing the vercel.json cron entry for
-- /api/cron/class-holds-release, with the real production URL substituted in:
--
-- select cron.schedule(
--   'class-holds-release',
--   '* * * * *',
--   $$select public.golf_class_holds_release_tick(
--        'https://<production-domain>/api/cron/class-holds-release');$$
-- );
