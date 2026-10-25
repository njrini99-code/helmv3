-- STATUS: WRITTEN — HOLD — NOT APPLIED
-- P-5 Tournaments created from the calendar (handoff 4.34.5; build plan
-- P-05-tournaments-from-calendar, with the 2026-10-25 changelog applied).
-- Apply: npm run db:apply -- supabase/migrations/20261025040000_golf_tournament_from_calendar.sql
-- Transaction: apply.mjs wraps this file in one transaction, so it has no BEGIN/COMMIT of its own.
-- Requires: 4.33's 20261024100000 (tables) and 20261024100100 (RLS) applied first; the DO block refuses
--   otherwise. 20261024100200 (golf_tournament_set_entries) and 20261024100300 (golf_tournament_tee_sheet)
--   are optional: entries and the tee-time shift are looked up at call time and used through EXECUTE.
-- Risk: low. Two nullable columns on 4.33's new tables, one partial unique index, one team-zone helper, four
--   SECURITY INVOKER RPCs, and one BEFORE UPDATE trigger on golf_events that only fires for a tournament event's
--   type, team, series, status, title, location or course columns.
-- Why: one save from the calendar editor makes a tracked tournament with one golf_events row per round, atomically.
--
-- VERIFY: select 1 where exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'golf_tournaments' and column_name = 'request_id');
-- VERIFY: select 1 where exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'golf_tournaments_request_id_uq');
-- VERIFY: select 1 where exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'golf_tournament_rounds' and column_name = 'course_label');
-- VERIFY: select 1 where to_regprocedure('public.golf_team_timezone(uuid)') is not null;
-- VERIFY: select 1 where to_regprocedure('public.golf_tournament_create_from_calendar(jsonb)') is not null;
-- VERIFY: select 1 where to_regprocedure('public.golf_tournament_update_round(uuid, jsonb, integer)') is not null;
-- VERIFY: select 1 where to_regprocedure('public.golf_tournament_set_cancelled(uuid, uuid, boolean, text, integer)') is not null;
-- VERIFY: select 1 where to_regprocedure('public.golf_tournament_untrack(uuid, integer)') is not null;
-- VERIFY: select 1 where exists (select 1 from pg_trigger where tgname = 'golf_events_tournament_round_guard' and not tgisinternal);
-- VERIFY: select 1 where not has_function_privilege('anon', 'public.golf_tournament_create_from_calendar(jsonb)', 'EXECUTE');
-- VERIFY: select 1 where not has_function_privilege('anon', 'public.golf_tournament_update_round(uuid, jsonb, integer)', 'EXECUTE');
-- VERIFY: select 1 where not has_function_privilege('anon', 'public.golf_tournament_set_cancelled(uuid, uuid, boolean, text, integer)', 'EXECUTE');
-- VERIFY: select 1 where not has_function_privilege('anon', 'public.golf_tournament_untrack(uuid, integer)', 'EXECUTE');
-- VERIFY: select 1 where not has_function_privilege('anon', 'public.golf_team_timezone(uuid)', 'EXECUTE');
-- ROLLBACK: DROP TRIGGER IF EXISTS golf_events_tournament_round_guard ON public.golf_events;
-- ROLLBACK: DROP FUNCTION IF EXISTS helm_private.guard_tournament_round_event();
-- ROLLBACK: DROP FUNCTION IF EXISTS public.golf_tournament_untrack(uuid, integer);
-- ROLLBACK: DROP FUNCTION IF EXISTS public.golf_tournament_set_cancelled(uuid, uuid, boolean, text, integer);
-- ROLLBACK: DROP FUNCTION IF EXISTS public.golf_tournament_update_round(uuid, jsonb, integer);
-- ROLLBACK: DROP FUNCTION IF EXISTS public.golf_tournament_create_from_calendar(jsonb);
-- ROLLBACK: DROP FUNCTION IF EXISTS public.golf_team_timezone(uuid);
-- ROLLBACK: DROP INDEX IF EXISTS public.golf_tournaments_request_id_uq;
-- ROLLBACK: ALTER TABLE public.golf_tournament_rounds DROP COLUMN IF EXISTS course_label;
-- ROLLBACK: ALTER TABLE public.golf_tournaments DROP COLUMN IF EXISTS request_id;

SET lock_timeout = '3s';

-- 0. Refuse to run before 4.33's tables and RLS exist. 100200 and 100300 are not required (see the header).
DO $$
BEGIN
  IF to_regclass('public.golf_tournaments') IS NULL
     OR to_regclass('public.golf_tournament_rounds') IS NULL
     OR to_regclass('public.golf_tournament_player_rounds') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261024100000 (4.33 tournaments tables) before 20261025040000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.golf_tournaments'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'Apply 20261024100100 (4.33 tournaments RLS) before 20261025040000';
  END IF;
END $$;

