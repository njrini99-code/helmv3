-- Supabase advisor remediation:
-- - security_definer_view: views default to definer semantics unless opted into
--   security_invoker. This CRM grouping view should respect crm_coaches RLS.
-- - function_search_path_mutable: trigger functions should pin search_path.

alter view if exists public.v_crm_coaches_by_school
  set (security_invoker = true);

alter function if exists public.golf_recruit_documents_assert_same_team()
  set search_path = public, pg_temp;

alter function if exists public.golf_recruit_documents_touch_updated_at()
  set search_path = public, pg_temp;
