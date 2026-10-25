-- STATUS: WRITTEN — HOLD — NOT APPLIED
-- P016 Clubhouse Tournaments, held migration 3 of 6: the write RPCs and the
-- lineup guard. Written 2026-10-25 from the held data plan, section 3
-- (docs/clubhouse/held/data/tournaments.md; handoff 11.4 and 4.33 section 13).
-- Registered in supabase/migrations/HELD.md; the owner applies it (OQ-65:
-- D-80 to D-101 approve the product, not the apply). Registry plan:
-- docs/clubhouse/held/data/tournaments-rpcs.md.
--
-- APPLY ALL SIX TOGETHER, IN THIS ORDER, IN ONE SESSION: 20261024100000
-- (tables), 100100 (RLS), 100200 (this), 100300 (player moments), 100400
-- (push_tournaments preference), 100500 (live round); each through
-- npm run db:apply, no BEGIN/COMMIT in any of them. This file needs 100000
-- and 100100 (it references their tables, policies and helpers).
--
-- WHAT IT ADDS:
--   * ten public functions, every one SECURITY INVOKER with
--     search_path = '' (so the 100100 policies still decide every row):
--       golf_tournament_create(jsonb) -> uuid
--       golf_tournament_update(uuid, jsonb, integer) -> integer (new version)
--       golf_tournament_delete(uuid, boolean)
--       golf_tournament_set_entries(uuid, jsonb, integer) -> integer
--       golf_tournament_lock_lineup(uuid) -> timestamptz
--       golf_tournament_substitute(uuid, uuid, uuid) (round, out, in)
--       golf_tournament_set_round_status(uuid, text, text)
--       golf_tournament_mark(uuid, text, text)
--       golf_tournament_publish(uuid, timestamptz) -> timestamptz
--       golf_tournament_link_candidates(uuid) -> table (read only)
--     EXECUTE is revoked from PUBLIC and anon first, then granted to
--     authenticated and service_role.
--   * the lineup guard, helm_private.guard_tournament_lineup(), BEFORE
--     INSERT OR UPDATE OR DELETE on golf_tournament_entries and
--     golf_tournament_round_lineups: once golf_tournaments.lineup_locked_at
--     is set, a change is refused (P0001 'locked') unless the transaction set
--     the GUC helm.tournament_write = 'substitute', which only
--     golf_tournament_substitute does (the guard_golf_round_lifecycle
--     pattern). A row whose tournament is gone (the cascade of a tournament
--     delete) passes. The GUC is the only bypass and it does not need a
--     particular database role: a PostgREST caller cannot set a GUC, and the
--     100100 policies still admit only a coach of the team to these tables.
--
-- REFUSALS. Every refusal raises SQLSTATE P0001 with the bare code as the
-- message, so the server actions map it without parsing prose:
--   not_coach, not_found, stale, invalid, locked, lineup_empty, too_many,
--   no_substitutions, not_in_lineup, already_in, round_started, round_order,
--   round_has_scores, rounds_linked, bad_transition, reason_required,
--   not_final, event_taken.
--
-- AUTHORS. golf_tournaments.created_by and result marks' created_by are
-- auth.uid() (FK auth.users). golf_events.created_by is FK golf_coaches.id,
-- so create and update resolve the caller's coach row staffed on the team
-- (golf_team_coach_staff joined to golf_coaches on user_id = auth.uid()).
--
-- TOUCHES LIVE DATA only by inserting, updating and deleting golf_events rows
-- of event_type 'tournament' that a tournament owns (event_adopted false); an
-- adopted calendar event (from_event_id) is updated but never deleted.
-- Nothing here sends a notification or reaches a player: golf_events has no
-- notification trigger, and publish only stamps lineup_published_at (the
-- player's reveal and any message are the coach's, later files and the app).
-- reveal_at arrives with 100300; until then publish sets
-- lineup_published_at only.
--
-- Risk: MEDIUM. Writes golf_events rows; the lineup guard is the integrity
-- boundary for a locked lineup.
--
-- ROLLBACK:
--   drop trigger if exists golf_tournament_entries_lineup_guard
--     on public.golf_tournament_entries;
--   drop trigger if exists golf_tournament_round_lineups_lineup_guard
--     on public.golf_tournament_round_lineups;
--   drop function if exists helm_private.guard_tournament_lineup();
--   drop function if exists public.golf_tournament_create(jsonb),
--     public.golf_tournament_update(uuid, jsonb, integer),
--     public.golf_tournament_delete(uuid, boolean),
--     public.golf_tournament_set_entries(uuid, jsonb, integer),
--     public.golf_tournament_lock_lineup(uuid),
--     public.golf_tournament_substitute(uuid, uuid, uuid),
--     public.golf_tournament_set_round_status(uuid, text, text),
--     public.golf_tournament_mark(uuid, text, text),
--     public.golf_tournament_publish(uuid, timestamptz),
--     public.golf_tournament_link_candidates(uuid);
-- Rows the RPCs wrote stay (tournaments, rounds and their golf_events).
--
-- VERIFY: select 1 where to_regprocedure(
-- VERIFY: 'public.golf_tournament_create(jsonb)') is not null;
-- VERIFY: select 1 where not has_function_privilege('anon',
-- VERIFY: 'public.golf_tournament_update(uuid, jsonb, integer)', 'EXECUTE');
-- VERIFY: select 1 where has_function_privilege('authenticated',
-- VERIFY: 'public.golf_tournament_substitute(uuid, uuid, uuid)', 'EXECUTE');
-- VERIFY: select 1 from pg_proc where oid =
-- VERIFY: 'public.golf_tournament_lock_lineup(uuid)'::regprocedure
-- VERIFY: and not prosecdef;
-- VERIFY: select 1 from pg_trigger where tgname =
-- VERIFY: 'golf_tournament_entries_lineup_guard' and not tgisinternal;

