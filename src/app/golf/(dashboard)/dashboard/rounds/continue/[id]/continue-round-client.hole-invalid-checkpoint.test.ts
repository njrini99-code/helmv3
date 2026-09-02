/**
 * B5: the completed-hole checkpoint (`persistCompletedHole`) and the mid-hole
 * autosave (`handleAutoSave`) had no branch at all for `hole_invalid`
 * (A3/08b6bbf50) before this fix. `hole_invalid` is not a transient failure —
 * retrying with the identical payload will keep failing until the flagged
 * hole/field is corrected — so:
 *
 *  - it fell through `persistCompletedHole`'s generic
 *    `if (result.error !== 'busy' && result.error !== 'retry') break;`,
 *    landing on the finite retry loop's fallback: "This hole has not saved
 *    yet. Keep this screen open and try again." — actively misleading, since
 *    "try again" implies retrying will help, and it never will here.
 *  - `handleAutoSave`'s primary save had no branch for it either, so it fell
 *    into the generic unrecognized-failure `else` and threw, opening the
 *    circuit breaker for a failure retrying can never clear.
 *
 * Fix: both now branch on `result.error === 'hole_invalid'` and surface
 * `describeRoundWriteResult(result)` (the specific hole/field sentence, B6)
 * immediately, WITHOUT retrying and WITHOUT ever marking the hole
 * checkpointed (returning `false`/not throwing lets the caller keep the
 * player on the affected hole).
 *
 * Source-inspection, matching the sibling round-missing/conflict-block tests
 * for this file: the component is a live React tree with heavy dependencies,
 * and this is a wiring contract.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./continue-round-client.tsx', import.meta.url), 'utf8');

function slice(fromMarker: string, toMarker: string): string {
  const from = source.indexOf(fromMarker);
  const to = source.indexOf(toMarker, from + 1);
  expect(from, `marker not found: ${fromMarker}`).toBeGreaterThanOrEqual(0);
  expect(to, `marker not found after ${fromMarker}: ${toMarker}`).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('Continue Round — hole_invalid on the checkpoint and autosave paths (B5)', () => {
  it('persistCompletedHole surfaces the specific message and stops immediately, never retrying', () => {
    const checkpoint = slice('const persistCompletedHole = useCallback(async (', 'const handleHoleComplete = async (');

    expect(checkpoint).toContain("result.error === 'hole_invalid'");
    const holeInvalidIdx = checkpoint.indexOf("result.error === 'hole_invalid'");
    const genericBreakIdx = checkpoint.indexOf("result.error !== 'busy' && result.error !== 'retry'");
    expect(genericBreakIdx, 'generic retry-or-break fallback should still exist').toBeGreaterThanOrEqual(0);
    // hole_invalid must be checked BEFORE the generic busy/retry fallback,
    // or it would silently fall into a pointless 3-attempt retry loop.
    expect(holeInvalidIdx).toBeLessThan(genericBreakIdx);

    const holeInvalidBranch = checkpoint.slice(holeInvalidIdx, genericBreakIdx);
    expect(holeInvalidBranch).toContain('describeRoundWriteResult(result)');
    expect(holeInvalidBranch).toMatch(/return false/);
  });

  it('handleAutoSave surfaces the specific message instead of throwing into the circuit breaker', () => {
    const autoSave = slice(
      "// Server save — AWAITED (B3)",
      "// Re-throw so `useShotStateMachine` sees a rejected promise (B3).",
    );

    expect(autoSave).toContain("result.error === 'hole_invalid'");
    const holeInvalidIdx = autoSave.indexOf("result.error === 'hole_invalid'");
    const genericThrowIdx = autoSave.indexOf('Auto-save server error');
    expect(genericThrowIdx, 'generic unrecognized-failure throw should still exist').toBeGreaterThanOrEqual(0);
    expect(holeInvalidIdx).toBeLessThan(genericThrowIdx);
  });
});
