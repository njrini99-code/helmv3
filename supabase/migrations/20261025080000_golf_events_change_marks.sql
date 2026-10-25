-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- Apply: npm run db:apply --
-- supabase/migrations/20261025080000_golf_events_change_marks.sql
-- Risk: MEDIUM. Adds the first mark-writing trigger on golf_events, the table
-- every calendar reads and writes. It never blocks a write and raises nothing;
-- the only columns it changes are metadata->'change' and, on a tracked change,
-- updated_at.
--
-- Why (handoff 4.34 P-14, build-plans/P-14-change-marks.md): after a coach
-- moves, re-times, relocates, renames or cancels an event, everyone who can see
-- it sees the new value with the old one struck through. The mark is written
-- here so every write path is covered (Clubhouse, Fairway, drag, both series
-- paths in recurring-events.ts, Team Hub) and the baseline is read from OLD
-- inside the writing transaction. The trigger owns metadata->'change': a client
-- value under that key is always replaced by the stored one, so nobody can
-- forge a mark.
--
-- Rules:
--   * Tracked: start_time, end_time, all_day, location (trimmed, '' as null),
--     title, event_type, cancelled (status = 'cancelled'). Class rows
--     (event_type = 'class') are never marked.
--   * A session is open while it is unsettled and its first_at is under 30
--     minutes old (a text compare in one ISO format, no cast). Edits in an open
--     session keep its baseline ("from"), so many quick edits make one mark
--     showing the value invitees last knew. After 30 minutes the next edit
--     starts a new session (new id, new baseline) and keeps the old one as
--     "prior".
--   * An edit that returns every field to the baseline removes the mark and
--     restores "prior", if any.
--   * title and event_type are quiet when pg_trigger_depth() > 1 (a sync
--     trigger's own write) or helm.tournament_write = 'rounds' (P-5's create
--     and convert RPC): the baseline follows the new value, so no mark is made
--     and no stale "Renamed" shows later. A location (course) change is still
--     marked.
--   * Occurrences of one series edited by the same coach within 10 minutes
--     share one session id: a sibling's open session is looked up, and a BEFORE
--     ROW trigger sees the rows an earlier row of the same statement already
--     updated.
--   * On a tracked change updated_at is set to now(), so series edits (which
--     never set it) move the phone feed's SEQUENCE too (P-3).
--   * INSERT strips any client-sent change key.
--   * A delivery writer (a later push sender, if the owner chooses automatic
--     pushes) bypasses all of this by setting the transaction-local setting
--     helm.change_mark_writer = 'on' inside its own definer function. PostgREST
--     gives clients no way to run set_config, so only such a function can.
--     Nothing in this version writes it: version B of the 12.5 call sends no
--     automatic push, so no mark is ever settled and every session closes by
--     the 30-minute rule above.
--   * "by" is golf_coaches.id of the latest editor; "by_names" holds up to
--     three golf_coaches.full_name in order of first edit.
--
-- golf_change_marks_capability() tells the app (service role only) whether the
-- mark trigger is installed (marks) and whether an outbox sender exists
-- (pushes, false here).
--
-- ORDER: apply AFTER 20261025030000_golf_events_touch_updated_at.sql (P-4). The
-- BEFORE UPDATE triggers fire by name: golf_events_change_mark, then
-- golf_events_touch_updated_at, then golf_events_tournament_round_guard (P-5).
-- P-4's trigger skips writes made under helm.change_mark_writer, which is what
-- keeps a delivery write from reading as a new change. Neither updated_at
-- writer is enough alone: this one skips notes, replies and course_id edits;
-- P-4's bumps every real row change.
--
-- VERIFY: SELECT 1 FROM pg_trigger WHERE tgrelid =
-- VERIFY:   'public.golf_events'::regclass AND tgname =
-- VERIFY:   'golf_events_change_mark' AND NOT tgisinternal;
-- VERIFY: SELECT 1 FROM pg_proc WHERE oid =
-- VERIFY:   'public.golf_events_change_mark()'::regprocedure AND prosecdef AND
-- VERIFY:   proconfig @> ARRAY['search_path=""'];
-- VERIFY: SELECT 1 WHERE NOT has_function_privilege('authenticated',
-- VERIFY:   'public.golf_events_change_mark()', 'EXECUTE');
-- VERIFY: SELECT 1 WHERE has_function_privilege('service_role',
-- VERIFY:   'public.golf_change_marks_capability()', 'EXECUTE') AND NOT
-- VERIFY:   has_function_privilege('authenticated',
-- VERIFY:   'public.golf_change_marks_capability()', 'EXECUTE');
-- VERIFY: SELECT 1 FROM public.golf_change_marks_capability() WHERE marks;
-- ROLLBACK: DROP TRIGGER IF EXISTS golf_events_change_mark ON
-- ROLLBACK:   public.golf_events;
-- ROLLBACK: DROP FUNCTION IF EXISTS public.golf_events_change_mark();
-- ROLLBACK: DROP FUNCTION IF EXISTS public.golf_change_marks_capability();
-- ROLLBACK: Marks already written stay in metadata->'change', inert and
-- ROLLBACK:   expiring on screen after 72 hours; clear them with UPDATE
-- ROLLBACK:   public.golf_events SET metadata = metadata - 'change' WHERE
-- ROLLBACK:   metadata ? 'change';

SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.golf_events_change_mark()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_prev       jsonb;
  v_prior      jsonb;
  v_base       jsonb;
  v_old        jsonb;
  v_new        jsonb;
  v_sib        jsonb;
  v_names      jsonb;
  v_fields     text[];
  v_uid        uuid := auth.uid();
  v_coach      uuid;
  v_name       text;
  v_id         uuid;
  v_root       uuid;
  v_first      text;
  v_open       boolean;
  v_quiet      boolean;
  v_now        text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_cutoff     text := to_char((now() - interval '30 minutes') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_sib_cutoff text := to_char((now() - interval '10 minutes') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  IF NEW.metadata IS NULL THEN
    NEW.metadata := '{}'::jsonb;
  END IF;
  -- Marks live only in an object; any other shape is left exactly as written.
  IF jsonb_typeof(NEW.metadata) <> 'object' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.metadata := NEW.metadata - 'change';
    RETURN NEW;
  END IF;

  -- A delivery writer records that players were told; it is not a change.
  IF current_setting('helm.change_mark_writer', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- The stored mark wins over anything a client sent under "change".
  v_prev := CASE WHEN jsonb_typeof(OLD.metadata) = 'object' THEN OLD.metadata -> 'change' END;
  IF jsonb_typeof(v_prev) IS DISTINCT FROM 'object' THEN
    v_prev := NULL;
  END IF;
  NEW.metadata := NEW.metadata - 'change';
  IF v_prev IS NOT NULL THEN
    NEW.metadata := NEW.metadata || jsonb_build_object('change', v_prev);
  END IF;

  IF NEW.event_type = 'class' OR OLD.event_type = 'class' THEN
    RETURN NEW;
  END IF;

  v_quiet := pg_trigger_depth() > 1 OR COALESCE(current_setting('helm.tournament_write', true), '') = 'rounds';

  v_old := jsonb_build_object(
    'start_time', to_char(OLD.start_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'end_time',   to_char(OLD.end_time   AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'all_day',    COALESCE(OLD.all_day, false),
    'location',   NULLIF(btrim(COALESCE(OLD.location, '')), ''),
    'title',      OLD.title,
    'event_type', OLD.event_type,
    'cancelled',  COALESCE(OLD.status, '') = 'cancelled'
  );
  v_new := jsonb_build_object(
    'start_time', to_char(NEW.start_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'end_time',   to_char(NEW.end_time   AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'all_day',    COALESCE(NEW.all_day, false),
    'location',   NULLIF(btrim(COALESCE(NEW.location, '')), ''),
    'title',      NEW.title,
    'event_type', NEW.event_type,
    'cancelled',  COALESCE(NEW.status, '') = 'cancelled'
  );
  -- A quiet key's baseline follows the new value.
  IF v_quiet THEN
    v_old := v_old || jsonb_build_object('title', NEW.title, 'event_type', NEW.event_type);
  END IF;

  v_open := v_prev IS NOT NULL
        AND (v_prev ->> 'v') = '1'
        AND (v_prev ->> 'settled_at') IS NULL
        AND (v_prev ->> 'first_at') > v_cutoff;

  v_prior := CASE WHEN v_prev IS NOT NULL AND (v_prev ->> 'v') = '1' THEN v_prev - 'prior' END;

  IF v_old = v_new THEN
    -- Nothing tracked changed (a notes, reply or course_id edit): the mark is left as it is, except that a quiet write
    -- rebases an open session's baseline so a title or type it already moved cannot read as a change later.
    IF v_quiet AND v_open THEN
      v_base := (v_prev -> 'from') || jsonb_build_object('title', NEW.title, 'event_type', NEW.event_type);
      IF v_base IS DISTINCT FROM (v_prev -> 'from') THEN
        SELECT array_agg(t.k ORDER BY t.k) INTO v_fields
        FROM jsonb_object_keys(v_new) AS t(k)
        WHERE (v_base -> t.k) IS DISTINCT FROM (v_new -> t.k);
        IF v_fields IS NULL THEN
          NEW.metadata := NEW.metadata - 'change';
          IF v_prev -> 'prior' IS NOT NULL THEN
            NEW.metadata := NEW.metadata || jsonb_build_object('change', v_prev -> 'prior');
          END IF;
        ELSE
          NEW.metadata := NEW.metadata || jsonb_build_object('change', v_prev || jsonb_build_object('from', v_base, 'fields', to_jsonb(v_fields)));
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  NEW.updated_at := now();

  IF v_uid IS NOT NULL THEN
    SELECT c.id, NULLIF(btrim(c.full_name), '') INTO v_coach, v_name
    FROM public.golf_coaches c
    WHERE c.user_id = v_uid
    ORDER BY c.created_at
    LIMIT 1;
  END IF;

  IF v_open THEN
    -- Open session: keep its baseline, id, first edit, names and prior.
    v_base  := v_prev -> 'from';
    v_id    := (v_prev ->> 'id')::uuid;
    v_first := v_prev ->> 'first_at';
    v_names := COALESCE(v_prev -> 'by_names', '[]'::jsonb);
    v_prior := v_prev -> 'prior';
  ELSE
    -- New session from what invitees last saw.
    v_base  := v_old;
    v_first := v_now;
    v_names := '[]'::jsonb;
    -- A series occurrence joins the session a sibling's edit by the same coach opened in the last 10 minutes.
    IF NEW.parent_event_id IS NOT NULL OR NEW.recurrence_rule IS NOT NULL THEN
      v_root := COALESCE(NEW.parent_event_id, NEW.id);
      SELECT e.metadata -> 'change' INTO v_sib
      FROM public.golf_events e
      WHERE e.id <> NEW.id
        AND e.team_id = NEW.team_id
        AND (e.parent_event_id = v_root OR e.id = v_root)
        AND jsonb_typeof(e.metadata) = 'object'
        AND (e.metadata -> 'change' ->> 'at') > v_sib_cutoff
        AND (e.metadata -> 'change' ->> 'settled_at') IS NULL
        AND (e.metadata -> 'change' ->> 'v') = '1'
        AND (e.metadata -> 'change' ->> 'by') IS NOT DISTINCT FROM v_coach::text
      ORDER BY e.metadata -> 'change' ->> 'at' DESC
      LIMIT 1;
      IF v_sib IS NOT NULL THEN
        v_id    := (v_sib ->> 'id')::uuid;
        v_first := v_sib ->> 'first_at';
      END IF;
    END IF;
    v_id := COALESCE(v_id, gen_random_uuid());
  END IF;

  IF v_quiet THEN
    v_base := v_base || jsonb_build_object('title', NEW.title, 'event_type', NEW.event_type);
  END IF;

  SELECT array_agg(t.k ORDER BY t.k) INTO v_fields
  FROM jsonb_object_keys(v_new) AS t(k)
  WHERE (v_base -> t.k) IS DISTINCT FROM (v_new -> t.k);

  IF v_fields IS NULL THEN
    -- Back where invitees last saw it: no mark.
    NEW.metadata := NEW.metadata - 'change';
    IF v_prior IS NOT NULL THEN
      NEW.metadata := NEW.metadata || jsonb_build_object('change', v_prior);
    END IF;
    RETURN NEW;
  END IF;

  IF v_name IS NOT NULL AND NOT (v_names @> jsonb_build_array(v_name)) THEN
    v_names := v_names || jsonb_build_array(v_name);
    IF jsonb_array_length(v_names) > 3 THEN
      v_names := v_names - 0;
    END IF;
  END IF;

  NEW.metadata := NEW.metadata || jsonb_build_object(
    'change',
    jsonb_build_object(
      'v',        1,
      'id',       v_id,
      'first_at', v_first,
      'at',       v_now,
      'by',       v_coach,
      'by_names', v_names,
      'from',     v_base,
      'fields',   to_jsonb(v_fields)
    ) || CASE WHEN v_prior IS NOT NULL THEN jsonb_build_object('prior', v_prior) ELSE '{}'::jsonb END
  );
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.golf_events_change_mark()
FROM public, anon, authenticated;

COMMENT ON FUNCTION public.golf_events_change_mark() IS
'P-14 change marks: owns golf_events.metadata.change (what changed, from what, '
'by whom, when). See build-plans/P-14-change-marks.md.';

CREATE OR REPLACE TRIGGER golf_events_change_mark
BEFORE INSERT OR UPDATE ON public.golf_events
FOR EACH ROW EXECUTE FUNCTION public.golf_events_change_mark();

-- What this database can do for change marks. Service role only (the app reads
-- it with the admin client and caches it).
CREATE OR REPLACE FUNCTION public.golf_change_marks_capability()
RETURNS TABLE (marks boolean, pushes boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid = 'public.golf_events'::regclass
        AND t.tgname = 'golf_events_change_mark'
        AND NOT t.tgisinternal
        AND t.tgenabled <> 'D'
    ),
    pg_catalog.to_regclass('public.golf_event_change_outbox') IS NOT NULL;
$fn$;

REVOKE ALL ON FUNCTION public.golf_change_marks_capability()
FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golf_change_marks_capability() TO service_role;

COMMENT ON FUNCTION public.golf_change_marks_capability() IS
'P-14: whether the change-mark trigger is installed (marks) and an outbox '
'sender exists (pushes). Service role only.';
