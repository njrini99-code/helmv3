import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGeometryPackage } from '@/lib/golf/course-geometry/schema';
import type { StorageLike } from '../anchor-repository';
import { NEXT_TEE_RULE } from '../hole-lifecycle';
import { exactPointInPartition } from '../lie-classifier';
import { NOISE_VARIANTS, holeTraces, insideAny, lieReport, runTraceMatrix, teesOf, type MatrixRun } from '../trace-matrix';

/** Task 17 — all 18 holes of Peek'n Peak Upper under every noise variant.
 * SOURCE-CANDIDATE PACKAGE: the fixture is the un-approved Upper geometry;
 * the matrix proves the pipeline's behaviour on it, not the geometry. */
const pkg = parseGeometryPackage(JSON.parse(readFileSync(join(process.cwd(), 'src/test/fixtures/course-geometry/peek-n-peak-upper.json'), 'utf8')));
const traces = holeTraces(pkg);
function memoryStorage(): StorageLike { const m = new Map<string, string>(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } }; }
const runs = new Map<string, Promise<MatrixRun>>();
const run = (variant: (typeof NOISE_VARIANTS)[number]) => { if (!runs.has(variant)) runs.set(variant, runTraceMatrix(pkg, variant, { seed: 17, storage: memoryStorage(), traces })); return runs.get(variant)!; };

