import { describe, it, expect } from 'vitest';
import { assertAreaFullyWrapped } from '@/lib/admin/__tests__/coverage-contract.shared';

/**
 * W15 Batch 4 (comms) — coverage-contract gate.
 *
 * Features: messaging, announcements.
 * Files fully wrapped this batch: message-attachments.ts (messaging),
 * announcements.ts + communication.ts (announcements).
 *
 * golf.ts spans FIVE batches (B1/B2/B4/B5/B6 — plan
 * docs/superpowers/plans/helm-bridge/waves/w15-total-coverage.md "Batch
 * notes"). This contract asserts B1's 13 + B2's 18 exports (already wrapped,
 * untouched) PLUS B4's 1 export (`createAnnouncement`) and excludes the
 * remaining 7 golf.ts exports (roster_management/B5, course_library/B6)
 * until their owning batch lands.
 *
 * src/app/actions/messages.ts is a SHARED (non-golf-actions-dir) 'use
 * server' file with 21 total exports: the generic sport-branching exports
 * (`sendMessage`, `createConversation`, `markMessagesAsRead`,
 * `updateMessage`, `deleteMessage`) and every `*Baseball*` export are
 * Baseball-hold/generic and stay UNTOUCHED — excluded here per the plan
 * ("the generic + Baseball exports in that file stay UNTOUCHED and must be
 * listed in the contract test's exclude for messages.ts"). Only the 10
 * golf-named exports are asserted wrapped this batch (feature: messaging).
 *
 * RED before the Batch 4 retrofit (23 unwrapped exports); GREEN after.
 */
const GOLF_TS_NOT_YET_WRAPPED_EXPORTS = [
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

const MESSAGES_TS_GENERIC_AND_BASEBALL_EXPORTS = [
  // Generic sport-branching exports (not golf-named; NOT wrapped)
  'sendMessage',
  'createConversation',
  'markMessagesAsRead',
  'updateMessage',
  'deleteMessage',
  // Baseball exports (Baseball hold; NEVER wrapped)
  'sendBaseballMessage',
  'createBaseballConversation',
  'markBaseballMessagesAsRead',
  'updateBaseballMessage',
  'deleteBaseballMessage',
];

describe('coverage-contract — B4 comms (messaging, announcements)', () => {
  it('every B4 export is wrapped with withAdminObserved({ feature: <its registry key> })', () => {
    expect(() =>
      assertAreaFullyWrapped(
        [
          'src/app/golf/actions/message-attachments.ts',
          'src/app/golf/actions/announcements.ts',
          'src/app/golf/actions/communication.ts',
          'src/app/golf/actions/golf.ts',
          'src/app/actions/messages.ts',
        ],
        {
          exclude: {
            'src/app/golf/actions/golf.ts': GOLF_TS_NOT_YET_WRAPPED_EXPORTS,
            'src/app/actions/messages.ts': MESSAGES_TS_GENERIC_AND_BASEBALL_EXPORTS,
          },
        },
      ),
    ).not.toThrow();
  });
});
