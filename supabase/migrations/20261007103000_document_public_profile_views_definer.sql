-- STATUS: WRITTEN, NOT APPLIED. Prepared by plan phase 6 item 6.5 (security
-- advisor).
-- Apply: npm run db:apply --
-- supabase/migrations/20261007103000_document_public_profile_views_definer.sql
-- Risk: NONE. Catalog comments only; no behaviour change.
--
-- The Supabase security advisor reports four ERROR-level security_definer_view
-- findings. The plan asked to switch them to security_invoker = true "where the
-- view's consumers hold their own RLS access". Every consumer was checked in
-- src/ and none of them does, so all four stay SECURITY DEFINER on purpose and
-- this migration records why, so the next audit does not re-raise them.
--
--   baseball_coaches_public (authenticated only)
--     Consumer: baseball (dashboard)/dashboard/calendar/page.tsx lists the
--     coaches of the player's own organisation. A player is not a "teammate"
--     of every org coach on baseball_coaches, whose SELECT policy is
--     (user_id = auth.uid() OR
--     shares_my_baseball_organization(organization_id)).
--     With security_invoker the roster panel would list nobody.
--   baseball_team_coach_staff_public (anon, authenticated)
--     Consumers: baseball (public)/team/[id] and program/[id] for logged-out
--     visitors. The base policy is is_baseball_team_staff OR
--     is_baseball_team_member, which anon never satisfies.
--   baseball_teams_public_profile (anon, authenticated)
--     Consumers: the same public pages, and the cross-organisation compare
--     action (dashboard/compare/actions.ts), which reads another
--     organisation's team name and logo by design. The base policy
--     baseball_teams_select admits only staff and members.
--   organizations_public_profile (anon, authenticated)
--     Consumers: the public program page and its generateMetadata for
--     logged-out visitors. Base organizations SELECT is
--     organizations_select_all TO authenticated only.
--
-- The alternative (base-table policies for anon) is worse: RLS cannot restrict
-- columns, so it would expose bio, join_code, contact fields and every private
-- team. The views are the column filter. Their column lists are fixed in the
-- view definitions and the row filters (public_profile_mode <> 'private',
-- visible_to_players and status = 'active') live in the view bodies.
--
-- Rule for editing these views: adding a column to the base table does not
-- expose it, but adding one to the view does. Review every column added.
--
-- ROLLBACK: COMMENT ON VIEW public.<name> IS NULL; for each of the four
-- views.
--
-- VERIFY: select 1 where (select count(*) from pg_description d join pg_class c
-- VERIFY: on c.oid = d.objoid where c.relnamespace = 'public'::regnamespace and
-- VERIFY: c.relname in ('baseball_coaches_public',
-- VERIFY: 'baseball_team_coach_staff_public', 'baseball_teams_public_profile',
-- VERIFY: 'organizations_public_profile') and d.description like
-- VERIFY: 'DEFINER VIEW BY DESIGN%') = 4;

COMMENT ON VIEW public.baseball_coaches_public IS
'DEFINER VIEW BY DESIGN (advisor security_definer_view accepted). '
'Column-filtered coach identity for players who cannot read baseball_coaches '
'under RLS. Consumer: baseball calendar roster. Do not switch to '
'security_invoker without a replacement. See migration 20261007103000.';

COMMENT ON VIEW public.baseball_team_coach_staff_public IS
'DEFINER VIEW BY DESIGN (advisor security_definer_view accepted). Coach '
'name, role and avatar for logged-out visitors of public team and program '
'pages. Row filter lives in the view. See migration 20261007103000.';

COMMENT ON VIEW public.baseball_teams_public_profile IS
'DEFINER VIEW BY DESIGN (advisor security_definer_view accepted). Public '
'team identity for logged-out visitors and the cross-organisation compare '
'action. public_profile_mode <> private is the row filter. See migration '
'20261007103000.';

COMMENT ON VIEW public.organizations_public_profile IS
'DEFINER VIEW BY DESIGN (advisor security_definer_view accepted). Anon-safe '
'organisation identity for the public program page and its metadata. Column '
'list is the filter. See migration 20261007103000.';
