-- A production-side backup created on 2026-07-20 inherited the API roles'
-- default table grants. It is operational backup data, not an application
-- surface: deny both API roles and enable RLS with no policies. Postgres and
-- service_role retain maintenance access.
do $$
begin
  if to_regclass('public.crm_email_templates_backup_20260720') is not null then
    execute 'revoke all on table public.crm_email_templates_backup_20260720 from anon, authenticated';
    execute 'alter table public.crm_email_templates_backup_20260720 enable row level security';
  end if;
end
$$;
