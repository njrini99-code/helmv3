/**
 * New Round hardening — mirrors fixes already shipped for Continue Round.
 *
 * B2/B9 (two devices on one round; beacon self-heal): New Round's own
 * `handleRoundSyncConflict` unconditionally adopted the server's
 * `updated_at` on ANY conflict, and `useRoundStatusSync` (shared hook,
 * already fixed) had no `onRoundStale` wired here — so a genuine
 * multi-device collision on a round New Round is tracking (it gets a real
 * server id after its first successful save, same as Continue Round) was
 * never actually blocked, just silently re-synced.
 *
 * B5: `persistCompletedHole` and `handleAutoSave` had no `hole_invalid`
 * branch — see the sibling `continue-round-client.hole-invalid-checkpoint
 * .test.ts` for the full defect description; identical fix here.
 *
 * B4: the recovery dialog rendered only after the tracking-step return, so
 * it could never appear on the setup screen (before a server round exists);
 * `handleDiscardRecovery` cleared a hard-coded `_new_<playerId>` key instead
 * of the snapshot's own `roundId` (which can be a real round id once a
 * round has survived past its first auto-save); and every `setError` call
 * during tracking had no visible surface at all outside an active submit
 * attempt.
 *
 * B7: the round-date input had no upper bound, and `validateBeforeStart`
 * (the one gate both round-start entry points share) never rejected a
 * future date — only the terminal submit path did, by which point a whole
 * round had already been tracked under the wrong day.
 *
 * Source-inspection, matching the sibling continue-round-client tests: the
 * component is a live React tree with heavy dependencies, and these are
 * wiring contracts.
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

describe('New Round — multi-device conflict blocks further writes (B2/B9)', () => {
  it('wires onRoundStale into useRoundStatusSync', () => {
    const hookCall = slice('useRoundStatusSync({', '});');
    expect(hookCall).toContain('onRoundStale');
  });

  it('never adopts the server updated_at from handleRoundSyncConflict outside the beacon self-heal window', () => {
    const handler = slice(
      'const handleRoundSyncConflict = useCallback(',
      '// Check for the freshest emergency save on mount.',
    );
    const pendingBeaconGuardIdx = handler.indexOf('if (pendingBeaconRef.current)');
    const blockCallIdx = handler.lastIndexOf('blockRoundForConflict(');
    const adoptionIdx = handler.indexOf(
      'lastServerUpdatedAtRef.current = stalenessResult.data.currentUpdatedAt',
    );
    expect(pendingBeaconGuardIdx, 'expected a pendingBeaconRef guard (B9)').toBeGreaterThanOrEqual(0);
    expect(blockCallIdx, 'expected the real-conflict path to still block').toBeGreaterThan(pendingBeaconGuardIdx);
    expect(adoptionIdx).toBeGreaterThan(pendingBeaconGuardIdx);
    expect(adoptionIdx).toBeLessThan(blockCallIdx);
  });

  it('marks the beacon-pending window when a background save is actually queued', () => {
    const pageHide = slice('const handlePageHide = () => {', 'const handleVisibilityChange = () => {');
    expect(pageHide).toContain('beaconPartialSave(saveData, savedRoundIdRef.current ?? undefined)');
    expect(pageHide).toContain('pendingBeaconRef.current = true');
  });

  it('refuses to write once blocked, across every write entry point', () => {
    const autoSave = slice('const handleAutoSave = useCallback(async (shots: ShotRecord[], holeIndex: number) => {', 'const handleRoundSubmit = async (');
    const checkpoint = slice('const persistCompletedHole = useCallback(async (', 'const handleHoleComplete = async (');
    const saveForLater = slice('const handleSaveForLater = async () => {', 'const handleDeleteRound = async (');
    const submit = slice('const handleRoundSubmit = async (', 'const handleSaveForLater = async () => {');

    for (const [name, s] of [
      ['handleAutoSave', autoSave],
      ['persistCompletedHole', checkpoint],
      ['handleSaveForLater', saveForLater],
      ['handleRoundSubmit', submit],
    ] as const) {
      expect(s, `${name} must check the conflict-block flag`).toMatch(/roundConflictBlockedRef\.current/);
    }
  });
});

describe('New Round — hole_invalid on the checkpoint and autosave paths (B5)', () => {
  it('persistCompletedHole surfaces the specific message and stops immediately', () => {
    const checkpoint = slice('const persistCompletedHole = useCallback(async (', 'const handleHoleComplete = async (');
    expect(checkpoint).toContain("result.error === 'hole_invalid'");
    const holeInvalidIdx = checkpoint.indexOf("result.error === 'hole_invalid'");
    const genericBreakIdx = checkpoint.indexOf("result.error !== 'busy' && result.error !== 'retry'");
    expect(holeInvalidIdx).toBeLessThan(genericBreakIdx);
    expect(checkpoint.slice(holeInvalidIdx, genericBreakIdx)).toMatch(/return false/);
  });

  it('handleAutoSave surfaces the specific message instead of throwing into the circuit breaker', () => {
    const autoSave = slice('const handleAutoSave = useCallback(async (shots: ShotRecord[], holeIndex: number) => {', 'const handleRoundSubmit = async (');
    // Widened 2026-09-04 from a bare `hole_invalid` check to the shared
    // classifier, which also covers the auth/player-profile refusals that
    // were being retried forever. The ORDERING is the invariant: the
    // unrecoverable branch must come before the generic throw, or the
    // circuit breaker swallows it again.
    expect(autoSave).toContain('isUnrecoverableRoundWriteFailure(result)');
    const unrecoverableIdx = autoSave.indexOf('isUnrecoverableRoundWriteFailure(result)');
    const genericThrowIdx = autoSave.indexOf('Auto-save server error');
    expect(unrecoverableIdx).toBeLessThan(genericThrowIdx);
    expect(autoSave.slice(unrecoverableIdx, genericThrowIdx)).toContain('isAutoSaveStoppedFailure(result)');
  });
});

describe('New Round — recovery dialog, Discard key, and visible tracking-step errors (B4)', () => {
  it('renders the recovery dialog in the setup/holes step, before a server round exists', () => {
    const setupReturn = slice("if (step === 'setup' || step === 'holes') {", 'Submitting overlay stats');
    expect(setupReturn).toContain('{recoveryDialog}');
  });

  it('Discard clears the snapshot\'s OWN key, not a hard-coded new-round key', () => {
    const discard = slice('const handleDiscardRecovery = () => {', 'const handleRestoreRecovery = async () => {');
    expect(discard).not.toMatch(/clearEmergencySave\(null,\s*playerId\)/);
    expect(discard).toMatch(/newRoundRecoveryData(\?\.roundId| &&)/);
  });

  it('the tracking step renders a visible, dismissible error notice', () => {
    const trackingReturn = slice('return (\n    <>\n      {/* Submit banner', '{/* Submit Overlay');
    expect(trackingReturn).toMatch(/role="alert"/);
  });
});

describe('New Round — future round dates (B7)', () => {
  it('caps the date input at today (local day)', () => {
    expect(source).toContain('maxRoundDate');
  });

  it('validateBeforeStart rejects a future round date before persistRoundStart runs', () => {
    const validate = slice('const validateBeforeStart = useCallback((): string | null => {', 'const persistRoundStart = useCallback(async (');
    expect(validate).toMatch(/future/i);
  });
});

describe('New Round — one helper for round-write failures (B6)', () => {
  it('persistRoundStart never shows a bare signal key (busy/retry) verbatim', () => {
    const handler = slice('const persistRoundStart = useCallback(async (', 'const handleSetupSubmit = async (');
    expect(handler).not.toMatch(/setError\(result\.error \|\|/);
    expect(handler).toMatch(/describeRoundWriteFailure\(result\.error\)/);
  });
});
