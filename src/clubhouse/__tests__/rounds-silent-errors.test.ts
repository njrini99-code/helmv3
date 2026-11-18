/**
 * @vitest-environment jsdom
 *
 * Silent errors (2026-11-17, screens-b): the round paths that used to swallow a failure now report it, and nothing the
 * player sees changes. A device store that fails to read is still a store with nothing in it, but it is reported; the
 * old database is not, since it rejects on every device that never had it. A queued copy the Library's discard could
 * not drop is reported too.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  chReport: vi.fn(),
  deleteInProgressRound: vi.fn(),
  deleteOfflineRound: vi.fn(async (_id: string) => {}),
}));
vi.mock('../lib/track', () => ({ chReport: mocks.chReport, chTrail: vi.fn() }));
vi.mock('@/app/golf/actions/round-partial', () => ({ deleteInProgressRound: (...a: unknown[]) => mocks.deleteInProgressRound(...a) }));
vi.mock('@/lib/offline/indexed-db', () => ({
  deleteOfflineRound: (id: string) => mocks.deleteOfflineRound(id),
  getPendingRounds: async () => [],
  getFailedRounds: async () => [],
}));

import { scanDevice, type ChDeviceReaders } from '../screens/rounds/recover/scan';
import { LIVE_ROUNDS_WRITES } from '../screens/rounds/writes';

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

const reading = (over: Partial<ChDeviceReaders>): ChDeviceReaders => ({
  recoveryCache: async () => [],
  queue: async () => [],
  legacy: async () => [],
  emergencySaves: () => [],
  ...over,
});

describe('round recovery scan', () => {
  it('reports a failed recovery cache or queue read at high severity, and still reads the store as empty', async () => {
    const cacheErr = new Error('cache read failed');
    const queueErr = new Error('queue read failed');
    const scan = await scanDevice('p1', reading({ recoveryCache: () => Promise.reject(cacheErr), queue: () => Promise.reject(queueErr) }));

    expect(scan).toEqual({ rounds: [], unreadable: false });
    expect(mocks.chReport).toHaveBeenCalledWith(cacheErr, expect.objectContaining({ surface: 'rounds.recover', action: 'rounds.recover.readCache', severity: 'high' }));
    expect(mocks.chReport).toHaveBeenCalledWith(queueErr, expect.objectContaining({ surface: 'rounds.recover', action: 'rounds.recover.readQueue', severity: 'high' }));
  });

  it('does not report the old database failing to open (it is missing on most devices)', async () => {
    await scanDevice('p1', reading({ legacy: () => Promise.reject(new Error('Failed to open IndexedDB')) }));
    expect(mocks.chReport).not.toHaveBeenCalled();
  });
});

describe('Rounds library discard', () => {
  it('reports a queued copy it could not drop, and the discard still succeeds', async () => {
    mocks.deleteInProgressRound.mockResolvedValue({ success: true, data: undefined });
    const err = new Error('idb write failed');
    mocks.deleteOfflineRound.mockRejectedValueOnce(err);

    const res = await LIVE_ROUNDS_WRITES.discard('round-1', 'player-1');
    expect(res.success).toBe(true);
    await vi.waitFor(() => expect(mocks.chReport).toHaveBeenCalledWith(err, expect.objectContaining({ surface: 'rounds.library', action: 'rounds.discard.deleteOffline', severity: 'medium' })));
  });
});
