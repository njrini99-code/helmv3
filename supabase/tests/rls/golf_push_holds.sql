-- pgTAP contract for 20261025070200_golf_push_holds.sql
-- (Clubhouse P-10 held pushes: the table, the put, the claims, the heartbeat,
-- reconcile and the dirty-team trigger).
--
-- The put decides against now(), so the fixture builds a class window around the
-- current moment in a fixed-offset zone chosen so that local time is about noon:
-- the class always spans [now - 30 minutes, now + 90 minutes] and never crosses
-- midnight, whatever time the suite runs.
--
-- Plan arithmetic: 5 structural + 4 heartbeat + 15 put + 5 cancel + 12 claims and
-- marks + 9 reconcile and dirty + 4 cleanup and release + 3 inline release and held
-- count + 3 player read = 60.

BEGIN;
\ir _helpers.sql

SELECT plan(60);

CREATE FUNCTION public.p10_id(k text) RETURNS uuid LANGUAGE sql IMMUTABLE AS
$$ SELECT md5('p10-holds:' || k)::uuid $$;

CREATE FUNCTION public.p10_mkplayer(k text, p_team uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO auth.users (id, email, role)
  VALUES (public.p10_id('u:' || k), k || '@clhold.test', 'authenticated') ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_players (id, user_id, first_name, last_name)
  VALUES (public.p10_id('p:' || k), public.p10_id('u:' || k), k, 'Test');
  INSERT INTO public.golf_team_members (team_id, player_id, status)
  VALUES (p_team, public.p10_id('p:' || k), 'active');
END $$;

CREATE FUNCTION public.p10_put(
  p_user uuid, p_key text DEFAULT NULL, p_conv uuid DEFAULT NULL, p_exp timestamptz DEFAULT NULL,
  p_hold uuid DEFAULT NULL, p_reason text DEFAULT 'class'
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.golf_push_hold_put(p_user, p_hold, 'new_message', 'coach_dm', p_key,
                                   'Coach: hi', 'a message', '{}'::jsonb, p_conv, NULL, p_exp, p_reason)
$$;

-- An open row written directly (service-role style) with a chosen release time.
CREATE FUNCTION public.p10_row(
  k text, p_user uuid, p_release timestamptz, p_reason text DEFAULT 'class', p_attempts int DEFAULT 0,
  p_exp timestamptz DEFAULT NULL
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.golf_push_holds
    (id, user_id, reason, notification_type, group_key, title, body, held_at, release_at, attempts, expires_at)
  VALUES (public.p10_id('row:' || k), p_user, p_reason, 'new_message', 'coach_dm', 'T', 'B',
          now() - interval '2 hours', p_release, p_attempts, p_exp)
$$;

CREATE FUNCTION public.p10_as(p_user uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET role';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL role TO authenticated';
END $$;

CREATE FUNCTION public.p10_as_anon() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET role';
  PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);
  EXECUTE 'SET LOCAL role TO anon';
END $$;

CREATE FUNCTION public.p10_as_service() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET role';
  PERFORM set_config('request.jwt.claims', '{"role": "service_role"}', true);
  EXECUTE 'SET LOCAL role TO service_role';
END $$;

-- ============================================================================
-- Seed. Team 't1' has a term and every-day class window around now; users:
--   h1, h2 in class (h1 also reads as a player); h3 has no classes; h4 to h9 are
--   claim fixtures; h10 sits on team 't2' (no term), h11 on 't1' with a past class.
-- ============================================================================
DO $$
DECLARE
  v_off   int := ((extract(hour FROM now() AT TIME ZONE 'UTC')::int - 12) + 24) % 24;
  v_tz    text;
  v_local timestamp;
  v_start time;
  v_end   time;
  t1 uuid := public.p10_id('t1');
  t2 uuid := public.p10_id('t2');
  k  text;
BEGIN
  IF v_off > 12 THEN v_off := v_off - 24; END IF;
  v_tz := CASE WHEN v_off >= 0 THEN 'Etc/GMT+' || v_off ELSE 'Etc/GMT-' || (-v_off) END;
  v_local := now() AT TIME ZONE v_tz;
  v_start := date_trunc('minute', v_local - interval '30 minutes')::time;
  v_end   := v_start + interval '2 hours';

  INSERT INTO public.golf_teams (id, name, join_code) VALUES
    (t1, 'Holds Team One', 'CLHOLD01'), (t2, 'Holds Team Two', 'CLHOLD02');

  INSERT INTO public.golf_team_terms (team_id, label, classes_start, classes_end, exams_end, time_zone)
  VALUES (t1, 'Hold Term', v_local::date - 30, v_local::date + 60, v_local::date + 70, v_tz);

  FOREACH k IN ARRAY ARRAY['h1','h2','h3','h4','h5','h6','h7','h8','h9','h11'] LOOP
    PERFORM public.p10_mkplayer(k, t1);
  END LOOP;
  PERFORM public.p10_mkplayer('h10', t2);

  FOREACH k IN ARRAY ARRAY['h1','h2','h4','h5','h6','h7','h8','h9'] LOOP
    INSERT INTO public.golf_player_classes (id, player_id, class_name, days, start_time, end_time, semester)
    VALUES (public.p10_id('c:' || k), public.p10_id('p:' || k), 'CLS ' || k,
            '{M,T,W,Th,F,Sa,Su}', v_start, v_end, 'Hold Term');
  END LOOP;

  -- Conversations: one on team one, one on team two, one with no team.
  INSERT INTO public.golf_conversations (id, created_by, team_id, title) VALUES
    (public.p10_id('conv:t1'),   public.p10_id('u:h1'), t1,   'T1'),
    (public.p10_id('conv:t2'),   public.p10_id('u:h1'), t2,   'T2'),
    (public.p10_id('conv:none'), public.p10_id('u:h1'), NULL, 'None');
END $$;

-- ============================================================================
-- Structural
-- ============================================================================
SELECT ok(
  (SELECT bool_and(c.relrowsecurity) FROM pg_class c
    WHERE c.oid IN ('public.golf_push_holds'::regclass, 'public.golf_push_hold_heartbeat'::regclass,
                    'public.golf_class_hold_dirty'::regclass)),
  'the three tables have row level security on'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.golf_push_holds', 'select')
  AND NOT has_table_privilege('authenticated', 'public.golf_push_holds', 'insert')
  AND NOT has_table_privilege('authenticated', 'public.golf_push_holds', 'update')
  AND NOT has_table_privilege('authenticated', 'public.golf_push_holds', 'delete')
  AND NOT has_table_privilege('authenticated', 'public.golf_push_holds', 'truncate')
  AND has_table_privilege('authenticated', 'public.golf_push_holds', 'select'),
  'players can only select golf_push_holds: no insert, update, delete or truncate'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.golf_push_hold_heartbeat', 'select')
  AND NOT has_table_privilege('authenticated', 'public.golf_class_hold_dirty', 'select')
  AND NOT has_table_privilege('anon', 'public.golf_push_hold_heartbeat', 'select')
  AND NOT has_table_privilege('anon', 'public.golf_class_hold_dirty', 'select'),
  'the heartbeat and dirty tables are service_role only'
);

SELECT ok(
  has_function_privilege('service_role', 'public.golf_push_hold_put(uuid, uuid, text, text, text, text, text, jsonb, uuid, uuid, timestamptz, text)', 'execute')
  AND has_function_privilege('service_role', 'public.golf_push_holds_claim(uuid, integer, timestamptz, text)', 'execute')
  AND has_function_privilege('service_role', 'public.golf_push_holds_claim_failed(uuid, integer, timestamptz)', 'execute')
  AND has_function_privilege('service_role', 'public.golf_push_holds_claim_user(uuid, uuid, text, boolean)', 'execute')
  AND has_function_privilege('service_role', 'public.golf_push_holds_cancel(uuid, uuid)', 'execute')
  AND has_function_privilege('service_role', 'public.golf_push_holds_mark(uuid, uuid[], text)', 'execute')
  AND has_function_privilege('service_role', 'public.golf_push_holds_unclaim(uuid, uuid[])', 'execute')
  AND has_function_privilege('service_role', 'public.golf_push_holds_reconcile(timestamptz, boolean)', 'execute')
  AND has_function_privilege('service_role', 'public.golf_push_holds_cleanup(interval)', 'execute')
  AND has_function_privilege('service_role', 'public.golf_push_holds_beat(text)', 'execute'),
  'service_role can execute every release-job function'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.golf_push_hold_put(uuid, uuid, text, text, text, text, text, jsonb, uuid, uuid, timestamptz, text)', 'execute')
  AND NOT has_function_privilege('authenticated', 'public.golf_push_holds_claim(uuid, integer, timestamptz, text)', 'execute')
  AND NOT has_function_privilege('authenticated', 'public.golf_push_holds_reconcile(timestamptz, boolean)', 'execute')
  AND NOT has_function_privilege('anon', 'public.golf_push_holds_release_mine()', 'execute')
  AND has_function_privilege('authenticated', 'public.golf_push_holds_release_mine()', 'execute')
  AND position('exception when others' IN pg_get_functiondef('public.golf_class_hold_mark_dirty()'::regprocedure)) > 0,
  'no client can run the job functions; release_mine is the one authenticated entry; the dirty trigger swallows its own errors'
);

-- ============================================================================
-- Heartbeat (Must 1)
-- ============================================================================
SELECT is(
  public.p10_put(public.p10_id('u:h1'), 'k-stale') ->> 'why',
  'job_stale',
  'with no heartbeat the put holds nothing: why = job_stale'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_push_holds WHERE user_id = public.p10_id('u:h1')),
  0,
  'and no row was written'
);

SELECT public.p10_as_service();
SELECT lives_ok($$SELECT public.golf_push_holds_beat('pgtap')$$, 'the job can write its heartbeat as service_role');
SELECT public.p10_as_service();
SELECT public.golf_push_holds_beat('pgtap-again');
RESET role;

SELECT throws_ok(
  $$INSERT INTO public.golf_push_hold_heartbeat (id, source) VALUES (false, 'x')$$,
  '23514', NULL,
  'the heartbeat table can only ever hold one row'
);

-- ============================================================================
-- Put
-- ============================================================================
SELECT public.p10_as_service();
CREATE TEMP TABLE put1 ON COMMIT DROP AS
SELECT public.p10_put(public.p10_id('u:h1'), 'k1') AS r;
RESET role;

SELECT is((SELECT (r->>'held')::boolean FROM put1), true, 'inside a class with a live heartbeat the push is held');

SELECT ok(
  (SELECT (r->>'release_at')::timestamptz > now() + interval '85 minutes'
      AND (r->>'release_at')::timestamptz <= now() + interval '95 minutes' FROM put1),
  'it is held until the class ends (the window was built to end about 90 minutes from now)'
);

SELECT is((SELECT (r->>'due_waiting')::int FROM put1), 0, 'nothing was waiting and due');

SELECT is(
  (SELECT count(*)::int FROM public.golf_push_holds WHERE user_id = public.p10_id('u:h1') AND dedupe_key = 'k1' AND released_at IS NULL),
  1,
  'one open row exists'
);

SELECT is(
  (public.p10_put(public.p10_id('u:h1'), 'k1') ->> 'held')::boolean
  AND (SELECT count(*) = 1 FROM public.golf_push_holds WHERE user_id = public.p10_id('u:h1') AND dedupe_key = 'k1'),
  true,
  'a second put with the same dedupe key is still held and adds no row'
);

UPDATE public.golf_push_holds SET released_at = now(), outcome = 'sent_alone'
 WHERE user_id = public.p10_id('u:h1') AND dedupe_key = 'k1';

SELECT is(
  public.p10_put(public.p10_id('u:h1'), 'k1') ->> 'held',
  'true',
  'after release the same key can be held again'
);

SELECT is(
  public.p10_put(public.p10_id('u:h1'), 'k-exp', NULL, now() + interval '10 minutes') ->> 'why',
  'expires_first',
  'a push that expires before the class ends is not held'
);

SELECT is(
  public.p10_put(public.p10_id('u:h3'), 'k-h3') ->> 'why',
  'not_in_class',
  'a player with no classes is not held'
);

SELECT is(
  public.p10_put(public.p10_id('u:h1'), 'k-c2', public.p10_id('conv:t2')) ->> 'why',
  'other_team',
  'a conversation of another team is not held for this player (Must 3)'
);

SELECT is(
  public.p10_put(public.p10_id('u:h1'), 'k-cn', public.p10_id('conv:none')) ->> 'why',
  'no_team',
  'a conversation with no team is never held (null team rule)'
);

SELECT is(
  public.p10_put(public.p10_id('u:h1'), 'k-c1', public.p10_id('conv:t1')) ->> 'held',
  'true',
  'a conversation of the player''s own team is held'
);

SELECT is(
  public.p10_put(public.p10_id('u:h1'), 'k-play', NULL, NULL, NULL, 'playing') ->> 'why',
  'reason',
  'the playing reason is reserved for D-89: the put holds nothing for it'
);

SELECT throws_ok(
  $$INSERT INTO public.golf_push_holds (user_id, reason, notification_type, group_key, title, body, held_at, release_at)
    VALUES ('$$ || public.p10_id('u:h1') || $$', 'class', 'x', 'other', 't', 'b', now(), now() + interval '4 hours 1 minute')$$,
  '23514', NULL,
  'a class hold longer than 4 hours is refused by the table'
);

UPDATE public.golf_push_hold_heartbeat SET beat_at = now() - interval '4 minutes';

SELECT is(
  public.p10_put(public.p10_id('u:h2'), 'k-late') ->> 'why',
  'job_stale',
  'a heartbeat more than 3 minutes old holds nothing'
);

UPDATE public.golf_push_hold_heartbeat SET beat_at = now() - interval '2 minutes';

SELECT is(
  public.p10_put(public.p10_id('u:h2'), 'k-ok') ->> 'held',
  'true',
  'a heartbeat 2 minutes old is live'
);

-- ============================================================================
-- Cancel tombstone (Should 4)
-- ============================================================================
SELECT is(
  public.golf_push_holds_cancel(public.p10_id('hold:a'), public.p10_id('u:h2')),
  true,
  'cancelling an id the put has not written yet writes a tombstone'
);

SELECT is(
  public.p10_put(public.p10_id('u:h2'), 'k-a', NULL, NULL, public.p10_id('hold:a')) ->> 'why',
  'cancelled',
  'a put that commits after the cancel conflicts on the id and inserts nothing'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_push_holds WHERE id = public.p10_id('hold:a') AND outcome = 'cancelled' AND dedupe_key IS NULL),
  1,
  'only the tombstone exists for that id'
);

SELECT public.p10_put(public.p10_id('u:h2'), 'k-b', NULL, NULL, public.p10_id('hold:b'));
CREATE TEMP TABLE cancel_b ON COMMIT DROP AS
SELECT public.golf_push_holds_cancel(public.p10_id('hold:b'), public.p10_id('u:h2')) AS r;
SELECT is(
  (SELECT r FROM cancel_b) AND (SELECT outcome = 'cancelled' FROM public.golf_push_holds WHERE id = public.p10_id('hold:b')),
  true,
  'cancelling a row that landed and was not claimed cancels it'
);

SELECT public.p10_put(public.p10_id('u:h2'), 'k-c', NULL, NULL, public.p10_id('hold:c'));
UPDATE public.golf_push_holds SET claim_token = public.p10_id('tok:x'), claimed_at = now() WHERE id = public.p10_id('hold:c');
SELECT is(
  public.golf_push_holds_cancel(public.p10_id('hold:c'), public.p10_id('u:h2')),
  false,
  'a row the job has already claimed is left alone'
);

-- ============================================================================
-- Claims (Should 2, 3) and marks
-- ============================================================================
-- h4: two due rows (the older one makes h4 first); h5: one due row.
SELECT public.p10_row('h4a', public.p10_id('u:h4'), now() - interval '10 minutes');
SELECT public.p10_row('h4b', public.p10_id('u:h4'), now() - interval '2 minutes');
SELECT public.p10_row('h5a', public.p10_id('u:h5'), now() - interval '5 minutes');
-- h6: a due class row, a future class row, a due playing row.
SELECT public.p10_row('h6due', public.p10_id('u:h6'), now() - interval '1 minute');
SELECT public.p10_row('h6later', public.p10_id('u:h6'), now() + interval '1 hour');
SELECT public.p10_row('h6play', public.p10_id('u:h6'), now() - interval '1 minute', 'playing');
-- h7: a row that failed three claims.
SELECT public.p10_row('h7fail', public.p10_id('u:h7'), now() - interval '20 minutes', 'class', 3);

CREATE TEMP TABLE claimed_a ON COMMIT DROP AS
SELECT * FROM public.golf_push_holds_claim(public.p10_id('tok:a'), 1, now(), 'class')
WHERE user_id IN (public.p10_id('u:h4'), public.p10_id('u:h5'), public.p10_id('u:h6'));

SELECT is(
  (SELECT count(DISTINCT user_id)::int FROM claimed_a),
  1,
  'claim picks users first: one user with max_users = 1'
);

SELECT is(
  (SELECT count(*)::int FROM claimed_a WHERE user_id = public.p10_id('u:h4')),
  2,
  'and takes all of that user''s due rows, so one summary is possible (Should 2)'
);

SELECT ok(
  (SELECT bool_and(attempts = 1 AND claim_token = public.p10_id('tok:a') AND claimed_at IS NOT NULL) FROM claimed_a),
  'claiming sets the token and increments attempts'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_push_holds_claim_failed(public.p10_id('tok:f'), 10, now())
    WHERE id = public.p10_id('row:h7fail') AND attempts = 3),
  1,
  'the safety net has its own claim, which takes it (Should 3)'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_push_holds_claim_user(public.p10_id('u:h6'), public.p10_id('tok:u1'), 'class', true)
    WHERE id IN (public.p10_id('row:h6due'), public.p10_id('row:h6later'), public.p10_id('row:h6play'))),
  1,
  'claim_user with due_only takes only the due class row'
);

