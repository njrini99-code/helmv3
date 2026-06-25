-- Supabase advisor remediation:
-- - security_definer_view: views default to definer semantics unless opted into
--   security_invoker. This CRM grouping view should respect crm_coaches RLS.
-- - function_search_path_mutable: trigger functions should pin search_path.

-- NOTE: ALTER FUNCTION has no `IF EXISTS` clause in PostgreSQL — `alter function
-- if exists ...` parses `if` as the function name and errors at `exists`
-- (SQLSTATE 42601), which breaks `supabase db reset` replays from scratch.
-- Guard each statement with an existence check inside a DO block instead.
do $$
begin
  if exists (
    select 1 from pg_views where schemaname = 'public' and viewname = 'v_crm_coaches_by_school'
  ) then
    execute 'alter view public.v_crm_coaches_by_school set (security_invoker = true)';
  end if;

  if exists (
    select 1 from pg_proc
    where proname = 'golf_recruit_documents_assert_same_team'
      and pronamespace = 'public'::regnamespace
  ) then
    execute 'alter function public.golf_recruit_documents_assert_same_team() set search_path = public, pg_temp';
  end if;

  if exists (
    select 1 from pg_proc
    where proname = 'golf_recruit_documents_touch_updated_at'
      and pronamespace = 'public'::regnamespace
  ) then
    execute 'alter function public.golf_recruit_documents_touch_updated_at() set search_path = public, pg_temp';
  end if;
end $$;
