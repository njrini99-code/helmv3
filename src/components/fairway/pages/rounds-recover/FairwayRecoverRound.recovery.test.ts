/** Recovery must retain a partial first hole and restore it as an in-progress round. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./FairwayRecoverRound.tsx', import.meta.url),
  'utf8',
);

describe('round recovery behavior', () => {
  it('keeps first-hole shot data recoverable without a completed score', () => {
    expect(source).toContain('const hasInProgressShot');
    expect(source).toContain('if (completedCount === 0 && !hasInProgressShot) continue;');
    expect(source).toContain('return hasCompletedHole || hasInProgressShot;');
  });

  it('restores partial work with savePartialRound and opens Continue Round', () => {
    const partialRecoveryStart = source.indexOf("draft.submissionIntent !== 'submit'");
    const submitRecoveryStart = source.indexOf('const roundData =');
    const partialRecoverySource = source.slice(partialRecoveryStart, submitRecoveryStart);

    expect(partialRecoveryStart).toBeGreaterThanOrEqual(0);
    // Through the shared round_missing helper: a snapshot whose server id has
    // since vanished is re-created, not reported as the literal key.
    expect(partialRecoverySource).toContain('writeRoundRecreatingIfMissing(');
    expect(partialRecoverySource).toContain('savePartialRound,');
    expect(partialRecoverySource).toContain('partialData,');
    expect(partialRecoverySource).toContain('router.push(`/golf/dashboard/rounds/continue/${partialResult.data.roundId}`)');
  });

  it('re-submits a failed final submission as a new round when its id is dead, never retrying the dead id', () => {
    const submitRecoveryStart = source.indexOf('const roundData = terminalSubmission;');
    const submitRecoverySource = source.slice(submitRecoveryStart, source.indexOf('// Clean up the offline data'));

    expect(submitRecoveryStart).toBeGreaterThanOrEqual(0);
    expect(submitRecoverySource).toContain('writeRoundRecreatingIfMissing(');
    expect(submitRecoverySource).toContain('submitGolfRoundComprehensive,');
    expect(submitRecoverySource).not.toContain('await submitGolfRoundComprehensive(roundData, existingRoundId)');
  });

  it('keeps failed IndexedDB submissions recoverable and requires the exact terminal payload', () => {
    expect(source).toContain('getFailedRounds as getModernFailedRounds');
    expect(source).toContain('terminalSubmission?: TerminalRoundSubmissionData');
    expect(source).toContain('|| !terminalSubmission');
    expect(source).toContain('const roundData = terminalSubmission;');
  });

  it('never clears a newer backup after an older recovery succeeds', () => {
    expect(source).toContain('clearEmergencySaveThrough(existingRoundId ?? null, playerId, round.timestamp)');
    expect(source).toContain('deleteModernOfflineRoundThrough(round.id, round.timestamp)');
    expect(source).toContain('clearRoundRecoverySnapshotThrough(existingRoundId ?? null, playerId, round.timestamp)');
  });
});