set local lock_timeout = '3s';

-- 1. The lineup guard (section 3; the guard_golf_round_lifecycle pattern).
-- SECURITY DEFINER so the lock is read whatever the caller may see; a
-- trigger function needs no EXECUTE grant.
create or replace function helm_private.guard_tournament_lineup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
DECLARE
  v_tournament uuid;
  v_round uuid;
  v_locked timestamptz;
BEGIN
  IF coalesce(current_setting('helm.tournament_write', true), '') = 'substitute' THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  IF TG_TABLE_NAME = 'golf_tournament_entries' THEN
    IF TG_OP = 'DELETE' THEN v_tournament := OLD.tournament_id; ELSE v_tournament := NEW.tournament_id; END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN v_round := OLD.round_event_id; ELSE v_round := NEW.round_event_id; END IF;
    SELECT r.tournament_id INTO v_tournament
    FROM public.golf_tournament_rounds r WHERE r.round_event_id = v_round;
  END IF;
  SELECT t.lineup_locked_at INTO v_locked
  FROM public.golf_tournaments t WHERE t.id = v_tournament;
  -- Not locked, or the tournament (or its round) is already gone: the
  -- cascade of a delete, which must not be blocked by its own lock.
  IF v_locked IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'locked' USING ERRCODE = 'P0001',
    DETAIL = format('the lineup of tournament %s locked at %s; substitute instead', v_tournament, v_locked);
END $$;
revoke all on function helm_private.guard_tournament_lineup()
from public, anon, authenticated;

create or replace trigger golf_tournament_entries_lineup_guard
before insert or update or delete on public.golf_tournament_entries
for each row execute function helm_private.guard_tournament_lineup();
create or replace trigger golf_tournament_round_lineups_lineup_guard
before insert or update or delete on public.golf_tournament_round_lineups
for each row execute function helm_private.guard_tournament_lineup();

