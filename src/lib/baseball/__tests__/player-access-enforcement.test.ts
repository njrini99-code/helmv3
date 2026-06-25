// =============================================================================
// Regression test for the "player-access toggles have ZERO behavioral
// enforcement" critical finding (completeness audit).
//
// THE BUG: the Settings-OS player-access toggles (players_can_edit_profile,
// players_can_upload_video, players_can_view_team_stats, players_can_self_log_
// lift, players_can_self_report_availability, public_profiles_enabled,
// recruiting_exposure_enabled, guardian_access_enabled + child views) were
// write-only configuration. Nothing read them, so flipping a toggle changed
// nothing a player experienced ("hiding a tab is the only security"). The V11
// permission acceptance spec requires every visible feature to have server-side
// enforcement and player/guardian views to be safe.
//
// THE FIX: src/lib/baseball/player-access.ts makes the toggles load-bearing via
// a pure decision (decidePlayerAccess) wrapped by requirePlayerAccess, wired
// into the player-facing server actions through
// withBaseballAction({ requiredPlayerAccess }).
//
// These tests lock the toggle->behavior contract at the pure decision boundary
// (the same style as nav-capability-gating.test.ts), so each toggle provably
// changes the gated outcome and the staff-bypass policy is exact.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  decidePlayerAccess,
  isStaffBypassableAccessKey,
  playerAccessColumn,
  type PlayerAccessKey,
} from '../player-access-policy';

// All player-access keys and the settings column each one reads.
const KEY_TO_COLUMN: Record<PlayerAccessKey, string> = {
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

const ALL_KEYS = Object.keys(KEY_TO_COLUMN) as PlayerAccessKey[];

/** Self-service affordances a coach should bypass. */
const STAFF_BYPASSABLE: PlayerAccessKey[] = [
  'can_edit_profile',
  'can_edit_public_profile',
  'can_upload_video',
  'can_view_team_stats',
  'can_self_log_lift',
  'can_self_report_availability',
];

/** Surface/identity gates a coach should NOT bypass (external surfaces). */
const NON_BYPASSABLE: PlayerAccessKey[] = [
  'public_profiles_enabled',
  'recruiting_exposure_enabled',
  'guardian_access_enabled',
  'guardian_can_view_schedule',
  'guardian_can_view_announcements',
  'guardian_can_view_travel',
];

function rowWith(key: PlayerAccessKey, value: boolean): Record<string, boolean> {
  return { [KEY_TO_COLUMN[key]]: value };
}

describe('player-access enforcement: key->column mapping is exact', () => {
  it('maps every key to its settings column', () => {
    for (const key of ALL_KEYS) {
      expect(playerAccessColumn(key)).toBe(KEY_TO_COLUMN[key]);
    }
  });
});

describe('player-access enforcement: each toggle changes the gated outcome (player viewer)', () => {
  // This is the core anti-regression: for EVERY toggle, ON => allowed,
  // OFF => denied, for a non-staff player. If any key stopped being read, its
  // OFF case would wrongly return true and this fails.
  it.each(ALL_KEYS)('toggle %s: ON allows, OFF denies (player)', (key) => {
    const allowed = decidePlayerAccess(rowWith(key, true), key, { isStaff: false });
    const denied = decidePlayerAccess(rowWith(key, false), key, { isStaff: false });
    expect(allowed).toBe(true);
    expect(denied).toBe(false);
  });

  it('a missing column is treated as DENY (fail-closed)', () => {
    for (const key of ALL_KEYS) {
      expect(decidePlayerAccess({}, key, { isStaff: false })).toBe(false);
    }
  });

  it('an undefined/null column value is treated as DENY (fail-closed)', () => {
    for (const key of ALL_KEYS) {
      expect(decidePlayerAccess({ [KEY_TO_COLUMN[key]]: undefined }, key, { isStaff: false })).toBe(
        false,
      );
      expect(decidePlayerAccess({ [KEY_TO_COLUMN[key]]: null }, key, { isStaff: false })).toBe(
        false,
      );
    }
  });
});

describe('player-access enforcement: staff bypass policy is exact', () => {
  it('self-service keys are staff-bypassable: a coach is allowed even with the toggle OFF', () => {
    for (const key of STAFF_BYPASSABLE) {
      expect(isStaffBypassableAccessKey(key)).toBe(true);
      // toggle OFF, but viewer is staff => allowed (coach acts for the program).
      expect(decidePlayerAccess(rowWith(key, false), key, { isStaff: true })).toBe(true);
    }
  });

  it('surface/identity gates are NOT staff-bypassable: staff cannot force a disabled surface on', () => {
    for (const key of NON_BYPASSABLE) {
      expect(isStaffBypassableAccessKey(key)).toBe(false);
      // toggle OFF and even a staff viewer => still denied (public/guardian/
      // exposure surfaces describe an external surface, not a coach affordance).
      expect(decidePlayerAccess(rowWith(key, false), key, { isStaff: true })).toBe(false);
      // toggle ON => allowed regardless of viewer.
      expect(decidePlayerAccess(rowWith(key, true), key, { isStaff: true })).toBe(true);
    }
  });

  it('allowStaffBypass override forces literal-toggle evaluation for self-service keys', () => {
    // Even a staff viewer is held to the literal toggle when bypass is disabled
    // (used to compute the raw player-facing posture for rendering).
    expect(
      decidePlayerAccess(rowWith('can_edit_profile', false), 'can_edit_profile', {
        isStaff: true,
        allowStaffBypass: false,
      }),
    ).toBe(false);
  });
});
