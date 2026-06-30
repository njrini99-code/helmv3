// =============================================================================
// src/contracts/baseball/stats/pitching-invariants.test.ts
//
// PRODUCT TRUTH THIS FILE PINS:
//   ERA/WHIP/K9/BB9 are computed by ONE fixed formula set, and every derived
//   rate is `null` when IP is zero — never a fabricated 0.00 ERA for a pitcher
//   who has not thrown an inning.
//
// NEEDS-DECISION (documented in
// docs/operations/BASEBALLHELM_BUSINESS_CONTRACT_MATRIX.md): `finalizePitching`
// (and the box-score save path) treat `ip` as a plain accumulated float with NO
// traditional-notation conversion. Real college box scores often enter IP as
// "6.1" / "6.2" (6⅓ / 6⅔ innings, NOT 6.1/6.2 decimal innings). Nothing in this
// codebase converts that notation to true thirds before storing or summing —
// `games.ts`'s CSV parser does `getFloat('innings_pitched')` verbatim, and
// `addPitching` sums raw floats across appearances. This file pins the ACTUAL
// behavior (raw decimal arithmetic, no thirds conversion) rather than the
// aspirational "innings are normalized" claim, because that normalization does
// not exist in the source.
// =============================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  emptyPitching,
  finalizePitching,
  type PitchingSplit,
} from '@/lib/baseball/read-models/stats-center';

function pitchingFixture(overrides: Partial<PitchingSplit> = {}): PitchingSplit {
  return { ...emptyPitching(), ...overrides };
}

describe('Pitching invariants (#377) — stats-center.finalizePitching', () => {
  it('ERA = ER * 9 / IP', () => {
    const p = finalizePitching(pitchingFixture({ ip: 9, er: 3 }));
    expect(p.era).toBeCloseTo((3 * 9) / 9, 2);
  });

  it('WHIP = (BB + H) / IP', () => {
    const p = finalizePitching(pitchingFixture({ ip: 6, bb: 2, h: 4 }));
    expect(p.whip).toBeCloseTo((2 + 4) / 6, 2);
  });

  it('K/9 and BB/9 scale the per-IP rate by 9', () => {
    const p = finalizePitching(pitchingFixture({ ip: 9, k: 12, bb: 3 }));
    expect(p.k9).toBeCloseTo((12 * 9) / 9, 2);
    expect(p.bb9).toBeCloseTo((3 * 9) / 9, 2);
  });

  it('every IP-denominated rate is null when IP is zero — never a fake 0.00 ERA', () => {
    const p = finalizePitching(pitchingFixture({ ip: 0, er: 0, bb: 1, h: 1, k: 1 }));
    expect(p.era).toBeNull();
    expect(p.whip).toBeNull();
    expect(p.k9).toBeNull();
    expect(p.bb9).toBeNull();
    expect(p.hr9).toBeNull();
    expect(p.h9).toBeNull();
  });

  it('innings accumulate as raw float addition with no thirds-notation conversion (ground truth, not aspirational)', () => {
    // Two relief outings entered in traditional notation as "0.2" (2/3 inning
    // each) sum to 1.4 here, NOT the true 1⅓ (1.333...) a thirds-aware
    // accumulator would produce. This is the documented needs-decision gap.
    const ip = 0.2 + 0.2;
    expect(ip).toBeCloseTo(0.4, 5);
    const p = finalizePitching(pitchingFixture({ ip, er: 1, bb: 0, h: 0, k: 0 }));
    expect(p.era).toBeCloseTo((1 * 9) / 0.4, 2);
  });
});

// -----------------------------------------------------------------------------
// Companion: the box-score save path (games.ts) computes the SAME formulas via
// a private, unexported helper — pinned as a static text match.
// -----------------------------------------------------------------------------

const repo = process.cwd();
const read = (path: string) => readFileSync(join(repo, path), 'utf8');

describe('Pitching invariants (#377) — games.ts box-score save mirrors the same math', () => {
  const src = read('src/app/baseball/actions/games.ts');

  it('computePitchingRates exists and is honest on zero IP', () => {
    expect(src).toContain('function computePitchingRates');
    expect(src).toMatch(/if \(ip === 0\) return \{ era: null, whip: null, k9: null, bb9: null \};/);
  });

  it('computePitchingRates uses the identical ERA/WHIP/K9/BB9 formulas', () => {
    expect(src).toContain('era: parseFloat((9 * er / ip).toFixed(2)),');
    expect(src).toContain('whip: parseFloat(((bb + h) / ip).toFixed(3)),');
    expect(src).toContain('k9: parseFloat((9 * k / ip).toFixed(2)),');
    expect(src).toContain('bb9: parseFloat((9 * bb / ip).toFixed(2)),');
  });

  it('the CSV parser reads innings_pitched as a raw float with no thirds-notation conversion', () => {
    expect(src).toMatch(/ip:\s*getFloat\('innings_pitched'\)/);
    expect(src).not.toMatch(/innings.*thirds|thirds.*innings|normalizeInnings/i);
  });
});
