// =============================================================================
// career-slash-line.test.ts
//
// Guards the career OBP/SLG/OPS derivation used by
// `recalculatePlayerAggregates` (BaseballHelm #436). Pure function; no DB.
// The headline case is a multi-session aggregate that exercises walks, sac
// flies, and hit-by-pitch — the fields that pull OBP away from AVG.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  computeCareerSlashLine,
  type SlashLineStatRow,
} from '@/lib/baseball/aggregates/career-slash-line';

const row = (partial: Partial<SlashLineStatRow>): SlashLineStatRow => ({
  at_bats: 0,
  hits: 0,
  doubles: 0,
  triples: 0,
  home_runs: 0,
  walks: 0,
  hit_by_pitch: 0,
  sacrifice_flies: 0,
  ...partial,
});

describe('computeCareerSlashLine', () => {
  it('aggregates OBP/SLG/OPS across multiple sessions with walks, SF, and HBP', () => {
    // Session 1: 4 AB, 2 H (1 double), 1 BB, 1 HBP
    // Session 2: 6 AB, 2 H (1 HR), 1 BB, 1 SF
    // Totals: AB 10, H 4, 2B 1, HR 1, BB 2, HBP 1, SF 1
    const stats = [
      row({ at_bats: 4, hits: 2, doubles: 1, walks: 1, hit_by_pitch: 1 }),
      row({ at_bats: 6, hits: 2, home_runs: 1, walks: 1, sacrifice_flies: 1 }),
    ];

    const { obp, slg, ops } = computeCareerSlashLine(stats);

    // OBP = (H + BB + HBP) / (AB + BB + HBP + SF) = (4 + 2 + 1) / (10 + 2 + 1 + 1) = 7/14 = .500
    expect(obp).toBeCloseTo(0.5, 6);
    // TB = H + 2B + 2·3B + 3·HR = 4 + 1 + 0 + 3 = 8; SLG = 8/10 = .800
    expect(slg).toBeCloseTo(0.8, 6);
    // OPS = .500 + .800 = 1.300
    expect(ops).toBeCloseTo(1.3, 6);
  });

  it('returns null rates when every denominator is zero (no fabricated .000)', () => {
    expect(computeCareerSlashLine([])).toEqual({ obp: null, slg: null, ops: null });
    expect(computeCareerSlashLine([row({})])).toEqual({ obp: null, slg: null, ops: null });
  });

  it('yields a non-null OBP but null SLG/OPS when a player only walks (zero AB)', () => {
    // A plate appearance that is all walks: OBP denominator is non-zero, AB is zero.
    const { obp, slg, ops } = computeCareerSlashLine([row({ walks: 2, hit_by_pitch: 1 })]);
    // OBP = (0 + 2 + 1) / (0 + 2 + 1 + 0) = 3/3 = 1.000
    expect(obp).toBeCloseTo(1, 6);
    expect(slg).toBeNull(); // zero AB → null, not 0
    expect(ops).toBeNull(); // null when either component is null
  });
});
