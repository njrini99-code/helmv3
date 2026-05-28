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
