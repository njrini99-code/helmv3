-- ============================================================================
-- Migration: 20260624000090_baseball_settings_os.sql
-- Packet: settings-os (BaseballHelm Wave 4 — Massive Program OS v4)
--
-- Purpose: The Settings / Admin / Integrations / Imports operating controls for
--          a multi-mode program OS (college / high_school / showcase / juco /
--          academy / club). Settings are not an afterthought — they are the
--          controls that keep the product usable and SAFE across staff, players,
--          guardians, and scouts.
--
-- Implements (from v4_settings_admin_integrations_permissions.md +
-- v4_program_type_variants_high_school_college_showcase.md):
--   * Program Settings  — program_type + competition level + region + timezone +
--                          season naming + default visibility + the v4 feature
--                          toggles (academics/travel/guardian/showcase-scout/
--                          recruiting-exposure/public-profiles/player self-edit/
--                          video uploads), AI settings, notification defaults,
--                          appearance, data-retention, demo-mode. (1:1 team)
--   * Import Source registry — source name/type/trust/required-review/dup-strict/
--                          player-matching/external-id namespace. (v4 §Imports)
--   * Integration configs — adapter CONTRACTS only (no direct vendor calls):
--                          level 1-4, status settings, sync-log anchor. (v4 §Integrations)
--   * Settings audit log — role-changed / visibility-changed / import-committed /
--                          AI-generated / public-profile / guardian-access /
--                          data-exported. (v4 §Data Retention And Audit)
--
-- ZIP NON-NEGOTIABLES honored:
--   * program_type is a SETTING that controls behavior — NOT a hard-coded fork.
--   * NO direct vendor integrations — integration rows are adapter contracts /
--     source settings only (sync_status defaults 'manual', no credentials here).
--   * EXTEND existing baseball_teams (additive columns) — never clone.
--   * Sensitive setting changes are auditable (baseball_settings_audit_log).
--
-- SAFETY CONTRACT (CLAUDE.md hard rules):
--   * ADDITIVE ONLY. ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS /
--     CREATE INDEX IF NOT EXISTS / DROP POLICY IF EXISTS then CREATE POLICY /
--     CREATE OR REPLACE FUNCTION. No DROP COLUMN/TABLE, no destructive UPDATE/
--     DELETE, no data-losing rename. Safe to (re)run on a live DB.
--   * RLS ENABLED on every new table with explicit policies. NEVER GRANT to anon.
--   * SECURITY DEFINER helpers pin search_path = public, pg_temp; EXECUTE granted
--     to authenticated + service_role ONLY.
--   * Sport-prefixed names only (baseball_*).
--   * Reuses the Wave-1 capability helper has_baseball_staff_capability(team,cap)
--     and is_baseball_team_staff(team) / is_baseball_team_member(team) so the
--     capability model stays the single source of truth.
--
-- This file is WRITTEN, NOT APPLIED.
-- ============================================================================

-- ============================================================================
-- SECTION 1 — PROGRAM TYPE + PROGRAM-LEVEL SETTINGS ON baseball_teams
-- ============================================================================
-- program_type is the controlling setting. team_type already exists
-- (baseball_coach_type: college/high_school/juco/showcase). We add program_type
-- as a distinct, settings-controlled column (academy/club are program_type-only
-- so they don't need to be in the coach_type enum), default-seeded from
-- team_type so existing teams behave identically until a coach changes it.

ALTER TABLE public.baseball_teams
  ADD COLUMN IF NOT EXISTS program_type text NOT NULL DEFAULT 'college'
    CHECK (program_type IN ('college', 'high_school', 'showcase', 'juco', 'academy', 'club')),
  ADD COLUMN IF NOT EXISTS competition_level text,
  ADD COLUMN IF NOT EXISTS region_state      text,
  ADD COLUMN IF NOT EXISTS timezone          text NOT NULL DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS season_label      text;

COMMENT ON COLUMN public.baseball_teams.program_type IS
  'Controlling program mode (v4): college | high_school | showcase | juco | academy | club. Drives default nav, terminology, feature toggles, permission bundles, onboarding. A SETTING, never a hard-coded fork.';
COMMENT ON COLUMN public.baseball_teams.competition_level IS 'Free-text competition level (e.g. D1, 5A, 17U, NJCAA D2).';
COMMENT ON COLUMN public.baseball_teams.region_state IS 'Primary region / state for the program.';
COMMENT ON COLUMN public.baseball_teams.timezone IS 'IANA timezone used for schedule/report-time display.';
COMMENT ON COLUMN public.baseball_teams.season_label IS 'Current season naming (e.g. "Fall 2026", "2026 Summer Circuit").';

-- Best-effort seed program_type from the existing team_type so live teams keep
-- their current mode. Idempotent (only touches the default-seeded value), and
-- never overwrites a value a coach has already chosen.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'baseball_teams'
      AND column_name = 'team_type'
  ) THEN
    UPDATE public.baseball_teams
       SET program_type = team_type::text
     WHERE program_type = 'college'
       AND team_type::text IN ('high_school', 'showcase', 'juco')
       AND team_type::text <> 'college';
  END IF;
