-- ============================================================================
-- Migration: 20260709010000_baseball_public_views_honor_visibility.sql
-- Wave: W0b (Production-Readiness Mission, docs/audits/PRODUCTION_READINESS_MISSION_2026-07-09.md)
--
-- CONFIRMED P1 (DB views), gap-fill fleet 2026-07-09:
--   `baseball_team_coach_staff_public` ignores `visible_to_players` + `status`;
--   `baseball_teams_public_profile` ignores `public_profile_mode` — anon sees
--   data owners opted out of sharing.
--
-- CHECK-FIRST EVIDENCE (read-only SELECTs against LIVE prod, 2026-07-09, via
-- mcp__supabase__execute_sql — nothing applied to any DB by this file):
--
-- 1) Current live view definitions (pg_views.definition), verbatim:
--
--    baseball_team_coach_staff_public:
--      SELECT s.team_id, s.coach_id, s.is_primary, s.role, c.full_name,
--             c.avatar_url
--      FROM (baseball_team_coach_staff s
--        JOIN baseball_coaches c ON ((c.id = s.coach_id)));
--      -- No WHERE clause at all: every staff row is exposed regardless of
--      -- visible_to_players or status.
--
--    baseball_teams_public_profile:
--      SELECT id, organization_id, name, team_type, logo_url, description
--      FROM baseball_teams;
--      -- No WHERE clause at all: every team is exposed regardless of
--      -- public_profile_mode, including 'private'.
--
-- 2) relacl on both (pg_class.relacl), confirming the intentional anon-read
--    posture we must preserve:
--      baseball_team_coach_staff_public:
--        {postgres=arwdDxtm/postgres, service_role=arwdDxtm/postgres,
--         anon=r/postgres, authenticated=r/postgres}
--      baseball_teams_public_profile: (same shape)
--    Both reloptions: {security_invoker=false} (view owner's rights — the
--    established pattern from 20260702110000_baseball_public_team_program_profile_views.sql,
--    which first created these views for the public team/program share-link
--    fix; base tables stay authenticated-only via RLS, anon reads flow only
--    through these views).
--
-- 3) Base-table columns relevant to the filters (information_schema.columns,
--    live):
--      baseball_team_coach_staff.status        text NOT NULL DEFAULT 'active'
--        (no CHECK constraint — plain text; live data today is 100% 'active',
--        7/7 rows)
--      baseball_team_coach_staff.visible_to_players boolean NOT NULL DEFAULT true
--        (live data today is 100% true, 7/7 rows — this migration is a no-op
--        for existing rows and only takes effect once a coach opts out)
--      baseball_teams.public_profile_mode       text NOT NULL DEFAULT 'unlisted'
--        (plain text column; app-level enum is
--        BaseballPublicProfileMode = 'private' | 'unlisted' | 'public' in
--        src/lib/types/baseball-program-identity.ts; live data today is 100%
--        'unlisted', 10/10 rows)
--
-- 4) CRITICAL CALLER-SEMANTICS CHECK (per W0b task instructions — "if the view
--    is used for direct-by-id lookup of unlisted teams anywhere in src/, note
--    it and keep semantics correct per callers"):
--    grep confirms `baseball_teams_public_profile` is read ONLY by
--    src/app/baseball/(public)/team/[id]/page.tsx and
--    src/app/baseball/(public)/program/[id]/page.tsx, and in BOTH cases via
--    `.eq('id', id).maybeSingle()` — i.e. a direct-by-id share-link lookup,
--    never a generic listing/search/browse. That page's own migration
--    (20260702110000) exists SPECIFICALLY so a logged-out visitor clicking a
--    shared team/program link (which is 'unlisted' by product default — see
--    default above) does not get notFound(). If this view filtered to
--    `public_profile_mode = 'public'` only, EVERY team in prod today
--    (10/10 are 'unlisted') would vanish from that view and the share-link
--    feature this view exists for would immediately regress to its
--    pre-fix 404 behavior.
--    CORRECT SEMANTICS (per actual callers, not a hypothetical listing):
--      - 'private'  -> NEVER returned (the owner opted all the way out —
--                      this is the actual leak being fixed here).
--      - 'unlisted' -> returned for direct-by-id lookup ONLY (no generic
--                      listing of this view exists anywhere in src/ today;
--                      if one is ever added, it must additionally filter to
--                      'public' at the call site, since 'unlisted' rows
--                      must never appear in a directory/search result).
--      - 'public'   -> returned for both by-id lookup and any future listing.
--    So the view itself excludes only 'private'; the "no generic listing"
--    invariant is enforced by there being no such caller, which this
--    migration's header documents as a load-bearing constraint on any future
--    consumer of this view.
--
-- FIX: recreate both views with the SAME column list (auto-updatable column
-- set unchanged — no consumer's .select() needs to change) plus a WHERE
-- clause honoring the opt-out/visibility columns. ADDITIVE (CREATE OR
-- REPLACE VIEW), no DROP.
--
-- REPO GOTCHA (CLAUDE.md / this repo's established pattern): CREATE OR
-- REPLACE VIEW on an object in the public schema re-grants ALL to
-- anon/authenticated via public-schema default privileges. This migration
-- ends with an explicit REVOKE ALL ... FROM PUBLIC, anon, authenticated
-- followed by GRANT SELECT ONLY to anon, authenticated, service_role —
-- restoring the exact same read-only posture captured in relacl above (this
-- is one of the few deliberately anon-readable view families in this repo;
-- that is intentional and unchanged by this migration, only the ROW set
-- returned changes).
--
-- VERIFY AFTER APPLY (paste output in the PR/approval record):
--   select viewname, definition from pg_views
--     where viewname in ('baseball_team_coach_staff_public','baseball_teams_public_profile');
--   select relname, relacl from pg_class
--     where relname in ('baseball_team_coach_staff_public','baseball_teams_public_profile');
--   -> relacl must show exactly: postgres=arwdDxtm, service_role=arwdDxtm,
--      anon=r, authenticated=r (identical to the pre-migration ACL above —
--      no privilege escalation, only the row filter changed).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- baseball_team_coach_staff_public — exclude opted-out / non-active staff.
-- Column list UNCHANGED from the live view (team_id, coach_id, is_primary,
-- role, full_name, avatar_url) — no consumer .select() needs updating.
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
JOIN public.baseball_coaches c ON c.id = s.coach_id
WHERE s.visible_to_players = true
  AND s.status = 'active';

COMMENT ON VIEW public.baseball_team_coach_staff_public IS
  'Anon-readable public coaching-staff identity per team (team_id, coach_id, is_primary, role, full_name, avatar_url). No email/phone/bio. Excludes rows where the staff member opted out (visible_to_players = false) or is not active (status <> ''active'') — fixed 2026-07-09, previously exposed every row unconditionally. Base tables public.baseball_team_coach_staff and public.baseball_coaches stay authenticated-only via RLS; anon reads go through this view only.';

-- ----------------------------------------------------------------------------
-- baseball_teams_public_profile — exclude teams whose owner set the program
-- fully private. Column list UNCHANGED from the live view (id,
-- organization_id, name, team_type, logo_url, description).
-- Deliberately does NOT filter to 'public' only — see caller-semantics note
-- above: this view backs direct-by-id share-link lookups where 'unlisted'
-- (the product default) must still resolve. Only 'private' is excluded.
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
FROM public.baseball_teams
WHERE public_profile_mode <> 'private';

COMMENT ON VIEW public.baseball_teams_public_profile IS
  'Anon-readable public team identity for the public team/program profile pages (id, organization_id, name, team_type, logo_url, description). Excludes join_code (invite secret), created_by, and (fixed 2026-07-09) any team with public_profile_mode = ''private''. Intentionally still returns ''unlisted'' teams: this view backs direct-by-id share-link lookups in src/app/baseball/(public)/team|program/[id]/page.tsx, not a generic listing — no such listing exists in src/ today. ''unlisted'' rows must never be exposed through a future directory/search caller; that caller must additionally filter to public_profile_mode = ''public'' at the call site. Base table public.baseball_teams stays authenticated-only via RLS; anon reads go through this view only.';

-- ----------------------------------------------------------------------------
-- Re-assert the intended read-only, anon-readable posture (recreating a view
-- in the public schema re-grants ALL to anon/authenticated by default —
-- undo that, then grant back SELECT only).
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.baseball_team_coach_staff_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.baseball_team_coach_staff_public TO anon, authenticated, service_role;

REVOKE ALL ON public.baseball_teams_public_profile FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.baseball_teams_public_profile TO anon, authenticated, service_role;

-- END — public view visibility fix. ADDITIVE. NOT applied to any DB by this file.
