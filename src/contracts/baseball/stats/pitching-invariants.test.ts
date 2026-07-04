// =============================================================================
// src/contracts/baseball/stats/pitching-invariants.test.ts
//
// PRODUCT TRUTH THIS FILE PINS:
//   ERA/WHIP/K9/BB9 are computed by ONE fixed formula set, and every derived
//   rate is `null` when IP is zero — never a fabricated 0.00 ERA for a pitcher
//   who has not thrown an inning.
//
// #434 UPDATE: `stats-center.ts`'s `finalizePitching` (and its season
// aggregation, `dst.ip = sumInningsPitched(...)`) now correctly treats the
// tenths digit of `ip` as OUTS in traditional box-score notation — "6.1" /
// "6.2" mean 6⅓ / 6⅔ innings (19 / 20 outs), NOT 6.1/6.2 decimal innings —
// converting via `ipToInnings`/`sumInningsPitched` (src/lib/baseball/innings.ts,
// see also innings.test.ts) before any rate divides by it. This file pins that
// corrected behavior.
//
// The box-score SAVE path (`games.ts`'s `computePitchingRates`, including CSV
// imports that read `innings_pitched` as the same notation value) must use the
// same `ipToInnings` conversion before calculating rates. Otherwise a saved
// game can persist different ERA/WHIP/K9 than the Stats Center read model later
// derives from the same IP/counting stats.
// =============================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  emptyPitching,
  finalizePitching,
  type PitchingSplit,
} from '@/lib/baseball/read-models/stats-center';
import { ipToInnings } from '@/lib/baseball/innings';

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

  it('rates divide by TRUE innings (outs / 3), not the raw notation value — 6.2 means 6⅔, not 6.2 decimal innings (#434)', () => {
    // "6.2" in traditional box-score notation is 6 innings + 2 outs (20 outs
    // total), i.e. 6⅔ true innings — NOT 6.2 decimal innings. Dividing by the
    // raw notation value (pre-#434 behavior) understates true innings and
    // inflates every rate stat.
    const trueInnings = ipToInnings(6.2);
    expect(trueInnings).toBeCloseTo(20 / 3, 4);

    const p = finalizePitching(pitchingFixture({ ip: 6.2, er: 5, bb: 2, h: 6, k: 8 }));
    expect(p.era).toBeCloseTo((5 * 9) / trueInnings, 2);
    expect(p.whip).toBeCloseTo((2 + 6) / trueInnings, 2);
    expect(p.k9).toBeCloseTo((8 * 9) / trueInnings, 2);
    expect(p.bb9).toBeCloseTo((2 * 9) / trueInnings, 2);
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
    expect(src).toContain("import { ipToInnings } from '@/lib/baseball/innings';");
    expect(src).toContain('const innings = ipToInnings(ip);');
    expect(src).toContain('era: parseFloat((9 * er / innings).toFixed(2)),');
    expect(src).toContain('whip: parseFloat(((bb + h) / innings).toFixed(3)),');
    expect(src).toContain('k9: parseFloat((9 * k / innings).toFixed(2)),');
    expect(src).toContain('bb9: parseFloat((9 * bb / innings).toFixed(2)),');
  });

  it('the CSV parser reads innings_pitched as box-score notation and the shared save helper converts it for rates', () => {
    expect(src).toMatch(/ip:\s*getFloat\('innings_pitched'\)/);
    expect(src).toContain('const innings = ipToInnings(ip);');
  });
});
