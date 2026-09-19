import { describe, expect, it, vi } from 'vitest';
import { ANCHOR_STORAGE_PREFIX, MemoryAnchorRepository, StorageAnchorRepository, SYNC_BACKOFF_MS, SyncQueue, type StorageLike, type SyncResult, type SyncTransport } from '../anchor-repository';
import { PENALTY_STORAGE_PREFIX, StoragePenaltyRepository, createPenaltyEvent, tombstonePenalty, type PenaltyEvent } from '../penalty-event';
import { tombstoneAnchor, type ShotAnchor } from '../shot-anchor';

// SYNTHETIC TEST VECTOR
function anchor(id: string, sequence: number, syncState: ShotAnchor['syncState'] = 'LOCAL'): ShotAnchor {
  return { schemaVersion: 2, id, roundId: 'r', courseId: 'synthetic-course', siteId: 'synthetic', holeKey: 'h', holeId: 1, sequence, tapTimestamp: '2026-09-17T12:00:00.000Z', finalizedTimestamp: null, provisional: false, positionWgs84: [-79.744, 42.06, null],
    positionENU: [0, 0, 0], covarianceENU2D: [[4, 0], [0, 4]], sigmaM: 2, reportedAccuracyMedianM: 2, calibratedUncertaintyM: 2, captureMotion: 'stationary', liePosterior: [], primaryLie: 'fairway', confidence: 'HIGH', terrainElevationMeters: null,
    terrainSlopeDegrees: null, terrainAspectDegrees: null, geometryVersion: 'g', terrainVersion: null, terminal: false, terminalMethod: null, syncState, deletedAt: null, estimatorSummary: null, classification: null };
}
function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: k => { data.delete(k); } };
}
const BINDING = { courseId: 'synthetic-course', siteId: 'synthetic' };
describe('one-tap anchor repository', () => {
  it('persists every write synchronously and reloads, counting rows that no longer parse', () => {
    const storage = memoryStorage();
    const repo = new StorageAnchorRepository(storage, ['r'], BINDING);
    repo.upsert(anchor('00000001-a', 0));
    repo.upsert(anchor('00000002-b', 1));
    expect(JSON.parse(storage.data.get(ANCHOR_STORAGE_PREFIX + 'r')!)).toHaveLength(2);
    repo.upsert({ ...anchor('00000001-a', 0), primaryLie: 'green' });
    expect(repo.list('r').map(a => a.primaryLie)).toEqual(['green', 'fairway']);
    storage.data.set(ANCHOR_STORAGE_PREFIX + 'r', JSON.stringify([...repo.list('r'), { id: 'broken' }]));
    const again = new StorageAnchorRepository(storage, ['r'], BINDING);
    expect(again.list('r')).toHaveLength(2);
    expect(again.invalidRows).toBe(1);
    again.clear('r');
    expect(again.list('r')).toEqual([]);
    expect(storage.data.has(ANCHOR_STORAGE_PREFIX + 'r')).toBe(false);
  });
  it('migrates V1 lab rows on load (raw window dropped, binding applied) and writes them back', () => {
    const storage = memoryStorage();
    const { schemaVersion: _v, courseId: _c, siteId: _s, reportedAccuracyMedianM: _r, calibratedUncertaintyM: _u, captureMotion: _m, estimatorSummary: _e, ...v1 } = anchor('00000001-a', 0);
    const sample = { timestampMs: 900, longitude: -79.744, latitude: 42.06, altitudeM: null, horizontalAccuracyM: 3, verticalAccuracyM: null, speedMps: null, headingDegrees: null, source: 'synthetic' };
    storage.data.set(ANCHOR_STORAGE_PREFIX + 'r', JSON.stringify([{ ...v1, rawLocationSamples: [sample], estimator: null }, { ...anchor('00000002-b', 1), schemaVersion: 3 }, anchor('00000003-c', 2)]));
    const repo = new StorageAnchorRepository(storage, ['r'], BINDING);
    expect(repo.migratedRows).toBe(1);
    expect(repo.invalidRows).toBe(1);
    expect(repo.list('r').map(a => [a.id, a.schemaVersion, a.courseId])).toEqual([['00000001-a', 2, 'synthetic-course'], ['00000003-c', 2, 'synthetic-course']]);
    const written = storage.data.get(ANCHOR_STORAGE_PREFIX + 'r')!;
    expect(written).not.toContain('rawLocationSamples');
    expect(written).not.toContain('"longitude"');
    expect(new StorageAnchorRepository(storage, ['r'], BINDING).migratedRows).toBe(0);
  });
  it('rejects a row that violates the schema and notifies subscribers', () => {
    const repo = new MemoryAnchorRepository(), seen = vi.fn();
    repo.subscribe(seen);
    expect(() => repo.upsert({ ...anchor('00000001-a', 0), sigmaM: -1 })).toThrow();
    repo.upsert(anchor('00000001-a', 0));
    expect(seen).toHaveBeenCalledTimes(1);
  });
  it('syncs idempotently by anchor id and keeps failures queued', async () => {
    const repo = new MemoryAnchorRepository();
    repo.upsert(anchor('00000001-a', 0));
    const sent: string[][] = [];
    let fail = true;
    const queue = new SyncQueue(repo, { upsertAnchors: async anchors => { sent.push(anchors.map(a => a.id)); if (fail) throw new Error('offline'); return { acceptedIds: anchors.map(a => a.id) }; } }, 'r');
    queue.enqueue('00000001-a');
    expect(repo.get('00000001-a')?.syncState).toBe('QUEUED');
    await queue.flush();
    expect(repo.get('00000001-a')?.syncState).toBe('QUEUED');
    expect(queue.backoffFor('00000001-a')).toBe(SYNC_BACKOFF_MS[1]);
    for (let i = 0; i < SYNC_BACKOFF_MS.length; i++) await queue.flush();
    expect(repo.get('00000001-a')?.syncState).toBe('ERROR');
    fail = false;
    await queue.flush();
    expect(repo.get('00000001-a')?.syncState).toBe('SYNCED');
    expect(sent.every(batch => batch.length === 1 && batch[0] === '00000001-a')).toBe(true);
    await queue.flush();
    expect(sent).toHaveLength(SYNC_BACKOFF_MS.length + 2);
  });
  it('works with no transport at all: the local record stays valid and queued', async () => {
    const repo = new MemoryAnchorRepository();
    repo.upsert(anchor('00000001-a', 0));
    const queue = new SyncQueue(repo, null, 'r');
    queue.enqueue('00000001-a');
    await queue.flush();
    expect(queue.pending().map(a => a.id)).toEqual(['00000001-a']);
  });
});

