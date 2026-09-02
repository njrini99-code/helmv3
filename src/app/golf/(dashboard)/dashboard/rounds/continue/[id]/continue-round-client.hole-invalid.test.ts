/**
 * `savePartialRound` can now return `{ error: 'hole_invalid', message, ... }`
 * (A3, 08b6bbf50) instead of silently salvaging a non-durable hole to null.
 * `handleSaveForLater`'s generic failure branch was, and without this fix
 * still is:
 *
 *   showToast(result.error || 'Failed to save round. Please try again.', 'error');
 *
 * `result.error` for this code is the bare key `'hole_invalid'`, not a
 * sentence, so a player who taps "Save & Exit" on a round with one invalid
 * hole would see the literal word "hole_invalid" in the toast. Same defect
 * class P1 fixed for `round_missing` in 6a7577c71 / fb425aa2b (see the
 * sibling `continue-round-client.round-missing.test.ts`).
 *
 * The fix: branch on `result.error === 'hole_invalid'` BEFORE the generic
 * toast, the same way `conflict` and the completed-round codes already do,
 * and surface `result.message` — the human sentence the server already
 * built — instead of the bare key.
 *
 * Source-inspection, matching the sibling `round-missing`/
 * `offline-consolidation` tests for this file: the component is a live React
 * tree and this is a wiring contract.
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

describe('Continue Round — handleSaveForLater hole_invalid surfacing', () => {
  it('surfaces the server sentence, not the bare "hole_invalid" key, from the exit-and-save flow', () => {
    // B6: the dedicated `result.error === 'hole_invalid'` branch this test
    // used to pin was replaced by the shared `describeRoundWriteResult`
    // helper (round-missing-recovery.ts), which handles the same
    // bare-key-plus-message shape for every round-write call site instead of
    // one more local copy here.
    const handler = slice(
      'const handleSaveForLater = async () => {',
      'const handleDeleteRound = async () => {',
    );

    expect(handler).toContain('describeRoundWriteResult(result)');
    // Never shown the bare key or the raw error string unconditionally.
    expect(handler).not.toMatch(/showToast\(result\.error,/);
    expect(handler).not.toMatch(/showToast\(result\.error \|\|/);
  });
});
