/**
 * B2: two devices on one round.
 *
 * `use-round-status-sync.ts`'s poll and `handleRoundSyncConflict` both used
 * to adopt the SERVER's `updated_at` into `lastServerUpdatedAtRef` whenever
 * they learned it — including when that value proved the server had moved
 * since this client's own last known checkpoint (a poll-detected staleness,
 * or an explicit `conflict` result from a save). Since the round-write RPCs
 * (`save_partial_round_atomic`, `submit_round_atomic`) are full-snapshot
 * REPLACE keyed on that ref as an optimistic lock, silently resyncing it let
 * the NEXT save from this (stale) device pass the lock and overwrite
 * whatever the other device had just written — the ref said "matches
 * server" while this device's in-memory holes/shots were still the old
 * data.
 *
 * Fix: never adopt a newer server `updated_at` into the ref once staleness
 * or a conflict is detected (see the sibling `use-round-status-sync.test.tsx`
 * for the hook-level fix). Here on the component side: wire the hook's
 * `onRoundStale` callback, and make every round-write entry point refuse to
 * write once a conflict/staleness has been detected, until the player
 * reloads — "This round was updated on another device. Reload to continue."
 *
 * B9 carves ONE narrow, guarded exception into that "never adopt" rule: a
 * background beacon save (sendBeacon/keepalive fetch) has no readable
 * response, so its own successful write is indistinguishable from a real
 * conflict until the next check. `pendingBeaconRef` marks exactly that
 * window; only INSIDE it may the ref adopt the server's value (self-heal),
 * and the guard clears itself so this cannot recur for a real conflict.
 *

 * Source-inspection, matching the sibling round-missing/hole-invalid/
 * autosave-await tests for this file: the component is a live React tree
 * with heavy dependencies, and this is a wiring contract.
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

describe('Continue Round — multi-device conflict blocks further writes (B2)', () => {
  it('wires onRoundStale into useRoundStatusSync instead of leaving polling staleness unhandled', () => {
    const hookCall = slice('useRoundStatusSync({', '});');
    expect(hookCall).toContain('onRoundStale');
  });

  it('adopts the server updated_at ONLY inside the beacon self-heal window, never for a real conflict (B2/B9)', () => {
    const handler = slice(
      'const handleRoundSyncConflict = useCallback(',
      '// Throttle auto-save warning',
    );

    const pendingBeaconGuardIdx = handler.indexOf('if (pendingBeaconRef.current)');
    const blockCallIdx = handler.lastIndexOf('blockRoundForConflict(fallbackMessage)');
    const adoptionIdx = handler.indexOf(
      'lastServerUpdatedAtRef.current = stalenessResult.data.currentUpdatedAt',
    );
    expect(pendingBeaconGuardIdx, 'expected a pendingBeaconRef guard (B9)').toBeGreaterThanOrEqual(0);
    expect(blockCallIdx, 'expected the real-conflict path to still block').toBeGreaterThan(pendingBeaconGuardIdx);
    // The old bug: this adoption ran unconditionally, ahead of / outside any
    // guard, so a genuine multi-device conflict resynced the lock token too.
    // It may now appear only between the beacon guard and the real-conflict
    // block call — i.e. inside the self-heal branch.
    expect(adoptionIdx).toBeGreaterThan(pendingBeaconGuardIdx);
    expect(adoptionIdx).toBeLessThan(blockCallIdx);
    expect(handler.indexOf(
      'lastServerUpdatedAtRef.current = stalenessResult.data.currentUpdatedAt',
      adoptionIdx + 1,
    )).toBe(-1);
  });

  it('refuses to write once a conflict/staleness has blocked the round, across every write entry point', () => {
    const autoSave = slice(
      'const handleAutoSave = useCallback(async (shots: ShotRecord[], holeIndex: number) => {',
      '\n  const handleRoundSubmit = async (',
    );
    const checkpoint = slice('const persistCompletedHole = useCallback(async (', 'const handleHoleComplete = async (');
    const saveForLater = slice('const handleSaveForLater = async () => {', 'const handleDeleteRound = async (');
    const submit = slice(
      '\n  const handleRoundSubmit = async (',
      'const requestRoundSubmission = async (',
    );

    for (const [name, source] of [
      ['handleAutoSave', autoSave],
      ['persistCompletedHole', checkpoint],
      ['handleSaveForLater', saveForLater],
      ['handleRoundSubmit', submit],
    ] as const) {
      expect(source, `${name} must check the conflict-block flag`).toMatch(/roundConflictBlockedRef\.current/);
    }
  });

  it('marks the beacon-pending window when a background save is actually queued (B9)', () => {
    const pageHide = slice('const handlePageHide = () => {', 'const handleVisibilityChange = () => {');
    expect(pageHide).toContain('beaconPartialSave(saveData, roundId)');
    expect(pageHide).toContain('pendingBeaconRef.current = true');
  });

  it('does not warn about unsaved changes on unload while a conflict-reload is pending', () => {
    const beforeUnload = slice('const handleBeforeUnload = (e: BeforeUnloadEvent) => {', 'const handlePageHide = () => {');
    expect(beforeUnload).toMatch(/roundConflictBlockedRef\.current/);
  });

  it('gives the blocked banner a Reload control the player can act on', () => {
    expect(source).toContain('roundConflictBlocked &&');
    expect(source).toContain('window.location.reload()');
  });
});
