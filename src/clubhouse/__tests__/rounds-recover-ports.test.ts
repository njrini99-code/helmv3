/**
 * @vitest-environment jsdom
 *
 * Swap audit F-02: what the recovery screen reads from the device and what its three actions write. The stores and the
 * server actions are stood in for; the emergency save, the discard tombstones and the round-write recovery are the real
 * ones, since the screen's safety is in how they are used together.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  savePartialRound: vi.fn(),
  submitGolfRoundComprehensive: vi.fn(),
  deleteInProgressRound: vi.fn(),
  getPendingRounds: vi.fn(),
  getFailedRounds: vi.fn(),
  deleteOfflineRound: vi.fn(async (_id: string) => {}),
  deleteOfflineRoundThrough: vi.fn(async (_id: string, _through: number) => {}),
  getRoundRecoverySnapshots: vi.fn(),
  deleteRoundRecoverySnapshot: vi.fn(async (_id: string | null | undefined, _player?: string) => {}),
  clearRoundRecoverySnapshotThrough: vi.fn(async (_id: string | null | undefined, _player: string, _through: number) => {}),
  retryFailed: vi.fn(),
}));

vi.mock('@/app/golf/actions/golf', () => ({
  savePartialRound: (...a: unknown[]) => mocks.savePartialRound(...a),
  submitGolfRoundComprehensive: (...a: unknown[]) => mocks.submitGolfRoundComprehensive(...a),
  deleteInProgressRound: (...a: unknown[]) => mocks.deleteInProgressRound(...a),
}));
vi.mock('@/lib/offline/indexed-db', () => ({
  getPendingRounds: () => mocks.getPendingRounds(),
  getFailedRounds: () => mocks.getFailedRounds(),
  deleteOfflineRound: (id: string) => mocks.deleteOfflineRound(id),
  deleteOfflineRoundThrough: (id: string, through: number) => mocks.deleteOfflineRoundThrough(id, through),
}));
vi.mock('@/lib/offline/shot-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/offline/shot-storage')>()),
  getRoundRecoverySnapshots: () => mocks.getRoundRecoverySnapshots(),
  deleteRoundRecoverySnapshot: (id: string | null | undefined, player?: string) => mocks.deleteRoundRecoverySnapshot(id, player),
  clearRoundRecoverySnapshotThrough: (id: string | null | undefined, player: string, through: number) => mocks.clearRoundRecoverySnapshotThrough(id, player, through),
  saveRoundRecoverySnapshot: vi.fn(async () => {}),
}));
vi.mock('@/lib/offline/sync-engine', () => ({ getSyncEngine: () => ({ retryFailed: mocks.retryFailed }) }));

import { wasRoundDiscarded } from '@/lib/utils/emergency-save';
import { LIVE_RECOVER_PORTS } from '../screens/rounds/recover/ports';
import { buildRecoverRounds, scanDevice, type ChDeviceCopy, type ChDeviceDraft, type ChDeviceReaders } from '../screens/rounds/recover/scan';

const ROUND = 'a0000000-0000-4000-8000-000000000001';
const OTHER_ROUND = 'a0000000-0000-4000-8000-000000000002';
const SAVED_AT = 1_790_000_000_000;

const holes = (scored: number) => Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, yardage: 380, score: i < scored ? 4 : null }));
const stats = (scored: number) => Array.from({ length: scored }, (_, i) => ({ holeNumber: i + 1, par: 4, score: 4 }));
const setup = { courseName: 'Finley GC', courseCity: 'Austin', courseState: 'TX', courseRating: '71.2', courseSlope: '128', teesPlayed: 'Blue', roundType: 'practice', roundDate: '2026-10-14' };

/** An emergency save as the round screens write it, for `roundId` (null: a new round's draft). */
function emergencySaveOf(playerId: string, roundId: string | null, over: Record<string, unknown> = {}) {
  return {
    playerId,
    roundId,
    timestamp: SAVED_AT,
    setupData: setup,
    holes: holes(9),
    completedHoleStats: stats(9),
    inProgressShotsByHole: {},
    currentHoleIndex: 9,
    ...over,
  };
}
const lsKey = (playerId: string, roundId: string | null) => `golf_emergency_save_${roundId ?? `new_${playerId}`}`;
function saveLocally(playerId: string, roundId: string | null, over: Record<string, unknown> = {}) {
  localStorage.setItem(lsKey(playerId, roundId), JSON.stringify(emergencySaveOf(playerId, roundId, over)));
}

