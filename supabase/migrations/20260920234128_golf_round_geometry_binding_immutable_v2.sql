-- Extend the existing round binding; never write scoring rows or observations.
-- Legacy bindings remain pinned but cannot acquire guessed v2 metadata.
ALTER TABLE public.golf_round_course_bindings
ADD COLUMN IF NOT EXISTS binding_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.guard_golf_round_geometry_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.round_id IS DISTINCT FROM OLD.round_id
    OR NEW.course_id IS DISTINCT FROM OLD.course_id
    OR NEW.site_id IS DISTINCT FROM OLD.site_id
    OR NEW.geometry_version IS DISTINCT FROM OLD.geometry_version
    OR NEW.terrain_version IS DISTINCT FROM OLD.terrain_version
    OR NEW.binding_snapshot IS DISTINCT FROM OLD.binding_snapshot
    OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
  ) THEN
    RAISE EXCEPTION 'Round geometry binding is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_golf_round_geometry_binding() FROM public,
anon,
authenticated;
CREATE TRIGGER golf_round_geometry_binding_immutable
BEFORE UPDATE ON public.golf_round_course_bindings
FOR EACH ROW EXECUTE FUNCTION public.guard_golf_round_geometry_binding();

-- Clients only call this invoker RPC; they cannot supply a scoring snapshot.
-- Existing SELECT RLS still gives round readers access. Only the round owner
-- can establish a binding, and no binding can modify the original ledger.
REVOKE INSERT, UPDATE ON public.golf_round_course_bindings FROM authenticated;

CREATE SCHEMA IF NOT EXISTS helm_private;

