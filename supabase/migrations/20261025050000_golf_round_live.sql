-- STATUS: WRITTEN — HOLD — NOT APPLIED
-- 20261025050000_golf_round_live.sql
-- Held for the owner (supabase/migrations/HELD.md; plan docs/clubhouse/held/data/live-rounds.md). Owner applies. Written 2026-10-25 for Clubhouse P-6 (handoff 4.34.6).
-- Apply: npm run db:apply -- supabase/migrations/20261025050000_golf_round_live.sql
-- Purpose: P-6 live rounds. One live state row per in-progress team round, refreshed in place at commit by deferred constraint triggers, because save_partial_round_atomic deletes and re-inserts golf_holes on every save. Nothing a player records changes: the save RPC, golf_holes, golf_shots and draft_data are read, never written.
-- Risk: MEDIUM. Adds deferred AFTER triggers on golf_holes and golf_rounds (the hot save path). Each refresh runs once per round per transaction, reads at most 18 hole rows, waits at most 200 ms for any lock, takes the live row NOWAIT, and its own errors (including lock_not_available) become a WARNING so a save never fails or stalls because of live.
-- Lock: CREATE TRIGGER takes SHARE ROW EXCLUSIVE on golf_holes and golf_rounds and waits for in-flight saves; lock_timeout 3s makes it fail fast instead of queueing saves. Apply outside a qualifier day.
-- ORDER: after 20260820170000 and 20260825052141. Before 20261025050100 and 20261025050200. Independent of 4.33's 20261024100500.
-- Desired schema: mirrored by hand in supabase/schemas (golf/10_tables, 20_constraints, 30_indexes, 90_comments, 95_grants; policies/golf and rls_enable; functions/helm_private, public and 95_grants; triggers/golf). Check with supabase db diff.
-- squawk: integer and smallint columns are deliberate (a hole number, a stroke count, a position; at most 18 per round), so each carries a squawk-ignore line (predicted, not run; CI squawk-cli 2.64.0).
-- VERIFY: select 1 where to_regclass('public.golf_round_live') is not null and to_regclass('public.golf_round_live_prefs') is not null;
-- VERIFY: select 1 where (select count(*) from pg_trigger where tgname in ('golf_holes_round_live','golf_rounds_round_live_ins','golf_rounds_round_live_upd') and tgdeferrable and tginitdeferred) = 3;
-- VERIFY: select 1 where (select count(*) from pg_trigger where tgname = 'golf_rounds_round_live_gone') = 1;
-- VERIFY: select 1 from pg_class where oid in ('public.golf_round_live'::regclass, 'public.golf_round_live_prefs'::regclass) and relrowsecurity having count(*) = 2;
-- VERIFY: select 1 where not has_table_privilege('anon', 'public.golf_round_live', 'select') and not has_table_privilege('anon', 'public.golf_round_live_prefs', 'select');
-- VERIFY: select 1 where not has_table_privilege('authenticated', 'public.golf_round_live', 'truncate') and not has_table_privilege('authenticated', 'public.golf_round_live_prefs', 'truncate');
-- VERIFY: select 1 where (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'helm_private' and p.proname = 'golf_round_live_refresh' and 'lock_timeout=200ms' = any(p.proconfig)) = 1;
-- VERIFY: select 1 where (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'helm_private' and p.proname in ('golf_round_live_type', 'golf_round_live_floor') and 'search_path=pg_catalog' = any(p.proconfig)) = 2;
-- ROLLBACK: drop trigger if exists golf_holes_round_live on public.golf_holes; drop trigger if exists golf_rounds_round_live_ins on public.golf_rounds; drop trigger if exists golf_rounds_round_live_upd on public.golf_rounds; drop trigger if exists golf_rounds_round_live_gone on public.golf_rounds;
-- ROLLBACK: drop function if exists public.golf_round_live_set_share(uuid,text,boolean); drop function if exists public.golf_round_live_set_next_share(text,boolean); drop function if exists public.golf_live_viewer_on_course(uuid);
-- ROLLBACK: drop table if exists public.golf_round_live; drop table if exists public.golf_round_live_prefs; drop sequence if exists public.golf_round_live_seq;
-- ROLLBACK: drop function if exists helm_private.golf_round_live_refresh(uuid,boolean); drop function if exists helm_private.golf_round_live_touch(uuid); drop function if exists helm_private.golf_round_live_emit(public.golf_round_live,uuid,text,jsonb,boolean); drop function if exists helm_private.golf_live_broadcast(text,text,jsonb); drop function if exists helm_private.golf_holes_round_live(); drop function if exists helm_private.golf_rounds_round_live(); drop function if exists helm_private.golf_rounds_round_live_gone(); drop function if exists helm_private.golf_round_live_type(text); drop function if exists helm_private.golf_round_live_floor(text,text); drop function if exists helm_private.golf_team_today(uuid); (if 20261025050100 was applied, roll it back first)

SET lock_timeout = '3s';

-- 0. Preconditions --------------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.golf_rounds') IS NULL OR to_regclass('public.golf_holes') IS NULL THEN
    RAISE EXCEPTION 'golf_rounds and golf_holes must exist';
  END IF;
  IF to_regnamespace('helm_private') IS NULL THEN
    RAISE EXCEPTION 'schema helm_private must exist (20260825052141)';
  END IF;
  IF to_regclass('public.golf_team_settings') IS NULL THEN
    RAISE EXCEPTION 'golf_team_settings must exist (the team time zone)';
  END IF;
  IF to_regprocedure('public.is_golf_team_coach(uuid)') IS NULL
     OR to_regprocedure('public.is_golf_team_player(uuid)') IS NULL THEN
    RAISE EXCEPTION 'is_golf_team_coach(uuid) and is_golf_team_player(uuid) must exist';
  END IF;
