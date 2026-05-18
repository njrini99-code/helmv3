-- Ensure the backwards-compatible CRM email events view respects the querying
-- user's RLS/permissions instead of the view owner's privileges.
ALTER VIEW public.crm_email_events SET (security_invoker = true);
