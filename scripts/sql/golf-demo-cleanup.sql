-- golf-demo-cleanup.sql: clear test rows and the old seed off the demo team
-- (Demo University Golf, 6ecdd1a6-63fe-4beb-b094-00118f334163). Launch
-- readiness DD-02, DD-08, DD-13, DD-17, DATA-02, DATA-03. For the owner to
-- apply; nothing here runs on its own.
--
-- Three parts, each its own transaction ending in ROLLBACK, so running the
-- file as it stands only prints counts. Run each part on staging first, then on
-- production, in the Supabase SQL editor (role postgres: the round guard
-- honours the owner mark for that role only). Read the counts, change that
-- part's ROLLBACK to COMMIT and run that part again.
--
--   Part A, any time: the test player, QA messages, test and stuck
--     qualifiers, test rounds, rounds left in progress, other test rows, and
--     documents that point at a storage host that does not exist.
--   Part B, only after the first generator run (npm run golf:demo:refresh --
--     --apply) has written the team and `npm run golf:demo:verify` reads it:
--     everything on the demo team the generator did not write. That is the
--     cloned roster and its rounds (real players' scorecards under made-up
--     names), the old ops seed (events, tasks, trips, announcements,
--     qualifiers, team-channel messages), and anything a coach account wrote
--     there before the write guard. It refuses to run while the generator's
--     ledger is empty.
--   Part C, optional, recommended: every player with a sign-in comes off the
--     demo team roster. This is the part that takes the owner's own player
--     login off the demo team (one of the DD-13 causes); the owner's coach
--     login stays head coach. Leave Part C out to keep that player login on
--     the roster. Part B still removes, as it does for everything the
--     generator did not write, any rounds, events or team messages that
--     login left on the demo team, and the write guard stops new ones.
--
-- What it never touches: golf_players rows (a player is only taken off the
-- roster), coach accounts and staff rows, other teams, direct messages other
-- than the QA ones, golf_demo_sessions.
--
-- Undo: none kept. Part A removes test data. Part B removes copies of real
-- players' rounds, which should not be kept; the rest of what it removes the
-- generator replaces on its next run.

-- =========================================================================
-- Part A: test rows and stuck rows (DD-08, DD-13, DD-17, DATA-02)
-- =========================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
-- Completed and in-progress rounds are guarded by guard_golf_round_lifecycle;
-- the owner mark lets this script set them aside. No live broadcast fires.
SELECT pg_catalog.set_config('helm.golf_lifecycle_write', 'atomic', true);
SELECT pg_catalog.set_config('helm.round_live_off', 'on', true);

-- A0. What Part A will change. Read this before COMMIT.
SELECT 'A1 test player on the roster' AS step, count(*) AS rows_found
  FROM public.golf_team_members AS m
  JOIN public.golf_players AS p ON p.id = m.player_id
 WHERE m.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND (p.is_test OR (p.first_name ILIKE 'audit' AND p.last_name ILIKE 'testplayer'))
UNION ALL
SELECT 'A2 QA messages', count(*)
  FROM public.golf_messages AS g
  JOIN public.golf_conversations AS c ON c.id = g.conversation_id
 WHERE c.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND (g.content ~* '\m(momentic|qa (audit|attach)|audit testplayer|lorem ipsum)\M'
        OR g.sender_id IN (SELECT p.user_id
                             FROM public.golf_players AS p
                             JOIN public.golf_team_members AS m ON m.player_id = p.id
                            WHERE m.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
                              AND p.user_id IS NOT NULL
                              AND (p.is_test OR (p.first_name ILIKE 'audit' AND p.last_name ILIKE 'testplayer'))))
UNION ALL
SELECT 'A3 test qualifiers', count(*)
  FROM public.golf_qualifiers
 WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND (is_test OR start_date >= DATE '2100-01-01')
UNION ALL
SELECT 'A3 stuck qualifiers (in progress, ended, no completed round)', count(*)
  FROM public.golf_qualifiers AS q
 WHERE q.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND q.status = 'in_progress'
   AND coalesce(q.end_date, q.start_date) < current_date - 2
   AND NOT EXISTS (SELECT 1 FROM public.golf_rounds AS r WHERE r.qualifier_id = q.id AND r.status = 'completed')