END $$;

-- 1. Tables ---------------------------------------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.golf_round_live_seq AS bigint;

CREATE TABLE IF NOT EXISTS public.golf_round_live_prefs (
  player_id      uuid PRIMARY KEY REFERENCES public.golf_players(id) ON DELETE CASCADE,
  practice_share text NOT NULL DEFAULT 'off',
  -- The round-setup choice, held for one round: adopted by the refresh when it creates that round's row (if it was set within
  -- 30 minutes before golf_rounds.created_at) and cleared in the same subtransaction (golf_round_live_set_next_share).
  next_share     text,
  next_share_at  timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golf_round_live_prefs_practice_share_chk CHECK (practice_share IN ('off', 'coaches', 'team')),
  CONSTRAINT golf_round_live_prefs_next_share_chk CHECK (next_share IS NULL OR next_share IN ('off', 'coaches', 'team'))
);
ALTER TABLE public.golf_round_live_prefs ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.golf_round_live_prefs IS
  'P-6: a player''s default live sharing for practice rounds (OQ-72: off unless they choose), and the one-round choice made in round setup. Qualifier and tournament rounds are always shared with coaches.';

CREATE TABLE IF NOT EXISTS public.golf_round_live (
  round_id         uuid PRIMARY KEY REFERENCES public.golf_rounds(id) ON DELETE CASCADE,
  team_id          uuid NOT NULL REFERENCES public.golf_teams(id) ON DELETE CASCADE,
  player_id        uuid NOT NULL REFERENCES public.golf_players(id) ON DELETE CASCADE,
  round_type       text NOT NULL,
  qualifier_id     uuid,
  -- squawk-ignore prefer-bigint-over-int
  qualifier_round  integer,
  round_date       date NOT NULL,
  course_id        uuid,
  course_name      text,
  -- squawk-ignore prefer-bigint-over-smallint
  holes_planned    smallint NOT NULL DEFAULT 18,
  -- squawk-ignore prefer-bigint-over-smallint
  start_position   smallint NOT NULL DEFAULT 1,
  -- The hole NUMBER the player is on (golf_rounds.current_hole), 1 to 18, or NULL when it is missing or out of range.
  -- squawk-ignore prefer-bigint-over-smallint
  current_hole     smallint,
  share            text NOT NULL,
  phase            text NOT NULL DEFAULT 'on_course',
  -- squawk-ignore prefer-bigint-over-smallint
  thru             smallint NOT NULL DEFAULT 0,
  -- squawk-ignore prefer-bigint-over-smallint
  to_par           smallint,
  -- squawk-ignore prefer-bigint-over-smallint
  strokes          smallint,
  holes            jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_hole_at     timestamptz,
  heard_at         timestamptz NOT NULL DEFAULT now(),
  is_test          boolean NOT NULL DEFAULT false,
  seq              bigint NOT NULL DEFAULT nextval('public.golf_round_live_seq'),
  emit_window_at   timestamptz NOT NULL DEFAULT now(),
  -- squawk-ignore prefer-bigint-over-int
  emit_count       integer NOT NULL DEFAULT 0,
  -- squawk-ignore prefer-bigint-over-smallint
  share_changes    smallint NOT NULL DEFAULT 0,
  started_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golf_round_live_round_type_chk CHECK (round_type IN ('practice', 'qualifier', 'tournament')),
  CONSTRAINT golf_round_live_share_chk      CHECK (share IN ('off', 'coaches', 'team')),
  -- Owner call 1 default: only practice rounds can be shared with the team; qualifier and tournament are coaches only.
  CONSTRAINT golf_round_live_share_floor_chk CHECK (round_type = 'practice' OR share = 'coaches'),
  CONSTRAINT golf_round_live_phase_chk      CHECK (phase IN ('on_course', 'finished', 'posted', 'stopped')),
  CONSTRAINT golf_round_live_holes_planned_chk CHECK (holes_planned IN (9, 18)),
  CONSTRAINT golf_round_live_current_hole_chk CHECK (current_hole IS NULL OR current_hole BETWEEN 1 AND 18),
  CONSTRAINT golf_round_live_holes_chk      CHECK (jsonb_typeof(holes) = 'array' AND jsonb_array_length(holes) <= 18),
  CONSTRAINT golf_round_live_thru_chk       CHECK (thru BETWEEN 0 AND 18)
);
ALTER TABLE public.golf_round_live ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.golf_round_live IS
  'P-6: live state of an in-progress team round, refreshed in place at commit (helm_private.golf_round_live_refresh). Never written by clients; sharing changes go through golf_round_live_set_share. Swept by golf-round-live-sweep.';

