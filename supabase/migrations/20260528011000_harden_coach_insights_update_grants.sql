-- OBSOLETE — DO NOT APPLY, DO NOT STAMP. See supabase/migrations/HELD.md
-- ("Why 20260528011000 is obsolete rather than pending"): the live
-- `dismissInsight` action (src/app/golf/actions/intelligence-dashboard.ts)
-- writes `status`/`dismissed`/`lifecycle_state` under the user-scoped client,
-- and this revoke would make that call fail with 42501. The intent is still
-- right; the mechanism (a column-level REVOKE) cannot distinguish a coach
-- from a player, since both share the `authenticated` role. Kept in the tree,
-- unapplied, as the record of that finding — not a pending migration.
--
-- Replay-safe re-application of S-CRIT-2: authenticated players may only update
-- their own user-facing acknowledgement/dismissal timestamps on coach insights.
-- The production baseline restored broader grants; narrow them again here.

REVOKE ALL ON TABLE public.golf_coach_insights FROM anon;
REVOKE UPDATE ON TABLE public.golf_coach_insights FROM authenticated;
REVOKE UPDATE (
  status,
  dismissed,
  resolved_at,
  metadata,
  lifecycle_state
) ON TABLE public.golf_coach_insights FROM authenticated;

GRANT UPDATE (
  acknowledged_at,
  dismissed_at
) ON TABLE public.golf_coach_insights TO authenticated;