UNION ALL
SELECT 'A4 test rounds', count(*)
  FROM public.golf_rounds
 WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' AND is_test
UNION ALL
SELECT 'A5 rounds left in progress (kept, set abandoned)', count(*)
  FROM public.golf_rounds
 WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND NOT is_test AND status = 'in_progress' AND round_date < current_date - 2
UNION ALL
SELECT 'A6 test tasks, announcements, trips', (
  (SELECT count(*) FROM public.golf_tasks WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' AND is_test)
  + (SELECT count(*) FROM public.golf_announcements WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' AND is_test)
  + (SELECT count(*) FROM public.golf_travel_itineraries WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' AND is_test))
UNION ALL
SELECT 'A7 documents on a host that does not exist', count(*)
  FROM public.golf_documents
 WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND file_url LIKE 'https://storage.demo.helmsportslabs.com/%';

-- The rows themselves, for a closer look (names and dates only).
SELECT 'qualifier' AS kind, id, name AS label, start_date::text AS on_date, status
  FROM public.golf_qualifiers
 WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND (is_test OR start_date >= DATE '2100-01-01'
        OR (status = 'in_progress' AND coalesce(end_date, start_date) < current_date - 2))
UNION ALL
SELECT 'round left in progress', id, coalesce(course_name, ''), round_date::text, status
  FROM public.golf_rounds
 WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND NOT is_test AND status = 'in_progress' AND round_date < current_date - 2
ORDER BY 1, 4;

-- A1. The test player (DD-13): flag it, take it off the roster, and drop its
--     RSVPs and task assignments on the demo team.
UPDATE public.golf_players AS p
   SET is_test = true
  FROM public.golf_team_members AS m
 WHERE m.player_id = p.id
   AND m.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND p.first_name ILIKE 'audit' AND p.last_name ILIKE 'testplayer';

DELETE FROM public.golf_event_attendance AS a
 USING public.golf_events AS e, public.golf_players AS p
 WHERE a.event_id = e.id
   AND e.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND a.player_id = p.id AND p.is_test;

DELETE FROM public.golf_task_assignments AS ta
 USING public.golf_tasks AS t, public.golf_players AS p
 WHERE ta.task_id = t.id
   AND t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND ta.player_id = p.id AND p.is_test;

-- A2. QA messages (DD-13), and anything the test player sent there.
--     Attachments, reactions and mentions go with them (ON DELETE CASCADE);
--     a stored attachment file stays in its bucket.
DELETE FROM public.golf_messages AS g
 USING public.golf_conversations AS c
 WHERE c.id = g.conversation_id
   AND c.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND (g.content ~* '\m(momentic|qa (audit|attach)|audit testplayer|lorem ipsum)\M'
        OR g.sender_id IN (SELECT p.user_id
                             FROM public.golf_players AS p
                             JOIN public.golf_team_members AS m ON m.player_id = p.id
                            WHERE m.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
                              AND p.user_id IS NOT NULL AND p.is_test));

UPDATE public.golf_team_members AS m
   SET status = 'inactive'
  FROM public.golf_players AS p
 WHERE m.player_id = p.id
   AND m.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND m.status = 'active' AND p.is_test;

-- A3. Test qualifiers (dated in the year 60824) and qualifiers stuck in
--     progress with nothing scored (DD-08). Entries, selections and round
--     courses go with them; a round that pointed at one keeps its scores and
--     loses the link (ON DELETE SET NULL, which the owner mark allows).
DELETE FROM public.golf_qualifiers AS q
 WHERE q.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND (q.is_test OR q.start_date >= DATE '2100-01-01'
        OR (q.status = 'in_progress'
            AND coalesce(q.end_date, q.start_date) < current_date - 2
            AND NOT EXISTS (SELECT 1 FROM public.golf_rounds AS r
                             WHERE r.qualifier_id = q.id AND r.status = 'completed')));

-- A4 and A5. Rounds: set aside under the owner mark. Test rounds are deleted
--     below once the mark is off; rounds left in progress (DATA-02) stay as
--     abandoned, so they leave "Continue round" but keep what was entered.
UPDATE public.golf_rounds
   SET status = 'abandoned'
 WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND (is_test OR (status = 'in_progress' AND round_date < current_date - 2));

-- A6. Other test rows the coverage check counts.
DELETE FROM public.golf_tasks WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' AND is_test;
DELETE FROM public.golf_announcements WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' AND is_test;
DELETE FROM public.golf_travel_itineraries WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' AND is_test;

-- A7. Documents whose file_url points at a host that does not exist (DD-17):
--     they can never open. Versions and event and announcement links go with
--     them. The documents tab stays empty until real files are uploaded.
DELETE FROM public.golf_documents
 WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND file_url LIKE 'https://storage.demo.helmsportslabs.com/%';

-- A4, continued. With the mark off, the round guard lets an abandoned round
-- go (it keeps only completed ones). Holes, shots, reviews and caches cascade.
SELECT pg_catalog.set_config('helm.golf_lifecycle_write', '', true);
DELETE FROM public.golf_rounds
 WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND is_test AND status = 'abandoned';

-- After: every count 0.
SELECT (SELECT count(*) FROM public.golf_team_members AS m JOIN public.golf_players AS p ON p.id = m.player_id
         WHERE m.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' AND m.status = 'active' AND p.is_test) AS test_players_active,
       (SELECT count(*) FROM public.golf_rounds
         WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
           AND (is_test OR (status = 'in_progress' AND round_date < current_date - 2))) AS test_or_stuck_rounds,
       (SELECT count(*) FROM public.golf_qualifiers
         WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
           AND (is_test OR (status = 'in_progress' AND coalesce(end_date, start_date) < current_date - 2))) AS test_or_stuck_qualifiers,
       (SELECT count(*) FROM public.golf_messages AS g JOIN public.golf_conversations AS c ON c.id = g.conversation_id
         WHERE c.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
           AND g.content ~* '\m(momentic|qa (audit|attach)|audit testplayer|lorem ipsum)\M') AS qa_messages;

ROLLBACK; -- Part A: change to COMMIT once the counts above look right


-- =========================================================================
-- Part B: everything the generator did not write (DD-02, DATA-03)
-- Only after the first generator run. It stops itself otherwise.
-- =========================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '300s';

DO $$
BEGIN
  IF pg_catalog.to_regclass('helm_private.golf_demo_ledger') IS NULL THEN
    RAISE EXCEPTION 'Part B needs migration 20261115211000 and a first generator run.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger
                  WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
                    AND table_name = 'golf_team_members') THEN
    RAISE EXCEPTION 'The generator has not written the demo team yet: run npm run golf:demo:refresh -- --apply first.';
  END IF;
END
$$;

SELECT pg_catalog.set_config('helm.golf_lifecycle_write', 'atomic', true);
SELECT pg_catalog.set_config('helm.round_live_off', 'on', true);

-- B0. What Part B will change, per table. Read this before COMMIT; a row a
--     coach wrote on purpose shows up here too.
SELECT 'B1 cloned roster taken off (no sign-in; player rows kept)' AS step, count(*) AS rows_found
  FROM public.golf_team_members AS t
  JOIN public.golf_players AS p ON p.id = t.player_id
 WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' AND t.status = 'active'
   AND p.user_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                    WHERE l.team_id = t.team_id AND l.table_name = 'golf_team_members' AND l.row_key = t.id::text)
UNION ALL
SELECT 'B2 rounds (with their holes and shots)', count(*)
  FROM public.golf_rounds AS t
 WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                    WHERE l.team_id = t.team_id AND l.table_name = 'golf_rounds' AND l.row_key = t.id::text)
UNION ALL
SELECT 'B3 events (with RSVPs)', count(*)
  FROM public.golf_events AS t
 WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                    WHERE l.team_id = t.team_id AND l.table_name = 'golf_events' AND l.row_key = t.id::text)
UNION ALL
SELECT 'B3 tournaments', count(*)
  FROM public.golf_tournaments AS t
 WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                    WHERE l.team_id = t.team_id AND l.table_name = 'golf_tournaments' AND l.row_key = t.id::text)
