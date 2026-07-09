-- Bridge: baseball coaches get Lifting Lab edit access for their org (sport='baseball').
-- Parity with the legacy baseball_lift_* editor (any baseball coach could author programs),
-- required after repointing baseball performance routes at the canonical helm_lifting_* stack,
-- whose RLS (helm_lifting_can_edit_org) requires a lifting-coach or org-viewer(can_edit) row.
-- Applied to prod 2026-07-08 via MCP apply_migration (same content).

INSERT INTO public.helm_lifting_org_viewers (organization_id, user_id, sport, can_edit, granted_by)
SELECT bc.organization_id, bc.user_id, 'baseball', true, 'migration:baseball-coach-lifting-bridge'
FROM public.baseball_coaches bc
WHERE bc.organization_id IS NOT NULL AND bc.user_id IS NOT NULL
ON CONFLICT (organization_id, user_id, sport)
DO UPDATE SET can_edit = true;

CREATE OR REPLACE FUNCTION public.bridge_baseball_coach_lifting_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
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
