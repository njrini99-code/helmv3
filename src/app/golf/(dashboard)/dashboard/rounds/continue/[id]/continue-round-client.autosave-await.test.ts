/**
 * B3: Continue Round's `handleAutoSave` fired its server save with
 * `void executeServerSave(...)` — never awaited, and the inner try/catch
 * never rethrew. `useShotStateMachine`'s auto-save effect (`use-shot-state-machine.ts`)
 * does:
 *
 *   await onAutoSaveRef.current?.(shotHistoryRef.current, currentHoleIndexRef.current);
 *   handleSaveSuccess(fingerprint);   // only reached if the await above did not throw
 *
 * Because `handleAutoSave`'s own returned promise resolved as soon as the
 * synchronous localStorage backup + `void` dispatch completed — never
 * waiting on the actual network round-trip — the hook always saw a
 * resolved promise and always marked the chip "Saved", regardless of what
 * the real `savePartialRound` call did. The retry/backoff and circuit
 * breaker in the state machine (RETRY_DELAYS, CIRCUIT_BREAKER_THRESHOLD)
 * never engaged because `handleAutoSave` never rejected.
 *
 * Fix, mirroring `new-round-client.tsx`'s already-correct `handleAutoSave`
 * (New Round has no separate `executeServerSave` helper and no `void`): the
 * primary server save is awaited inline, and an unhandled failure is
 * rethrown so the state machine's own catch block can retry it. Hole
 * checkpoints (`persistCompletedHole`) are already awaited and stay on
 * their own retry path — this fix does not touch that branch.
 *
 * Source-inspection, matching the sibling round-missing/hole-invalid/
 * offline-consolidation tests for this file: the component is a live React
 * tree with heavy dependencies, and this is a wiring contract.
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

describe('Continue Round — handleAutoSave awaits its server save (B3)', () => {
  it('never fires the primary server save with `void` — the caller must be able to await/reject it', () => {
    const handler = slice(
      'const handleAutoSave = useCallback(async (shots: ShotRecord[], holeIndex: number) => {',
      '\n  const handleRoundSubmit = async (',
    );

    // The old bug: `void executeServerSave(shots, holeIndex, emergencyTimestamp);`
    expect(handler).not.toMatch(/void\s+executeServerSave\(/);
  });

  it('rethrows an unrecognized save failure so the state machine can retry and open its circuit breaker', () => {
    const handler = slice(
      'const handleAutoSave = useCallback(async (shots: ShotRecord[], holeIndex: number) => {',
      '\n  const handleRoundSubmit = async (',
    );

    // The primary (non-queued) save path must propagate a real failure by
    // throwing — `useShotStateMachine`'s effect only retries/opens the
    // breaker on a rejected promise.
    expect(handler).toMatch(/throw new Error\(/);
  });

  it('keeps hole checkpoints on their own already-awaited retry path, untouched by this fix', () => {
    const handler = slice(
      'const handleAutoSave = useCallback(async (shots: ShotRecord[], holeIndex: number) => {',
      '\n  const handleRoundSubmit = async (',
    );

    expect(handler).toContain('await persistCompletedHole(');
  });
});
