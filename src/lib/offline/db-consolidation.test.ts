/**
 * Regression test for the offline IndexedDB consolidation fix.
 *
 * Bug: two divergent offline databases existed — `golfhelm_offline` (v1,
 * written by saveOfflineRound on failed-submit recovery) and
 * `golfhelm_offline_v2` (read by getOfflineStats, the sync engine, and the
 * pending-count badge). A round stranded in v1 was never counted in the badge
 * and never auto-drained on reconnect.
 *
 * This proves the fix end-to-end through the REAL code paths:
 *   1. A round saved via the v1 saveOfflineRound is reflected in the pending
 *      count that the badge / auto-sync read (getOfflineStats().pendingRounds).
 *   2. The global sync engine drains that v1 round NON-DESTRUCTIVELY (the row
 *      is retained, status flipped to 'synced', dequeued) so a transient
 *      failure can never lose data.
 *
 * jsdom has no IndexedDB, so we install a minimal in-memory fake that supports
 * exactly the operations these modules use (add/put/get/delete/clear, plus
 * index getAll/count/openCursor by a single key value).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The in-memory IndexedDB fake lives in __fixtures__ so retry-failed.test.ts
// can drive the same real storage functions against it.
import {
  installFakeIndexedDB,
  databases,
  type Row,
} from "./__fixtures__/fake-indexeddb";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('offline DB consolidation — v1 rounds count + drain', () => {
  beforeEach(() => {
    databases.clear();
    vi.resetModules();
    installFakeIndexedDB();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a round saved via v1 saveOfflineRound is reflected in getOfflineStats().pendingRounds (the badge/auto-sync read)', async () => {
    const v1 = await import('./indexed-db');
    const shotStorage = await import('./shot-storage');

    // Baseline: v2 has nothing pending.
    const before = await shotStorage.getOfflineStats();
    expect(before.pendingRounds).toBe(0);

    // Simulate a failed-submit recovery write (new-round-client → v1 DB).
    await v1.saveOfflineRound({
      id: 'round-abc',
      playerId: '',
      draftData: { step: 'tracking', submissionIntent: 'submit' },
    });

    // The pending count the badge + auto-sync read MUST now include it.
    const after = await shotStorage.getOfflineStats();
    expect(after.pendingRounds).toBe(1);
  });

  it('getPendingRoundCount returns the count of pending v1 rounds', async () => {
    const v1 = await import('./indexed-db');
    expect(await v1.getPendingRoundCount()).toBe(0);
    await v1.saveOfflineRound({ id: 'r1', playerId: '', draftData: {} });
    await v1.saveOfflineRound({ id: 'r2', playerId: '', draftData: {} });
    expect(await v1.getPendingRoundCount()).toBe(2);
  });

  it('v1 reopens once when versionchange closes the cached DB between open and transaction setup', async () => {
    const v1 = await import('./indexed-db');
    await v1.saveOfflineRound({ id: 'r-closing', playerId: '', draftData: {} });

    const db = databases.get('golfhelm_offline')!;
    db.transactionCalls = 0;
    // First call is openDatabase's liveness probe; second is the real
    // getPendingRoundCount transaction, reproducing the browser race.
    db.failOnTransactionCall = 2;

    await expect(v1.getPendingRoundCount()).resolves.toBe(1);
    expect(db.transactionCalls).toBeGreaterThanOrEqual(3);
  });

  it('v2 pending reads reopen once when the cached DB starts closing after open', async () => {
    const shotStorage = await import('./shot-storage');
    await expect(shotStorage.getPendingShots()).resolves.toEqual([]);

    const db = databases.get('golfhelm_offline_v2')!;
    db.transactionCalls = 0;
    // Cached-connection probe succeeds, then transaction setup races close().
    db.failOnTransactionCall = 2;

    await expect(shotStorage.getPendingShots()).resolves.toEqual([]);
    expect(db.transactionCalls).toBeGreaterThanOrEqual(3);
  });

  it('keeps the newest active-round recovery snapshot outside the sync queue', async () => {
    const shotStorage = await import('./shot-storage');
    const roundId = '00000000-0000-4000-8000-000000000001';
    const playerId = '00000000-0000-4000-8000-000000000099';
    const firstTimestamp = 1_700_000_000_000;
    const secondTimestamp = firstTimestamp + 1;
    const snapshot = (timestamp: number) => ({
      playerId,
      roundId,
      timestamp,
      setupData: {
        courseName: 'Recovery Test', courseCity: '', courseState: '', courseRating: '',
        courseSlope: '', teesPlayed: 'White', roundType: 'practice' as const, roundDate: '2026-08-22',
      },
      holes: [{ number: 1, par: 4, yardage: 400, score: null }],
      completedHoleStats: [],
      inProgressShotsByHole: {
        0: [{
          shotNumber: 1,
          shotType: 'tee' as const,
          clubType: 'driver' as const,
          lieBefore: 'tee' as const,
          distanceToHoleBefore: 400,
          distanceUnitBefore: 'yards' as const,
          result: 'fairway' as const,
          distanceToHoleAfter: 150,
          distanceUnitAfter: 'yards' as const,
          shotDistance: 250,
          isPenalty: false,
        }],
      },
      currentHoleIndex: 0,
    });

    await shotStorage.saveRoundRecoverySnapshot(snapshot(firstTimestamp));
    await shotStorage.saveRoundRecoverySnapshot(snapshot(secondTimestamp));

    expect(await shotStorage.getRoundRecoverySnapshot(roundId, playerId)).toMatchObject({
      roundId,
      timestamp: secondTimestamp,
      data: { inProgressShotsByHole: { 0: [{ shotNumber: 1 }] } },
    });
    expect((await shotStorage.getOfflineStats()).pendingRounds).toBe(0);

    await shotStorage.clearRoundRecoverySnapshotThrough(roundId, playerId, firstTimestamp);
    expect(await shotStorage.getRoundRecoverySnapshot(roundId, playerId)).toMatchObject({ timestamp: secondTimestamp });

    await shotStorage.clearRoundRecoverySnapshotThrough(roundId, playerId, secondTimestamp);
    expect(await shotStorage.getRoundRecoverySnapshot(roundId, playerId)).toBeNull();

    // A browser that wrote the cache before snapshots were player-scoped used
    // only `round:<id>`. Continue Round reaches this path only after its
    // server page verifies the current player owns `roundId`.
    const { playerId: _legacyPlayerId, ...legacyData } = snapshot(secondTimestamp);
    const db = databases.get('golfhelm_offline_v2')!;
    const recoveryStore = db.stores.get('round_recovery_snapshots')!;
    recoveryStore.put({
      key: `round:${roundId}`,
      roundId,
      timestamp: secondTimestamp,
      data: legacyData,
    });

    expect(await shotStorage.getRoundRecoverySnapshot(roundId, playerId)).toBeNull();
    expect(await shotStorage.getRoundRecoverySnapshot(
      roundId,
      playerId,
      { allowLegacyServerSnapshot: true },
    )).toMatchObject({ data: { playerId } });

    await shotStorage.clearRoundRecoverySnapshotThrough(roundId, playerId, secondTimestamp);
    expect(recoveryStore.rows.has(`round:${roundId}`)).toBe(false);
  });

  it('logs an IndexedDB request error instead of the opaque Event wrapper', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const shotStorage = await import('./shot-storage');
    await expect(shotStorage.getPendingShots()).resolves.toEqual([]);

    const db = databases.get('golfhelm_offline_v2')!;
    const requestError = new DOMException(
      'The transaction was aborted, so the request cannot be fulfilled.',
      'AbortError',
    );
    const databaseEvent = {
      target: { error: requestError },
      currentTarget: db,
      isTrusted: true,
      type: 'error',
    };

    db.onerror?.(databaseEvent as never);

    expect(consoleError).toHaveBeenCalledWith('Database error:', requestError);
    expect(consoleError).not.toHaveBeenCalledWith('Database error:', databaseEvent);
  });

  it('markOfflineRoundSynced is non-destructive: row retained, status synced, dequeued (no longer pending)', async () => {
    const v1 = await import('./indexed-db');
    await v1.saveOfflineRound({ id: 'round-xyz', playerId: '', draftData: {} });
    expect(await v1.getPendingRoundCount()).toBe(1);

    await v1.markOfflineRoundSynced('round-xyz', 'server-123');

    // No longer pending...
    expect(await v1.getPendingRoundCount()).toBe(0);
    // ...but the row is NOT deleted (data preserved).
    const db = databases.get('golfhelm_offline')!;
    const row = db.stores.get('offline_rounds')!.rows.get('round-xyz') as Row;
    expect(row).toBeTruthy();
    expect(row.syncStatus).toBe('synced');
    expect(row.serverRoundId).toBe('server-123');
    // Removed from the sync queue.
    expect(db.stores.get('sync_queue')!.rows.has('round-xyz')).toBe(false);
  });

  it('the global sync engine drains a v1 round through saveRoundDraft and counts it', async () => {
    const saveRoundDraft = vi.fn(async () => ({
      success: true as const,
      data: { roundId: 'server-round-1', lastAutoSave: '2026-06-14T00:00:00.000Z' },
    }));
    vi.doMock('@/app/golf/actions/round-drafts', () => ({ saveRoundDraft }));

    const v1 = await import('./indexed-db');
    await v1.saveOfflineRound({
      id: 'round-drain',
      playerId: '',
      serverRoundId: '11111111-1111-1111-1111-111111111111',
      draftData: { step: 'tracking', setupData: { courseName: 'Pebble' } },
    });

    const { getSyncEngine } = await import('./sync-engine');
    const engine = getSyncEngine();
    const result = await engine.syncAll();

    // The v1 round was pushed to the server exactly once.
    expect(saveRoundDraft).toHaveBeenCalledTimes(1);
    expect(saveRoundDraft).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'tracking' }),
      '11111111-1111-1111-1111-111111111111'
    );
    // It is counted in the synced total and drained non-destructively.
    expect(result.syncedRounds).toBeGreaterThanOrEqual(1);
    expect(await v1.getPendingRoundCount()).toBe(0);
    const db = databases.get('golfhelm_offline')!;
    expect(db.stores.get('offline_rounds')!.rows.get('round-drain')).toBeTruthy();
  });

  it('a v1 round whose server push FAILS is recorded non-destructively: kept pending + retriable, attempt counted once', async () => {
    const saveRoundDraft = vi.fn(async () => ({ success: false as const, error: 'server boom' }));
    vi.doMock('@/app/golf/actions/round-drafts', () => ({ saveRoundDraft }));

    const v1 = await import('./indexed-db');
    await v1.saveOfflineRound({
      id: 'round-fail',
      playerId: '',
      draftData: { step: 'tracking', setupData: { courseName: 'Pebble' } },
    });

    const { getSyncEngine } = await import('./sync-engine');
    const result = await getSyncEngine().syncAll();

    // Attempted exactly once — no immediate re-hammering within a single cycle.
    expect(saveRoundDraft).toHaveBeenCalledTimes(1);
    expect(result.failedItems).toBeGreaterThanOrEqual(1);

    // The round is NOT lost and stays retriable (pending), with the attempt counted.
    const db = databases.get('golfhelm_offline')!;
    const row = db.stores.get('offline_rounds')!.rows.get('round-fail') as Row;
    expect(row).toBeTruthy();
    expect(row.syncStatus).toBe('pending');
    expect(row.syncAttempts).toBe(1);
    expect(row.error).toBe('server boom');
    expect(await v1.getPendingRoundCount()).toBe(1);
  });

  it('a v1 round that has exhausted its retry budget is marked failed and NOT re-sent', async () => {
    const saveRoundDraft = vi.fn(async () => ({
      success: true as const,
      data: { roundId: 'srv', lastAutoSave: '2026-06-14T00:00:00.000Z' },
    }));
    vi.doMock('@/app/golf/actions/round-drafts', () => ({ saveRoundDraft }));

    const v1 = await import('./indexed-db');
    await v1.saveOfflineRound({ id: 'round-exhausted', playerId: '', draftData: { step: 'tracking' } });

    // Simulate a round that has already failed the maximum number of times
    // (MAX_RETRY_COUNT = 10), recently (so it is also inside the backoff window).
    const db = databases.get('golfhelm_offline')!;
    const seeded = db.stores.get('offline_rounds')!.rows.get('round-exhausted') as Row;
    seeded.syncAttempts = 10;
    seeded.lastSyncAttempt = Date.now();

    const { getSyncEngine } = await import('./sync-engine');
    await getSyncEngine().syncAll();

    // Budget spent: it must NOT be pushed to the server again...
    expect(saveRoundDraft).not.toHaveBeenCalled();
    // ...and it is surfaced as failed (no longer pending), with the row retained.
    const after = db.stores.get('offline_rounds')!.rows.get('round-exhausted') as Row;
    expect(after).toBeTruthy();
    expect(after.syncStatus).toBe('failed');
    expect(await v1.getPendingRoundCount()).toBe(0);
  });
});
