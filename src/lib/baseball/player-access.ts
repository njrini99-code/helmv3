// =============================================================================
// src/lib/baseball/player-access.ts
//
// Wave 4 / packet: qa-screens (player-access enforcement remediation)
//
// SERVER-ENFORCED player/guardian access layer for BaseballHelm.
//
// PROBLEM THIS SOLVES
//   The Settings OS (baseball_program_settings) exposes a set of per-team
//   PLAYER-ACCESS toggles — players_can_edit_profile, players_can_upload_video,
//   players_can_view_team_stats, players_can_self_log_lift,
//   players_can_self_report_availability, public_profiles_enabled,
//   recruiting_exposure_enabled, guardian_access_enabled (+ the three guardian
//   child-view flags). Those toggles were WRITE-ONLY configuration: nothing
//   read them, so flipping one changed nothing a player experienced. That is the
//   "hiding a tab is the only security" failure the V11 permission acceptance
//   spec forbids ("every visible feature has server-side capability
//   enforcement", "player/guardian/scout views are safe").
//
//   This module makes the toggles LOAD-BEARING. It is the single server-side
//   gate the player-facing actions and routes call before performing a gated
//   behavior. It is the player/guardian mirror of capabilities.ts (which gates
//   STAFF capabilities): capabilities.ts answers "may this COACH do X?", this
//   module answers "does the team config permit a PLAYER/GUARDIAN to do X?".
//
// RESOLUTION ORDER (deny-by-config, fail-closed)
//   1. Read the team's baseball_program_settings row (RLS-scoped). Absent row =>
//      fall back to the program-type DEFAULT settings (same defaults the Settings
//      OS lazily seeds), so a team that never opened settings still gets the
//      intended default posture — NOT an accidental open door.
//   2. STAFF BYPASS: a coach acting on the team is never blocked by a player
//      toggle (a coach editing a player profile, uploading film for a player,
//      or reading team stats is governed by their staff capability, not by the
//      player self-service toggle). The bypass is resolved server-side via the
//      capabilities resolver; the client can never assert it.
//   3. Otherwise the toggle value governs. A false toggle DENIES the player
//      behavior server-side regardless of what the client renders.
//
// SECURITY
//   - Every check starts from the request-scoped RLS client + getActiveBaseball
//     Context (cookie re-validated against real membership). The client never
//     supplies the toggle value or the staff-bypass flag.
//   - requirePlayerAccess throws a typed PlayerAccessError (HTTP 403) that
//     withBaseballAction maps to a sanitized, user-safe message — no raw config
//     or DB detail leaks.
//   - This is the IN-PROCESS gate for server actions / server components. RLS
//     still backstops row ownership; this layer enforces the team POLICY that
//     RLS alone does not encode.
//
// This module is additive and baseball-scoped. It reads the existing
// baseball_program_settings table (no new table) and reuses the existing
// program-type defaults + capabilities resolver.
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import { getDefaultProgramSettings } from '@/lib/baseball/program-type-variants';
import type { BaseballProgramType } from '@/lib/types/baseball-settings';
import {
  ALL_PLAYER_ACCESS_KEYS,
  ACCESS_DENIED_MESSAGE,
  STAFF_BYPASSABLE_KEYS,
  decidePlayerAccess,
  type PlayerAccessKey,
} from '@/lib/baseball/player-access-policy';

// Re-export the pure policy surface so existing imports of these symbols from
// this server module keep working (single import site for callers).
export {
  ACCESS_KEY_TO_COLUMN,
  decidePlayerAccess,
  playerAccessColumn,
  isStaffBypassableAccessKey,
} from '@/lib/baseball/player-access-policy';
export type { PlayerAccessKey } from '@/lib/baseball/player-access-policy';

// -----------------------------------------------------------------------------
// Error type
// -----------------------------------------------------------------------------

/**
 * Thrown by requirePlayerAccess when the team config denies a player/guardian
 * behavior. Carries HTTP-403 so route handlers / boundaries can map it, and the
 * offending key so callers can branch. withBaseballAction logs it as a handled
 * warning (not a Sentry error) and re-raises so the action surfaces the message.
 */
export class PlayerAccessError extends Error {
  readonly status = 403;
  constructor(
    public readonly key: PlayerAccessKey,
    public readonly teamId: string,
    message?: string,
  ) {
    super(message ?? ACCESS_DENIED_MESSAGE[key]);
    this.name = 'PlayerAccessError';
  }
}

// -----------------------------------------------------------------------------
// Settings read (with default fallback)
// -----------------------------------------------------------------------------

