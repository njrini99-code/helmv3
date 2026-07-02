import { describe, it, expect } from 'vitest';
import { assertAreaFullyWrapped } from '@/lib/admin/__tests__/coverage-contract.shared';

/**
 * W15 Batch 2 (calendar + academics + notifications) — coverage-contract gate.
 *
 * Features: calendar_events, academics_classes, notifications.
 * Files fully wrapped this batch: attendance.ts, calendar-feeds.ts,
 * calendar-sync.ts, recurring-events.ts (all 6 exports — 4 calendar_events +
 * 2 academics_classes, both owned by B2), event-documents.ts,
 * coach-notifications.ts, player-notifications.ts, push-notifications.ts.
 *
 * golf.ts spans FIVE batches (B1/B2/B4/B5/B6 — plan
 * docs/superpowers/plans/helm-bridge/waves/w15-total-coverage.md "Batch
 * notes"). This contract asserts B1's 13 exports (already wrapped, untouched)
 * PLUS B2's 18 exports (calendar_events + notifications) and excludes the
 * remaining 8 golf.ts exports (announcements/B4, roster_management/B5,
 * course_library/B6) until their owning batch lands. Task 16 flips on the
 * repo-wide tripwire that locks the whole file.
 *
 * RED before the Batch 2 retrofit (lists every unwrapped B2 export); GREEN
 * after.
 */
const GOLF_TS_NOT_YET_WRAPPED_EXPORTS = [
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

describe('coverage-contract — B2 calendar + academics + notifications (calendar_events, academics_classes, notifications)', () => {
  it('every B2 export is wrapped with withAdminObserved({ feature: <its registry key> })', () => {
    expect(() =>
      assertAreaFullyWrapped(
        [
          'src/app/golf/actions/attendance.ts',
          'src/app/golf/actions/calendar-feeds.ts',
          'src/app/golf/actions/calendar-sync.ts',
          'src/app/golf/actions/recurring-events.ts',
          'src/app/golf/actions/event-documents.ts',
          'src/app/golf/actions/coach-notifications.ts',
          'src/app/golf/actions/player-notifications.ts',
          'src/app/golf/actions/push-notifications.ts',
          'src/app/golf/actions/golf.ts',
        ],
        { exclude: { 'src/app/golf/actions/golf.ts': GOLF_TS_NOT_YET_WRAPPED_EXPORTS } },
      ),
    ).not.toThrow();
  });
});
