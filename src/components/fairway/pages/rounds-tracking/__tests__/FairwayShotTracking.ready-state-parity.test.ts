/**
 * B5/B8: `FairwayShotEntry`'s `nextShotBlocker` computes a human-readable
 * message for why the primary action is disabled, but the actual DISABLED
 * state comes from `isReadyForNextShot()` — a SEPARATE function defined in
 * the PARENT, `FairwayShotTracking.tsx`, and passed down as a prop. The two
 * must stay in lock-step: `nextShotBlocker`'s own doc comment says its
 * "order/conditions mirror isReadyForNextShot() VERBATIM so the hint can
 * never disagree with the disabled state."
 *
 * Before this fix, `isReadyForNextShot` had NO upper bound on the
 * "distance remaining" (B5 — a value later capped server-side at 1000
 * yards by `comprehensiveShotSchema`, golf.ts) and no lower bound at all
 * (B8 — "0" is a valid, finite, non-negative number). That meant:
 *
 *  - The primary action button was NOT disabled for either case (`ready`
 *    stayed true), so `nextShotBlocker` (which short-circuits to `null`
 *    whenever `ready` is true) never got a chance to show ITS OWN new
 *    messages for these cases either — they only fire in unit tests that
 *    mock `isReadyForNextShot` to return `false` directly.
 *  - Tapping the (apparently enabled) button then called `handleNextShot`,
 *    which for distance 0 bailed with `if (distanceAfter === 0) { return; }`
 *    and NO player-facing feedback at all — a dead tap.
 *
 * Source-inspection: `FairwayShotTracking.tsx` is a large component with
 * many sub-hooks (penalty, edit, undo, autosave) that would need extensive
 * mocking to render in isolation; the doc comment's own "mirror VERBATIM"
 * contract is exactly what this pins.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../FairwayShotTracking.tsx', import.meta.url), 'utf8');

function slice(fromMarker: string, toMarker: string): string {
  const from = source.indexOf(fromMarker);
  const to = source.indexOf(toMarker, from + 1);
  expect(from, `marker not found: ${fromMarker}`).toBeGreaterThanOrEqual(0);
  expect(to, `marker not found after ${fromMarker}: ${toMarker}`).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('FairwayShotTracking — isReadyForNextShot mirrors the distance bounds (B5/B8)', () => {
  it('rejects a distance remaining over 1000 yards, matching the server Zod bound', () => {
    const readyFn = slice('const isReadyForNextShot = (): boolean => {', 'const handleResultSelect = (result: string) => {');
    expect(readyFn).toMatch(/displayToYards\(parsed, distancePref\)/);
    expect(readyFn).toMatch(/1000/);
  });

  it('rejects a distance remaining of 0 (or that rounds to 0), matching the "no dead tap" fix', () => {
    const readyFn = slice('const isReadyForNextShot = (): boolean => {', 'const handleResultSelect = (result: string) => {');
    // Both the green-proximity branch and the general yards branch must
    // reject a non-positive resolved distance.
    const greenBranch = readyFn.slice(readyFn.indexOf("resultOfShot === 'green'"));
    expect(greenBranch).toMatch(/afterInFeet <= 0/);
    expect(readyFn).toMatch(/afterInYards <= 0/);
  });
});
