// =============================================================================
// src/lib/types/baseball-staff-roles.ts
//
// Wave 11 / packet: staff-roles  (V11 — 26_final_auth_lifting_current_app_v11)
//
// Hand-written TS types + runtime presets for the V11 staff-role taxonomy and
// per-role default capability bundles. These back the additive migration
// 20260624000081_baseball_staff_roles_scope_audit.sql (NOT applied):
//   - baseball_team_coach_staff.staff_role / title / status / *_scope columns
//   - baseball_staff_invitations scope columns + audit table
//
// SOURCE OF TRUTH for capability KEYS is src/lib/baseball/capabilities.ts
// (BaseballCapability). This file only adds the role taxonomy + the default
// capability bundle each role grants on accept/creation.
//
// V11 spec refs: "Role Taxonomy" (12 staff roles) + "Strength Coach Invite"
// (strength-coach preset) + "Default Capability Bundles" in the role/permission
// matrix contract.
// =============================================================================

import type { BaseballCapability } from '@/lib/baseball/capabilities';

// -----------------------------------------------------------------------------
// V11 staff roles — the 12 canonical roles from the spec "Role Taxonomy" table.
// Stored in baseball_team_coach_staff.staff_role (text) and on the invitation.
// -----------------------------------------------------------------------------

export type BaseballStaffRole =
  | 'head_coach'
  | 'associate_head_coach'
  | 'assistant_coach'
  | 'pitching_coach'
  | 'hitting_coach'
  | 'catching_coach'
  | 'defensive_coach'
  | 'strength_coach'
  | 'athletic_trainer'
  | 'director_ops'
  | 'analyst'
  | 'volunteer';

/** Ordered runtime list of the 12 V11 staff roles. */
export const BASEBALL_STAFF_ROLES: readonly BaseballStaffRole[] = [
  'head_coach',
  'associate_head_coach',
  'assistant_coach',
  'pitching_coach',
  'hitting_coach',
  'catching_coach',
  'defensive_coach',
  'strength_coach',
  'athletic_trainer',
  'director_ops',
  'analyst',
  'volunteer',
] as const;

/** Product label + default landing route for each role (spec "Role Taxonomy"). */
export interface BaseballStaffRoleMeta {
  role: BaseballStaffRole;
  label: string;
  /** Default landing route after login/accept. All start with /baseball. */
  defaultLanding: string;
}

export const BASEBALL_STAFF_ROLE_META: Record<
  BaseballStaffRole,
  BaseballStaffRoleMeta
> = {
  head_coach: {
    role: 'head_coach',
    label: 'Head Coach',
    defaultLanding: '/baseball/dashboard/command-center',
  },
  associate_head_coach: {
    role: 'associate_head_coach',
    label: 'Associate Head Coach',
    defaultLanding: '/baseball/dashboard/command-center',
  },
  assistant_coach: {
    role: 'assistant_coach',
    label: 'Assistant Coach',
    defaultLanding: '/baseball/dashboard/command-center',
  },
  pitching_coach: {
    role: 'pitching_coach',
    label: 'Pitching Coach',
    defaultLanding: '/baseball/dashboard/command-center',
  },
  hitting_coach: {
    role: 'hitting_coach',
    label: 'Hitting Coach',
    defaultLanding: '/baseball/dashboard/command-center',
  },
  catching_coach: {
    role: 'catching_coach',
    label: 'Catching Coach',
    defaultLanding: '/baseball/dashboard/command-center',
  },
  defensive_coach: {
    role: 'defensive_coach',
    label: 'Defensive Coach',
    defaultLanding: '/baseball/dashboard/command-center',
  },
  strength_coach: {
    role: 'strength_coach',
    label: 'Performance Coach',
    defaultLanding: '/baseball/dashboard/performance',
  },
  athletic_trainer: {
    role: 'athletic_trainer',
    label: 'Athletic Trainer',
    defaultLanding: '/baseball/dashboard/performance',
  },
  director_ops: {
    role: 'director_ops',
    label: 'Director of Ops',
    defaultLanding: '/baseball/dashboard/command-center',
  },
  analyst: {
    role: 'analyst',
    label: 'Analyst',
    defaultLanding: '/baseball/dashboard/stats-center',
  },
  volunteer: {
    role: 'volunteer',
    label: 'Volunteer Staff',
    defaultLanding: '/baseball/dashboard/command-center',
  },
};