SELECT is(
  (SELECT array_agg(reason ORDER BY id::text) FROM public.golf_push_holds_claim_user(public.p10_id('u:h6'), public.p10_id('tok:u2'), 'class', false)),
  ARRAY['class'],
  'claim_user for the class reason takes the later class row and never the playing row'
);

CREATE TEMP TABLE claimed_b ON COMMIT DROP AS
SELECT * FROM public.golf_push_holds_claim(public.p10_id('tok:b'), 50, now(), 'class');

SELECT is(
  (SELECT count(*)::int FROM claimed_b WHERE user_id = public.p10_id('u:h4')),
  0,
  'rows claimed in the last 5 minutes are not claimed again'
);

SELECT is(
  (SELECT count(*)::int FROM claimed_b WHERE id = public.p10_id('row:h7fail')),
  0,
  'a row with 3 failed attempts is not taken by the ordinary claim'
);

SELECT is(
  public.golf_push_holds_mark(public.p10_id('tok:wrong'), ARRAY[public.p10_id('row:h4a')], 'summarized'),
  0,
  'mark only touches rows with the matching token'
);

SELECT throws_ok(
  $$SELECT public.golf_push_holds_mark('00000000-0000-0000-0000-000000000000'::uuid, ARRAY[]::uuid[], 'bogus')$$,
  '22023', NULL,
  'an unknown outcome raises'
);

