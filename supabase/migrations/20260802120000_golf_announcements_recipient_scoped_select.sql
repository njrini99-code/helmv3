-- ============================================================================
-- golf_announcements: make targeting enforceable below the app layer
-- ----------------------------------------------------------------------------
-- Issue #1229.
--
-- "Send to specific players" was enforced ONLY in application code
-- (getAnnouncementsWithMetaImpl, src/app/golf/actions/announcements.ts). The
-- RLS policy was team-wide, so any player on the roster could read an
-- announcement targeted away from them by querying PostgREST directly with
-- their own session — no privilege escalation needed.
--
-- Reproduced 2026-08-02 by role impersonation. An announcement targeted at two
-- named players was readable by a third, untargeted player, with the coach as
-- a non-vacuous control.
--
-- ----------------------------------------------------------------------------
-- WHY THE HELPER FUNCTION (learned the hard way)
-- ----------------------------------------------------------------------------
-- The obvious form of this policy — inlining `EXISTS (SELECT 1 FROM
-- golf_announcement_recipients ...)` into the USING clause — DOES NOT WORK.
-- A policy body IS subject to RLS on the tables it references, and
-- golf_announcement_recipients carries `golf_ann_recipients_select_coaches`,
-- which sub-selects golf_announcements right back. Postgres detects the cycle
-- and every read fails with:
--
--     42P17: infinite recursion detected in policy for relation
--            "golf_announcements"
--
-- An earlier revision of this file asserted the opposite ("a policy body is
-- evaluated with the row owner's rights, so the sub-select is not itself
-- RLS-filtered"). That was simply wrong, and applying it broke announcement
-- reads in production until it was reverted. The recipient check therefore
-- goes through golf_announcement_addressed_to_me(), a definer-rights helper
-- created in 20260802115900, which bypasses the recipients table's policies
-- and cuts the cycle. That helper takes no user argument — it reads auth.uid()
-- itself — so a caller can only ever ask about their own targeting.
--
-- ----------------------------------------------------------------------------
-- Semantics (mirrors the app filter exactly):
--   * no rows in golf_announcement_recipients -> all-team, everyone sees it
--   * rows exist                              -> only the listed players
-- The coach/staff disjunct is unchanged: team-wide read, which compose and the
-- acknowledgement surfaces depend on.
--
-- Verified against production after apply, with a targeted control row:
--   COLE  (not targeted) -> 4 of 5 visible, targeted row NOT visible
--   DYLAN (targeted)     -> 5 of 5 visible, targeted row visible
--   COACH (control)      -> 5 of 5 visible, targeted row visible
-- ============================================================================

DROP POLICY IF EXISTS "Team members can view announcements" ON public.golf_announcements;

CREATE POLICY "Team members can view announcements"
  ON public.golf_announcements
  FOR SELECT
  USING (
    -- Coaches/staff on the team: unchanged, team-wide read.
    EXISTS (
      SELECT 1
      FROM golf_team_coach_staff tcs
      JOIN golf_coaches c ON c.id = tcs.coach_id
      WHERE c.user_id = (SELECT auth.uid())
        AND tcs.team_id = golf_announcements.team_id
    )
    OR
    -- Players on the team, but only for announcements addressed to them.
    (
      EXISTS (
        SELECT 1
        FROM golf_team_members tm
        JOIN golf_players p ON p.id = tm.player_id
        WHERE p.user_id = (SELECT auth.uid())
          AND tm.team_id = golf_announcements.team_id
      )
      AND public.golf_announcement_addressed_to_me(golf_announcements.id)
    )
  );

-- Supports the helper's two probes (and the app's own per-announcement
-- recipient fan-out, which previously scanned).
CREATE INDEX IF NOT EXISTS idx_golf_announcement_recipients_announcement_player
  ON public.golf_announcement_recipients (announcement_id, player_id);
