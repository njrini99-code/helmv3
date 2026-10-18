-- S1 (Clubhouse release review, 2026-10-16): any signed-in account could
-- make itself a coach of any organization.
--
-- golf_coaches_insert_own / _update_own and baseball_coaches_insert_own /
-- _update_own check only `user_id = auth.uid()`, nothing guarded
-- organization_id, and organizations_select_all hands every id to anyone
-- signed in (production sign-up is open with email autoconfirm, so that is
-- anyone). Dozens of policies trust "a coach row in this organization": with
-- one forged row an account could rename or delete the organization (the
-- delete cascades into all of its Lift Lab and billing rows), read and
-- review join requests, read and change travel budgets, insert teams, edit
-- holes and shots, and, for baseball, the lifting bridge trigger granted Lift
-- Lab edit access to the organization's athletes. Lift Lab had two doors of
-- its own: hlc_update pinned only user_id (move the row, or reactivate it
-- after removal), and production's hlci_insert checked only
-- invited_by_user_id, so anyone could invite themselves to any organization
-- and accept the invite.
--
-- Fix:
--   1. organizations remember who created them. A client insert stamps
--      created_by and created_at; a client update cannot change id,
--      created_by or created_at. Rows the service role creates have no
--      created_by.
--   2. A direct client write (role `authenticated` or `anon`) may set a golf
--      or baseball coach's organization_id only to null, leave it unchanged,
--      or point it at an organization the caller created in the last 5
--      minutes that has no golf, baseball or Lift Lab coach but the caller.
--      That is golf onboarding (insert the organization, then the coach).
--      Everything else that attaches a coach runs as the service role (golf
--      staff invites, assistant approval and decline, baseball onboarding)
--      or as a SECURITY DEFINER function (helm_lifting_accept_invite), which
--      the guards leave alone: they check current_user, the function owner
--      there.
--   3. A Lift Lab coach cannot move their own row to another organization or
--      set it back to active from the client, and a Lift Lab invite can only
--      be created or edited for an organization the inviter may invite to: a
--      head coach of one of its golf or baseball teams whose coach row is in
--      it (the app's rule, src/app/lifting/actions/invites.ts) or a Lift Lab
--      editor.
--   4. Deleting an organization from the client is limited to its only
--      coach, or to onboarding's rollback of an organization the caller just
--      created and nobody coaches. The checks run as definer, so they see
--      every coach row, not just the ones the caller may read.
--   5. A baseball team can be created only in the caller's own organization
--      or in none (showcase teams), and cannot be moved to another one.
--   6. The baseball lifting bridge grants Lift Lab edit access only when a
--      coach row is created or really changes organization or user: a no-op
--      update no longer re-grants edit access the program switched off.
--
-- Existing rows are not touched. On 2026-10-16 no production row looked
-- forged: every golf coach whose organization has other coaches is on a
-- team's staff in it, no baseball coach in a shared organization lacks a
-- staff row there, the bridge has granted no Lift Lab edit access, both Lift
-- Lab coaches are alone in their organizations, and no Lift Lab invite has
-- ever existed.
--
-- ROLLBACK: drop the seven triggers this file creates
-- (golf_coaches_guard_organization_id, baseball_coaches_guard_organization_id,
-- helm_lifting_coaches_guard_self_update, baseball_teams_guard_organization_id,
-- organizations_stamp_creator, trg_bridge_baseball_coach_lifting_update and
-- trg_bridge_baseball_coach_lifting), then re-create
-- trg_bridge_baseball_coach_lifting as AFTER INSERT OR UPDATE OF
-- organization_id, user_id ON public.baseball_coaches FOR EACH ROW EXECUTE
-- FUNCTION public.bridge_baseball_coach_lifting_access().
-- Re-create organizations_delete_own_coach FOR DELETE (role public) USING
-- (a golf_coaches row with user_id = auth.uid() and this organization_id
-- exists) OR (no golf_coaches row and no baseball_coaches row has this
-- organization_id AND created_at > now() - interval '5 minutes').
-- Re-create baseball_teams_insert_coaches FOR INSERT TO authenticated
-- WITH CHECK (a baseball_coaches row with user_id = auth.uid() exists).
-- ALTER POLICY hlci_insert and hlci_update to
-- WITH CHECK (invited_by_user_id = (SELECT auth.uid())).
-- Drop the functions guard_coach_organization_id(),
-- guard_lifting_coach_self_update(), guard_baseball_team_organization_id(),
-- stamp_organization_creator(), coach_organization_is_claimable(uuid),
-- can_delete_organization(uuid) and helm_lifting_can_invite_coach(uuid), and
-- ALTER TABLE public.organizations DROP COLUMN created_by.
-- That reopens S1.
--
-- VERIFY: select count(*) = 7 from pg_trigger
-- VERIFY: where tgname in (
-- VERIFY: 'golf_coaches_guard_organization_id',
-- VERIFY: 'baseball_coaches_guard_organization_id',
-- VERIFY: 'helm_lifting_coaches_guard_self_update',
-- VERIFY: 'baseball_teams_guard_organization_id',
-- VERIFY: 'organizations_stamp_creator',
-- VERIFY: 'trg_bridge_baseball_coach_lifting',
-- VERIFY: 'trg_bridge_baseball_coach_lifting_update')
-- VERIFY: and not tgisinternal;
-- VERIFY: select count(*) = 1 from information_schema.columns
-- VERIFY: where table_schema = 'public' and table_name = 'organizations'
-- VERIFY: and column_name = 'created_by';
-- VERIFY: select count(*) = 1 from pg_policies
-- VERIFY: where schemaname = 'public' and tablename = 'organizations'
-- VERIFY: and policyname = 'organizations_delete_own_coach'
-- VERIFY: and qual like '%can_delete_organization%';
-- VERIFY: select count(*) = 2 from pg_policies
-- VERIFY: where schemaname = 'public'
-- VERIFY: and tablename = 'helm_lifting_coach_invites'
-- VERIFY: and policyname in ('hlci_insert', 'hlci_update')
-- VERIFY: and with_check like '%helm_lifting_can_invite_coach%';
-- VERIFY: select count(*) = 1 from pg_policies
-- VERIFY: where schemaname = 'public' and tablename = 'baseball_teams'
-- VERIFY: and policyname = 'baseball_teams_insert_coaches'
-- VERIFY: and with_check like '%organization_id IS NULL%';

SET lock_timeout = '3s';

-- 1. Who created an organization. 29 rows in production, and the new column
-- is null in all of them: the foreign key's check and the plain index hold
-- their locks for milliseconds.
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS created_by uuid
-- squawk-ignore adding-foreign-key-constraint
REFERENCES auth.users (id) ON DELETE SET NULL;

-- 29 rows; CONCURRENTLY cannot run inside the migration's transaction.
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS organizations_created_by_idx
ON public.organizations (created_by);

-- Invoker rights on purpose (as every guard below): current_user is the
-- caller's role for a direct write and the function owner inside a SECURITY
-- DEFINER function, so server code and definer functions are left alone.
CREATE OR REPLACE FUNCTION public.stamp_organization_creator()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := (SELECT auth.uid());
    NEW.created_at := now();
  ELSE
    NEW.id := OLD.id;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_organization_creator() FROM public, anon;

DROP TRIGGER IF EXISTS organizations_stamp_creator ON public.organizations;
CREATE TRIGGER organizations_stamp_creator
BEFORE INSERT OR UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.stamp_organization_creator();

-- 2. Coach rows. The membership test runs as definer: the caller cannot see
-- other programs' coach rows, so an invoker-rights test would find any
-- program empty. It answers only for the caller, and ignores the caller's
-- own rows, because an upsert checks its proposed row (a new id) before it
-- finds the caller's existing one.
CREATE OR REPLACE FUNCTION public.coach_organization_is_claimable(
    p_org_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND EXISTS (
           SELECT 1 FROM public.organizations o
           WHERE o.id = p_org_id
             AND o.created_by = (SELECT auth.uid())
             AND o.created_at > now() - interval '5 minutes'
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.golf_coaches c
           WHERE c.organization_id = p_org_id
             AND c.user_id IS DISTINCT FROM (SELECT auth.uid())
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.baseball_coaches c
           WHERE c.organization_id = p_org_id
             AND c.user_id IS DISTINCT FROM (SELECT auth.uid())
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.helm_lifting_coaches c
           WHERE c.organization_id = p_org_id
             AND c.user_id IS DISTINCT FROM (SELECT auth.uid())
         );
$$;

REVOKE ALL ON FUNCTION public.coach_organization_is_claimable(uuid)
FROM public, anon;
GRANT EXECUTE ON FUNCTION public.coach_organization_is_claimable(uuid)
TO authenticated, service_role;

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
  IF TG_OP = 'UPDATE'
     AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
    RETURN NEW;
  END IF;
  IF public.coach_organization_is_claimable(NEW.organization_id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'A coach joins an existing program by invitation'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_coach_organization_id() FROM public, anon;

DROP TRIGGER IF EXISTS golf_coaches_guard_organization_id
ON public.golf_coaches;
CREATE TRIGGER golf_coaches_guard_organization_id
BEFORE INSERT OR UPDATE OF organization_id ON public.golf_coaches
FOR EACH ROW EXECUTE FUNCTION public.guard_coach_organization_id();

DROP TRIGGER IF EXISTS baseball_coaches_guard_organization_id
ON public.baseball_coaches;
CREATE TRIGGER baseball_coaches_guard_organization_id
BEFORE INSERT OR UPDATE OF organization_id ON public.baseball_coaches
FOR EACH ROW EXECUTE FUNCTION public.guard_coach_organization_id();

-- 3. Lift Lab. A row's organization and reactivation belong to the program
-- (invite acceptance runs as definer), never to the coach's own client.
-- Lift Lab onboarding upserts on (user_id, organization_id) with status
-- active, which keeps the organization and leaves an active row active.
CREATE OR REPLACE FUNCTION public.guard_lifting_coach_self_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'A Lift Lab coach joins an organization by invitation'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Only the program can reactivate a coach'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_lifting_coach_self_update()
FROM public, anon;

DROP TRIGGER IF EXISTS helm_lifting_coaches_guard_self_update
ON public.helm_lifting_coaches;
CREATE TRIGGER helm_lifting_coaches_guard_self_update
BEFORE UPDATE OF organization_id, status ON public.helm_lifting_coaches
FOR EACH ROW EXECUTE FUNCTION public.guard_lifting_coach_self_update();

-- Who may invite a Lift Lab coach to an organization: the app's rule
-- (verifyHeadCoachForOrg: a primary or head coach on one of its baseball
-- teams, or the primary coach on one of its golf teams, whose coach row is in
-- the organization) or a Lift Lab editor of it.
CREATE OR REPLACE FUNCTION public.helm_lifting_can_invite_coach(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.helm_lifting_can_edit_org(p_org)
      OR EXISTS (
           SELECT 1
           FROM public.baseball_coaches bc
           JOIN public.baseball_team_coach_staff s ON s.coach_id = bc.id
           JOIN public.baseball_teams t ON t.id = s.team_id
           WHERE bc.user_id = (SELECT auth.uid())
             AND bc.organization_id = p_org
             AND t.organization_id = p_org
             AND (s.is_primary IS TRUE OR s.is_head_coach IS TRUE)
         )
      OR EXISTS (
           SELECT 1
           FROM public.golf_coaches gc
           JOIN public.golf_team_coach_staff s ON s.coach_id = gc.id
           JOIN public.golf_teams t ON t.id = s.team_id
           WHERE gc.user_id = (SELECT auth.uid())
             AND gc.organization_id = p_org
             AND t.organization_id = p_org
             AND s.is_primary IS TRUE
         );
$$;

REVOKE ALL ON FUNCTION public.helm_lifting_can_invite_coach(uuid)
FROM public, anon;
GRANT EXECUTE ON FUNCTION public.helm_lifting_can_invite_coach(uuid)
TO authenticated, service_role;

ALTER POLICY hlci_insert ON public.helm_lifting_coach_invites
WITH CHECK (
    invited_by_user_id = (SELECT auth.uid())
    AND public.helm_lifting_can_invite_coach(organization_id)
);

ALTER POLICY hlci_update ON public.helm_lifting_coach_invites
WITH CHECK (
    invited_by_user_id = (SELECT auth.uid())
    AND public.helm_lifting_can_invite_coach(organization_id)
);

-- 4. Organization delete: its only coach, or onboarding's rollback.
CREATE OR REPLACE FUNCTION public.can_delete_organization(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND NOT EXISTS (
           SELECT 1 FROM public.golf_coaches c
           WHERE c.organization_id = p_org_id
             AND c.user_id <> (SELECT auth.uid())
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.baseball_coaches c
           WHERE c.organization_id = p_org_id
             AND c.user_id <> (SELECT auth.uid())
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.helm_lifting_coaches c
           WHERE c.organization_id = p_org_id
             AND c.user_id <> (SELECT auth.uid())
         )
     AND (
           EXISTS (
             SELECT 1 FROM public.golf_coaches me
             WHERE me.organization_id = p_org_id
               AND me.user_id = (SELECT auth.uid())
           )
        OR EXISTS (
             SELECT 1 FROM public.organizations o
             WHERE o.id = p_org_id
               AND o.created_by = (SELECT auth.uid())
               AND o.created_at > now() - interval '5 minutes'
               AND NOT EXISTS (
                     SELECT 1 FROM public.baseball_coaches c
                     WHERE c.organization_id = p_org_id
                   )
               AND NOT EXISTS (
                     SELECT 1 FROM public.helm_lifting_coaches c
                     WHERE c.organization_id = p_org_id
                   )
           )
         );
$$;

REVOKE ALL ON FUNCTION public.can_delete_organization(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_delete_organization(uuid)
TO authenticated, service_role;

DROP POLICY IF EXISTS organizations_delete_own_coach ON public.organizations;
CREATE POLICY organizations_delete_own_coach ON public.organizations
FOR DELETE TO authenticated
USING (public.can_delete_organization(id));

-- 5. Baseball teams: created only in the caller's own organization, or none,
-- and never moved to another one from the client. Not the golf-style WITH
-- CHECK on the update policies: baseball assistants (staff invites) have no
-- organization on their coach row and would lose every team update.
DROP POLICY IF EXISTS baseball_teams_insert_coaches ON public.baseball_teams;
CREATE POLICY baseball_teams_insert_coaches ON public.baseball_teams
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.baseball_coaches bc
        WHERE
            bc.user_id = (SELECT auth.uid())
            AND (
                baseball_teams.organization_id IS NULL
                OR bc.organization_id = baseball_teams.organization_id
            )
    )
);

CREATE OR REPLACE FUNCTION public.guard_baseball_team_organization_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'A team cannot be moved to another program'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_baseball_team_organization_id()
FROM public, anon;

DROP TRIGGER IF EXISTS baseball_teams_guard_organization_id
ON public.baseball_teams;
CREATE TRIGGER baseball_teams_guard_organization_id
BEFORE UPDATE OF organization_id ON public.baseball_teams
FOR EACH ROW EXECUTE FUNCTION public.guard_baseball_team_organization_id();

-- 6. The lifting bridge: on insert, and on an update that really changes
-- the organization or user. A WHEN clause cannot read OLD on insert, so two
-- triggers.
DROP TRIGGER IF EXISTS trg_bridge_baseball_coach_lifting
ON public.baseball_coaches;
CREATE TRIGGER trg_bridge_baseball_coach_lifting
AFTER INSERT ON public.baseball_coaches
FOR EACH ROW EXECUTE FUNCTION public.bridge_baseball_coach_lifting_access();

DROP TRIGGER IF EXISTS trg_bridge_baseball_coach_lifting_update
ON public.baseball_coaches;
CREATE TRIGGER trg_bridge_baseball_coach_lifting_update
AFTER UPDATE OF organization_id, user_id ON public.baseball_coaches
FOR EACH ROW
WHEN (
    old.organization_id IS DISTINCT FROM new.organization_id
    OR old.user_id IS DISTINCT FROM new.user_id
)
EXECUTE FUNCTION public.bridge_baseball_coach_lifting_access();
