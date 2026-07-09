-- P2: CHECK constraints for source_trust_level / source_match_tier and the
-- visibility-family text columns, so a typo'd or unvalidated string can no
-- longer silently sit in these columns. Every constraint is
--   CHECK (col IS NULL OR col IN (...)) NOT VALID
-- so (a) NULLs stay allowed wherever the column already permits them, and
-- (b) NOT VALID means only NEW/UPDATEd rows are enforced going forward --
-- existing prod rows are never re-validated by this migration, so it cannot
-- fail on legacy data. A separate, explicit `VALIDATE CONSTRAINT` pass (after
-- auditing/backfilling any legacy violators) is a deliberate follow-up, not
-- done here. Idempotent (guarded by pg_constraint existence). Written NOT
-- applied.
--
-- Allowed-value sources (hand-written unions):
--   BaseballSourceTrustLevel   src/lib/types/baseball-settings.ts ~54-60
--   BaseballImportMatchTier    src/lib/types/baseball-imports.ts  ~244-250
--
-- The "visibility-family" turned out to be TWO distinct domains, not one --
-- confirmed by tracing every write site (not just the type file names):
--   VISIBILITY_A ('staff_only','player_visible','restricted')
--     = BaseballDefaultVisibility / BaseballEventVisibility / PostgameVisibility
--       (src/lib/types/baseball-settings.ts, baseball-stat-events.ts,
--       baseball-postgame.ts) -- stat/event/source-level visibility.
--   VISIBILITY_B ('team','player_only','staff_only')
--     = BaseballSignalVisibility / DailyContractVisibility /
--       BaseballTimelineVisibility (src/lib/types/baseball-signals.ts,
--       baseball-passport.ts, baseball-extended.ts) -- signal/action/
--       conflict/note/daily-contract/timeline visibility.
-- Getting these two mixed up would have shipped a constraint that rejects
-- every legitimate write on half these tables, so each table below is
-- assigned to whichever domain its actual write sites (grepped, not
-- guessed) use.

