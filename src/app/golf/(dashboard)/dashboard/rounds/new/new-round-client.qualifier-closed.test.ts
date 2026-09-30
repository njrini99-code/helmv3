/**
 * C3: submitting into a completed qualifier looped between round detail and
 * New Round's tracking step.
 *
 * See the sibling `continue-round-client.qualifier-closed.test.ts` for the
 * full mechanism. New Round's `handleRoundSubmit` has the same
 * `isCompletedRoundError` false-positive on the qualifier-closed refusal.
 *
 * Source-inspection, matching the sibling wiring-contract tests for this
 * file.
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

describe('New Round — qualifier-closed no longer loops (C3)', () => {
  it('imports the shared qualifier-closed classifier', () => {
    expect(source).toMatch(/import\s*\{[^}]*isQualifierClosedError[^}]*\}\s*from\s*'@\/lib\/golf\/round-missing-recovery'/);
  });

  it('isCompletedRoundError excludes the qualifier-closed refusal BEFORE its own substring checks', () => {
    const fn = slice('const isCompletedRoundError = useCallback((message?: string) => {', '}, []);');
    const guardIndex = fn.indexOf('isQualifierClosedError(message)');
    const substringCheckIndex = fn.indexOf("includes('already been completed')");
    expect(guardIndex, 'isQualifierClosedError(message) guard not found').toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeLessThan(substringCheckIndex);
    expect(fn.slice(guardIndex, guardIndex + 60)).toMatch(/return false/);
  });

  it('handleRoundSubmit surfaces the qualifier-closed refusal as a terminal message, never a redirect', () => {
    const submit = slice('const handleRoundSubmit = async (allHoleStats: HoleStats[]) => {', '\n  const handleSaveForLater');
    const qualifierBranchIndex = submit.indexOf('isQualifierClosedError(result.error)');
    const completedBranchIndex = submit.indexOf('isCompletedRoundError(result.error)');
    expect(qualifierBranchIndex, 'isQualifierClosedError(result.error) not checked in handleRoundSubmit').toBeGreaterThanOrEqual(0);
    expect(qualifierBranchIndex).toBeLessThan(completedBranchIndex);
    const qualifierBranch = submit.slice(qualifierBranchIndex, completedBranchIndex);
    expect(qualifierBranch).not.toContain('redirectToCompletedRound()');
    expect(qualifierBranch).toContain('setQualifierClosed(true)');
  });

  it('offers the existing reclassify-to-practice path via updateRoundType', () => {
    expect(source).toMatch(/import\s*\{[^}]*updateRoundType[^}]*\}\s*from\s*'@\/app\/golf\/actions\/round-type'/);
    expect(source).toContain('handleSaveAsPractice');
    const handler = slice('const handleSaveAsPractice = async () => {', '};');
    expect(handler).toContain("roundType: 'practice'");
    expect(handler).toContain('updateRoundType(');
  });

  it('wires the reclassify action onto the submit overlay and suppresses the useless retry', () => {
    const overlay = slice('<SubmitOverlay', '/>');
    expect(overlay).toContain('onSecondaryAction={qualifierClosed ? handleSaveAsPractice : undefined}');
    expect(overlay).toMatch(/onRetry=\{\s*qualifierClosed\s*\?\s*undefined/);
  });
});