UNION ALL
SELECT 'B3 qualifiers (with entries)', count(*)
  FROM public.golf_qualifiers AS t
 WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                    WHERE l.team_id = t.team_id AND l.table_name = 'golf_qualifiers' AND l.row_key = t.id::text)
UNION ALL
SELECT 'B3 practice plans', count(*)
  FROM public.golf_practice_plans AS t
 WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                    WHERE l.team_id = t.team_id AND l.table_name = 'golf_practice_plans' AND l.row_key = t.id::text)
UNION ALL
SELECT 'B3 tasks (with assignments)', count(*)
  FROM public.golf_tasks AS t
 WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                    WHERE l.team_id = t.team_id AND l.table_name = 'golf_tasks' AND l.row_key = t.id::text)
UNION ALL
SELECT 'B3 announcements', count(*)
  FROM public.golf_announcements AS t
 WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                    WHERE l.team_id = t.team_id AND l.table_name = 'golf_announcements' AND l.row_key = t.id::text)
UNION ALL
SELECT 'B3 trips', count(*)
  FROM public.golf_travel_itineraries AS t
 WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                    WHERE l.team_id = t.team_id AND l.table_name = 'golf_travel_itineraries' AND l.row_key = t.id::text)
UNION ALL
SELECT 'B3 team channel messages', count(*)
  FROM public.golf_messages AS t
  JOIN public.golf_conversations AS c ON c.id = t.conversation_id
 WHERE c.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' AND c.is_team_channel
   AND NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                    WHERE l.team_id = c.team_id AND l.table_name = 'golf_messages' AND l.row_key = t.id::text)