/** A row of the failed-submit queue (golfhelm_offline). */
function queueRow(playerId: string, over: Record<string, unknown> = {}) {
  return {
    id: 'queued-1',
    playerId,
    draftData: { step: 'tracking', roundId: ROUND, setupData: setup, holes: holes(9), completedHoleStats: stats(9), currentHoleIndex: 9 },
    timestamp: SAVED_AT,
    syncStatus: 'pending',
    syncAttempts: 1,
    ...over,
  };
}
const snapshotOf = (playerId: string, roundId: string | null) => ({ key: `round:${roundId ?? 'new'}:${playerId}`, roundId, timestamp: SAVED_AT, data: emergencySaveOf(playerId, roundId) });

const copyOf = (over: Partial<ChDeviceCopy> & { draft?: Partial<ChDeviceDraft> } = {}): ChDeviceCopy => {
  const { draft, ...rest } = over;
  return {
    id: 'c-1',
    playerId: 'p1',
    source: 'localstorage',
    timestamp: SAVED_AT,
    draftData: { step: 'tracking', setupData: setup as ChDeviceDraft['setupData'], holes: holes(9), completedHoleStats: stats(9) as never, currentHoleIndex: 9, ...draft },
    ...rest,
  };
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.getPendingRounds.mockResolvedValue([]);
  mocks.getFailedRounds.mockResolvedValue([]);
  mocks.getRoundRecoverySnapshots.mockResolvedValue([]);
});
afterEach(() => localStorage.clear());

// ── What the device holds ──

