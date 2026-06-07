-- Gender on golf_teams drives the SG expected-strokes baseline (men's Broadie vs
-- a scaled women's baseline). College golf teams are single-gender. Additive +
-- backward-compatible: existing teams default to 'mens' (factor 1.0 = unchanged SG).
--
-- Applied to prod via Supabase MCP on 2026-06-07; this file is the reproducible
-- source.
ALTER TABLE public.golf_teams
  ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT 'mens';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'golf_teams_gender_check'
  ) THEN
    ALTER TABLE public.golf_teams
      ADD CONSTRAINT golf_teams_gender_check CHECK (gender IN ('mens', 'womens'));
  END IF;
END $$;

-- Set the women's team(s). Match on the team name (handles the curly apostrophe).
UPDATE public.golf_teams
SET gender = 'womens'
WHERE name ILIKE '%women%';
