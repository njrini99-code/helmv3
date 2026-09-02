/**
 * C1: Discard racing an in-flight checkpoint/auto-save resurrects the round.
 *
 * See the sibling `new-round-client.discard-race.test.ts` for the full
 * mechanism. Continue Round funnels every `round_missing` re-create through
 * ONE shared function, `recreateMissingRound` — guarding it there covers the
 * completed-hole checkpoint, the mid-hole auto-save, and its queued
 * follow-up in one place. `handleSaveForLater` has its own inline recreate
 * and needs its own guard.
 *
 * Source-inspection, matching the sibling `round-missing`/`conflict-block`
 * tests for this file.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./continue-round-client.tsx', import.meta.url),
  'utf8',
);

function slice(fromMarker: string, toMarker: string): string {
  const from = source.indexOf(fromMarker);
  const to = source.indexOf(toMarker, from + 1);
  expect(from, `marker not found: ${fromMarker}`).toBeGreaterThanOrEqual(0);
  expect(to, `marker not found after ${fromMarker}: ${toMarker}`).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('Continue Round — discard racing an in-flight save cannot resurrect the round (C1)', () => {
  it('marks the round discarded BEFORE the delete call, and clears it if the delete fails', () => {
    const handler = slice('const handleDeleteRound = async () => {', 'const submittingDefinedStats =');
    const markIndex = handler.indexOf('roundDiscardedRef.current = true');
    const deleteIndex = handler.indexOf('deleteInProgressRound(roundId)');
    expect(markIndex, 'roundDiscardedRef.current = true not found').toBeGreaterThanOrEqual(0);
    expect(deleteIndex, 'deleteInProgressRound(roundId) not found').toBeGreaterThanOrEqual(0);
    expect(markIndex).toBeLessThan(deleteIndex);
    expect(handler).toContain('roundDiscardedRef.current = false');
  });

  it('the ONE shared re-create path refuses a discarded round before re-creating', () => {
    const recreate = slice('const recreateMissingRound = useCallback(async (', 'const persistCompletedHole = useCallback(async (');
    const guardIndex = recreate.indexOf('roundDiscardedRef.current');
    const recreateCallIndex = recreate.indexOf('savePartialRound(saveData, undefined)');
    expect(guardIndex, 'roundDiscardedRef.current guard not found').toBeGreaterThanOrEqual(0);
    expect(recreateCallIndex, 'savePartialRound(saveData, undefined) not found').toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeLessThan(recreateCallIndex);
  });

  it('Save & Exit refuses to recreate a discarded round', () => {
    const saveForLater = slice('const handleSaveForLater = async () => {', 'const completedStatsForHole =');
    const missingBranch = saveForLater.slice(
      saveForLater.indexOf("result.error === 'round_missing'"),
      saveForLater.indexOf('}', saveForLater.indexOf("result.error === 'round_missing'")) + 1,
    );
    expect(missingBranch).toContain('roundDiscardedRef.current');
  });
});