SELECT is(
  public.golf_push_holds_mark(public.p10_id('tok:a'), ARRAY[public.p10_id('row:h4a'), public.p10_id('row:h4b')], 'summarized'),
  2,
  'mark releases the claimed rows with the outcome'
);

SELECT is(
  public.golf_push_holds_unclaim(public.p10_id('tok:u1'), ARRAY[public.p10_id('row:h6due')]),
  1,
  'unclaim gives a row back'
);

-- ============================================================================
-- Reconcile (Should 5) and the dirty trigger
-- ============================================================================
-- h8 holds an open row due at class end; a team-wide off day marks the team dirty.
SELECT public.p10_put(public.p10_id('u:h8'), 'k-r1');
UPDATE public.golf_push_hold_heartbeat SET beat_at = now();

SELECT is(
  (SELECT count(*)::int FROM public.golf_class_hold_dirty WHERE team_id = public.p10_id('t1')),
  0,
  'before any class data changes, no team is dirty'
);

INSERT INTO public.golf_class_exceptions (team_id, kind, starts_on, ends_on)
VALUES (public.p10_id('t1'), 'off',
        (now() AT TIME ZONE (SELECT time_zone FROM public.golf_team_terms WHERE team_id = public.p10_id('t1')))::date,
        (now() AT TIME ZONE (SELECT time_zone FROM public.golf_team_terms WHERE team_id = public.p10_id('t1')))::date);

