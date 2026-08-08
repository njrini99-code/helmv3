-- THREE cross-tenant RLS gaps on the golf team tables, all the same shape: a
-- policy whose check expression only mentions a column the attacker does not
-- change, so it re-validates cleanly on a row whose TENANT column was swapped.
--
-- 1. golf_teams_update_coach had USING (is_golf_team_coach(id)) and NO WITH
--    CHECK. Postgres falls back to re-evaluating USING against the post-update
--    row — but that tests `id`, the immutable primary key. So any coach (any
--    staff role, not just head coach) could run
--      UPDATE golf_teams SET organization_id = <another school> WHERE id = <their team>
--    and re-parent a live team — roster, rounds, qualifiers, settings, all keyed
--    by the unchanged team_id — into another paying customer's tenant.
--
-- 2. golf_teams_insert_coaches checked only that the caller is a coach
--    SOMEWHERE, never that organization_id is their own. Any coach account could
--    plant a row in any other org. Beyond tenant pollution that is a denial of
--    service: the planted row collides with golf_teams_org_gender_uidx and
--    permanently blocks the real coach from creating that team.
--
-- 3. golf_team_members_update_coach had the same missing WITH CHECK, so a roster
--    row could be moved to a team the caller does not coach.
--
-- All three now bind to the CALLER's own organization. VERIFIED on production
-- 2026-08-07 in rolled-back transactions, every probe paired with a control that
-- passes (a probe whose control does not pass proves nothing):
--
--   PRE  attack reparent team org ............ SUCCEEDED (rows=1)   <- the breach
--   PRE  attack insert into foreign org ...... ACCEPTED             <- the breach
--   PRE  control benign own-team update ...... passed (non-vacuous)
--   PRE  control addSecondTeam in own org .... passed
--   POST attack reparent team org ............ BLOCKED 42501
--   POST attack insert into foreign org ...... BLOCKED 42501
--   POST attack move roster row to other team. BLOCKED 42501
--   POST control benign own-team update ...... passed
--   POST control benign roster-row update .... passed
--   POST control addSecondTeam in own org .... passed  <- the real 2-squad flow
--
-- Safe against current data: all 10 teams have organization_id equal to their
-- coaches' organization_id, and all 17 golf_coaches rows have an organization_id.
-- Coach onboarding creates the organization and the coach row BEFORE the team
-- insert, so the golf_coaches row this check needs exists when it runs.
--
-- NOT addressed here, deliberately: neither INSERT nor UPDATE on
-- golf_team_members constrains player_id, so a coach can still attach an
-- arbitrary player to their OWN roster. That is pre-existing, identical on both
-- verbs, and there is no "player belongs to my org" relation to test against
-- before a player has joined anything. Tracked separately rather than guessed at.

DROP POLICY IF EXISTS golf_teams_update_coach ON public.golf_teams;
CREATE POLICY golf_teams_update_coach ON public.golf_teams
  FOR UPDATE TO authenticated
  USING (is_golf_team_coach(id))
  WITH CHECK (
    is_golf_team_coach(id)
    AND EXISTS (
      SELECT 1 FROM public.golf_coaches gc
      WHERE gc.user_id = (SELECT auth.uid())
        AND gc.organization_id = golf_teams.organization_id
    )
  );

DROP POLICY IF EXISTS golf_teams_insert_coaches ON public.golf_teams;
CREATE POLICY golf_teams_insert_coaches ON public.golf_teams
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.golf_coaches gc
      WHERE gc.user_id = (SELECT auth.uid())
        AND gc.organization_id = golf_teams.organization_id
    )
  );

DROP POLICY IF EXISTS golf_team_members_update_coach ON public.golf_team_members;
CREATE POLICY golf_team_members_update_coach ON public.golf_team_members
  FOR UPDATE TO authenticated
  USING (is_golf_team_coach(team_id))
  WITH CHECK (is_golf_team_coach(team_id));
