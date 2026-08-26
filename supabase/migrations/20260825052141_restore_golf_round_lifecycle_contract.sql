-- Restore the lifecycle boundary required by round tracking when this branch
-- is replayed from its migration history. Production has equivalent objects;
-- this is intentionally idempotent so a fresh local database does not omit
-- them. It protects persisted player progress from stale clients and direct
-- PostgREST writes without broadening any client role.

BEGIN;

CREATE SCHEMA IF NOT EXISTS helm_private;
REVOKE ALL ON SCHEMA helm_private FROM public, anon, authenticated;

-- The protected save and submit RPCs are the only paths allowed to replace a
-- round's child graph or transition it to completed. The transaction-local
-- marker is checked by the triggers below; it cannot be supplied by a browser
-- request.
DO $$
DECLARE
  fn_definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO fn_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'save_partial_round_atomic';

  IF fn_definition IS NULL OR position('helm.golf_lifecycle_write' IN fn_definition) = 0 THEN
    IF fn_definition IS NULL THEN
      RAISE EXCEPTION 'save_partial_round_atomic not found';
    END IF;
    fn_definition := regexp_replace(
      fn_definition,
      E'\nBEGIN\n',
      E'\nBEGIN\n  PERFORM set_config(''helm.golf_lifecycle_write'', ''atomic'', true);\n',
      1, 1, ''
    );
    IF position('helm.golf_lifecycle_write' IN fn_definition) = 0 THEN
      RAISE EXCEPTION 'save_partial_round_atomic body changed; refusing unsafe lifecycle patch';
    END IF;
    EXECUTE fn_definition;
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO fn_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'submit_round_atomic';

  IF fn_definition IS NULL OR position('helm.golf_lifecycle_write' IN fn_definition) = 0 THEN
    IF fn_definition IS NULL THEN
      RAISE EXCEPTION 'submit_round_atomic not found';
    END IF;
    fn_definition := regexp_replace(
      fn_definition,
      E'\nBEGIN\n',
      E'\nBEGIN\n  PERFORM set_config(''helm.golf_lifecycle_write'', ''atomic'', true);\n',
      1, 1, ''
    );
    IF position('helm.golf_lifecycle_write' IN fn_definition) = 0 THEN
      RAISE EXCEPTION 'submit_round_atomic body changed; refusing unsafe lifecycle patch';
    END IF;
    EXECUTE fn_definition;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION helm_private.reject_completed_round_child_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO pg_catalog, public
AS $$
DECLARE
  target_round_id uuid;
