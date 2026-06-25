// =============================================================================
// baseball-extended.ts
//
// Hand-aligned TypeScript types for the BaseballHelm Wave 1 schema migrations:
//   20260624000010_baseball_stat_uploads_reconcile.sql
//   20260624000020_baseball_import_lineage.sql
//   20260624000030_baseball_staff_capabilities.sql
//   20260624000040_baseball_timeline_and_acks.sql
//   20260624000050_baseball_rls_helpers_and_policies.sql  (RLS only; no new cols)
//
// WHY THIS FILE EXISTS
//   The generated src/lib/types/database.ts is regenerated from the live DB and
//   does NOT yet reflect these freshly-written-but-not-yet-applied migrations.
//   This file hand-mirrors the EXACT column names/types from the SQL above so
//   feature code can be written against the new shapes today. Once the
//   migrations are applied and database.ts is regenerated, the generated table
//   types will supersede these and these can be collapsed into thin aliases.
//
//   Column names/types here match the SQL byte-for-byte:
//     SQL text          -> string
//     SQL uuid          -> string
//     SQL integer       -> number
//     SQL numeric       -> number
//     SQL boolean       -> boolean
//     SQL jsonb         -> Json
//     SQL date          -> string (ISO date)
//     SQL timestamptz   -> string (ISO timestamp)
//     NOT NULL          -> required, non-null
//     NULLable          -> `| null`
//     has DEFAULT       -> optional in Insert (`?`)
//
// OWNERSHIP: this file + the one-line re-export in index.ts only. Do NOT edit
// the generated database.ts.
// =============================================================================

import type { Database } from './database';

/** Mirror of the generated `Json` helper for jsonb columns. */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// =============================================================================
// SHARED STRING-ENUMS (TEXT + CHECK in SQL)
// =============================================================================

/**
 * baseball_import_runs.status CHECK list.
 * Source: 20260624000020 SECTION 1.
 */
export type BaseballImportRunStatus =
  | 'pending'
  | 'parsing'
  | 'matching'
  | 'review'
  | 'committed'
  | 'rolled_back'
  | 'failed';

/**
 * baseball_staff_invitations.status CHECK list.
 * Source: 20260624000030 SECTION 3.
 */
export type BaseballStaffInvitationStatus =
  | 'pending'
  | 'accepted'
  | 'revoked'
  | 'expired';

/**
 * baseball_player_timeline_events.visibility CHECK list.
 *   team        -> all team members (players + coaches)
 *   staff_only  -> coaches/staff only (RLS never returns to players)
 *   player_only -> the subject player + coaches
 * Source: 20260624000040.
 */
export type BaseballTimelineVisibility = 'team' | 'staff_only' | 'player_only';

// =============================================================================
// 1. baseball_import_runs
//    Source: 20260624000020 SECTION 1
// =============================================================================

export interface BaseballImportRunRow {
  id: string;
  team_id: string;
  source_id: string;
  /** Required human label (NOT NULL per the data contract; backfilled on legacy rows). */
  source_label: string;
  /** Kind of object ingested ('stats' default); scopes the duplicate-file warning. NOT NULL. */
  import_type: string;
  file_name: string | null;
  file_url: string | null;
  status: BaseballImportRunStatus;
  total_rows: number;
  matched_rows: number;
  unmatched_rows: number;
  /** Parsed rows that passed validation (contract; NOT NULL, default 0). */
  valid_row_count: number;
  /** Parsed rows with a non-fatal warning (contract; NOT NULL, default 0). */
  warning_count: number;
  /** Parsed rows that failed with a hard error (contract; NOT NULL, default 0). */
  error_count: number;
  /**
   * Staff member who started the run. Contract NOT NULL on a converged DB; null
   * only on a legacy live row predating the created_by backfill (20260624000020).
   */
  created_by: string | null;
  created_at: string;
  committed_at: string | null;
  rolled_back_at: string | null;
}

export interface BaseballImportRunInsert {
  id?: string;
  team_id: string;
  source_id: string;
  /** Contract-required label; DB has a '' default but callers must pass a real value. */
  source_label?: string;
  /** Contract-required; DB defaults to 'stats' if omitted. */
  import_type?: string;
  file_name?: string | null;
  file_url?: string | null;
  status?: BaseballImportRunStatus;
  total_rows?: number;
  matched_rows?: number;
  unmatched_rows?: number;
  valid_row_count?: number;
  warning_count?: number;
  error_count?: number;
  /** Contract-required NOT NULL: the staff member starting the run. */
  created_by: string;
  created_at?: string;
  committed_at?: string | null;
  rolled_back_at?: string | null;
}

export interface BaseballImportRunUpdate {
  id?: string;
  team_id?: string;
  source_id?: string;
  source_label?: string;
  import_type?: string;
  file_name?: string | null;
  file_url?: string | null;
  status?: BaseballImportRunStatus;
  total_rows?: number;
  matched_rows?: number;
  unmatched_rows?: number;
  valid_row_count?: number;
  warning_count?: number;
  error_count?: number;
  created_by?: string | null;
  created_at?: string;
  committed_at?: string | null;
  rolled_back_at?: string | null;
}