END $$;

-- ============================================================================
-- SECTION 2 — baseball_program_settings (1:1 with team; the settings document)
-- ============================================================================
-- One row per team. Holds the v4 feature toggles, default visibility policy,
-- AI settings, notification defaults, appearance, data-retention, and demo mode.
-- Created lazily by the server action (get-or-create) so existing teams need no
-- backfill. Defaults here are the *neutral* defaults; the program-type variant
-- engine (TS) applies distinct per-mode defaults at first creation.

CREATE TABLE IF NOT EXISTS public.baseball_program_settings (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id                     uuid NOT NULL UNIQUE
                                REFERENCES public.baseball_teams(id) ON DELETE CASCADE,

  -- Player access policy (v4 §Player Access Settings)
  players_require_invite      boolean NOT NULL DEFAULT true,
  players_can_self_join       boolean NOT NULL DEFAULT false,
  players_can_edit_profile    boolean NOT NULL DEFAULT false,
  players_can_edit_public_profile boolean NOT NULL DEFAULT false,
  players_can_view_team_stats boolean NOT NULL DEFAULT true,
  players_can_self_log_lift   boolean NOT NULL DEFAULT true,
  players_can_self_report_availability boolean NOT NULL DEFAULT true,
  players_can_upload_video    boolean NOT NULL DEFAULT false,
  players_can_see_ai_summaries boolean NOT NULL DEFAULT false,

  -- Module enablement (v4 §Program Type Settings)
  academics_module_enabled    boolean NOT NULL DEFAULT true,
  travel_module_enabled       boolean NOT NULL DEFAULT true,
  performance_module_depth    text    NOT NULL DEFAULT 'standard'
                                CHECK (performance_module_depth IN ('lite', 'standard', 'full')),
  recruiting_exposure_enabled boolean NOT NULL DEFAULT false,
  public_profiles_enabled     boolean NOT NULL DEFAULT false,

  -- Guardian access (v4 §Guardian Access Settings; HS-only by default)
  guardian_access_enabled     boolean NOT NULL DEFAULT false,
  guardian_can_view_schedule  boolean NOT NULL DEFAULT true,
  guardian_can_view_announcements boolean NOT NULL DEFAULT true,
  guardian_can_view_travel    boolean NOT NULL DEFAULT true,

  -- Showcase / scout access (v4 §Showcase/Scout Access Settings)
  scout_access_enabled        boolean NOT NULL DEFAULT false,
  scout_packet_visibility     text    NOT NULL DEFAULT 'private'
                                CHECK (scout_packet_visibility IN ('private', 'event_only', 'public')),
  scout_can_export            boolean NOT NULL DEFAULT false,
  scout_show_unverified_metrics boolean NOT NULL DEFAULT false,

  -- Default visibility policy for new staff-authored records
  default_visibility          text    NOT NULL DEFAULT 'staff_only'
                                CHECK (default_visibility IN ('staff_only', 'player_visible', 'restricted')),

  -- AI settings (v4 §AI Settings) — every AI output must cite sources + confidence
  ai_enabled                  boolean NOT NULL DEFAULT true,
  ai_staff_enabled            boolean NOT NULL DEFAULT true,
  ai_player_visible_enabled   boolean NOT NULL DEFAULT false,
  ai_require_staff_approval   boolean NOT NULL DEFAULT true,
  ai_require_source_refs      boolean NOT NULL DEFAULT true,
  ai_confidence_threshold     numeric NOT NULL DEFAULT 0.6
                                CHECK (ai_confidence_threshold >= 0 AND ai_confidence_threshold <= 1),
  ai_stale_after_days         integer NOT NULL DEFAULT 14
                                CHECK (ai_stale_after_days > 0),
  ai_medical_guardrail        boolean NOT NULL DEFAULT true,
  ai_academic_privacy_guardrail boolean NOT NULL DEFAULT true,

  -- Notification defaults (v4 §Notification Settings) — JSONB keyed by type
  notification_defaults       jsonb   NOT NULL DEFAULT '{}'::jsonb,
  quiet_hours_start           text,  -- "22:00"
  quiet_hours_end             text,  -- "07:00"

  -- Appearance (v4 §Appearance) — brand accent only; product palette stays cream/green
  brand_accent                text,
  appearance_theme            text NOT NULL DEFAULT 'light'
                                CHECK (appearance_theme IN ('light', 'dark', 'system')),

  -- Data retention (v4 §Data Retention And Audit)
  season_archive_policy       text NOT NULL DEFAULT 'keep'
                                CHECK (season_archive_policy IN ('keep', 'archive_after_season')),
  import_retention_days       integer,   -- null = keep indefinitely
  audit_retention_days        integer NOT NULL DEFAULT 365 CHECK (audit_retention_days > 0),

  -- Demo mode (v4 §Demo Mode)
  demo_mode_enabled           boolean NOT NULL DEFAULT false,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.baseball_program_settings IS
  'One settings document per team: player/guardian/scout access policy, module enablement, AI settings (source-ref + confidence + approval), notification + appearance + data-retention + demo settings. Distinct defaults per program_type are applied by the TS variant engine at first creation; this is a SETTING surface, not a hard fork.';

CREATE INDEX IF NOT EXISTS baseball_program_settings_team_id_idx
  ON public.baseball_program_settings (team_id);

ALTER TABLE public.baseball_program_settings ENABLE ROW LEVEL SECURITY;
-- ============================================================================
-- SECTION 3 — baseball_import_sources (the import source registry)
-- ============================================================================
-- v4 §Import Source Settings. Trust level + required-review + dedupe strictness +
-- player matching strategy + external-id namespace per registered source.

CREATE TABLE IF NOT EXISTS public.baseball_import_sources (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id                uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  source_name            text NOT NULL,
  source_type            text NOT NULL,  -- gamechanger_xml | trackman_csv | rapsodo_csv | sheet | manual ...
  trust_level            text NOT NULL DEFAULT 'unreviewed'
                           CHECK (trust_level IN ('official', 'device_export', 'staff_entered', 'player_entered', 'ai_derived', 'unreviewed')),
  default_visibility     text NOT NULL DEFAULT 'staff_only'
                           CHECK (default_visibility IN ('staff_only', 'player_visible', 'restricted')),
  required_review        boolean NOT NULL DEFAULT true,
  dedupe_strictness      text NOT NULL DEFAULT 'standard'
                           CHECK (dedupe_strictness IN ('loose', 'standard', 'strict')),
  player_match_strategy  text NOT NULL DEFAULT 'name_then_external_id'
                           CHECK (player_match_strategy IN ('external_id_only', 'name_then_external_id', 'manual_only')),
  external_id_namespace  text,
  enabled                boolean NOT NULL DEFAULT true,
  created_by             uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT baseball_import_sources_team_name_key UNIQUE (team_id, source_name)
);

COMMENT ON TABLE public.baseball_import_sources IS
  'Registry of import sources per team with trust level, required-review, dedupe strictness, player-matching strategy and external-id namespace. Drives import dossier confidence + visibility. Adapter CONTRACTS only — no vendor credentials.';

CREATE INDEX IF NOT EXISTS baseball_import_sources_team_id_idx
  ON public.baseball_import_sources (team_id);

ALTER TABLE public.baseball_import_sources ENABLE ROW LEVEL SECURITY;
-- ============================================================================
-- SECTION 4 — baseball_integration_configs (adapter contracts, NOT vendor calls)
-- ============================================================================
-- v4 §Integrations Philosophy: levels 1-4. Stores intended integration level +
-- sync status anchor ONLY. NO credentials, NO direct vendor API calls. Level 4
-- "direct API" rows are inert here — they only record intent + a sync log anchor
-- so the platform can surface "pilot evidence required / not yet connected".

CREATE TABLE IF NOT EXISTS public.baseball_integration_configs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id            uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  provider_key       text NOT NULL,  -- 'trackman' | 'gamechanger' | 'teambuildr' | 'google_sheets' ...
  display_name       text NOT NULL,
  integration_level  integer NOT NULL DEFAULT 1
                       CHECK (integration_level BETWEEN 1 AND 4),
  status             text NOT NULL DEFAULT 'available'
                       CHECK (status IN ('available', 'configured', 'pending_pilot', 'disabled')),
  -- Non-secret config only (mapping presets, source labels). Credentials NEVER
  -- stored here; direct API (level 4) is gated on pilot evidence elsewhere.
  config             jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at     timestamptz,
  last_sync_status   text,
  created_by         uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT baseball_integration_configs_team_provider_key UNIQUE (team_id, provider_key)
);