BEGIN
  IF current_user = 'postgres'
    AND current_setting('helm.golf_lifecycle_write', true) = 'atomic' THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  target_round_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.round_id ELSE OLD.round_id END;
  IF EXISTS (
    SELECT 1 FROM public.golf_rounds
    WHERE status = 'completed'
      AND id IN (target_round_id, CASE WHEN TG_OP = 'UPDATE' THEN NEW.round_id END)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'This round is already completed and its saved shots cannot be changed.';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION
helm_private.reject_completed_round_child_mutation()
FROM public,
anon,
authenticated;

DROP TRIGGER IF EXISTS golf_holes_reject_completed_round_mutation
ON public.golf_holes;
CREATE TRIGGER golf_holes_reject_completed_round_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.golf_holes
FOR EACH ROW
EXECUTE FUNCTION helm_private.reject_completed_round_child_mutation();

DROP TRIGGER IF EXISTS golf_shots_reject_completed_round_mutation
ON public.golf_shots;
CREATE TRIGGER golf_shots_reject_completed_round_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.golf_shots
FOR EACH ROW
EXECUTE FUNCTION helm_private.reject_completed_round_child_mutation();

CREATE OR REPLACE FUNCTION helm_private.reject_completed_round_detail_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO pg_catalog, public
AS $$
DECLARE
  old_shot_id uuid;
  new_shot_id uuid;
BEGIN
  IF current_user = 'postgres'
    AND current_setting('helm.golf_lifecycle_write', true) = 'atomic' THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  old_shot_id := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.shot_id END;
  new_shot_id := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.shot_id END;
  IF EXISTS (
    SELECT 1
    FROM public.golf_shots s
    JOIN public.golf_rounds r ON r.id = s.round_id
    WHERE r.status = 'completed' AND s.id IN (old_shot_id, new_shot_id)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'This round is already completed and its saved shot details cannot be changed.';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION
helm_private.reject_completed_round_detail_mutation()
FROM public,
anon,
authenticated;

DROP TRIGGER IF EXISTS putt_details_reject_completed_round_mutation
ON public.putt_details;
CREATE TRIGGER putt_details_reject_completed_round_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.putt_details
FOR EACH ROW
EXECUTE FUNCTION helm_private.reject_completed_round_detail_mutation();

DROP TRIGGER IF EXISTS approach_miss_details_reject_completed_round_mutation
ON public.approach_miss_details;
CREATE TRIGGER approach_miss_details_reject_completed_round_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.approach_miss_details
FOR EACH ROW
EXECUTE FUNCTION helm_private.reject_completed_round_detail_mutation();

CREATE OR REPLACE FUNCTION helm_private.guard_golf_round_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO pg_catalog, public
AS $$
BEGIN
  IF current_user = 'postgres'
    AND current_setting('helm.golf_lifecycle_write', true) = 'atomic' THEN
    -- The protected RPC may submit a round, but it may not make a stale
    -- payload retarget a saved qualifier or change its owner/team.
    IF TG_OP = 'UPDATE'
      AND (NEW.player_id IS DISTINCT FROM OLD.player_id
        OR NEW.team_id IS DISTINCT FROM OLD.team_id
        OR NEW.round_type IS DISTINCT FROM OLD.round_type
        OR NEW.qualifier_id IS DISTINCT FROM OLD.qualifier_id
        OR NEW.qualifier_round_number IS DISTINCT FROM OLD.qualifier_round_number)
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'A started round keeps its original qualifier identity. Resume or discard it instead of changing it.';
    END IF;
    RETURN coalesce(NEW, OLD);
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

DROP TRIGGER IF EXISTS golf_rounds_guard_lifecycle ON public.golf_rounds;
CREATE TRIGGER golf_rounds_guard_lifecycle
BEFORE INSERT OR UPDATE OR DELETE ON public.golf_rounds
FOR EACH ROW EXECUTE FUNCTION helm_private.guard_golf_round_lifecycle();

CREATE OR REPLACE FUNCTION public.record_round_coachhelm_terminal_state(
    p_round_id uuid,
    p_analyzed_at timestamptz,
    p_failed_at timestamptz,
    p_failure_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
DECLARE
  updated_round_id uuid;
BEGIN
  PERFORM set_config('helm.golf_lifecycle_write', 'coachhelm_terminal', true);
  UPDATE public.golf_rounds
  SET coachhelm_analyzed_at = p_analyzed_at,
      coachhelm_failed_at = p_failed_at,
      coachhelm_failure_reason = p_failure_reason
  WHERE id = p_round_id AND status = 'completed'
  RETURNING id INTO updated_round_id;
  RETURN updated_round_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_round_coachhelm_terminal_state(
    uuid, timestamptz, timestamptz, text
)
FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_round_coachhelm_terminal_state(
    uuid, timestamptz, timestamptz, text
)
TO service_role;

CREATE OR REPLACE FUNCTION public.reclassify_golf_round(
    p_round_id uuid,
    p_round_type text,
    p_qualifier_id uuid,
    p_qualifier_round_number integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
DECLARE
  v_round public.golf_rounds%ROWTYPE;
  v_updated_id uuid;
  v_is_owner boolean := false;
  v_is_coach boolean := false;
BEGIN
  IF p_round_type NOT IN ('practice', 'tournament', 'qualifier') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unsupported round type.';
  END IF;
  SELECT * INTO v_round FROM public.golf_rounds WHERE id = p_round_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.golf_players gp
    WHERE gp.id = v_round.player_id AND gp.user_id = auth.uid()
  ) INTO v_is_owner;
  SELECT public.is_golf_team_coach(v_round.team_id) INTO v_is_coach;
  IF NOT (v_is_owner OR coalesce(v_is_coach, false)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'You do not have permission to change this round.';
  END IF;
  IF p_round_type = 'qualifier' AND p_qualifier_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A qualifier round must be attached to a qualifier.';
  END IF;
  PERFORM set_config('helm.golf_lifecycle_write', 'reclassify', true);
  UPDATE public.golf_rounds
  SET round_type = p_round_type,
      qualifier_id = CASE WHEN p_round_type = 'qualifier' THEN p_qualifier_id ELSE NULL END,
      qualifier_round_number = CASE WHEN p_round_type = 'qualifier' THEN p_qualifier_round_number ELSE NULL END
  WHERE id = p_round_id
  RETURNING id INTO v_updated_id;
  RETURN v_updated_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reclassify_golf_round(
    uuid, text, uuid, integer
) FROM public,
anon;
GRANT EXECUTE ON FUNCTION public.reclassify_golf_round(
    uuid, text, uuid, integer
) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'golf_qualifiers_num_rounds_range'
      AND conrelid = 'public.golf_qualifiers'::regclass
  ) THEN
    ALTER TABLE public.golf_qualifiers
      ADD CONSTRAINT golf_qualifiers_num_rounds_range CHECK (num_rounds BETWEEN 1 AND 50);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS golf_rounds_qualifier_player_round_number_uq
ON public.golf_rounds (qualifier_id, player_id, qualifier_round_number)
WHERE qualifier_id IS NOT NULL
AND qualifier_round_number IS NOT NULL
AND status IS DISTINCT FROM 'abandoned';

CREATE OR REPLACE FUNCTION public.prevent_golf_qualifier_round_cap_regression()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO pg_catalog, public
AS $$
DECLARE
  recorded_max_round integer;
BEGIN
  IF NEW.num_rounds IS NULL OR NEW.num_rounds < 1 OR NEW.num_rounds > 50 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Qualifier round count must be between 1 and 50.';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.num_rounds < OLD.num_rounds THEN
    SELECT coalesce(max(qualifier_round_number), 0) INTO recorded_max_round
    FROM public.golf_rounds
    WHERE qualifier_id = NEW.id
      AND qualifier_round_number IS NOT NULL
      AND status IN ('in_progress', 'completed');
    IF recorded_max_round > NEW.num_rounds THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Qualifier round count cannot be reduced below a recorded round.',
        DETAIL = format('Round %s is already recorded for this qualifier.', recorded_max_round);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_golf_qualifier_round_cap ON public.golf_qualifiers;
CREATE TRIGGER guard_golf_qualifier_round_cap
BEFORE INSERT OR UPDATE OF num_rounds ON public.golf_qualifiers
FOR EACH ROW
EXECUTE FUNCTION public.prevent_golf_qualifier_round_cap_regression();

CREATE OR REPLACE FUNCTION
helm_private.prevent_active_team_member_deactivation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO pg_catalog, public
AS $$
BEGIN
  IF OLD.status = 'active'
    AND NEW.status IS DISTINCT FROM 'active'
    AND EXISTS (
      SELECT 1
      FROM public.golf_rounds
    WHERE team_id = OLD.team_id
      AND player_id = OLD.player_id
      AND status = 'in_progress'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'This player has a saved in-progress round. Have them finish or explicitly discard it before removing them from the team.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS golf_team_members_prevent_active_round_deactivation
ON public.golf_team_members;
CREATE TRIGGER golf_team_members_prevent_active_round_deactivation
BEFORE UPDATE OF status ON public.golf_team_members
FOR EACH ROW
EXECUTE FUNCTION helm_private.prevent_active_team_member_deactivation();

COMMIT;
