-- ============================================================================
-- Cloud Course Library — Phase 1 follow-up: fix golf_normalize_name() dedup bug
-- ----------------------------------------------------------------------------
-- The first cut used `\yno\.?\y`, which backtracks to match a BARE "no" — a word
-- boundary exists between "o" and "." — so "Pinehurst No. 2" normalized to
-- "pinehurst . 2" (orphaned dot) whenever a space followed the dot. "No.2"
-- (no space) happened to work, masking the bug.
--
-- Fix: anchor each token on word-START (\m) and, for the bare word, word-END
-- (\M) so the optional dot is consumed and "No"/"Number" can't be stripped out
-- of real words like "Northwood". Verified against the full case matrix:
--   "Pinehurst No. 2" = "Pinehurst #2" = "Pinehurst Number 2" = "Pinehurst 2"
--     = "Pinehurst No.2" = "  PINEHURST   No.  2  "  → "pinehurst 2"
--   "Northwood Country Club" → "northwood country club"  (No NOT stripped)
--   "Mauna Kea No 1" → "mauna kea 1"   "Course Number 7" → "course 7"
--
-- This migration follows 20260613160000 so the file timeline matches the prod
-- timeline (prod already ran the first cut; a fresh replay runs both → same
-- correct end state). CREATE OR REPLACE is idempotent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.golf_normalize_name(p text)
  RETURNS text
  LANGUAGE sql IMMUTABLE
  SET search_path TO 'public', 'pg_temp'
  AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(
      lower(btrim(coalesce(p, ''))),
      '(#|\mno\M\.?|\mnumber\M)', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ))
$$;

COMMENT ON FUNCTION public.golf_normalize_name(text) IS
  'Normalizes a course/tee name for dedup (lower, trim, drop No./No/#/Number tokens, collapse spaces). Anchored on word boundaries so it cannot strip "No" out of words like "Northwood". IMMUTABLE.';

-- Re-backfill with the corrected normalizer (idempotent; rewrites any rows the
-- first cut mis-normalized).
UPDATE public.golf_courses
  SET normalized_name = public.golf_normalize_name(name)
  WHERE normalized_name IS DISTINCT FROM public.golf_normalize_name(name);
