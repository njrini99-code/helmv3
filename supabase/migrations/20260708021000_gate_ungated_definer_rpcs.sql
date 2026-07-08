-- SECURITY (2026-07-08 forensic audit): tighten ungated SECURITY DEFINER RPCs.
-- Each verified individually for safe blast radius (app call sites checked).
-- Idempotent. Applied to prod via MCP apply_migration on 2026-07-08.

-- (1) update_user_last_seen: was UPDATE-any-user-by-uuid. The only app caller
--     (components/admin/LastSeenUpdater.tsx) always passes the CALLER's own id.
--     Guard so a user can only touch their own row (admins may touch any).
CREATE OR REPLACE FUNCTION public.update_user_last_seen(target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF target_user_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE users
  SET last_seen = NOW()
  WHERE id = target_user_id
    AND (last_seen IS NULL OR last_seen < NOW() - INTERVAL '5 minutes');
END;
$function$;

-- (2) Dead RPCs (zero app call sites; auditor-confirmed unreachable): revoke
--     EXECUTE from authenticated/anon. A future service_role/cron caller would
--     bypass these grants anyway.
REVOKE EXECUTE ON FUNCTION public.get_pending_task_reminders() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.mark_task_reminder_sent(uuid) FROM authenticated, anon;

-- (3) CRM analytics RPCs: zero app call sites, and every sibling CRM analytics
--     RPC is admin-gated. Revoke authenticated/anon EXECUTE (admin surfaces call
--     CRM analytics via the service_role admin client).
REVOKE EXECUTE ON FUNCTION public.get_crm_click_destinations(text, integer) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.get_crm_template_performance(text) FROM authenticated, anon;

-- (4) refresh_crm_coach_engagement: only caller is the cron route, which uses
--     the service_role admin client (src/app/api/cron/refresh-engagement/route.ts
--     -> createAdminClient). Revoke authenticated to remove the shared-DB DoS
--     surface (a materialized-view refresh any user could otherwise trigger).
REVOKE EXECUTE ON FUNCTION public.refresh_crm_coach_engagement() FROM authenticated, anon;