-- 2. Helpers ----------------------------------------------------------------------------------------------------------
-- pg_catalog only: these two read no table, so a hostile search_path cannot redirect anything they call.
CREATE OR REPLACE FUNCTION helm_private.golf_round_live_type(p_round_type text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN p_round_type IN ('qualifier', 'qualifying') THEN 'qualifier'
    WHEN p_round_type = 'tournament' THEN 'tournament'
    ELSE 'practice'
  END;
$$;

CREATE OR REPLACE FUNCTION helm_private.golf_round_live_floor(p_type text, p_share text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN p_type = 'practice' THEN CASE WHEN p_share IN ('off', 'coaches', 'team') THEN p_share ELSE 'off' END
    ELSE 'coaches'
  END;
$$;

-- The team's calendar day, in the team's own zone (golf_team_settings.timezone, America/New_York when it is missing or
-- not a real zone: the same rule as getValidTimezone in src/lib/calendar/timezone.ts). "Today" and "yesterday" are the
-- team's, never the database's UTC ones.
CREATE OR REPLACE FUNCTION helm_private.golf_team_today(p_team uuid)
RETURNS date LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public AS $$
DECLARE
  v_zone text;
BEGIN
  SELECT s.timezone INTO v_zone FROM public.golf_team_settings s WHERE s.team_id = p_team LIMIT 1;
  BEGIN
    RETURN (now() AT TIME ZONE coalesce(nullif(btrim(v_zone), ''), 'America/New_York'))::date;
  EXCEPTION WHEN invalid_parameter_value THEN
    RETURN (now() AT TIME ZONE 'America/New_York')::date;
  END;
END $$;

-- No-op until 20261025050100 replaces it with realtime.send. Kept separate so polling can ship first.
CREATE OR REPLACE FUNCTION helm_private.golf_live_broadcast(p_topic text, p_event text, p_payload jsonb)
RETURNS void LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  RETURN;
END $$;

-- Sends lane, hide events for one row change. p_old_team and p_old_share describe what was visible before.
CREATE OR REPLACE FUNCTION helm_private.golf_round_live_emit(
  p_new public.golf_round_live,
  p_old_team uuid,
  p_old_share text,
  p_changed jsonb,
  p_late boolean
) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_coach_now boolean := p_new.share IN ('coaches', 'team');
  v_team_now  boolean := p_new.share = 'team' AND p_new.round_type = 'practice';
  v_coach_was boolean := p_old_team IS NOT NULL AND p_old_share IN ('coaches', 'team');
  v_team_was  boolean := p_old_team IS NOT NULL AND p_old_share = 'team';
  v_moved     boolean := p_old_team IS NOT NULL AND p_old_team IS DISTINCT FROM p_new.team_id;
  v_hide      jsonb   := jsonb_build_object('v', 1, 'k', 'hide', 'r', p_new.round_id, 'seq', p_new.seq);
  v_base      jsonb;
BEGIN
  IF p_new.is_test THEN
    RETURN;
  END IF;

  -- 'cur' is the hole NUMBER the player is on (1 to 18), the same value as golf_rounds.current_hole.
  v_base := jsonb_build_object(
    'v', 1, 'k', 'lane', 'r', p_new.round_id, 'p', p_new.player_id, 'seq', p_new.seq,
    'rt', p_new.round_type, 'q', p_new.qualifier_id, 'qr', p_new.qualifier_round, 'd', p_new.round_date,
    'c', p_new.course_id, 'cn', p_new.course_name, 'hp', p_new.holes_planned, 'sp', p_new.start_position,
    'cur', p_new.current_hole, 'ph', p_new.phase, 't', p_new.thru, 'tp', p_new.to_par, 'st', p_new.strokes,
    'la', p_new.last_hole_at, 'hd', p_new.heard_at, 'sh', p_new.share, 'e', p_new.ended_at, 'late', p_late
  );

  -- Hide where the lane was visible and no longer is (share lowered, or the round moved team).
  IF v_coach_was AND (v_moved OR NOT v_coach_now) THEN
    PERFORM helm_private.golf_live_broadcast('golf-live:coach:' || p_old_team, 'hide', v_hide);
  END IF;
  IF v_team_was AND (v_moved OR NOT v_team_now) THEN
    PERFORM helm_private.golf_live_broadcast('golf-live:team:' || p_old_team, 'hide', v_hide);
  END IF;

  -- Lane where it is visible now. A topic that did not have the lane before gets the full hole list.
  IF v_coach_now THEN
    PERFORM helm_private.golf_live_broadcast(
      'golf-live:coach:' || p_new.team_id, 'lane',
      v_base || CASE WHEN v_coach_was AND NOT v_moved
                     THEN jsonb_build_object('full', false, 'h', p_changed)
                     ELSE jsonb_build_object('full', true, 'h', p_new.holes) END);
  END IF;
  IF v_team_now THEN
    PERFORM helm_private.golf_live_broadcast(
      'golf-live:team:' || p_new.team_id, 'lane',
      v_base || CASE WHEN v_team_was AND NOT v_moved
                     THEN jsonb_build_object('full', false, 'h', p_changed)
                     ELSE jsonb_build_object('full', true, 'h', p_new.holes) END);
  END IF;
END $$;

-- 3. Refresh ----------------------------------------------------------------------------------------------------------
-- lock_timeout 200 ms: any lock this function waits for (other than the live row, taken NOWAIT) gives up fast, so the
-- commit-time refresh can never stall a save. The touch handler below turns the resulting 55P03 into a WARNING.
CREATE OR REPLACE FUNCTION helm_private.golf_round_live_refresh(p_round_id uuid, p_quiet boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp SET lock_timeout = '200ms' AS $$
DECLARE
  r          public.golf_rounds%ROWTYPE;
  v_prev     public.golf_round_live%ROWTYPE;
  v_has_prev boolean;
  v_new      public.golf_round_live%ROWTYPE;
  v_now      timestamptz := clock_timestamp();
  v_type     text;
  v_tracked  boolean := false;
  v_share    text;
  v_pref     text;
  v_next     text;
  v_rows     int;
  v_holes    jsonb;
  v_changed  jsonb;
  v_late     boolean;
  v_thru     int;
  v_to_par   int;
  v_strokes  int;
  v_last     timestamptz;
  v_planned  int;
  v_start    int;
  v_phase    text;
  v_visible  boolean;
  v_emit     boolean;
  v_window   timestamptz;
  v_count    int;
BEGIN
  SELECT * INTO r FROM public.golf_rounds WHERE id = p_round_id;
  IF NOT FOUND THEN
    RETURN; -- deleted; the live row cascaded and golf_rounds_round_live_gone already sent 'gone'
  END IF;

  -- NOWAIT: if another transaction holds the live row (a set_share, or another refresh), give up at once. The next save heals it.
  SELECT * INTO v_prev FROM public.golf_round_live WHERE round_id = p_round_id FOR UPDATE NOWAIT;
  v_has_prev := FOUND;

  v_type := helm_private.golf_round_live_type(r.round_type);

  -- A tournament round that a tournament already tracks is shown by the tournament's own live view (open call b, version 2:
  -- exclude). Dynamic SQL, so this compiles before the tournaments migration exists; without the table nothing is tracked.
  IF v_type = 'tournament' AND to_regclass('public.golf_tournament_player_rounds') IS NOT NULL THEN
    EXECUTE 'select exists (select 1 from public.golf_tournament_player_rounds where round_id = $1)' INTO v_tracked USING p_round_id;
  END IF;

  -- No team, or tracked by a tournament: nothing to show. If it had a lane, hide it and drop the row.
  -- (Moving a round to another team or taking the player off the team cannot happen while it is in progress:
  -- guard_golf_round_lifecycle refuses identity changes and the stranding guards refuse the deletes.)
  IF r.team_id IS NULL OR v_tracked THEN
    IF v_has_prev THEN
      v_new := v_prev;
      v_new.seq := nextval('public.golf_round_live_seq');
      v_new.share := 'off';               -- visible nowhere now, so emit sends only 'hide'
      IF NOT p_quiet THEN
        PERFORM helm_private.golf_round_live_emit(v_new, v_prev.team_id, v_prev.share, '[]'::jsonb, false);
      END IF;
      DELETE FROM public.golf_round_live WHERE round_id = p_round_id;
    END IF;
    RETURN;
  END IF;

  -- Only rounds that are in progress, recent (today or yesterday in the team's zone) and not test data get a new row.
  -- An ended round keeps its row until swept.
  IF NOT v_has_prev AND (r.status IS DISTINCT FROM 'in_progress' OR r.round_date < helm_private.golf_team_today(r.team_id) - 1) THEN
    RETURN;
  END IF;

  -- The non-atomic submit path (golf-action-shared) deletes the hole rows and inserts them in separate requests, so a
  -- refresh can see a round with no hole rows between the two. Keep what the row had; only record that the phone was heard.
  SELECT count(*) INTO v_rows FROM public.golf_holes WHERE round_id = p_round_id;
  IF v_has_prev AND v_rows = 0 AND v_prev.thru > 0 AND r.status = 'in_progress' THEN
    IF v_prev.heard_at < v_now - interval '60 seconds' THEN
      UPDATE public.golf_round_live SET heard_at = v_now WHERE round_id = p_round_id;
    END IF;
    RETURN;
  END IF;

  v_planned := CASE WHEN r.holes_played = 9 THEN 9 ELSE 18 END;
  v_start := CASE WHEN (r.draft_data->>'startHole') ~ '^[0-9]{1,2}$'
                  THEN least(greatest((r.draft_data->>'startHole')::int, 1), v_planned) ELSE 1 END;

  -- Sharing: the row's own level once it exists (floored if the type changed). At creation: the choice made in round
  -- setup (prefs.next_share, if it was set within 30 minutes before the round was created), else the player's practice
  -- default, else off. A qualifier or tournament round gets the floor, coaches.
  IF v_has_prev THEN
    v_share := helm_private.golf_round_live_floor(v_type, v_prev.share);
  ELSE
    SELECT p.practice_share,
           CASE WHEN p.next_share IS NOT NULL AND p.next_share_at >= coalesce(r.created_at, v_now) - interval '30 minutes'
                THEN p.next_share END
      INTO v_pref, v_next
      FROM public.golf_round_live_prefs p
     WHERE p.player_id = r.player_id;
    v_share := helm_private.golf_round_live_floor(v_type, coalesce(v_next, v_pref, 'off'));
  END IF;

  -- Merge the hole plan (draft_data.holes) with scored holes; keep each hole's time while its score is unchanged.
  -- A hole's time is the server's receive time, stamped when it first gains a score or its score changes.
  WITH plan AS (
    SELECT (e->>'number')::int AS n,
           CASE WHEN (e->>'par') ~ '^[0-9]$' THEN (e->>'par')::int END AS p,
           CASE WHEN (e->>'yardage') ~ '^[0-9]{1,4}$' AND (e->>'yardage')::int > 0 THEN (e->>'yardage')::int END AS y
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.draft_data->'holes') = 'array'
                                     THEN r.draft_data->'holes' ELSE '[]'::jsonb END) e
     WHERE (e->>'number') ~ '^[0-9]{1,2}$'
  ), scored AS (
    SELECT h.hole_number AS n, h.par AS p, nullif(h.yardage, 0) AS y, CASE WHEN h.score > 0 THEN h.score END AS s
      FROM public.golf_holes h
     WHERE h.round_id = p_round_id
  ), merged AS (
    SELECT coalesce(s.n, pl.n) AS n, coalesce(s.p, pl.p) AS p, coalesce(s.y, pl.y) AS y, s.s
      FROM plan pl FULL JOIN scored s ON s.n = pl.n
     WHERE coalesce(s.n, pl.n) BETWEEN 1 AND 18
  ), prev AS (
    SELECT (e->>'n')::int AS n, (e->>'s')::int AS s, (e->>'at')::timestamptz AS at
      FROM jsonb_array_elements(CASE WHEN v_has_prev THEN v_prev.holes ELSE '[]'::jsonb END) e
  ), stamped AS (
    SELECT m.n, m.p, m.y, m.s,
           CASE
             WHEN m.s IS NULL THEN NULL
             WHEN pv.s IS NOT DISTINCT FROM m.s AND pv.at IS NOT NULL THEN pv.at
             ELSE v_now
           END AS at,
           (m.s IS NOT NULL AND pv.s IS DISTINCT FROM m.s) OR (m.s IS NULL AND pv.s IS NOT NULL) AS changed,
           (m.s IS NOT NULL AND pv.s IS NULL) AS gained
      FROM merged m
      LEFT JOIN prev pv ON pv.n = m.n
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'p', p, 'y', y, 's', s, 'at', at) ORDER BY n), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('n', n, 'p', p, 'y', y, 's', s, 'at', at) ORDER BY n) FILTER (WHERE changed), '[]'::jsonb),
         -- Late: two or more holes gained a score in this one commit (a phone that came back online).
         coalesce(count(*) FILTER (WHERE gained) >= 2, false),
         count(*) FILTER (WHERE s IS NOT NULL),
         sum(s - p) FILTER (WHERE s IS NOT NULL AND p IS NOT NULL),
         sum(s) FILTER (WHERE s IS NOT NULL),
         max(at)
    INTO v_holes, v_changed, v_late, v_thru, v_to_par, v_strokes, v_last
    FROM stamped;

  v_phase := CASE
    WHEN r.status = 'completed' THEN 'posted'
    WHEN r.status = 'abandoned' THEN 'stopped'
    WHEN v_thru >= v_planned THEN 'finished'
    ELSE 'on_course'
  END;

  v_visible := NOT v_has_prev
    OR v_prev.holes IS DISTINCT FROM v_holes
    OR v_prev.phase IS DISTINCT FROM v_phase
    OR v_prev.share IS DISTINCT FROM v_share
    OR v_prev.team_id IS DISTINCT FROM r.team_id
    OR v_prev.round_type IS DISTINCT FROM v_type
    OR v_prev.qualifier_id IS DISTINCT FROM r.qualifier_id
    OR v_prev.qualifier_round IS DISTINCT FROM r.qualifier_round_number
    OR v_prev.current_hole IS DISTINCT FROM (CASE WHEN r.current_hole BETWEEN 1 AND 18 THEN r.current_hole END)
    OR v_prev.holes_planned IS DISTINCT FROM v_planned
    OR v_prev.start_position IS DISTINCT FROM v_start
    OR v_prev.course_name IS DISTINCT FROM r.course_name;

  IF NOT v_visible THEN
    -- Heartbeat only: record that the phone was heard, at most once a minute, and send nothing.
    IF v_prev.heard_at < v_now - interval '60 seconds' THEN
      UPDATE public.golf_round_live SET heard_at = v_now WHERE round_id = p_round_id;
    END IF;
    RETURN;
  END IF;

  -- Rate limit: at most 120 broadcasts per round per 10 minutes. The row still updates; clients catch up on refetch.
  v_window := CASE WHEN v_has_prev AND v_prev.emit_window_at > v_now - interval '10 minutes' THEN v_prev.emit_window_at ELSE v_now END;
  v_count  := CASE WHEN v_window = v_now THEN 1 ELSE v_prev.emit_count + 1 END;
  v_emit   := NOT p_quiet AND v_count <= 120;

  INSERT INTO public.golf_round_live AS l (
    round_id, team_id, player_id, round_type, qualifier_id, qualifier_round, round_date, course_id, course_name,
    holes_planned, start_position, current_hole, share, phase, thru, to_par, strokes, holes, last_hole_at,
    heard_at, is_test, seq, emit_window_at, emit_count, started_at, ended_at, updated_at)
  VALUES (
    r.id, r.team_id, r.player_id, v_type, r.qualifier_id, r.qualifier_round_number, r.round_date, r.course_id, r.course_name,
    v_planned, v_start, CASE WHEN r.current_hole BETWEEN 1 AND 18 THEN r.current_hole END, v_share, v_phase, v_thru, v_to_par, v_strokes, v_holes, v_last,
    v_now, coalesce(r.is_test, false), nextval('public.golf_round_live_seq'), v_window, v_count,
    coalesce(r.created_at, v_now), CASE WHEN v_phase IN ('posted', 'stopped') THEN v_now END, v_now)
  ON CONFLICT (round_id) DO UPDATE SET
    team_id = excluded.team_id, player_id = excluded.player_id, round_type = excluded.round_type,
    qualifier_id = excluded.qualifier_id, qualifier_round = excluded.qualifier_round, round_date = excluded.round_date,
    course_id = excluded.course_id, course_name = excluded.course_name, holes_planned = excluded.holes_planned,
    start_position = excluded.start_position, current_hole = excluded.current_hole, share = excluded.share,
    phase = excluded.phase, thru = excluded.thru, to_par = excluded.to_par, strokes = excluded.strokes,
    holes = excluded.holes, last_hole_at = excluded.last_hole_at, heard_at = excluded.heard_at,
    is_test = excluded.is_test, seq = excluded.seq, emit_window_at = excluded.emit_window_at,
    emit_count = excluded.emit_count,
    ended_at = CASE WHEN excluded.phase IN ('posted', 'stopped') THEN coalesce(l.ended_at, excluded.ended_at) END,
    updated_at = excluded.updated_at
  RETURNING * INTO v_new;

  -- A setup choice applies to ONE round: once this round's row exists with it, clear it. This runs in the same
  -- subtransaction as the insert (the touch handler's block), so a refresh that fails and is caught rolls both back.
  IF NOT v_has_prev AND v_next IS NOT NULL THEN
    UPDATE public.golf_round_live_prefs SET next_share = NULL, next_share_at = NULL, updated_at = v_now
     WHERE player_id = r.player_id;
  END IF;

  IF v_emit THEN
    PERFORM helm_private.golf_round_live_emit(
      v_new,
      CASE WHEN v_has_prev THEN v_prev.team_id END,
      CASE WHEN v_has_prev THEN v_prev.share END,
      v_changed, v_late);
  END IF;
END $$;

-- 4. Touch (dedupe per round per commit; never fails the caller) -----------------------------------------------------
CREATE OR REPLACE FUNCTION helm_private.golf_round_live_touch(p_round_id uuid)
RETURNS void LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_key  text;
  v_done text;
BEGIN
  IF p_round_id IS NULL OR current_setting('helm.round_live_off', true) = 'on' THEN
    RETURN;
  END IF;
  -- Deferred events of one commit share the COMMIT statement's timestamp, so this runs once per round per commit.
  v_key := p_round_id::text || '@' || extract(epoch FROM statement_timestamp())::text;
  v_done := coalesce(current_setting('helm.round_live_done', true), '');
  IF strpos(v_done, v_key) > 0 THEN
    RETURN;
  END IF;
  PERFORM set_config('helm.round_live_done', right(v_done, 4000) || ',' || v_key, true);
  BEGIN
    PERFORM helm_private.golf_round_live_refresh(p_round_id, false);
  EXCEPTION
    WHEN lock_not_available THEN
      -- The live row (or another lock) was busy. The save goes on; the next save heals the row.
      RAISE WARNING 'golf_round_live refresh skipped for round % (lock busy): % (%)', p_round_id, SQLERRM, SQLSTATE;
    WHEN OTHERS THEN
      RAISE WARNING 'golf_round_live refresh failed for round %: % (%)', p_round_id, SQLERRM, SQLSTATE;
  END;
END $$;

CREATE OR REPLACE FUNCTION helm_private.golf_holes_round_live()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM helm_private.golf_round_live_touch(OLD.round_id);
  ELSE
    PERFORM helm_private.golf_round_live_touch(NEW.round_id);
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION helm_private.golf_rounds_round_live()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM helm_private.golf_round_live_touch(NEW.id);
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION helm_private.golf_rounds_round_live_gone()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  l public.golf_round_live%ROWTYPE;
  v_msg jsonb;
BEGIN
  BEGIN
    SELECT * INTO l FROM public.golf_round_live WHERE round_id = OLD.id;
    IF FOUND AND NOT l.is_test THEN
      v_msg := jsonb_build_object('v', 1, 'k', 'gone', 'r', l.round_id, 'seq', nextval('public.golf_round_live_seq'));
      IF l.share IN ('coaches', 'team') THEN
        PERFORM helm_private.golf_live_broadcast('golf-live:coach:' || l.team_id, 'gone', v_msg);
      END IF;
      IF l.share = 'team' THEN
        PERFORM helm_private.golf_live_broadcast('golf-live:team:' || l.team_id, 'gone', v_msg);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'golf_round_live gone failed for round %: %', OLD.id, SQLERRM;
  END;
  RETURN OLD;
END $$;

-- 5. Triggers (guarded) -----------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'golf_holes_round_live' AND tgrelid = 'public.golf_holes'::regclass) THEN
    CREATE CONSTRAINT TRIGGER golf_holes_round_live
      AFTER INSERT OR DELETE OR UPDATE OF score, par ON public.golf_holes
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION helm_private.golf_holes_round_live();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'golf_rounds_round_live_ins' AND tgrelid = 'public.golf_rounds'::regclass) THEN
    CREATE CONSTRAINT TRIGGER golf_rounds_round_live_ins
      AFTER INSERT ON public.golf_rounds
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      WHEN (NEW.team_id IS NOT NULL AND NEW.status = 'in_progress')
      EXECUTE FUNCTION helm_private.golf_rounds_round_live();
  END IF;

  -- Not fired by recompute_golf_round_totals (it sets total_* only), so the 37-updates-per-save storm stays out.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'golf_rounds_round_live_upd' AND tgrelid = 'public.golf_rounds'::regclass) THEN
    CREATE CONSTRAINT TRIGGER golf_rounds_round_live_upd
      AFTER UPDATE OF status, round_type, qualifier_id, qualifier_round_number, current_hole, holes_played, team_id,
                      course_name, draft_data
      ON public.golf_rounds
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      WHEN (OLD.status IS DISTINCT FROM NEW.status
         OR OLD.round_type IS DISTINCT FROM NEW.round_type
         OR OLD.qualifier_id IS DISTINCT FROM NEW.qualifier_id
         OR OLD.qualifier_round_number IS DISTINCT FROM NEW.qualifier_round_number
         OR OLD.current_hole IS DISTINCT FROM NEW.current_hole
         OR OLD.holes_played IS DISTINCT FROM NEW.holes_played
         OR OLD.team_id IS DISTINCT FROM NEW.team_id
         OR OLD.course_name IS DISTINCT FROM NEW.course_name
         OR OLD.draft_data->'holes' IS DISTINCT FROM NEW.draft_data->'holes'
         OR OLD.draft_data->'startHole' IS DISTINCT FROM NEW.draft_data->'startHole')
      EXECUTE FUNCTION helm_private.golf_rounds_round_live();
  END IF;

  -- Fires after golf_rounds_guard_lifecycle: same-timing triggers fire in name order and 'guard' sorts before 'round'.
  -- If the guard refuses the delete, the transaction aborts and the 'gone' broadcast rolls back with it.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'golf_rounds_round_live_gone' AND tgrelid = 'public.golf_rounds'::regclass) THEN
    CREATE TRIGGER golf_rounds_round_live_gone
      BEFORE DELETE ON public.golf_rounds
      FOR EACH ROW
      WHEN (OLD.status = 'in_progress')
      EXECUTE FUNCTION helm_private.golf_rounds_round_live_gone();
  END IF;
