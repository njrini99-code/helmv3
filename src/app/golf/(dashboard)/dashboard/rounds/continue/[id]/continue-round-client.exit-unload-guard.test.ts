/**
 * MASTER_BUG_REPORT_2026-09-02.md Part 1: "Save for later" (and Discard)
 * still trigger the browser's native unload warning.
 *
 * See the sibling `new-round-client.exit-unload-guard.test.ts` for the full
 * mechanism. Continue Round's `handleBeforeUnload` already computed a real
 * `hasUnsavedChanges` from local hole-stat/in-progress-shot state rather than
 * `new-round-client`'s cruder `step !== 'setup'` check — but that state is
 * still sitting in React state the instant after a successful save, so the
 * warning was still a false positive without this guard. `handlePageHide`
 * has the same problem, and for Discard specifically a beacon fired there
 * would actively resurrect the round the player just deleted.
 *
 * Source-inspection, matching the sibling `discard-race`/`round-missing`
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

describe('Continue Round — Save for later / Discard must not trigger the unload warning', () => {
  it('declares roundExitedSafelyRef', () => {
    expect(source).toContain('const roundExitedSafelyRef = useRef(false);');
  });

  it('handleBeforeUnload bails on roundExitedSafelyRef before computing hasUnsavedChanges', () => {
    const handler = slice('const handleBeforeUnload = (e: BeforeUnloadEvent) => {', 'const handlePageHide = () => {');
    const guardIndex = handler.indexOf('if (roundExitedSafelyRef.current) return;');
    const computeIndex = handler.indexOf('const hasUnsavedChanges =');
    expect(guardIndex, 'roundExitedSafelyRef guard not found').toBeGreaterThanOrEqual(0);
    expect(computeIndex, 'hasUnsavedChanges computation not found').toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeLessThan(computeIndex);
  });

  it('handlePageHide bails on roundExitedSafelyRef before writing anything', () => {
    const handler = slice('const handlePageHide = () => {', 'const handleVisibilityChange = () => {');
    const guardIndex = handler.indexOf('if (roundExitedSafelyRef.current) return;');
    const emergencySaveIndex = handler.indexOf('emergencySave({');
    expect(guardIndex, 'roundExitedSafelyRef guard not found').toBeGreaterThanOrEqual(0);
    expect(emergencySaveIndex, 'emergencySave call not found').toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeLessThan(emergencySaveIndex);
  });

  it('handleSaveForLater sets roundExitedSafelyRef before navigating away', () => {
    const handler = slice('const handleSaveForLater = async () => {', 'const completedStatsForHole =');
    const setIndex = handler.indexOf('roundExitedSafelyRef.current = true;');
    const pushIndex = handler.indexOf("router.push('/golf/dashboard/rounds');");
    expect(setIndex, 'roundExitedSafelyRef.current = true not found').toBeGreaterThanOrEqual(0);
    expect(pushIndex, "router.push('/golf/dashboard/rounds') not found").toBeGreaterThanOrEqual(0);
    expect(setIndex).toBeLessThan(pushIndex);
  });

  it('handleDeleteRound sets roundExitedSafelyRef before navigating away, only on the success path', () => {
    const handler = slice('const handleDeleteRound = async () => {', 'const submittingDefinedStats =');
    const setIndex = handler.indexOf('roundExitedSafelyRef.current = true;');
    const pushIndex = handler.indexOf("router.push('/golf/dashboard/rounds');");
    expect(setIndex, 'roundExitedSafelyRef.current = true not found').toBeGreaterThanOrEqual(0);
    expect(pushIndex, "router.push('/golf/dashboard/rounds') not found").toBeGreaterThanOrEqual(0);
    expect(setIndex).toBeLessThan(pushIndex);
    // The early-return failure branch (result not successful) must not set it.
    const failureBranch = handler.slice(
      handler.indexOf("if (result && 'success' in result && !result.success) {"),
      handler.indexOf('return;', handler.indexOf("if (result && 'success' in result && !result.success) {")) + 'return;'.length,
    );
    expect(failureBranch).not.toContain('roundExitedSafelyRef.current = true');
  });
});
