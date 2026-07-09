-- P1: bridge_baseball_coach_lifting_access() (20260708010000) only ever GRANTS
-- (upserts helm_lifting_org_viewers can_edit=true) on INSERT/UPDATE of
-- baseball_coaches.organization_id/user_id -- it never REVOKES. A coach who
-- switches organizations, or is removed from baseball_coaches entirely, keeps
-- Lifting Lab edit access to their PRIOR org forever. This migration adds the
-- missing revoke paths without touching the existing grant behavior.
--
-- (1) Extend the existing AFTER INSERT OR UPDATE trigger function: on UPDATE,
--     when organization_id actually changes, revoke the OLD org grant -- but
--     ONLY if no OTHER baseball_coaches row for the same user still grants
--     that same OLD org (a coach can hold more than one baseball_coaches row,
--     e.g. a showcase/JUCO coach spanning orgs).
-- (2) New AFTER DELETE trigger + function: on baseball_coaches row deletion,
--     revoke that user+org's grant, again ONLY if no OTHER baseball_coaches
--     row for the same user still grants that org.
--
-- Idempotent (CREATE OR REPLACE FUNCTION; DROP TRIGGER IF EXISTS + CREATE).
-- Written NOT applied -- part of the 2026-07-08 integration-verification pass.

CREATE OR REPLACE FUNCTION public.bridge_baseball_coach_lifting_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- Revoke path: the granted (organization_id, user_id) pair changed on UPDATE
  -- (org reassigned OR the row's user_id reassigned). Drop the OLD pair's grant
  -- unless another baseball_coaches row still justifies it. The trigger fires
  -- on UPDATE OF organization_id, user_id, so a user_id-only change must also
  -- reach here (previously it slipped through, leaving a stale grant).
  IF TG_OP = 'UPDATE'
     AND OLD.organization_id IS NOT NULL
     AND OLD.user_id IS NOT NULL
     AND (OLD.organization_id IS DISTINCT FROM NEW.organization_id
          OR OLD.user_id IS DISTINCT FROM NEW.user_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.baseball_coaches bc2
      WHERE bc2.id <> OLD.id
        AND bc2.user_id = OLD.user_id
        AND bc2.organization_id = OLD.organization_id
    ) THEN
      UPDATE public.helm_lifting_org_viewers
      SET can_edit = false
      WHERE organization_id = OLD.organization_id
        AND user_id = OLD.user_id
        AND sport = 'baseball';
    END IF;
  END IF;

  -- Grant path: unchanged from the original bridge (INSERT, or UPDATE of
  -- organization_id/user_id landing on a non-null pair).
  IF NEW.organization_id IS NOT NULL AND NEW.user_id IS NOT NULL THEN
    INSERT INTO public.helm_lifting_org_viewers (organization_id, user_id, sport, can_edit, granted_by)
    VALUES (NEW.organization_id, NEW.user_id, 'baseball', true, 'trigger:baseball-coach-lifting-bridge')
    ON CONFLICT (organization_id, user_id, sport)
    DO UPDATE SET can_edit = true;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bridge_baseball_coach_lifting_access() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_bridge_baseball_coach_lifting ON public.baseball_coaches;
CREATE TRIGGER trg_bridge_baseball_coach_lifting
AFTER INSERT OR UPDATE OF organization_id, user_id ON public.baseball_coaches
FOR EACH ROW EXECUTE FUNCTION public.bridge_baseball_coach_lifting_access();

-- New: AFTER DELETE revoke. Separate function (DELETE triggers only see OLD,
-- and RETURNING NEW from a shared function on DELETE would error), same
-- "no other qualifying row" guard as the UPDATE path above.
CREATE OR REPLACE FUNCTION public.bridge_baseball_coach_lifting_revoke_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF OLD.organization_id IS NOT NULL AND OLD.user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.baseball_coaches bc2
      WHERE bc2.id <> OLD.id
        AND bc2.user_id = OLD.user_id
        AND bc2.organization_id = OLD.organization_id
    ) THEN
      UPDATE public.helm_lifting_org_viewers
      SET can_edit = false
      WHERE organization_id = OLD.organization_id
        AND user_id = OLD.user_id
        AND sport = 'baseball';
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bridge_baseball_coach_lifting_revoke_on_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_bridge_baseball_coach_lifting_delete ON public.baseball_coaches;
CREATE TRIGGER trg_bridge_baseball_coach_lifting_delete
AFTER DELETE ON public.baseball_coaches
FOR EACH ROW EXECUTE FUNCTION public.bridge_baseball_coach_lifting_revoke_on_delete();
