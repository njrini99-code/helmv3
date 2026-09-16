import { describe, expect, it, vi } from 'vitest';
import { ANCHOR_STORAGE_PREFIX, MemoryAnchorRepository, StorageAnchorRepository, SYNC_BACKOFF_MS, SyncQueue, type StorageLike } from '../anchor-repository';
import type { ShotAnchor } from '../shot-anchor';

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
