-- #651 schema-drift reconcile, wave 2 (settings OS) — same class as
-- 20260702095900_baseball_651_column_reconcile: 20260624000090's
-- CREATE TABLE IF NOT EXISTS no-op'd for baseball_program_settings and
-- baseball_integration_configs because both tables already existed in prod
-- under OLDER schemas, so the entire intended settings-OS column set silently
-- never landed. baseball_import_sources and baseball_settings_audit_log did
-- NOT pre-exist, so they were created correctly and need nothing here.
--
-- Live 400s confirmed by the 2026-07-03 Mission Control sweep (Postgres logs,
-- still firing 04:03 UTC):
--   baseball_program_settings.brand_accent (dominant, >=85 per 4 min),
--   baseball_program_settings.appearance_theme  — brand/theming reads from
--     BaseballProgramBrand.tsx + program-settings.ts getProgramBrand
--   baseball_integration_configs.display_name   — listIntegrations ORDER BY
--   baseball_catching_events.event_type         — engine-run.ts /
--     stats-center.ts / player-snapshot-cards.ts readers
--
-- Verified against information_schema (NOT schema_migrations) 2026-07-03:
--   * all three tables EMPTY (0 rows) — every addition is backfill-free
--   * RLS enabled with 4 policies each — policy sections of 20260624000090
--     applied fine; this is pure column drift
--   * catching_events already carries the wave-1 reconcile columns
--     (catcher_id, block_result, steal_result, pop_time, throw_accuracy,
--     data_context, measured_at) — only event_type is still missing from the
--     code-referenced set
--
-- Additive-only per repo convention for the shared golf+baseball prod DB.
-- Columns that the intended spec declares NOT NULL without a static default
-- (provider_key, display_name) are added NULLABLE so this ALTER can never
-- fail against a drifted non-empty table; the writers always supply them
-- (upsertIntegration validates both before insert).

