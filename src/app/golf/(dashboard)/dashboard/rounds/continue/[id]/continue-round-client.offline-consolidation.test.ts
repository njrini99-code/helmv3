/**
 * Continue Round must not reintroduce the retired v1 per-shot sync hook.
 *
 * The dashboard shell already owns the v2 sync engine.  When Continue Round
 * also used `useOfflineSync`, every regular auto-save wrote the same progress
 * to a legacy queue.  Two independent engines then attempted sync work for
 * one round, increasing stale recovery-prompt risk.  The only allowed v1
 * write here is the narrow failed-final-submission recovery fallback.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./continue-round-client.tsx', import.meta.url),
  'utf8',
);

describe('Continue Round offline persistence', () => {
  it('uses the dashboard-owned sync state instead of the legacy per-screen hook', () => {
    expect(source).toContain("from '@/stores/offline-sync-store'");
    expect(source).toContain('useOfflineSyncStatus()');
    expect(source).not.toContain("from '@/hooks/golf/use-offline-sync'");
  });

  it('keeps v1 IndexedDB exclusively for failed final submissions', () => {
    const autoSaveStart = source.indexOf('const handleAutoSave');
    const submitStart = source.indexOf('const handleRoundSubmit');
    const autoSaveSource = source.slice(autoSaveStart, submitStart);

    expect(autoSaveStart).toBeGreaterThanOrEqual(0);
    expect(submitStart).toBeGreaterThan(autoSaveStart);
    expect(autoSaveSource).not.toContain('saveOfflineRound(');
    expect(autoSaveSource).not.toContain('queueShot(');
    expect(source.match(/saveOfflineRound\(/g)).toHaveLength(1);
    expect(source).toContain('const persistFailedSubmission');
  });

  it('captures each entered shot before the deferred network auto-save', () => {
    const saveShotStart = source.indexOf('const handleSaveShot');
    const autoSaveStart = source.indexOf('const handleAutoSave');
    const saveShotSource = source.slice(saveShotStart, autoSaveStart);

    expect(saveShotStart).toBeGreaterThanOrEqual(0);
    expect(autoSaveStart).toBeGreaterThan(saveShotStart);
    expect(saveShotSource).toContain('inProgressShotsByHoleRef.current = nextInProgress');
    expect(saveShotSource).toContain('emergencySave({');
  });

  it('keeps a failed completed-hole checkpoint retryable without reintroducing its shots as in-progress data', () => {
    const completionStart = source.indexOf('const handleHoleComplete');
    const statsUpdateStart = source.indexOf('const handleHoleStatsUpdate');
    const autoSaveStart = source.indexOf('const handleAutoSave');
    const completionSource = source.slice(completionStart, statsUpdateStart);
    const statsAndAutoSaveSource = source.slice(statsUpdateStart, autoSaveStart + 1600);

    expect(completionSource).toContain('pendingHoleCheckpointRef');
    expect(completionSource).toContain('inProgressShotsByHoleRef.current = inProgressAfter');
    expect(completionSource).toContain('return false');
    expect(statsAndAutoSaveSource).toContain('holeStats: HoleStats | null');
    expect(statsAndAutoSaveSource).toContain('delete updatedStats[holeIndex]');
    expect(statsAndAutoSaveSource).toContain('const hasCompletedHole');
  });
});
