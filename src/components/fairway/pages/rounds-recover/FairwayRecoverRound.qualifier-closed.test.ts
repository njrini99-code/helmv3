/**
 * C3: the same `isCompletedRoundError` false-positive that looped Continue
 * Round and New Round (see the sibling `*.qualifier-closed.test.ts` files)
 * exists here too — a recovered terminal submission refused for a
 * qualifier-closed reason would be treated as "already submitted" and
 * redirected to the round's own detail page, which bounces an `in_progress`
 * round straight back to Continue Round.
 *
 * Source-inspection: this component pulls in the full recovery flow
 * (offline IndexedDB, localStorage scanning, router) that would need
 * extensive mocking to exercise this exact branch through a real render —
 * matching the sibling `raw-key` test for this file.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./FairwayRecoverRound.tsx', import.meta.url), 'utf8');

describe('FairwayRecoverRound — qualifier-closed excluded from isCompletedRoundError (C3)', () => {
  it('imports the shared qualifier-closed classifier', () => {
    expect(source).toMatch(/import\s*\{[^}]*isQualifierClosedError[^}]*\}\s*from\s*'@\/lib\/golf\/round-missing-recovery'/);
  });

  it('isCompletedRoundError excludes it BEFORE its own substring checks', () => {
    const from = source.indexOf('function isCompletedRoundError(');
    const to = source.indexOf('\n}\n', from);
    expect(from).toBeGreaterThanOrEqual(0);
    const fn = source.slice(from, to);
    const guardIndex = fn.indexOf('isQualifierClosedError(message)');
    const substringCheckIndex = fn.indexOf("includes('already been completed')");
    expect(guardIndex, 'isQualifierClosedError(message) guard not found').toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeLessThan(substringCheckIndex);
  });
});
