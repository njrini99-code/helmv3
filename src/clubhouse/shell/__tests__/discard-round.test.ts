import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  deleteInProgressRound: vi.fn(),
  deleteOfflineRound: vi.fn(async () => {}),
  clearEmergencySave: vi.fn(),
  markRoundDiscarded: vi.fn(),
}));
vi.mock('@/app/golf/actions/round-partial', () => ({ deleteInProgressRound: m.deleteInProgressRound }));
vi.mock('@/lib/offline/indexed-db', () => ({ deleteOfflineRound: m.deleteOfflineRound }));
vi.mock('@/lib/utils/emergency-save', () => ({ clearEmergencySave: m.clearEmergencySave, markRoundDiscarded: m.markRoundDiscarded }));

import { discardRoundInProgress } from '../discard-round';

// Owner, 2026-10-31: the Resume bar lets you discard the round. It must leave nothing on the device that could bring
// the round back, and must clear nothing when the server kept it.
describe('discardRoundInProgress', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes the round, then clears this device’s copy, marks it discarded and drops its queued submit', async () => {
    m.deleteInProgressRound.mockResolvedValue({ success: true });
    await expect(discardRoundInProgress('r1', 'p1')).resolves.toEqual({ ok: true });
    expect(m.deleteInProgressRound).toHaveBeenCalledWith('r1');
    expect(m.clearEmergencySave).toHaveBeenCalledWith('r1', 'p1');
    expect(m.markRoundDiscarded).toHaveBeenCalledWith('r1', 'p1');
    await vi.waitFor(() => expect(m.deleteOfflineRound).toHaveBeenCalledWith('r1'));
  });

  it('keeps everything local and returns the action’s message when the server refuses', async () => {
    m.deleteInProgressRound.mockResolvedValue({ success: false, error: 'This round can no longer be discarded.' });
    await expect(discardRoundInProgress('r1', 'p1')).resolves.toEqual({ ok: false, error: 'This round can no longer be discarded.' });
    expect(m.clearEmergencySave).not.toHaveBeenCalled();
    expect(m.markRoundDiscarded).not.toHaveBeenCalled();
  });

  it('keeps everything local when the request fails', async () => {
    m.deleteInProgressRound.mockRejectedValue(new Error('offline'));
    await expect(discardRoundInProgress('r1', 'p1')).resolves.toEqual({ ok: false, error: null });
    expect(m.clearEmergencySave).not.toHaveBeenCalled();
  });
});