-- 1. Idempotency key for a create from the calendar editor (the editor's requestIdFor uuid).
ALTER TABLE public.golf_tournaments ADD COLUMN IF NOT EXISTS request_id uuid;
-- golf_tournaments is 4.33's new, small table, and CONCURRENTLY cannot run inside apply.mjs's transaction.
-- squawk-ignore require-concurrent-index-creation
CREATE UNIQUE INDEX IF NOT EXISTS golf_tournaments_request_id_uq
  ON public.golf_tournaments (request_id) WHERE request_id IS NOT NULL;

-- 2. A course typed by hand when the library has no row for it (owner call 5). Shown as the round's location.
ALTER TABLE public.golf_tournament_rounds ADD COLUMN IF NOT EXISTS course_label text
  CONSTRAINT golf_tournament_rounds_course_label_len CHECK (course_label IS NULL OR char_length(course_label) BETWEEN 1 AND 120);

-- 3. The team's clock, as the calendar loader reads it (golf_team_settings.timezone through getValidTimezone,
--    src/lib/calendar/timezone.ts): NULL, empty or an unknown zone falls back to America/New_York. Validated by
--    trying the zone, not by reading pg_timezone_names (that view expands the whole zone list on every call).
CREATE OR REPLACE FUNCTION public.golf_team_timezone(p_team_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_tz text;
BEGIN
  SELECT btrim(s.timezone) INTO v_tz FROM public.golf_team_settings s WHERE s.team_id = p_team_id LIMIT 1;
  IF v_tz IS NULL OR v_tz = '' THEN
    RETURN 'America/New_York';
  END IF;
  BEGIN
    PERFORM now() AT TIME ZONE v_tz;
  EXCEPTION WHEN invalid_parameter_value THEN
    RETURN 'America/New_York';
  END;
  RETURN v_tz;
END
$fn$;

-- 4. Create a tournament from the calendar editor, in one transaction.
--    p = {
--      team_id, request_id, name, from_event_id?,           -- from_event_id: adopt this event as R1 (keeps id, RSVPs, files)
--      course_id?, course_label?, format, players_per_team?, counting?, holes_per_round?, event_kind?,
--      field_size?, host?, results_url?,
--      rounds: [{ date, start_at, end_at?, all_day, start_type?, course_id?, course_label?, tee_id?, event_id? }],
--      event: { description?, requires_rsvp?, rsvp_deadline?, attendee_ids? },
--      qualifier_id?, itinerary_id?, entries?               -- entries in golf_tournament_set_entries' shape
--    }
--    Returns { tournament_id, version, replayed, rounds: [{ round_number, event_id }] }.
--
--    Round order key (one rule for the editor, the drag, these RPCs and 040100's trigger): a timed round keys at its
--    local wall time in the team's zone; an untimed (all-day) round keys at the very end of its day,
--    ((start AT TIME ZONE 'UTC')::date + 1)::timestamp - 1 microsecond, so it sorts after that day's timed rounds.
--    Equal keys pass only for two untimed rounds (a 36-hole day with no times yet).
CREATE OR REPLACE FUNCTION public.golf_tournament_create_from_calendar(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_uid         uuid := (SELECT auth.uid());
  v_team        uuid := NULLIF(p->>'team_id', '')::uuid;
  v_request     uuid := NULLIF(p->>'request_id', '')::uuid;
  v_from        uuid := NULLIF(p->>'from_event_id', '')::uuid;
  v_name        text := btrim(COALESCE(p->>'name', ''));
  v_rounds      jsonb := p->'rounds';
  v_holes       smallint := COALESCE(NULLIF(p->>'holes_per_round', '')::smallint, 18);
  v_format      text := COALESCE(NULLIF(p->>'format', ''), '5c4');
  v_entries_fn  regprocedure := to_regprocedure('public.golf_tournament_set_entries(uuid, jsonb, integer)');
  v_has_entries boolean := jsonb_typeof(p->'entries') = 'array' AND jsonb_array_length(p->'entries') > 0;
  v_qualifier   uuid := NULLIF(p->>'qualifier_id', '')::uuid;
  v_itinerary   uuid := NULLIF(p->>'itinerary_id', '')::uuid;
  v_q_target    uuid;
  v_t_event     uuid;
  v_n           int;
  v_tz          text;
  v_coach       uuid;
  v_tid         uuid;
  v_version     int;
  v_existing    public.golf_tournaments%ROWTYPE;
  v_from_row    public.golf_events%ROWTYPE;
  v_r           jsonb;
  v_i           int;
  v_start       timestamptz;
  v_end         timestamptz;
  v_all_day     boolean;
  v_key         timestamp;
  v_prev_key    timestamp;
  v_prev_allday boolean;
  v_day         date;
  v_min_date    date;
  v_max_date    date;
  v_adopt       uuid;
  v_event       uuid;
  v_r1          uuid;
  v_course      uuid;
  v_label       text;
  v_loc         text;
  v_desc        text;
  v_rsvp        boolean;
  v_deadline    timestamptz;
  v_attendees   uuid[];
  v_ppt         smallint;
  v_count       smallint;
  v_out         jsonb := '[]'::jsonb;
BEGIN
  IF v_team IS NULL OR v_request IS NULL THEN
    RAISE EXCEPTION 'bad_input' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_golf_team_coach(v_team) THEN
    RAISE EXCEPTION 'not_coach' USING ERRCODE = '42501';
  END IF;

  -- 4a. Replay: the same request returns what it made the first time, and writes nothing.
  --     Invoker rights hide another team's row, so a replay of another team's id finds nothing here and loses on the
  --     unique index instead (23505).
  SELECT * INTO v_existing FROM public.golf_tournaments WHERE request_id = v_request;
  IF FOUND THEN
    IF v_existing.team_id <> v_team OR v_existing.created_by IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'request_conflict' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object(
      'tournament_id', v_existing.id,
      'version', v_existing.version,
      'replayed', true,
      'rounds', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('round_number', r.round_number, 'event_id', r.round_event_id)
                         ORDER BY r.round_number)
        FROM public.golf_tournament_rounds r
        WHERE r.tournament_id = v_existing.id), '[]'::jsonb));
  END IF;

  -- 4b. Shape.
  IF char_length(v_name) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'bad_name' USING ERRCODE = 'P0001';
  END IF;
  IF v_rounds IS NULL OR jsonb_typeof(v_rounds) <> 'array' THEN
    RAISE EXCEPTION 'bad_input' USING ERRCODE = 'P0001';
  END IF;
  v_n := jsonb_array_length(v_rounds);
  IF v_n < 1 OR v_n > 6 THEN
    RAISE EXCEPTION 'round_count' USING ERRCODE = 'P0001';
  END IF;
  -- Entries go through 4.33's own function (100200). Until it exists the create refuses them instead of dropping them.
  IF v_has_entries AND v_entries_fn IS NULL THEN
    RAISE EXCEPTION 'entries_unavailable' USING ERRCODE = 'P0001';
  END IF;

  v_tz := public.golf_team_timezone(v_team);

  -- Counting: the named formats fix players and counting; custom and the match formats take them from p.
  v_ppt := CASE v_format WHEN '5c4' THEN 5 WHEN '6c5' THEN 6 WHEN '6c4' THEN 6
           ELSE COALESCE(NULLIF(p->>'players_per_team', '')::smallint, 5) END;
  v_count := CASE v_format WHEN '5c4' THEN 4 WHEN '6c5' THEN 5 WHEN '6c4' THEN 4
             ELSE COALESCE(NULLIF(p->>'counting', '')::smallint, LEAST(4, v_ppt)::smallint) END;

  -- 4c. The event to adopt as R1.
  IF v_from IS NOT NULL THEN
    SELECT * INTO v_from_row FROM public.golf_events WHERE id = v_from FOR UPDATE;
    IF NOT FOUND OR v_from_row.team_id <> v_team THEN
      RAISE EXCEPTION 'event_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF COALESCE(v_from_row.recurring, false) OR v_from_row.recurrence_rule IS NOT NULL
       OR v_from_row.parent_event_id IS NOT NULL THEN
      RAISE EXCEPTION 'event_is_series' USING ERRCODE = 'P0001';
    END IF;
    IF v_from_row.status = 'cancelled' THEN
      RAISE EXCEPTION 'event_cancelled' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.golf_tournament_rounds r WHERE r.round_event_id = v_from) THEN
      RAISE EXCEPTION 'already_tracked' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 4d. Validate every round before writing anything: order, dates, events to adopt.
  FOR v_r, v_i IN
    SELECT e.value, e.ord::int FROM jsonb_array_elements(v_rounds) WITH ORDINALITY AS e(value, ord) ORDER BY e.ord
  LOOP
    v_start   := NULLIF(v_r->>'start_at', '')::timestamptz;
    v_all_day := COALESCE((v_r->>'all_day')::boolean, false);
    IF v_start IS NULL THEN
      RAISE EXCEPTION 'bad_input' USING ERRCODE = 'P0001';
    END IF;
    v_key := CASE WHEN v_all_day THEN ((v_start AT TIME ZONE 'UTC')::date + 1)::timestamp - interval '1 microsecond'
                  ELSE v_start AT TIME ZONE v_tz END;
    IF v_prev_key IS NOT NULL
       AND (v_key < v_prev_key OR (v_key = v_prev_key AND NOT (v_all_day AND v_prev_allday))) THEN
      RAISE EXCEPTION 'round_order' USING ERRCODE = 'P0001';
    END IF;
    v_prev_key := v_key;
    v_prev_allday := v_all_day;
    v_day := v_key::date;
    v_min_date := LEAST(COALESCE(v_min_date, v_day), v_day);
    v_max_date := GREATEST(COALESCE(v_max_date, v_day), v_day);

    v_adopt := NULLIF(v_r->>'event_id', '')::uuid;
    IF v_adopt IS NOT NULL AND v_adopt IS DISTINCT FROM v_from THEN
      IF v_i = 1 AND v_from IS NOT NULL THEN
        RAISE EXCEPTION 'bad_input' USING ERRCODE = 'P0001';
      END IF;
      PERFORM 1 FROM public.golf_events e
       WHERE e.id = v_adopt AND e.team_id = v_team
         AND e.status IS DISTINCT FROM 'cancelled'
         AND NOT COALESCE(e.recurring, false) AND e.recurrence_rule IS NULL AND e.parent_event_id IS NULL
       FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'event_not_found' USING ERRCODE = 'P0001';
      END IF;
      IF EXISTS (SELECT 1 FROM public.golf_tournament_rounds r WHERE r.round_event_id = v_adopt) THEN
        RAISE EXCEPTION 'already_tracked' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END LOOP;

  -- 4e. Links, checked and locked before any write. A qualifier already pointing at another event is not stolen
  --     (qualifier_linked); one pointing at the event being converted stays allowed. A trip linked elsewhere is refused.
  IF v_qualifier IS NOT NULL THEN
    SELECT q.target_tournament_id INTO v_q_target
      FROM public.golf_qualifiers q
     WHERE q.id = v_qualifier AND q.team_id = v_team
       FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'qualifier_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF v_q_target IS NOT NULL AND v_q_target IS DISTINCT FROM v_from THEN
      RAISE EXCEPTION 'qualifier_linked' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF v_itinerary IS NOT NULL THEN
    SELECT ti.event_id INTO v_t_event
      FROM public.golf_travel_itineraries ti
     WHERE ti.id = v_itinerary AND ti.team_id = v_team
       FOR UPDATE;
    IF NOT FOUND OR (v_t_event IS NOT NULL AND v_t_event IS DISTINCT FROM v_from) THEN
      RAISE EXCEPTION 'trip_not_found' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 4f. The tournament row. golf_events.created_by is golf_coaches.id (FK), not auth.uid().
  SELECT c.id INTO v_coach
    FROM public.golf_coaches c
    JOIN public.golf_team_coach_staff s ON s.coach_id = c.id
   WHERE c.user_id = v_uid AND s.team_id = v_team
   LIMIT 1;

  INSERT INTO public.golf_tournaments (
    team_id, name, start_date, end_date, course_id, format, players_per_team, counting,
    holes_per_round, rounds_count, event_kind, field_size, host, results_url, created_by, request_id)
  VALUES (
    v_team, v_name, v_min_date, v_max_date, NULLIF(p->>'course_id', '')::uuid, v_format, v_ppt, v_count,
    v_holes, v_n, COALESCE(NULLIF(p->>'event_kind', ''), 'regular'),
    NULLIF(p->>'field_size', '')::smallint, NULLIF(btrim(p->>'host'), ''), NULLIF(btrim(p->>'results_url'), ''),
    v_uid, v_request)
  RETURNING id, version INTO v_tid, v_version;

  -- 4g. Who is on every round: the editor's list (active members only), else R1's own list, else the whole team.
  v_desc     := NULLIF(btrim(p->'event'->>'description'), '');
  v_rsvp     := COALESCE((p->'event'->>'requires_rsvp')::boolean, v_from_row.requires_rsvp, false);
  v_deadline := NULLIF(p->'event'->>'rsvp_deadline', '')::timestamptz;

  IF jsonb_typeof(p->'event'->'attendee_ids') = 'array' THEN
    SELECT COALESCE(array_agg(m.player_id), '{}') INTO v_attendees
      FROM public.golf_team_members m
     WHERE m.team_id = v_team AND m.status = 'active'
       AND m.player_id IN (SELECT x.id::uuid FROM jsonb_array_elements_text(p->'event'->'attendee_ids') AS x(id));
  ELSIF v_from IS NOT NULL AND EXISTS (SELECT 1 FROM public.golf_event_attendance a WHERE a.event_id = v_from) THEN
    SELECT COALESCE(array_agg(a.player_id), '{}') INTO v_attendees
      FROM public.golf_event_attendance a
      JOIN public.golf_team_members m ON m.player_id = a.player_id AND m.team_id = v_team AND m.status = 'active'
     WHERE a.event_id = v_from;
  ELSE
    SELECT COALESCE(array_agg(m.player_id), '{}') INTO v_attendees
      FROM public.golf_team_members m
     WHERE m.team_id = v_team AND m.status = 'active';
  END IF;

  -- 4h. The adopt below rewrites an existing event's title, type and course. Marked for this transaction (is_local),
  --     and deliberately not cleared, so the adopt UPDATE carries it: P-5's guard lets it through and P-14's change
  --     marks skip a convert's title-only "rename" (P-14 12.6, owner call 12.10).
  PERFORM set_config('helm.tournament_write', 'rounds', true);

  -- 4i. One golf_events row per round (adopted or new), its golf_tournament_rounds link, and its attendance.
  FOR v_r, v_i IN
    SELECT e.value, e.ord::int FROM jsonb_array_elements(v_rounds) WITH ORDINALITY AS e(value, ord) ORDER BY e.ord
  LOOP
    v_start   := (v_r->>'start_at')::timestamptz;
    v_all_day := COALESCE((v_r->>'all_day')::boolean, false);
    v_end     := NULLIF(v_r->>'end_at', '')::timestamptz;
    IF v_all_day THEN
      v_end := COALESCE(v_end, v_start);  -- the calendar's all-day convention: date T00:00Z, end = start for one day
    ELSIF v_end IS NULL THEN
      v_end := v_start + CASE WHEN v_holes = 9 THEN interval '2 hours 30 minutes' ELSE interval '5 hours' END;
    END IF;

    v_course := COALESCE(NULLIF(v_r->>'course_id', '')::uuid, NULLIF(p->>'course_id', '')::uuid);
    v_label  := NULLIF(btrim(COALESCE(v_r->>'course_label', p->>'course_label', '')), '');
    v_loc    := NULL;
    SELECT gc.name INTO v_loc FROM public.golf_courses gc WHERE gc.id = v_course;
    v_loc := COALESCE(v_loc, v_label);

    v_adopt := CASE WHEN v_i = 1 AND v_from IS NOT NULL THEN v_from
                    ELSE NULLIF(v_r->>'event_id', '')::uuid END;

    IF v_adopt IS NOT NULL THEN
      UPDATE public.golf_events SET
        title         = v_name || ' · R' || v_i,
        event_type    = 'tournament',
        start_time    = v_start,
        end_time      = v_end,
        all_day       = v_all_day,
        course_id     = v_course,
        location      = COALESCE(v_loc, location),
        description   = COALESCE(v_desc, description),
        requires_rsvp = v_rsvp,
        rsvp_deadline = COALESCE(v_deadline, rsvp_deadline),
        updated_at    = now()
      WHERE id = v_adopt;
      v_event := v_adopt;
    ELSE
      INSERT INTO public.golf_events (
        team_id, created_by, title, description, event_type, location, course_id,
        start_time, end_time, all_day, status, requires_rsvp, rsvp_deadline)
      VALUES (
        v_team, v_coach, v_name || ' · R' || v_i, v_desc, 'tournament', v_loc, v_course,
        v_start, v_end, v_all_day, 'confirmed', v_rsvp, v_deadline)
      RETURNING id INTO v_event;
    END IF;
    IF v_i = 1 THEN
      v_r1 := v_event;
    END IF;

    -- event_adopted: an adopted event is the coach's own entry, so 4.33's golf_tournament_delete keeps it.
    INSERT INTO public.golf_tournament_rounds (
      round_event_id, tournament_id, team_id, round_number, course_id, tee_id, start_type, first_tee_at,
      course_label, event_adopted)
    VALUES (
      v_event, v_tid, v_team, v_i, v_course, NULLIF(v_r->>'tee_id', '')::uuid,
      COALESCE(NULLIF(v_r->>'start_type', ''), 'tee_times'),
      CASE WHEN v_all_day THEN NULL ELSE v_start END,
      CASE WHEN v_course IS NULL THEN v_label END,
      v_adopt IS NOT NULL);

    -- Add who is missing; drop only invitations nobody answered for players taken off the list. Replies stay.
    INSERT INTO public.golf_event_attendance (event_id, player_id, status, notified_at)
    SELECT v_event, a.id, 'pending', now() FROM unnest(v_attendees) AS a(id)
    ON CONFLICT (event_id, player_id) DO NOTHING;
    DELETE FROM public.golf_event_attendance x
     WHERE x.event_id = v_event AND x.status = 'pending' AND x.rsvp_at IS NULL
       AND NOT (x.player_id = ANY (v_attendees));

    v_out := v_out || jsonb_build_array(jsonb_build_object('round_number', v_i, 'event_id', v_event));
  END LOOP;

  -- 4j. Links (checked in 4e). R1 keeps the original id on a convert, so an existing link already points at it.
  IF v_qualifier IS NOT NULL THEN
    UPDATE public.golf_qualifiers q SET target_tournament_id = v_r1 WHERE q.id = v_qualifier AND q.team_id = v_team;
  END IF;
  IF v_itinerary IS NOT NULL THEN
    UPDATE public.golf_travel_itineraries ti SET event_id = v_r1 WHERE ti.id = v_itinerary AND ti.team_id = v_team;
  END IF;

  -- 4k. Draft entries through 4.33's own function (its validation and guard apply), when it exists (checked in 4b).
  IF v_has_entries THEN
    EXECUTE 'SELECT public.golf_tournament_set_entries($1, $2, $3)' USING v_tid, p->'entries', v_version;
  END IF;

  SELECT t.version INTO v_version FROM public.golf_tournaments t WHERE t.id = v_tid;
  RETURN jsonb_build_object('tournament_id', v_tid, 'version', v_version, 'replayed', false, 'rounds', v_out);