UNION ALL
SELECT 'B4 open CoachHelm insights from before the generator (archived)', count(*)
  FROM public.golf_coach_insights AS t
 WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND t.status IN ('active', 'acknowledged')
   AND t.created_at < (SELECT min(l.written_at) FROM helm_private.golf_demo_ledger AS l
                        WHERE l.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163');

-- B1. The cloned roster leaves the team: every active membership the
--     generator did not write whose player has no sign-in. Players who can
--     sign in (the owner's own player login among them) are Part C's.
UPDATE public.golf_team_members AS t
   SET status = 'inactive'
  FROM public.golf_players AS p
 WHERE p.id = t.player_id
   AND t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' AND t.status = 'active'
   AND p.user_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                    WHERE l.team_id = t.team_id AND l.table_name = 'golf_team_members' AND l.row_key = t.id::text);

-- B2. Rounds the generator did not write: the cloned scorecards (DD-02) and
--     anything else left. Set aside under the mark, deleted below without it.
UPDATE public.golf_rounds AS t
   SET status = 'abandoned'
 WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                    WHERE l.team_id = t.team_id AND l.table_name = 'golf_rounds' AND l.row_key = t.id::text);

-- B3. The old ops seed. Children go with their parents (ON DELETE CASCADE).
--     Tournaments go before events: a tournament round holds its event.
DELETE FROM public.golf_tournaments AS t
 WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                    WHERE l.team_id = t.team_id AND l.table_name = 'golf_tournaments' AND l.row_key = t.id::text);
DELETE FROM public.golf_qualifiers AS t
 WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                    WHERE l.team_id = t.team_id AND l.table_name = 'golf_qualifiers' AND l.row_key = t.id::text);
DELETE FROM public.golf_practice_plans AS t
 WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                    WHERE l.team_id = t.team_id AND l.table_name = 'golf_practice_plans' AND l.row_key = t.id::text);
DELETE FROM public.golf_events AS t
 WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                    WHERE l.team_id = t.team_id AND l.table_name = 'golf_events' AND l.row_key = t.id::text);
DELETE FROM public.golf_tasks AS t
 WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                    WHERE l.team_id = t.team_id AND l.table_name = 'golf_tasks' AND l.row_key = t.id::text);
DELETE FROM public.golf_announcements AS t
 WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                    WHERE l.team_id = t.team_id AND l.table_name = 'golf_announcements' AND l.row_key = t.id::text);
DELETE FROM public.golf_travel_itineraries AS t
 WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                    WHERE l.team_id = t.team_id AND l.table_name = 'golf_travel_itineraries' AND l.row_key = t.id::text);