-- ============================================================================
-- source_trust_level  (BaseballSourceTrustLevel)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_pitch_events_source_trust_level_check') THEN
    ALTER TABLE public.baseball_pitch_events
      ADD CONSTRAINT baseball_pitch_events_source_trust_level_check
      CHECK (source_trust_level IS NULL OR source_trust_level IN
        ('official','device_export','staff_entered','player_entered','ai_derived','unreviewed'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_plate_appearances_source_trust_level_check') THEN
    ALTER TABLE public.baseball_plate_appearances
      ADD CONSTRAINT baseball_plate_appearances_source_trust_level_check
      CHECK (source_trust_level IS NULL OR source_trust_level IN
        ('official','device_export','staff_entered','player_entered','ai_derived','unreviewed'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_player_stats_source_trust_level_check') THEN
    ALTER TABLE public.baseball_player_stats
      ADD CONSTRAINT baseball_player_stats_source_trust_level_check
      CHECK (source_trust_level IS NULL OR source_trust_level IN
        ('official','device_export','staff_entered','player_entered','ai_derived','unreviewed'))
      NOT VALID;
  END IF;
END $$;

-- ============================================================================
-- source_match_tier  (BaseballImportMatchTier)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_player_stats_source_match_tier_check') THEN
    ALTER TABLE public.baseball_player_stats
      ADD CONSTRAINT baseball_player_stats_source_match_tier_check
      CHECK (source_match_tier IS NULL OR source_match_tier IN
        ('external_id','exact_roster','name_jersey_class','fuzzy_name','manual','unmatched'))
      NOT VALID;
  END IF;
END $$;

-- ============================================================================
-- VISIBILITY_A ('staff_only','player_visible','restricted')
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_pitch_events_visibility_check') THEN
    ALTER TABLE public.baseball_pitch_events
      ADD CONSTRAINT baseball_pitch_events_visibility_check
      CHECK (visibility IS NULL OR visibility IN ('staff_only','player_visible','restricted'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_batted_ball_events_visibility_check') THEN
    ALTER TABLE public.baseball_batted_ball_events
      ADD CONSTRAINT baseball_batted_ball_events_visibility_check
      CHECK (visibility IS NULL OR visibility IN ('staff_only','player_visible','restricted'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_swing_events_visibility_check') THEN
    ALTER TABLE public.baseball_swing_events
      ADD CONSTRAINT baseball_swing_events_visibility_check
      CHECK (visibility IS NULL OR visibility IN ('staff_only','player_visible','restricted'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_video_events_visibility_check') THEN
    ALTER TABLE public.baseball_video_events
      ADD CONSTRAINT baseball_video_events_visibility_check
      CHECK (visibility IS NULL OR visibility IN ('staff_only','player_visible','restricted'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_plate_appearances_source_visibility_check') THEN
    ALTER TABLE public.baseball_plate_appearances
      ADD CONSTRAINT baseball_plate_appearances_source_visibility_check
      CHECK (source_visibility IS NULL OR source_visibility IN ('staff_only','player_visible','restricted'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_player_stats_source_visibility_check') THEN
    ALTER TABLE public.baseball_player_stats
      ADD CONSTRAINT baseball_player_stats_source_visibility_check
      CHECK (source_visibility IS NULL OR source_visibility IN ('staff_only','player_visible','restricted'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_import_sources_default_visibility_check') THEN
    ALTER TABLE public.baseball_import_sources
      ADD CONSTRAINT baseball_import_sources_default_visibility_check
      CHECK (default_visibility IS NULL OR default_visibility IN ('staff_only','player_visible','restricted'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_program_settings_default_visibility_check') THEN
    ALTER TABLE public.baseball_program_settings
      ADD CONSTRAINT baseball_program_settings_default_visibility_check
      CHECK (default_visibility IS NULL OR default_visibility IN ('staff_only','player_visible','restricted'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_stat_sources_default_visibility_check') THEN
    ALTER TABLE public.baseball_stat_sources
      ADD CONSTRAINT baseball_stat_sources_default_visibility_check
      CHECK (default_visibility IS NULL OR default_visibility IN ('staff_only','player_visible','restricted'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_practice_blocks_visibility_check') THEN
    ALTER TABLE public.baseball_practice_blocks
      ADD CONSTRAINT baseball_practice_blocks_visibility_check
      CHECK (visibility IS NULL OR visibility IN ('staff_only','player_visible','restricted'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_postgame_review_items_visibility_check') THEN
    ALTER TABLE public.baseball_postgame_review_items
      ADD CONSTRAINT baseball_postgame_review_items_visibility_check
      CHECK (visibility IS NULL OR visibility IN ('staff_only','player_visible','restricted'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_practice_effectiveness_reviews_visibility_check') THEN
    ALTER TABLE public.baseball_practice_effectiveness_reviews
      ADD CONSTRAINT baseball_practice_effectiveness_reviews_visibility_check
      CHECK (visibility IS NULL OR visibility IN ('staff_only','player_visible','restricted'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_player_development_metrics_visibility_check') THEN
    ALTER TABLE public.baseball_player_development_metrics
      ADD CONSTRAINT baseball_player_development_metrics_visibility_check
      CHECK (visibility IS NULL OR visibility IN ('staff_only','player_visible','restricted'))
      NOT VALID;
  END IF;
END $$;

-- ============================================================================
-- VISIBILITY_B ('team','player_only','staff_only')
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_signals_visibility_check') THEN
    ALTER TABLE public.baseball_signals
      ADD CONSTRAINT baseball_signals_visibility_check
      CHECK (visibility IS NULL OR visibility IN ('team','player_only','staff_only'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_actions_visibility_check') THEN
    ALTER TABLE public.baseball_actions
      ADD CONSTRAINT baseball_actions_visibility_check
      CHECK (visibility IS NULL OR visibility IN ('team','player_only','staff_only'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_player_daily_contracts_visibility_check') THEN
    ALTER TABLE public.baseball_player_daily_contracts
      ADD CONSTRAINT baseball_player_daily_contracts_visibility_check
      CHECK (visibility IS NULL OR visibility IN ('team','player_only','staff_only'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_player_timeline_events_visibility_check') THEN
    ALTER TABLE public.baseball_player_timeline_events
      ADD CONSTRAINT baseball_player_timeline_events_visibility_check
      CHECK (visibility IS NULL OR visibility IN ('team','player_only','staff_only'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_class_conflicts_visibility_check') THEN
    ALTER TABLE public.baseball_class_conflicts
      ADD CONSTRAINT baseball_class_conflicts_visibility_check
      CHECK (visibility IS NULL OR visibility IN ('team','player_only','staff_only'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_coach_player_notes_visibility_check') THEN
    ALTER TABLE public.baseball_coach_player_notes
      ADD CONSTRAINT baseball_coach_player_notes_visibility_check
      CHECK (visibility IS NULL OR visibility IN ('team','player_only','staff_only'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_ai_audit_visibility_check') THEN
    ALTER TABLE public.baseball_ai_audit
      ADD CONSTRAINT baseball_ai_audit_visibility_check
      CHECK (visibility IS NULL OR visibility IN ('team','player_only','staff_only'))
      NOT VALID;
  END IF;
END $$;

-- ============================================================================
-- Deliberately NOT constrained here (flagged for follow-up, not guessed):
--   - baseball_stat_visual_views.visibility -- no write-site literal found
--     grepping src/app/baseball/actions/stat-visual-views.ts; domain unclear.
--   - trust_tier columns (baseball_pitch_events, baseball_batted_ball_events,
--     baseball_swing_events, baseball_stat_sources) -- a THIRD, distinct
--     domain (BaseballTrustTier: official/verified_vendor/coach_reviewed/
--     player_submitted/unverified/inferred, src/lib/types/
--     baseball-stat-events.ts ~47-53), out of scope for this pass (task named
--     only source_trust_level/source_match_tier + visibility).
-- ============================================================================
