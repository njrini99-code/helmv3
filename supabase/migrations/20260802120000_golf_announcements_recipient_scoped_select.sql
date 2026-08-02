-- ============================================================================
-- golf_announcements: make targeting enforceable below the app layer
-- ----------------------------------------------------------------------------
-- Issue #1229.
--
-- "Send to specific players" is currently enforced ONLY in application code
-- (getAnnouncementsWithMetaImpl, src/app/golf/actions/announcements.ts, the
-- filter at the end of the impl). The RLS policy is team-wide, so any player
-- on the roster can read an announcement targeted away from them by querying
-- PostgREST directly with their own session — no privilege escalation needed.
--
-- Reproduced 2026-08-02 by role impersonation. An announcement targeted at two
-- named players was readable by a third, untargeted player:
--
--   Cole Bennett   (NOT targeted)  -> 5 announcements, sees the targeted one
--   Dylan Brooks   (targeted)      -> 5 announcements, sees the targeted one
--   Coach          (control)       -> 5 announcements, sees the targeted one
--
-- The coach control returning rows is what proves the probe wasn't vacuous.
--
-- This replaces the player half of "Team members can view announcements" with
-- a recipient-aware disjunct that mirrors the app filter exactly:
--
--   * no rows in golf_announcement_recipients  -> all-team, everyone sees it
--   * rows exist                               -> only the listed players
--
-- The coach disjunct is unchanged: coaches keep team-wide read, which is what
-- the compose/acknowledgement surfaces depend on. Because the new policy is a
-- strict narrowing for players only, and the app already filters the same way,
-- no user-visible behaviour changes — the app-layer filter simply stops being
-- the only thing standing between a player and a targeted announcement.
--
-- Note golf_announcement_recipients has its own tight RLS
-- (golf_ann_recipients_select_own), which is why announcements.ts reads it
-- through the admin client. A policy body is evaluated with the row owner's
-- rights, not the caller's, so the EXISTS below sees every recipient row
-- regardless of that policy — the sub-select is not itself RLS-filtered.
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
      AND (
        -- Untargeted => all-team.
        NOT EXISTS (
          SELECT 1
          FROM golf_announcement_recipients r
          WHERE r.announcement_id = golf_announcements.id
        )
        OR EXISTS (
          SELECT 1
          FROM golf_announcement_recipients r
          JOIN golf_players p2 ON p2.id = r.player_id
          WHERE r.announcement_id = golf_announcements.id
            AND p2.user_id = (SELECT auth.uid())
        )
      )
    )
  );

-- Supports both EXISTS probes above (and the app's own per-announcement
-- recipient fan-out, which currently does a full scan per batch).
CREATE INDEX IF NOT EXISTS idx_golf_announcement_recipients_announcement_player
  ON public.golf_announcement_recipients (announcement_id, player_id);
