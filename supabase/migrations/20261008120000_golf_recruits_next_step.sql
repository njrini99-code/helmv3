-- STATUS: HELD (supabase/migrations/HELD.md). WRITTEN, NOT APPLIED. Prepared
-- for the Clubhouse Recruiting premium pass (P014 C1, "Next step with a date",
-- owner-approved in docs/clubhouse/PREMIUM_PASS_AUDIT.md).
-- Apply: npm run db:apply --
-- supabase/migrations/20261008120000_golf_recruits_next_step.sql
-- Risk: LOW. Two nullable columns with no default (a catalog-only change, no
-- table rewrite) and one CHECK on the new label column, which every existing
-- row passes because the column starts NULL. golf_recruits is coach-only and
-- small.
--
-- A prospect's structured next step: a short label ("Official visit", "Decision
-- due") and the day it is due. The Clubhouse page treats the columns' absence
-- as the feature being off: it reads golf_recruits with select('*'), probes for
-- next_step_date with a zero-row head request, and never names the columns in a
-- write until that probe succeeds. Applying this file therefore turns the
-- feature on; nothing breaks before it is applied.
--
-- RLS: unchanged. The four golf_recruits policies are row-level
-- (is_golf_team_coach(team_id)) and the table grants are table-wide (GRANT ALL
-- ON TABLE ... TO authenticated, prod_public_baseline), so the new columns are
-- covered exactly as the existing ones are.
--
-- ROLLBACK: ALTER TABLE public.golf_recruits
--   DROP CONSTRAINT IF EXISTS golf_recruits_next_step_label_length,
--   DROP COLUMN IF EXISTS next_step_label,
--   DROP COLUMN IF EXISTS next_step_date;
--
-- VERIFY: select count(*) = 2 from information_schema.columns
-- VERIFY: where table_schema = 'public' and table_name = 'golf_recruits'
-- VERIFY: and column_name in ('next_step_label', 'next_step_date');

SET lock_timeout = '3s';

ALTER TABLE public.golf_recruits
ADD COLUMN IF NOT EXISTS next_step_label text,
ADD COLUMN IF NOT EXISTS next_step_date date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'golf_recruits_next_step_label_length'
  ) THEN
    ALTER TABLE public.golf_recruits
      ADD CONSTRAINT golf_recruits_next_step_label_length
      CHECK (next_step_label IS NULL OR length(next_step_label) <= 120);
  END IF;
END $$;

COMMENT ON COLUMN public.golf_recruits.next_step_label IS
'The prospect''s next step, such as Official visit (Clubhouse, P014 C1).';
COMMENT ON COLUMN public.golf_recruits.next_step_date IS
'The day the next step is due (Clubhouse Recruiting, P014 C1).';