END $$;

-- 6. The player's writes: sharing --------------------------------------------------------------------------------------
-- Locks the round first (FOR KEY SHARE, the same lock order as a save, so the two cannot deadlock), then the live row.
-- Either lock giving up within 2 s returns 'busy'; the client retries once after a second.
CREATE OR REPLACE FUNCTION public.golf_round_live_set_share(p_round_id uuid, p_share text, p_remember boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp SET lock_timeout = '2s' AS $$
DECLARE
  r      public.golf_rounds%ROWTYPE;
  v_prev public.golf_round_live%ROWTYPE;
  v_new  public.golf_round_live%ROWTYPE;
  v_share text;
BEGIN
  IF p_share IS NULL OR p_share NOT IN ('off', 'coaches', 'team') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_share');
  END IF;

  BEGIN
    SELECT gr.* INTO r
      FROM public.golf_rounds gr
      JOIN public.golf_players gp ON gp.id = gr.player_id AND gp.user_id = auth.uid()
     WHERE gr.id = p_round_id
       FOR KEY SHARE OF gr;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_found');
    END IF;
    IF r.status IS DISTINCT FROM 'in_progress' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_in_progress');
    END IF;
    IF r.team_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'no_team');
    END IF;

    PERFORM helm_private.golf_round_live_refresh(p_round_id, false); -- creates the row if it is missing
    SELECT * INTO v_prev FROM public.golf_round_live WHERE round_id = p_round_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_live');
    END IF;

    v_share := helm_private.golf_round_live_floor(v_prev.round_type, p_share);

    IF v_share IS DISTINCT FROM v_prev.share THEN
      IF v_prev.share_changes >= 30 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'too_many_changes', 'share', v_prev.share);
      END IF;
      UPDATE public.golf_round_live
         SET share = v_share, share_changes = share_changes + 1,
             seq = nextval('public.golf_round_live_seq'), updated_at = now()
       WHERE round_id = p_round_id
       RETURNING * INTO v_new;
      PERFORM helm_private.golf_round_live_emit(v_new, v_prev.team_id, v_prev.share, '[]'::jsonb, false);
    ELSE
      v_new := v_prev;
    END IF;

    IF p_remember AND v_new.round_type = 'practice' THEN
      INSERT INTO public.golf_round_live_prefs AS p (player_id, practice_share, updated_at)
      VALUES (r.player_id, v_share, now())
      ON CONFLICT (player_id) DO UPDATE SET practice_share = excluded.practice_share, updated_at = now();
    END IF;

    RETURN jsonb_build_object('ok', true, 'share', v_new.share, 'seq', v_new.seq, 'clamped', v_share IS DISTINCT FROM p_share);
  EXCEPTION WHEN lock_not_available THEN
    RETURN jsonb_build_object('ok', false, 'error', 'busy');
  END;
