-- v3 Wave 9 part 2 — RLS helper functions
--
-- Adds 5 SECURITY DEFINER helpers that every v3 table's RLS policies
-- compose against. Codifies the corrected coach<->team join via
-- golf_team_coach_staff (golf_coaches.team_id does not exist; see
-- docs/v3-master-plan.md Part II).
--
-- These helpers are an access-primitive bundle introduced together so
-- v3 RLS policies (W18 goals, W27 intent, W29 selections, etc.) can
-- compose them without inlining joins. A schema correction patches
-- every policy at once.
--
-- VERIFIED 2026-05-24 against prod project qmnssrrolpinvwjjnufo:
--
--   SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.proname IN
--     ('current_player_id','current_coach_id','is_team_coach',
--      'is_team_player','is_in_team');
--   -> [] (none exist; safe to create)
--
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='golf_team_coach_staff';
--   -> id (uuid), team_id (uuid), coach_id (uuid), role (text),
--      is_primary (bool), created_at (timestamptz)
--   (No soft-delete column; presence of row = staff membership.)
--
--   SELECT enumlabel FROM pg_enum WHERE
--     enumtypid='public.team_member_status'::regtype ORDER BY enumsortorder;
--   -> ('pending','active','inactive','removed')
--   (is_team_player filters status='active' only.)
--
-- Pattern matches existing is_golf_team_primary_coach RPC:
--   LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
--   BEGIN ... RETURN EXISTS (...); END;
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.is_in_team(uuid);
--   DROP FUNCTION IF EXISTS public.is_team_player(uuid);
--   DROP FUNCTION IF EXISTS public.is_team_coach(uuid);
--   DROP FUNCTION IF EXISTS public.current_coach_id();
--   DROP FUNCTION IF EXISTS public.current_player_id();
--   (Safe — no v3 policies depend on these until W18+.)

CREATE OR REPLACE FUNCTION public.current_player_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_player_id uuid;
BEGIN
  SELECT id INTO v_player_id
  FROM golf_players
  WHERE user_id = auth.uid()
  LIMIT 1;
  RETURN v_player_id;
END;
$function$;

COMMENT ON FUNCTION public.current_player_id() IS
  'v3 RLS helper: returns the golf_players.id for the currently authenticated user, or NULL if the user is not a player. Use in player-scoped policies via "player_id = current_player_id()".';


CREATE OR REPLACE FUNCTION public.current_coach_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_coach_id uuid;
BEGIN
  SELECT id INTO v_coach_id
  FROM golf_coaches
  WHERE user_id = auth.uid()
  LIMIT 1;
  RETURN v_coach_id;
END;
$function$;

COMMENT ON FUNCTION public.current_coach_id() IS
  'v3 RLS helper: returns the golf_coaches.id for the currently authenticated user, or NULL if the user is not a coach.';


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

COMMENT ON FUNCTION public.is_team_coach(uuid) IS
  'v3 RLS helper: true if the current user is on the given team''s coaching staff (any role). Broader than is_golf_team_primary_coach, which restricts to primary only.';


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

COMMENT ON FUNCTION public.is_team_player(uuid) IS
  'v3 RLS helper: true if the current user is an ACTIVE player on the given team. Players with status (pending|inactive|removed) return false.';


CREATE OR REPLACE FUNCTION public.is_in_team(team_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.is_team_coach(team_uuid) OR public.is_team_player(team_uuid);
END;
$function$;

COMMENT ON FUNCTION public.is_in_team(uuid) IS
  'v3 RLS helper: either-or convenience. True if the current user is a coach OR an active player on the given team. Use for team-scoped shared-read policies (Pattern 3 in docs/v3-rls-template.md).';
