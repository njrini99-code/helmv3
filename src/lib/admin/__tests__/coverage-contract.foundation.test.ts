import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { scanActionFile } from './coverage-scanner';
import { assertAreaFullyWrapped } from './coverage-contract.shared';

describe('coverage-scanner', () => {
  it('parses golf.ts and finds savePartialRound wrapped with feature round_tracking', () => {
    const scanned = scanActionFile(join(process.cwd(), 'src/app/golf/actions/golf.ts'));
    expect(scanned.exports).toContain('savePartialRound');
    expect(scanned.exports).toContain('invitePlayerToTeam');
    expect(scanned.wrapped.get('savePartialRound')).toEqual({ feature: 'round_tracking' });
    // invitePlayerToTeam is now wrapped (roster_management, W15 Batch 5) —
    // proves the scanner distinguishes wrapped from unwrapped exports within
    // the same file. golf.ts's LAST 4 exports (getPlayerSavedCourses et al.)
    // landed in Batch 6, so as of B6 the whole file is fully wrapped.
    expect(scanned.wrapped.get('invitePlayerToTeam')).toEqual({ feature: 'roster_management' });
    expect(scanned.wrapped.get('getPlayerSavedCourses')).toEqual({ feature: 'course_library' });
  });

  it('exports list matches a fresh regex scan (sanity: scanner is not hard-coded)', () => {
    // alerts.ts is untouched until W15 Batch 7 (alerts_system) — a stable
    // fully-unwrapped fixture for this scanner sanity check (course-library.ts
    // moved to fully wrapped in Batch 6, so it no longer fits this assertion —
    // same handoff roster.ts → course-library.ts did after Batch 5).
    const scanned = scanActionFile(join(process.cwd(), 'src/app/golf/actions/alerts.ts'));
    expect(scanned.exports.sort()).toEqual(
      ['getAlertCounts', 'generateAlerts'].sort(),
    );
    expect(scanned.wrapped.size).toBe(0);
  });
});

describe('assertAreaFullyWrapped — self-test (proves the harness detects gaps)', () => {
  it('does NOT throw for golf.ts — fully wrapped as of Batch 6', () => {
    // Batch 1 (round_tracking/qualifiers/my_qualifiers, 13 exports incl. the
    // pre-existing savePartialRound exemplar) + Batch 2 (calendar_events/
    // notifications, 18 exports) + Batch 4 (createAnnouncement) + Batch 5
    // (roster_management: invitePlayerToTeam, updatePlayerStatus,
    // getPendingInvitations) + Batch 6 (course_library: getPlayerSavedCourses,
    // savePlayerCourse, touchSavedCourse, getRecentCoursesForPlayer) cover all
    // 39 golf.ts exports — no exclusions needed anymore.
    expect(() =>
      assertAreaFullyWrapped(['src/app/golf/actions/golf.ts']),
    ).not.toThrow();
  });

  it('THROWS listing every unwrapped export in alerts.ts (still bare — W15 Batch 7)', () => {
    // alerts.ts is untouched until Batch 7; course-library.ts (the fixture
    // here through Batch 5) moved to fully wrapped in Batch 6, so it no
    // longer proves gap-detection — alerts.ts takes over that role (same
    // handoff roster.ts → course-library.ts did after Batch 5).
    let thrown: Error | null = null;
    try {
      assertAreaFullyWrapped(['src/app/golf/actions/alerts.ts']);
    } catch (err) {
      thrown = err instanceof Error ? err : new Error(String(err));
    }
    expect(thrown).not.toBeNull();
    const message = thrown?.message ?? '';
    expect(message).toContain('getAlertCounts');
    expect(message).toContain('generateAlerts');
    expect(message).toContain('2 coverage gap(s)');
  });

  it('throws when an export is not wrapped', () => {
    // alerts.ts is entirely unwrapped (Batch 7 scope) — asserting it proves
    // the harness surfaces a gap rather than a false pass.
    expect(() =>
      assertAreaFullyWrapped(['src/app/golf/actions/alerts.ts']),
    ).toThrow(/NOT wrapped with withAdminObserved/);
  });
});

// Flipped on in W15 Task 16 (out of scope for this Foundation PR): every
// non-CRM 'use server' action file under src/app/golf/actions/** (minus the
// spec §1.3 exclusion manifest) + the 10 golf exports of
// src/app/actions/messages.ts + src/app/admin/actions/triage.ts is fully
// wrapped with a valid FeatureKey.
describe('global tripwire', () => {
  it.todo('every non-CRM golf action export is wrapped with a valid FeatureKey (W15 Task 16)');
});
