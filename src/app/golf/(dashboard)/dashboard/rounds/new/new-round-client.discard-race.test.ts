/**
 * C1: Discard racing an in-flight checkpoint/auto-save resurrects the round.
 *
 * `handleDeleteRound` calls `deleteInProgressRound(savedRoundId)` and, on
 * success, navigates away. But a checkpoint (`persistCompletedHole`) or
 * auto-save (`handleAutoSave`) already in flight for the SAME round id can
 * still be waiting on its own network round trip. If the delete lands first,
 * that in-flight save's response comes back `round_missing` — the row really
 * is gone, Discard just removed it — and every existing `round_missing`
 * branch responds by dropping the id and re-creating: `dropStaleRoundId()`
 * followed (immediately, or on the NEXT primary auto-save once the id is
 * null) by `savePartialRound(data, undefined)`, a bare CREATE. That recreates
 * a fresh `in_progress` round the player just explicitly discarded — a
 * zombie round.
 *
 * Fix: `roundDiscardedRef`, set synchronously BEFORE the delete call (so the
 * window between "delete requested" and "delete confirmed" is covered) and
 * cleared if the delete itself fails (a failed discard means the round is
 * still live). Every `round_missing` branch that would otherwise drop the id
 * and/or recreate checks it first and no-ops instead.
 *
 * Source-inspection, matching the sibling `conflict-block`/`round-missing`
 * tests: the component is a live React tree with an enormous dependency
 * surface (offline storage, router, qualifiers, course search); these are
 * wiring contracts, not behavioral renders.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./new-round-client.tsx', import.meta.url),
  'utf8',
);

function slice(fromMarker: string, toMarker: string): string {
  const from = source.indexOf(fromMarker);
  const to = source.indexOf(toMarker, from + 1);
  expect(from, `marker not found: ${fromMarker}`).toBeGreaterThanOrEqual(0);
  expect(to, `marker not found after ${fromMarker}: ${toMarker}`).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('New Round — discard racing an in-flight save cannot resurrect the round (C1)', () => {
  it('marks the round discarded BEFORE the delete call, and clears it if the delete fails', () => {
    const handler = slice('const handleDeleteRound = async () => {', 'const selectedCourse =');
    const markIndex = handler.indexOf('roundDiscardedRef.current = true');
    const deleteIndex = handler.indexOf('deleteInProgressRound(savedRoundId)');
    expect(markIndex, 'roundDiscardedRef.current = true not found').toBeGreaterThanOrEqual(0);
    expect(deleteIndex, 'deleteInProgressRound(savedRoundId) not found').toBeGreaterThanOrEqual(0);
    expect(markIndex).toBeLessThan(deleteIndex);
    // Cleared on a failed discard — the round is still live, so a later
    // round_missing for it would be a real anomaly, not this race.
    const failureBranch = handler.slice(handler.indexOf('if (!result.success) {'));
    expect(failureBranch.slice(0, failureBranch.indexOf('return;'))).toContain('roundDiscardedRef.current = false');
  });

  it('the completed-hole checkpoint refuses to recreate a discarded round', () => {
    const checkpoint = slice('const persistCompletedHole = useCallback(async (', 'const handleHoleComplete = async (');
    // Entry guard: a new invocation after discard no-ops immediately.
    expect(checkpoint).toMatch(/if \(roundDiscardedRef\.current\) return false;/);
    // The round_missing branch itself: discarded must win before the id is
    // dropped and the loop retries as a CREATE.
    const missingBranch = checkpoint.slice(
      checkpoint.indexOf("result.error === 'round_missing'"),
      checkpoint.indexOf('continue;', checkpoint.indexOf("result.error === 'round_missing'")),
    );
    expect(missingBranch).toContain('roundDiscardedRef.current');
  });

  it('auto-save refuses to recreate a discarded round on its primary save', () => {
    const autoSave = slice('const handleAutoSave = useCallback(async (shots: ShotRecord[], holeIndex: number) => {', 'const handleRoundSubmit = async (');
    // Entry guard, mirroring the existing conflict-block check.
    const conflictGuardIndex = autoSave.indexOf('roundConflictBlockedRef.current) return;');
    const discardGuardIndex = autoSave.indexOf('roundDiscardedRef.current) return;');
    expect(conflictGuardIndex).toBeGreaterThanOrEqual(0);
    expect(discardGuardIndex).toBeGreaterThan(conflictGuardIndex);
    // Both entry guards must run BEFORE the network branch below.
    expect(discardGuardIndex).toBeLessThan(autoSave.indexOf('if (navigator.onLine)'));
    const missingBranch = autoSave.slice(
      autoSave.indexOf("result.error === 'round_missing'"),
      autoSave.indexOf('} else if', autoSave.indexOf("result.error === 'round_missing'")),
    );
    expect(missingBranch).toContain('roundDiscardedRef.current');
  });

  it('auto-save\'s queued follow-up refuses to arm a create for a discarded round', () => {
    const autoSave = slice('const handleAutoSave = useCallback(async (shots: ShotRecord[], holeIndex: number) => {', 'const handleRoundSubmit = async (');
    const queued = autoSave.slice(autoSave.indexOf('If a newer save was queued'));
    const missingBranch = queued.slice(
      queued.indexOf("r.error === 'round_missing'"),
      queued.indexOf('}', queued.indexOf('dropStaleRoundId()', queued.indexOf("r.error === 'round_missing'"))) + 1,
    );
    expect(missingBranch).toContain('roundDiscardedRef.current');
  });

  it('Save & Exit refuses to recreate a discarded round', () => {
    const saveForLater = slice('const handleSaveForLater = async () => {', 'const handleDeleteRound = async () => {');
    const missingBranch = saveForLater.slice(
      saveForLater.indexOf("result.error === 'round_missing'"),
      saveForLater.indexOf('}', saveForLater.indexOf("result.error === 'round_missing'")) + 1,
    );
    expect(missingBranch).toContain('roundDiscardedRef.current');
  });
});