END
$fn$;

-- 5. Edit one round from the calendar: day, time, all-day, start type, notes, RSVP, invitees; optional tee-sheet shift.
--    Returns { version, tee_times_shifted, added_player_ids }.
CREATE OR REPLACE FUNCTION public.golf_tournament_update_round(p_round_event_id uuid, p jsonb, p_expected_version int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_round     public.golf_tournament_rounds%ROWTYPE;
  v_t         public.golf_tournaments%ROWTYPE;
  v_ev        public.golf_events%ROWTYPE;
  v_tz        text;
  v_start     timestamptz;
  v_end       timestamptz;
  v_all_day   boolean;
  v_key       timestamp;
  v_delta     interval;
  v_min       date;
  v_max       date;
  v_new       int;
  v_shifted   int := 0;
  v_attendees uuid[];
  v_added     uuid[] := '{}';
BEGIN
  IF p_expected_version IS NULL OR p_round_event_id IS NULL THEN
    RAISE EXCEPTION 'bad_input' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_round FROM public.golf_tournament_rounds WHERE round_event_id = p_round_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_golf_team_coach(v_round.team_id) THEN
    RAISE EXCEPTION 'not_coach' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_t FROM public.golf_tournaments WHERE id = v_round.tournament_id FOR UPDATE;
  IF v_t.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'stale' USING ERRCODE = 'P0001';
  END IF;
  IF v_round.status <> 'upcoming' THEN
    RAISE EXCEPTION 'round_started' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_ev FROM public.golf_events WHERE id = p_round_event_id FOR UPDATE;
  v_tz := public.golf_team_timezone(v_round.team_id);

  v_start   := COALESCE(NULLIF(p->>'start_at', '')::timestamptz, v_ev.start_time);
  v_all_day := COALESCE((p->>'all_day')::boolean, v_ev.all_day, false);
  v_end     := CASE
                 WHEN p ? 'end_at' AND NULLIF(p->>'end_at', '') IS NOT NULL THEN (p->>'end_at')::timestamptz
                 WHEN v_all_day THEN v_start
                 WHEN COALESCE(v_ev.all_day, false) OR v_ev.end_time IS NULL THEN v_start + interval '5 hours'
                 ELSE v_ev.end_time + (v_start - v_ev.start_time)
               END;
  v_key := CASE WHEN v_all_day THEN ((v_start AT TIME ZONE 'UTC')::date + 1)::timestamp - interval '1 microsecond'
                ELSE v_start AT TIME ZONE v_tz END;

  -- Order against the tournament's other rounds that are not cancelled.
  IF EXISTS (
    SELECT 1
      FROM public.golf_tournament_rounds r
      JOIN public.golf_events e ON e.id = r.round_event_id
      CROSS JOIN LATERAL (
        SELECT CASE WHEN COALESCE(e.all_day, false)
                    THEN ((e.start_time AT TIME ZONE 'UTC')::date + 1)::timestamp - interval '1 microsecond'
                    ELSE e.start_time AT TIME ZONE v_tz END AS k) o
     WHERE r.tournament_id = v_round.tournament_id
       AND r.round_event_id <> p_round_event_id
       AND e.status IS DISTINCT FROM 'cancelled'
       AND ((r.round_number < v_round.round_number
             AND (o.k > v_key OR (o.k = v_key AND NOT (COALESCE(e.all_day, false) AND v_all_day))))
         OR (r.round_number > v_round.round_number
             AND (o.k < v_key OR (o.k = v_key AND NOT (COALESCE(e.all_day, false) AND v_all_day)))))
  ) THEN
    RAISE EXCEPTION 'round_order' USING ERRCODE = 'P0001';
  END IF;

  v_delta := v_start - v_ev.start_time;

  UPDATE public.golf_events SET
    start_time    = v_start,
    end_time      = v_end,
    all_day       = v_all_day,
    description   = CASE WHEN p ? 'description' THEN NULLIF(btrim(p->>'description'), '') ELSE description END,
    requires_rsvp = COALESCE((p->>'requires_rsvp')::boolean, requires_rsvp),
    rsvp_deadline = CASE WHEN p ? 'rsvp_deadline' THEN NULLIF(p->>'rsvp_deadline', '')::timestamptz ELSE rsvp_deadline END,
    updated_at    = now()
  WHERE id = p_round_event_id;

  UPDATE public.golf_tournament_rounds SET
    first_tee_at = CASE WHEN v_all_day THEN NULL ELSE v_start END,
    start_type   = COALESCE(NULLIF(p->>'start_type', ''), start_type)
  WHERE round_event_id = p_round_event_id;

  -- Invitees, under the same version check: active members of the team only. Missing ones get a pending row; a
  -- pending row nobody answered goes when its player is taken off. Replies stay.
  IF jsonb_typeof(p->'attendee_ids') = 'array' THEN
    SELECT COALESCE(array_agg(m.player_id), '{}') INTO v_attendees
      FROM public.golf_team_members m
     WHERE m.team_id = v_round.team_id AND m.status = 'active'
       AND m.player_id IN (SELECT x.id::uuid FROM jsonb_array_elements_text(p->'attendee_ids') AS x(id));
    WITH ins AS (
      INSERT INTO public.golf_event_attendance (event_id, player_id, status, notified_at)
      SELECT p_round_event_id, a.id, 'pending', now() FROM unnest(v_attendees) AS a(id)
      ON CONFLICT (event_id, player_id) DO NOTHING
      RETURNING player_id)
    SELECT COALESCE(array_agg(ins.player_id), '{}') INTO v_added FROM ins;
    DELETE FROM public.golf_event_attendance x
     WHERE x.event_id = p_round_event_id AND x.status = 'pending' AND x.rsvp_at IS NULL
       AND NOT (x.player_id = ANY (v_attendees));
  END IF;

  -- Owner call 2: move each player's tee time by the same amount, only between two timed starts, and only when 4.33's
  -- tee sheet (100300) exists.
  IF COALESCE((p->>'shift_tee_sheet')::boolean, false)
     AND NOT COALESCE(v_ev.all_day, false) AND NOT v_all_day AND v_delta <> interval '0'
     AND to_regclass('public.golf_tournament_tee_sheet') IS NOT NULL THEN
    EXECUTE 'UPDATE public.golf_tournament_tee_sheet SET tee_at = tee_at + $1, updated_by = $2, updated_at = now()'
         || ' WHERE round_event_id = $3'
      USING v_delta, (SELECT auth.uid()), p_round_event_id;
    GET DIAGNOSTICS v_shifted = ROW_COUNT;
  END IF;

  -- The tournament's local dates follow its rounds; the UPDATE always bumps version (4.33's touch trigger).
  SELECT min(CASE WHEN COALESCE(e.all_day, false) THEN (e.start_time AT TIME ZONE 'UTC')::date ELSE (e.start_time AT TIME ZONE v_tz)::date END),
         max(CASE WHEN COALESCE(e.all_day, false) THEN (e.start_time AT TIME ZONE 'UTC')::date ELSE (e.start_time AT TIME ZONE v_tz)::date END)
    INTO v_min, v_max
    FROM public.golf_tournament_rounds r JOIN public.golf_events e ON e.id = r.round_event_id
   WHERE r.tournament_id = v_round.tournament_id;

  UPDATE public.golf_tournaments SET start_date = v_min, end_date = v_max
   WHERE id = v_round.tournament_id
  RETURNING version INTO v_new;
  RETURN jsonb_build_object('version', v_new, 'tee_times_shifted', v_shifted, 'added_player_ids', to_jsonb(v_added));