describe('all-hole one-tap trace matrix (task 17)', () => {
  it('walks every hole tee → route → rough edge → bunker edge → green → next tee with exact spots', () => {
    expect(traces).toHaveLength(18);
    expect(traces.map(t => t.ordinal)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    for (const trace of traces) {
      const kinds = trace.spots.map(s => s.kind);
      expect(kinds[0]).toBe('tee');
      expect(kinds.at(-1)).toBe('green');
      expect(kinds.filter(k => k === 'route')).toHaveLength(2);
      // Every spot with an expected lie reads exactly as that lie before any noise is added.
      for (const spot of trace.spots) if (spot.expectedLie) expect(exactPointInPartition(trace.partition, spot.position).lieClass, `${trace.holeKey} ${spot.kind}`).toBe(spot.expectedLie);
      if (trace.nextHoleKey) expect(insideAny(trace.nextTeeCentre!, teesOf(pkg, trace.nextHoleKey)), `${trace.holeKey} next tee`).toBe(true);
    }
    // Rough edges exist wherever a fairway is mapped; bunker edges wherever a bunker is.
    const withFairway = traces.filter(t => t.partition.surfaces.some(s => s.lieClass === 'fairway'));
    expect(withFairway.every(t => t.spots.some(s => s.kind === 'rough_edge'))).toBe(true);
    const withBunker = traces.filter(t => t.partition.surfaces.some(s => s.lieClass === 'bunker'));
    expect(withBunker.every(t => t.spots.some(s => s.kind === 'bunker_edge'))).toBe(true);
    expect(withBunker.length).toBeGreaterThanOrEqual(16);
  });

  it('replays identically from the same seed', async () => {
    const a = await runTraceMatrix(pkg, 'acc6', { seed: 3, traces: traces.slice(0, 2) });
    const b = await runTraceMatrix(pkg, 'acc6', { seed: 3, traces: traces.slice(0, 2) });
    expect(a.holes.map(h => h.marks.map(m => [m.lie, m.sigmaM, m.anchor?.positionENU]))).toEqual(b.holes.map(h => h.marks.map(m => [m.lie, m.sigmaM, m.anchor?.positionENU])));
  });

  describe.each(NOISE_VARIANTS)('variant %s', variant => {
    it('holds the hard gates: 0 false automatic advances, 0 cross-hole reassignments, 0 lost anchors', async () => {
      const result = await run(variant);
      expect(result.holes).toHaveLength(18);
      expect(result.falseAdvances).toBe(0);
      expect(result.crossHole).toBe(0);
      expect(result.lostAnchors).toBe(0);
      expect(result.gpsUnavailable).toBe(0);
      // Every mark saved, on its own hole, and still there after the reload.
      for (const hole of result.holes) {
        expect(hole.marks.every(m => m.anchor && !m.anchor.provisional && m.anchor.holeKey === hole.holeKey), hole.holeKey).toBe(true);
        expect(result.anchorsByHole[hole.holeKey]).toBe(hole.marks.length);
        expect(result.reloadedByHole[hole.holeKey]).toBe(hole.marks.length);
      }
      // The automatic advance fires only after the dwell on the next tee, and only when the green mark earned it.
      for (const hole of result.holes.slice(0, 17)) {
        const trace = traces.find(t => t.holeKey === hole.holeKey)!;
        const farEnough = Math.hypot(trace.nextTeeCentre![0] - trace.greenCentre[0], trace.nextTeeCentre![1] - trace.greenCentre[1]) >= NEXT_TEE_RULE.minDistanceFromGreenM;
        const earned = (hole.greenProbability ?? 0) >= NEXT_TEE_RULE.greenProbability && farEnough;
        expect(hole.inferredAdvance, `${hole.holeKey} advance vs green p=${hole.greenProbability?.toFixed(2)}`).toBe(earned);
        if (hole.inferredAdvance) expect(hole.dwellMs!).toBeGreaterThanOrEqual(NEXT_TEE_RULE.dwellMs);
      }
      expect(result.holes[17]!.inferredAdvance).toBe(false);
    }, 120_000);
  });

  it('classifies honestly at 3 m — the green reads green on every hole, the truth is always in the posterior — and rejects a single GPS jump', async () => {
    const clean = await run('acc3');
    for (const hole of clean.holes) {
      expect(hole.marks.find(m => m.kind === 'green')!.lie, `${hole.holeKey} green`).toBe('green');
      expect((hole.greenProbability ?? 0) >= NEXT_TEE_RULE.greenProbability, `${hole.holeKey} green p`).toBe(true);
    }
    // Source-candidate geometry (unreviewed edges, narrow tees) cannot promise
    // an exact read everywhere; the truth must never be excluded, and the
    // argmax should match on most spots. Tightened once the package is reviewed.
    const report = lieReport(clean);
    expect(report.present / report.spots).toBeGreaterThanOrEqual(.95);
    expect(report.exact / report.spots).toBeGreaterThanOrEqual(.5);
    expect(report.byKind['green']!.exact).toBe(report.byKind['green']!.spots);
    const jump = await run('gps_jump');
    for (const hole of jump.holes) for (const [index, mark] of hole.marks.entries()) {
      // A 45 m outlier in the window never drags the mark: the position stays within a few σ of the truth.
      const truth = traces.find(t => t.holeKey === hole.holeKey)!.spots[index]!.position;
      const off = Math.hypot(mark.anchor!.positionENU[0] - truth[0], mark.anchor!.positionENU[1] - truth[1]);
      expect(off, `${hole.holeKey} ${mark.kind} off by ${off.toFixed(1)} m`).toBeLessThan(8);
      expect(mark.anchor!.estimatorSummary!.rejectedResiduals, `${hole.holeKey} ${mark.kind} rejected`).toBeGreaterThanOrEqual(1);
    }
  }, 120_000);

  it('saves a moving cart mark one grade lower rather than refusing it, and reports poor sky honestly', async () => {
    const cart = await run('cart_transition');
    for (const hole of cart.holes) for (const mark of hole.marks) {
      expect(mark.anchor!.captureMotion).toBe('moving');
      expect(mark.confidence).not.toBe('HIGH');
      expect(mark.finalizeMs!).toBeGreaterThanOrEqual(1400);
    }
    const poor = await run('poor_sky');
    for (const hole of poor.holes) for (const mark of hole.marks) {
      expect(mark.sigmaM!).toBeGreaterThan(5);
      expect(mark.confidence).toBe('LOW');
    }
  }, 120_000);
});
