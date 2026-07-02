import { describe, it, expect } from 'vitest';
import { assertAreaFullyWrapped } from '@/lib/admin/__tests__/coverage-contract.shared';

/**
 * W15 Batch 6 (library + recruiting + player surfaces) — coverage-contract gate.
 *
 * Features: course_library, recruiting_prospect_tracking, player_hub,
 * coach_dashboard, my_game_profile, whats_new.
 * Files fully wrapped this batch: course-library.ts, courses.ts,
 * recruiting.ts, recruit-documents.ts, dashboard-data.ts,
 * command-palette.ts, player-profile-stats.ts, whats-new.ts.
 *
 * golf.ts spans SIX batches (B0/B1/B2/B4/B5/B6 — plan
 * docs/superpowers/plans/helm-bridge/waves/w15-total-coverage.md "Batch
 * notes"). B6 owns the last 4 unwrapped golf.ts exports
 * (getPlayerSavedCourses, savePlayerCourse, touchSavedCourse,
 * getRecentCoursesForPlayer → course_library), so after this batch lands
 * golf.ts's full 39-export surface is wrapped — no exclude list needed here
 * (Task 16 flips on the repo-wide tripwire that locks the whole file).
 *
 * RED before the Batch 6 retrofit (51 unwrapped exports); GREEN after.
 */
describe('coverage-contract — B6 library + recruiting + player surfaces (course_library, recruiting_prospect_tracking, player_hub, coach_dashboard, my_game_profile, whats_new)', () => {
  it('every B6 export is wrapped with withAdminObserved({ feature: <its registry key> })', () => {
    expect(() =>
      assertAreaFullyWrapped([
        'src/app/golf/actions/course-library.ts',
        'src/app/golf/actions/courses.ts',
        'src/app/golf/actions/golf.ts',
        'src/app/golf/actions/recruiting.ts',
        'src/app/golf/actions/recruit-documents.ts',
        'src/app/golf/actions/dashboard-data.ts',
        'src/app/golf/actions/command-palette.ts',
        'src/app/golf/actions/player-profile-stats.ts',
        'src/app/golf/actions/whats-new.ts',
      ]),
    ).not.toThrow();
  });
});