describe('Round recovery: reading the device', () => {
  it('a round saved only on this device is found, from the emergency save alone', async () => {
    saveLocally('p1', null);
    const { rounds, unreadable } = await scanDevice('p1');
    expect(unreadable).toBe(false);
    expect(rounds).toHaveLength(1);
    expect(rounds[0]).toMatchObject({ course: 'Finley GC', type: 'practice', date: '2026-10-14', holesDone: 9, holesTotal: 18, score: 36, roundId: null, queued: false, finished: false });
  });

  it('another player’s rounds are never offered: not from any store, however many hold them', async () => {
    // The same device, signed in as p1, holding p2's round in every place a round can be kept.
    saveLocally('p2', OTHER_ROUND);
    saveLocally('p2', null);
    mocks.getPendingRounds.mockResolvedValue([queueRow('p2', { id: 'p2-pending' })]);
    mocks.getFailedRounds.mockResolvedValue([queueRow('p2', { id: 'p2-failed', syncStatus: 'failed' })]);
    mocks.getRoundRecoverySnapshots.mockResolvedValue([snapshotOf('p2', OTHER_ROUND)]);
    expect((await scanDevice('p1')).rounds).toEqual([]);
    // p1's own round alongside p2's is the only one shown, and p2's still there for p2.
    saveLocally('p1', ROUND);
    const mine = (await scanDevice('p1')).rounds;
    expect(mine.map((r) => r.roundId)).toEqual([ROUND]);
    expect(mine.every((r) => r.copies.every((c) => c.playerId === 'p1'))).toBe(true);
    expect((await scanDevice('p2')).rounds.length).toBeGreaterThan(0);
  });

  it('the failed-submit queue’s rounds are found, pending and failed, and know they can be synced again', async () => {
    mocks.getPendingRounds.mockResolvedValue([queueRow('p1', { id: 'a', draftData: { ...queueRow('p1').draftData, roundId: ROUND } })]);
    mocks.getFailedRounds.mockResolvedValue([
      queueRow('p1', { id: 'b', syncStatus: 'failed', error: 'That save did not go through.', draftData: { ...queueRow('p1').draftData, roundId: OTHER_ROUND } }),
    ]);
    const { rounds } = await scanDevice('p1');
    expect(rounds.map((r) => ({ id: r.roundId, queued: r.queued, failed: r.syncFailed, why: r.syncError }))).toEqual(
      expect.arrayContaining([
        { id: ROUND, queued: true, failed: false, why: null },
        { id: OTHER_ROUND, queued: true, failed: true, why: 'That save did not go through.' },
      ]),
    );
  });

  it('one round held in every store is one round that remembers every copy, the newest first', async () => {
    saveLocally('p1', ROUND, { timestamp: SAVED_AT - 2000 });
    mocks.getPendingRounds.mockResolvedValue([queueRow('p1', { timestamp: SAVED_AT })]);
    mocks.getRoundRecoverySnapshots.mockResolvedValue([{ ...snapshotOf('p1', ROUND), timestamp: SAVED_AT - 1000, data: emergencySaveOf('p1', ROUND, { timestamp: SAVED_AT - 1000 }) }]);
    const { rounds } = await scanDevice('p1');
    expect(rounds).toHaveLength(1);
    expect(rounds[0]!.copies.map((c) => c.source)).toEqual(['modern-indexeddb', 'recovery-cache', 'localstorage']);
    expect(rounds[0]!.primary.source).toBe('modern-indexeddb');
    expect(rounds[0]!.savedAt).toBe(SAVED_AT);
  });

  it('a copy with nothing a player did in it is not offered; a first-hole shot is', async () => {
    saveLocally('p1', OTHER_ROUND, { completedHoleStats: [], inProgressShotsByHole: {} });
    expect((await scanDevice('p1')).rounds).toEqual([]);
    saveLocally('p1', OTHER_ROUND, { completedHoleStats: [], inProgressShotsByHole: { 0: [{ shotNumber: 1 }] } });
    const { rounds } = await scanDevice('p1');
    expect(rounds).toHaveLength(1);
    expect(rounds[0]).toMatchObject({ holesDone: 0, score: null });
  });

  it('rounds are newest first', async () => {
    saveLocally('p1', ROUND, { timestamp: SAVED_AT - 5000 });
    saveLocally('p1', OTHER_ROUND, { timestamp: SAVED_AT });
    expect((await scanDevice('p1')).rounds.map((r) => r.roundId)).toEqual([OTHER_ROUND, ROUND]);
  });

  it('a new round’s draft has no server round: its stand-in id is never treated as one', () => {
    const [round] = buildRecoverRounds([copyOf({ id: 'localStorage_new_p1', storageId: 'new_p1', draft: { roundId: 'new_p1' } })], 'p1');
    expect(round!.roundId).toBeNull();
  });

  it('a record with no setup is shown as an unknown course, never crashes the scan', async () => {
    localStorage.setItem(lsKey('p1', ROUND), JSON.stringify({ ...emergencySaveOf('p1', ROUND), setupData: undefined, holes: undefined }));
    const { rounds } = await scanDevice('p1');
    expect(rounds[0]).toMatchObject({ course: 'Unknown course', holesDone: 9, holesTotal: null });
  });

  it('a store that fails is a store with nothing in it, and "unreadable" is said only when nothing at all could be read', async () => {
    const failing: ChDeviceReaders = {
      recoveryCache: () => Promise.reject(new Error('x')),
      queue: () => Promise.reject(new Error('x')),
      legacy: () => Promise.reject(new Error('x')),
      emergencySaves: () => [],
    };
    expect(await scanDevice('p1', failing)).toEqual({ rounds: [], unreadable: true });
    // The emergency save needs no database: one round found is a scan that worked.
    saveLocally('p1', ROUND);
    const live = await scanDevice('p1', { ...failing, emergencySaves: () => buildRecoverRoundsCopies() });
    expect(live.unreadable).toBe(false);
    expect(live.rounds).toHaveLength(1);
    // One store readable and empty is "nothing to recover", not unreadable.
    expect(await scanDevice('p1', { ...failing, recoveryCache: async () => [] })).toEqual({ rounds: [], unreadable: false });
  });
});

function buildRecoverRoundsCopies(): ChDeviceCopy[] {
  return [copyOf({ id: `localStorage_${ROUND}`, storageId: ROUND, draft: { roundId: ROUND } })];
}

// ── Retry sync ──

