-- Golf auth integrity (auth scrub, 2026-11-25). Forward-only; each part is independent and rolls back as noted.
--
-- 1. An email change reaches the app's own copies. auth.users is the source of truth, but public.users.email (UNIQUE,
--    read by every notification sender) and the golf/baseball profile emails were written once at sign-up and never
--    again: a coach who changed address kept getting team mail at the old one, and anyone signing up later with the
--    old address hit users_email_key inside handle_new_user ("Database error saving new user").
-- 2. A signed-in user cannot rewrite their own public.users.email through PostgREST (GRANT ALL + users_update_own let
--    them), which let anyone squat an address and block its owner's sign-up in all three sports.
-- 3. Join codes are unique ignoring case and stored upper case, as every join path compares them (upper(join_code)).
-- 4. (Not here.) A database-wide one-current-team rule was left out on purpose: golf_division_cohort.sql covers a player
--    active on two teams by design, so it is an owner decision. The self-serve join still refuses a second team.
-- 5. A coach account cannot join a team as a player through the join function.
-- 6. A player's own join request can only be created as pending.
--
-- Checked on production before writing (read-only, 2026-11-25): 0 email drift between auth.users and public.users,
-- 0 case-insensitive duplicate join codes, 0 join codes outside ^[A-Z0-9]+$ (lengths 6, 8 and 9), 0 players with two active or pending
-- memberships, no trigger on auth.users other than on_auth_user_created.

-- 1 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_user_email_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.email IS NULL OR NEW.email IS NOT DISTINCT FROM OLD.email THEN
    RETURN NEW;
  END IF;
  -- Never block the email change itself: a copy that cannot be written is logged and left for a person to look at.
  BEGIN
    UPDATE public.users SET email = NEW.email, updated_at = now() WHERE id = NEW.id;
    UPDATE public.golf_coaches SET email = NEW.email WHERE user_id = NEW.id;
    UPDATE public.golf_players SET email = NEW.email WHERE user_id = NEW.id;
    UPDATE public.baseball_coaches SET email = NEW.email WHERE user_id = NEW.id;
    UPDATE public.baseball_players SET email = NEW.email WHERE user_id = NEW.id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_user_email_from_auth: could not copy the new email for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_user_email_from_auth() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
-- WHEN keeps it off GoTrue's other user updates (every sign in writes the row).
CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_user_email_from_auth();
-- ROLLBACK: DROP TRIGGER on_auth_user_email_changed ON auth.users; DROP FUNCTION public.sync_user_email_from_auth();

-- 2 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- A guard trigger rather than a column REVOKE: the app's own writes to users (notification preferences, last seen,
-- the onboarding upsert) keep working unchanged; only a signed-in caller changing the email column is refused. The
-- service role and the sync above (SECURITY DEFINER, owned by postgres) are not 'authenticated' and pass.
CREATE OR REPLACE FUNCTION public.guard_users_email_self_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'email changes go through account settings' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_users_email_self_change ON public.users;
CREATE TRIGGER guard_users_email_self_change
  BEFORE UPDATE OF email ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_users_email_self_change();
-- ROLLBACK: DROP TRIGGER guard_users_email_self_change ON public.users; DROP FUNCTION public.guard_users_email_self_change();

-- 3 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS golf_teams_join_code_upper_uidx ON public.golf_teams (upper(join_code));
ALTER TABLE public.golf_teams DROP CONSTRAINT IF EXISTS golf_teams_join_code_format;
ALTER TABLE public.golf_teams
  ADD CONSTRAINT golf_teams_join_code_format CHECK (join_code IS NULL OR join_code ~ '^[A-Z0-9]{4,12}$') NOT VALID;
ALTER TABLE public.golf_teams VALIDATE CONSTRAINT golf_teams_join_code_format;
-- ROLLBACK: DROP INDEX public.golf_teams_join_code_upper_uidx; ALTER TABLE public.golf_teams DROP CONSTRAINT golf_teams_join_code_format;

-- 5: the join function. Unchanged except the coach refusal and the conflict target (named, see below): re-joining your
-- own team is still a no-op success.
CREATE OR REPLACE FUNCTION public.golf_join_team_with_code(p_code text)
 RETURNS TABLE(team_id uuid, team_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid       uuid := (SELECT auth.uid());
  v_player_id uuid;
  v_team      record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT gp.id INTO v_player_id
  FROM public.golf_players gp WHERE gp.user_id = v_uid LIMIT 1;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'no golf player profile for this account' USING ERRCODE = '42501';
  END IF;

  -- A coach's login never becomes a roster player through a team code.
  IF EXISTS (SELECT 1 FROM public.golf_coaches c WHERE c.user_id = v_uid) THEN
    RAISE EXCEPTION 'coach accounts cannot join as players' USING ERRCODE = '42501';
  END IF;

  SELECT t.id, t.name INTO v_team
  FROM public.golf_teams t
  WHERE t.join_code IS NOT NULL
    AND upper(t.join_code) = upper(btrim(coalesce(p_code, '')))
    AND btrim(coalesce(p_code, '')) <> ''
  LIMIT 1;

  IF v_team.id IS NULL THEN
    RAISE EXCEPTION 'invalid join code' USING ERRCODE = '22023';
  END IF;

  -- No status filter: ANY membership of a DIFFERENT team blocks the join.
  IF EXISTS (
    SELECT 1 FROM public.golf_team_members m
    WHERE m.player_id = v_player_id AND m.team_id <> v_team.id
  ) THEN
    RAISE EXCEPTION 'already on another team' USING ERRCODE = '23505';
  END IF;

  -- Re-joining the team you are already on stays a no-op success, which the
  -- invite flow relies on: it runs the join twice by design.
  INSERT INTO public.golf_team_members (player_id, team_id, status)
  VALUES (v_player_id, v_team.id, 'active')
  -- Named constraint, not a column list: team_id is also this function's OUT column, so a column list is ambiguous
  -- (42702) and every join would fail.
  ON CONFLICT ON CONSTRAINT golf_team_members_team_id_player_id_key DO NOTHING;

  RETURN QUERY SELECT v_team.id, v_team.name;
END;
$function$;
-- Grants are unchanged by CREATE OR REPLACE.

-- 6 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Players can create their own join requests" ON public.golf_team_join_requests;
CREATE POLICY "Players can create their own join requests" ON public.golf_team_join_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.golf_players gp
      WHERE gp.id = golf_team_join_requests.player_id AND gp.user_id = (SELECT auth.uid())
    )
  );
-- ROLLBACK: recreate the policy without `status = 'pending' AND`.