/** Read the relevant toggle columns for a team, falling back to type defaults. */
async function readAccessRow(teamId: string): Promise<Record<string, boolean>> {
  const supabase = await createClient();

  const { data: settings } = await fromUntyped(supabase, 'baseball_program_settings')
    .select(
      'players_can_edit_profile, players_can_edit_public_profile, players_can_upload_video, ' +
        'players_can_view_team_stats, players_can_self_log_lift, ' +
        'players_can_self_report_availability, public_profiles_enabled, ' +
        'recruiting_exposure_enabled, guardian_access_enabled, ' +
        'guardian_can_view_schedule, guardian_can_view_announcements, guardian_can_view_travel',
    )
    .eq('team_id', teamId)
    .maybeSingle();

  if (settings) {
    return settings as Record<string, boolean>;
  }

  // No settings row yet — use the program-type defaults so an un-configured team
  // still gets its intended posture (NOT an accidental open door). Resolve the
  // program type for accurate defaults.
  const { data: teamRow } = await fromUntyped(supabase, 'baseball_teams')
    .select('program_type')
    .eq('id', teamId)
    .maybeSingle();
  const programType = (((teamRow as Record<string, unknown> | null)?.program_type as string) ??
    'college') as BaseballProgramType;
  return getDefaultProgramSettings(programType) as unknown as Record<string, boolean>;
}

// -----------------------------------------------------------------------------
// hasPlayerAccess / requirePlayerAccess / resolvePlayerAccess
// -----------------------------------------------------------------------------

/**
 * Whether the team config permits `key`. When `allowStaffBypass` is true (the
 * default for self-service keys), a coach on the team is granted regardless of
 * the toggle (their staff capability governs them, not the player switch).
 *
 * Never throws — returns false on any miss / config-deny. Use requirePlayerAccess
 * to hard-fail a server action.
 */
export async function hasPlayerAccess(
  teamId: string,
  key: PlayerAccessKey,
  opts: { allowStaffBypass?: boolean } = {},
): Promise<boolean> {
  if (!teamId) return false;

  const allowStaffBypass = opts.allowStaffBypass ?? STAFF_BYPASSABLE_KEYS.has(key);

  let isStaff = false;
  if (allowStaffBypass) {
    // A coach with ANY staff capability on the team acts on the team's behalf.
    const caps = await resolveBaseballCapabilities(teamId);
    isStaff = Object.values(caps).some(Boolean);
    if (isStaff) return true; // short-circuit: no need to read settings.
  }

  const row = await readAccessRow(teamId);
  return decidePlayerAccess(row, key, { isStaff, allowStaffBypass });
}

/**
 * Server-side guard for a player/guardian-gated behavior. Throws
 * PlayerAccessError when the team config denies `key`. Returns silently on
 * success.
 */
export async function requirePlayerAccess(
  teamId: string,
  key: PlayerAccessKey,
  opts: { allowStaffBypass?: boolean } = {},
): Promise<void> {
  const ok = await hasPlayerAccess(teamId, key, opts);
  if (!ok) {
    throw new PlayerAccessError(key, teamId);
  }
}

/** A fully-resolved player-access map: every key present, boolean value. */
export type PlayerAccessMap = Record<PlayerAccessKey, boolean>;

const ALL_ACCESS_KEYS = ALL_PLAYER_ACCESS_KEYS;

/**
 * Resolve the full player-access map for a team from a SINGLE settings read.
 * Use this in server components / read paths to decide which player-facing
 * affordances to RENDER (the UI mirror), while the server actions independently
 * ENFORCE via requirePlayerAccess (defense in depth — the render gate is a UX
 * convenience, the action gate is the security boundary).
 *
 * `viewerIsPlayer` toggles whether self-service keys honor the staff bypass:
 * when resolving for a player you want the literal toggle values; when resolving
 * for a coach you want staff-bypass applied. Pass `viewerIsPlayer: true` to get
 * the raw toggle posture regardless of viewer.
 */
export async function resolvePlayerAccess(
  teamId: string,
  opts: { viewerIsPlayer?: boolean } = {},
): Promise<PlayerAccessMap> {
  const empty = (): PlayerAccessMap =>
    ALL_ACCESS_KEYS.reduce((acc, k) => {
      acc[k] = false;
      return acc;
    }, {} as PlayerAccessMap);

  if (!teamId) return empty();

  const row = await readAccessRow(teamId);

  // Staff bypass only matters for self-service keys and only when the viewer is
  // NOT a player. Resolve staff status once.
  let isStaff = false;
  if (!opts.viewerIsPlayer) {
    const caps = await resolveBaseballCapabilities(teamId);
    isStaff = Object.values(caps).some(Boolean);
  }

  const map = empty();
  for (const key of ALL_ACCESS_KEYS) {
    map[key] = decidePlayerAccess(row, key, { isStaff });
  }
  return map;
}
