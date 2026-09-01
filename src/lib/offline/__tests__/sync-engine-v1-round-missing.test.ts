/**
 * The v1 drain must not retry a dead round id forever.
 *
 * `syncV1Rounds` re-submits a failed final submission with
 * `submitGolfRoundComprehensive(terminalSubmission, round.serverRoundId)`.
 * When the server answers `round_missing` it has already PROVED there is no
 * row for that id (golf.ts, submit existing-round branch), so every later
 * cycle with the same id fails the same way, burns a retry-budget slot, and
 * writes another admin_events row — the sync-side twin of the auto-save loop
 * fixed in #1705. The drain must re-submit once WITHOUT the id (the server
 * creates and completes the round atomically from the same terminal payload)
 * and mark the v1 record synced under the id that now exists.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const submitCalls: Array<[unknown, string | undefined]> = [];
const legacy = vi.hoisted(() => ({
  pending: [] as Array<Record<string, unknown>>,
  synced: [] as Array<[string, string | undefined]>,
  failures: [] as Array<[string, string]>,
}));

vi.mock('../indexed-db', () => ({
  getPendingRounds: vi.fn(async () => legacy.pending),
  getFailedRounds: vi.fn(async () => []),
  markOfflineRoundSynced: vi.fn(async (id: string, serverRoundId?: string) => {
    legacy.synced.push([id, serverRoundId]);
  }),
  recordOfflineRoundSyncFailure: vi.fn(async (id: string, error: string) => {
    legacy.failures.push([id, error]);
  }),
  updateRoundSyncStatus: vi.fn(async () => {}),
}));

vi.mock('@/app/golf/actions/round-drafts', () => ({
  saveRoundDraft: vi.fn(async () => ({ success: true, data: { roundId: 'unused' } })),
}));

vi.mock('@/app/golf/actions/golf', () => ({
  submitGolfRoundComprehensive: vi.fn(async (data: unknown, existingRoundId?: string) => {
    submitCalls.push([data, existingRoundId]);
    return existingRoundId
      ? { success: false, error: 'round_missing' }
      : { success: true, data: { roundId: 'new-round-id' } };
  }),
}));

import { getSyncEngine } from '../sync-engine';

const DEAD_ROUND = 'a45714a0-62fa-4e9b-bfe5-a25e71ca6bc9';

const terminalSubmission = {
  courseName: 'Winchester CC',
  roundType: 'practice',
  roundDate: '2026-09-01',
  holes: [{ holeNumber: 1, par: 4, score: 4, putts: 2, shots: [] }],
};

beforeEach(() => {
  submitCalls.length = 0;
  legacy.pending = [{
    id: 'v1-local-id',
    playerId: 'player-1',
    serverRoundId: DEAD_ROUND,
    syncStatus: 'pending',
    syncAttempts: 0,
    draftData: {
      step: 'tracking',
      submissionIntent: 'submit',
      terminalSubmission,
      holes: [],
      completedHoleStats: [],
      currentHoleIndex: 0,
    },
  }];
  legacy.synced.length = 0;
  legacy.failures.length = 0;
});

describe('SyncEngine v1 drain — a terminal submission whose round is gone', () => {
  it('re-submits once without the dead id and marks the record synced under the new one', async () => {
    const engine = getSyncEngine();
    const result = await (engine as unknown as {
      syncV1Rounds: () => Promise<{ synced: number; failed: number; errors: string[] }>;
    }).syncV1Rounds();

    expect(submitCalls.map(([, id]) => id)).toEqual([DEAD_ROUND, undefined]);
    // Same terminal payload both times — nothing is rebuilt or guessed.
    expect(submitCalls[1]?.[0]).toBe(submitCalls[0]?.[0]);
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(legacy.synced).toEqual([['v1-local-id', 'new-round-id']]);
    expect(legacy.failures).toEqual([]);
  });
});