END $$;

-- Round setup: the choice for the round that is about to be created. The setup form and its payload are unchanged; the
-- field calls this when it first appears and on every change, and the refresh adopts the value when it creates that
-- round's row (within 30 minutes) and clears it. p_remember also sets the practice default.
CREATE OR REPLACE FUNCTION public.golf_round_live_set_next_share(p_share text, p_remember boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_player uuid;
BEGIN
  IF p_share IS NULL OR p_share NOT IN ('off', 'coaches', 'team') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_share');
  END IF;
  SELECT gp.id INTO v_player FROM public.golf_players gp WHERE gp.user_id = auth.uid();
  IF v_player IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  INSERT INTO public.golf_round_live_prefs AS p (player_id, practice_share, next_share, next_share_at, updated_at)
  VALUES (v_player, CASE WHEN p_remember THEN p_share ELSE 'off' END, p_share, now(), now())
  ON CONFLICT (player_id) DO UPDATE SET
    next_share = excluded.next_share,
    next_share_at = excluded.next_share_at,
    practice_share = CASE WHEN p_remember THEN excluded.practice_share ELSE p.practice_share END,
    updated_at = now();

  RETURN jsonb_build_object('ok', true, 'share', p_share);
END $$;

-- 7. Policy helper: is the viewer on the course right now (Rule 4.3a, D-85) ---------------------------------------------
-- Four hours on purpose: this is a privacy gate (a player on the course sees no teammates), so a phone that lost signal
-- must not open teammates' practice lanes after ten minutes. The 10-minute "on the course" rule other plans read is
-- laneFreshness / isOnCourse in src/clubhouse/live/model.ts; do not reuse this helper for it.
CREATE OR REPLACE FUNCTION public.golf_live_viewer_on_course(p_team uuid)
RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.golf_round_live l
      JOIN public.golf_players gp ON gp.id = l.player_id
     WHERE gp.user_id = auth.uid()
       AND l.team_id = p_team
       AND l.phase IN ('on_course', 'finished')
       AND l.heard_at > now() - interval '4 hours'
  );
