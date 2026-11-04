-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- Practice-plan lane (CoachHelm), wiring pass 4 Nov 2026. Extends N-00's held
--   tables; applies after 20261026010000, 010400 and 010600.
-- WHY: (1) CoachHelm's per-block Why lines must reopen with a saved plan
--   (coach copy in Documents, the plan page and print) but must never reach a
--   player. They go in a coach-only column on golf_practice_plans (players
--   never read that table, N-00 8.2), never in the body, which is frozen into
--   player-readable versions. (2) Settled call 3: a draft is filed in Documents
--   at once as a coach-only row. N-00's 010400 lets a coach insert file rows
--   only, so the draft row is written by this definer function, in the coach's
--   chosen folder.
-- WHO: golf_practice_plan_file_draft is callable by authenticated and checks
--   public.is_golf_team_coach on the plan's team. It never sets is_public true
--   and never changes the folder or visibility of a published plan's row except
--   the folder when one is passed. On a published row it changes only the
--   folder, never the title, description or updated_at that players see (fixed
--   4 Nov review: a draft save no longer leaks unpublished edits through
--   Documents).
-- ORDER: After 20261026010000, 20261026010400 and 20261026010600 (N-00, all
--   held).
-- RISK: Low. One nullable-default column on a new table and one function. No
--   trigger. No change to golf_events, golf_rounds, golf_holes or golf_shots.
-- ROLLBACK: DROP FUNCTION IF EXISTS
--   public.golf_practice_plan_file_draft(uuid, integer, text, jsonb); ALTER
--   TABLE public.golf_practice_plans DROP COLUMN IF EXISTS coach_why;
-- VERIFY: SELECT 1 WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE
-- VERIFY: table_schema = 'public' AND table_name = 'golf_practice_plans' AND
-- VERIFY: column_name = 'coach_why');
-- VERIFY: SELECT 1 WHERE has_function_privilege('authenticated',
-- VERIFY: 'public.golf_practice_plan_file_draft(uuid, integer, text, jsonb)',
-- VERIFY: 'EXECUTE') AND NOT has_function_privilege('anon',
-- VERIFY: 'public.golf_practice_plan_file_draft(uuid, integer, text, jsonb)',
-- VERIFY: 'EXECUTE');
-- VERIFY: SELECT 1 WHERE EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE
-- VERIFY: pronamespace = 'public'::regnamespace AND proname =
-- VERIFY: 'golf_practice_plan_file_draft' AND prosecdef AND 'search_path=""' =
-- VERIFY: ANY (proconfig));

SET lock_timeout = '3s';

ALTER TABLE public.golf_practice_plans
ADD COLUMN IF NOT EXISTS coach_why jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.golf_practice_plans
DROP CONSTRAINT IF EXISTS golf_practice_plans_coach_why_shape;
ALTER TABLE public.golf_practice_plans
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT golf_practice_plans_coach_why_shape
CHECK (
    jsonb_typeof(coach_why) = 'object'
    AND octet_length(coach_why::text) <= 65536
);

-- Files (or refiles) the plan's Documents row as a draft, and stores the
--   coach's Why map, for the version just saved.
-- p_folder NULL keeps the row's folder ("Practice plans" on first filing).
--   p_why NULL keeps the stored map.
CREATE OR REPLACE FUNCTION public.golf_practice_plan_file_draft(
    p_plan_id uuid,
    p_version integer,
    p_folder text,
    p_why jsonb
)
RETURNS TABLE (document_id uuid, folder text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_plan public.golf_practice_plans%ROWTYPE;
  v_folder text := NULLIF(pg_catalog.btrim(COALESCE(p_folder, '')), '');
  v_is_test boolean;
  v_doc uuid;
  v_out text;
BEGIN
  SELECT * INTO v_plan
      FROM public.golf_practice_plans p WHERE p.id = p_plan_id FOR UPDATE;
  IF v_uid IS NULL OR NOT FOUND
      OR NOT public.is_golf_team_coach(v_plan.team_id) THEN
    RAISE EXCEPTION 'practice_plan_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_version IS NULL OR p_version IS DISTINCT FROM v_plan.version THEN
    RAISE EXCEPTION 'practice_plan_stale';
  END IF;
  IF v_plan.kind <> 'event' THEN
    RAISE EXCEPTION 'practice_plan_target';
  END IF;
  IF v_folder IS NOT NULL
      AND (pg_catalog.char_length(v_folder) > 60
          OR pg_catalog.lower(v_folder) = 'team') THEN
    RAISE EXCEPTION 'practice_plan_folder';
  END IF;
  IF p_why IS NOT NULL THEN
    IF pg_catalog.jsonb_typeof(p_why) <> 'object'
        OR pg_catalog.octet_length(p_why::text) > 65536 THEN
      RAISE EXCEPTION 'practice_plan_why';
    END IF;
    UPDATE public.golf_practice_plans p SET coach_why = p_why
        WHERE p.id = v_plan.id;
  END IF;

  SELECT t.is_test INTO v_is_test
      FROM public.golf_teams t WHERE t.id = v_plan.team_id;
  INSERT INTO public.golf_documents AS d
    (team_id, uploaded_by, title, description, file_url, file_type, file_size,
        category, is_public, folder,
     version_count, updated_at, practice_plan_id, is_test)
  VALUES
    (v_plan.team_id, v_uid, v_plan.title, NULLIF(v_plan.body ->> 'focus', ''),
        NULL, NULL, NULL, 'practice_plan', false,
     COALESCE(v_folder, 'Practice plans'), 1, pg_catalog.now(), v_plan.id,
         COALESCE(v_is_test, false))
  ON CONFLICT (practice_plan_id) WHERE practice_plan_id IS NOT NULL
  -- A published row (is_public true) keeps its title, description and
  --   updated_at until Republish
  -- (golf_practice_plan_publish, N-00 010600, rewrites them), so players
  --   never read unpublished edits
  -- through Documents. Only an unpublished or taken-down row takes the
  --   draft's values.
  DO UPDATE
      SET title = CASE WHEN d.is_public THEN d.title ELSE EXCLUDED.title END,
                description = CASE WHEN d.is_public
                    THEN d.description ELSE EXCLUDED.description END,
                folder = COALESCE(v_folder, d.folder),
                updated_at = CASE WHEN d.is_public
                    THEN d.updated_at ELSE EXCLUDED.updated_at END
  RETURNING d.id, d.folder INTO v_doc, v_out;

  RETURN QUERY SELECT v_doc, v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.golf_practice_plan_file_draft(
    uuid, integer, text, jsonb
) FROM public,
anon;
GRANT EXECUTE ON FUNCTION public.golf_practice_plan_file_draft(
    uuid, integer, text, jsonb
) TO authenticated,
service_role;
