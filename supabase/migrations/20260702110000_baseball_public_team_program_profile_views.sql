-- ============================================================================
-- Migration: 20260702110000_baseball_public_team_program_profile_views.sql
-- Packet: public-team-profile-gate (share-link 404 fix)
--
-- Purpose: /baseball/team/[id] and /baseball/program/[id] live in the
--          (public) route group but every underlying table
--          (organizations, baseball_teams, baseball_team_coach_staff,
--          baseball_coaches) only grants SELECT `TO authenticated` — so a
--          logged-out visitor (a recruit's parent, a fan, an HS coach
--          clicking a shared link) gets zero rows back and the page
--          notFound()s. Product decision: these two profile pages become
--          TRULY PUBLIC for logged-out visitors with a narrow SAFE field
--          set — team/org identity + branding + coaching staff identity
--          only. Roster stays fully gated behind authenticated-coach RLS
--          (these views carry no player data at all).
--
-- SAFETY CONTRACT (CLAUDE.md hard rules):
--   * ADDITIVE ONLY. CREATE OR REPLACE VIEW, no DROP, no destructive DML.
--   * Every view is column-allowlisted to exactly what the public profile
--     pages render — no PII, no secrets. Notably excluded:
--       - baseball_teams.join_code (team invite secret — never public)
--       - baseball_coaches.email / .phone / .bio (PII — public staff cards
--         show full_name + role + avatar only, per product decision)
--       - anything player-shaped (no player table is touched here)
--   * Follows the same view-as-security-boundary shape already established
--     by public.baseball_coaches_public (20260701011000): CREATE OR REPLACE
--     VIEW ... WITH (security_invoker = false), then an explicit
--     REVOKE ALL ... FROM PUBLIC, anon, authenticated (undoes the
--     public-schema default-privileges auto-grant-ALL-to-authenticated
--     gotcha on newly created objects) followed by GRANT SELECT only — so
--     these stay read-only even though the underlying columns happen to be
--     auto-updatable view columns.
--   * UNLIKE baseball_coaches_public, these three views DO grant SELECT to
--     `anon` — that's the entire point (logged-out read access) and is the
--     one deviation from the "never grant anon" default in this repo. It is
--     intentional, narrowly scoped to these 3 views' allowlisted columns,
--     and does not touch any base-table RLS policy (base tables stay
--     authenticated-only; anon reads are served exclusively through these
--     views, which run with the view owner's rights per
--     security_invoker = false).
--
-- DB (gated — NOT applied to any live database by this PR). An operator
-- must run this migration before the anon-facing code paths in
-- src/app/baseball/(public)/team/[id]/page.tsx and
-- src/app/baseball/(public)/program/[id]/page.tsx return real data to
-- logged-out visitors; until then those code paths query views that don't
-- exist yet and the pages will 500/empty for anon traffic exactly as they
-- 404 today, i.e. no regression risk from shipping code ahead of the
-- migration.
--
-- Verify after apply (paste output in the PR/approval record):
--   select viewname from pg_views where viewname in
--     ('organizations_public_profile', 'baseball_teams_public_profile',
--      'baseball_team_coach_staff_public');
--   select table_name, grantee, privilege_type from information_schema.role_table_grants
--     where table_name in ('organizations_public_profile',
--       'baseball_teams_public_profile', 'baseball_team_coach_staff_public')
--     order by table_name, grantee;
--   -> anon + authenticated must show SELECT only (no INSERT/UPDATE/DELETE).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- organizations_public_profile — branding/identity only, no PII columns exist
-- on organizations to begin with, but we still allowlist (not `SELECT *`) so
-- any future sensitive column added to organizations doesn't silently leak.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.organizations_public_profile
WITH (security_invoker = false)
AS
SELECT
  id,
  name,
  type,
  logo_url,
  description,
  division,
  conference,
  website_url,
  location_city,
  location_state
FROM public.organizations;

COMMENT ON VIEW public.organizations_public_profile IS
  'Anon-readable public org identity for the public team/program profile pages (id, name, type, logo_url, description, division, conference, website_url, location_city, location_state). No PII. Base table public.organizations stays authenticated-only via RLS; anon reads go through this view only.';

REVOKE ALL ON public.organizations_public_profile FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.organizations_public_profile TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- baseball_teams_public_profile — team identity/branding only.
-- Deliberately excludes join_code (team invite secret) and created_by.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.baseball_teams_public_profile
WITH (security_invoker = false)
AS
SELECT
  id,
  organization_id,
  name,
  team_type,
  logo_url,
  description
FROM public.baseball_teams;

COMMENT ON VIEW public.baseball_teams_public_profile IS
  'Anon-readable public team identity for the public team/program profile pages (id, organization_id, name, team_type, logo_url, description). Excludes join_code (invite secret) and created_by. Base table public.baseball_teams stays authenticated-only via RLS; anon reads go through this view only.';

REVOKE ALL ON public.baseball_teams_public_profile FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.baseball_teams_public_profile TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- baseball_team_coach_staff_public — pre-joined staff identity per team.
-- Deliberately excludes baseball_coaches.email / .phone / .bio (PII) — the
-- public staff card is full_name + role + avatar only, per product decision.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.baseball_team_coach_staff_public
WITH (security_invoker = false)
AS
SELECT
  s.team_id,
  s.coach_id,
  s.is_primary,
  s.role,
  c.full_name,
  c.avatar_url
FROM public.baseball_team_coach_staff s
JOIN public.baseball_coaches c ON c.id = s.coach_id;

COMMENT ON VIEW public.baseball_team_coach_staff_public IS
  'Anon-readable public coaching-staff identity per team (team_id, coach_id, is_primary, role, full_name, avatar_url). No email/phone/bio. Base tables public.baseball_team_coach_staff and public.baseball_coaches stay authenticated-only via RLS; anon reads go through this view only.';

REVOKE ALL ON public.baseball_team_coach_staff_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.baseball_team_coach_staff_public TO anon, authenticated, service_role;

-- END — public team/program profile views. ADDITIVE. NOT applied to any DB.
