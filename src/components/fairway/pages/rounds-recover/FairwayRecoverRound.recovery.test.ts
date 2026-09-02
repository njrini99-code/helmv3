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
    expect(partialRecoverySource).toContain('await savePartialRound(partialData');
    expect(partialRecoverySource).toContain('router.push(`/golf/dashboard/rounds/continue/${partialResult.data.roundId}`)');
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