DELETE FROM public.golf_messages AS t
 USING public.golf_conversations AS c
 WHERE c.id = t.conversation_id
   AND c.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' AND c.is_team_channel
   AND NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                    WHERE l.team_id = c.team_id AND l.table_name = 'golf_messages' AND l.row_key = t.id::text);

-- B4. CoachHelm insights from before the generator (DATA-03): they read the
--     cloned summer rounds, which are gone. Archived, not deleted. New ones
--     come from the CoachHelm jobs reading the generated season.
UPDATE public.golf_coach_insights AS t
   SET status = 'dismissed', dismissed = true, dismissed_at = now(),
       lifecycle_state = 'archived', archived_at = now()
 WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND t.status IN ('active', 'acknowledged')
   AND t.created_at < (SELECT min(l.written_at) FROM helm_private.golf_demo_ledger AS l
                        WHERE l.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163');

-- B2, continued: delete the set-aside rounds with the mark off.
SELECT pg_catalog.set_config('helm.golf_lifecycle_write', '', true);
DELETE FROM public.golf_rounds AS t
 WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
   AND t.status = 'abandoned'
   AND NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                    WHERE l.team_id = t.team_id AND l.table_name = 'golf_rounds' AND l.row_key = t.id::text);

-- After: no round, event or message on the team is outside the generator's
-- ledger. Expect generated_roster 9 (8 before the transfer joins in
-- November), signed_in_players as many as Part C will take off, and 0 in the
-- other columns.
SELECT (SELECT count(*) FROM public.golf_team_members AS t
         WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' AND t.status = 'active'
           AND EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                        WHERE l.team_id = t.team_id AND l.table_name = 'golf_team_members'
                          AND l.row_key = t.id::text)) AS generated_roster,
       (SELECT count(*) FROM public.golf_team_members AS t
          JOIN public.golf_players AS p ON p.id = t.player_id
         WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' AND t.status = 'active'
           AND p.user_id IS NOT NULL) AS signed_in_players,
       (SELECT count(*) FROM public.golf_rounds AS t
         WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
           AND NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                            WHERE l.team_id = t.team_id AND l.table_name = 'golf_rounds' AND l.row_key = t.id::text)) AS other_rounds,
       (SELECT count(*) FROM public.golf_events AS t
         WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
           AND NOT EXISTS (SELECT 1 FROM helm_private.golf_demo_ledger AS l
                            WHERE l.team_id = t.team_id AND l.table_name = 'golf_events' AND l.row_key = t.id::text)) AS other_events,
       (SELECT count(*) FROM public.golf_rounds
         WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' AND notes ~ '\[seed-from-') AS seed_tags;

ROLLBACK; -- Part B: change to COMMIT once the counts above look right,
          -- then run npm run golf:demo:verify.

-- =========================================================================
-- Part C, optional (recommended): player logins off the demo roster (DD-13)
-- Leave this part out to keep the owner's own player login on the demo
-- team roster. Any time after Part A; nothing in Parts A or B depends on it.
-- =========================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- C0. Who comes off the roster. Every active demo team player who can sign
--     in: the generator's players never can, and Part A has already taken
--     the test player off. Names show in this output only, never in this
--     file. Their player rows, logins and other teams stay as they are.
SELECT p.id AS player_id, p.first_name, p.last_name, t.status
  FROM public.golf_team_members AS t
  JOIN public.golf_players AS p ON p.id = t.player_id
 WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' AND t.status = 'active'
   AND p.user_id IS NOT NULL;

-- C1. Take them off the demo team roster.
UPDATE public.golf_team_members AS t
   SET status = 'inactive'
  FROM public.golf_players AS p
 WHERE p.id = t.player_id
   AND t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' AND t.status = 'active'
   AND p.user_id IS NOT NULL;

-- After: expect 0.
SELECT count(*) AS signed_in_players_on_roster
  FROM public.golf_team_members AS t
  JOIN public.golf_players AS p ON p.id = t.player_id
 WHERE t.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163' AND t.status = 'active'
   AND p.user_id IS NOT NULL;

ROLLBACK; -- Part C: change to COMMIT to take them off; leave Part C out to
          -- keep them on the roster.
