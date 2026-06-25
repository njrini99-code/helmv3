-- ============================================================================
-- 20260624001100_baseball_import_match_resolution.sql
--
-- player_matching_v2.md: "Use exact external ID, exact roster match, normalized
-- name + jersey + class, fuzzy name, and manual review. STORE MATCH CONFIDENCE
-- AND CHOSEN RESOLUTION."
--
-- Before this, a committed stat row recorded its source trust/visibility but NOT
-- how the row's player was resolved — the chosen resolution lived only inside the
-- run's lineage JSON. This stamps the per-row match CONFIDENCE (numeric) and the
-- chosen-resolution TIER (qualitative) directly on the committed stat row so the
-- "how did this player get matched" answer is queryable + auditable at the grain
-- the data lands at, not just buried in the run snapshot.
--
-- NOTES
--   * ADDITIVE ONLY (ADD COLUMN IF NOT EXISTS). Safe on a live DB shared with
--     GolfHelm. No data backfill, no destructive change.
--   * NOT APPLIED by this agent (migrations are authored as .sql; the live apply
--     is run separately). The action writes these columns via the LooseClient,
--     matching the existing source_trust_level / source_visibility pattern.
--   * NULL = legacy / manual-entry rows committed before this migration (read
--     paths treat NULL tier as "unknown / not import-resolved").
-- ============================================================================

-- ----------------------------------------------------------------------------
-- baseball_player_stats — per-row match confidence + chosen-resolution tier
-- ----------------------------------------------------------------------------

ALTER TABLE public.baseball_player_stats
  ADD COLUMN IF NOT EXISTS source_match_confidence numeric
    CHECK (
      source_match_confidence IS NULL
      OR (source_match_confidence >= 0 AND source_match_confidence <= 1)
    );

ALTER TABLE public.baseball_player_stats
  ADD COLUMN IF NOT EXISTS source_match_tier text
    CHECK (
      source_match_tier IS NULL OR source_match_tier IN (
        'external_id',
        'exact_roster',
        'name_jersey_class',
        'fuzzy_name',
        'manual',
        'unmatched'
      )
    );

COMMENT ON COLUMN public.baseball_player_stats.source_match_confidence IS
  'The 0..1 confidence of the player match that produced this imported row (player_matching_v2.md "store match confidence"). NULL = legacy/manual row predating import-match stamping.';
COMMENT ON COLUMN public.baseball_player_stats.source_match_tier IS
  'The chosen-resolution tier of the player match (player_matching_v2.md): external_id | exact_roster | name_jersey_class | fuzzy_name | manual | unmatched. NULL = legacy/manual row predating import-match stamping.';

-- Low-confidence imported rows are the audit hot path ("show me everything that
-- resolved by fuzzy name or below"); index the tier per team for that triage.
CREATE INDEX IF NOT EXISTS idx_baseball_player_stats_match_tier
  ON public.baseball_player_stats (team_id, source_match_tier)
  WHERE source_match_tier IS NOT NULL;
