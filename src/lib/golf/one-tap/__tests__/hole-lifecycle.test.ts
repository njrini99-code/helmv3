import { describe, expect, it } from 'vitest';
import type { LocalFeature } from '@/lib/golf/course-geometry/types';
import { NEXT_TEE_RULE, holeStatus, markTerminal, observeNextTee } from '../hole-lifecycle';
import type { ShotAnchor } from '../shot-anchor';

// SYNTHETIC TEST VECTORS: a green mark at the origin and the next tee 80 m east.
function anchor(sequence: number, greenP: number, over: Partial<ShotAnchor> = {}): ShotAnchor {
  return { schemaVersion: 2, id: `a${sequence}`, roundId: 'r', courseId: 'synthetic-course', siteId: 'synthetic', holeKey: 'h1', holeId: 1, sequence,
    tapTimestamp: new Date(1_000_000 + sequence * 60_000).toISOString(), finalizedTimestamp: new Date(1_000_750 + sequence * 60_000).toISOString(), provisional: false,
    positionWgs84: [0, 0, null], positionENU: [0, 0, 0], covarianceENU2D: [[4, 0], [0, 4]], sigmaM: 2, reportedAccuracyMedianM: 2, calibratedUncertaintyM: 2, captureMotion: 'stationary',
    liePosterior: [{ featureId: null, lieClass: 'green', p: greenP }, { featureId: null, lieClass: 'primary_rough', p: 1 - greenP }], primaryLie: greenP >= .5 ? 'green' : 'primary_rough', confidence: 'HIGH',
    terrainElevationMeters: null, terrainSlopeDegrees: null, terrainAspectDegrees: null, geometryVersion: 'g', terrainVersion: null,
    terminal: false, terminalMethod: null, syncState: 'LOCAL', deletedAt: null, estimatorSummary: null, classification: null, ...over };
}
const nextTee: LocalFeature = { id: 't2', kind: 'tee', type: 'Polygon', reviewed: true, parts: [[[[70, -5], [90, -5], [90, 5], [70, 5], [70, -5]]]] };

describe('hole lifecycle', () => {
  it('CUP_MARK marks exactly one terminal anchor and moving it clears the previous one', () => {
    const marked = markTerminal([anchor(0, 0), anchor(1, .95)], 'a1', 'CUP_MARK');
    expect(marked.map(a => [a.terminal, a.terminalMethod])).toEqual([[false, null], [true, 'CUP_MARK']]);
    expect(holeStatus(marked)).toEqual({ status: 'COMPLETE', terminalMethod: 'CUP_MARK', strokes: 1, cupMarked: true, terminalAnchorId: 'a1' });
    const moved = markTerminal([...marked, anchor(2, .9)], 'a2', 'CUP_MARK');
    expect(moved.filter(a => a.terminal).map(a => a.id)).toEqual(['a2']);
    expect(holeStatus([anchor(0, 0)])).toMatchObject({ status: 'OPEN', terminalMethod: null, strokes: 0, cupMarked: false, terminalAnchorId: null });
  });

  it('infers completion only after the dwell on the next tee, far from the green, and never invents a cup', () => {
    const green = anchor(1, .95);
    let state = { insideSinceMs: null as number | null };
    const step = (position: [number, number], nowMs: number, previous: ShotAnchor | null = green) => {
      const r = observeNextTee(state, previous, [nextTee], [0, 0], { position, nowMs });
      state = r.state;
      return r.inferred;
    };
    expect(step([80, 0], 0)).toBe(false);
    expect(step([80, 0], NEXT_TEE_RULE.dwellMs - 1)).toBe(false);
    expect(step([80, 0], NEXT_TEE_RULE.dwellMs)).toBe(true);
    // Leaving the tee resets the dwell.
    expect(step([40, 0], NEXT_TEE_RULE.dwellMs + 1000)).toBe(false);
    expect(step([80, 0], NEXT_TEE_RULE.dwellMs + 2000)).toBe(false);
    expect(state.insideSinceMs).toBe(NEXT_TEE_RULE.dwellMs + 2000);
    // Not from the fairway, not when the hole is already closed, not for a tee within 60 m of the green.
    state = { insideSinceMs: null };
    expect(step([80, 0], 0, anchor(1, .4))).toBe(false);
    expect(step([80, 0], 20_000, anchor(1, .4))).toBe(false);
    expect(step([80, 0], 0, { ...green, terminal: true, terminalMethod: 'CUP_MARK' })).toBe(false);
    expect(observeNextTee({ insideSinceMs: 0 }, green, [nextTee], [50, 0], { position: [80, 0], nowMs: 30_000 }).inferred).toBe(false);
    // The inference marks the existing green anchor terminal and creates nothing.
    const closed = markTerminal([anchor(0, 0), green], green.id, 'NEXT_TEE_INFERRED');
    expect(closed).toHaveLength(2);
    expect(closed[1]).toMatchObject({ id: green.id, positionENU: green.positionENU, terminal: true, terminalMethod: 'NEXT_TEE_INFERRED' });
    expect(holeStatus(closed)).toMatchObject({ status: 'COMPLETE', cupMarked: false, terminalMethod: 'NEXT_TEE_INFERRED' });
  });
});
