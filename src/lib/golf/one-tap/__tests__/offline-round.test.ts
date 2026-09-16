import { describe, expect, it, vi } from 'vitest';
import { pilotPackage } from '@/test/fixtures/course-geometry/pilot';
import { StorageAnchorRepository, SyncQueue, type StorageLike, type SyncTransport } from '../anchor-repository';
import { provisionalAnchor, type ShotAnchor } from '../shot-anchor';

/** Task 15: a round with no signal keeps every mark on the device and syncs
 * them all, once, when the signal returns — through a reload in between. */
function memoryStorage(): StorageLike {
  const m = new Map<string, string>();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } };
}
const BINDING = { courseId: 'peek-n-peak-upper', siteId: pilotPackage.siteId };
const ROUND = 'r-offline';
function mark(id: string, sequence: number, tapMs: number): ShotAnchor {
  const sample = { timestampMs: tapMs, longitude: -79.7, latitude: 42.1, altitudeM: null, horizontalAccuracyM: 3, verticalAccuracyM: null, speedMps: null, headingDegrees: null, source: 'synthetic' as const };
  const base = provisionalAnchor({ ...BINDING, id, roundId: ROUND, holeKey: 'cacapon-07', holeId: 7, sequence, tapMs }, sample, [10 * sequence, 5, 0], pilotPackage.contentHash, null);
  return { ...base, provisional: false, finalizedTimestamp: new Date(tapMs + 1200).toISOString(), primaryLie: 'fairway', confidence: 'HIGH' };
}

describe('offline round (task 15)', () => {
  it('keeps marks on the device through a reload with no signal and syncs them once when it returns', async () => {
    const storage = memoryStorage();
    let online = false;
    const transport: SyncTransport = { upsertAnchors: vi.fn(async (anchors: readonly ShotAnchor[]) => { if (!online) throw new TypeError('Failed to fetch'); return { acceptedIds: anchors.map(a => a.id) }; }) };
    // Session 1: three marks with no signal — every flush fails, nothing is lost.
    const repo1 = new StorageAnchorRepository(storage, [ROUND], BINDING);
    const queue1 = new SyncQueue(repo1, transport, ROUND);
    for (const [i, a] of [mark('anchor-a1', 1, 1000), mark('anchor-a2', 2, 2000), mark('anchor-a3', 3, 3000)].entries()) { repo1.upsert(a); queue1.enqueue(a.id); if (i === 0) await queue1.flush(); }
    await queue1.flush();
    expect(repo1.list(ROUND).map(a => a.syncState)).toEqual(['QUEUED', 'QUEUED', 'QUEUED']);
    // Reload (the app was killed): the same storage rehydrates every mark, still queued.
    const repo2 = new StorageAnchorRepository(storage, [ROUND], BINDING);
    expect(repo2.list(ROUND).map(a => a.id)).toEqual(['anchor-a1', 'anchor-a2', 'anchor-a3']);
    expect(repo2.list(ROUND).every(a => !a.provisional && a.syncState === 'QUEUED')).toBe(true);
    // Signal returns: one flush syncs all three, and a further flush sends nothing.
    online = true;
    const queue2 = new SyncQueue(repo2, transport, ROUND);
    await queue2.flush();
    expect(repo2.list(ROUND).map(a => a.syncState)).toEqual(['SYNCED', 'SYNCED', 'SYNCED']);
    const sent = (transport.upsertAnchors as ReturnType<typeof vi.fn>).mock.calls;
    expect(sent.at(-1)![0].map((a: ShotAnchor) => a.id)).toEqual(['anchor-a1', 'anchor-a2', 'anchor-a3']);
    await queue2.flush();
    expect(sent.length).toBe(3);
    expect(queue2.pending()).toEqual([]);
  });
});