END
$fn$;

-- 6. Cancel or restore one round (p_round_event_id given) or every round (NULL). Nothing is deleted.
--    A restore re-checks round order (a round moved meanwhile may now sit where the restored one was).
--    Returns { version, changed_event_ids }.
CREATE OR REPLACE FUNCTION public.golf_tournament_set_cancelled(
  p_tournament_id uuid, p_round_event_id uuid, p_cancelled boolean, p_reason text, p_expected_version int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_t       public.golf_tournaments%ROWTYPE;
  v_tz      text;
  v_new     int;
  v_changed uuid[];
  v_bad     boolean;
BEGIN
  IF p_expected_version IS NULL OR p_tournament_id IS NULL OR p_cancelled IS NULL THEN
    RAISE EXCEPTION 'bad_input' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_t FROM public.golf_tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_golf_team_coach(v_t.team_id) THEN
    RAISE EXCEPTION 'not_coach' USING ERRCODE = '42501';
  END IF;
  IF v_t.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'stale' USING ERRCODE = 'P0001';
  END IF;
  IF p_round_event_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.golf_tournament_rounds r
        WHERE r.round_event_id = p_round_event_id AND r.tournament_id = p_tournament_id) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001';
  END IF;

  IF p_cancelled THEN
    IF EXISTS (
      SELECT 1 FROM public.golf_tournament_rounds r
       WHERE r.tournament_id = p_tournament_id
         AND (p_round_event_id IS NULL OR r.round_event_id = p_round_event_id)
         AND r.status <> 'upcoming') THEN
      RAISE EXCEPTION 'round_started' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.golf_tournament_player_rounds pr
        JOIN public.golf_tournament_rounds r ON r.round_event_id = pr.round_event_id
       WHERE r.tournament_id = p_tournament_id
         AND (p_round_event_id IS NULL OR r.round_event_id = p_round_event_id)
         AND (pr.round_id IS NOT NULL OR pr.entered_total IS NOT NULL)) THEN
      RAISE EXCEPTION 'round_has_scores' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  WITH changed AS (
    UPDATE public.golf_events e SET
      status              = CASE WHEN p_cancelled THEN 'cancelled' ELSE 'confirmed' END,
      cancelled_at        = CASE WHEN p_cancelled THEN now() ELSE NULL END,
      cancellation_reason = CASE WHEN p_cancelled THEN NULLIF(btrim(COALESCE(p_reason, '')), '') ELSE NULL END,
      updated_at          = now()
    FROM public.golf_tournament_rounds r
    WHERE r.round_event_id = e.id
      AND r.tournament_id = p_tournament_id
      AND (p_round_event_id IS NULL OR r.round_event_id = p_round_event_id)
      AND (e.status = 'cancelled') IS DISTINCT FROM p_cancelled
    RETURNING e.id)
  SELECT COALESCE(array_agg(changed.id), '{}') INTO v_changed FROM changed;

  -- A restore puts rounds back where they were; if another round moved there meanwhile, the order breaks.
  IF NOT p_cancelled THEN
    v_tz := public.golf_team_timezone(v_t.team_id);
    WITH k AS (
      SELECT r.round_number, COALESCE(e.all_day, false) AS all_day,
             CASE WHEN COALESCE(e.all_day, false)
                  THEN ((e.start_time AT TIME ZONE 'UTC')::date + 1)::timestamp - interval '1 microsecond'
                  ELSE e.start_time AT TIME ZONE v_tz END AS key
        FROM public.golf_tournament_rounds r
        JOIN public.golf_events e ON e.id = r.round_event_id
       WHERE r.tournament_id = p_tournament_id
         AND e.status IS DISTINCT FROM 'cancelled'
    )
    SELECT EXISTS (
      SELECT 1 FROM k a JOIN k b ON b.round_number > a.round_number
       WHERE b.key < a.key OR (b.key = a.key AND NOT (a.all_day AND b.all_day))
    ) INTO v_bad;
    IF v_bad THEN
      RAISE EXCEPTION 'round_order' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Touch the tournament so other editors see a new version.
  UPDATE public.golf_tournaments SET updated_at = now()
   WHERE id = p_tournament_id
  RETURNING version INTO v_new;
  RETURN jsonb_build_object('version', v_new, 'changed_event_ids', to_jsonb(v_changed));
