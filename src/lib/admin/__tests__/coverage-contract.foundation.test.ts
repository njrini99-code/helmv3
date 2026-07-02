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
    // createAnnouncement belongs to a later batch (announcements, W15 Batch 4) —
    // still bare post-Batch-2, proving the scanner distinguishes wrapped from
    // unwrapped exports within the same partially-wrapped file.
    expect(scanned.wrapped.has('createAnnouncement')).toBe(false);
  });

  it('exports list matches a fresh regex scan (sanity: scanner is not hard-coded)', () => {
    // message-attachments.ts is untouched until W15 Batch 4 (messaging) — a
    // stable fully-unwrapped fixture for this scanner sanity check
    // (documents.ts moved to fully wrapped in Batch 3, so it no longer fits
    // this assertion — same handoff round-drafts.ts → documents.ts did after
    // Batch 1).
    const scanned = scanActionFile(join(process.cwd(), 'src/app/golf/actions/message-attachments.ts'));
    expect(scanned.exports.sort()).toEqual(
      [
        'sendGolfMessageWithAttachments',
        'getGolfMessageAttachments',
        'deleteGolfMessageAttachment',
        'getSignedUrlsForAttachments',
      ].sort(),
    );
    expect(scanned.wrapped.size).toBe(0);
  });
});

describe('assertAreaFullyWrapped — self-test (proves the harness detects gaps)', () => {
  it('does NOT throw for golf.ts scoped to only the Batch 0+1+2 wrapped exports', () => {
    expect(() =>
      assertAreaFullyWrapped(['src/app/golf/actions/golf.ts'], {
        exclude: {
          // Batch 1 (round_tracking/qualifiers/my_qualifiers, 13 exports incl.
          // the pre-existing savePartialRound exemplar) + Batch 2
          // (calendar_events/notifications, 18 exports) are now wrapped; every
          // other golf.ts export belongs to a later batch (B4/B5/B6) and is
          // still bare — scope this self-test accordingly.
          'src/app/golf/actions/golf.ts': [
            'createAnnouncement',
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

  it('THROWS listing every unwrapped export in message-attachments.ts (still bare — W15 Batch 4)', () => {
    // message-attachments.ts is untouched until Batch 4; documents.ts (the
    // fixture here through Batch 2) moved to fully wrapped in Batch 3, so it
    // no longer proves gap-detection — message-attachments.ts takes over
    // that role (same handoff round-drafts.ts → documents.ts did after
    // Batch 1).
    let thrown: Error | null = null;
    try {
      assertAreaFullyWrapped(['src/app/golf/actions/message-attachments.ts']);
    } catch (err) {
      thrown = err instanceof Error ? err : new Error(String(err));
    }
    expect(thrown).not.toBeNull();
    const message = thrown?.message ?? '';
    expect(message).toContain('sendGolfMessageWithAttachments');
    expect(message).toContain('getGolfMessageAttachments');
    expect(message).toContain('deleteGolfMessageAttachment');
    expect(message).toContain('4 coverage gap(s)');
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