-- 2. Create: the tournament, one golf_events row per round day (or the
-- adopted calendar event as round 1), the round rows, our field row and any
-- named field teams and advice givers.
create or replace function public.golf_tournament_create(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
DECLARE
  v_team uuid := nullif(p_payload->>'team_id', '')::uuid;
  v_coach uuid;
  v_tz text;
  v_team_name text;
  v_id uuid;
  v_rounds jsonb := coalesce(p_payload->'rounds', '[]'::jsonb);
  v_n integer;
  v_from uuid := nullif(p_payload->>'from_event_id', '')::uuid;
  v_round jsonb;
  v_i integer := 0;
  v_event uuid;
  v_date date;
  v_tee timestamptz;
  v_name text := btrim(coalesce(p_payload->>'name', ''));
BEGIN
  IF v_team IS NULL OR NOT public.is_golf_team_coach(v_team) THEN
    RAISE EXCEPTION 'not_coach' USING ERRCODE = 'P0001';
  END IF;
  SELECT c.id INTO v_coach
  FROM public.golf_team_coach_staff s
  JOIN public.golf_coaches c ON c.id = s.coach_id
  WHERE s.team_id = v_team AND c.user_id = (SELECT auth.uid())
  LIMIT 1;
  IF v_coach IS NULL THEN
    RAISE EXCEPTION 'not_coach' USING ERRCODE = 'P0001';
  END IF;
  v_n := CASE WHEN jsonb_typeof(v_rounds) = 'array' THEN jsonb_array_length(v_rounds) ELSE 0 END;
  IF v_n < 1 OR v_n > 6 OR v_name = '' THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001', DETAIL = 'a name and one to six rounds are required';
  END IF;
  SELECT t.timezone, t.name INTO v_tz, v_team_name FROM public.golf_teams t WHERE t.id = v_team;

  INSERT INTO public.golf_tournaments (
    team_id, name, start_date, end_date, course_id, format, players_per_team,
    counting, holes_per_round, rounds_count, event_kind, tiebreak, field_size,
    line_kind, line_value, substitutions, lock_minutes, results_url, host,
    created_by)
  VALUES (
    v_team, v_name,
    (p_payload->>'start_date')::date, (p_payload->>'end_date')::date,
    nullif(p_payload->>'course_id', '')::uuid,
    coalesce(p_payload->>'format', '5c4'),
    coalesce((p_payload->>'players_per_team')::smallint, 5),
    coalesce((p_payload->>'counting')::smallint, 4),
    coalesce((p_payload->>'holes_per_round')::smallint, 18),
    v_n,
    coalesce(p_payload->>'event_kind', 'regular'),
    coalesce(p_payload->>'tiebreak', 'ties_stand'),
    (p_payload->>'field_size')::smallint,
    nullif(p_payload->>'line_kind', ''),
    (p_payload->>'line_value')::smallint,
    coalesce((p_payload->>'substitutions')::boolean, false),
    coalesce((p_payload->>'lock_minutes')::smallint, 10),
    nullif(p_payload->>'results_url', ''),
    nullif(p_payload->>'host', ''),
    (SELECT auth.uid()))
  RETURNING id INTO v_id;

  FOR v_round IN SELECT value FROM jsonb_array_elements(v_rounds) LOOP
    v_i := v_i + 1;
    v_date := (v_round->>'date')::date;
    v_tee := nullif(v_round->>'first_tee_at', '')::timestamptz;
    IF v_i = 1 AND v_from IS NOT NULL THEN
      -- Adopt a calendar event of this team as round 1; never one that is
      -- already a tournament round.
      IF NOT EXISTS (
        SELECT 1 FROM public.golf_events e WHERE e.id = v_from AND e.team_id = v_team) THEN
        RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001', DETAIL = 'from_event_id is not an event of this team';
      END IF;
      IF EXISTS (SELECT 1 FROM public.golf_tournament_rounds r WHERE r.round_event_id = v_from) THEN
        RAISE EXCEPTION 'event_taken' USING ERRCODE = 'P0001';
      END IF;
      v_event := v_from;
    ELSE
      INSERT INTO public.golf_events (
        team_id, title, event_type, start_time, all_day, course_id, created_by)
      VALUES (
        v_team,
        format('%s · Round %s', v_name, v_i),
        'tournament',
        coalesce(v_tee, (v_date + time '12:00') AT TIME ZONE coalesce(v_tz, 'America/New_York')),
        v_tee IS NULL,
        coalesce(nullif(v_round->>'course_id', '')::uuid, nullif(p_payload->>'course_id', '')::uuid),
        v_coach)
      RETURNING id INTO v_event;
    END IF;
    INSERT INTO public.golf_tournament_rounds (
      round_event_id, tournament_id, team_id, round_number, course_id, tee_id,
      start_type, first_tee_at, event_adopted)
    VALUES (
      v_event, v_id, v_team, v_i,
      coalesce(nullif(v_round->>'course_id', '')::uuid, nullif(p_payload->>'course_id', '')::uuid),
      nullif(v_round->>'tee_id', '')::uuid,
      coalesce(nullif(v_round->>'start_type', ''), 'tee_times'),
      v_tee,
      v_i = 1 AND v_from IS NOT NULL);
  END LOOP;

  INSERT INTO public.golf_tournament_field_teams (tournament_id, team_id, name, is_us)
  VALUES (v_id, v_team, left(coalesce(v_team_name, 'Us'), 80), true);
  INSERT INTO public.golf_tournament_field_teams (
    tournament_id, team_id, name, is_b_team, same_division, seed)
  SELECT v_id, v_team, left(btrim(f->>'name'), 80),
    coalesce((f->>'is_b_team')::boolean, false),
    coalesce((f->>'same_division')::boolean, true),
    (f->>'seed')::smallint
  FROM jsonb_array_elements(coalesce(p_payload->'field_teams', '[]'::jsonb)) f
  WHERE btrim(coalesce(f->>'name', '')) <> '';

  INSERT INTO public.golf_tournament_advice_givers (tournament_id, team_id, user_id)
  SELECT DISTINCT v_id, v_team, a::uuid
  FROM jsonb_array_elements_text(coalesce(p_payload->'advice_givers', '[]'::jsonb)) a;

  RETURN v_id;
END $$;

-- 3. Update: compare-and-set on version; never removes a round that has a
-- score or has started.
create or replace function public.golf_tournament_update(
    p_id uuid, p_payload jsonb, p_version integer
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
DECLARE
  v_t public.golf_tournaments%ROWTYPE;
  v_coach uuid;
  v_tz text;
  v_rounds jsonb := p_payload->'rounds';
  v_n integer;
  v_round jsonb;
  v_i integer := 0;
  v_event uuid;
  v_date date;
  v_tee timestamptz;
  v_course uuid;
  v_gone record;
  v_name text;
BEGIN
  SELECT * INTO v_t FROM public.golf_tournaments t WHERE t.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_golf_team_coach(v_t.team_id) THEN
    RAISE EXCEPTION 'not_coach' USING ERRCODE = 'P0001';
  END IF;
  IF p_version IS NULL OR v_t.version <> p_version THEN
    RAISE EXCEPTION 'stale' USING ERRCODE = 'P0001',
      DETAIL = format('version is %s, the edit was made on %s', v_t.version, p_version);
  END IF;
  v_name := CASE WHEN p_payload ? 'name' THEN btrim(p_payload->>'name') ELSE v_t.name END;
  IF coalesce(v_name, '') = '' THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001', DETAIL = 'a name is required';
  END IF;

  IF v_rounds IS NOT NULL THEN
    v_n := CASE WHEN jsonb_typeof(v_rounds) = 'array' THEN jsonb_array_length(v_rounds) ELSE 0 END;
    IF v_n < 1 OR v_n > 6 THEN
      RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001', DETAIL = 'one to six rounds are required';
    END IF;
    -- Rounds past the new count go only when nothing was played or scored.
    FOR v_gone IN
      SELECT r.round_event_id, r.status, r.event_adopted
      FROM public.golf_tournament_rounds r
      WHERE r.tournament_id = p_id AND r.round_number > v_n
    LOOP
      IF v_gone.status <> 'upcoming' OR EXISTS (
        SELECT 1 FROM public.golf_tournament_player_rounds pr
        WHERE pr.round_event_id = v_gone.round_event_id
          AND (pr.round_id IS NOT NULL OR pr.entered_total IS NOT NULL)) THEN
        RAISE EXCEPTION 'round_has_scores' USING ERRCODE = 'P0001';
      END IF;
      DELETE FROM public.golf_tournament_rounds r WHERE r.round_event_id = v_gone.round_event_id;
      IF NOT v_gone.event_adopted THEN
        DELETE FROM public.golf_events e WHERE e.id = v_gone.round_event_id;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.golf_tournaments t SET
    name = v_name,
    start_date = coalesce((p_payload->>'start_date')::date, t.start_date),
    end_date = coalesce((p_payload->>'end_date')::date, t.end_date),
    course_id = CASE WHEN p_payload ? 'course_id' THEN nullif(p_payload->>'course_id', '')::uuid ELSE t.course_id END,
    format = coalesce(p_payload->>'format', t.format),
    players_per_team = coalesce((p_payload->>'players_per_team')::smallint, t.players_per_team),
    counting = coalesce((p_payload->>'counting')::smallint, t.counting),
    holes_per_round = coalesce((p_payload->>'holes_per_round')::smallint, t.holes_per_round),
    rounds_count = coalesce(v_n, t.rounds_count),
    event_kind = coalesce(p_payload->>'event_kind', t.event_kind),
    tiebreak = coalesce(p_payload->>'tiebreak', t.tiebreak),
    field_size = CASE WHEN p_payload ? 'field_size' THEN (p_payload->>'field_size')::smallint ELSE t.field_size END,
    line_kind = CASE WHEN p_payload ? 'line_kind' THEN nullif(p_payload->>'line_kind', '') ELSE t.line_kind END,
    line_value = CASE WHEN p_payload ? 'line_value' THEN (p_payload->>'line_value')::smallint ELSE t.line_value END,
    substitutions = coalesce((p_payload->>'substitutions')::boolean, t.substitutions),
    lock_minutes = coalesce((p_payload->>'lock_minutes')::smallint, t.lock_minutes),
    results_url = CASE WHEN p_payload ? 'results_url' THEN nullif(p_payload->>'results_url', '') ELSE t.results_url END,
    host = CASE WHEN p_payload ? 'host' THEN nullif(p_payload->>'host', '') ELSE t.host END
  WHERE t.id = p_id;

  IF v_rounds IS NOT NULL THEN
    SELECT tm.timezone INTO v_tz FROM public.golf_teams tm WHERE tm.id = v_t.team_id;
    SELECT c.id INTO v_coach
    FROM public.golf_team_coach_staff s
    JOIN public.golf_coaches c ON c.id = s.coach_id
    WHERE s.team_id = v_t.team_id AND c.user_id = (SELECT auth.uid())
    LIMIT 1;
    FOR v_round IN SELECT value FROM jsonb_array_elements(v_rounds) LOOP
      v_i := v_i + 1;
      v_date := (v_round->>'date')::date;
      v_tee := nullif(v_round->>'first_tee_at', '')::timestamptz;
      v_course := coalesce(nullif(v_round->>'course_id', '')::uuid, nullif(p_payload->>'course_id', '')::uuid, v_t.course_id);
      SELECT r.round_event_id INTO v_event
      FROM public.golf_tournament_rounds r
      WHERE r.tournament_id = p_id AND r.round_number = v_i;
      IF FOUND THEN
        UPDATE public.golf_tournament_rounds r SET
          course_id = v_course,
          tee_id = nullif(v_round->>'tee_id', '')::uuid,
          start_type = coalesce(nullif(v_round->>'start_type', ''), r.start_type),
          first_tee_at = v_tee
        WHERE r.round_event_id = v_event;
        UPDATE public.golf_events e SET
          start_time = coalesce(v_tee, (v_date + time '12:00') AT TIME ZONE coalesce(v_tz, 'America/New_York')),
          all_day = v_tee IS NULL,
          course_id = v_course,
          title = CASE WHEN e.event_type = 'tournament' THEN format('%s · Round %s', v_name, v_i) ELSE e.title END
        WHERE e.id = v_event;
      ELSE
        INSERT INTO public.golf_events (
          team_id, title, event_type, start_time, all_day, course_id, created_by)
        VALUES (
          v_t.team_id, format('%s · Round %s', v_name, v_i), 'tournament',
          coalesce(v_tee, (v_date + time '12:00') AT TIME ZONE coalesce(v_tz, 'America/New_York')),
          v_tee IS NULL, v_course, v_coach)
        RETURNING id INTO v_event;
        INSERT INTO public.golf_tournament_rounds (
          round_event_id, tournament_id, team_id, round_number, course_id,
          tee_id, start_type, first_tee_at)
        VALUES (
          v_event, p_id, v_t.team_id, v_i, v_course,
          nullif(v_round->>'tee_id', '')::uuid,
          coalesce(nullif(v_round->>'start_type', ''), 'tee_times'), v_tee);
      END IF;
    END LOOP;
  END IF;

  RETURN (SELECT t.version FROM public.golf_tournaments t WHERE t.id = p_id);
END $$;

-- 4. Delete: refuses while a GolfHelm round is linked unless told to unlink
-- (the linked golf_rounds rows are never touched either way); deletes the
-- tournament (its children cascade), then the round-day events it owns.
create or replace function public.golf_tournament_delete(
    p_id uuid, p_unlink boolean default false
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
DECLARE
  v_team uuid;
  v_owned uuid[];
BEGIN
  SELECT t.team_id INTO v_team FROM public.golf_tournaments t WHERE t.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_golf_team_coach(v_team) THEN
    RAISE EXCEPTION 'not_coach' USING ERRCODE = 'P0001';
  END IF;
  IF NOT coalesce(p_unlink, false) AND EXISTS (
    SELECT 1 FROM public.golf_tournament_player_rounds pr
    JOIN public.golf_tournament_rounds r ON r.round_event_id = pr.round_event_id
    WHERE r.tournament_id = p_id AND pr.round_id IS NOT NULL) THEN
    RAISE EXCEPTION 'rounds_linked' USING ERRCODE = 'P0001';
  END IF;
  SELECT coalesce(array_agg(r.round_event_id), '{}') INTO v_owned
  FROM public.golf_tournament_rounds r
  WHERE r.tournament_id = p_id AND NOT r.event_adopted;
  DELETE FROM public.golf_tournaments t WHERE t.id = p_id;
  DELETE FROM public.golf_events e
  WHERE e.id = ANY (v_owned) AND e.team_id = v_team AND e.event_type = 'tournament';
END $$;

-- 5. Entries (the lineup the builder edits): replaced whole while unlocked.
create or replace function public.golf_tournament_set_entries(
    p_id uuid, p_entries jsonb, p_version integer default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
DECLARE
  v_t public.golf_tournaments%ROWTYPE;
  v_lineup integer;
BEGIN
  SELECT * INTO v_t FROM public.golf_tournaments t WHERE t.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_golf_team_coach(v_t.team_id) THEN
    RAISE EXCEPTION 'not_coach' USING ERRCODE = 'P0001';
  END IF;
  IF p_version IS NOT NULL AND v_t.version <> p_version THEN
    RAISE EXCEPTION 'stale' USING ERRCODE = 'P0001';
  END IF;
  IF v_t.lineup_locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'locked' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(coalesce(p_entries, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO v_lineup
  FROM jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) e
  WHERE e->>'role' = 'lineup';
  IF v_lineup > v_t.players_per_team THEN
    RAISE EXCEPTION 'too_many' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.golf_tournament_entries en WHERE en.tournament_id = p_id;
  INSERT INTO public.golf_tournament_entries (tournament_id, team_id, player_id, role, slot)
  SELECT p_id, v_t.team_id, (e->>'player_id')::uuid, e->>'role',
    CASE WHEN e->>'role' = 'lineup' THEN (e->>'slot')::smallint END
  FROM jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) e;

  INSERT INTO public.golf_tournament_entry_notes (tournament_id, team_id, player_id, reasoning)
  SELECT p_id, v_t.team_id, (e->>'player_id')::uuid, left(e->>'reasoning', 500)
  FROM jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) e
  WHERE e ? 'reasoning'
  ON CONFLICT (tournament_id, player_id) DO UPDATE SET reasoning = excluded.reasoning;

  -- Touch the tournament so its version moves with the lineup.
  UPDATE public.golf_tournaments t SET updated_at = now() WHERE t.id = p_id;
  RETURN (SELECT t.version FROM public.golf_tournaments t WHERE t.id = p_id);
END $$;

-- 6. Lock: the per-round snapshot is written first, then the lock is set, so
-- the guard never refuses the lock's own rows.
create or replace function public.golf_tournament_lock_lineup(p_id uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
DECLARE
  v_t public.golf_tournaments%ROWTYPE;
  v_at timestamptz := now();
BEGIN
  SELECT * INTO v_t FROM public.golf_tournaments t WHERE t.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_golf_team_coach(v_t.team_id) THEN
    RAISE EXCEPTION 'not_coach' USING ERRCODE = 'P0001';
  END IF;
  IF v_t.lineup_locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'locked' USING ERRCODE = 'P0001';
  END IF;
  IF v_t.format <> 'individual' AND NOT EXISTS (
    SELECT 1 FROM public.golf_tournament_entries en
    WHERE en.tournament_id = p_id AND en.role = 'lineup') THEN
    RAISE EXCEPTION 'lineup_empty' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.golf_tournament_round_lineups (round_event_id, team_id, player_id, role, slot)
  SELECT r.round_event_id, v_t.team_id, en.player_id, en.role, en.slot
  FROM public.golf_tournament_rounds r
  CROSS JOIN public.golf_tournament_entries en
  WHERE r.tournament_id = p_id AND en.tournament_id = p_id
  ON CONFLICT (round_event_id, player_id) DO NOTHING;
  UPDATE public.golf_tournaments t SET lineup_locked_at = v_at WHERE t.id = p_id;
  RETURN v_at;
END $$;

-- 7. Substitute: swaps a lineup player out for this round and every later
-- round that has not started. The only writer allowed past the lock.
create or replace function public.golf_tournament_substitute(
    p_round_event_id uuid, p_out uuid, p_in uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
DECLARE
  v_round public.golf_tournament_rounds%ROWTYPE;
  v_t public.golf_tournaments%ROWTYPE;
  v_later record;
  v_slot smallint;
  v_role text;
BEGIN
  SELECT * INTO v_round FROM public.golf_tournament_rounds r WHERE r.round_event_id = p_round_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_t FROM public.golf_tournaments t WHERE t.id = v_round.tournament_id FOR UPDATE;
  IF NOT public.is_golf_team_coach(v_t.team_id) THEN
    RAISE EXCEPTION 'not_coach' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_t.substitutions THEN
    RAISE EXCEPTION 'no_substitutions' USING ERRCODE = 'P0001';
  END IF;
  IF v_round.status <> 'upcoming' THEN
    RAISE EXCEPTION 'round_started' USING ERRCODE = 'P0001';
  END IF;
  IF p_out IS NULL OR p_in IS NULL OR p_out = p_in THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('helm.tournament_write', 'substitute', true);
  FOR v_later IN
    SELECT r.round_event_id FROM public.golf_tournament_rounds r
    WHERE r.tournament_id = v_round.tournament_id
      AND r.round_number >= v_round.round_number AND r.status = 'upcoming'
    ORDER BY r.round_number
  LOOP
    SELECT rl.slot INTO v_slot FROM public.golf_tournament_round_lineups rl
    WHERE rl.round_event_id = v_later.round_event_id AND rl.player_id = p_out AND rl.role = 'lineup';
    IF NOT FOUND THEN
      IF v_later.round_event_id = p_round_event_id THEN
        RAISE EXCEPTION 'not_in_lineup' USING ERRCODE = 'P0001';
      END IF;
      CONTINUE;
    END IF;
    SELECT rl.role INTO v_role FROM public.golf_tournament_round_lineups rl
    WHERE rl.round_event_id = v_later.round_event_id AND rl.player_id = p_in;
    IF v_role = 'lineup' THEN
      RAISE EXCEPTION 'already_in' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.golf_tournament_round_lineups rl
    SET role = 'alternate', slot = NULL
    WHERE rl.round_event_id = v_later.round_event_id AND rl.player_id = p_out;
    INSERT INTO public.golf_tournament_round_lineups (
      round_event_id, team_id, player_id, role, slot, substituted_for, substituted_at)
    VALUES (v_later.round_event_id, v_t.team_id, p_in, 'lineup', v_slot, p_out, now())
    ON CONFLICT (round_event_id, player_id) DO UPDATE SET
      role = 'lineup', slot = excluded.slot,
      substituted_for = excluded.substituted_for, substituted_at = excluded.substituted_at;
  END LOOP;
  PERFORM set_config('helm.tournament_write', '', true);
END $$;

-- 8. Round status. Allowed: upcoming -> live | final; live -> suspended_* |
-- final; suspended_* -> live | final; final -> live (a reopen: needs a reason
-- and writes a 'reopened' mark, and clears official). A round cannot start or
-- finish while an earlier round is still upcoming. Leaving upcoming takes the
-- lineup snapshot if the coach has not locked yet. Final writes a 'final'
-- mark with the round's scores as its snapshot (D-84).
create or replace function public.golf_tournament_set_round_status(
    p_round_event_id uuid, p_status text, p_reason text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
DECLARE
  v_round public.golf_tournament_rounds%ROWTYPE;
  v_t public.golf_tournaments%ROWTYPE;
  v_from text;
  v_ok boolean;
BEGIN
  SELECT * INTO v_round FROM public.golf_tournament_rounds r WHERE r.round_event_id = p_round_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_t FROM public.golf_tournaments t WHERE t.id = v_round.tournament_id;
  IF NOT public.is_golf_team_coach(v_t.team_id) THEN
    RAISE EXCEPTION 'not_coach' USING ERRCODE = 'P0001';
  END IF;
  v_from := v_round.status;
  v_ok := CASE
    WHEN v_from = 'upcoming' THEN p_status IN ('live', 'final')
    WHEN v_from = 'live' THEN p_status IN ('suspended_weather', 'suspended_other', 'final')
    WHEN v_from IN ('suspended_weather', 'suspended_other') THEN p_status IN ('live', 'final')
    WHEN v_from = 'final' THEN p_status = 'live'
    ELSE false
  END;
  IF NOT coalesce(v_ok, false) THEN
    RAISE EXCEPTION 'bad_transition' USING ERRCODE = 'P0001',
      DETAIL = format('%s -> %s', v_from, p_status);
  END IF;
  IF v_from = 'final' AND btrim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = 'P0001';
  END IF;
  IF v_from = 'upcoming' AND EXISTS (
    SELECT 1 FROM public.golf_tournament_rounds r
    WHERE r.tournament_id = v_round.tournament_id
      AND r.round_number < v_round.round_number AND r.status = 'upcoming') THEN
    RAISE EXCEPTION 'round_order' USING ERRCODE = 'P0001';
  END IF;
  IF v_from = 'upcoming' AND v_t.lineup_locked_at IS NULL THEN
    PERFORM public.golf_tournament_lock_lineup(v_t.id);
  END IF;

  UPDATE public.golf_tournament_rounds r
  SET status = p_status, status_changed_at = now()
  WHERE r.round_event_id = p_round_event_id;

  IF p_status = 'final' THEN
    INSERT INTO public.golf_tournament_result_marks (
      tournament_id, team_id, round_event_id, state, reason, snapshot, created_by)
    SELECT v_t.id, v_t.team_id, p_round_event_id, 'final', nullif(btrim(coalesce(p_reason, '')), ''),
      coalesce(jsonb_agg(jsonb_build_object(
        'player_id', pr.player_id, 'round_id', pr.round_id,
        'entered_total', pr.entered_total, 'status', pr.status)
        ORDER BY pr.player_id), '[]'::jsonb),
      (SELECT auth.uid())
    FROM public.golf_tournament_player_rounds pr
    WHERE pr.round_event_id = p_round_event_id;
  ELSIF v_from = 'final' THEN
    INSERT INTO public.golf_tournament_result_marks (
      tournament_id, team_id, round_event_id, state, reason, created_by)
    VALUES (v_t.id, v_t.team_id, p_round_event_id, 'reopened', left(btrim(p_reason), 280), (SELECT auth.uid()));
    UPDATE public.golf_tournaments t SET official_at = NULL
    WHERE t.id = v_t.id AND t.official_at IS NOT NULL;
  END IF;
END $$;

-- 9. Event marks: 'official' once every round is final; 'reopened' (with a
-- reason) takes official back. Both append a result mark.
create or replace function public.golf_tournament_mark(
    p_id uuid, p_state text, p_reason text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
DECLARE
  v_t public.golf_tournaments%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM public.golf_tournaments t WHERE t.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_golf_team_coach(v_t.team_id) THEN
    RAISE EXCEPTION 'not_coach' USING ERRCODE = 'P0001';
  END IF;
  IF p_state = 'official' THEN
    IF EXISTS (
      SELECT 1 FROM public.golf_tournament_rounds r
      WHERE r.tournament_id = p_id AND r.status <> 'final') THEN
      RAISE EXCEPTION 'not_final' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.golf_tournaments t SET official_at = now() WHERE t.id = p_id;
    INSERT INTO public.golf_tournament_result_marks (
      tournament_id, team_id, state, reason, snapshot, created_by)
    SELECT p_id, v_t.team_id, 'official', nullif(btrim(coalesce(p_reason, '')), ''),
      coalesce(jsonb_agg(jsonb_build_object(
        'round_event_id', pr.round_event_id, 'player_id', pr.player_id,
        'round_id', pr.round_id, 'entered_total', pr.entered_total,
        'status', pr.status) ORDER BY pr.round_event_id, pr.player_id), '[]'::jsonb),
      (SELECT auth.uid())
    FROM public.golf_tournament_player_rounds pr
    JOIN public.golf_tournament_rounds r ON r.round_event_id = pr.round_event_id
    WHERE r.tournament_id = p_id;
  ELSIF p_state = 'reopened' THEN
    IF btrim(coalesce(p_reason, '')) = '' THEN
      RAISE EXCEPTION 'reason_required' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.golf_tournaments t SET official_at = NULL WHERE t.id = p_id;
    INSERT INTO public.golf_tournament_result_marks (
      tournament_id, team_id, state, reason, created_by)
    VALUES (p_id, v_t.team_id, 'reopened', left(btrim(p_reason), 280), (SELECT auth.uid()));
  ELSE
    RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001';
  END IF;
END $$;

-- 10. Publish: stamps when the lineup is (or will be) shown. It sends
-- nothing; reveal_at joins it with 100300.
create or replace function public.golf_tournament_publish(
    p_id uuid, p_at timestamptz default null
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
DECLARE
  v_team uuid;
  v_at timestamptz := greatest(coalesce(p_at, now()), now());
BEGIN
  SELECT t.team_id INTO v_team FROM public.golf_tournaments t WHERE t.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_golf_team_coach(v_team) THEN
    RAISE EXCEPTION 'not_coach' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.golf_tournament_entries en WHERE en.tournament_id = p_id) THEN
    RAISE EXCEPTION 'lineup_empty' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.golf_tournaments t SET lineup_published_at = v_at WHERE t.id = p_id;
  RETURN v_at;
END $$;

-- 11. Link candidates (read only): the team's players' completed, non-test
-- GolfHelm rounds of the last 400 days that are not linked to a tournament
-- round and not dismissed. Coaches only; 500 newest at most.
create or replace function public.golf_tournament_link_candidates(p_team_id uuid)
returns table (
    round_id uuid,
    player_id uuid,
    round_date date,
    course_id uuid,
    course_name text,
    total_score integer,
    holes_played integer,
    score_to_par integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
BEGIN
  IF p_team_id IS NULL OR NOT public.is_golf_team_coach(p_team_id) THEN
    RAISE EXCEPTION 'not_coach' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY
  SELECT r.id, r.player_id, r.round_date::date, r.course_id, r.course_name::text,
    r.total_score::integer, r.holes_played::integer, r.score_to_par::integer
  FROM public.golf_rounds r
  JOIN public.golf_team_members m ON m.player_id = r.player_id AND m.team_id = p_team_id
  WHERE r.status = 'completed' AND NOT r.is_test
    AND r.round_date >= current_date - 400
    AND NOT EXISTS (
      SELECT 1 FROM public.golf_tournament_player_rounds pr WHERE pr.round_id = r.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.golf_tournament_link_dismissals d
      WHERE d.team_id = p_team_id AND d.round_id = r.id)
  ORDER BY r.round_date DESC, r.id
  LIMIT 500;
END $$;

-- 12. Grants: nothing for PUBLIC or anon; authenticated and service_role
-- execute (the policies and the coach checks above decide the rest).
do $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.golf_tournament_create(jsonb)',
    'public.golf_tournament_update(uuid, jsonb, integer)',
    'public.golf_tournament_delete(uuid, boolean)',
    'public.golf_tournament_set_entries(uuid, jsonb, integer)',
    'public.golf_tournament_lock_lineup(uuid)',
    'public.golf_tournament_substitute(uuid, uuid, uuid)',
    'public.golf_tournament_set_round_status(uuid, text, text)',
    'public.golf_tournament_mark(uuid, text, text)',
    'public.golf_tournament_publish(uuid, timestamptz)',
    'public.golf_tournament_link_candidates(uuid)'
  ]
  LOOP
    EXECUTE format('revoke all on function %s from public, anon', f);
    EXECUTE format('grant execute on function %s to authenticated, service_role', f);
  END LOOP;
END $$;

comment on function public.golf_tournament_update(uuid, jsonb, integer) is
'P016 Tournaments: compare-and-set edit of a tournament (P0001 stale when '
'version moved). HELD 20261024100200.';
comment on function helm_private.guard_tournament_lineup() is
'P016 Tournaments: refuses entry and round-lineup changes after the lineup '
'locks, unless helm.tournament_write = substitute (golf_tournament_substitute). '
'HELD 20261024100200.';
