-- A completed round's score history is immutable. The editorial AI recap is
-- derived presentation data, not score history, so it needs a narrowly scoped
-- write capability rather than a general completed-round UPDATE exception.
--
-- The public function is SECURITY INVOKER and forwards the caller identity to
-- the private SECURITY DEFINER implementation. The private implementation
-- rechecks player/coach access, locks a completed round, sets the single-use
-- lifecycle capability locally, then changes only recap columns.

CREATE SCHEMA IF NOT EXISTS helm_private;

CREATE OR REPLACE FUNCTION helm_private.guard_golf_round_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF current_user = 'postgres'
    AND current_setting('helm.golf_lifecycle_write', true) = 'atomic' THEN
    RETURN coalesce(new, old);
  END IF;

  IF tg_op = 'UPDATE'
    AND old.status = 'completed'
    AND current_user IN ('postgres', 'service_role')
    AND current_setting('helm.golf_lifecycle_write', true) = 'stats_cache'
    AND (to_jsonb(new) - ARRAY[
      'strokes_gained_total', 'strokes_gained_tee', 'strokes_gained_approach',
      'strokes_gained_around_green', 'strokes_gained_putting'
    ]) = (to_jsonb(old) - ARRAY[
      'strokes_gained_total', 'strokes_gained_tee', 'strokes_gained_approach',
      'strokes_gained_around_green', 'strokes_gained_putting'
    ]) THEN
    RETURN new;
  END IF;

  IF tg_op = 'UPDATE'
    AND old.status = 'completed'
    AND current_user = 'postgres'
    AND current_setting('helm.golf_lifecycle_write', true) = 'round_recap'
    AND (to_jsonb(new) - ARRAY['ai_recap', 'ai_recap_generated_at'])
      = (to_jsonb(old) - ARRAY['ai_recap', 'ai_recap_generated_at']) THEN
    RETURN new;
  END IF;

  IF tg_op = 'UPDATE'
    AND old.status = 'completed'
    AND current_user = 'postgres'
    AND current_setting('helm.golf_lifecycle_write', true) = 'coachhelm_terminal'
    AND (to_jsonb(new) - ARRAY[
      'coachhelm_analyzed_at', 'coachhelm_failed_at', 'coachhelm_failure_reason'
    ]) = (to_jsonb(old) - ARRAY[
      'coachhelm_analyzed_at', 'coachhelm_failed_at', 'coachhelm_failure_reason'
    ]) THEN
    RETURN new;
  END IF;

  IF tg_op = 'UPDATE'
    AND old.status = 'completed'
    AND current_user = 'postgres'
    AND current_setting('helm.golf_lifecycle_write', true) = 'reclassify'
    AND (to_jsonb(new) - ARRAY[
      'round_type', 'qualifier_id', 'qualifier_round_number'
    ]) = (to_jsonb(old) - ARRAY[
      'round_type', 'qualifier_id', 'qualifier_round_number'
    ]) THEN
    RETURN new;
  END IF;

  IF tg_op = 'INSERT' AND new.status = 'completed' THEN
    RAISE EXCEPTION USING
      errcode = '55000',
      message = 'Completed rounds must be submitted through the protected round-submit flow.';
  END IF;

  IF tg_op = 'DELETE' AND old.status = 'completed' THEN
    RAISE EXCEPTION USING
      errcode = '55000',
      message = 'Completed rounds are permanent history and cannot be deleted.';
  END IF;

  IF tg_op = 'UPDATE' THEN
    IF old.status = 'completed' THEN
      RAISE EXCEPTION USING
        errcode = '55000',
        message = 'Completed rounds are permanent history and cannot be changed.';
    END IF;
    IF new.status = 'completed' THEN
      RAISE EXCEPTION USING
        errcode = '55000',
        message = 'Completed rounds must be submitted through the protected round-submit flow.';
    END IF;
    IF new.player_id IS DISTINCT FROM old.player_id
      OR new.team_id IS DISTINCT FROM old.team_id
      OR new.round_type IS DISTINCT FROM old.round_type
      OR new.qualifier_id IS DISTINCT FROM old.qualifier_id
      OR new.qualifier_round_number IS DISTINCT FROM old.qualifier_round_number THEN
      RAISE EXCEPTION USING
        errcode = '55000',
        message = 'A started round keeps its original qualifier identity. Resume or discard it instead of changing it.';
    END IF;
  END IF;

  RETURN coalesce(new, old);
END;
$$;

CREATE OR REPLACE FUNCTION helm_private.save_round_ai_recap(
  p_round_id uuid,
  p_recap text,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_player_id uuid;
  v_recap text;
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Sign in to save a round recap.';
  END IF;

  v_recap := btrim(coalesce(p_recap, ''));
  IF char_length(v_recap) < 30 OR char_length(v_recap) > 400 THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'Round recap must be between 30 and 400 characters.';
  END IF;

  SELECT player_id
  INTO v_player_id
  FROM public.golf_rounds
  WHERE id = p_round_id
    AND status = 'completed'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'Completed round not found.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.golf_players
    WHERE id = v_player_id
      AND user_id = p_actor_user_id
  ) AND NOT coalesce(public.verify_coach_owns_player(v_player_id, p_actor_user_id), false) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'You do not have access to this round.';
  END IF;

  PERFORM set_config('helm.golf_lifecycle_write', 'round_recap', true);

  UPDATE public.golf_rounds
  SET ai_recap = v_recap,
      ai_recap_generated_at = now()
  WHERE id = p_round_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION helm_private.save_round_ai_recap(uuid, text, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.save_round_ai_recap(
  p_round_id uuid,
  p_recap text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT helm_private.save_round_ai_recap(p_round_id, p_recap, auth.uid());
$$;

REVOKE ALL ON FUNCTION public.save_round_ai_recap(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_round_ai_recap(uuid, text) TO authenticated;