END
$fn$;

-- 7. Stop tracking: remove the tournament and its 4.33 children; keep every round's golf_events row.
CREATE OR REPLACE FUNCTION public.golf_tournament_untrack(p_tournament_id uuid, p_expected_version int)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_t public.golf_tournaments%ROWTYPE;
BEGIN
  IF p_expected_version IS NULL OR p_tournament_id IS NULL THEN
    RAISE EXCEPTION 'bad_input' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_t FROM public.golf_tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_golf_team_coach(v_t.team_id) THEN
    RAISE EXCEPTION 'not_coach' USING ERRCODE = '42501';
  END IF;
  IF v_t.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'stale' USING ERRCODE = 'P0001';
  END IF;
  IF v_t.official_at IS NOT NULL THEN
    RAISE EXCEPTION 'tournament_official' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.golf_tournament_player_rounds pr
      JOIN public.golf_tournament_rounds r ON r.round_event_id = pr.round_event_id
     WHERE r.tournament_id = p_tournament_id
       AND (pr.round_id IS NOT NULL OR pr.entered_total IS NOT NULL)) THEN
    RAISE EXCEPTION 'round_has_scores' USING ERRCODE = 'P0001';
  END IF;
  -- golf_tournament_rounds cascades from golf_tournaments; the events it pointed at stay (plain tournament events).
  DELETE FROM public.golf_tournaments WHERE id = p_tournament_id;