COMMENT ON TABLE public.baseball_integration_configs IS
  'Per-team integration adapter CONTRACTS (levels 1-4). Records intended level + non-secret config + sync-log anchor only. NO vendor credentials, NO direct API calls. Level 4 rows are inert until pilot evidence + explicit permission.';

CREATE INDEX IF NOT EXISTS baseball_integration_configs_team_id_idx
  ON public.baseball_integration_configs (team_id);

ALTER TABLE public.baseball_integration_configs ENABLE ROW LEVEL SECURITY;
-- ============================================================================
-- SECTION 5 — baseball_settings_audit_log (sensitive setting changes)
-- ============================================================================
-- v4 §Data Retention And Audit. Every sensitive setting change is logged with a
-- before/after diff. Append-only by design (no UPDATE/DELETE policy for staff).

CREATE TABLE IF NOT EXISTS public.baseball_settings_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES public.baseball_teams(id) ON DELETE CASCADE,
  actor_user_id uuid,                 -- auth.uid() of who made the change
  actor_coach_id uuid REFERENCES public.baseball_coaches(id) ON DELETE SET NULL,
  event_type    text NOT NULL
                  CHECK (event_type IN (
                    'program_type_changed', 'role_changed', 'capability_changed',
                    'visibility_changed', 'public_profile_changed', 'guardian_access_changed',
                    'scout_access_changed', 'ai_settings_changed', 'import_source_changed',
                    'integration_changed', 'notification_settings_changed',
                    'data_retention_changed', 'demo_mode_changed', 'data_exported',
                    'settings_changed'
                  )),
  summary       text NOT NULL,
  before_value  jsonb,
  after_value   jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.baseball_settings_audit_log IS
  'Append-only audit trail for sensitive setting changes (program type, roles/caps, visibility, public profile, guardian/scout access, AI settings, imports/integrations, data export). Read = head coach / can_manage_settings; insert = same; never updated or deleted by staff.';