SELECT is(
  (SELECT count(*)::int FROM public.golf_class_hold_dirty WHERE team_id = public.p10_id('t1')),
  1,
  'while open class holds exist, a class-data change marks the team dirty'
);

CREATE TEMP TABLE rec1 ON COMMIT DROP AS SELECT public.golf_push_holds_reconcile(now(), false) AS r;

SELECT ok(
  (SELECT (r->>'moved')::int >= 1 AND (r->>'full')::boolean = false FROM rec1),
  'reconcile for dirty teams moves the held release earlier (the team break ends the class)'
);

SELECT ok(
  (SELECT release_at <= now() + interval '1 second' FROM public.golf_push_holds
    WHERE user_id = public.p10_id('u:h8') AND dedupe_key = 'k-r1'),
  'the moved release is due now'
);

-- Never later: a row with an early release stays early when reconcile runs in full.
SELECT public.p10_row('early', public.p10_id('u:h9'), now() + interval '10 minutes');
SELECT public.golf_push_holds_reconcile(now(), true);
SELECT ok(
  (SELECT release_at <= now() + interval '11 minutes' FROM public.golf_push_holds WHERE id = public.p10_id('row:early')),
  'reconcile never moves a release later (a row due in 10 minutes does not move to the class end)'
);

-- Expiry and overdue.
SELECT public.p10_row('expired', public.p10_id('u:h9'), now() + interval '30 minutes', 'class', 0, now() - interval '1 minute');
SELECT public.p10_row('overdue', public.p10_id('u:h4'), now() - interval '30 minutes');
CREATE TEMP TABLE rec2 ON COMMIT DROP AS SELECT public.golf_push_holds_reconcile(now(), true) AS r;

