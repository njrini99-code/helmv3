/**
 * New Round must not make a recorded shot wait for the deferred network timer.
 * A durable server parent is created before tracking begins; this test protects
 * the additional local recovery boundary for app-switch, crash, and offline
 * interruptions between a shot tap and the next network save.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./new-round-client.tsx', import.meta.url),
  'utf8',
);

describe('New Round shot recovery boundary', () => {
  it('creates a server round before the player enters tracking', () => {
    const startSource = source.slice(
      source.indexOf('const persistRoundStart'),
      source.indexOf('const handleSetupSubmit'),
    );

    expect(startSource).toContain('await savePartialRound(initialData)');
    expect(startSource).toContain('savedRoundIdRef.current = result.data.roundId');
  });

  it('writes each newly entered shot to the synchronous recovery snapshot', () => {
    const saveShotStart = source.indexOf('const handleSaveShot');
    const autoSaveStart = source.indexOf('const handleAutoSave');
    const saveShotSource = source.slice(saveShotStart, autoSaveStart);

    expect(saveShotStart).toBeGreaterThanOrEqual(0);
    expect(autoSaveStart).toBeGreaterThan(saveShotStart);
    expect(saveShotSource).toContain('inProgressShotsByHoleRef.current = nextInProgress');
    expect(saveShotSource).toContain('emergencySave({');
  });

  it('clears only the snapshot version confirmed by the server', () => {
    const autoSaveStart = source.indexOf('const handleAutoSave');
    const submitStart = source.indexOf('const handleRoundSubmit');
    const autoSaveSource = source.slice(autoSaveStart, submitStart);

    expect(autoSaveSource).toContain('clearEmergencySaveThrough(');
    expect(autoSaveSource).toContain('emergencyTimestamp');
  });

  it('restores an interrupted snapshot through the server before opening Continue Round', () => {
    const restoreStart = source.indexOf('const handleRestoreRecovery');
    const resetStart = source.indexOf('const handleConfirmBackToSetup');
    const restoreSource = source.slice(restoreStart, resetStart);

    expect(restoreStart).toBeGreaterThanOrEqual(0);
    // Still a server write before Continue Round opens — now through the
    // round_missing helper so a dead snapshot id is re-created, not echoed.
    expect(restoreSource).toContain('await writeRoundRecreatingIfMissing(');
    expect(restoreSource).toContain('recoveryData,');
    expect(restoreSource).toContain('router.push(`/golf/dashboard/rounds/continue/${result.data.roundId}`)');
  });

  it('keeps a completed-hole retry distinct from a deliberate re-edit and reopens a scorecard slot correctly', () => {
    const completionStart = source.indexOf('const handleHoleComplete');
    const statsUpdateStart = source.indexOf('const handleHoleStatsUpdate');
    const autoSaveStart = source.indexOf('const handleAutoSave');
    const completionSource = source.slice(completionStart, statsUpdateStart);
    const statsAndAutoSaveSource = source.slice(statsUpdateStart, autoSaveStart + 1800);

    expect(completionSource).toContain('pendingHoleCheckpointRef');
    expect(completionSource).toContain('inProgressShotsByHoleRef.current = inProgressAfter');
    expect(completionSource).toContain('return false');
    expect(statsAndAutoSaveSource).toContain('holeStats: HoleStats | null');
    expect(statsAndAutoSaveSource).toContain('delete updatedStats[holeIndex]');
    expect(statsAndAutoSaveSource).toContain('const hasCompletedHole');
  });
});

/**
 * Review of 6a7577c71, findings P1 and P5 on the New Round screen.
 *
 * P1: `submitGolfRoundComprehensive` answered `round_missing` (it had proved
 * the row was gone), the client threw it, `isRecoverableRoundSubmitError`
 * matched neither list, and the overlay printed the literal key. P5: the
 * auto-save re-create branches cleared the device snapshot through the NEW
 * id while it had been written under the OLD one, leaving a dead-id copy that
 * New Round later offered as recoverable.
 */
describe('New Round — round_missing recovery', () => {
  it('submit re-creates from the same terminal payload through the shared helper (P1)', () => {
    const submitStart = source.indexOf('const handleRoundSubmit');
    const saveForLaterStart = source.indexOf('const handleSaveForLater');
    const submitSource = source.slice(submitStart, saveForLaterStart);

    expect(submitSource).toContain('writeRoundRecreatingIfMissing(');
    expect(submitSource).toContain('submitGolfRoundComprehensive,');
    expect(submitSource).not.toContain('await submitGolfRoundComprehensive(roundData, savedRoundIdRef.current ?? undefined)');
  });

  it('every auto-save re-create migrates the snapshot off the dead id (P5)', () => {
    const autoSaveStart = source.indexOf('const handleAutoSave');
    const submitStart = source.indexOf('const handleRoundSubmit');
    const autoSaveSource = source.slice(autoSaveStart, submitStart);
    const checkpointStart = source.indexOf('const persistCompletedHole');
    const checkpointSource = source.slice(checkpointStart, source.indexOf('const handleHoleComplete'));

    expect(autoSaveSource).toContain('migrateEmergencySave(');
    expect(checkpointSource).toContain('migrateEmergencySave(');
  });

  it('restoring a device snapshot re-creates when its round id is dead instead of showing the key', () => {
    const restoreStart = source.indexOf('const handleRestoreRecovery');
    const resetStart = source.indexOf('const handleConfirmBackToSetup');
    const restoreSource = source.slice(restoreStart, resetStart);

    expect(restoreSource).toContain('writeRoundRecreatingIfMissing(');
    expect(restoreSource).toContain('savePartialRound,');
  });
});