describe('Round recovery: Retry sync (the engine)', () => {
  it('asks the sync engine to retry, and reports what it sent', async () => {
    mocks.retryFailed.mockResolvedValue({ success: true, syncedRounds: 2, syncedHoles: 0, syncedShots: 0, failedItems: 0, errors: [] });
    expect(await LIVE_RECOVER_PORTS.retrySync()).toEqual({ success: true, data: { synced: 2, declined: false } });
    expect(mocks.retryFailed).toHaveBeenCalledTimes(1);
  });

  it('a pass already running is declined, not failed', async () => {
    mocks.retryFailed.mockResolvedValue({ success: false, syncedRounds: 0, syncedHoles: 0, syncedShots: 0, failedItems: 0, errors: [], declined: 'already-running' });
    expect(await LIVE_RECOVER_PORTS.retrySync()).toEqual({ success: true, data: { synced: 0, declined: true } });
  });

  it('a pass that failed is a failure with the engine’s own sentence', async () => {
    mocks.retryFailed.mockResolvedValue({ success: false, syncedRounds: 0, syncedHoles: 0, syncedShots: 0, failedItems: 1, errors: ['That save did not go through.'] });
    expect(await LIVE_RECOVER_PORTS.retrySync()).toEqual({ success: false, error: 'That save did not go through.' });
  });

  it('an engine that throws is a failure, not a crash', async () => {
    mocks.retryFailed.mockRejectedValue(new Error('boom'));
    expect(await LIVE_RECOVER_PORTS.retrySync()).toEqual({ success: false, error: 'boom' });
  });
});

// ── Discard ──

/** The round as the screen holds it: read from the device as the live scan does. */
async function roundOnDevice(playerId = 'p1') {
  const { rounds } = await scanDevice(playerId);
  expect(rounds).toHaveLength(1);
  return rounds[0]!;
}