CREATE INDEX IF NOT EXISTS baseball_settings_audit_log_team_created_idx
  ON public.baseball_settings_audit_log (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS baseball_settings_audit_log_event_type_idx
  ON public.baseball_settings_audit_log (team_id, event_type);

-- ============================================================================
-- SECTION 6 — updated_at touch triggers (reuse generic helper if present)
-- ============================================================================
DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    -- baseball_program_settings
    DROP TRIGGER IF EXISTS trg_baseball_program_settings_updated_at ON public.baseball_program_settings;
    CREATE TRIGGER trg_baseball_program_settings_updated_at
      BEFORE UPDATE ON public.baseball_program_settings
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    -- baseball_import_sources
    DROP TRIGGER IF EXISTS trg_baseball_import_sources_updated_at ON public.baseball_import_sources;
    CREATE TRIGGER trg_baseball_import_sources_updated_at
      BEFORE UPDATE ON public.baseball_import_sources
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    -- baseball_integration_configs
    DROP TRIGGER IF EXISTS trg_baseball_integration_configs_updated_at ON public.baseball_integration_configs;
    CREATE TRIGGER trg_baseball_integration_configs_updated_at
      BEFORE UPDATE ON public.baseball_integration_configs
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
ALTER TABLE public.baseball_settings_audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SECTION 7 — RLS POLICIES
-- ============================================================================
-- All policies TO authenticated. service_role bypasses RLS by design.
-- Read of program settings: any team staff/member may READ the settings that
-- shape their experience (player access toggles affect what they can do), but
-- WRITES require can_manage_settings. Import sources / integrations / audit log
-- are staff-only (settings/imports capability). Audit log is append-only.

-- ----------------------------------------------------------------------------
-- baseball_program_settings
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "baseball_program_settings_select" ON public.baseball_program_settings;
DROP POLICY IF EXISTS "baseball_program_settings_insert" ON public.baseball_program_settings;
DROP POLICY IF EXISTS "baseball_program_settings_update" ON public.baseball_program_settings;
DROP POLICY IF EXISTS "baseball_program_settings_delete" ON public.baseball_program_settings;

-- Read: any active team staff OR active team member (toggles affect their UX).
CREATE POLICY "baseball_program_settings_select" ON public.baseball_program_settings
  FOR SELECT TO authenticated
  USING (
    public.is_baseball_team_staff(team_id)
    OR public.is_baseball_team_member(team_id)
  );
-- Write: only staff with can_manage_settings (head/primary coach implicitly).
CREATE POLICY "baseball_program_settings_insert" ON public.baseball_program_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_settings'));
CREATE POLICY "baseball_program_settings_update" ON public.baseball_program_settings
  FOR UPDATE TO authenticated
  USING (public.has_baseball_staff_capability(team_id, 'can_manage_settings'))
  WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_settings'));
CREATE POLICY "baseball_program_settings_delete" ON public.baseball_program_settings
  FOR DELETE TO authenticated
  USING (public.is_baseball_primary_coach(team_id));

-- ----------------------------------------------------------------------------
-- baseball_import_sources  (staff with can_manage_imports)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "baseball_import_sources_select" ON public.baseball_import_sources;
DROP POLICY IF EXISTS "baseball_import_sources_insert" ON public.baseball_import_sources;
DROP POLICY IF EXISTS "baseball_import_sources_update" ON public.baseball_import_sources;
DROP POLICY IF EXISTS "baseball_import_sources_delete" ON public.baseball_import_sources;

CREATE POLICY "baseball_import_sources_select" ON public.baseball_import_sources
  FOR SELECT TO authenticated
  USING (public.has_baseball_staff_capability(team_id, 'can_manage_imports'));
CREATE POLICY "baseball_import_sources_insert" ON public.baseball_import_sources
  FOR INSERT TO authenticated
  WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_imports'));
CREATE POLICY "baseball_import_sources_update" ON public.baseball_import_sources
  FOR UPDATE TO authenticated
  USING (public.has_baseball_staff_capability(team_id, 'can_manage_imports'))
  WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_imports'));
CREATE POLICY "baseball_import_sources_delete" ON public.baseball_import_sources
  FOR DELETE TO authenticated
  USING (public.has_baseball_staff_capability(team_id, 'can_manage_imports'));

-- ----------------------------------------------------------------------------
-- baseball_integration_configs  (staff with can_manage_settings)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "baseball_integration_configs_select" ON public.baseball_integration_configs;
DROP POLICY IF EXISTS "baseball_integration_configs_insert" ON public.baseball_integration_configs;
DROP POLICY IF EXISTS "baseball_integration_configs_update" ON public.baseball_integration_configs;
DROP POLICY IF EXISTS "baseball_integration_configs_delete" ON public.baseball_integration_configs;

CREATE POLICY "baseball_integration_configs_select" ON public.baseball_integration_configs
  FOR SELECT TO authenticated
  USING (public.is_baseball_team_staff(team_id));
CREATE POLICY "baseball_integration_configs_insert" ON public.baseball_integration_configs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_settings'));
CREATE POLICY "baseball_integration_configs_update" ON public.baseball_integration_configs
  FOR UPDATE TO authenticated
  USING (public.has_baseball_staff_capability(team_id, 'can_manage_settings'))
  WITH CHECK (public.has_baseball_staff_capability(team_id, 'can_manage_settings'));
CREATE POLICY "baseball_integration_configs_delete" ON public.baseball_integration_configs
  FOR DELETE TO authenticated
  USING (public.has_baseball_staff_capability(team_id, 'can_manage_settings'));

-- ----------------------------------------------------------------------------
-- baseball_settings_audit_log  (append-only; staff read; no staff update/delete)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "baseball_settings_audit_log_select" ON public.baseball_settings_audit_log;
DROP POLICY IF EXISTS "baseball_settings_audit_log_insert" ON public.baseball_settings_audit_log;
-- (No UPDATE/DELETE policies — append-only; service_role may prune per retention.)

CREATE POLICY "baseball_settings_audit_log_select" ON public.baseball_settings_audit_log
  FOR SELECT TO authenticated
  USING (public.has_baseball_staff_capability(team_id, 'can_manage_settings'));
CREATE POLICY "baseball_settings_audit_log_insert" ON public.baseball_settings_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_baseball_staff_capability(team_id, 'can_manage_settings')
    AND actor_user_id = auth.uid()
  );

-- ============================================================================
-- SECTION 8 — anon lockdown (defence in depth; no anon grants on new tables)
-- ============================================================================
REVOKE ALL ON public.baseball_program_settings    FROM anon;
REVOKE ALL ON public.baseball_import_sources       FROM anon;
REVOKE ALL ON public.baseball_integration_configs  FROM anon;
REVOKE ALL ON public.baseball_settings_audit_log   FROM anon;

-- ============================================================================
-- END — Settings OS. ADDITIVE. RLS-complete. NOT applied to any DB.
-- ============================================================================
