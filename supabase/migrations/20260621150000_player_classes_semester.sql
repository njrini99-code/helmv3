-- P231: persist the class semester so the edit flow stops re-deriving the CURRENT
-- term (which silently re-dated a different-term class and corrupted calendar sync).
ALTER TABLE public.golf_player_classes
  ADD COLUMN IF NOT EXISTS semester text;

COMMENT ON COLUMN public.golf_player_classes.semester IS
  'Academic term the class belongs to, e.g. "Fall 2026" (P231). Persisted on create/edit so semester is never re-derived from the current date.';
