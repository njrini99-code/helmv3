-- ROLLBACK CAPTURE for supabase/migrations/20260825233000_fix_round_recap_wrapper_definer.sql
--
-- Forward change: recreated public.save_round_ai_recap(uuid, text) as a
-- SECURITY DEFINER facade (commit 5f52f5f9c on main; Sentry
-- JAVASCRIPT-NEXTJS-PT).
--
-- Prior definition below was captured VERBATIM from the live production
-- catalog (pg_get_functiondef, 2026-08-25, before any production apply of
-- the forward migration). Grants at capture time: EXECUTE for postgres,
-- authenticated, service_role; nothing for PUBLIC or anon.
--
-- ⚠ WHAT THIS ROLLBACK COSTS: reverting restores the SECURITY INVOKER
-- wrapper, which CANNOT cross into helm_private for any authenticated
-- caller — i.e. it restores the recap-persist outage (42501 for every real
-- user). Use only if the definer facade itself causes a worse regression.
--
-- Metadata (fill on apply):
--   forward commit:        5f52f5f9c (main)
--   forward applied to prod: ____________________ (timestamp, by owner)
--   rollback applied:        ____________________ (timestamp, by owner)
--   approval:                owner (Nick)
--   sentry watch:            JAVASCRIPT-NEXTJS-PT, 24h after either apply

-- ── Revert SQL (exact prior production state) ────────────────────────────

CREATE OR REPLACE FUNCTION public.save_round_ai_recap(p_round_id uuid, p_recap text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT helm_private.save_round_ai_recap(p_round_id, p_recap, auth.uid());
$function$;

REVOKE EXECUTE ON FUNCTION public.save_round_ai_recap(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_round_ai_recap(uuid, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.save_round_ai_recap(uuid, text) IS NULL;

-- ── Verification query (expect prosecdef = false after revert) ───────────
-- SELECT p.prosecdef, pg_get_userbyid(p.proowner) AS owner, p.proacl
-- FROM pg_proc p
-- WHERE p.oid = 'public.save_round_ai_recap(uuid, text)'::regprocedure;
