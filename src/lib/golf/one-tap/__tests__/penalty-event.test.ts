import { describe, expect, it } from 'vitest';
import { assessHoleIntegrity } from '../hole-integrity';
import { markTerminal } from '../hole-lifecycle';
import { PENALTY_STORAGE_PREFIX, StoragePenaltyRepository, createPenaltyEvent, holeScore, livePenalties, penaltyStrokes, tombstonePenalty, unresolvedPenalties } from '../penalty-event';
import { deriveShots } from '../shot-anchor';
import type { ShotAnchor } from '../shot-anchor';

// SYNTHETIC TEST VECTORS: marks 100 m apart along the x axis, one per minute.
function mark(sequence: number, over: Partial<ShotAnchor> = {}): ShotAnchor {
  return { schemaVersion: 2, id: `m${sequence}`, roundId: 'r', courseId: 'synthetic-course', siteId: 'synthetic', holeKey: 'h1', holeId: 1, sequence,
    tapTimestamp: new Date(1_000_000 + sequence * 60_000).toISOString(), finalizedTimestamp: new Date(1_000_750 + sequence * 60_000).toISOString(), provisional: false,
    positionWgs84: [0, 0, null], positionENU: [sequence * 100, 0, 0], covarianceENU2D: [[9, 0], [0, 9]], sigmaM: 3, reportedAccuracyMedianM: 3, calibratedUncertaintyM: 3, captureMotion: 'stationary',
    liePosterior: [{ featureId: null, lieClass: sequence === 0 ? 'tee' : sequence >= 3 ? 'green' : 'fairway', p: 1 }], primaryLie: sequence === 0 ? 'tee' : sequence >= 3 ? 'green' : 'fairway', confidence: 'HIGH',
    terrainElevationMeters: null, terrainSlopeDegrees: null, terrainAspectDegrees: null, geometryVersion: 'g', terrainVersion: null,
    terminal: false, terminalMethod: null, syncState: 'LOCAL', deletedAt: null, estimatorSummary: null, classification: null, ...over };
}
const identity = { id: 'p1', roundId: 'r', courseId: 'synthetic-course', siteId: 'synthetic', holeKey: 'h1', holeId: 1 };

describe('penalty events (§58)', () => {
  it('adds to the score without adding a shot segment, and the next drop mark is an ordinary anchor', () => {
    const before = [mark(0), mark(1)];
    const penalty = createPenaltyEvent(identity, 'penalty_area', 1, 'm1', 1_090_000);
    expect(penalty).toMatchObject({ schemaVersion: 1, kind: 'penalty_area', strokes: 1, relatedAnchorId: 'm1', syncState: 'QUEUED', deletedAt: null, createdAt: new Date(1_090_000).toISOString() });
    expect(deriveShots(before)).toHaveLength(1);
    expect(penaltyStrokes([penalty], 'h1')).toBe(1);
    expect(holeScore(deriveShots(before).length, penaltyStrokes([penalty], 'h1'))).toBe(2);
    // The drop is the next MARK BALL: a normal anchor, one more shot segment, nothing else.
    const drop = mark(2, { positionENU: [120, 0, 0] });
    const after = [...before, drop];
    expect(unresolvedPenalties([penalty], before, 'h1')).toHaveLength(1);
    expect(unresolvedPenalties([penalty], after, 'h1')).toHaveLength(0);
    expect(deriveShots(after)).toHaveLength(2);
    expect(drop).toMatchObject({ provisional: false, terminal: false, terminalMethod: null });
    expect(Object.keys(drop)).not.toContain('penalty');
    expect(holeScore(deriveShots(markTerminal([...after, mark(3)], 'm3', 'CUP_MARK')).length, 1)).toBe(4);
  });

  it('feeds the hole integrity model: a closed hole with a penalty and no drop mark is PENALTY_UNRESOLVED', () => {
    const closed = markTerminal([mark(0), mark(1), mark(3)], 'm3', 'CUP_MARK');
    const late = createPenaltyEvent(identity, 'lost_ball', 1, 'm3', Date.parse(closed[2]!.tapTimestamp) + 1000);
    expect(assessHoleIntegrity(closed, { unresolvedPenalties: unresolvedPenalties([late], closed, 'h1').length }).flags).toEqual(['PENALTY_UNRESOLVED']);
    const resolved = createPenaltyEvent({ ...identity, id: 'p2' }, 'out_of_bounds', 1, 'm0', 1_030_000);
    expect(assessHoleIntegrity(closed, { unresolvedPenalties: unresolvedPenalties([resolved], closed, 'h1').length }).flags).toEqual([]);
    // Removing a penalty is a tombstone, not a deletion; it no longer counts.
    const gone = tombstonePenalty(late, 2_000_000);
    expect(gone.deletedAt).toBe(new Date(2_000_000).toISOString());
    expect(livePenalties([gone, resolved])).toEqual([resolved]);
    expect(penaltyStrokes([gone, resolved])).toBe(1);
  });

  it('persists per round on the device and skips invalid rows', () => {
    const map = new Map<string, string>();
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } };
    map.set(PENALTY_STORAGE_PREFIX + 'r', JSON.stringify([createPenaltyEvent(identity, 'unplayable', 1, null, 1_000_000), { id: 'junk' }]));
    const repo = new StoragePenaltyRepository(storage, ['r']);
    expect(repo.invalidRows).toBe(1);
    expect(repo.list('r').map(e => e.kind)).toEqual(['unplayable']);
    let notified = 0;
    repo.subscribe(() => { notified++; });
    repo.upsert(createPenaltyEvent({ ...identity, id: 'p2' }, 'other', 2, 'm1', 1_100_000));
    expect(notified).toBe(1);
    expect(JSON.parse(map.get(PENALTY_STORAGE_PREFIX + 'r')!)).toHaveLength(2);
    expect(new StoragePenaltyRepository(storage, ['r']).list('r').map(e => e.strokes)).toEqual([1, 2]);
    expect(() => repo.upsert({ ...createPenaltyEvent(identity, 'other', 1, null, 1), strokes: 3 as unknown as 1 })).toThrow();
  });
});