CREATE OR REPLACE FUNCTION helm_private.resolve_golf_round_course_binding(
    p_round_id uuid, p_proposal jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_round public.golf_rounds%ROWTYPE;
  v_existing public.golf_round_course_bindings%ROWTYPE;
  v_holes jsonb;
  v_draft jsonb;
  v_scoring jsonb;
  v_binding jsonb;
BEGIN
  -- Definer access is narrowly necessary because direct INSERT is revoked:
  -- authorization is checked before any row is read or locked.
  IF auth.uid() IS NULL OR NOT public.can_read_golf_round(p_round_id) THEN
    RAISE EXCEPTION 'Round unavailable' USING ERRCODE = '42501';
  END IF;
  IF p_proposal IS NOT NULL AND NOT public.owns_golf_round(p_round_id) THEN
    RAISE EXCEPTION 'Round unavailable' USING ERRCODE = '42501';
  END IF;
  IF p_proposal IS NOT NULL THEN
    SELECT * INTO v_round FROM public.golf_rounds WHERE id = p_round_id FOR UPDATE;
  END IF;
  SELECT * INTO v_existing FROM public.golf_round_course_bindings WHERE round_id = p_round_id;
  IF FOUND THEN
    IF v_existing.binding_snapshot IS NULL THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    RETURN jsonb_build_object('status', 'found', 'binding', v_existing.binding_snapshot);
  END IF;
  IF p_proposal IS NULL THEN RETURN jsonb_build_object('status', 'missing'); END IF;
  IF pg_column_size(p_proposal) > 65536
    OR p_proposal->>'schemaVersion' IS DISTINCT FROM '2'
    OR p_proposal->>'roundId' IS DISTINCT FROM p_round_id::text
    OR jsonb_typeof(p_proposal->'holeBindings') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_proposal->'manifest') IS DISTINCT FROM 'object'
    OR p_proposal->'manifest'->>'courseId' IS DISTINCT FROM p_proposal->>'layoutId'
    OR p_proposal->'manifest'->>'geometryVersion' IS DISTINCT FROM p_proposal->>'geometryVersion'
    OR COALESCE(p_proposal->>'layoutId', '') = ''
    OR COALESCE(p_proposal->>'siteId', '') = ''
    OR COALESCE(p_proposal->>'geometryVersion', '') = ''
    OR COALESCE(p_proposal->>'frameVersion', '') !~ '^[a-f0-9]{64}$'
    OR COALESCE(p_proposal->>'layoutRevision', '') !~ '^[a-f0-9]{64}$'
    OR COALESCE(p_proposal->>'admissionVersion', '') !~ '^[a-f0-9]{64}$'
    OR p_proposal->>'admissionBasis' IS DISTINCT FROM 'runtime_policy'
  THEN RAISE EXCEPTION 'Invalid round binding proposal' USING ERRCODE = '23514'; END IF;

  -- Existing observations are never re-framed to match a newly selected asset.
  IF EXISTS (
    SELECT 1 FROM public.golf_shot_anchors a WHERE a.round_id = p_round_id
      AND (a.geometry_version IS DISTINCT FROM p_proposal->>'geometryVersion'
        OR a.course_id IS DISTINCT FROM p_proposal->>'layoutId'
        OR a.site_id IS DISTINCT FROM p_proposal->>'siteId')
  ) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;

  -- Saved hole rows take precedence, then the saved draft configuration.
  -- Never select golf_course_holes or use a compiler's reference scorecard.
  v_draft := v_round.draft_data->'holes';
  IF jsonb_typeof(v_draft) IS DISTINCT FROM 'array' AND v_round.notes IS NOT NULL THEN
    BEGIN v_draft := v_round.notes::jsonb->'holes';
    EXCEPTION WHEN invalid_text_representation THEN v_draft := '[]'::jsonb;
    END;
  END IF;
  WITH draft AS (
    SELECT value AS item, ordinality AS play_index
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_draft) = 'array'
      THEN v_draft ELSE '[]'::jsonb END) WITH ORDINALITY
  ), numbers AS (
    SELECT h.hole_number AS number FROM public.golf_holes h WHERE h.round_id = p_round_id
    UNION
    SELECT (item->>'number')::integer FROM draft WHERE item->>'number' ~ '^[0-9]+$'
  )
  SELECT jsonb_agg(jsonb_build_object('number', n.number,
    'par', COALESCE(h.par, (d.item->>'par')::integer),
    'yardage', COALESCE(h.yardage, (d.item->>'yardage')::integer),
    'teeId', CASE WHEN d.item->>'teeId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN d.item->>'teeId' ELSE NULL END,
    'scorecardProfileId', NULL,
    'physicalHoleId', NULL,
    'geometryHoleKey', p_proposal->'holeBindings'->>n.number::text,
    'teeFeatureId', NULL)
    ORDER BY COALESCE(d.play_index, n.number), n.number) INTO v_holes
  FROM numbers n
  LEFT JOIN public.golf_holes h ON h.round_id = p_round_id AND h.hole_number = n.number
  LEFT JOIN draft d ON d.item->>'number' = n.number::text;
  IF v_holes IS NULL OR jsonb_array_length(v_holes) = 0
    OR jsonb_array_length(v_holes) > 36
    OR (v_round.holes_played IS NOT NULL AND v_round.holes_played > 0
      AND jsonb_array_length(v_holes) <> v_round.holes_played)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_holes) h WHERE
      COALESCE((h->>'par')::integer, 0) NOT BETWEEN 1 AND 9
      OR (h->>'number')::integer NOT BETWEEN 1 AND 36
      OR (h->>'yardage')::integer < 0)
  THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  v_scoring := jsonb_build_object('dbCourseId', v_round.course_id, 'selectedTeeId', v_round.tee_id,
    'courseRating', v_round.course_rating, 'courseSlope', v_round.course_slope,
    'scorecardProfileId', v_round.draft_data->>'scorecardProfileId',
    'scorecardRevision', CASE WHEN v_round.draft_data->>'scorecardRevision' ~ '^[a-f0-9]{64}$'
      THEN v_round.draft_data->>'scorecardRevision' ELSE NULL END,
    'holes', v_holes);
  -- Core SHA-256 is available without an extension/search_path dependency.
  v_binding := (p_proposal - 'scoringSnapshot' - 'scorecardSnapshotHash') || jsonb_build_object(
    'scoringSnapshot', v_scoring,
    'scorecardSnapshotHash', encode(sha256(convert_to(v_scoring::text, 'UTF8')), 'hex'));
  INSERT INTO public.golf_round_course_bindings
    (round_id, course_id, site_id, geometry_version, schema_version, binding_snapshot)
  VALUES (p_round_id, p_proposal->>'layoutId', p_proposal->>'siteId', p_proposal->>'geometryVersion', 2, v_binding);
  RETURN jsonb_build_object('status', 'found', 'binding', v_binding);
END;
$$;
REVOKE ALL ON FUNCTION helm_private.resolve_golf_round_course_binding(
    uuid, jsonb
) FROM public,
anon;
GRANT USAGE ON SCHEMA helm_private TO authenticated;
GRANT EXECUTE ON FUNCTION helm_private.resolve_golf_round_course_binding(
    uuid, jsonb
) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_golf_round_course_binding(
    p_round_id uuid, p_proposal jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT helm_private.resolve_golf_round_course_binding(p_round_id, p_proposal);
$$;
REVOKE ALL ON FUNCTION public.resolve_golf_round_course_binding(
    uuid, jsonb
) FROM public,
anon;
GRANT EXECUTE ON FUNCTION public.resolve_golf_round_course_binding(
    uuid, jsonb
) TO authenticated;
COMMENT ON FUNCTION public.resolve_golf_round_course_binding(uuid, jsonb) IS
'Owner-only first claim, round-reader lookup; immutable world binding. '
'Reads saved round scoring, never modifies scoring or observations.';
