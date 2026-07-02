import { describe, it, expect } from 'vitest';
import { assertAreaFullyWrapped } from '@/lib/admin/__tests__/coverage-contract.shared';

/**
 * W15 Batch 5 (membership + auth + settings) — coverage-contract gate.
 *
 * Features: roster_management, team_info, join_team_flow, auth_onboarding,
 * settings.
 * Files fully wrapped this batch: roster.ts (roster_management),
 * team-switcher.ts (team_info), teams.ts (team_info + join_team_flow split),
 * auth.ts + onboarding.ts + access-code.ts + demo-access.ts +
 * demo-tracking.ts (auth_onboarding), v3/notification-prefs.ts (settings).
 *
 * golf.ts spans SIX batches (B0/B1/B2/B4/B5/B6 — plan
 * docs/superpowers/plans/helm-bridge/waves/w15-total-coverage.md "Batch
 * notes"). This contract asserts B0's exports + B1's 13 + B2's 18
 * (already wrapped, untouched) PLUS B5's 3 roster overrides
 * (invitePlayerToTeam, updatePlayerStatus, getPendingInvitations) and
 * excludes the remaining 4 golf.ts exports (course_library/B6) until their
 * owning batch lands.
 *
 * demo-access.ts:enterDemo uses redirect() — confirmed safe to wrap
 * (isNextControlFlowError, observed-action.ts:10-15 skips logging but still
 * rethrows the NEXT_REDIRECT digest).
 *
 * RED before the Batch 5 retrofit (35 unwrapped exports); GREEN after.
 */
const GOLF_TS_NOT_YET_WRAPPED_EXPORTS = [
  // course_library (B6)
  'getPlayerSavedCourses',
  'savePlayerCourse',
  'touchSavedCourse',
  'getRecentCoursesForPlayer',
];

describe('coverage-contract — B5 membership + auth + settings (roster_management, team_info, join_team_flow, auth_onboarding, settings)', () => {
  it('every B5 export is wrapped with withAdminObserved({ feature: <its registry key> })', () => {
    expect(() =>
      assertAreaFullyWrapped(
        [
          'src/app/golf/actions/roster.ts',
          'src/app/golf/actions/teams.ts',
          'src/app/golf/actions/team-switcher.ts',
          'src/app/golf/actions/auth.ts',
          'src/app/golf/actions/onboarding.ts',
          'src/app/golf/actions/access-code.ts',
          'src/app/golf/actions/demo-access.ts',
          'src/app/golf/actions/demo-tracking.ts',
          'src/app/golf/actions/v3/notification-prefs.ts',
          'src/app/golf/actions/golf.ts',
        ],
        {
          exclude: {
            'src/app/golf/actions/golf.ts': GOLF_TS_NOT_YET_WRAPPED_EXPORTS,
          },
        },
      ),
    ).not.toThrow();
  });
});
