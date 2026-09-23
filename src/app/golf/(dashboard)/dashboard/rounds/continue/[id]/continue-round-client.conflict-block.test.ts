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
 * write this device could not read the outcome of — a background beacon
 * (sendBeacon/keepalive fetch), or a foreground save the browser killed
 * mid-flight ("Load failed" on iOS phone lock) — has no readable response,
 * so its own successful write is indistinguishable from a real conflict
 * until the next check. `pendingUnreadableWriteRef` marks exactly that
 * window; only INSIDE it may the ref adopt the server's value (self-heal),
 * and the guard clears itself so this cannot recur for a real conflict.
 * The heal reads the server's CURRENT value, so it is exact however many
 * unreadable writes landed in between (round-write-outcome.ts).
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

  it('adopts the server updated_at ONLY inside the unreadable-write self-heal window, never for a real conflict (B2/B9)', () => {
    const handler = slice(
      'const handleRoundSyncConflict = useCallback(',
      '\n  const savePartialRoundTracked = useCallback(',
    );

    const pendingGuardIdx = handler.indexOf('if (pendingUnreadableWriteRef.current)');
    const blockCallIdx = handler.lastIndexOf('blockRoundForConflict(fallbackMessage)');
    const adoptionIdx = handler.indexOf(
      'lastServerUpdatedAtRef.current = stalenessResult.data.currentUpdatedAt',
    );
    expect(pendingGuardIdx, 'expected a pendingUnreadableWriteRef guard (B9)').toBeGreaterThanOrEqual(0);
    expect(blockCallIdx, 'expected the real-conflict path to still block').toBeGreaterThan(pendingGuardIdx);
    // The old bug: this adoption ran unconditionally, ahead of / outside any
    // guard, so a genuine multi-device conflict resynced the lock token too.
    // It may now appear only between the guard and the real-conflict block
    // call — i.e. inside the self-heal branch.
    expect(adoptionIdx).toBeGreaterThan(pendingGuardIdx);
    expect(adoptionIdx).toBeLessThan(blockCallIdx);
    expect(handler.indexOf(
      'lastServerUpdatedAtRef.current = stalenessResult.data.currentUpdatedAt',
      adoptionIdx + 1,
    )).toBe(-1);
  });

  it('does not block when a concurrent path already adopted the token for the same self-caused mismatch', () => {
    const handler = slice(
      'const handleRoundSyncConflict = useCallback(',
      '\n  const savePartialRoundTracked = useCallback(',
    );
    // Poll side: the value it saw is already our token.
    expect(handler).toContain('knownCurrentUpdatedAt === lastServerUpdatedAtRef.current');
    // Save side: re-verified against the live token before blocking.
    expect(handler).toContain('!stalenessResult.data.isStale');
  });

  it('records a killed foreground save as an unreadable write, on every foreground save path (Hampden-Sydney 2026-09-15)', () => {
    const tracked = slice('const savePartialRoundTracked = useCallback(', '\n  // Throttle auto-save warning');
    expect(tracked).toContain('isUnreadableWriteFailure(err)');
    expect(tracked).toContain('pendingUnreadableWriteRef.current = true');
    // Only the wrapper's own delegating call and the round-recreate path
    // (a CREATE holds no lock token) may call the raw action.
    const afterWrapper = source.slice(source.indexOf('const savePartialRoundTracked = useCallback(') + 1);
    const raw = [...afterWrapper.matchAll(/(?:await|void) savePartialRound\(/g)].map((m) =>
      afterWrapper.slice(m.index + m[0].length, m.index + 80),
    );
    expect(raw.length).toBeGreaterThan(0);
    for (const args of raw) {
      expect(args).toMatch(/^(data, targetRoundId\)|saveData, undefined\))/);
    }
  });

  it('retries the checkpoint under the adopted token after a self-healed conflict instead of failing the hole', () => {
    const checkpoint = slice('const persistCompletedHole = useCallback(async (', 'const handleHoleComplete = async (');
    expect(checkpoint).toContain('if (await handleRoundSyncConflict(ROUND_CONFLICT_RELOAD_MESSAGE)) continue;');
    expect(checkpoint).toContain('expectedUpdatedAt: lastServerUpdatedAtRef.current');
  });

  it('routes the pre-submit staleness check through the same self-heal-or-block decision, never adopt-then-bail', () => {
    const submit = slice('\n  const handleRoundSubmit = async (', 'const requestRoundSubmission = async (');
    const checkIdx = submit.indexOf('checkRoundStaleness(roundId, lastServerUpdatedAtRef.current)');
    expect(checkIdx).toBeGreaterThanOrEqual(0);
    const after = submit.slice(checkIdx);
    expect(after).toContain('const healed = await handleRoundSyncConflict(');
    // The unconditional adoption that used to precede the isStale check.
    const adoptIdx = after.indexOf('lastServerUpdatedAtRef.current = stalenessResult.data.currentUpdatedAt');
    const staleIdx = after.indexOf('if (stalenessResult.data.isStale)');
    expect(adoptIdx).toBeGreaterThan(staleIdx);
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

  it('marks the unreadable-write window when a background save is actually queued, without the lock token (B9)', () => {
    const pageHide = slice('const handlePageHide = () => {', 'const handleVisibilityChange = () => {');
    expect(pageHide).toContain('beaconPartialSave(saveData, roundId)');
    expect(pageHide).toContain('pendingUnreadableWriteRef.current = true');
    // Two beacons for one backgrounding (iOS fires visibilitychange-hidden
    // AND pagehide) would bump updated_at twice for one self-heal.
    expect(pageHide).toContain('if (beaconSentWhileHiddenRef.current) return;');
    // A device PROVEN behind must not beacon — the beacon holds no lock token.
    expect(pageHide).toContain('if (roundConflictBlockedRef.current) return;');
    // Durability: a beacon has no reader, so it must NOT carry the lock
    // token — a rejection would silently drop the last shots before a phone
    // lock (incident 2026-06-10). Pin the payload shape the route forwards.
    const payload = pageHide.slice(pageHide.indexOf('const saveData'), pageHide.indexOf('beaconPartialSave('));
    expect(payload).not.toMatch(/^\s*expectedUpdatedAt\s*:/m);
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
