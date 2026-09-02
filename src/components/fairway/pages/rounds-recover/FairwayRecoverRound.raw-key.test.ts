/**
 * B6: `writeRoundRecreatingIfMissing` only humanizes a FAILED re-create (the
 * `round_missing` path) — a first-call failure it does not recognize as
 * `round_missing` (busy/retry/conflict/hole_invalid) passes straight
 * through with the bare signal key still in `.error`. Both call sites in
 * this recovery screen showed that raw key verbatim via
 * `result.error || '<fallback sentence>'` instead of running it through the
 * shared humanizer (round-missing-recovery.ts).
 *
 * Source-inspection: the component pulls in the full recovery flow (offline
 * IndexedDB, localStorage scanning, router) that would need extensive
 * mocking to exercise this exact branch through a real render.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./FairwayRecoverRound.tsx', import.meta.url), 'utf8');

describe('FairwayRecoverRound — no bare signal key reaches the player (B6)', () => {
  it('never shows `result.error` verbatim as a fallback', () => {
    expect(source).not.toMatch(/setError\(\s*\w+\.error \|\|/);
  });

  it('routes both round-write failures through the shared humanizer', () => {
    const matches = [...source.matchAll(/describeRoundWriteResult\(/g)];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
