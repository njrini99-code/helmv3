-- ============================================================================
-- Focus areas: fold orphaned `target_metric` ids onto canonical ones.  #1239.
--
-- The progress driver recognizes two vocabularies (the focus-area catalog and
-- the v3 metric registry). On live data, 8 of the 10 targeted active areas
-- carried an id in NEITHER, so they could never be advanced — the coach board's
-- own "N active focus areas have no recent progress" banner was reporting a
-- broken pipeline rather than coach neglect.
--
-- Mirrors LEGACY_TARGET_METRIC_ALIASES in
-- src/lib/coachhelm/focus-areas/target-metric.ts; a unit test asserts every
-- alias target still resolves, so the two cannot drift apart silently.
--
-- Each mapping is pinned by the owning area's own TITLE, which names the band
-- explicitly — these are not guesses at what the string might have meant.
-- ============================================================================

UPDATE public.golf_player_focus_areas
SET target_metric = CASE lower(trim(target_metric))
      -- "Rebuild 5-10 ft make rate" -> exact band match
      WHEN 'make_pct_5_10'         THEN 'putts_made_5_10ft_pct'
      -- "Wedge Distance Control (80-120 yards)" -> 80-120yd sits wholly inside
      -- the canonical 50-125yd band
      WHEN 'avg proximity 80-120y' THEN 'approach_proximity_50_125ft'
      -- "Tighten 150-180y approach dispersion" -> APPROXIMATE: 150-180yd
      -- straddles the 125-175 and 175+ bands; 125-175 is the closest canonical
      -- home and covers most of it
      WHEN 'avg_proximity_ft'      THEN 'approach_proximity_125_175ft'
      ELSE target_metric
    END,
    updated_at = updated_at  -- do NOT bump: this is a rename, not an observation
WHERE lower(trim(target_metric)) IN (
  'make_pct_5_10', 'avg proximity 80-120y', 'avg_proximity_ft'
);

-- Deliberately NOT remapped: 'three_putt_chain' ("Lag putts -> 3-putt cascade")
-- is a narrative cascade insight with no scalar equivalent, and its rows carry
-- null current/target so they already render the honest "No target set yet"
-- state. Inventing a scalar for it would be worse than leaving it manual.
