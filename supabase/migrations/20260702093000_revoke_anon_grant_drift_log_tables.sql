-- W11 follow-up: the run_integrity_checks() anon_grant_drift check (built this
-- wave) immediately flagged 4 Bridge-sensitive log tables carrying a legacy
-- table-level GRANT to anon (SELECT+INSERT). RLS mitigates today (none of them
-- has an anon policy), but the grant is exactly the recurring latent-leak
-- gotcha. Revoke anon entirely on all four. authenticated grants are RETAINED:
-- each table has legit authenticated policies (admin read; audit_log/error_logs
-- authenticated self-insert) that the live app + legacy /golf/admin rely on.
REVOKE ALL ON TABLE public.audit_log           FROM anon;
REVOKE ALL ON TABLE public.background_job_logs  FROM anon;
REVOKE ALL ON TABLE public.error_logs           FROM anon;
REVOKE ALL ON TABLE public.login_attempts       FROM anon;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_log','background_job_logs','error_logs','login_attempts'] LOOP
    IF has_table_privilege('anon', 'public.'||t, 'SELECT')
       OR has_table_privilege('anon', 'public.'||t, 'INSERT')
       OR has_table_privilege('anon', 'public.'||t, 'UPDATE')
       OR has_table_privilege('anon', 'public.'||t, 'DELETE') THEN
      RAISE EXCEPTION 'ACL check failed: anon still has grants on public.%', t;
    END IF;
    -- keep the legacy authenticated read path intact
    IF NOT has_table_privilege('authenticated', 'public.'||t, 'SELECT') THEN
      RAISE EXCEPTION 'ACL check failed: authenticated SELECT dropped on public.% (admin read path)', t;
    END IF;
  END LOOP;
END $$;
