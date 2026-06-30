// =============================================================================
// src/lib/baseball/capabilities.ts
//
// Wave 2 / packet: staff-roles
//
// SERVER-ENFORCED capability layer for BaseballHelm coaching staff.
//
// This is the application-side mirror of the SQL helpers shipped in
//   supabase/migrations/20260624000030_baseball_staff_capabilities.sql
//   supabase/migrations/20260624000050_baseball_rls_helpers_and_policies.sql
//
// It resolves the current authenticated coach's capabilities for a given team
// using the SAME resolution order as has_baseball_staff_capability():
//
//   1. Primary coach (baseball_team_coach_staff.is_primary = true)  -> ALL caps
//   2. Team head coach (baseball_team_coach_staff.is_head_coach)    -> ALL caps
//   3. Suspended / removed / invited staff                         -> NO caps
//   4. Dedicated boolean capability column == true                 -> that cap
//   5. capabilities jsonb: object form { "<cap>": true }           -> that cap
//      OR array form [ "<cap>", ... ]                              -> that cap
//
// SECURITY: every export starts from supabase.auth.getUser(). Capability checks
// are enforced here on the server — never trust a client-supplied capability.
// RLS still backstops this layer; this is the in-process gate for server
// actions and server components.
//
// NOTE: these functions read through the request-scoped anon client (RLS on),
// so a coach can only ever read their own staff row for a team they belong to.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/types';

// -----------------------------------------------------------------------------
// Capability keys — V11 (26_final_auth_lifting_current_app_v11)
// -----------------------------------------------------------------------------
//
// The V11 spec (v11_auth_team_join_staff_roles.md "Capability Model") defines
// the authoritative capability column set on baseball_team_coach_staff. This
// module — NOT the Wave-1 type barrel — is the source of truth for the runtime
// capability key list so this packet can own corrections without editing the
// shared Wave-1 types file.
//
// V11 corrections applied here:
//   + ADDED   can_view_readiness     (readiness/soreness review — strength coach)
//   + ADDED   can_modify_availability (set availability/limitations)
//   + ADDED   can_manage_lineups     (build/publish lineups)
//   + ADDED   can_view_private_notes (read staff-only private notes)
//   + ADDED   can_export_reports     (export performance/team reports)
//   ~ RENAMED can_message_team -> can_message_players  (V11 label)
//   = KEPT    can_view_medical, can_manage_settings, can_manage_calendar for
//             back-compat (existing routes/UI depend on them; additive guardrail).
//
// LEGACY ALIASES: `can_message_team` is a deprecated alias of
// `can_message_players`. Resolution treats either column / jsonb key as the
// same capability so a DB row written under the old name still grants the new.

/**
 * The V11 server-enforced capability keys. Identical to the boolean columns on
 * baseball_team_coach_staff after the V11 additive migration. Importable as
 * `import { BaseballCapability } from '@/lib/baseball/capabilities'` without
 * reaching into the type barrel.
 */
export type BaseballCapability =
  | 'can_manage_roster'
  | 'can_manage_practice'
  | 'can_manage_lifting'
  | 'can_manage_lineups'
  | 'can_view_academics'
  | 'can_manage_imports'
  | 'can_manage_stats'
  | 'can_invite_staff'
  | 'can_manage_settings'
  | 'can_view_readiness'
  | 'can_modify_availability'
  | 'can_view_medical'
  | 'can_view_private_notes'
  | 'can_message_players'
  | 'can_export_reports'
  | 'can_manage_calendar'
  | 'can_manage_documents'
  | 'is_head_coach';

/**
 * Runtime list of the V11 capability keys (order matches the additive migration
 * + the V11 spec column list). 17 keys: 16 `can_*` flags + `is_head_coach`.
 */
export const BASEBALL_CAPABILITY_KEYS: readonly BaseballCapability[] = [
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
  'can_manage_documents',
  'is_head_coach',
] as const;

/**
 * Deprecated capability aliases. A capability written under the old DB column /
 * jsonb key still grants the renamed capability so legacy rows keep working
 * (additive, no destructive rename of existing data).
 *   can_message_team -> can_message_players
 */
const CAPABILITY_ALIASES: Partial<Record<BaseballCapability, readonly string[]>> = {
  can_message_players: ['can_message_team'],
};

