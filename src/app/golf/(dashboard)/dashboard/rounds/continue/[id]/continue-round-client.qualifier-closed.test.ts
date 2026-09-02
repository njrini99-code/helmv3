/**
 * C3: submitting into a completed qualifier looped between round detail and
 * Continue Round.
 *
 * `submit_round_atomic` refuses with "This qualifier has already been
 * completed. Rounds can no longer be submitted." — a message that ALSO
 * matches `isCompletedRoundError`'s bare "already been completed" substring
 * check, even though the ROUND is still `in_progress` (the refusal fires
 * before any write). `redirectToCompletedRound()` then sends the player to
 * `/golf/dashboard/rounds/<id>`, which redirects BACK to Continue Round for
 * an `in_progress` round — looping every time submit is retried.
 *
 * Fix: `isCompletedRoundError` excludes the qualifier-closed refusal (checked
 * first, via the shared `isQualifierClosedError`); `handleRoundSubmit`
 * surfaces it as a terminal message instead of redirecting, suppresses the
 * pointless "Retry submit" (identical payload, same refusal — matching B5's
 * "never retry a failure retrying can never clear"), and offers the existing
 * reclassify-to-practice escape hatch (`updateRoundType`) as a distinct
 * action on the submit-error overlay.
 *
 * Source-inspection, matching the sibling wiring-contract tests for this
 * file.
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

describe('Continue Round — qualifier-closed no longer loops (C3)', () => {
  it('imports the shared qualifier-closed classifier', () => {
    expect(source).toMatch(/import\s*\{[^}]*isQualifierClosedError[^}]*\}\s*from\s*'@\/lib\/golf\/round-missing-recovery'/);
  });

  it('isCompletedRoundError excludes the qualifier-closed refusal BEFORE its own substring checks', () => {
    const fn = slice('const isCompletedRoundError = useCallback((message?: string) => {', '}, []);');
    const guardIndex = fn.indexOf('isQualifierClosedError(message)');
    const substringCheckIndex = fn.indexOf("includes('already been completed')");
    expect(guardIndex, 'isQualifierClosedError(message) guard not found').toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeLessThan(substringCheckIndex);
    // The guard must actually return false — not just be referenced.
    expect(fn.slice(guardIndex, guardIndex + 60)).toMatch(/return false/);
  });

  it('handleRoundSubmit surfaces the qualifier-closed refusal as a terminal message, never a redirect', () => {
    const submit = slice('const handleRoundSubmit = async (', 'const requestRoundSubmission = async (');
    const qualifierBranchIndex = submit.indexOf('isQualifierClosedError(result.error)');
    const completedBranchIndex = submit.indexOf('isCompletedRoundError(result.error)');
    expect(qualifierBranchIndex, 'isQualifierClosedError(result.error) not checked in handleRoundSubmit').toBeGreaterThanOrEqual(0);
    // Checked before the (now-narrowed) completed-round redirect, so a
    // qualifier-closed result can never reach redirectToCompletedRound().
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
    // B5 precedent: never spend a retry on a failure retrying can never
    // clear. A qualifier-closed refusal returns the identical result for the
    // identical payload every time.
    expect(overlay).toMatch(/onRetry=\{\s*qualifierClosed\s*\?\s*undefined/);
  });
});
