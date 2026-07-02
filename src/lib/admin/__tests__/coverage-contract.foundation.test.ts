import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { scanActionFile } from './coverage-scanner';
import { assertAreaFullyWrapped } from './coverage-contract.shared';

describe('coverage-scanner', () => {
  it('parses golf.ts and finds savePartialRound wrapped with feature round_tracking', () => {
    const scanned = scanActionFile(join(process.cwd(), 'src/app/golf/actions/golf.ts'));
    expect(scanned.exports).toContain('savePartialRound');
    expect(scanned.exports).toContain('createAnnouncement');
    expect(scanned.wrapped.get('savePartialRound')).toEqual({ feature: 'round_tracking' });
    // createAnnouncement is now wrapped (announcements, W15 Batch 4) —
    // proves the scanner distinguishes wrapped from unwrapped exports within
    // the same partially-wrapped file (invitePlayerToTeam et al. remain bare
    // until B5).
    expect(scanned.wrapped.get('createAnnouncement')).toEqual({ feature: 'announcements' });
  });

  it('exports list matches a fresh regex scan (sanity: scanner is not hard-coded)', () => {
    // roster.ts is untouched until W15 Batch 5 (roster_management) — a
    // stable fully-unwrapped fixture for this scanner sanity check
    // (message-attachments.ts moved to fully wrapped in Batch 4, so it no
    // longer fits this assertion — same handoff documents.ts →
    // message-attachments.ts did after Batch 3).
    const scanned = scanActionFile(join(process.cwd(), 'src/app/golf/actions/roster.ts'));
    expect(scanned.exports.sort()).toEqual(
      [
        'removePlayerFromTeam',
        'getTeamPlayers',
      ].sort(),
    );
    expect(scanned.wrapped.size).toBe(0);
  });
});

describe('assertAreaFullyWrapped — self-test (proves the harness detects gaps)', () => {
  it('does NOT throw for golf.ts scoped to only the Batch 0+1+2+4 wrapped exports', () => {
    expect(() =>
      assertAreaFullyWrapped(['src/app/golf/actions/golf.ts'], {
        exclude: {
          // Batch 1 (round_tracking/qualifiers/my_qualifiers, 13 exports incl.
          // the pre-existing savePartialRound exemplar) + Batch 2
          // (calendar_events/notifications, 18 exports) + Batch 4
          // (createAnnouncement) are now wrapped; every other golf.ts export
          // belongs to a later batch (B5/B6) and is still bare — scope this
          // self-test accordingly.
          'src/app/golf/actions/golf.ts': [
            'invitePlayerToTeam',
            'updatePlayerStatus',
            'getPendingInvitations',
            'getPlayerSavedCourses',
            'savePlayerCourse',
            'touchSavedCourse',
            'getRecentCoursesForPlayer',
          ],
        },
      }),
    ).not.toThrow();
  });

  it('THROWS listing every unwrapped export in roster.ts (still bare — W15 Batch 5)', () => {
    // roster.ts is untouched until Batch 5; message-attachments.ts (the
    // fixture here through Batch 3) moved to fully wrapped in Batch 4, so it
    // no longer proves gap-detection — roster.ts takes over that role (same
    // handoff documents.ts → message-attachments.ts did after Batch 3).
    let thrown: Error | null = null;
    try {
      assertAreaFullyWrapped(['src/app/golf/actions/roster.ts']);
    } catch (err) {
      thrown = err instanceof Error ? err : new Error(String(err));
    }
    expect(thrown).not.toBeNull();
    const message = thrown?.message ?? '';
    expect(message).toContain('removePlayerFromTeam');
    expect(message).toContain('getTeamPlayers');
    expect(message).toContain('2 coverage gap(s)');
  });

  it('throws when a wrap carries an invalid feature key', () => {
    // golf.ts's savePartialRound is wrapped with a VALID feature
    // (round_tracking); asserting it against a manifest exclusion that
    // forces the harness to check feature validity for an unexcluded,
    // unwrapped export still surfaces as a gap (not a false pass).
    expect(() =>
      assertAreaFullyWrapped(['src/app/golf/actions/golf.ts'], {
        exclude: {}, // no exclusions — every other export in golf.ts is unwrapped
      }),
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
