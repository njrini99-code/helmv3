/**
 * B6: `syncRounds`/`syncV1Rounds` built their player-facing error strings as
 * `Round ${offlineId}: ${result.error}` — an internal, client-generated
 * IndexedDB key concatenated onto whatever the round-write action
 * returned, INCLUDING a bare signal key (`busy`/`retry`/`conflict`) when
 * that's what came back. `offline-sync-store.ts` takes `result.errors[0]`
 * verbatim as `syncError`, and `OfflineIndicator` renders `{syncError}`
 * directly — so a player could see literally "Round v2-offline-id-abc123: busy".
 *
 * Fix: drop the internal id from the player-facing message, and route the
 * underlying error through the shared humanizer
 * (`describeRoundWriteFailure`, round-missing-recovery.ts) so a bare key
 * never reaches this surface either.
 *
 * `syncRounds` (the v2 path under test here) reads/writes through
 * `./shot-storage`, not `./indexed-db` (that's the LEGACY v1 path used by
 * `syncV1Rounds` — see the sibling `sync-engine-v1-round-missing.test.ts`,
 * which mocks the other module for that reason). Mocking the whole module
 * also sidesteps the constructor's fire-and-forget `loadSyncMetadata()`,
 * which would otherwise touch real IndexedDB (absent under a plain `.ts`
 * node-environment test) and surface as an unhandled rejection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const legacy = vi.hoisted(() => ({
  pending: [] as Array<Record<string, unknown>>,
  failures: [] as Array<[string, string | undefined]>,
}));

vi.mock('../shot-storage', () => ({
  getPendingRounds: vi.fn(async () => legacy.pending),
  getPendingHoles: vi.fn(async () => []),
  getPendingShots: vi.fn(async () => []),
  markRoundSynced: vi.fn(async () => {}),
  markRoundFailed: vi.fn(async (id: string, error: string | undefined) => {
    legacy.failures.push([id, error]);
  }),
  markHoleSynced: vi.fn(async () => {}),
  markHoleFailed: vi.fn(async () => {}),
  markShotSynced: vi.fn(async () => {}),
  markShotFailed: vi.fn(async () => {}),
  updateOfflineRound: vi.fn(async () => {}),
  updateOfflineHole: vi.fn(async () => {}),
  updateOfflineShot: vi.fn(async () => {}),
  getFailedRounds: vi.fn(async () => []),
  getFailedHoles: vi.fn(async () => []),
  getFailedShots: vi.fn(async () => []),
  setSyncMetadata: vi.fn(async () => {}),
  getSyncMetadata: vi.fn(async () => null),
  clearSyncedData: vi.fn(async () => {}),
  shouldRetry: vi.fn(() => true),
  MAX_RETRY_COUNT: 5,
  isIdbUnavailableThisSession: vi.fn(() => false),
}));

vi.mock('@/app/golf/actions/round-drafts', () => ({
  saveRoundDraft: vi.fn(async () => ({ success: false, error: 'busy' })),
}));

import { getSyncEngine } from '../sync-engine';

beforeEach(() => {
  legacy.pending = [{
    _offline_id: 'v2-offline-id-abc123',
    _server_id: undefined,
    _retry_count: 0,
    _last_retry: undefined,
  }];
  legacy.failures.length = 0;
});

describe('SyncEngine — no internal id or bare signal key reaches the player (B6)', () => {
  it('syncRounds never includes the internal offline id or a bare signal key in a surfaced error', async () => {
    const engine = getSyncEngine();
    const result = await (engine as unknown as {
      syncRounds: () => Promise<{ synced: number; failed: number; errors: string[] }>;
    }).syncRounds();

    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).not.toContain('v2-offline-id-abc123');
    // 'busy' is a bare signal key — the humanizer must turn it into a sentence.
    expect(result.errors[0]).not.toBe('busy');
    expect(result.errors[0]?.length ?? 0).toBeGreaterThan(10);
  });
});