SELECT is(
  (SELECT outcome FROM public.golf_push_holds WHERE id = public.p10_id('row:expired')),
  'expired',
  'a row past its expiry is expired by reconcile'
);

SELECT ok(
  (SELECT (r->>'overdue')::int >= 1 AND (r->>'expired')::int >= 1 AND (r->>'full')::boolean FROM rec2),
  'reconcile reports overdue and expired counts, and that it ran in full'
);

-- Dirty only checks dirty teams: h10 is on a team with no term and an open row.
SELECT public.p10_row('h10row', public.p10_id('u:h10'), now() + interval '1 hour');
UPDATE public.golf_class_hold_dirty SET marked_at = now();
SELECT ok(
  (SELECT (public.golf_push_holds_reconcile(now(), false)->>'checked')::int
        < (public.golf_push_holds_reconcile(now(), true)->>'checked')::int),
  'a dirty-only pass checks fewer users than a full pass'
);

-- The trigger acts only while open class holds exist.
UPDATE public.golf_push_holds SET released_at = now(), outcome = 'cancelled' WHERE released_at IS NULL;
DELETE FROM public.golf_class_hold_dirty;
INSERT INTO public.golf_class_exceptions (team_id, kind, starts_on, ends_on)
VALUES (public.p10_id('t1'), 'off', current_date + 7, current_date + 7);
SELECT is(
  (SELECT count(*)::int FROM public.golf_class_hold_dirty),
  0,
  'with no open class holds the trigger marks nothing'
);