/** A fully-resolved capability map: every key present, boolean value. */
export type BaseballCapabilityMap = Record<BaseballCapability, boolean>;

/**
 * The current coach's staff membership row for a team, narrowed to the fields
 * the resolver needs. Returned by getBaseballStaff().
 */
export interface BaseballStaffMembership {
  id: string;
  team_id: string;
  coach_id: string;
  role: string | null;
  is_primary: boolean;
  is_head_coach: boolean;
  /** Resolution-flag: primary coach OR head coach => holds every capability. */
  is_full_authority: boolean;
  /** Lifecycle status if the column exists; suspended/removed/invited = no caps. */
  status: string | null;
  /** The 11 dedicated boolean capability columns (excludes is_head_coach). */
  capability_columns: Record<string, boolean>;
  /** The extensibility jsonb bag (object or array form). */
  capabilities: Json;
}

/**
 * Error thrown by requireBaseballCapability when the current coach lacks the
 * requested capability. Mirrors the AuthorizationError pattern used by
 * src/lib/auth/ownership.ts so server actions can catch it uniformly.
 */
export class BaseballCapabilityError extends Error {
  constructor(
    public readonly capability: BaseballCapability,
    public readonly teamId: string,
    message?: string,
  ) {
    super(message ?? `Missing baseball capability: ${capability}`);
    this.name = 'BaseballCapabilityError';
  }
}

// The dedicated boolean capability columns (everything except the jsonb bag and
// is_head_coach, which is treated as full-authority above).
const BOOLEAN_CAPABILITY_COLUMNS: readonly BaseballCapability[] =
  BASEBALL_CAPABILITY_KEYS.filter((k) => k !== 'is_head_coach');

// Lifecycle states that revoke all capabilities (matches the SQL helper).
const REVOKED_STATUSES = new Set(['suspended', 'removed', 'invited']);

function asBool(value: unknown): boolean {
  return value === true;
}

// -----------------------------------------------------------------------------
// getBaseballStaff
// -----------------------------------------------------------------------------

/**
 * Read the current authenticated coach's baseball_team_coach_staff row for the
 * given team. Returns null when the user is not authenticated, has no coach
 * profile, or is not staff on the team. RLS guarantees a coach can only read
 * their own membership rows.
 *
 * Reads the full row (`*`) so optionally-present columns added by later
 * migrations (status, is_head_coach, the can_* flags, capabilities) are probed
 * tolerantly — exactly as the SQL helper does via to_jsonb(tcs.*).
 */
export async function getBaseballStaff(
  teamId: string,
): Promise<BaseballStaffMembership | null> {
  if (!teamId) return null;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Resolve the coach profile for this user.
  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!coach) return null;

  // Pull the full staff row so we can probe optionally-present columns.
  const { data: rowData } = await supabase
    .from('baseball_team_coach_staff')
    .select('*')
    .eq('team_id', teamId)
    .eq('coach_id', coach.id)
    .maybeSingle();
  if (!rowData) return null;

  const row = rowData as Record<string, unknown>;

  const isPrimary = asBool(row.is_primary);
  const isHeadCoach = asBool(row.is_head_coach);
  const status =
    typeof row.status === 'string' ? (row.status as string) : null;

  // Mirror the SQL is_baseball_team_staff lifecycle guard: suspended, removed,
  // and invited staff are treated as non-members at the application layer so
  // callers that hold a BaseballStaffMembership reference cannot accidentally
  // treat pending invites as confirmed members.  The SQL helper
  // is_baseball_team_staff() (migration 20260624000050) currently lacks this
  // status filter — any caller that relies on that SQL function for practice
  // table SELECT gates may still allow invited staff to read published practice
  // plans.  This guard closes the application-side gap while the SQL migration
  // fix is pending.
  if (status !== null && REVOKED_STATUSES.has(status)) {
    return null;
  }

  const capability_columns: Record<string, boolean> = {};
  for (const col of BOOLEAN_CAPABILITY_COLUMNS) {
    // A capability is held if its own column is true OR any deprecated-alias
    // column is true (e.g. legacy can_message_team grants can_message_players).
    let held = asBool(row[col]);
    if (!held) {
      const aliases = CAPABILITY_ALIASES[col];
      if (aliases) held = aliases.some((a) => asBool(row[a]));
    }
    capability_columns[col] = held;
  }

  return {
    id: String(row.id),
    team_id: String(row.team_id),
    coach_id: String(row.coach_id),
    role: typeof row.role === 'string' ? (row.role as string) : null,
    is_primary: isPrimary,
    is_head_coach: isHeadCoach,
    is_full_authority: isPrimary || isHeadCoach,
    status,
    capability_columns,
    capabilities: (row.capabilities ?? {}) as Json,
  };
}

