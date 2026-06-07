import { describe, it, expect } from 'vitest';
import { calculateStatsFromShots } from '../golf-stats-calculator-shots';
import type { RawShot, HoleInfo } from '../golf-stats-calculator-shots';
import {
  makeHoleInfo,
  makeRoundInfo,
  par4BirdieRawShots,
  par4BogeyRawShots,
  par3GirRawShots,
  sandSaveRawShots,
} from '@/test/fixtures/golf-shots';

/**
 * Regression tests for the 2026-06-08 stats-correctness audit fixes. Each test
 * pins a fix so the bug class cannot silently return. See branch
 * fix/stats-correctness-audit.
 */

const round = makeRoundInfo({ id: 'round-1', holes_played: 18 });

describe('audit fix B — 18-hole normalization (girPerRound / penaltiesPerRound)', () => {
  it('girPerRound normalizes by holes played, not raw round count (9-hole round)', () => {
    // 9-hole round: 5 GIR holes + 4 missed-GIR. girTotal=5, holesPlayed=9.
    const shots: RawShot[] = [];
    for (let h = 1; h <= 5; h++) shots.push(...par4BirdieRawShots(h)); // GIR
    for (let h = 6; h <= 9; h++) shots.push(...par4BogeyRawShots(h));  // no GIR
    const holes: HoleInfo[] = [];
    for (let h = 1; h <= 9; h++) holes.push(makeHoleInfo({ hole_number: h, par: 4 }));
    const r9 = makeRoundInfo({ id: 'round-1', holes_played: 9 });

    const stats = calculateStatsFromShots(shots, holes, [r9]);
    expect(stats.holesPlayed).toBe(9);
    expect(stats.girTotal).toBe(5);
    // (5 / 9) * 18 = 10.0 — NOT the raw 5 / 1 round.
    expect(stats.girPerRound).toBeCloseTo(10.0, 1);
  });
});

describe('audit fix C — streak counters reset per round (no cross-round chaining)', () => {
  it('mostParsRow does not chain a par at the end of one round into the next', () => {
    // Two separate rounds, each a single par hole. A par streak must not span
    // the round boundary → mostParsRow = 1, never 2.
    const r1 = makeRoundInfo({ id: 'r1', holes_played: 18 });
    const r2 = makeRoundInfo({ id: 'r2', holes_played: 18 });
    const shots: RawShot[] = [
      ...par3GirRawShots(1).map(s => ({ ...s, round_id: 'r1' })), // par
      ...par3GirRawShots(1).map(s => ({ ...s, round_id: 'r2' })), // par (next round)
    ];
    const holes: HoleInfo[] = [
      makeHoleInfo({ round_id: 'r1', hole_number: 1, par: 3 }),
      makeHoleInfo({ round_id: 'r2', hole_number: 1, par: 3 }),
    ];
    const stats = calculateStatsFromShots(shots, holes, [r1, r2]);
    expect(stats.totalPars).toBe(2);
    expect(stats.mostParsRow).toBe(1); // would be 2 if streak chained across rounds
  });
});

describe('audit fix D — sand save sourced from canonical golf_holes.sand_save flag', () => {
  it('credits a sand save when the flag is true', () => {
    const shots = sandSaveRawShots(1);
    const holes = [makeHoleInfo({ hole_number: 1, par: 4, sand_save: true })];
    const stats = calculateStatsFromShots(shots, holes, [round]);
    expect(stats.sandSaveAttempts).toBe(1);
    expect(stats.sandSavesMade).toBe(1);
  });

  it('counts the attempt but no save when the flag is false', () => {
    const shots = sandSaveRawShots(1);
    const holes = [makeHoleInfo({ hole_number: 1, par: 4, sand_save: false })];
    const stats = calculateStatsFromShots(shots, holes, [round]);
    expect(stats.sandSaveAttempts).toBe(1);
    expect(stats.sandSavesMade).toBe(0);
  });

  it('does NOT credit a sand save on a GIR par hole with no bunker (flag null)', () => {
    // par4 birdie = GIR, score < par, no bunker. The old `score <= par` rule
    // wrongly credited holes like this; the flag (null = no bunker visit) must not.
    const shots = par4BirdieRawShots(1);
    const holes = [makeHoleInfo({ hole_number: 1, par: 4, sand_save: null })];
    const stats = calculateStatsFromShots(shots, holes, [round]);
    expect(stats.sandSaveAttempts).toBe(0);
    expect(stats.sandSavesMade).toBe(0);
  });
});

describe('audit fix G — per-team SG baseline scale applied in the TS engine', () => {
  it('scale=1 is identical to passing no opts (men/PGA Tour unchanged)', () => {
    const shots = par4BogeyRawShots(1);
    const holes = [makeHoleInfo({ hole_number: 1, par: 4 })];
    const base = calculateStatsFromShots(shots, holes, [round]);
    const scaled1 = calculateStatsFromShots(shots, holes, [round], { sgScale: 1 });
    expect(scaled1.strokesGainedTotal).toBe(base.strokesGainedTotal);
  });

  it('a >1 scale (women/NCAA) raises SG vs the unscaled PGA Tour baseline', () => {
    // Scaling the expected-strokes curve up makes an over-par player look better
    // (the baseline expects more strokes), so SG is less negative — matching the
    // DB sg_expected_strokes(...,p_scale). The -1 per shot stays unscaled.
    const shots = par4BogeyRawShots(1);
    const holes = [makeHoleInfo({ hole_number: 1, par: 4 })];
    const pga = calculateStatsFromShots(shots, holes, [round], { sgScale: 1 });
    const womens = calculateStatsFromShots(shots, holes, [round], { sgScale: 1.083 });
    expect(womens.strokesGainedTotal).not.toBeNull();
    expect(pga.strokesGainedTotal).not.toBeNull();
    expect(womens.strokesGainedTotal!).toBeGreaterThan(pga.strokesGainedTotal!);
  });
});

describe('audit fix J — girPctFromFairway excludes par-3 tee approaches', () => {
  it('a par-3 GIR (tee→green) does not count as a fairway approach', () => {
    const shots = par3GirRawShots(1); // tee shot finds green; lie_before = 'tee'
    const holes = [makeHoleInfo({ hole_number: 1, par: 3 })];
    const stats = calculateStatsFromShots(shots, holes, [round]);
    expect(stats.girTotal).toBe(1);
    // The only GIR came from a tee shot, not a fairway approach → fairway-lie GIR
    // has no opportunities → null (was 100% when tee folded into 'fairway').
    expect(stats.girPctFromFairway).toBeNull();
  });
});