$$;

-- 8. RLS --------------------------------------------------------------------------------------------------------------

DROP POLICY IF EXISTS golf_round_live_select_own ON public.golf_round_live;
CREATE POLICY golf_round_live_select_own ON public.golf_round_live
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.golf_players gp
                  WHERE gp.id = golf_round_live.player_id AND gp.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS golf_round_live_select_coach ON public.golf_round_live;
CREATE POLICY golf_round_live_select_coach ON public.golf_round_live
  FOR SELECT TO authenticated
  USING (NOT is_test AND share IN ('coaches', 'team') AND public.is_golf_team_coach(team_id));

DROP POLICY IF EXISTS golf_round_live_select_team ON public.golf_round_live;
CREATE POLICY golf_round_live_select_team ON public.golf_round_live
  FOR SELECT TO authenticated
  USING (NOT is_test AND share = 'team' AND round_type = 'practice'
         AND public.is_golf_team_player(team_id)
         AND NOT public.golf_live_viewer_on_course(team_id));

DROP POLICY IF EXISTS golf_round_live_prefs_select_own ON public.golf_round_live_prefs;
CREATE POLICY golf_round_live_prefs_select_own ON public.golf_round_live_prefs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.golf_players gp
                  WHERE gp.id = golf_round_live_prefs.player_id AND gp.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS golf_round_live_prefs_insert_own ON public.golf_round_live_prefs;
