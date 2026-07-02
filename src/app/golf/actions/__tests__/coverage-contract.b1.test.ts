import { describe, it, expect } from 'vitest';
import { assertAreaFullyWrapped } from '@/lib/admin/__tests__/coverage-contract.shared';

/**
 * W15 Batch 1 (core play) — coverage-contract gate.
 *
 * Features: round_tracking, stats_analytics, qualifiers, my_qualifiers.
 * Files fully wrapped this batch: round-drafts.ts, stats.ts, stats-data.ts,
 * stats-intelligence.ts, stats-leak-maps.ts, shot-analytics.ts,
 * team-sg-baseline.ts, v3/qualifying.ts.
 *
 * golf.ts spans FIVE batches (B1/B2/B4/B5/B6 — plan
 * docs/superpowers/plans/helm-bridge/waves/w15-total-coverage.md "Batch
 * notes"), so this contract asserts ONLY B1's 13 golf.ts exports
 * (round_tracking/qualifiers/my_qualifiers, incl. the pre-existing
 * savePartialRound exemplar) and excludes every other golf.ts export until
 * its owning batch lands. Task 16 flips on the repo-wide tripwire that locks
 * the whole file.
 *
 * RED before the Batch 1 retrofit (lists every unwrapped B1 export); GREEN
 * after.
 */
const GOLF_TS_NON_B1_EXPORTS = [
  // calendar_events (B2)
  'createGolfEvent',
  'updateGolfEvent',
  'deleteGolfEvent',
  'deleteGolfEventPermanently',
  'respondToEvent',
  'sendEventReminderToPlayers',
  'checkScheduleConflicts',
  'getPlayerAvailability',
  'getCurrentUserBusyPeriods',
  'getPlayerEventRSVP',
  'getEventRSVP',
  'addCoachBlockedTime',
  'deleteCoachBlockedTime',
  'updateCoachBlockedTime',
  'getCoachBlockedTime',
  // notifications (B2)
  'getNotifications',
  'markNotificationRead',
  'markAllNotificationsRead',
  // announcements (B4)
  'createAnnouncement',
  // roster_management (B5)
  'invitePlayerToTeam',
  'updatePlayerStatus',
  'getPendingInvitations',
  // course_library (B6)
  'getPlayerSavedCourses',
  'savePlayerCourse',
  'touchSavedCourse',
  'getRecentCoursesForPlayer',
];

describe('coverage-contract — B1 core play (round_tracking, stats_analytics, qualifiers, my_qualifiers)', () => {
  it('every B1 export is wrapped with withAdminObserved({ feature: <its registry key> })', () => {
    expect(() =>
      assertAreaFullyWrapped(
        [
          'src/app/golf/actions/round-drafts.ts',
          'src/app/golf/actions/stats.ts',
          'src/app/golf/actions/stats-data.ts',
          'src/app/golf/actions/stats-intelligence.ts',
          'src/app/golf/actions/stats-leak-maps.ts',
          'src/app/golf/actions/shot-analytics.ts',
          'src/app/golf/actions/team-sg-baseline.ts',
          'src/app/golf/actions/v3/qualifying.ts',
          'src/app/golf/actions/golf.ts',
        ],
        { exclude: { 'src/app/golf/actions/golf.ts': GOLF_TS_NON_B1_EXPORTS } },
      ),
    ).not.toThrow();
  });
});