// =============================================================================
// 2. baseball_player_external_ids
//    Source: 20260624000020 SECTION 2
// =============================================================================

export interface BaseballPlayerExternalIdRow {
  id: string;
  /**
   * Team scope (contract NOT NULL on a converged DB). Makes the external-id map
   * team-scoped so the same vendor id can map to different players across teams.
   * Null only on a legacy live row whose team could not be backfilled.
   */
  team_id: string | null;
  player_id: string;
  source_id: string;
  external_id: string;
  /** Human-readable source name shown in the match UI (contract). */
  source_display_name: string | null;
  confidence: number | null;
  /** Whether a coach explicitly confirmed this mapping (contract; NOT NULL, default false). */
  verified: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface BaseballPlayerExternalIdInsert {
  id?: string;
  /** Contract-required team scope; DB enforces NOT NULL on a converged DB. */
  team_id: string;
  player_id: string;
  source_id: string;
  external_id: string;
  source_display_name?: string | null;
  confidence?: number | null;
  verified?: boolean;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface BaseballPlayerExternalIdUpdate {
  id?: string;
  team_id?: string;
  player_id?: string;
  source_id?: string;
  external_id?: string;
  source_display_name?: string | null;
  confidence?: number | null;
  verified?: boolean;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

// =============================================================================
// 3. baseball_staff_invitations
//    Source: 20260624000030 SECTION 3
// =============================================================================

export interface BaseballStaffInvitationRow {
  id: string;
  team_id: string;
  email: string;
  role: string | null;
  capabilities: Json;
  invited_by: string | null;
  token: string;
  status: BaseballStaffInvitationStatus;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface BaseballStaffInvitationInsert {
  id?: string;
  team_id: string;
  email: string;
  role?: string | null;
  capabilities?: Json;
  invited_by?: string | null;
  token?: string; // DEFAULT encode(gen_random_bytes(24),'hex')
  status?: BaseballStaffInvitationStatus;
  expires_at?: string; // DEFAULT now() + interval '14 days'
  accepted_at?: string | null;
  created_at?: string;
}

export interface BaseballStaffInvitationUpdate {
  id?: string;
  team_id?: string;
  email?: string;
  role?: string | null;
  capabilities?: Json;
  invited_by?: string | null;
  token?: string;
  status?: BaseballStaffInvitationStatus;
  expires_at?: string;
  accepted_at?: string | null;
  created_at?: string;
}

// =============================================================================
// 4. baseball_player_timeline_events
//    Source: 20260624000040 SECTION 1
// =============================================================================

export interface BaseballPlayerTimelineEventRow {
  id: string;
  player_id: string;
  team_id: string;
  event_type: string;
  title: string;
  body: string | null;
  source_type: string | null;
  source_id: string | null;
  confidence: number | null;
  occurred_at: string;
  created_by: string | null;
  created_at: string;
  visibility: BaseballTimelineVisibility;
}

export interface BaseballPlayerTimelineEventInsert {
  id?: string;
  player_id: string;
  team_id: string;
  event_type: string;
  title: string;
  body?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  confidence?: number | null;
  occurred_at?: string;
  created_by?: string | null;
  created_at?: string;
  visibility?: BaseballTimelineVisibility;
}

export interface BaseballPlayerTimelineEventUpdate {
  id?: string;
  player_id?: string;
  team_id?: string;
  event_type?: string;
  title?: string;
  body?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  confidence?: number | null;
  occurred_at?: string;
  created_by?: string | null;
  created_at?: string;
  visibility?: BaseballTimelineVisibility;
}

// =============================================================================
// 5. baseball_event_acknowledgements
//    Source: 20260624000040 SECTION 2
//    Unique (event_id, user_id).
// =============================================================================

export interface BaseballEventAcknowledgementRow {
  id: string;
  event_id: string;
  user_id: string;
  acknowledged_at: string;
}

export interface BaseballEventAcknowledgementInsert {
  id?: string;
  event_id: string;
  user_id: string;
  acknowledged_at?: string;
}

export interface BaseballEventAcknowledgementUpdate {
  id?: string;
  event_id?: string;
  user_id?: string;
  acknowledged_at?: string;
}

// =============================================================================
// AUGMENT: new columns on EXISTING tables
// =============================================================================

/**
 * Additive columns added to baseball_stat_uploads by
 * 20260624000010_baseball_stat_uploads_reconcile.sql.
 *
 * The "session" columns (stat_type..unmatched_data) already had a hand-written
 * shape in index.ts (`BaseballStatUpload`); the import-lineage columns
 * (import_run_id..match_confidence) are new. This interface captures ONLY the
 * columns the reconcile migration adds, so callers can compose it with the
 * generated/base upload row.
 */
export interface BaseballStatUploadImportLineageColumns {
  // Section 1: archived "session" columns (text/date/int/jsonb, all nullable or defaulted).
  stat_type: string | null;
  session_date: string | null;
  session_name: string | null;
  total_rows: number | null;
  matched_rows: number | null;
  unmatched_rows: number | null;
  unmatched_data: Json | null;
  // Section 2: import-lineage provenance columns.
  import_run_id: string | null;
  source_id: string | null;
  mapping_config: Json | null;
  match_confidence: number | null;
}

/**
 * Granular per-staff capability columns added to baseball_team_coach_staff by
 * 20260624000030_baseball_staff_capabilities.sql. All booleans NOT NULL DEFAULT
 * false; `capabilities` jsonb NOT NULL DEFAULT '{}'. In Row reads they are
 * always present (non-null); in Insert they are optional (defaulted).
 */
export interface BaseballStaffCapabilityColumns {
  can_manage_roster: boolean;
  can_manage_practice: boolean;
  can_manage_lifting: boolean;
  can_view_academics: boolean;
  can_manage_imports: boolean;
  can_manage_stats: boolean;
  can_invite_staff: boolean;
  can_manage_settings: boolean;
  can_view_medical: boolean;
  can_message_team: boolean;
  can_manage_calendar: boolean;
  is_head_coach: boolean;
  capabilities: Json;
}

/** The 13 boolean/jsonb capability fields, all optional (defaulted in SQL). */
export type BaseballStaffCapabilityColumnsInsert =
  Partial<BaseballStaffCapabilityColumns>;

/** Canonical list of the core boolean capability flags (excludes the jsonb bag). */
export type BaseballStaffCapabilityKey =
  | 'can_manage_roster'
  | 'can_manage_practice'
  | 'can_manage_lifting'
  | 'can_view_academics'
  | 'can_manage_imports'
  | 'can_manage_stats'
  | 'can_invite_staff'
  | 'can_manage_settings'
  | 'can_view_medical'
  | 'can_message_team'
  | 'can_manage_calendar'
  | 'is_head_coach';

// -----------------------------------------------------------------------------
// Composed Row/Insert/Update for baseball_team_coach_staff = generated base
// (from database.ts) intersected with the new capability columns. Use these
// until database.ts is regenerated post-apply.
// -----------------------------------------------------------------------------

type TeamCoachStaffBase =
  Database['public']['Tables']['baseball_team_coach_staff'];

export type BaseballTeamCoachStaffRow =
  TeamCoachStaffBase['Row'] & BaseballStaffCapabilityColumns;

export type BaseballTeamCoachStaffInsert =
  TeamCoachStaffBase['Insert'] & BaseballStaffCapabilityColumnsInsert;

export type BaseballTeamCoachStaffUpdate =
  TeamCoachStaffBase['Update'] & BaseballStaffCapabilityColumnsInsert;

// -----------------------------------------------------------------------------
// Composed Row/Insert/Update for baseball_stat_uploads = generated base
// intersected with the reconcile migration's new columns.
// -----------------------------------------------------------------------------

type StatUploadsBase = Database['public']['Tables']['baseball_stat_uploads'];

export type BaseballStatUploadRow =
  StatUploadsBase['Row'] & BaseballStatUploadImportLineageColumns;

export type BaseballStatUploadInsert =
  StatUploadsBase['Insert'] & Partial<BaseballStatUploadImportLineageColumns>;

export type BaseballStatUploadUpdate =
  StatUploadsBase['Update'] & Partial<BaseballStatUploadImportLineageColumns>;

// =============================================================================
// baseball_coach_notes — scoped Staff Notes (v7 Player Profile §"Staff Notes")
//   Source: 20260624000900_baseball_coach_notes.sql
//   Hand-written because we cannot db:types regen against the shared prod DB.
// =============================================================================

/**
 * The 6 visibility scopes a staff note can carry. RLS enforces who may read each
 * (see 20260624000900). `player_visible` is the ONLY scope the subject player can
 * read; `hidden_from_player` is the strictest (private-notes capability, never
 * the player).
 */
export type BaseballNoteScope =
  | 'staff_public'
  | 'coach_group'
  | 'strength'
  | 'academic'
  | 'player_visible'
  | 'hidden_from_player';

/** Ordered list of scopes for UI iteration (most-open -> most-restricted). */
export const BASEBALL_NOTE_SCOPES: readonly BaseballNoteScope[] = [
  'staff_public',
  'player_visible',
  'coach_group',
  'strength',
  'academic',
  'hidden_from_player',
] as const;

export interface BaseballCoachNoteRow {
  id: string;
  player_id: string;
  team_id: string;
  author_coach_id: string | null;
  body: string;
  scope: BaseballNoteScope;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface BaseballCoachNoteInsert {
  id?: string;
  player_id: string;
  team_id: string;
  author_coach_id?: string | null;
  body: string;
  scope?: BaseballNoteScope;
  edited_at?: string | null;
  deleted_at?: string | null;
  created_at?: string;
}

export interface BaseballCoachNoteUpdate {
  body?: string;
  scope?: BaseballNoteScope;
  edited_at?: string | null;
  deleted_at?: string | null;
}
