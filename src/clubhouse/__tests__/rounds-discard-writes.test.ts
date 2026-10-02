/**
 * @vitest-environment jsdom
 *
 * Swap audit R-4 / R-10: the Library's Discard marks the round discarded on this device, so a round screen open in
 * another tab does not re-create it on its next save, and drops any failed-submit entry queued for it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ deleteInProgressRound: vi.fn(), deleteOfflineRound: vi.fn(async () => {}) }));
vi.mock('@/app/golf/actions/golf', () => ({ deleteInProgressRound: (...a: unknown[]) => mocks.deleteInProgressRound(...a) }));
vi.mock('@/lib/offline/indexed-db', () => ({ deleteOfflineRound: (...a: unknown[]) => mocks.deleteOfflineRound(...(a as [])) }));

import { wasRoundDiscarded } from '@/lib/utils/emergency-save';
import { LIVE_ROUNDS_WRITES } from '../screens/rounds/writes';

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe('Rounds library discard', () => {
  it('marks the round discarded on this device and drops its queued entry', async () => {
    mocks.deleteInProgressRound.mockResolvedValue({ success: true, data: undefined });
    await LIVE_ROUNDS_WRITES.discard('round-1', 'player-1');

    expect(wasRoundDiscarded('round-1', 'player-1')).toBe(true);
    expect(mocks.deleteOfflineRound).toHaveBeenCalledWith('round-1');
  });

  it('marks nothing when the discard was refused', async () => {
    mocks.deleteInProgressRound.mockResolvedValue({ success: false, error: 'This round can no longer be discarded.' });
    await LIVE_ROUNDS_WRITES.discard('round-1', 'player-1');

    expect(wasRoundDiscarded('round-1', 'player-1')).toBe(false);
    expect(mocks.deleteOfflineRound).not.toHaveBeenCalled();
  });
});
