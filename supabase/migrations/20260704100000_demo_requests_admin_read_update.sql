-- Admins triage inbound demo requests from the CRM UI via the BROWSER client,
-- but demo_requests only had an INSERT policy (public landing-page form) and a
-- service_role ALL policy. Result: the admin dashboard badge (server-side,
-- service role) counted 3 inbound leads while the Inbound Leads list
-- (client-side, RLS) rendered 0 rows for everyone — including admins.
-- Same admin predicate pattern as crm_coaches policies.
-- APPLIED to prod 2026-07-04 via MCP (mirrored here for the record).
DROP POLICY IF EXISTS "Admins can view demo requests" ON public.demo_requests;
CREATE POLICY "Admins can view demo requests" ON public.demo_requests
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = (SELECT auth.uid()) AND users.role = 'admin'::user_role
  ));

DROP POLICY IF EXISTS "Admins can update demo requests" ON public.demo_requests;
CREATE POLICY "Admins can update demo requests" ON public.demo_requests
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = (SELECT auth.uid()) AND users.role = 'admin'::user_role
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = (SELECT auth.uid()) AND users.role = 'admin'::user_role
  ));
