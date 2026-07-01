// =============================================================================
// src/lib/types/baseball-settings.ts
//
// Wave 4 / packet: settings-os
//
// HAND-WRITTEN TypeScript types for the BaseballHelm Settings OS tables added by
//   supabase/migrations/20260624000090_baseball_settings_os.sql
//
// These are owned by THIS packet (not the generated Database type barrel) because
// the migration is WRITTEN, NOT APPLIED — Supabase types cannot be regenerated
// against an unapplied schema. When the migration lands and types are regen'd,
// these can be reconciled with the generated rows; until then this file is the
// source of truth for the settings surface.
//
// Mirrors exactly the column set + CHECK constraints of:
//   * baseball_teams (added program-type columns)
//   * baseball_program_settings
//   * baseball_import_sources
//   * baseball_integration_configs
//   * baseball_settings_audit_log
// =============================================================================

// -----------------------------------------------------------------------------
// Program type — the controlling setting (v4)
// -----------------------------------------------------------------------------

/**
 * The controlling program mode. Drives default nav, terminology, feature
 * toggles, permission bundles and onboarding. A SETTING, never a hard-coded
 * fork. `academy` / `club` are program_type-only modes (not in the
 * baseball_coach_type enum).
 */
export type BaseballProgramType =
  | 'college'
  | 'high_school'
  | 'showcase'
  | 'juco'
  | 'academy'
  | 'club';

export const BASEBALL_PROGRAM_TYPES: readonly BaseballProgramType[] = [
  'college',
  'high_school',
  'showcase',
  'juco',
  'academy',
  'club',
] as const;

/** Default visibility for new staff-authored records. */
export type BaseballDefaultVisibility = 'staff_only' | 'player_visible' | 'restricted';

/** Source trust ladder (v4 §Import Source Settings). */
export type BaseballSourceTrustLevel =
  | 'official'
  | 'device_export'
  | 'staff_entered'
  | 'player_entered'
  | 'ai_derived'
  | 'unreviewed';

export type BaseballPerformanceDepth = 'lite' | 'standard' | 'full';
export type BaseballAppearanceTheme = 'light' | 'dark' | 'system';
export type BaseballScoutPacketVisibility = 'private' | 'event_only' | 'public';
export type BaseballSeasonArchivePolicy = 'keep' | 'archive_after_season';
export type BaseballDedupeStrictness = 'loose' | 'standard' | 'strict';
export type BaseballPlayerMatchStrategy =
  | 'external_id_only'
  | 'name_then_external_id'
  | 'manual_only';
export type BaseballIntegrationStatus =
  | 'available'
  | 'configured'
  | 'pending_pilot'
  | 'disabled';

export type BaseballSettingsAuditEvent =
  | 'program_type_changed'
  | 'role_changed'
  | 'capability_changed'
  | 'visibility_changed'
  | 'public_profile_changed'
  | 'guardian_access_changed'
  | 'scout_access_changed'
  | 'ai_settings_changed'
  | 'import_source_changed'
  | 'integration_changed'
  | 'notification_settings_changed'
  | 'data_retention_changed'
  | 'demo_mode_changed'
  | 'data_exported'
  | 'settings_changed';

// -----------------------------------------------------------------------------
// baseball_teams — the program-type columns this packet added
// -----------------------------------------------------------------------------

/** The program-identity columns added to baseball_teams by the settings-os migration. */
export interface BaseballTeamProgramFields {
  program_type: BaseballProgramType;
  competition_level: string | null;
  region_state: string | null;
  timezone: string;
  season_label: string | null;
}

// -----------------------------------------------------------------------------
// baseball_program_settings (1:1 with team)
// -----------------------------------------------------------------------------

export interface BaseballProgramSettings {
  id: string;
  team_id: string;

  // Player access
  players_require_invite: boolean;
  players_can_self_join: boolean;
  players_can_edit_profile: boolean;
  players_can_edit_public_profile: boolean;
  players_can_view_team_stats: boolean;
  players_can_self_log_lift: boolean;
  players_can_self_report_availability: boolean;
  players_can_upload_video: boolean;
  players_can_see_ai_summaries: boolean;

  // Module enablement
  academics_module_enabled: boolean;
  travel_module_enabled: boolean;
  performance_module_depth: BaseballPerformanceDepth;
  recruiting_exposure_enabled: boolean;
  public_profiles_enabled: boolean;

  // Guardian access
  guardian_access_enabled: boolean;
  guardian_can_view_schedule: boolean;
  guardian_can_view_announcements: boolean;
  guardian_can_view_travel: boolean;

