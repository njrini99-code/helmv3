-- STATUS: WRITTEN — HOLD — NOT APPLIED
-- Plan: docs/clubhouse/held/data/tournaments.md (held migration 4 of 6,
-- "player moments", reveal part only); HELD.md row.
-- Apply:
--   npm run db:apply -- \
--     supabase/migrations/20261024100300_golf_tournament_player_reveal.sql
-- Written 2026-11-07 for Clubhouse Tournaments, owner answer A: a player sees
-- the published lineup (their own spot, their role, and whether they count)
-- after the coach publishes.
--
-- Risk: LOW-MEDIUM. One new read-only SECURITY DEFINER function and one new
-- SELECT policy; no table, column, trigger or data change. Nothing is written
-- by either. The function is the only door to lineup data for a player:
-- 100100 left entries, round lineups and field scores coach-only, and this
-- file does not widen them.
--
-- WHAT IT ADDS
--   1. public.golf_tournament_my_lineup(p_tournament_id uuid) -> jsonb
--      SECURITY DEFINER, STABLE, search_path = '' (every object
--      schema-qualified). Returns NULL unless the caller is an active player
--      on the tournament's team AND the coach has published
--      (golf_tournaments.lineup_published_at set and not in the future).
--      Otherwise a single object:
--        { published_at, locked_at, role, slot,
--          rounds: [ { round_event_id, round_number, my_role, my_slot,
--                      players } ] }
--      role is the caller's own: lineup | alternate | individual, or
--      not_travelling when they have no entry. my_role and my_slot are the
--      same per round (the locked snapshot after a substitution, else the
--      entries). players lists the round's lineup (player id and slot,
--      nothing else) ONLY when the caller is in the lineup OF THAT ROUND;
--      otherwise it is []. The top-level role and slot are the published
--      entries and can be stale after a substitution: clients use the
--      per-round my_role and my_slot (the app does). No score, note,
--      reasoning, receipt or other team's row is returned, and nothing from
--      another team: the tournament is looked up by id and the caller must be
--      on its team.
--      EXECUTE: revoked from PUBLIC and anon, granted to authenticated only.
--   2. Policy golf_tournament_round_lineups_select_own on
--      golf_tournament_round_lineups (FOR SELECT, authenticated): a player
--      reads only their OWN snapshot row, and only once the tournament is
--      published. Without it the existing 100100 insert policy
--      golf_tpr_player_link (a player linking their own GolfHelm round to a
--      tournament round) can never pass its "I am in this round's lineup"
--      check, because the player cannot read round lineups. It exposes one
--      row of the caller's own role and slot; it does not let a player read a
--      teammate's row.
--
-- WHAT IT DOES NOT DO: no change to golf_tournament_entries, field scores,
-- player notes or reflections policies; no reveal receipt ("Seen by 7 of 9",
-- later file); no notification.
--
-- ORDER: after 20261024100100 and 20261024100200 (both applied). Independent
-- of every other held file. The version is the reserved 100300; db:apply runs
-- it as a held override, out of timestamp order, like the other held
-- tournament files.
--
-- Each VERIFY returns a row only when its check holds (release review B2, 11 Nov 2026: `select <boolean>` returned a row
-- when false too, so a bad apply could not be seen).
-- VERIFY: select 1 where to_regprocedure('public.golf_tournament_my_lineup(uuid)') is not null; -- noqa: LT05
-- VERIFY: select 1 from pg_proc where oid = to_regprocedure('public.golf_tournament_my_lineup(uuid)') and prosecdef and proconfig @> array['search_path=""']; -- noqa: LT05
-- VERIFY: select 1 from pg_proc p where p.oid = to_regprocedure('public.golf_tournament_my_lineup(uuid)') and not has_function_privilege('anon', p.oid, 'EXECUTE') and has_function_privilege('authenticated', p.oid, 'EXECUTE'); -- noqa: LT05
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'golf_tournament_round_lineups' and policyname = 'golf_tournament_round_lineups_select_own'; -- noqa: LT05
--
-- ROLLBACK: drop policy if exists golf_tournament_round_lineups_select_own on public.golf_tournament_round_lineups; -- noqa: LT05
-- ROLLBACK: drop function if exists public.golf_tournament_my_lineup(uuid);
--
-- Tests: supabase/tests/rls/golf_tournament_player_reveal.sql.

SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.golf_tournament_my_lineup(
    p_tournament_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := (SELECT auth.uid());
  v_team      uuid;
  v_published timestamptz;
  v_locked    timestamptz;
  v_player    uuid;
  v_role      text;
  v_slot      integer;
  v_rounds    jsonb;
BEGIN
  IF v_uid IS NULL OR p_tournament_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT t.team_id, t.lineup_published_at, t.lineup_locked_at
    INTO v_team, v_published, v_locked
    FROM public.golf_tournaments t
   WHERE t.id = p_tournament_id;

  -- Unknown tournament, or the coach has not published (or scheduled it for
  -- later): nothing to reveal.
  IF v_team IS NULL OR v_published IS NULL OR v_published > now() THEN
    RETURN NULL;
  END IF;

  -- The caller's own player row, active on this team. A coach, an outsider or
  -- another team's player gets NULL.
  SELECT gp.id
    INTO v_player
    FROM public.golf_players gp
    JOIN public.golf_team_members m ON m.player_id = gp.id
   WHERE gp.user_id = v_uid
     AND m.team_id = v_team
     AND m.status = 'active'
   LIMIT 1;
  IF v_player IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT e.role, e.slot
    INTO v_role, v_slot
    FROM public.golf_tournament_entries e
   WHERE e.tournament_id = p_tournament_id
     AND e.player_id = v_player;
  IF v_role IS NULL THEN
    v_role := 'not_travelling';
  END IF;

  WITH field AS (
    SELECT r.round_event_id, l.player_id, l.role, l.slot
      FROM public.golf_tournament_rounds r
      JOIN public.golf_tournament_round_lineups l
        ON l.round_event_id = r.round_event_id
     WHERE r.tournament_id = p_tournament_id
    UNION ALL
    SELECT r.round_event_id, e.player_id, e.role, e.slot
      FROM public.golf_tournament_rounds r
      JOIN public.golf_tournament_entries e
        ON e.tournament_id = r.tournament_id
     WHERE r.tournament_id = p_tournament_id
       AND NOT EXISTS (
         SELECT 1
           FROM public.golf_tournament_round_lineups l2
          WHERE l2.round_event_id = r.round_event_id
       )
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'round_event_id', r.round_event_id,
           'round_number', r.round_number,
           'my_role', (
             SELECT f.role
               FROM field f
              WHERE f.round_event_id = r.round_event_id
                AND f.player_id = v_player
           ),
           'my_slot', (
             SELECT f.slot
               FROM field f
              WHERE f.round_event_id = r.round_event_id
                AND f.player_id = v_player
           ),
           -- Gated on the caller's role IN THIS ROUND (the locked snapshot
           -- after a substitution, else the entries), never on the
           -- tournament-level role: a player substituted out must not keep
           -- the round's lineup, and one substituted in gets it.
           'players', CASE
             WHEN (
               SELECT f.role
                 FROM field f
                WHERE f.round_event_id = r.round_event_id
                  AND f.player_id = v_player
             ) = 'lineup' THEN
               (SELECT coalesce(
                         jsonb_agg(
                           jsonb_build_object(
                             'player_id', f.player_id, 'slot', f.slot
                           )
                           ORDER BY f.slot
                         ),
                         '[]'::jsonb
                       )
                  FROM field f
                 WHERE f.round_event_id = r.round_event_id
                   AND f.role = 'lineup')
             ELSE '[]'::jsonb
           END
         ) ORDER BY r.round_number), '[]'::jsonb)
    INTO v_rounds
    FROM public.golf_tournament_rounds r
   WHERE r.tournament_id = p_tournament_id;

  RETURN jsonb_build_object(
    'published_at', v_published,
    'locked_at', v_locked,
    'role', v_role,
    'slot', v_slot,
    'rounds', v_rounds
  );
END;
$$;

COMMENT ON FUNCTION public.golf_tournament_my_lineup(uuid) IS
'P016: the calling player''s own role and spot in a PUBLISHED tournament lineup, and the round lineups only when they are in it. NULL otherwise. Read-only; nothing of another team or another player''s scores.'; -- noqa: LT05

REVOKE ALL ON FUNCTION public.golf_tournament_my_lineup(uuid)
FROM public, anon;
GRANT EXECUTE ON FUNCTION public.golf_tournament_my_lineup(uuid)
TO authenticated;

DROP POLICY IF EXISTS golf_tournament_round_lineups_select_own
ON public.golf_tournament_round_lineups;
CREATE POLICY golf_tournament_round_lineups_select_own
ON public.golf_tournament_round_lineups
FOR SELECT TO authenticated
USING (
    player_id IN (
        SELECT gp.id
        FROM public.golf_players gp
        WHERE gp.user_id = (SELECT auth.uid())
    )
    AND public.is_golf_team_player(team_id)
    AND EXISTS (
        SELECT 1
        FROM public.golf_tournament_rounds r
        JOIN public.golf_tournaments t ON t.id = r.tournament_id
        WHERE
            r.round_event_id = golf_tournament_round_lineups.round_event_id
            AND t.lineup_published_at IS NOT NULL
            AND t.lineup_published_at <= now()
    )
);
