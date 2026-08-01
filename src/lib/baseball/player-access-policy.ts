// =============================================================================
// src/lib/baseball/player-access-policy.ts
//
// Wave 4 / packet: qa-screens (player-access enforcement remediation)
//
// PURE (no I/O, no server-only) player-access policy. This is the isomorphic
// decision boundary that player-access.ts (the server-side I/O wrapper) builds
// on, and the one the unit tests exercise — so the toggle->behavior contract is
// verified deterministically without a DB and without pulling `server-only`.
//
// It mirrors the split in capabilities.ts (pure resolveFromMembership vs the
// I/O getBaseballStaff): keep the decision pure so it's testable, keep the
// reads in the server module.
// =============================================================================

/**
 * The team-config toggles that gate a PLAYER or GUARDIAN behavior. Each maps 1:1
 * to a boolean column on baseball_program_settings. These are the keys the V11
 * permission acceptance spec requires to be load-bearing.
 */
export type PlayerAccessKey =
  | 'can_edit_profile'
  | 'can_edit_public_profile'
  | 'can_upload_video'
  | 'can_view_team_stats'
  | 'can_self_log_lift'
  | 'can_self_report_availability'
  | 'public_profiles_enabled'
  | 'recruiting_exposure_enabled'
  | 'guardian_access_enabled'
  | 'guardian_can_view_schedule'
  | 'guardian_can_view_announcements'
  | 'guardian_can_view_travel';

/** The settings column each access key reads. */
export const ACCESS_KEY_TO_COLUMN: Record<PlayerAccessKey, string> = {
  can_edit_profile: 'players_can_edit_profile',
  can_edit_public_profile: 'players_can_edit_public_profile',
  can_upload_video: 'players_can_upload_video',
  can_view_team_stats: 'players_can_view_team_stats',
  can_self_log_lift: 'players_can_self_log_lift',
  can_self_report_availability: 'players_can_self_report_availability',
  public_profiles_enabled: 'public_profiles_enabled',
  recruiting_exposure_enabled: 'recruiting_exposure_enabled',
  guardian_access_enabled: 'guardian_access_enabled',
  guardian_can_view_schedule: 'guardian_can_view_schedule',
  guardian_can_view_announcements: 'guardian_can_view_announcements',
  guardian_can_view_travel: 'guardian_can_view_travel',
};

/**
 * Keys where a coach acting on the team should bypass the player toggle (a coach
 * editing/uploading/reading on behalf of the program is governed by their staff
 * capability, not the player self-service switch). Route/identity gates that are
 * about WHO MAY BE SHOWN (public profile, guardian, exposure) are NOT staff-
 * bypassable — those describe an external surface, not a coach affordance.
 */
export const STAFF_BYPASSABLE_KEYS: ReadonlySet<PlayerAccessKey> = new Set<PlayerAccessKey>([
  'can_edit_profile',
  'can_edit_public_profile',
  'can_upload_video',
  'can_view_team_stats',
  'can_self_log_lift',
  'can_self_report_availability',
]);

/** Default user-safe denial messages per key (carry no internals). */
export const ACCESS_DENIED_MESSAGE: Record<PlayerAccessKey, string> = {
  can_edit_profile: 'Your coaching staff has turned off player profile editing for this team.',
  can_edit_public_profile:
    'Your coaching staff manages your public recruiting profile for this team.',
  can_upload_video: 'Your coaching staff has turned off player video uploads for this team.',
  can_view_team_stats: 'Team stats are not shared with players on this team.',
  can_self_log_lift: 'Self-logging lifts is turned off for this team.',
  can_self_report_availability: 'Self-reporting availability is turned off for this team.',
  public_profiles_enabled: 'Public profiles are not enabled for this team.',
  recruiting_exposure_enabled: 'Recruiting exposure is not enabled for this team.',
  guardian_access_enabled: 'Guardian access is not enabled for this team.',
  guardian_can_view_schedule: 'Schedule sharing with guardians is turned off for this team.',
  guardian_can_view_announcements:
    'Announcement sharing with guardians is turned off for this team.',
  guardian_can_view_travel: 'Travel sharing with guardians is turned off for this team.',
};

/**
 * Pure access decision. Given the team's toggle row, the access key, and whether
 * the viewer is staff-on-the-team, decide whether the behavior is permitted.
 *
 *   - Staff on the team bypass STAFF_BYPASSABLE_KEYS (self-service affordances).
 *   - Otherwise the literal toggle column governs (deny-by-config when false).
 *
 * Fail-closed: a missing / undefined / null column reads as DENY.
 */
export function decidePlayerAccess(
  toggleRow: Record<string, boolean | null | undefined>,
  key: PlayerAccessKey,
  opts: { isStaff?: boolean; allowStaffBypass?: boolean } = {},
): boolean {
  const allowStaffBypass = opts.allowStaffBypass ?? STAFF_BYPASSABLE_KEYS.has(key);
  if (allowStaffBypass && opts.isStaff) return true;
  return toggleRow[ACCESS_KEY_TO_COLUMN[key]] === true;
}

/** The settings column an access key reads. */
export function playerAccessColumn(key: PlayerAccessKey): string {
  return ACCESS_KEY_TO_COLUMN[key];
}

/** Whether a key is staff-bypassable (self-service affordance vs surface gate). */
export function isStaffBypassableAccessKey(key: PlayerAccessKey): boolean {
  return STAFF_BYPASSABLE_KEYS.has(key);
}