END
$fn$;

-- 8. A round event keeps its type, team, single-event shape, title, place and course, and cannot be cancelled once
--    under way or scored, whatever path writes it (the legacy dashboard, the Clubhouse editor, a script under a
--    coach's session). Title, location and course_id follow the tournament: they change only through 040100's sync
--    triggers (trigger depth 2) or a P-5/4.33 RPC that sets helm.tournament_write = 'rounds' for its transaction.
CREATE OR REPLACE FUNCTION helm_private.guard_tournament_round_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_status text;
BEGIN
  SELECT r.status INTO v_status FROM public.golf_tournament_rounds r WHERE r.round_event_id = OLD.id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF NEW.event_type IS DISTINCT FROM 'tournament' THEN
    RAISE EXCEPTION 'round_type_locked' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.team_id IS DISTINCT FROM OLD.team_id THEN
    RAISE EXCEPTION 'round_team_locked' USING ERRCODE = 'P0001';
  END IF;
  IF COALESCE(NEW.recurring, false) OR NEW.recurrence_rule IS NOT NULL OR NEW.parent_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'round_series_locked' USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.title IS DISTINCT FROM OLD.title OR NEW.location IS DISTINCT FROM OLD.location
      OR NEW.course_id IS DISTINCT FROM OLD.course_id)
     AND pg_trigger_depth() < 2
     AND current_setting('helm.tournament_write', true) IS DISTINCT FROM 'rounds' THEN
    RAISE EXCEPTION 'round_fields_locked' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    IF v_status <> 'upcoming' THEN
      RAISE EXCEPTION 'round_started' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.golf_tournament_player_rounds pr
       WHERE pr.round_event_id = OLD.id
         AND (pr.round_id IS NOT NULL OR pr.entered_total IS NOT NULL)) THEN
      RAISE EXCEPTION 'round_has_scores' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS golf_events_tournament_round_guard ON public.golf_events;
CREATE TRIGGER golf_events_tournament_round_guard
  BEFORE UPDATE OF event_type, team_id, recurring, recurrence_rule, parent_event_id, status, title, location, course_id
  ON public.golf_events
  FOR EACH ROW
  WHEN (OLD.event_type = 'tournament')
  EXECUTE FUNCTION helm_private.guard_tournament_round_event();

-- 9. Grants: signed-in users only; RLS and is_golf_team_coach decide the rest. A trigger function runs without an
--    EXECUTE check at fire time, so revoking it from authenticated is safe (4.33's guard_tournament_team pattern).
REVOKE ALL ON FUNCTION public.golf_team_timezone(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.golf_tournament_create_from_calendar(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.golf_tournament_update_round(uuid, jsonb, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.golf_tournament_set_cancelled(uuid, uuid, boolean, text, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.golf_tournament_untrack(uuid, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION helm_private.guard_tournament_round_event() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golf_team_timezone(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.golf_tournament_create_from_calendar(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.golf_tournament_update_round(uuid, jsonb, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.golf_tournament_set_cancelled(uuid, uuid, boolean, text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.golf_tournament_untrack(uuid, int) TO authenticated, service_role;
