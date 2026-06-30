-- #393 (partial) — dedicated can_manage_documents staff capability column.

ALTER TABLE public.baseball_team_coach_staff
  ADD COLUMN IF NOT EXISTS can_manage_documents boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.baseball_team_coach_staff.can_manage_documents IS
  'Upload, edit, and delete team documents. Players read via RLS; writes require this cap.';

UPDATE public.baseball_team_coach_staff
SET can_manage_documents = true
WHERE can_manage_settings = true
   OR is_primary = true
   OR is_head_coach = true;
