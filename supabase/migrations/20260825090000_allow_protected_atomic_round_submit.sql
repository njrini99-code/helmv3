-- The terminal submit RPC owns authorization and durable qualifier identity.
--
-- `submit_round_atomic` first locks an in-progress round belonging to the
-- authenticated player, then preserves the persisted qualifier identity (with
-- the one validated legacy-number fill path) before setting this transaction
-- capability.  Re-checking every identity field here was redundant and, for a
-- rejected caller, could turn its controlled "no permission" result into a
-- trigger exception.  Keep the capability narrow: only postgres executing the
-- protected atomic UPDATE may pass; every direct write still reaches the
-- lifecycle guard below.

CREATE OR REPLACE FUNCTION helm_private.guard_golf_round_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO pg_catalog, public
AS $$
BEGIN
  IF current_user = 'postgres'
    AND current_setting('helm.golf_lifecycle_write', true) = 'atomic'
    AND TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'completed'
    AND current_user IN ('postgres', 'service_role')
    AND current_setting('helm.golf_lifecycle_write', true) = 'stats_cache'
    AND (to_jsonb(NEW) - ARRAY[
      'strokes_gained_total', 'strokes_gained_tee', 'strokes_gained_approach',
      'strokes_gained_around_green', 'strokes_gained_putting'
    ]) = (to_jsonb(OLD) - ARRAY[
      'strokes_gained_total', 'strokes_gained_tee', 'strokes_gained_approach',
      'strokes_gained_around_green', 'strokes_gained_putting'
    ]) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'completed'
    AND current_user = 'postgres'
    AND current_setting('helm.golf_lifecycle_write', true) = 'round_recap'
    AND (to_jsonb(NEW) - ARRAY['ai_recap', 'ai_recap_generated_at'])
      = (to_jsonb(OLD) - ARRAY['ai_recap', 'ai_recap_generated_at']) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'completed'
    AND current_user = 'postgres'
    AND current_setting('helm.golf_lifecycle_write', true) = 'coachhelm_terminal'
    AND (to_jsonb(NEW) - ARRAY[
      'coachhelm_analyzed_at', 'coachhelm_failed_at', 'coachhelm_failure_reason'
    ]) = (to_jsonb(OLD) - ARRAY[
      'coachhelm_analyzed_at', 'coachhelm_failed_at', 'coachhelm_failure_reason'
    ]) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'completed'
    AND current_user = 'postgres'
    AND current_setting('helm.golf_lifecycle_write', true) = 'reclassify'
    AND (to_jsonb(NEW) - ARRAY[
      'round_type', 'qualifier_id', 'qualifier_round_number'
    ]) = (to_jsonb(OLD) - ARRAY[
      'round_type', 'qualifier_id', 'qualifier_round_number'
    ]) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Completed rounds must be submitted through the protected round-submit flow.';
  END IF;

  IF TG_OP = 'DELETE' AND OLD.status = 'completed' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Completed rounds are permanent history and cannot be deleted.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'completed' THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'Completed rounds are permanent history and cannot be changed.';
    END IF;
    IF NEW.status = 'completed' THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'Completed rounds must be submitted through the protected round-submit flow.';
    END IF;
    IF NEW.player_id IS DISTINCT FROM OLD.player_id
      OR NEW.team_id IS DISTINCT FROM OLD.team_id
      OR NEW.round_type IS DISTINCT FROM OLD.round_type
      OR NEW.qualifier_id IS DISTINCT FROM OLD.qualifier_id
      OR NEW.qualifier_round_number IS DISTINCT FROM OLD.qualifier_round_number THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'A started round keeps its original qualifier identity. Resume or discard it instead of changing it.';
    END IF;
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION helm_private.guard_golf_round_lifecycle() FROM public,
anon,
authenticated;

COMMENT ON FUNCTION helm_private.guard_golf_round_lifecycle()
IS
'Blocks direct completed-round mutation and started-round identity changes. '
'The protected atomic submit RPC is the sole terminal-write bypass and '
'enforces its own player authorization and durable qualifier identity.';
