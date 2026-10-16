-- S1 (Clubhouse release review, 2026-10-16): any signed-in account could make
-- itself a coach of any organization.
--
-- golf_coaches_insert_own / _update_own and baseball_coaches_insert_own /
-- _update_own check only `user_id = auth.uid()`, nothing guarded
-- organization_id, and organizations_select_all hands every id to anyone signed
-- in. Dozens of policies trust "a coach row in this organization": with one
-- forged row an account could rename or delete the organization (the delete
-- cascades into all of its Lift Lab and billing rows), read and review join
-- requests, read and change travel budgets, insert teams, edit holes and shots,
-- and, for baseball, the lifting bridge trigger granted Lift Lab edit access to
-- the organization's athletes.
--
-- Fix:
--   1. A direct client write (role `authenticated` or `anon`) may set a coach's
--      organization_id only to null, leave it unchanged, or point it at a
--      program the caller is creating right now: an organization made in the
--      last 15 minutes that no golf or baseball coach belongs to yet. That is
--      golf and baseball onboarding (insert the organization, then the coach).
--      Joining an existing program goes through server code with the service
--      role (golf staff invites, assistant approval and decline) or a SECURITY
--      DEFINER function (baseball_accept_staff_invite), which the guard leaves
--      alone: it checks current_user, which is the function owner there.
--   2. Deleting an organization from the client is limited to the sole coach of
--      a program, or to onboarding's rollback of an organization nobody coaches
--      yet. Any coach of a shared program could delete it before.
--   3. A baseball coach may create a team only in their own organization, or in
--      none (showcase teams). Any baseball coach could create a team in any
--      organization before.
--
-- Existing rows are not touched. On 2026-10-16 no production coach row looked
-- forged: every golf coach whose organization has other coaches is on a team's
-- staff in it.
--
-- ROLLBACK: DROP TRIGGER golf_coaches_guard_organization_id ON public.golf_coaches;
-- DROP TRIGGER baseball_coaches_guard_organization_id ON public.baseball_coaches;
-- DROP FUNCTION public.guard_coach_organization_id();
-- DROP FUNCTION public.coach_organization_is_claimable(uuid, uuid);
-- and re-create organizations_delete_own_coach (FOR DELETE, roles public) and
-- baseball_teams_insert_coaches from supabase/schemas/policies as of the
-- parent commit. That reopens S1.
--
-- VERIFY: select count(*) = 2 from pg_trigger
-- VERIFY: where tgname in ('golf_coaches_guard_organization_id', 'baseball_coaches_guard_organization_id')
-- VERIFY: and not tgisinternal;
-- VERIFY: select count(*) = 1 from pg_policies
-- VERIFY: where schemaname = 'public' and tablename = 'organizations'
-- VERIFY: and policyname = 'organizations_delete_own_coach' and qual like '%helm_lifting_coaches%';
-- VERIFY: select count(*) = 1 from pg_policies
-- VERIFY: where schemaname = 'public' and tablename = 'baseball_teams'
-- VERIFY: and policyname = 'baseball_teams_insert_coaches' and with_check like '%organization_id IS NULL%';

SET lock_timeout = '3s';

-- The membership test runs as definer: the caller cannot see other programs'
-- coach rows, so an invoker-rights test would always find the program empty.
-- It ignores the caller's own rows, because an upsert checks its proposed row
-- (a new id) before it finds the caller's existing one.
CREATE OR REPLACE FUNCTION public.coach_organization_is_claimable(p_org_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.organizations o
           WHERE o.id = p_org_id
             AND o.created_at > now() - interval '15 minutes'
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.golf_coaches c
           WHERE c.organization_id = p_org_id AND c.user_id IS DISTINCT FROM p_user_id
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.baseball_coaches c
           WHERE c.organization_id = p_org_id AND c.user_id IS DISTINCT FROM p_user_id
         );
$$;

REVOKE ALL ON FUNCTION public.coach_organization_is_claimable(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_organization_is_claimable(uuid, uuid) TO authenticated, service_role;

-- Invoker rights on purpose: current_user is the caller's role for a direct
-- write and the function owner inside a SECURITY DEFINER function.
CREATE OR REPLACE FUNCTION public.guard_coach_organization_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
    RETURN NEW;
  END IF;
  IF public.coach_organization_is_claimable(NEW.organization_id, NEW.user_id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'A coach joins an existing program by invitation'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_coach_organization_id() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS golf_coaches_guard_organization_id ON public.golf_coaches;
CREATE TRIGGER golf_coaches_guard_organization_id
  BEFORE INSERT OR UPDATE OF organization_id ON public.golf_coaches
  FOR EACH ROW EXECUTE FUNCTION public.guard_coach_organization_id();

DROP TRIGGER IF EXISTS baseball_coaches_guard_organization_id ON public.baseball_coaches;
CREATE TRIGGER baseball_coaches_guard_organization_id
  BEFORE INSERT OR UPDATE OF organization_id ON public.baseball_coaches
  FOR EACH ROW EXECUTE FUNCTION public.guard_coach_organization_id();

-- 2. Organization delete: the sole coach of a program, or onboarding's rollback.
DROP POLICY IF EXISTS organizations_delete_own_coach ON public.organizations;
CREATE POLICY organizations_delete_own_coach ON public.organizations
  FOR DELETE TO authenticated
  USING (
    (
      EXISTS (
        SELECT 1 FROM public.golf_coaches me
        WHERE me.user_id = (SELECT auth.uid()) AND me.organization_id = organizations.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.golf_coaches other
        WHERE other.organization_id = organizations.id AND other.user_id <> (SELECT auth.uid())
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.baseball_coaches bc WHERE bc.organization_id = organizations.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.helm_lifting_coaches lc WHERE lc.organization_id = organizations.id
      )
    )
    OR (
      NOT EXISTS (SELECT 1 FROM public.golf_coaches c WHERE c.organization_id = organizations.id)
      AND NOT EXISTS (SELECT 1 FROM public.baseball_coaches c WHERE c.organization_id = organizations.id)
      AND NOT EXISTS (SELECT 1 FROM public.helm_lifting_coaches c WHERE c.organization_id = organizations.id)
      AND organizations.created_at > now() - interval '5 minutes'
    )
  );

-- 3. Baseball teams: only in the caller's own organization, or none.
DROP POLICY IF EXISTS baseball_teams_insert_coaches ON public.baseball_teams;
CREATE POLICY baseball_teams_insert_coaches ON public.baseball_teams
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.baseball_coaches bc
      WHERE bc.user_id = (SELECT auth.uid())
        AND (baseball_teams.organization_id IS NULL OR bc.organization_id = baseball_teams.organization_id)
    )
  );