// -----------------------------------------------------------------------------
// Default capability PRESETS — the capability bundle each role grants by default
// on invite-accept / program creation. A head coach holds every capability
// implicitly (is_head_coach short-circuits resolution), so its preset is the
// full set for display/seeding parity. is_head_coach itself is NEVER set via a
// preset bundle here — head-coach promotion is an explicit, separate concern.
// -----------------------------------------------------------------------------

/** A preset is the list of capabilities a role grants by default. */
export type BaseballStaffRolePreset = Partial<Record<BaseballCapability, boolean>>;

/** Build a full all-false map then flip the granted keys true. */
function preset(granted: readonly BaseballCapability[]): BaseballStaffRolePreset {
  const out: BaseballStaffRolePreset = {};
  for (const cap of granted) out[cap] = true;
  return out;
}

export const BASEBALL_STAFF_ROLE_PRESETS: Record<
  BaseballStaffRole,
  BaseballStaffRolePreset
> = {
  // Head/associate head: full operational authority (head_coach also gets
  // is_head_coach set on the row separately, granting implicit-all).
  head_coach: preset([
    'can_manage_roster',
    'can_manage_practice',
    'can_manage_lifting',
    'can_manage_lineups',
    'can_view_academics',
    'can_manage_imports',
    'can_manage_stats',
    'can_invite_staff',
    'can_manage_settings',
    'can_view_readiness',
    'can_modify_availability',
    'can_view_medical',
    'can_view_private_notes',
    'can_message_players',
    'can_export_reports',
    'can_manage_calendar',
  ]),
  associate_head_coach: preset([
    'can_manage_roster',
    'can_manage_practice',
    'can_manage_lifting',
    'can_manage_lineups',
    'can_view_academics',
    'can_manage_imports',
    'can_manage_stats',
    'can_invite_staff',
    'can_view_readiness',
    'can_modify_availability',
    'can_view_private_notes',
    'can_message_players',
    'can_export_reports',
    'can_manage_calendar',
  ]),
  assistant_coach: preset([
    'can_manage_roster',
    'can_manage_practice',
    'can_manage_lineups',
    'can_manage_stats',
    'can_view_private_notes',
    'can_message_players',
    'can_manage_calendar',
  ]),
  pitching_coach: preset([
    'can_manage_practice',
    'can_manage_lineups',
    'can_manage_stats',
    'can_view_readiness',
    'can_view_private_notes',
    'can_message_players',
  ]),
  hitting_coach: preset([
    'can_manage_practice',
    'can_manage_lineups',
    'can_manage_stats',
    'can_view_private_notes',
    'can_message_players',
  ]),
  catching_coach: preset([
    'can_manage_practice',
    'can_manage_stats',
    'can_view_readiness',
    'can_view_private_notes',
    'can_message_players',
  ]),
  defensive_coach: preset([
    'can_manage_practice',
    'can_manage_lineups',
    'can_manage_stats',
    'can_view_private_notes',
    'can_message_players',
  ]),
  // Strength / performance coach — the explicit V11 "Strength Coach Invite"
  // preset. MUST hold can_view_readiness (gates the readiness board); does NOT
  // get can_modify_availability / can_manage_practice / can_view_private_notes
  // by default. can_export_reports for performance reports. (Spec "Strength
  // Coach Invite": can_manage_lifting=true, can_view_readiness=true,
  // can_modify_availability=false, can_manage_practice=false,
  // can_view_private_notes=false, can_message_players=true, can_export_reports=true.)
  strength_coach: preset([
    'can_manage_lifting',
    'can_view_readiness',
    'can_manage_stats', // read-only summary, write still gated by RLS scope
    'can_message_players',
    'can_export_reports',
  ]),
  // Athletic trainer — availability + readiness; can modify availability; no
  // private tactical/academic notes by default (spec "Role Taxonomy").
  athletic_trainer: preset([
    'can_view_readiness',
    'can_modify_availability',
    'can_view_medical',
    'can_message_players',
  ]),
  // Director of ops — calendar/travel/logistics + imports.
  director_ops: preset([
    'can_manage_calendar',
    'can_manage_imports',
    'can_message_players',
    'can_export_reports',
  ]),
  // Analyst — imports/stats/reports; no private notes or readiness by default.
  analyst: preset([
    'can_manage_imports',
    'can_manage_stats',
    'can_export_reports',
  ]),
  // Volunteer — minimal; practice assist + messaging only.
  volunteer: preset(['can_manage_practice']),
};

