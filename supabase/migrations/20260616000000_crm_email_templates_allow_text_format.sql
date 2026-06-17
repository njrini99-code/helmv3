-- =============================================================================
-- crm_email_templates: allow the 'text' format (true text/plain email)
-- =============================================================================
-- The CRM previously stored only 'plain' (wrapped in the greeting/signature
-- HTML shell) and 'html' (verbatim document). Cold outreach lands in Gmail
-- Primary far more reliably when sent as a genuine text/plain email with no
-- HTML shell — so the send route now supports a 'text' format that emits the
-- body verbatim as Resend `text:`. Widen the CHECK constraint to permit it.
--
-- Idempotent: drops + re-adds the constraint with the expanded allow-list.
-- =============================================================================

ALTER TABLE public.crm_email_templates
  DROP CONSTRAINT IF EXISTS crm_email_templates_format_check;

ALTER TABLE public.crm_email_templates
  ADD CONSTRAINT crm_email_templates_format_check
  CHECK (format = ANY (ARRAY['plain'::text, 'html'::text, 'text'::text]));