CREATE POLICY golf_round_live_prefs_insert_own ON public.golf_round_live_prefs
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.golf_players gp
                       WHERE gp.id = golf_round_live_prefs.player_id AND gp.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS golf_round_live_prefs_update_own ON public.golf_round_live_prefs;
CREATE POLICY golf_round_live_prefs_update_own ON public.golf_round_live_prefs
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.golf_players gp
                  WHERE gp.id = golf_round_live_prefs.player_id AND gp.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.golf_players gp
                       WHERE gp.id = golf_round_live_prefs.player_id AND gp.user_id = (SELECT auth.uid())));

-- 9. Grants -----------------------------------------------------------------------------------------------------------
REVOKE ALL ON public.golf_round_live FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.golf_round_live_prefs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.golf_round_live_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.golf_round_live TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.golf_round_live_prefs TO authenticated;
GRANT ALL ON public.golf_round_live, public.golf_round_live_prefs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.golf_round_live_seq TO service_role;

REVOKE ALL ON FUNCTION public.golf_round_live_set_share(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golf_round_live_set_share(uuid, text, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.golf_round_live_set_next_share(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golf_round_live_set_next_share(text, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.golf_live_viewer_on_course(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golf_live_viewer_on_course(uuid) TO authenticated, service_role;
-- helm_private functions get no grants: helm_private is closed to anon and authenticated (20260825052141), and
-- trigger functions are not EXECUTE-checked at fire time. Revoke the default PUBLIC execute anyway.
REVOKE ALL ON FUNCTION helm_private.golf_round_live_refresh(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION helm_private.golf_round_live_touch(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION helm_private.golf_round_live_emit(public.golf_round_live, uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION helm_private.golf_live_broadcast(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION helm_private.golf_holes_round_live() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION helm_private.golf_rounds_round_live() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION helm_private.golf_rounds_round_live_gone() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION helm_private.golf_team_today(uuid) FROM PUBLIC, anon, authenticated;

-- 10. Indexes ---------------------------------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS golf_round_live_team_date_idx ON public.golf_round_live (team_id, round_date DESC);
CREATE INDEX IF NOT EXISTS golf_round_live_player_idx ON public.golf_round_live (player_id);
CREATE INDEX IF NOT EXISTS golf_round_live_qualifier_idx ON public.golf_round_live (qualifier_id) WHERE qualifier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS golf_round_live_course_date_idx ON public.golf_round_live (course_id, round_date) WHERE course_id IS NOT NULL;

-- 11. Backfill (quiet: rows only, no broadcasts) -------------------------------------------------------------------------
-- Today's and yesterday's in-progress team rounds, by each team's own calendar. A round whose refresh fails is skipped with
-- a warning (the next save creates its row); one bad round never fails the migration.
DO $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT gr.id FROM public.golf_rounds gr
     WHERE gr.status = 'in_progress' AND gr.team_id IS NOT NULL
       AND coalesce(gr.is_test, false) = false
       AND gr.round_date >= helm_private.golf_team_today(gr.team_id) - 1
  LOOP
    BEGIN
      PERFORM helm_private.golf_round_live_refresh(v_id, true);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'golf_round_live backfill skipped round %: % (%)', v_id, SQLERRM, SQLSTATE;
    END;
  END LOOP;
END $$;
