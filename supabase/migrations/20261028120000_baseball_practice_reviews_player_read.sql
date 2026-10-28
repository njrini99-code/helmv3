-- STATUS: WRITTEN — HOLD — NOT APPLIED. BaseballHelm, not a Clubhouse page.
-- Written 2026-10-28 for BaseballHelm practice reviews (owner call from the
-- PR 2351 follow-up: "should players see player_visible reviews?" Answer:
-- yes, the reviews a coach marks visible, only their own).
-- Registered in supabase/migrations/HELD.md; the owner applies it.
-- Apply (one line):
--   npm run db:apply --
-- supabase/migrations/20261028120000_baseball_practice_reviews_player_read.sql
-- Risk: LOW. One SELECT policy added, one never-live policy dropped if
-- present. No table, column, grant or data change. The table has 0 rows in
-- production (read-only check 2026-10-28).
--
-- WHY: production's only SELECT policy on
-- baseball_practice_effectiveness_reviews is
-- baseball_practice_effectiveness_reviews_select
-- (is_baseball_team_staff(team_id)), so a player reads nothing, even a review
-- the coach set to visibility = 'player_visible'. The file version of the
-- player policy (bpe_player_read_visible, 20260624000094) never reached
-- production and was wider than the owner's rule: any active team member
-- could read every player_visible review of the team, including reviews
-- about other players.
--
-- WHO MAY READ (this policy): an authenticated player whose own
-- baseball_players id (get_my_baseball_player_id()) is in the row's
-- player_ids, who is an active member of the row's team, and only when
-- visibility = 'player_visible'. staff_only and restricted stay staff-only.
-- A review with empty player_ids (a team-level roll-up) reaches no player.
-- Staff reads and every write are unchanged (the existing
-- baseball_practice_effectiveness_reviews_{select,insert,update,delete}).
--
-- ORDER: no prerequisite. The player page
-- (src/app/baseball/(player-dashboard)/player/practice) already reads the
-- table through the player's own session and gets zero rows before this is
-- applied, so it shows no review section. Once applied, reviews a coach
-- marked visible appear there by themselves.
--
-- GAP (not fixed here): no coach screen calls setReviewVisibility yet, so
-- until a toggle ships nothing can become player_visible from the app.
--
-- ROLLBACK:
--   drop policy if exists
--     "baseball_practice_effectiveness_reviews_select_player"
--     on public.baseball_practice_effectiveness_reviews;
-- (players read nothing again; staff paths untouched).
--
-- `npm run test:rls` could not run where this was written (no Docker); CI
-- replays every migration and runs
-- supabase/tests/rls/baseball_practice_reviews_player_read.sql.
--
-- VERIFY: select 1 from pg_policies where schemaname = 'public'
-- VERIFY: and tablename = 'baseball_practice_effectiveness_reviews'
-- VERIFY: and policyname =
-- VERIFY: 'baseball_practice_effectiveness_reviews_select_player'
-- VERIFY: and cmd = 'SELECT';
-- VERIFY: select 1 where not exists (select 1 from pg_policies
-- VERIFY: where schemaname = 'public'
-- VERIFY: and tablename = 'baseball_practice_effectiveness_reviews'
-- VERIFY: and policyname = 'bpe_player_read_visible');

SET LOCAL lock_timeout = '5s';

-- The file-only, team-wide player policy. Absent in production (a no-op
-- there); present in a stack replayed from migrations. Dropped so both end in
-- the same, narrower rule.
DROP POLICY IF EXISTS "bpe_player_read_visible"
ON "public"."baseball_practice_effectiveness_reviews";

CREATE POLICY "baseball_practice_effectiveness_reviews_select_player"
ON "public"."baseball_practice_effectiveness_reviews"
FOR SELECT TO "authenticated"
USING (
    "visibility" = 'player_visible'
    AND (SELECT "public"."get_my_baseball_player_id"()) = ANY("player_ids")
    AND "public"."is_baseball_team_member"("team_id")
);
