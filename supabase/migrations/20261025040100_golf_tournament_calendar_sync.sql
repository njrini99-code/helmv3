-- STATUS: WRITTEN — HOLD — NOT APPLIED
-- P-5 Tournaments from the calendar: keep a round's golf_events row and its
-- tournament in step from any write path
-- (owner call 1 in the plan; held separately so the owner can apply
-- 20261025040000 without it).
-- Apply: npm run db:apply --
-- supabase/migrations/20261025040100_golf_tournament_calendar_sync.sql
-- Transaction: apply.mjs wraps this file in one transaction, so it has no
-- BEGIN/COMMIT of its own.
-- Requires: 20261025040000 applied first (the DO block refuses otherwise).
-- Risk: medium-low. A DEFERRABLE INITIALLY DEFERRED constraint trigger on
-- golf_events that fires only when a
--   tournament event's start_time, end_time or all_day changes, or it is
-- restored from cancelled, and two small AFTER
--   triggers on 4.33's tournament tables. A round moved out of order by any
-- path is refused at commit ('round_order').
-- Why: the legacy dashboard and 4.33's own golf_tournament_update also write
-- golf_events; this keeps first_tee_at,
--   the tournament dates, the version, round titles and the round's course in
-- step without each path doing it.
--
-- VERIFY: select 1 where exists (select 1 from pg_trigger where tgname =
-- VERIFY: 'golf_events_tournament_round_sync' and tgdeferrable and
-- VERIFY: tginitdeferred);
-- VERIFY: select 1 where exists (select 1 from pg_trigger where tgname =
-- VERIFY: 'golf_tournaments_round_titles' and not tgisinternal);
-- VERIFY: select 1 where exists (select 1 from pg_trigger where tgname =
-- VERIFY: 'golf_tournament_rounds_event_fields' and not tgisinternal);
-- ROLLBACK: DROP TRIGGER IF EXISTS golf_tournament_rounds_event_fields ON
-- public.golf_tournament_rounds;
-- ROLLBACK: DROP TRIGGER IF EXISTS golf_tournaments_round_titles ON
-- public.golf_tournaments;
-- ROLLBACK: DROP TRIGGER IF EXISTS golf_events_tournament_round_sync ON
-- public.golf_events;
-- ROLLBACK: DROP FUNCTION IF EXISTS helm_private.sync_round_event_fields(),
-- helm_private.sync_tournament_round_titles(),
-- helm_private.sync_tournament_round_from_event();

SET lock_timeout = '3s';

