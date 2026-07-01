-- Normalize BaseballHelm event acknowledgement policies after the Wave 1
-- timeline migration and the shared RLS helper migration both created policies
-- for the same commands under different names.
--
-- The final contract is one permissive policy per command on
-- public.baseball_event_acknowledgements, using the later capability-aware
-- baseball_event_acknowledgements_* policies from
-- 20260624000050_baseball_rls_helpers_and_policies.sql.

DROP POLICY IF EXISTS "baseball_event_acks_select"
  ON public.baseball_event_acknowledgements;
DROP POLICY IF EXISTS "baseball_event_acks_insert"
  ON public.baseball_event_acknowledgements;
DROP POLICY IF EXISTS "baseball_event_acks_update"
  ON public.baseball_event_acknowledgements;
DROP POLICY IF EXISTS "baseball_event_acks_delete"
  ON public.baseball_event_acknowledgements;