/**
 * Resolve a role's default capability preset, falling back to an empty bundle
 * for an unknown/free-text role. Pure; safe in client + server bundles.
 */
export function getBaseballStaffRolePreset(
  role: string | null | undefined,
): BaseballStaffRolePreset {
  if (role && role in BASEBALL_STAFF_ROLE_PRESETS) {
    return BASEBALL_STAFF_ROLE_PRESETS[role as BaseballStaffRole];
  }
  return {};
}

/** True when `role` is one of the 12 canonical V11 staff roles. */
export function isBaseballStaffRole(
  role: string | null | undefined,
): role is BaseballStaffRole {
  return Boolean(role && role in BASEBALL_STAFF_ROLE_META);
}

// -----------------------------------------------------------------------------
// Scope shapes (player_scope / position_scope / group_scope) — match the
// additive scope columns on baseball_team_coach_staff + baseball_staff_invitations.
// -----------------------------------------------------------------------------

/**
 * player_scope jsonb: when present, restricts a staffer's visibility to a set of
 * players. `null`/absent means "all team players" (subject to RLS). The object
 * form supports a future include/exclude model without a schema change.
 */
export interface BaseballPlayerScope {
  /** Explicit allow-list of player ids; null/empty = unrestricted. */
  player_ids?: string[];
  /** Optional explicit deny-list (applied after the allow-list). */
  exclude_player_ids?: string[];
}

/** Resolved scope columns shared by staff rows + invitations. */
export interface BaseballStaffScope {
  /** Job title free-text (e.g. "Pitching Coordinator"). */
  title: string | null;
  /** Canonical V11 role (or null for legacy free-text). */
  staff_role: BaseballStaffRole | null;
  /** Player visibility scope; null = all team players. */
  player_scope: BaseballPlayerScope | null;
  /** Canonical uuid[] player allowlist (#406); null = all team players. */
  scope_player_ids?: string[] | null;
  /** Position codes a staffer is scoped to; null/empty = all positions. */
  position_scope: string[] | null;
  /** Lift/player group ids a staffer is scoped to; null/empty = all groups. */
  group_scope: string[] | null;
}

// -----------------------------------------------------------------------------
// Audit event — matches baseball_staff_audit_events written on invite-accept
// and role/capability change.
// -----------------------------------------------------------------------------

export type BaseballStaffAuditAction =
  | 'invite_accepted'
  | 'role_changed'
  | 'capabilities_changed'
  | 'staff_removed';

export interface BaseballStaffAuditEventRow {
  id: string;
  team_id: string;
  /** The staff row affected (baseball_team_coach_staff.id), if resolved. */
  staff_id: string | null;
  /** The coach the event is about. */
  subject_coach_id: string | null;
  /** Who performed the action (null for self-accept). */
  actor_coach_id: string | null;
  action: BaseballStaffAuditAction;
  /** Role before/after for role_changed. */
  previous_role: string | null;
  new_role: string | null;
  /** Capability deltas / snapshot for capabilities_changed (jsonb). */
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface BaseballStaffAuditEventInsert {
  id?: string;
  team_id: string;
  staff_id?: string | null;
  subject_coach_id?: string | null;
  actor_coach_id?: string | null;
  action: BaseballStaffAuditAction;
  previous_role?: string | null;
  new_role?: string | null;
  detail?: Record<string, unknown> | null;
  created_at?: string;
}
