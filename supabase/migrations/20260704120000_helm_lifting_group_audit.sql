-- helm_lifting_group_audit — helm mirror of legacy baseball_strength_group_audit,
-- the ONE legacy Lift Lab table with no helm equivalent. Created ahead of the
-- program-builder→helm unification so appendGroupAudit() can swap targets.
-- Renames follow the family convention: player→athlete, +organization_id/sport,
-- +legacy_baseball_id. Immutable log: coach-edit SELECT/INSERT only, no
-- UPDATE/DELETE policies. Predicates reuse the existing helm_lifting_can_*
-- helper functions (same as helm_lifting_groups' hlg_* policies).
-- APPLIED to prod 2026-07-04 via MCP (mirrored here for the record).

CREATE TABLE IF NOT EXISTS public.helm_lifting_group_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sport text NOT NULL DEFAULT 'baseball',
  team_id uuid,
  group_id uuid REFERENCES public.helm_lifting_groups(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor_id uuid,
  target_athlete_id uuid REFERENCES public.helm_lifting_athletes(id) ON DELETE SET NULL,
  before_state jsonb,
  after_state jsonb,
  note text,
  legacy_baseball_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hlga_group ON public.helm_lifting_group_audit (group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hlga_org ON public.helm_lifting_group_audit (organization_id, created_at DESC);

ALTER TABLE public.helm_lifting_group_audit ENABLE ROW LEVEL SECURITY;

-- Table recreation auto-grants ALL to anon+authenticated (Supabase default
-- privileges) — revoke anon outright; authenticated keeps grants but is
-- constrained by the policies below.
REVOKE ALL ON public.helm_lifting_group_audit FROM anon;

DROP POLICY IF EXISTS hlga_select ON public.helm_lifting_group_audit;
CREATE POLICY hlga_select ON public.helm_lifting_group_audit
  FOR SELECT TO authenticated
  USING (helm_lifting_can_edit_org(organization_id));

DROP POLICY IF EXISTS hlga_insert ON public.helm_lifting_group_audit;
CREATE POLICY hlga_insert ON public.helm_lifting_group_audit
  FOR INSERT TO authenticated
  WITH CHECK (helm_lifting_can_edit_org(organization_id));
