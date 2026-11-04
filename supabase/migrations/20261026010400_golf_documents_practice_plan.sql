-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- N-00 v2 Practice, slice 0. Agreed with N-10 (Documents): N-00 owns this column, its index, the file_url change and the CHECK.
-- WHY: Every published practice plan lives in Team Hub > Documents > Practice plans as a row with no file: practice_plan_id set, file_url NULL. Exactly one of the two is set on every row.
-- WHO: Unchanged select and delete policies. Insert: coaches may insert file rows only (practice_plan_id must be NULL); plan rows are written by public.golf_practice_plan_publish (010600, definer). Update: a coach may update a plan row only while it points at a plan of the same team.
-- ORDER: After 20261026010000 (references golf_practice_plans).
-- RISK: Medium-low. ALTER on an existing table (brief ACCESS EXCLUSIVE, lock_timeout 3s). Existing rows all have file_url NOT NULL and practice_plan_id NULL, so the CHECK validates. Readers that assume a string file_url are listed in the plan (0.4) and filter `file_url IS NOT NULL` before this is applied.
-- ROLLBACK: DROP POLICY IF EXISTS golf_documents_insert_coach ON public.golf_documents; CREATE POLICY golf_documents_insert_coach ON public.golf_documents FOR INSERT WITH CHECK (public.is_golf_team_coach(team_id)); DROP POLICY IF EXISTS golf_documents_update_coach ON public.golf_documents; CREATE POLICY golf_documents_update_coach ON public.golf_documents FOR UPDATE USING (public.is_golf_team_coach(team_id)) WITH CHECK (public.is_golf_team_coach(team_id)); ALTER TABLE public.golf_documents DROP CONSTRAINT IF EXISTS golf_documents_source_check; DELETE FROM public.golf_documents WHERE practice_plan_id IS NOT NULL; ALTER TABLE public.golf_documents ALTER COLUMN file_url SET NOT NULL; DROP INDEX IF EXISTS public.golf_documents_practice_plan_uniq; ALTER TABLE public.golf_documents DROP COLUMN IF EXISTS practice_plan_id;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.golf_documents'::regclass AND attname = 'file_url' AND NOT attnotnull;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.golf_documents'::regclass AND attname = 'practice_plan_id' AND NOT attisdropped;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.golf_documents'::regclass AND conname = 'golf_documents_source_check' AND convalidated;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND tablename = 'golf_documents' AND indexname = 'golf_documents_practice_plan_uniq';
-- VERIFY: SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'golf_documents' AND policyname IN ('golf_documents_insert_coach', 'golf_documents_update_coach') AND with_check LIKE '%practice_plan_id%' HAVING count(*) = 2;

SET lock_timeout = '3s';

ALTER TABLE public.golf_documents
  ADD COLUMN IF NOT EXISTS practice_plan_id uuid REFERENCES public.golf_practice_plans(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS golf_documents_practice_plan_uniq
  ON public.golf_documents (practice_plan_id) WHERE practice_plan_id IS NOT NULL;

ALTER TABLE public.golf_documents ALTER COLUMN file_url DROP NOT NULL;

ALTER TABLE public.golf_documents DROP CONSTRAINT IF EXISTS golf_documents_source_check;
ALTER TABLE public.golf_documents
  ADD CONSTRAINT golf_documents_source_check CHECK ((file_url IS NOT NULL) <> (practice_plan_id IS NOT NULL)) NOT VALID;
ALTER TABLE public.golf_documents VALIDATE CONSTRAINT golf_documents_source_check;

-- Coaches insert file rows only. A plan row is written by golf_practice_plan_publish (definer).
DROP POLICY IF EXISTS golf_documents_insert_coach ON public.golf_documents;
CREATE POLICY golf_documents_insert_coach ON public.golf_documents
  FOR INSERT
  WITH CHECK (public.is_golf_team_coach(team_id) AND practice_plan_id IS NULL);

-- A coach may update any row of the team; a plan row must keep pointing at a plan of the same team. The EXISTS runs as
-- the coach, whose RLS on golf_practice_plans shows only their own teams' plans.
DROP POLICY IF EXISTS golf_documents_update_coach ON public.golf_documents;
CREATE POLICY golf_documents_update_coach ON public.golf_documents
  FOR UPDATE
  USING (public.is_golf_team_coach(team_id))
  WITH CHECK (
    public.is_golf_team_coach(team_id)
    AND (
      practice_plan_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.golf_practice_plans p
        WHERE p.id = golf_documents.practice_plan_id AND p.team_id = golf_documents.team_id
      )
    )
  );
