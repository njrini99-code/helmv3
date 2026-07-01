// =============================================================================
// src/contracts/baseball/stats/batting-invariants.test.ts
//
// PRODUCT TRUTH THIS FILE PINS:
//   AVG/OBP/SLG/OPS/ISO are computed by ONE fixed formula set, and every
//   derived rate degrades to `null` — never a fabricated `0`/`.000` — on a
//   zero denominator. A coach reading the Stats Center grid must be able to
//   trust that a blank cell means "no data", not "this player hit .000".
//
// Source of truth: `finalizeBatting` in
// `src/lib/baseball/read-models/stats-center.ts` (the team-wide Stats Center
// read model). The per-game box-score save path
// (`src/app/baseball/actions/games.ts`) computes the SAME formulas inline via
// private `computeBattingRates`/`computePitchingRates` helpers (not exported,
// so this file pins them as a static text contract rather than importing —
// see the companion describe block below). Both surfaces must agree: a saved
// box-score line's stamped rates and the Stats Center's derived rates for the
// same line are the same math.
// =============================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  emptyBatting,
  finalizeBatting,
  type BattingSplit,
} from '@/lib/baseball/read-models/stats-center';

function battingFixture(overrides: Partial<BattingSplit> = {}): BattingSplit {
  return { ...emptyBatting(), ...overrides };
}

describe('Batting invariants (#377) — stats-center.finalizeBatting', () => {
  it('AVG = H / AB', () => {
    const b = finalizeBatting(battingFixture({ ab: 20, h: 7 }));
    expect(b.avg).toBeCloseTo(7 / 20, 3);
  });

  it('SLG derives from total bases (1B + 2*2B + 3*3B + 4*HR) / AB', () => {
    const b = finalizeBatting(
      battingFixture({ ab: 10, h: 5, doubles: 1, triples: 1, hr: 1 }),
    );
    // singles = 5 - 1 - 1 - 1 = 2; TB = 2 + 2*1 + 3*1 + 4*1 = 11
    expect(b.tb).toBe(11);
    expect(b.slg).toBeCloseTo(11 / 10, 3);
  });

  it('OBP = (H + BB + HBP) / (AB + BB + HBP + SF)', () => {
    const b = finalizeBatting(
      battingFixture({ ab: 12, h: 4, bb: 3, hbp: 1, sf: 1 }),
    );
    expect(b.obp).toBeCloseTo((4 + 3 + 1) / (12 + 3 + 1 + 1), 3);
  });

  it('OPS = OBP + SLG', () => {
    const b = finalizeBatting(
      battingFixture({ ab: 10, h: 4, doubles: 1, bb: 2, hbp: 0, sf: 0 }),
    );
    expect(b.obp).not.toBeNull();
    expect(b.slg).not.toBeNull();
    expect(b.ops).toBeCloseTo((b.obp as number) + (b.slg as number), 3);
  });

  it('ISO = SLG - AVG', () => {
    const b = finalizeBatting(battingFixture({ ab: 10, h: 5, doubles: 2 }));
    expect(b.iso).toBeCloseTo((b.slg as number) - (b.avg as number), 3);
  });

  describe('null-honesty — missing data is never rendered as 0/.000', () => {
    it('zero AB -> avg, slg, iso are null (not .000)', () => {
      const b = finalizeBatting(battingFixture({ ab: 0, bb: 1, hbp: 1 }));
      expect(b.avg).toBeNull();
      expect(b.slg).toBeNull();
      expect(b.iso).toBeNull();
    });

    it('zero OBP denominator (AB+BB+HBP+SF=0) -> obp is null', () => {
      const b = finalizeBatting(
        battingFixture({ ab: 0, bb: 0, hbp: 0, sf: 0 }),
      );
      expect(b.obp).toBeNull();
    });

    it('OPS is null whenever EITHER OBP or SLG is null', () => {
      // AB=0 -> SLG null even though OBP has a real denominator via BB.
      const onlyWalks = finalizeBatting(battingFixture({ ab: 0, bb: 4 }));
      expect(onlyWalks.slg).toBeNull();
      expect(onlyWalks.obp).not.toBeNull();
      expect(onlyWalks.ops).toBeNull();
    });

    it('a fully empty split has every derived rate null, not zero', () => {
      const b = finalizeBatting(emptyBatting());
      for (const rate of [b.avg, b.obp, b.slg, b.ops, b.iso] as const) {
        expect(rate).toBeNull();
        expect(rate).not.toBe(0);
      }
    });
  });
});

// -----------------------------------------------------------------------------
// Companion: the box-score save path (games.ts) computes the SAME formulas via
// private, unexported helpers (computeBattingRates/computePitchingRates) — so
// this contract pins them as a static text match rather than importing.
// -----------------------------------------------------------------------------

const repo = process.cwd();
const read = (path: string) => readFileSync(join(repo, path), 'utf8');

describe('Batting invariants (#377) — games.ts box-score save mirrors the same math', () => {
  const src = read('src/app/baseball/actions/games.ts');

  it('computeBattingRates exists and is honest on zero AB', () => {
    expect(src).toContain('function computeBattingRates');
    expect(src).toMatch(/if \(ab === 0\) return \{ avg: null, obp: null, slg: null, ops: null \};/);
  });

  it('computeBattingRates uses the identical AVG/SLG/OBP/OPS formulas', () => {
    expect(src).toContain('const avg = h / ab;');
    expect(src).toMatch(/const singles = h - doubles - triples - hr;/);
    expect(src).toContain('const slg = (singles + 2 * doubles + 3 * triples + 4 * hr) / ab;');
    expect(src).toContain('const obp = pa > 0 ? (h + bb + hbp) / pa : null;');
    expect(src).toContain('const ops = obp !== null ? obp + slg : null;');
  });
});
