-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- N-10 Documents: a practice plan's row lives in "Practice plans", and
--   nothing else does. Needs N-00's 20261026010400 (practice_plan_id).
-- NOT VALID: new and updated rows are checked at once; existing rows are not
--   scanned (a legacy file a coach typed into a
-- "Practice plans" folder in Fairway is not refused here; see the pre-check
--   below before VALIDATE).
-- VERIFY: SELECT 1 FROM pg_constraint WHERE conrelid =
-- VERIFY: to_regclass('public.golf_documents') AND conname =
-- VERIFY: 'golf_documents_plan_folder_check' AND contype = 'c';
-- VERIFY: SELECT 1 WHERE to_regclass('public.golf_documents') IS NOT NULL AND
-- VERIFY: EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema =
-- VERIFY: 'public' AND table_name = 'golf_documents' AND column_name =
-- VERIFY: 'practice_plan_id');
-- ROLLBACK: ALTER TABLE public.golf_documents DROP CONSTRAINT IF EXISTS
--   golf_documents_plan_folder_check;

SET lock_timeout = '3s';

ALTER TABLE public.golf_documents
DROP CONSTRAINT IF EXISTS golf_documents_plan_folder_check;
ALTER TABLE public.golf_documents
ADD CONSTRAINT golf_documents_plan_folder_check
-- fixed 4 Nov wiring (narrowed, Nick's call in DECISIONS "Folders", 4 Nov):
--   plan rows may sit in any coach folder; only an uploaded file may not sit in
--   Practice plans.
CHECK (
    practice_plan_id IS NOT NULL
    OR lower(btrim(coalesce(folder, ''))) <> 'practice plans'
)
NOT VALID;

COMMENT ON CONSTRAINT golf_documents_plan_folder_check
ON public.golf_documents
IS 'No uploaded file sits in the Practice plans folder; a practice plan row (practice_plan_id set) may sit in any coach folder. N-10, with N-00 and the practice-plan lane (narrowed 4 Nov 2026).'; -- noqa: LT05
