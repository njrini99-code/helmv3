-- =============================================================================
-- 20260624000440_baseball_strength_group_audit.sql
--
-- V11 Strength Groups — membership audit ledger (spec L198: "Dynamic group
-- membership changes create audit events"). Additive to the V11 premium lifting
-- migration (20260624000063). NO live apply in this environment — the migration
-- is the contract; hand-written types mirror it in baseball-lifting-v11.ts.
--
-- A single append-only ledger row per membership delta (added / removed) and per
-- group lifecycle change (created / rule_changed / type_changed / recomputed),
-- so a coach can answer "why is this athlete in this group, and when/by whom did
-- it change?" for both static (manual) and dynamic (rule-driven) groups.
--
-- APPEND-ONLY: no UPDATE/DELETE policy is granted — an audit row is immutable
-- history. ON DELETE CASCADE from the group keeps the ledger from outliving a
-- deleted group, but the rows are never mutated in place.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.baseball_strength_group_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  group_id    uuid NOT NULL REFERENCES public.baseball_strength_groups(id) ON DELETE CASCADE,
  -- The membership delta or lifecycle event this row records.
  event_type  text NOT NULL DEFAULT 'member_added'
    CHECK (event_type IN (
      'group_created','group_updated','rule_changed','type_changed',
      'member_added','member_removed','recomputed'
    )),
  -- The affected player (null for group-level lifecycle events).
  player_id   uuid REFERENCES public.baseball_players(id) ON DELETE SET NULL,
  -- How the change happened: a manual edit, a dynamic rule recompute, or import.
  source      text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','rule','import','system')),
  -- Human-readable summary the UI can render verbatim (e.g.
  -- "Added by rule: matched Position = P"). Never a medical claim.
  detail      text,
  -- Optional structured context (rule snapshot, counts) for forensic depth.
  meta_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_coach_id uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS baseball_strength_group_audit_group_idx
  ON public.baseball_strength_group_audit (group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS baseball_strength_group_audit_team_idx
  ON public.baseball_strength_group_audit (team_id, created_at DESC);

-- ---- RLS: staff-read, staff-write (can_manage_lifting); append-only ----------
ALTER TABLE public.baseball_strength_group_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bsga_select ON public.baseball_strength_group_audit;
DROP POLICY IF EXISTS bsga_insert ON public.baseball_strength_group_audit;
-- A staff member of the team reads the ledger (no player-facing audit surface).
CREATE POLICY bsga_select ON public.baseball_strength_group_audit FOR SELECT TO authenticated
  USING (public.is_baseball_team_staff(team_id));
-- Only a lifting-capable staff member (or service_role) appends. The group must
-- belong to the asserted team — defense in depth against a forged team_id.
CREATE POLICY bsga_insert ON public.baseball_strength_group_audit FOR INSERT TO authenticated
  WITH CHECK (
    public.has_baseball_staff_capability(team_id,'can_manage_lifting')
    AND EXISTS (SELECT 1 FROM public.baseball_strength_groups g
                WHERE g.id = group_id AND g.team_id = baseball_strength_group_audit.team_id)
  );
-- No UPDATE / DELETE policy: the ledger is immutable history.

-- ---- GRANTS — authenticated (RLS-gated) + service_role; NEVER anon -----------
REVOKE ALL ON public.baseball_strength_group_audit FROM anon;
GRANT SELECT, INSERT ON public.baseball_strength_group_audit TO authenticated;
GRANT ALL ON public.baseball_strength_group_audit TO service_role;