-- ============================================================================
-- Cleanup and Deliver now
-- ============================================================================
SELECT public.p10_row('old', public.p10_id('u:h4'), now() - interval '90 minutes');
UPDATE public.golf_push_holds SET released_at = now() - interval '20 days', outcome = 'sent_alone', release_at = now() - interval '20 days' + interval '1 hour', held_at = now() - interval '20 days'
 WHERE id = public.p10_id('row:old');
SELECT public.p10_row('recent', public.p10_id('u:h4'), now() - interval '90 minutes');
UPDATE public.golf_push_holds SET released_at = now() - interval '1 day', outcome = 'sent_alone' WHERE id = public.p10_id('row:recent');
SELECT public.p10_row('open', public.p10_id('u:h4'), now() + interval '30 minutes');

CREATE TEMP TABLE cleaned ON COMMIT DROP AS SELECT public.golf_push_holds_cleanup() AS n;
SELECT ok(
  (SELECT n >= 1 FROM cleaned)
  AND NOT EXISTS (SELECT 1 FROM public.golf_push_holds WHERE id = public.p10_id('row:old')),
  'cleanup deletes released rows older than 14 days'
);
SELECT ok(
  EXISTS (SELECT 1 FROM public.golf_push_holds WHERE id = public.p10_id('row:recent'))
  AND EXISTS (SELECT 1 FROM public.golf_push_holds WHERE id = public.p10_id('row:open')),
  'cleanup keeps recent released rows and open rows'
);

