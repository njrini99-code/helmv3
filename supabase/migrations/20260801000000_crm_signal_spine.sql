-- ============================================================================
-- CRM signal spine — capture v_crm_coach_activity + v_crm_coach_signal_summary
--
-- Both views already exist in production (Helm-Production, qmnssrrolpinvwjjnufo).
-- This migration is a capture-and-harden pass: CREATE OR REPLACE reproducing
-- the live pg_get_viewdef() output verbatim, plus the grant hardening below.
-- No DROP anywhere in this file, and it changes no column, join, filter or
-- literal — a fresh environment or a future diff can now reproduce exactly
-- what is actually running instead of trusting an undocumented prod object.
--
-- Why clicks are excluded from intent_score (do not "fix" this later):
--   Measured 2026-06-11 (the day of a 511-email send): 1,073 of 1,219
--   all-time clicks fired that single day — 2.1 clicks/send against 233
--   opens, 8-27 clicks per recipient. That ratio is email-security-gateway
--   link scanning, not a human reading and clicking a link — the same
--   scanner-prefetch shape documented in 20260724000000_crm_inbound_signal
--   _capture.sql for demo-gate sessions. v_crm_coach_signal_summary's
--   intent_score and last_intent_at are therefore computed ONLY from
--   demo_entered + reply_received + email_opened; email_clicked is
--   deliberately never in that filter, and no surface may present raw click
--   counts as an engagement metric anywhere in the UI.
--
-- Grants: both views ship WITH (security_invoker = true) already in prod.
-- Live aclexplode(relacl) confirms `authenticated` currently holds ALL
-- privileges on both views (INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/
-- TRIGGER/MAINTAIN, not just SELECT) — a real excess grant, not a
-- hypothetical one. `REVOKE ALL ... FROM anon, PUBLIC` alone does not
-- close that: PUBLIC is a pseudo-role, and authenticated's ALL grant was
-- made directly to authenticated, not inherited through PUBLIC, so it
-- survives a PUBLIC-only revoke untouched. To actually leave authenticated
-- at SELECT-only — the posture this migration documents — `authenticated`
-- is included in the REVOKE ALL clause below before the GRANT SELECT,
-- following the precedent in 20260725210000_coachhelm_chat_revoke_anon.sql
-- (REVOKE the broad grant explicitly, then GRANT back only what's needed;
-- these views need SELECT only — no app path writes through a view).
-- service_role and postgres keep ALL as owner/bypass roles, unchanged.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- v_crm_coach_activity — one row per signal, keyed to coach_id
--
-- Unions crm_contact_log (outbound sends), email_events (delivery/open/
-- click/bounce), golf_demo_sessions (demo tours), crm_replies (inbound),
-- crm_stage_transitions (pipeline moves) and crm_notes. Resolves coach via
-- contact_log_id first, falling back to lower(email) match against
-- crm_coaches, so a signal that never linked to an outbound send (a demo
-- session or reply from a cold prospect) still attributes to a coach
-- instead of being silently dropped.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_crm_coach_activity
WITH (security_invoker = true)
AS
SELECT
  l.coach_id,
  'outbound_email'::text AS signal,
  l.contact_type::text AS detail,
  l.created_at AS occurred_at,
  1 AS weight,
  l.subject AS context
FROM crm_contact_log l
WHERE l.coach_id IS NOT NULL

UNION ALL

SELECT
  COALESCE(cl.coach_id, c.id) AS coach_id,
  'email_'::text || replace(ev.event_type, 'email.'::text, ''::text) AS signal,
  ev.event_type AS detail,
  ev.occurred_at,
  CASE ev.event_type
    WHEN 'email.clicked'::text THEN 2
    WHEN 'email.opened'::text THEN 2
    WHEN 'email.bounced'::text THEN 0
    ELSE 1
  END AS weight,
  ev.recipient_email AS context
FROM email_events ev
LEFT JOIN crm_contact_log cl ON cl.id = ev.contact_log_id
LEFT JOIN crm_coaches c ON lower(c.email) = lower(ev.recipient_email)
WHERE COALESCE(cl.coach_id, c.id) IS NOT NULL

UNION ALL

SELECT
  COALESCE(s.crm_coach_id, c.id) AS coach_id,
  'demo_entered'::text AS signal,
  'demo_session'::text AS detail,
  s.entered_at AS occurred_at,
  10 AS weight,
  s.school AS context
FROM golf_demo_sessions s
LEFT JOIN crm_coaches c ON lower(c.email) = lower(s.email)
WHERE COALESCE(s.crm_coach_id, c.id) IS NOT NULL

