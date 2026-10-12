-- ROLLBACK CAPTURE for supabase/migrations/20261007100000_golf_rls_helpers_sql_language.sql
--
-- Forward change (held, not applied): rewrites the five golf team-membership
-- RLS helpers from LANGUAGE plpgsql to LANGUAGE sql with (select auth.uid())
-- and search_path pg_catalog, public, pg_temp. Same signatures, return type,
-- volatility (STABLE) and SECURITY DEFINER.
--
-- Prior definitions below were captured VERBATIM from the live production
-- catalog (pg_get_functiondef, read-only transaction, 2026-10-12 04:31 UTC).
-- prosrc md5 at capture:
--   is_golf_team_coach(uuid)          c144fbd017e88109b60ecdbb50898943
--   is_golf_team_head_coach(uuid)     6cb9ec267654aa9f926b407ce317833d
--   is_golf_team_player(uuid)         409f36942f1627014b0edc6abeb2f3ca
--   is_team_coach(uuid)               35b392acc452cc49f03a163a694bda50
--   is_team_player(uuid)              25975323d4b7f5308ed98b40fb99149d
-- Grants at capture time, all five: EXECUTE for postgres, authenticated,
-- service_role; nothing for PUBLIC or anon. CREATE OR REPLACE keeps the ACL
-- and the COMMENTs (is_golf_team_head_coach, is_team_coach, is_team_player
-- carry one; the forward file sets none), so the revert needs no GRANT or
-- COMMENT. CREATE OR REPLACE does reset the SET search_path clause, so the
-- prior paths come back exactly: 'public', 'pg_temp' on the three is_golf_*
-- helpers, 'public' alone on is_team_coach / is_team_player.
--
-- APPLY ORDER CAVEAT: this capture is production BEFORE 20260929200000, which
-- must be applied first (filename order) and pins is_team_coach /
-- is_team_player to search_path 'public', 'pg_temp'. If 20260929200000 is
-- live when this rollback runs, follow it with
--   ALTER FUNCTION public.is_team_coach(uuid) SET search_path = public, pg_temp;
--   ALTER FUNCTION public.is_team_player(uuid) SET search_path = public, pg_temp;
-- or re-capture the five bodies right before applying the forward file.
--
-- WHAT THIS ROLLBACK COSTS: nothing functional (same predicates); it gives
-- back the per-call plpgsql executor entry and the missing pg_temp entry on
-- is_team_coach / is_team_player.
--
-- Metadata (fill on apply):
--   forward commit:          (the commit carrying the forward migration on main)
--   forward applied to prod: ____________________ (timestamp, by owner)
--   rollback applied:        ____________________ (timestamp, by owner)
--   approval:                owner (Nick)
--   sentry watch:            42501 / empty-team reads on golf surfaces, 24h after either apply

-- -- Revert SQL (exact prior production state; run as one transaction) -------

CREATE OR REPLACE FUNCTION public.is_golf_team_coach(team_uuid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM golf_team_coach_staff gtcs
    JOIN golf_coaches gc ON gc.id = gtcs.coach_id
    WHERE gtcs.team_id = team_uuid
    AND gc.user_id = auth.uid()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_golf_team_head_coach(team_uuid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM golf_team_coach_staff gtcs
    JOIN golf_coaches gc ON gc.id = gtcs.coach_id
    WHERE gtcs.team_id = team_uuid
      AND gc.user_id = auth.uid()
      AND gtcs.role = 'head_coach'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_golf_team_player(team_uuid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM golf_team_members gtm
    JOIN golf_players gp ON gp.id = gtm.player_id
    WHERE gtm.team_id = team_uuid
    AND gp.user_id = auth.uid()
    AND gtm.status = 'active'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_team_coach(team_uuid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM golf_team_coach_staff s
    JOIN golf_coaches c ON c.id = s.coach_id
    WHERE s.team_id = team_uuid
      AND c.user_id = auth.uid()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_team_player(team_uuid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM golf_team_members m
    JOIN golf_players p ON p.id = m.player_id
    WHERE m.team_id = team_uuid
      AND p.user_id = auth.uid()
      AND m.status = 'active'::team_member_status
  );
END;
$function$;

-- -- Verification (expect one row: all five back to the captured bodies) ------
--   select 1 where (select count(*) from pg_proc p
--     where p.pronamespace = 'public'::regnamespace and (p.proname, md5(p.prosrc)) in (
--       ('is_golf_team_coach', 'c144fbd017e88109b60ecdbb50898943'),
--       ('is_golf_team_head_coach', '6cb9ec267654aa9f926b407ce317833d'),
--       ('is_golf_team_player', '409f36942f1627014b0edc6abeb2f3ca'),
--       ('is_team_coach', '35b392acc452cc49f03a163a694bda50'),
--       ('is_team_player', '25975323d4b7f5308ed98b40fb99149d')
--     ) and p.prosecdef and p.provolatile = 's') = 5;