DO $$
BEGIN
  IF to_regprocedure('public.golf_tournament_update_round(uuid, jsonb, integer)') IS NULL
     OR to_regprocedure('public.golf_team_timezone(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261025040000_golf_tournament_from_calendar.sql before 20261025040100';
  END IF;
END $$;

-- 1. Calendar side to tournament side. Deferred to commit, so a multi-round
-- reschedule (4.33 golf_tournament_update)
--    is judged on its final state, and the RPCs that already set the same
-- values cause no second version bump.
--    Same order key as 20261025040000: an untimed round keys at the very end of
-- its day.
CREATE OR REPLACE FUNCTION helm_private.sync_tournament_round_from_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_round public.golf_tournament_rounds%ROWTYPE;
  v_ev    public.golf_events%ROWTYPE;
  v_tz    text;
  v_first timestamptz;
  v_bad   boolean;
  v_min   date;
  v_max   date;
BEGIN
  SELECT * INTO v_round FROM public.golf_tournament_rounds r WHERE r.round_event_id = NEW.id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_ev FROM public.golf_events e WHERE e.id = NEW.id;  -- the row as it stands at commit
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_tz := public.golf_team_timezone(v_round.team_id);

  WITH k AS (
    SELECT r.round_number, COALESCE(e.all_day, false) AS all_day,
           CASE WHEN COALESCE(e.all_day, false)
                THEN ((e.start_time AT TIME ZONE 'UTC')::date + 1)::timestamp - interval '1 microsecond'
                ELSE e.start_time AT TIME ZONE v_tz END AS key
      FROM public.golf_tournament_rounds r
      JOIN public.golf_events e ON e.id = r.round_event_id
     WHERE r.tournament_id = v_round.tournament_id
       AND e.status IS DISTINCT FROM 'cancelled'
  )
  SELECT EXISTS (
    SELECT 1 FROM k a JOIN k b ON b.round_number > a.round_number
     WHERE b.key < a.key OR (b.key = a.key AND NOT (a.all_day AND b.all_day))
  ) INTO v_bad;
  IF v_bad THEN
    RAISE EXCEPTION 'round_order' USING ERRCODE = 'P0001';
  END IF;

  v_first := CASE WHEN COALESCE(v_ev.all_day, false) THEN NULL ELSE v_ev.start_time END;
  IF v_round.first_tee_at IS DISTINCT FROM v_first THEN
    UPDATE public.golf_tournament_rounds SET first_tee_at = v_first WHERE round_event_id = NEW.id;
  END IF;

  SELECT min(d), max(d) INTO v_min, v_max FROM (
    SELECT CASE WHEN COALESCE(e.all_day, false) THEN (e.start_time AT TIME ZONE 'UTC')::date
                ELSE (e.start_time AT TIME ZONE v_tz)::date END AS d
      FROM public.golf_tournament_rounds r
      JOIN public.golf_events e ON e.id = r.round_event_id
     WHERE r.tournament_id = v_round.tournament_id
  ) s;

  -- Bump the version only when something the tournament shows actually changed.
  UPDATE public.golf_tournaments t SET start_date = v_min, end_date = v_max
   WHERE t.id = v_round.tournament_id
     AND (t.start_date IS DISTINCT FROM v_min OR t.end_date IS DISTINCT FROM v_max
          OR v_round.first_tee_at IS DISTINCT FROM v_first);
  RETURN NULL;
END
$fn$;

DROP TRIGGER IF EXISTS golf_events_tournament_round_sync ON public.golf_events;
CREATE CONSTRAINT TRIGGER golf_events_tournament_round_sync
AFTER UPDATE OF start_time, end_time, all_day, status ON public.golf_events
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (
    new.event_type = 'tournament'
    AND (
        old.start_time IS DISTINCT FROM new.start_time
        OR old.all_day IS DISTINCT FROM new.all_day
        OR (
            old.status = 'cancelled' AND new.status IS DISTINCT FROM 'cancelled'
        )
    )
)
EXECUTE FUNCTION helm_private.sync_tournament_round_from_event();

-- 2. Tournament renamed on the desk: every round's calendar title follows
-- ("Name · R2", D-81). The UPDATE runs at
--    trigger depth 2, which P-5's guard lets through.
CREATE OR REPLACE FUNCTION helm_private.sync_tournament_round_titles()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  UPDATE public.golf_events e
     SET title = NEW.name || ' · R' || r.round_number, updated_at = now()
    FROM public.golf_tournament_rounds r
   WHERE r.tournament_id = NEW.id
     AND e.id = r.round_event_id
     AND e.title IS DISTINCT FROM NEW.name || ' · R' || r.round_number;
  RETURN NULL;
END
$fn$;

DROP TRIGGER IF EXISTS golf_tournaments_round_titles ON public.golf_tournaments;
CREATE TRIGGER golf_tournaments_round_titles
AFTER UPDATE OF name ON public.golf_tournaments
FOR EACH ROW
WHEN (old.name IS DISTINCT FROM new.name)
EXECUTE FUNCTION helm_private.sync_tournament_round_titles();

-- 3. A round renumbered or given another course on the desk: its calendar row
-- follows (depth 2, as above).
CREATE OR REPLACE FUNCTION helm_private.sync_round_event_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_name text;
  v_loc  text;
BEGIN
  SELECT t.name INTO v_name FROM public.golf_tournaments t WHERE t.id = NEW.tournament_id;
  SELECT c.name INTO v_loc FROM public.golf_courses c WHERE c.id = NEW.course_id;
  v_loc := COALESCE(v_loc, NEW.course_label);
  UPDATE public.golf_events e SET
    title      = v_name || ' · R' || NEW.round_number,
    course_id  = NEW.course_id,
    location   = COALESCE(v_loc, e.location),
    updated_at = now()
  WHERE e.id = NEW.round_event_id
    AND (e.title IS DISTINCT FROM v_name || ' · R' || NEW.round_number
         OR e.course_id IS DISTINCT FROM NEW.course_id
         OR (v_loc IS NOT NULL AND e.location IS DISTINCT FROM v_loc));
  RETURN NULL;
END
$fn$;

DROP TRIGGER IF EXISTS golf_tournament_rounds_event_fields
ON public.golf_tournament_rounds;
CREATE TRIGGER golf_tournament_rounds_event_fields
AFTER UPDATE OF round_number,
course_id,
course_label ON public.golf_tournament_rounds
FOR EACH ROW
WHEN (
    old.round_number IS DISTINCT FROM new.round_number
    OR old.course_id IS DISTINCT FROM new.course_id
    OR old.course_label IS DISTINCT FROM new.course_label
)
EXECUTE FUNCTION helm_private.sync_round_event_fields();

REVOKE ALL ON FUNCTION helm_private.sync_tournament_round_from_event()
FROM public,
anon,
authenticated;
REVOKE ALL ON FUNCTION helm_private.sync_tournament_round_titles() FROM public,
anon,
authenticated;
REVOKE ALL ON FUNCTION helm_private.sync_round_event_fields() FROM public,
anon,
authenticated;