// -----------------------------------------------------------------------------
// Resolution against an already-loaded membership (pure, no I/O)
// -----------------------------------------------------------------------------

function resolveFromMembership(
  staff: BaseballStaffMembership,
  cap: BaseballCapability,
): boolean {
  // Suspended/removed/invited staff hold no capabilities (matches SQL).
  if (staff.status && REVOKED_STATUSES.has(staff.status)) {
    return false;
  }

  // (1)/(2) primary coach or head coach -> full capability set.
  if (staff.is_full_authority) {
    return true;
  }

  // is_head_coach is itself full-authority; already covered above.
  if (cap === 'is_head_coach') {
    return staff.is_head_coach;
  }

  // (3) dedicated boolean capability column == true.
  if (staff.capability_columns[cap] === true) {
    return true;
  }

  // (4) capabilities jsonb: object form { "<cap>": true } OR array form.
  //     Deprecated-alias keys are honored too (legacy rows keep working).
  const aliasKeys = CAPABILITY_ALIASES[cap] ?? [];
  const bag = staff.capabilities;
  if (bag && typeof bag === 'object') {
    if (Array.isArray(bag)) {
      if (bag.includes(cap)) return true;
      if (aliasKeys.some((a) => bag.includes(a))) return true;
    } else {
      const record = bag as { [key: string]: Json | undefined };
      if (record[cap] === true) return true;
      if (aliasKeys.some((a) => record[a] === true)) return true;
    }
  }

  return false;
}

// -----------------------------------------------------------------------------
// hasBaseballCapability
// -----------------------------------------------------------------------------

/**
 * Returns whether the current authenticated coach holds `cap` on `teamId`.
 * Head coach / primary coach implicitly hold every capability. Non-staff,
 * unauthenticated, or suspended/removed/invited users hold none.
 *
 * Never throws — returns false on any miss. Use requireBaseballCapability when
 * you want to hard-fail a server action.
 */
export async function hasBaseballCapability(
  teamId: string,
  cap: BaseballCapability,
): Promise<boolean> {
  const staff = await getBaseballStaff(teamId);
  if (!staff) return false;
  return resolveFromMembership(staff, cap);
}

// -----------------------------------------------------------------------------
// requireBaseballCapability
// -----------------------------------------------------------------------------

/**
 * Server-side guard for capability-gated mutations. Throws
 * BaseballCapabilityError when the current coach lacks `cap` on `teamId`.
 * Returns the resolved staff membership on success so the caller can reuse it
 * without re-querying.
 */
export async function requireBaseballCapability(
  teamId: string,
  cap: BaseballCapability,
): Promise<BaseballStaffMembership> {
  const staff = await getBaseballStaff(teamId);
  if (!staff || !resolveFromMembership(staff, cap)) {
    throw new BaseballCapabilityError(cap, teamId);
  }
  return staff;
}

// -----------------------------------------------------------------------------
// resolveBaseballCapabilities
// -----------------------------------------------------------------------------

/**
 * Resolve the full capability map for the current authenticated coach on
 * `teamId`. Every one of the 12 keys is present. When the user is not staff
 * (or unauthenticated / suspended), every value is false. A single staff read
 * backs the whole map — no per-capability round trips.
 */
export async function resolveBaseballCapabilities(
  teamId: string,
): Promise<BaseballCapabilityMap> {
  const empty = (): BaseballCapabilityMap =>
    BASEBALL_CAPABILITY_KEYS.reduce((acc, key) => {
      acc[key] = false;
      return acc;
    }, {} as BaseballCapabilityMap);

  const staff = await getBaseballStaff(teamId);
  if (!staff) return empty();

  const map = empty();
  for (const key of BASEBALL_CAPABILITY_KEYS) {
    map[key] = resolveFromMembership(staff, key);
  }
  return map;
}