describe('Round recovery: Discard (the engine’s discard)', () => {
  it('a round only on this device sends nothing to the server, clears every place it is kept, and is marked discarded', async () => {
    saveLocally('p1', null);
    mocks.getRoundRecoverySnapshots.mockResolvedValue([snapshotOf('p1', null)]);
    mocks.getPendingRounds.mockResolvedValue([queueRow('p1', { id: 'queued-new', draftData: { ...queueRow('p1').draftData, roundId: undefined } })]);
    const round = await roundOnDevice();
    expect(round.roundId).toBeNull();
    expect(round.copies).toHaveLength(3);

    expect(await LIVE_RECOVER_PORTS.discard(round, 'p1')).toEqual({ success: true });

    expect(mocks.deleteInProgressRound).not.toHaveBeenCalled();
    expect(localStorage.getItem(lsKey('p1', null))).toBeNull();
    expect(mocks.deleteOfflineRound).toHaveBeenCalledWith('queued-new');
    expect(mocks.deleteRoundRecoverySnapshot).toHaveBeenCalledWith(null, 'p1');
    // The queue's drain skips a round marked under `serverRoundId ?? id`.
    expect(wasRoundDiscarded('queued-new', 'p1')).toBe(true);
    expect(wasRoundDiscarded('queued-new', 'p2')).toBe(false);
  });

  it('a round the server holds is deleted there first, then on the device, with the tombstone the engines write', async () => {
    saveLocally('p1', ROUND);
    mocks.getFailedRounds.mockResolvedValue([queueRow('p1', { id: 'queued-1', syncStatus: 'failed' })]);
    mocks.deleteInProgressRound.mockResolvedValue({ success: true, data: undefined });
    const round = await roundOnDevice();
    expect(round.roundId).toBe(ROUND);

    expect(await LIVE_RECOVER_PORTS.discard(round, 'p1')).toMatchObject({ success: true });

    expect(mocks.deleteInProgressRound).toHaveBeenCalledWith(ROUND);
    expect(mocks.deleteInProgressRound.mock.invocationCallOrder[0]!).toBeLessThan(mocks.deleteOfflineRound.mock.invocationCallOrder[0]!);
    expect(localStorage.getItem(lsKey('p1', ROUND))).toBeNull();
    expect(mocks.deleteOfflineRound).toHaveBeenCalledWith('queued-1');
    expect(wasRoundDiscarded(ROUND, 'p1')).toBe(true);
  });

  it('a refusal that is not "already finished" clears nothing and marks nothing, so the round is still there to try again', async () => {
    saveLocally('p1', ROUND);
    mocks.deleteInProgressRound.mockResolvedValue({ success: false, error: 'Failed to delete round' });
    const round = await roundOnDevice();

    expect(await LIVE_RECOVER_PORTS.discard(round, 'p1')).toMatchObject({ success: false, error: 'Failed to delete round' });

    expect(localStorage.getItem(lsKey('p1', ROUND))).not.toBeNull();
    expect(mocks.deleteOfflineRound).not.toHaveBeenCalled();
    expect(wasRoundDiscarded(ROUND, 'p1')).toBe(false);
  });

  it('a round the server already finished refuses to be deleted and is left alone there; the stale device copies still go', async () => {
    saveLocally('p1', ROUND);
    mocks.deleteInProgressRound.mockResolvedValue({ success: false, error: 'This round can no longer be discarded — it looks like it was already finished or removed.' });
    const round = await roundOnDevice();

    expect(await LIVE_RECOVER_PORTS.discard(round, 'p1')).toEqual({ success: true });

    expect(localStorage.getItem(lsKey('p1', ROUND))).toBeNull();
    expect(wasRoundDiscarded(ROUND, 'p1')).toBe(true);
  });

  it('a copy that cannot be deleted is a failed discard, not a silent one', async () => {
    mocks.getPendingRounds.mockResolvedValue([queueRow('p1', { id: 'queued-1', draftData: { ...queueRow('p1').draftData, roundId: undefined } })]);
    mocks.deleteOfflineRound.mockRejectedValueOnce(new Error('Failed to delete offline round'));
    const round = await roundOnDevice();
    expect(await LIVE_RECOVER_PORTS.discard(round, 'p1')).toEqual({ success: false, error: 'Failed to delete offline round' });
  });

  it('never touches another player’s copy of the same device', async () => {
    saveLocally('p1', null);
    saveLocally('p2', null);
    const round = await roundOnDevice('p1');
    await LIVE_RECOVER_PORTS.discard(round, 'p1');
    expect(localStorage.getItem(lsKey('p1', null))).toBeNull();
    expect(localStorage.getItem(lsKey('p2', null))).not.toBeNull();
  });

  it('an old queued round with no round id leaves the player’s current new-round draft alone', async () => {
    // A finished round that never reached the server is queued as `pending_submit_<time>`, with no round id. Its
    // emergency save was overwritten when the player started another round, whose draft now holds the null key.
    mocks.getFailedRounds.mockResolvedValue([queueRow('p1', { id: 'pending_submit_1', syncStatus: 'failed', draftData: { ...queueRow('p1').draftData, roundId: undefined } })]);
    saveLocally('p1', null, { setupData: { ...setup, courseName: 'Other GC' }, timestamp: SAVED_AT + 60_000 });
    mocks.getRoundRecoverySnapshots.mockResolvedValue([{ ...snapshotOf('p1', null), data: emergencySaveOf('p1', null, { setupData: { ...setup, courseName: 'Other GC' } }) }]);
    const { rounds } = await scanDevice('p1');
    const old = rounds.find((r) => r.course === 'Finley GC')!;
    expect(rounds).toHaveLength(2);
    expect(old.copies.map((c) => c.id)).toEqual(['pending_submit_1']);

    expect(await LIVE_RECOVER_PORTS.discard(old, 'p1')).toEqual({ success: true });

    expect(mocks.deleteOfflineRound).toHaveBeenCalledWith('pending_submit_1');
    expect(wasRoundDiscarded('pending_submit_1', 'p1')).toBe(true);
    // The other round's draft and its journal entry are still there, and still offered.
    expect(localStorage.getItem(lsKey('p1', null))).not.toBeNull();
    expect(mocks.deleteRoundRecoverySnapshot).not.toHaveBeenCalled();
    mocks.getFailedRounds.mockResolvedValue([]); // the queue's row is gone, as its delete said
    expect((await scanDevice('p1')).rounds.map((r) => r.course)).toEqual(['Other GC']);
  });
});

// ── Restore ──

const landing = (roundId: string) => ({ success: true, data: { roundId } });

