-- Replay-safe re-application of CRM admin RPC grant hardening. The stripped
-- production baseline revokes PUBLIC, but local replay still leaves explicit
-- anon/authenticated EXECUTE grants on these SECURITY DEFINER functions.

REVOKE ALL ON FUNCTION public.get_crm_coach_email_events(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_crm_coach_email_events(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_crm_coach_email_events(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_crm_coach_email_events(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_crm_email_stats_detailed() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_crm_email_stats_detailed() FROM anon;
REVOKE ALL ON FUNCTION public.get_crm_email_stats_detailed() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_crm_email_stats_detailed() TO service_role;
