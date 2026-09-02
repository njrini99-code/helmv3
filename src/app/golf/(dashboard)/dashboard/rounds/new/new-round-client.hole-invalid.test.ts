/**
 * `savePartialRound` can now return `{ error: 'hole_invalid', message, ... }`
 * (A3, 08b6bbf50) instead of silently salvaging a non-durable hole to null.
 * `handleSaveForLater`'s generic failure branch was, and without this fix
 * still is:
 *
 *   throw new Error(result.error || 'Failed to save round. Please try again.');
 *
 * `result.error` for this code is the bare key `'hole_invalid'`, not a
 * sentence — `FairwaySaveRoundModal` renders `err.message` verbatim in the
 * exit-round sheet (`src/components/fairway/pages/rounds-new/
 * FairwaySaveRoundModal.tsx`), so a player who taps "Save & Exit" on a round
 * with one invalid hole would see the literal word "hole_invalid" where a
 * sentence belongs. Same defect class P1 fixed for `round_missing` in
 * 6a7577c71 / fb425aa2b.
 *
 * The fix: branch on `result.error === 'hole_invalid'` BEFORE the generic
 * throw, the same way `conflict` and the completed-round codes already do,
 * and surface `result.message` — the human sentence the server already
 * built — instead of the bare key.
 *
 * Source-inspection, matching the sibling `recovery`/`decide-post-hole`
 * tests for this file: the component is a live React tree and this is a
 * wiring contract.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./new-round-client.tsx', import.meta.url), 'utf8');

function slice(fromMarker: string, toMarker: string): string {
  const from = source.indexOf(fromMarker);
  const to = source.indexOf(toMarker, from + 1);
  expect(from, `marker not found: ${fromMarker}`).toBeGreaterThanOrEqual(0);
  expect(to, `marker not found after ${fromMarker}: ${toMarker}`).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('New Round — handleSaveForLater hole_invalid surfacing', () => {
  it('surfaces the server sentence, not the bare "hole_invalid" key, from the exit-and-save flow', () => {
    const handler = slice(
      'const handleSaveForLater = async () => {',
      'const handleDeleteRound = async () => {',
    );

    expect(handler).toContain("result.error === 'hole_invalid'");

    // The hole_invalid branch must run before the generic fallback throw, and
    // must throw result.message (the sentence), never result.error (the key).
    const holeInvalidIdx = handler.indexOf("result.error === 'hole_invalid'");
    const genericThrowIdx = handler.indexOf(
      "throw new Error(result.error || 'Failed to save round. Please try again.');",
    );
    expect(genericThrowIdx, 'generic fallback throw should still exist').toBeGreaterThanOrEqual(0);
    expect(holeInvalidIdx).toBeLessThan(genericThrowIdx);

    const holeInvalidBranch = handler.slice(holeInvalidIdx, genericThrowIdx);
    expect(holeInvalidBranch).toMatch(/result\.message/);
    // Must not merely re-throw result.error inside this branch.
    expect(holeInvalidBranch).not.toMatch(/throw new Error\(result\.error\)/);
  });
});
