-- Wave A · A8 — align progress_notes default with the shape the app uses
-- Audit findings: F120/F121 (LOW) — golf_player_focus_areas.progress_notes
-- defaults to '[]'::jsonb (array), but the app reads/writes the object shape
-- { "entries": [...] }. A row left at the default reads back as [] and the app's
-- progress_notes.entries is undefined.
--
-- Fix: set the default to {"entries": []}. Existing rows are NOT rewritten, so
-- the read path (C1) must tolerate both shapes. Low-risk, no row rewrite.
ALTER TABLE public.golf_player_focus_areas
  ALTER COLUMN progress_notes SET DEFAULT '{"entries": []}'::jsonb;