-- ---------------------------------------------------------------------------
-- baseball_program_settings — full settings-OS parity (live table only has
-- the older ai/announcement/task/roster columns + notification/quiet-hours)
-- ---------------------------------------------------------------------------
ALTER TABLE public.baseball_program_settings
  -- Player access policy
  ADD COLUMN IF NOT EXISTS players_require_invite boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS players_can_self_join boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS players_can_edit_profile boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS players_can_edit_public_profile boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS players_can_view_team_stats boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS players_can_self_log_lift boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS players_can_self_report_availability boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS players_can_upload_video boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS players_can_see_ai_summaries boolean NOT NULL DEFAULT false,
  -- Module enablement
  ADD COLUMN IF NOT EXISTS academics_module_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS travel_module_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS performance_module_depth text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS recruiting_exposure_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_profiles_enabled boolean NOT NULL DEFAULT false,
  -- Guardian access
  ADD COLUMN IF NOT EXISTS guardian_access_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guardian_can_view_schedule boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS guardian_can_view_announcements boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS guardian_can_view_travel boolean NOT NULL DEFAULT true,
  -- Showcase / scout access
  ADD COLUMN IF NOT EXISTS scout_access_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scout_packet_visibility text NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS scout_can_export boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scout_show_unverified_metrics boolean NOT NULL DEFAULT false,
  -- Default visibility for new staff-authored records
  ADD COLUMN IF NOT EXISTS default_visibility text NOT NULL DEFAULT 'staff_only',
  -- AI settings (ai_enabled + ai_stale_after_days already live)
  ADD COLUMN IF NOT EXISTS ai_staff_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_player_visible_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_require_staff_approval boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_require_source_refs boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_confidence_threshold numeric NOT NULL DEFAULT 0.6,
  ADD COLUMN IF NOT EXISTS ai_medical_guardrail boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_academic_privacy_guardrail boolean NOT NULL DEFAULT true,
  -- Appearance (the live 400 source)
  ADD COLUMN IF NOT EXISTS brand_accent text,
  ADD COLUMN IF NOT EXISTS appearance_theme text NOT NULL DEFAULT 'light',
  -- Data retention
  ADD COLUMN IF NOT EXISTS season_archive_policy text NOT NULL DEFAULT 'keep',
  ADD COLUMN IF NOT EXISTS import_retention_days integer,
  ADD COLUMN IF NOT EXISTS audit_retention_days integer NOT NULL DEFAULT 365,
  -- Demo mode + provenance
  ADD COLUMN IF NOT EXISTS demo_mode_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_program_settings_performance_module_depth_check') THEN
    ALTER TABLE public.baseball_program_settings
      ADD CONSTRAINT baseball_program_settings_performance_module_depth_check
      CHECK (performance_module_depth IN ('lite', 'standard', 'full'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_program_settings_scout_packet_visibility_check') THEN
    ALTER TABLE public.baseball_program_settings
      ADD CONSTRAINT baseball_program_settings_scout_packet_visibility_check
      CHECK (scout_packet_visibility IN ('private', 'event_only', 'public'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_program_settings_default_visibility_check') THEN
    ALTER TABLE public.baseball_program_settings
      ADD CONSTRAINT baseball_program_settings_default_visibility_check
      CHECK (default_visibility IN ('staff_only', 'player_visible', 'restricted'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_program_settings_ai_confidence_threshold_check') THEN
    ALTER TABLE public.baseball_program_settings
      ADD CONSTRAINT baseball_program_settings_ai_confidence_threshold_check
      CHECK (ai_confidence_threshold >= 0 AND ai_confidence_threshold <= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_program_settings_appearance_theme_check') THEN
    ALTER TABLE public.baseball_program_settings
      ADD CONSTRAINT baseball_program_settings_appearance_theme_check
      CHECK (appearance_theme IN ('light', 'dark', 'system'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_program_settings_season_archive_policy_check') THEN
    ALTER TABLE public.baseball_program_settings
      ADD CONSTRAINT baseball_program_settings_season_archive_policy_check
      CHECK (season_archive_policy IN ('keep', 'archive_after_season'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_program_settings_audit_retention_days_check') THEN
    ALTER TABLE public.baseball_program_settings
      ADD CONSTRAINT baseball_program_settings_audit_retention_days_check
      CHECK (audit_retention_days > 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- baseball_integration_configs — adapter-contract columns (live table only
-- has the older integration_key/config_json/is_active/last_sync_at schema;
-- those legacy columns are left completely untouched)
-- ---------------------------------------------------------------------------
ALTER TABLE public.baseball_integration_configs
  ADD COLUMN IF NOT EXISTS provider_key text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS integration_level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_status text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL;

-- Legacy drift column: relax so the new adapter-contract insert path
-- (upsertIntegration, which targets provider_key and never writes
-- integration_key) cannot fail a NOT NULL it no longer needs — without this,
-- the missing-column 400 just becomes a 23502 not-null violation on every
-- integration save (db-migration-review required fix, 2026-07-03). Guarded:
-- integration_key does not exist on a fresh database.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'baseball_integration_configs'
      AND column_name = 'integration_key' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.baseball_integration_configs ALTER COLUMN integration_key DROP NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_integration_configs_integration_level_check') THEN
    ALTER TABLE public.baseball_integration_configs
      ADD CONSTRAINT baseball_integration_configs_integration_level_check
      CHECK (integration_level BETWEEN 1 AND 4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_integration_configs_status_check') THEN
    ALTER TABLE public.baseball_integration_configs
      ADD CONSTRAINT baseball_integration_configs_status_check
      CHECK (status IN ('available', 'configured', 'pending_pilot', 'disabled'));
  END IF;
  -- upsertIntegration targets onConflict: 'team_id,provider_key' — without
  -- this UNIQUE constraint every settings-page integration save 400s.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_integration_configs_team_provider_key') THEN
    ALTER TABLE public.baseball_integration_configs
      ADD CONSTRAINT baseball_integration_configs_team_provider_key
      UNIQUE (team_id, provider_key);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- baseball_catching_events — event_type (the one code-referenced column the
-- wave-1 reconcile missed; engine-run/stats-center/player-snapshot-cards all
-- select it)
-- ---------------------------------------------------------------------------
ALTER TABLE public.baseball_catching_events
  ADD COLUMN IF NOT EXISTS event_type text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_catching_events_event_type_check') THEN
    ALTER TABLE public.baseball_catching_events
      ADD CONSTRAINT baseball_catching_events_event_type_check
      CHECK (event_type IN ('receive', 'block', 'throwdown', 'game_call', 'mound_visit'));
  END IF;
END $$;

-- Rollback (additive-only convention — do not DROP COLUMN on the shared prod
-- DB; all three tables are empty today, but prefer a follow-up migration
-- dropping just the CHECK/UNIQUE constraints above if ever needed).