describe('Round recovery: Restore (Fairway’s recovery, ported)', () => {
  it('a copy that never reached the server is written as an unfinished round, with reuse allowed, and opened to continue', async () => {
    saveLocally('p1', null);
    mocks.savePartialRound.mockResolvedValue(landing(ROUND));
    const round = await roundOnDevice();

    const result = await LIVE_RECOVER_PORTS.resume(round, 'p1');

    expect(result).toEqual({ success: true, data: { href: `/golf/dashboard/rounds/continue/${ROUND}`, done: 'Round progress restored' } });
    expect(mocks.savePartialRound).toHaveBeenCalledTimes(1);
    const [data, id, options] = mocks.savePartialRound.mock.calls[0]!;
    // A new round's draft is keyed `new_<player>`: that names no round, so no id goes to the server.
    expect(id).toBeUndefined();
    expect(options).toEqual({ allowReuse: true });
    expect(data).toMatchObject({ courseName: 'Finley GC', roundType: 'practice', roundDate: '2026-10-14', holesToPlay: 18, currentHole: 10, courseRating: 71.2, courseSlope: 128 });
    expect(data.holes).toHaveLength(9);
    expect(mocks.submitGolfRoundComprehensive).not.toHaveBeenCalled();
  });

  it('a copy of a server round restores onto that round', async () => {
    saveLocally('p1', ROUND);
    mocks.savePartialRound.mockResolvedValue(landing(ROUND));
    await LIVE_RECOVER_PORTS.resume(await roundOnDevice(), 'p1');
    expect(mocks.savePartialRound.mock.calls[0]![1]).toBe(ROUND);
  });

  it('the device copies go only after the server confirms, and only up to what it confirmed', async () => {
    saveLocally('p1', ROUND);
    mocks.getPendingRounds.mockResolvedValue([queueRow('p1', { id: 'queued-1' })]);
    mocks.getRoundRecoverySnapshots.mockResolvedValue([snapshotOf('p1', ROUND)]);
    const round = await roundOnDevice();
    mocks.savePartialRound.mockImplementation(async () => {
      // A pagehide save written while the request was in flight is newer than what the server acknowledged.
      saveLocally('p1', ROUND, { timestamp: SAVED_AT + 5000 });
      return landing(ROUND);
    });

    await LIVE_RECOVER_PORTS.resume(round, 'p1');

    expect(localStorage.getItem(lsKey('p1', ROUND))).not.toBeNull();
    expect(mocks.deleteOfflineRoundThrough).toHaveBeenCalledWith('queued-1', SAVED_AT);
    expect(mocks.clearRoundRecoverySnapshotThrough).toHaveBeenCalledWith(ROUND, 'p1', SAVED_AT);
  });

  it('with the server’s confirmation and nothing newer, every copy of the round is cleared', async () => {
    saveLocally('p1', ROUND);
    mocks.savePartialRound.mockResolvedValue(landing(ROUND));
    await LIVE_RECOVER_PORTS.resume(await roundOnDevice(), 'p1');
    expect(localStorage.getItem(lsKey('p1', ROUND))).toBeNull();
  });

  it('a write the server refuses keeps every copy and says why in words, never a bare key', async () => {
    saveLocally('p1', ROUND);
    mocks.savePartialRound.mockResolvedValue({ success: false, error: 'busy' });
    const result = await LIVE_RECOVER_PORTS.resume(await roundOnDevice(), 'p1');
    expect(result).toEqual({ success: false, error: 'Another save for this round is just finishing. Try again in a moment.' });
    expect(localStorage.getItem(lsKey('p1', ROUND))).not.toBeNull();
  });

  it('a round the server no longer has is re-created from the copy, with reuse only on the first call', async () => {
    saveLocally('p1', ROUND);
    mocks.savePartialRound.mockResolvedValueOnce({ success: false, error: 'round_missing' }).mockResolvedValueOnce(landing(OTHER_ROUND));
    const result = await LIVE_RECOVER_PORTS.resume(await roundOnDevice(), 'p1');
    expect(result).toMatchObject({ success: true, data: { href: `/golf/dashboard/rounds/continue/${OTHER_ROUND}` } });
    expect(mocks.savePartialRound.mock.calls[0]!.slice(1)).toEqual([ROUND, { allowReuse: true }]);
    expect(mocks.savePartialRound.mock.calls[1]!.slice(1)).toEqual([undefined]);
  });

  describe('a finished round whose submit failed', () => {
    const terminal = { courseName: 'Finley GC', roundType: 'practice', roundDate: '2026-10-14', holes: stats(18) };
    function failedSubmit() {
      mocks.getFailedRounds.mockResolvedValue([
        queueRow('p1', {
          id: 'queued-1',
          syncStatus: 'failed',
          serverRoundId: ROUND,
          draftData: { ...queueRow('p1').draftData, holes: holes(18), completedHoleStats: stats(18), submissionIntent: 'submit', terminalSubmission: terminal },
        }),
      ]);
    }

    it('is submitted with its exact payload, on its own round, and opens its review', async () => {
      failedSubmit();
      mocks.submitGolfRoundComprehensive.mockResolvedValue(landing(ROUND));
      const round = await roundOnDevice();
      expect(round.finished).toBe(true);

      const result = await LIVE_RECOVER_PORTS.resume(round, 'p1');

      expect(result).toEqual({ success: true, data: { href: `/golf/dashboard/rounds/${ROUND}`, done: 'Round submitted' } });
      expect(mocks.submitGolfRoundComprehensive).toHaveBeenCalledWith(terminal, ROUND, undefined);
      expect(mocks.savePartialRound).not.toHaveBeenCalled();
      expect(mocks.deleteOfflineRoundThrough).toHaveBeenCalledWith('queued-1', SAVED_AT);
    });

    it('already submitted on the server opens the saved round and clears the copy', async () => {
      failedSubmit();
      mocks.submitGolfRoundComprehensive.mockResolvedValue({ success: false, error: 'This round has already been completed.' });
      const result = await LIVE_RECOVER_PORTS.resume(await roundOnDevice(), 'p1');
      expect(result).toEqual({ success: true, data: { href: `/golf/dashboard/rounds/${ROUND}`, done: 'This round was already submitted' } });
      expect(mocks.deleteOfflineRoundThrough).toHaveBeenCalledWith('queued-1', SAVED_AT);
    });

    it('a closed qualifier is not "already submitted": it fails, keeps the copy, and says so', async () => {
      failedSubmit();
      mocks.submitGolfRoundComprehensive.mockResolvedValue({ success: false, error: 'This qualifier has already been completed. Rounds can no longer be submitted.' });
      const result = await LIVE_RECOVER_PORTS.resume(await roundOnDevice(), 'p1');
      expect(result).toEqual({ success: false, error: 'This qualifier has already been completed. Rounds can no longer be submitted.' });
      expect(mocks.deleteOfflineRoundThrough).not.toHaveBeenCalled();
    });
  });

  it('restoring an old queued round with no round id leaves an older new-round draft of another round in place', async () => {
    mocks.getPendingRounds.mockResolvedValue([queueRow('p1', { id: 'pending_submit_1', draftData: { ...queueRow('p1').draftData, roundId: undefined } })]);
    // Older than the copy being restored, so a clear "through" its time would take it if the key were not left alone.
    saveLocally('p1', null, { setupData: { ...setup, courseName: 'Other GC' }, timestamp: SAVED_AT - 60_000 });
    mocks.savePartialRound.mockResolvedValue(landing(ROUND));
    const old = (await scanDevice('p1')).rounds.find((r) => r.course === 'Finley GC')!;

    expect((await LIVE_RECOVER_PORTS.resume(old, 'p1')).success).toBe(true);

    expect(mocks.deleteOfflineRoundThrough).toHaveBeenCalledWith('pending_submit_1', SAVED_AT);
    expect(localStorage.getItem(lsKey('p1', null))).not.toBeNull();
  });

  it('a thrown write is a failure with the copy kept, not an unhandled rejection', async () => {
    saveLocally('p1', ROUND);
    mocks.savePartialRound.mockRejectedValue(new Error('Network down'));
    expect(await LIVE_RECOVER_PORTS.resume(await roundOnDevice(), 'p1')).toEqual({ success: false, error: 'Network down' });
    expect(localStorage.getItem(lsKey('p1', ROUND))).not.toBeNull();
  });
});