  // Showcase / scout access
  scout_access_enabled: boolean;
  scout_packet_visibility: BaseballScoutPacketVisibility;
  scout_can_export: boolean;
  scout_show_unverified_metrics: boolean;

  // Default visibility
  default_visibility: BaseballDefaultVisibility;

  // AI
  ai_enabled: boolean;
  ai_staff_enabled: boolean;
  ai_player_visible_enabled: boolean;
  ai_require_staff_approval: boolean;
  ai_require_source_refs: boolean;
  ai_confidence_threshold: number;
  ai_stale_after_days: number;
  ai_medical_guardrail: boolean;
  ai_academic_privacy_guardrail: boolean;

  // Notifications
  notification_defaults: Record<string, BaseballNotificationPref>;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;

  // Appearance
  brand_accent: string | null;
  appearance_theme: BaseballAppearanceTheme;

  // Data retention
  season_archive_policy: BaseballSeasonArchivePolicy;
  import_retention_days: number | null;
  audit_retention_days: number;

  // Demo mode
  demo_mode_enabled: boolean;

  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/** Per-notification-type channel preference (stored in notification_defaults jsonb). */
export interface BaseballNotificationPref {
  in_app: boolean;
  email: boolean;
}

/** The notification event types a program can configure (v4 §Notification Settings). */
export type BaseballNotificationType =
  | 'event_changed'
  | 'acknowledgement_required'
  | 'practice_published'
  | 'lift_assigned'
  | 'check_in_required'
  | 'import_needs_review'
  | 'signal_assigned'
  | 'task_due'
  | 'travel_changed'
  | 'player_profile_update'
  | 'staff_meeting_item'
  | 'message';

export const BASEBALL_NOTIFICATION_TYPES: readonly BaseballNotificationType[] = [
  'event_changed',
  'acknowledgement_required',
  'practice_published',
  'lift_assigned',
  'check_in_required',
  'import_needs_review',
  'signal_assigned',
  'task_due',
  'travel_changed',
  'player_profile_update',
  'staff_meeting_item',
  'message',
] as const;

/** The settings a coach may update (everything except identity/audit columns). */
export type BaseballProgramSettingsUpdate = Partial<
  Omit<BaseballProgramSettings, 'id' | 'team_id' | 'created_at' | 'updated_at' | 'updated_by'>
>;

// -----------------------------------------------------------------------------
// baseball_import_sources
// -----------------------------------------------------------------------------

// NOTE: named *SourceConfig (not BaseballImportSource) — the latter already
// exists in baseball-imports.ts as an import-ROW transport type. This is the
// SETTINGS registry row (the configured source), a distinct concept.
export interface BaseballImportSourceConfig {
  id: string;
  team_id: string;
  source_name: string;
  source_type: string;
  trust_level: BaseballSourceTrustLevel;
  default_visibility: BaseballDefaultVisibility;
  required_review: boolean;
  dedupe_strictness: BaseballDedupeStrictness;
  player_match_strategy: BaseballPlayerMatchStrategy;
  external_id_namespace: string | null;
  enabled: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type BaseballImportSourceConfigInsert = Pick<
  BaseballImportSourceConfig,
  'source_name' | 'source_type'
> &
  Partial<
    Pick<
      BaseballImportSourceConfig,
      | 'trust_level'
      | 'default_visibility'
      | 'required_review'
      | 'dedupe_strictness'
      | 'player_match_strategy'
      | 'external_id_namespace'
      | 'enabled'
    >
  >;

// -----------------------------------------------------------------------------
// baseball_integration_configs (adapter contracts only)
// -----------------------------------------------------------------------------

export interface BaseballIntegrationConfig {
  id: string;
  team_id: string;
  provider_key: string;
  display_name: string;
  /** 1 = import template, 2 = attachment/link, 3 = assisted import, 4 = direct API (inert). */
  integration_level: 1 | 2 | 3 | 4;
  status: BaseballIntegrationStatus;
  config: Record<string, unknown>;
  last_synced_at: string | null;
  last_sync_status: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// -----------------------------------------------------------------------------
// baseball_settings_audit_log
// -----------------------------------------------------------------------------

export interface BaseballSettingsAuditEntry {
  id: string;
  team_id: string;
  actor_user_id: string | null;
  actor_coach_id: string | null;
  event_type: BaseballSettingsAuditEvent;
  summary: string;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  created_at: string;
}