UNION ALL

SELECT
  r.coach_id,
  'reply_received'::text AS signal,
  'inbound_reply'::text AS detail,
  r.received_at AS occurred_at,
  20 AS weight,
  r.subject AS context
FROM crm_replies r
WHERE r.coach_id IS NOT NULL

UNION ALL

SELECT
  t.coach_id,
  'stage_change'::text AS signal,
  t.to_status AS detail,
  t.changed_at AS occurred_at,
  3 AS weight,
  t.from_status AS context
FROM crm_stage_transitions t
WHERE t.coach_id IS NOT NULL

UNION ALL

SELECT
  n.coach_id,
  'note'::text AS signal,
  COALESCE(n.kind, 'note'::text) AS detail,
  n.created_at AS occurred_at,
  1 AS weight,
  "left"(n.body, 120) AS context
FROM crm_notes n
WHERE n.coach_id IS NOT NULL;

COMMENT ON VIEW public.v_crm_coach_activity IS
  'One row per signal (outbound send, email delivery/open/click/bounce, demo tour, reply, stage change, note), keyed to coach_id. Resolves coach via contact_log_id first, falling back to lower(email) match against crm_coaches, so signals that never linked to an outbound send (e.g. a demo session or reply from a cold prospect) still attribute to a coach instead of being silently dropped. Source of truth for v_crm_coach_signal_summary — do not query the underlying tables directly for rollups.';

REVOKE ALL ON public.v_crm_coach_activity FROM anon, PUBLIC, authenticated;
GRANT SELECT ON public.v_crm_coach_activity TO authenticated;


-- ----------------------------------------------------------------------------
-- v_crm_coach_signal_summary — per-coach rollup over v_crm_coach_activity
--
-- Placed after v_crm_coach_activity since it joins it; a fresh-environment
-- apply would otherwise fail with "relation v_crm_coach_activity does not
-- exist." intent_score and last_intent_at deliberately exclude email_clicked
-- — see the header comment above.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_crm_coach_signal_summary
WITH (security_invoker = true)
AS
SELECT
  c.id AS coach_id,
  c.name,
  c.school,
  c.email,
  c.status::text AS stage,
  c.email_status::text AS email_status,
  count(*) FILTER (WHERE a.signal = 'outbound_email'::text) AS touches,
  count(*) FILTER (WHERE a.signal = 'email_delivered'::text) AS delivered,
  count(*) FILTER (WHERE a.signal = 'email_opened'::text) AS opens,
  count(*) FILTER (WHERE a.signal = 'demo_entered'::text) AS demo_visits,
  count(*) FILTER (WHERE a.signal = 'reply_received'::text) AS replies,
  count(*) FILTER (WHERE a.signal = 'email_bounced'::text) AS bounces,
  max(a.occurred_at) FILTER (
    WHERE a.signal = ANY (ARRAY['demo_entered'::text, 'reply_received'::text, 'email_opened'::text])
  ) AS last_intent_at,
  max(a.occurred_at) AS last_any_signal_at,
  COALESCE(
    sum(a.weight) FILTER (
      WHERE a.signal = ANY (ARRAY['demo_entered'::text, 'reply_received'::text, 'email_opened'::text])
    ),
    0::bigint
  ) AS intent_score
FROM crm_coaches c
LEFT JOIN v_crm_coach_activity a ON a.coach_id = c.id
GROUP BY c.id, c.name, c.school, c.email, c.status, c.email_status;

COMMENT ON VIEW public.v_crm_coach_signal_summary IS
  'Per-coach rollup over v_crm_coach_activity: touches, delivered, opens, demo_visits, replies, bounces, last_intent_at, last_any_signal_at, intent_score. intent_score and last_intent_at are computed ONLY from demo_entered + reply_received + email_opened — email_clicked is deliberately excluded. 1,073 of 1,219 all-time clicks fired on 2026-06-11, the day of a 511-email send (2.1 clicks/send against 233 opens, 8-27 clicks per recipient): that ratio is email-security-gateway link prefetching, not human engagement. Do not add email_clicked back into this filter and do not surface raw click counts as an engagement metric anywhere in the UI.';

REVOKE ALL ON public.v_crm_coach_signal_summary FROM anon, PUBLIC, authenticated;
GRANT SELECT ON public.v_crm_coach_signal_summary TO authenticated;

-- END — CRM signal spine (v_crm_coach_activity, v_crm_coach_signal_summary). Idempotent CREATE OR REPLACE; no DROP.
