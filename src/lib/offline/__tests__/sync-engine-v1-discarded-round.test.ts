/**
 * @vitest-environment jsdom
 *
 * Swap audit R-4 / R-10: a failed final submission queued in the v1 store for a
 * round the player then DISCARDED on this device must not sync. The row is
 * gone, so the submit answers `round_missing` and the drain's re-create would
 * bring the discarded round back as a completed one. The drain drops the entry
 * instead; any other entry still drains (sibling test: sync-engine-v1-round-missing).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const submitCalls: Array<string | undefined> = [];
const legacy = vi.hoisted(() => ({
  pending: [] as Array<Record<string, unknown>>,
  deleted: [] as string[],
  synced: [] as string[],
}));

vi.mock('../indexed-db', () => ({
  getPendingRounds: vi.fn(async () => legacy.pending),
  getFailedRounds: vi.fn(async () => []),
  markOfflineRoundSynced: vi.fn(async (id: string) => {
    legacy.synced.push(id);
  }),
  recordOfflineRoundSyncFailure: vi.fn(async () => {}),
  updateRoundSyncStatus: vi.fn(async () => {}),
  deleteOfflineRound: vi.fn(async (id: string) => {
    legacy.deleted.push(id);
  }),
}));
vi.mock('@/app/golf/actions/round-drafts', () => ({
  saveRoundDraft: vi.fn(async () => ({ success: true, data: { roundId: 'unused' } })),
}));
vi.mock('@/app/golf/actions/golf', () => ({
  submitGolfRoundComprehensive: vi.fn(async (_data: unknown, existingRoundId?: string) => {
    submitCalls.push(existingRoundId);
    return existingRoundId
      ? { success: false, error: 'round_missing' }
      : { success: true, data: { roundId: 'new-round-id' } };
  }),
}));

import { getSyncEngine } from '../sync-engine';
import { markRoundDiscarded } from '@/lib/utils/emergency-save';

const DISCARDED = 'a45714a0-62fa-4e9b-bfe5-a25e71ca6bc9';

function entry(id: string) {
  return {
    id,
    playerId: 'player-1',
    serverRoundId: id,
    syncStatus: 'pending',
    syncAttempts: 0,
    draftData: {
      step: 'tracking',
      submissionIntent: 'submit',
      terminalSubmission: { courseName: 'Winchester CC', roundType: 'practice', roundDate: '2026-09-01', holes: [] },
      holes: [],
      completedHoleStats: [],
      currentHoleIndex: 0,
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
  submitCalls.length = 0;
  legacy.deleted.length = 0;
  legacy.synced.length = 0;
  legacy.pending = [entry(DISCARDED)];
});

const drain = () =>
  (getSyncEngine() as unknown as { syncV1Rounds: () => Promise<{ synced: number; failed: number }> }).syncV1Rounds();

describe('SyncEngine v1 drain — a round discarded on this device', () => {
  it('drops the queued submission instead of re-creating the round', async () => {
    markRoundDiscarded(DISCARDED, 'player-1');
    const result = await drain();

    expect(submitCalls).toEqual([]);
    expect(legacy.deleted).toEqual([DISCARDED]);
    expect(legacy.synced).toEqual([]);
    expect(result.synced).toBe(0);
  });

  it('a discard by another player on this device does not drop this player\'s entry', async () => {
    markRoundDiscarded(DISCARDED, 'player-2');
    await drain();

    expect(legacy.deleted).toEqual([]);
    expect(submitCalls[0]).toBe(DISCARDED);
  });
});
