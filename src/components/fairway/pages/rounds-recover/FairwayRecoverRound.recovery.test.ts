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
    const partialRecoveryStart = source.indexOf("if (draft.submissionIntent !== 'submit' || !allHolesScored)");
    const submitRecoveryStart = source.indexOf('const roundData =');
    const partialRecoverySource = source.slice(partialRecoveryStart, submitRecoveryStart);

    expect(partialRecoveryStart).toBeGreaterThanOrEqual(0);
    expect(partialRecoverySource).toContain('await savePartialRound(partialData');
    expect(partialRecoverySource).toContain('router.push(`/golf/dashboard/rounds/continue/${partialResult.data.roundId}`)');
  });
});
