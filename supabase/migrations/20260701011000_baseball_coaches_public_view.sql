-- baseball_coaches PII fix — TIER A (of 3): a non-PII coach-identity view.
--
-- LIVE-VERIFIED problem (pg_policies, 2026-07-01): public.baseball_coaches carries
-- two over-broad SELECT policies — `baseball_coaches_select_all` (USING true) and
-- `baseball_coaches_select` (USING get_my_coach_id() IS NOT NULL) — so any
-- authenticated user can read EVERY coach's email + phone, cross-org.
--
-- The messaging + cross-org display consumers only ever need non-PII identity
-- (id, full_name, avatar_url, coach_type, org, title) — never email/phone. This
-- view exposes exactly that. Consumers repoint to it (TIER B, separate PR), and
-- ONLY THEN is the base-table SELECT policy narrowed to self-or-teammate (TIER C,
-- separate migration) — so identity reads never break before the repoint lands.
--
-- security_invoker = false (the default; stated explicitly): the VIEW is the
-- security boundary, not base-table RLS — the exposed columns are safe for any
-- authenticated user, so the view runs with owner rights and returns non-PII
-- identity for all coaches. Additive/idempotent (CREATE OR REPLACE). NEVER anon.

CREATE OR REPLACE VIEW public.baseball_coaches_public
WITH (security_invoker = false)
AS
SELECT
  id,
  user_id,
  organization_id,
  coach_type,
  full_name,
  avatar_url,
  title
FROM public.baseball_coaches;

COMMENT ON VIEW public.baseball_coaches_public IS
  'Non-PII coach identity (id, user_id, organization_id, coach_type, full_name, avatar_url, title) — NO email/phone. Read by messaging + cross-org display; the base-table baseball_coaches keeps email/phone behind a teammate-scoped RLS policy (Tier C). Never grant to anon.';

-- Lock down grants: the public-schema default-privileges gotcha auto-grants ALL
-- (arwdDxtm) to authenticated (and PUBLIC/anon) on object creation. Because this
-- simple view is auto-updatable AND runs security_invoker=false (owner rights),
-- leaving INSERT/UPDATE/DELETE on it to authenticated would let a client WRITE to
-- baseball_coaches THROUGH the view, bypassing RLS. So REVOKE ALL from PUBLIC,
-- anon, AND authenticated, then grant back SELECT only. Verified live: relacl =
-- authenticated=r, no anon grant.
REVOKE ALL ON public.baseball_coaches_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.baseball_coaches_public TO authenticated, service_role;