SELECT public.p10_row('mine1', public.p10_id('u:h1'), now() + interval '40 minutes');
SELECT public.p10_row('mine2', public.p10_id('u:h2'), now() + interval '40 minutes');
SELECT public.p10_as(public.p10_id('u:h1'));
CREATE TEMP TABLE released_mine ON COMMIT DROP AS SELECT public.golf_push_holds_release_mine() AS n;

SELECT ok(
  (SELECT n >= 1 FROM released_mine)
  AND (SELECT release_at <= now() + interval '1 second' FROM public.golf_push_holds WHERE id = public.p10_id('row:mine1')),
  'release_mine makes the caller''s open rows due now'
);

RESET role;
SELECT ok(
  (SELECT release_at > now() + interval '30 minutes' FROM public.golf_push_holds WHERE id = public.p10_id('row:mine2')),
  'and leaves other players'' rows alone'
);

-- ============================================================================
-- Inline release (Should 20) and the held count (Should 10)
-- ============================================================================
SELECT public.p10_row('h11due', public.p10_id('u:h11'), now() - interval '1 minute');

SELECT is(
  (public.p10_put(public.p10_id('u:h11'), 'k-h11') ->> 'due_waiting')::int,
  1,
  'the put reports the player''s rows that are already due, so the gate can release them first'
);

INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, created_at, is_deleted) VALUES
  (public.p10_id('m:unread'),  public.p10_id('conv:t1'), public.p10_id('u:h1'), 'unread',  '2026-10-10', false),
  (public.p10_id('m:read'),    public.p10_id('conv:t1'), public.p10_id('u:h1'), 'read',    '2026-09-20', false),
  (public.p10_id('m:deleted'), public.p10_id('conv:t1'), public.p10_id('u:h1'), 'deleted', '2026-10-11', true);
INSERT INTO public.golf_conversation_participants (conversation_id, user_id, last_read_at)
VALUES (public.p10_id('conv:t1'), public.p10_id('u:h11'), '2026-10-01');
INSERT INTO public.golf_push_holds
  (user_id, reason, notification_type, group_key, title, body, message_id, held_at, release_at) VALUES
  (public.p10_id('u:h11'), 'class', 'new_message', 'coach_dm', 'T', 'B', public.p10_id('m:unread'),  now() - interval '1 hour', now() + interval '20 minutes'),
  (public.p10_id('u:h11'), 'class', 'new_message', 'coach_dm', 'T', 'B', public.p10_id('m:read'),    now() - interval '1 hour', now() + interval '20 minutes'),
  (public.p10_id('u:h11'), 'class', 'new_message', 'coach_dm', 'T', 'B', public.p10_id('m:deleted'), now() - interval '1 hour', now() + interval '20 minutes');

SELECT public.p10_as(public.p10_id('u:h11'));
CREATE TEMP TABLE h11_day ON COMMIT DROP AS SELECT public.golf_my_class_day() AS d;

SELECT is(
  (SELECT (d->'held'->>'count')::int FROM h11_day),
  2,
  'held counts a non-message row and an unread message, and leaves out a read message and a deleted one'
);

SELECT ok(
  (SELECT (d->'held'->>'release_at')::timestamptz <= now() FROM h11_day),
  'and reports the earliest release'
);
RESET role;

-- ============================================================================
-- A player reads only their own rows
-- ============================================================================
SELECT public.p10_as(public.p10_id('u:h1'));

SELECT is(
  (SELECT count(*)::int FROM public.golf_push_holds WHERE user_id <> public.p10_id('u:h1')),
  0,
  'a player never reads another player''s held pushes'
);

SELECT throws_ok(
  $$UPDATE public.golf_push_holds SET release_at = now() WHERE user_id = auth.uid()$$,
  '42501', NULL,
  'a player cannot edit a held push'
);

SELECT public.p10_as_anon();
SELECT throws_ok(
  $$SELECT public.golf_push_holds_release_mine()$$,
  '42501', NULL,
  'anon cannot Deliver now'
);
RESET role;

SELECT * FROM finish();
ROLLBACK;
