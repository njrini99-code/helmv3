-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- Practice-plan lane (CoachHelm), PP7 "Plan format", migration PM1 (02-PLAN.md section 14). Written as a file on 4 Nov 2026 (wiring pass); before this it existed only as a row in the plan.
-- WHY: One saved plan layout per team (section names, order, schedule columns) parsed from a coach's sample file. Layout only: no drill, time or player content is stored.
-- WHO: Coaches of the team (public.is_golf_team_coach) read, insert, update and delete. Players and anon have no access.
-- ORDER: Needs public.golf_teams, public.golf_documents and public.is_golf_team_coach (all applied). Applied together with N-00's 20261026010000 to 010800, because nothing reads it before the Practice tab ships.
-- RISK: Low. New table only. No trigger. Nothing on a round, hole or shot path.
-- ROLLBACK: DROP TABLE IF EXISTS public.golf_practice_plan_formats;
-- VERIFY: SELECT 1 WHERE to_regclass('public.golf_practice_plan_formats') IS NOT NULL AND (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = to_regclass('public.golf_practice_plan_formats'));
-- VERIFY: SELECT 1 WHERE (SELECT count(*) FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'golf_practice_plan_formats') = 4;
-- VERIFY: SELECT 1 WHERE NOT has_table_privilege('anon', 'public.golf_practice_plan_formats', 'SELECT');

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.golf_practice_plan_formats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.golf_teams(id) ON DELETE CASCADE,
  source_document_id uuid REFERENCES public.golf_documents(id) ON DELETE SET NULL,
  name text NOT NULL,
  sections jsonb NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golf_practice_plan_formats_team_uniq UNIQUE (team_id),
  CONSTRAINT golf_practice_plan_formats_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT golf_practice_plan_formats_sections_array CHECK (jsonb_typeof(sections) = 'array'),
  CONSTRAINT golf_practice_plan_formats_sections_size CHECK (octet_length(sections::text) <= 16384)
);

ALTER TABLE public.golf_practice_plan_formats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS golf_practice_plan_formats_select ON public.golf_practice_plan_formats;
CREATE POLICY golf_practice_plan_formats_select ON public.golf_practice_plan_formats
  FOR SELECT TO authenticated USING (public.is_golf_team_coach(team_id));

DROP POLICY IF EXISTS golf_practice_plan_formats_insert ON public.golf_practice_plan_formats;
CREATE POLICY golf_practice_plan_formats_insert ON public.golf_practice_plan_formats
  FOR INSERT TO authenticated WITH CHECK (public.is_golf_team_coach(team_id) AND created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS golf_practice_plan_formats_update ON public.golf_practice_plan_formats;
CREATE POLICY golf_practice_plan_formats_update ON public.golf_practice_plan_formats
  FOR UPDATE TO authenticated USING (public.is_golf_team_coach(team_id)) WITH CHECK (public.is_golf_team_coach(team_id));

DROP POLICY IF EXISTS golf_practice_plan_formats_delete ON public.golf_practice_plan_formats;
CREATE POLICY golf_practice_plan_formats_delete ON public.golf_practice_plan_formats
  FOR DELETE TO authenticated USING (public.is_golf_team_coach(team_id));

REVOKE ALL ON public.golf_practice_plan_formats FROM anon;
REVOKE ALL ON public.golf_practice_plan_formats FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.golf_practice_plan_formats TO authenticated;
GRANT ALL ON public.golf_practice_plan_formats TO service_role;
