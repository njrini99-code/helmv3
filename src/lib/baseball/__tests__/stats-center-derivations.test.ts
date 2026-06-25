// =============================================================================
// stats-center-derivations.test.ts
//
// Guards the deepened Stats Center read-model derivation surface: the full V6
// official batting/pitching rate set + the catching/fielding/baserunning splits,
// and — most importantly — the HONESTY CONTRACT (null rates on zero denominators,
// derived singles/TB, no fabricated zeros). Pure functions only; no DB.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  emptyBatting,
  emptyPitching,
  emptyCatching,
  emptyFielding,
  emptyBaserunning,
  finalizeBatting,
  finalizePitching,
  finalizeCatching,
  finalizeFielding,
  finalizeBaserunning,
} from '@/lib/baseball/read-models/stats-center';

describe('finalizeBatting', () => {
  it('returns null rates on an empty (zero-denominator) split — no fake .000', () => {
    const b = finalizeBatting(emptyBatting());
    expect(b.avg).toBeNull();
    expect(b.obp).toBeNull();
    expect(b.slg).toBeNull();
    expect(b.ops).toBeNull();
    expect(b.iso).toBeNull();
    expect(b.bbPct).toBeNull();
    expect(b.kPct).toBeNull();
    expect(b.bbK).toBeNull();
    expect(b.xbhPct).toBeNull();
    expect(b.sbPct).toBeNull();
    expect(b.rc).toBeNull();
    expect(b.wobaEst).toBeNull();
    // counting zeros are TRUE zeros (the row-level `noData` flag carries "no data")
    expect(b.pa).toBe(0);
    expect(b.tb).toBe(0);
    expect(b.singles).toBe(0);
  });

  it('derives singles, total bases, PA, and the full rate set correctly', () => {
    const b = finalizeBatting({
      ...emptyBatting(),
      ab: 10, h: 4, doubles: 1, triples: 0, hr: 1, bb: 2, k: 3, hbp: 1, sf: 1,
      ibb: 0,
    });
    // singles = 4 − 1 − 0 − 1 = 2; TB = 2 + 2 + 0 + 4 = 8
    expect(b.singles).toBe(2);
    expect(b.tb).toBe(8);
    // PA = AB(10) + BB(2) + HBP(1) + SF(1) + SH(0) = 14
    expect(b.pa).toBe(14);
    expect(b.avg).toBeCloseTo(0.4, 3); // 4/10
    expect(b.slg).toBeCloseTo(0.8, 3); // 8/10
    expect(b.iso).toBeCloseTo(0.4, 3); // .800 − .400
    // OBP = (H+BB+HBP)/(AB+BB+HBP+SF) = (4+2+1)/(10+2+1+1) = 7/14 = .500
    expect(b.obp).toBeCloseTo(0.5, 3);
    expect(b.ops).toBeCloseTo(1.3, 3);
    expect(b.bbPct).toBeCloseTo(2 / 14, 3);
    expect(b.kPct).toBeCloseTo(3 / 14, 3);
    expect(b.bbK).toBeCloseTo(2 / 3, 2);
    expect(b.xbhPct).toBeCloseTo(2 / 4, 3); // (1+0+1)/4
    expect(b.rc).not.toBeNull(); // (H+BB)*TB/(AB+BB) = 6*8/12 = 4
    expect(b.rc).toBeCloseTo(4, 1);
    expect(b.wobaEst).not.toBeNull();
  });

  it('null SB% only when no attempts; real rate with attempts', () => {
    expect(finalizeBatting({ ...emptyBatting(), sb: 0, cs: 0 }).sbPct).toBeNull();
    expect(finalizeBatting({ ...emptyBatting(), sb: 3, cs: 1 }).sbPct).toBeCloseTo(0.75, 3);
  });
});

describe('finalizePitching', () => {
  it('returns null rates on an empty split', () => {
    const p = finalizePitching(emptyPitching());
    expect(p.era).toBeNull();
    expect(p.whip).toBeNull();
    expect(p.k9).toBeNull();
    expect(p.bb9).toBeNull();
    expect(p.hr9).toBeNull();
    expect(p.h9).toBeNull();
    expect(p.kPct).toBeNull();
    expect(p.bbPct).toBeNull();
    expect(p.oppBa).toBeNull();
    expect(p.strikePct).toBeNull();
    expect(p.fpsPct).toBeNull();
    expect(p.lobPct).toBeNull();
  });

  it('derives IP-based rates and BF-based rates', () => {
    const p = finalizePitching({
      ...emptyPitching(),
      ip: 9, er: 2, bb: 3, h: 6, k: 9, hr: 1, bf: 36, hbp: 1,
      pitches: 120, strikes: 80, firstPitchStrikes: 22, r: 2,
    });
    expect(p.era).toBeCloseTo(2.0, 2); // 9*2/9
    expect(p.whip).toBeCloseTo(1.0, 2); // (3+6)/9
    expect(p.k9).toBeCloseTo(9.0, 2);
    expect(p.bb9).toBeCloseTo(3.0, 2);
    expect(p.hr9).toBeCloseTo(1.0, 2);
    expect(p.kPct).toBeCloseTo(9 / 36, 3);
    expect(p.bbPct).toBeCloseTo(3 / 36, 3);
    // AB-against ≈ BF − BB − HBP = 36 − 3 − 1 = 32; oppBA = 6/32 ≈ .188 (rounded 3dp)
    expect(p.oppBa).toBeCloseTo(6 / 32, 2);
    expect(p.strikePct).toBeCloseTo(80 / 120, 3);
    expect(p.fpsPct).toBeCloseTo(22 / 36, 3);
    expect(p.lobPct).not.toBeNull();
  });

  it('oppBA is null when AB-against collapses to <= 0', () => {
    const p = finalizePitching({ ...emptyPitching(), h: 2, bf: 2, bb: 2 });
    expect(p.oppBa).toBeNull(); // 2 − 2 − 0 = 0
  });
});

describe('finalizeCatching / Fielding / Baserunning honesty', () => {
  it('catching rates null on no attempts; real when present', () => {
    expect(finalizeCatching(emptyCatching()).csPct).toBeNull();
    const c = finalizeCatching({
      ...emptyCatching(),
      caughtStealing: 3, stolenBasesAllowed: 1, blocksMade: 8, blockOpportunities: 10,
    });
    expect(c.csPct).toBeCloseTo(0.75, 3);
    expect(c.blockPct).toBeCloseTo(0.8, 3);
  });

  it('fielding % derives from chances and is null with no chances', () => {
    expect(finalizeFielding(emptyFielding()).fldPct).toBeNull();
    const f = finalizeFielding({ ...emptyFielding(), putouts: 8, assists: 1, errors: 1 });
    expect(f.chances).toBe(10);
    expect(f.fldPct).toBeCloseTo(0.9, 3);
  });

  it('baserunning SB% null with no attempts; real when present', () => {
    expect(finalizeBaserunning(emptyBaserunning()).sbPct).toBeNull();
    const b = finalizeBaserunning({ ...emptyBaserunning(), stolenBases: 4, caughtStealing: 1 });
    expect(b.sbPct).toBeCloseTo(0.8, 3);
  });
});
