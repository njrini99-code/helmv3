-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md). Messages v2 redesign (not
-- a security fix).
-- Apply:
--   npm run db:apply -- \
--     supabase/migrations/20261107090400_golf_player_next_class.sql
-- Risk: LOW. One new function; no table, policy or grant on an existing
-- object changes. Nothing calls it until the Details panel ships.
--
-- Purpose: the Messages Details card "Class status" says "No classes today.
-- Next: Monday 9:05 AM, Statistics". The existing reads answer one calendar
-- day (golf_team_class_day, golf_my_class_day); this answers "when is this
-- player's next class block after a moment".
--
-- golf_player_next_class(p_team_id, p_player_id, p_from) returns jsonb
--   {"starts_at": timestamptz, "ends_at": timestamptz, "label": text,
--    "kind": "class"|"exam", "time_zone": text}
-- or NULL (no block in the next 15 days, no usable class, or the player does
-- not share class status). The client formats the instants in `time_zone`
-- (the zone of the term covering p_from, else the team's zone, else
-- America/New_York).
--
-- Privacy (minors; class names are coach-private):
--   * Coach only: a caller who is not a coach of p_team_id gets 42501 (as
--     golf_team_class_day does).
--   * Sharing: golf_player_shares_class_status(p_team_id, p_player_id) must
--     be true. It is also false for a player who is not an ACTIVE member of
--     that team, so a coach cannot read another team's player by passing
--     their id. A player who turned sharing off, a player with no schedule
--     and a player on another team all answer NULL, indistinguishably.
--   * p_from is limited to [now - 7 days, now + 14 days], the same window
--     golf_team_class_day accepts (22023 outside).
--   * It reads only through golf_class_blocks_internal, the one definition of
--     "who is in class", so every suppression (travel, accepted events,
--     exceptions, academic exclusions) applies.
--   * SECURITY DEFINER because golf_class_blocks_internal has no client
--     grant. search_path pinned; EXECUTE revoked from PUBLIC and anon
--     (anon_surface_guard.sql).
--
-- App change needed (package D): call it from the Details class line for
-- coach viewers only; render nothing on NULL.
--
-- ORDER: after the class awareness migrations (20261025070000 / 070100 /
-- 070200, applied on production).
--
-- VERIFY: select 1 where to_regprocedure('public.golf_player_next_class(uuid,uuid,timestamptz)') is not null and has_function_privilege('authenticated', 'public.golf_player_next_class(uuid,uuid,timestamptz)', 'execute') and not has_function_privilege('anon', 'public.golf_player_next_class(uuid,uuid,timestamptz)', 'execute'); -- noqa: LT05
-- VERIFY: select 1 from pg_proc where oid = 'public.golf_player_next_class(uuid,uuid,timestamptz)'::regprocedure and prosecdef and proconfig @> array['search_path=public, pg_temp']; -- noqa: LT05
--
-- ROLLBACK (one statement; nothing depends on the function yet):
--   drop function if exists
--     public.golf_player_next_class(uuid, uuid, timestamptz);
-- pgTAP: supabase/tests/rls/golf_player_next_class.sql

SET lock_timeout = '3s';

DO $$
BEGIN
  IF to_regprocedure(
       'public.golf_class_blocks_internal(uuid,date,uuid)'
     ) IS NULL
     OR to_regprocedure(
       'public.golf_player_shares_class_status(uuid,uuid)'
     ) IS NULL
     OR to_regprocedure('public.golf_class_term_at(uuid,timestamptz)') IS NULL
     OR to_regprocedure('public.golf_safe_time_zone(text)') IS NULL
     OR to_regprocedure('public.is_golf_team_coach(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'the class awareness functions (%) must be applied first',
      '20261025070000 / 070100';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.golf_player_next_class(
    p_team_id uuid,
    p_player_id uuid,
    p_from timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from    timestamptz := coalesce(p_from, now());
  v_team_tz text;
  v_term    public.golf_team_terms;
  v_zone    text;
  v_start   date;
  v_block   record;
  i         integer;
BEGIN
  IF p_team_id IS NULL OR p_player_id IS NULL
     OR NOT public.is_golf_team_coach(p_team_id) THEN
    RAISE EXCEPTION 'not a coach of this team' USING ERRCODE = '42501';
  END IF;

  IF v_from < now() - interval '7 days'
     OR v_from > now() + interval '14 days' THEN
    RAISE EXCEPTION 'time out of range' USING ERRCODE = '22023';
  END IF;

  -- Not shared, not an active member of this team, or not a player at all:
  -- nothing to say.
  IF NOT public.golf_player_shares_class_status(p_team_id, p_player_id) THEN
    RETURN NULL;
  END IF;

  SELECT public.golf_safe_time_zone(s.timezone) INTO v_team_tz
  FROM public.golf_team_settings s WHERE s.team_id = p_team_id LIMIT 1;
  v_team_tz := coalesce(v_team_tz, 'America/New_York');

  -- The date rule of golf_team_class_day: the zone of the term covering the
  -- instant, else the team zone.
  v_term := public.golf_class_term_at(p_team_id, v_from);
  v_zone := coalesce(v_term.time_zone, v_team_tz);
  v_start := (v_from AT TIME ZONE v_zone)::date;

  FOR i IN 0..14 LOOP
    SELECT bl.starts_at, bl.ends_at, bl.label, bl.kind
    INTO v_block
    FROM public.golf_class_blocks_internal(
      p_team_id, v_start + i, p_player_id
    ) bl
    WHERE bl.starts_at > v_from
    ORDER BY bl.starts_at
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'starts_at', v_block.starts_at,
        'ends_at', v_block.ends_at,
        'label', v_block.label,
        'kind', v_block.kind,
        'time_zone', v_zone
      );
    END IF;
  END LOOP;

  RETURN NULL;
END $$;

REVOKE ALL
ON FUNCTION public.golf_player_next_class(uuid, uuid, timestamptz)
FROM public, anon;
GRANT EXECUTE
ON FUNCTION public.golf_player_next_class(uuid, uuid, timestamptz)
TO authenticated, service_role;