/** A server that upserts on id, like the real one, so "sent twice" and "stored
 * once" can both be asserted. `online` false is airplane mode. */
function fakeServer() {
  const anchors = new Map<string, ShotAnchor>();
  const penalties = new Map<string, PenaltyEvent>();
  const anchorSends: string[] = [];
  const penaltySends: string[] = [];
  let online = false;
  const transport: SyncTransport = {
    upsertAnchors: async batch => {
      anchorSends.push(...batch.map(a => a.id));
      if (!online) throw new Error('offline');
      for (const a of batch) anchors.set(a.id, a);
      return { acceptedIds: batch.map(a => a.id) } satisfies SyncResult;
    },
    upsertPenalties: async batch => {
      penaltySends.push(...batch.map(e => e.id));
      if (!online) throw new Error('offline');
      for (const e of batch) penalties.set(e.id, e);
      return { acceptedIds: batch.map(e => e.id) } satisfies SyncResult;
    },
  };
  return { transport, anchors, penalties, anchorSends, penaltySends, goOnline() { online = true; } };
}

describe('one-tap sync outbox', () => {
  it('has the anchor durable in storage BEFORE the transport is ever called', async () => {
    const storage = memoryStorage();
    const repo = new StorageAnchorRepository(storage, ['r'], BINDING);
    const seenByTransport: (string[] | null)[] = [];
    const queue = new SyncQueue(repo, {
      upsertAnchors: async batch => {
        const durable = storage.data.get(ANCHOR_STORAGE_PREFIX + 'r');
        seenByTransport.push(durable ? (JSON.parse(durable) as ShotAnchor[]).map(a => a.id) : null);
        return { acceptedIds: batch.map(a => a.id) };
      },
    }, 'r');
    // The controller's order: local write, then enqueue, then flush.
    repo.upsert(anchor('00000001-a', 0));
    queue.enqueue('00000001-a');
    await queue.flush();
    expect(seenByTransport).toEqual([['00000001-a']]);
    expect(repo.get('00000001-a')?.syncState).toBe('SYNCED');
    // Enqueueing an id the repository has never seen is a no-op: there is no
    // path where the queue knows about a mark the device does not.
    queue.enqueue('does-not-exist');
    expect(queue.pending()).toEqual([]);
  });

  it('keeps every mark across airplane mode, a force-kill and a relaunch, then syncs each exactly once', async () => {
    const storage = memoryStorage();
    const server = fakeServer();
    // --- Round in progress, no network. Three marks and a penalty. ---
    const repo = new StorageAnchorRepository(storage, ['r'], BINDING);
    const penalties = new StoragePenaltyRepository(storage, ['r']);
    const queue = new SyncQueue(repo, server.transport, 'r', penalties);
    for (const [i, id] of ['00000001-a', '00000002-b', '00000003-c'].entries()) {
      repo.upsert(anchor(id, i));
      queue.enqueue(id);
    }
    penalties.upsert(createPenaltyEvent({ id: 'p1', roundId: 'r', holeKey: 'h', holeId: 1, ...BINDING }, 'penalty_area', 1, '00000002-b', Date.parse('2026-09-17T12:01:00.000Z')));
    queue.enqueuePenalty('p1');
    await queue.flush();
    await queue.flush();
    expect(queue.pending()).toHaveLength(3);
    expect(queue.pendingPenalties()).toHaveLength(1);
    expect(server.anchors.size).toBe(0);

    // --- Force-kill: everything the process held is gone. Relaunch reads the
    // same storage. Nothing may be lost, and nothing may claim to be SYNCED.
    const reloadedRepo = new StorageAnchorRepository(storage, ['r'], BINDING);
    const reloadedPenalties = new StoragePenaltyRepository(storage, ['r']);
    expect(reloadedRepo.invalidRows).toBe(0);
    expect(reloadedPenalties.invalidRows).toBe(0);
    expect(reloadedRepo.list('r').map(a => a.id)).toEqual(['00000001-a', '00000002-b', '00000003-c']);
    expect(reloadedRepo.list('r').every(a => a.syncState === 'QUEUED')).toBe(true);
    expect(reloadedPenalties.list('r').map(e => e.id)).toEqual(['p1']);

    // --- One more mark and an Undo while still offline. ---
    const reloadedQueue = new SyncQueue(reloadedRepo, server.transport, 'r', reloadedPenalties);
    reloadedRepo.upsert(anchor('00000004-d', 3));
    reloadedQueue.enqueue('00000004-d');
    for (const a of tombstoneAnchor(reloadedRepo.list('r'), '00000003-c', Date.parse('2026-09-17T12:02:00.000Z'))) {
      if (a.id === '00000003-c') { reloadedRepo.upsert(a); reloadedQueue.enqueue(a.id); }
    }
    await reloadedQueue.flush();
    expect(reloadedRepo.list('r')).toHaveLength(4);

    // --- Reconnect. Every row converges on SYNCED and the server holds one
    // row per id, tombstone included, however many sends it took.
    server.goOnline();
    await reloadedQueue.flush();
    expect(reloadedRepo.list('r').every(a => a.syncState === 'SYNCED')).toBe(true);
    expect(reloadedPenalties.list('r').every(e => e.syncState === 'SYNCED')).toBe(true);
    expect([...server.anchors.keys()].sort()).toEqual(['00000001-a', '00000002-b', '00000003-c', '00000004-d']);
    expect(server.anchors.get('00000003-c')?.deletedAt).toBe('2026-09-17T12:02:00.000Z');
    expect([...server.penalties.keys()]).toEqual(['p1']);
    // Logical exactly-once is about the FINAL STATE, not the call count: the
    // same ids were sent many times and the server holds each one once.
    expect(server.anchorSends.length).toBeGreaterThan(server.anchors.size);
    expect(new Set(server.anchorSends).size).toBe(4);

    // --- A further flush is a no-op: nothing pending, nothing re-sent. ---
    const sendsSoFar = server.anchorSends.length;
    await reloadedQueue.flush();
    expect(server.anchorSends).toHaveLength(sendsSoFar);
    expect(JSON.parse(storage.data.get(ANCHOR_STORAGE_PREFIX + 'r')!)).toHaveLength(4);
    expect(JSON.parse(storage.data.get(PENALTY_STORAGE_PREFIX + 'r')!)).toHaveLength(1);
  });

  it('syncs a penalty tombstone as an update and walks the same retry ladder', async () => {
    const storage = memoryStorage();
    const server = fakeServer();
    const repo = new StorageAnchorRepository(storage, ['r'], BINDING);
    const penalties = new StoragePenaltyRepository(storage, ['r']);
    const queue = new SyncQueue(repo, server.transport, 'r', penalties);
    penalties.upsert(createPenaltyEvent({ id: 'p1', roundId: 'r', holeKey: 'h', holeId: 1, ...BINDING }, 'lost_ball', 1, null, 1_000));
    queue.enqueuePenalty('p1');
    await queue.flush();
    expect(penalties.get('p1')?.syncState).toBe('QUEUED');
    expect(queue.backoffFor('p1')).toBe(SYNC_BACKOFF_MS[1]);
    for (let i = 0; i < SYNC_BACKOFF_MS.length; i++) await queue.flush();
    expect(penalties.get('p1')?.syncState).toBe('ERROR');
    server.goOnline();
    await queue.flush();
    expect(penalties.get('p1')?.syncState).toBe('SYNCED');
    // Undo the penalty: the record is retained and re-queued, never deleted.
    penalties.upsert(tombstonePenalty(penalties.get('p1')!, 2_000));
    expect(penalties.get('p1')?.syncState).toBe('QUEUED');
    await queue.flush();
    expect(penalties.get('p1')?.syncState).toBe('SYNCED');
    expect(server.penalties.get('p1')?.deletedAt).toBe(new Date(2_000).toISOString());
    expect(server.penalties.size).toBe(1);
  });

  it('never marks a penalty SYNCED against a transport that cannot send penalties', async () => {
    const storage = memoryStorage();
    const penalties = new StoragePenaltyRepository(storage, ['r']);
    const repo = new MemoryAnchorRepository();
    const anchorsOnly: SyncTransport = { upsertAnchors: async batch => ({ acceptedIds: batch.map(a => a.id) }) };
    const queue = new SyncQueue(repo, anchorsOnly, 'r', penalties);
    penalties.upsert(createPenaltyEvent({ id: 'p1', roundId: 'r', holeKey: 'h', holeId: 1, ...BINDING }, 'other', 1, null, 1_000));
    queue.enqueuePenalty('p1');
    repo.upsert(anchor('00000001-a', 0));
    queue.enqueue('00000001-a');
    await queue.flush();
    expect(repo.get('00000001-a')?.syncState).toBe('SYNCED');
    expect(penalties.get('p1')?.syncState).toBe('QUEUED');
    expect(queue.pendingPenalties().map(e => e.id)).toEqual(['p1']);
  });
});
