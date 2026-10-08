-- STATUS: WRITTEN, NOT APPLIED. Prepared by plan phase 6 item 6.1.
-- Apply: npm run db:apply -- supabase/migrations/20261007100000_golf_rls_helpers_sql_language.sql
-- Risk: LOW-MEDIUM. Every golf RLS policy calls these five functions, so a
-- semantic slip would change access everywhere. Same signatures, same
-- return type, same ACL (CREATE OR REPLACE keeps it). Rehearse locally.
--
-- Rewrites the five team-membership RLS helpers from LANGUAGE plpgsql to
-- LANGUAGE sql with (select auth.uid()) and a pinned search_path.
--
--   public.is_golf_team_coach(uuid)       any staff row on the team
--   public.is_golf_team_head_coach(uuid)  staff row with role = 'head_coach'
--   public.is_golf_team_player(uuid)      active team member
--   public.is_team_coach(uuid)            same predicate as is_golf_team_coach
--   public.is_team_player(uuid)           same predicate as is_golf_team_player
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES NOT DO: make the helpers inlinable
-- ---------------------------------------------------------------------------
-- Postgres never inlines a SECURITY DEFINER function, or any function that
-- has a SET clause. These helpers must stay SECURITY DEFINER, because the
-- SELECT policy on golf_team_coach_staff itself calls is_golf_team_coach and
-- is_golf_team_player: an INVOKER version would re-enter that policy and
-- recurse. So the planner still treats each call as an opaque per-row call.
--
-- What the rewrite does buy:
--   * no plpgsql executor entry per call (the SQL body is planned once per
--     call site and cached),
--   * (select auth.uid()) evaluated as an InitPlan inside the body,
--   * search_path pinned to pg_catalog, public, pg_temp on all five. Before
--     this, is_team_coach and is_team_player had no pg_temp entry at the end
--     of their path, so a session-created temp object could shadow a table
--     name inside a SECURITY DEFINER body,
--   * every relation inside the body is schema-qualified.
-- The latency win for the hot golf_holes and golf_shots reads comes from the
-- policy shape in 20261007101000, not from this file.
--
-- Semantics are identical to the live definitions (read with
-- pg_get_functiondef on 2026-10-07):
--   * NULL team_uuid, NULL auth.uid() and no matching row all return false,
--     because EXISTS never returns NULL. The functions are deliberately NOT
--     STRICT: a STRICT function would return NULL for a NULL team_uuid, and a
--     policy that negates the call would then behave differently.
--   * volatility stays STABLE, security stays DEFINER.
--   * is_golf_team_player compared status to the text literal 'active',
--     which coerced to the team_member_status enum. This file spells the
--     cast out.
--
-- ROLLBACK: restore the plpgsql bodies. They are CREATE OR REPLACE with the
-- same signatures, so no dependent policy or function needs touching:
--   CREATE OR REPLACE FUNCTION public.is_golf_team_coach(team_uuid uuid)
--    RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
--    SET search_path TO 'public', 'pg_temp' AS $f$ BEGIN RETURN EXISTS (
--    SELECT 1 FROM golf_team_coach_staff gtcs JOIN golf_coaches gc ON
--    gc.id = gtcs.coach_id WHERE gtcs.team_id = team_uuid AND gc.user_id =
--    auth.uid()); END; $f$;
--   (the other four follow the same shape; the originals are visible in
--   supabase/migrations/20260527000000_prod_public_baseline.sql and in
--   production via pg_get_functiondef.)
--
-- VERIFY: select 1 where (select count(*) from pg_proc p join pg_language l on l.oid = p.prolang where p.pronamespace = 'public'::regnamespace and p.proname in ('is_golf_team_coach', 'is_golf_team_head_coach', 'is_golf_team_player', 'is_team_coach', 'is_team_player') and l.lanname = 'sql' and p.prosecdef and p.provolatile = 's') = 5;
-- VERIFY: select 1 where not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('is_golf_team_coach', 'is_golf_team_head_coach', 'is_golf_team_player', 'is_team_coach', 'is_team_player') and (p.proconfig is null or not ('search_path=pg_catalog, public, pg_temp' = any (p.proconfig))));
-- VERIFY: select 1 where not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('is_golf_team_coach', 'is_golf_team_head_coach', 'is_golf_team_player', 'is_team_coach', 'is_team_player') and has_function_privilege('anon', p.oid, 'EXECUTE'));

CREATE OR REPLACE FUNCTION public.is_golf_team_coach(team_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.golf_team_coach_staff gtcs
    JOIN public.golf_coaches gc ON gc.id = gtcs.coach_id
    WHERE gtcs.team_id = team_uuid
      AND gc.user_id = (SELECT auth.uid())
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_golf_team_head_coach(team_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.golf_team_coach_staff gtcs
    JOIN public.golf_coaches gc ON gc.id = gtcs.coach_id
    WHERE gtcs.team_id = team_uuid
      AND gc.user_id = (SELECT auth.uid())
      AND gtcs.role = 'head_coach'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_golf_team_player(team_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.golf_team_members gtm
    JOIN public.golf_players gp ON gp.id = gtm.player_id
    WHERE gtm.team_id = team_uuid
      AND gp.user_id = (SELECT auth.uid())
      AND gtm.status = 'active'::public.team_member_status
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_team_coach(team_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.golf_team_coach_staff s
    JOIN public.golf_coaches c ON c.id = s.coach_id
    WHERE s.team_id = team_uuid
      AND c.user_id = (SELECT auth.uid())
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_team_player(team_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.golf_team_members m
    JOIN public.golf_players p ON p.id = m.player_id
    WHERE m.team_id = team_uuid
      AND p.user_id = (SELECT auth.uid())
      AND m.status = 'active'::public.team_member_status
  );
$function$;
