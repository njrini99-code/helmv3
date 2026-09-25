/**
 * Context narrowing (`engine/context-narrowing.ts`): each gate at pass /
 * fail / boundary, the 49ffe06d calibration shape (share is exposure, not
 * weakness), the par-5 lay-up exclusion, and the wording (counts stated,
 * never causal).
 */
import { describe, it, expect } from 'vitest';

import {
  NARROW_MIN_FAILURES,
  SHAPE_MIN_COVERED,
  evaluateShape,
  evaluateSlice,
  narrowApproach,
  narrowParScoring,
  narrowTee,
  pickSlice,
  shapeCounts,
  type NarrowItem,
} from '@/lib/coachhelm/v3/engine/context-narrowing';
import type { HoleContext, ShotFact } from '@/lib/coachhelm/v3/context/types';

const CAUSAL = /because|caused|under-club|over-club|wind|tempo|alignment|due to/i;

// ---------------------------------------------------------------------------
// Slice gate
// ---------------------------------------------------------------------------

describe('evaluateSlice', () => {
  const k = { par: 3 as const, length: 'long' as const };

  it('share path passes: 8 failures, 62% of the population, rate above the rest', () => {
    // slice 8/10 (80%), rest 5/20 (25%), share 8/13 = 62%
    const c = evaluateSlice(k, { attempts: 10, failures: 8 }, { attempts: 30, failures: 13 });
    expect(c.passed).toBe(true);
    expect(c.via).toBe('share');
  });

  it('share boundary: exactly 60% of failures with an equal rate passes', () => {
    // slice 9/15 (60%), rest 6/10 (60%), share 9/15 = 60%
    const c = evaluateSlice(k, { attempts: 15, failures: 9 }, { attempts: 25, failures: 15 });
    expect(c.share).toBeCloseTo(0.6);
    expect(c.passed).toBe(true);
  });

  it('failure floor: 7 failures never passes, whatever the share', () => {
    const c = evaluateSlice(k, { attempts: 7, failures: NARROW_MIN_FAILURES - 1 }, { attempts: 20, failures: 8 });
    expect(c.passed).toBe(false);
  });

  it('share is exposure, not weakness: a big share at a LOWER rate fails (49ffe06d, 175+ yd)', () => {
    // Calibration 2026-09-25 (last 40 rounds, par-5 lay-ups excluded):
    // par 3s 21 misses of 51 (41%), par 4s 13 of 18 (72%). Par 3s hold 62%
    // of the misses but miss far LESS often — not a concentration.
    const par3 = evaluateSlice({ par: 3, length: null }, { attempts: 51, failures: 21 }, { attempts: 69, failures: 34 });
    expect(par3.share).toBeGreaterThan(0.6);
    expect(par3.passed).toBe(false);
    // Par 4s: 13 failures at 72% vs 41% — the lift path.
    const par4 = evaluateSlice({ par: 4, length: null }, { attempts: 18, failures: 13 }, { attempts: 69, failures: 34 });
    expect(par4.passed).toBe(true);
    expect(par4.via).toBe('lift');
  });

  it('lift boundary: 1.25× and +10 points passes; just under fails', () => {
    // slice 10/20 = 50%, rest 16/40 = 40%: lift 1.25, +10pp
    const pass = evaluateSlice(k, { attempts: 20, failures: 10 }, { attempts: 60, failures: 26 });
    expect(pass.via).toBe('lift');
    // slice 10/20 = 50%, rest 17/40 = 42.5%: lift 1.18
    const fail = evaluateSlice(k, { attempts: 20, failures: 10 }, { attempts: 60, failures: 27 });
    expect(fail.passed).toBe(false);
  });

  it('lift needs a real rest: fewer than 8 rest attempts fails the lift path', () => {
    // slice 8/10 = 80%, rest 1/7 = 14%, share 8/9 = 89% → share path passes;
    // make the share fail to test lift alone: slice 8/10, rest 6/7
    const c = evaluateSlice(k, { attempts: 10, failures: 8 }, { attempts: 17, failures: 9 });
    expect(c.via).toBe('share');
    const lift = evaluateSlice(k, { attempts: 10, failures: 8 }, { attempts: 17, failures: 14 });
    expect(lift.passed).toBe(false);
  });

  it('a slice that is the whole population is not a narrowing', () => {
    const c = evaluateSlice(k, { attempts: 20, failures: 12 }, { attempts: 20, failures: 12 });
    expect(c.passed).toBe(false);
  });
});

describe('pickSlice', () => {
  const item = (par: number, length: NarrowItem['length'], failed: boolean): NarrowItem => ({
    round_id: 'r',
    par,
    length,
    failed,
    direction: null,
  });

  it('prefers the par × length slice over its own whole par on a tie', () => {
    const items = [
      ...Array.from({ length: 10 }, () => item(3, 'long', true)),
      ...Array.from({ length: 2 }, () => item(3, 'long', false)),
      ...Array.from({ length: 20 }, () => item(4, 'mid', false)),
      ...Array.from({ length: 2 }, () => item(4, 'mid', true)),
    ];
    const { chosen } = pickSlice(items);
    expect(chosen?.label).toBe('long par 3s');
  });

  it('returns null when nothing concentrates', () => {
    const items = [
      ...Array.from({ length: 10 }, (_, i) => item(3, 'mid', i < 4)),
      ...Array.from({ length: 10 }, (_, i) => item(4, 'mid', i < 4)),
    ];
    expect(pickSlice(items).chosen).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Shape gate
// ---------------------------------------------------------------------------

describe('evaluateShape', () => {
  it('both axes pass → "short-right" with its counts', () => {
    const dirs = ['short_right', 'short_right', 'short_right', 'short', 'short_right', 'right', 'short_left', 'long_right', 'short_right', 'short_right'];
    const s = evaluateShape(dirs);
    expect(s.passed).toBe(true);
    expect(s.label).toBe('short-right');
    expect(shapeCounts(s)).toBe('8 of 9 short, 8 of 9 right');
  });

  it('one axis only → the single side ("short"), left/right balanced', () => {
    const dirs = ['short_left', 'short_right', 'short_left', 'short_right', 'short', 'short', 'short_left', 'short_right'];
    const s = evaluateShape(dirs);
    expect(s.label).toBe('short');
    expect(s.leftRight).toBeNull();
  });

  it('coverage floor: 7 recorded directions is not enough', () => {
    const dirs = [...Array.from({ length: SHAPE_MIN_COVERED - 1 }, () => 'short'), null];
    const s = evaluateShape(dirs);
    expect(s.passed).toBe(false);
    expect(s.reason).toMatch(/only 7 of 8 misses have a recorded direction/);
  });

  it('coverage share: 8 recorded of 12 misses (67%) is under 70%', () => {
    const dirs = [...Array.from({ length: 8 }, () => 'short'), null, null, null, null];
    expect(evaluateShape(dirs).passed).toBe(false);
  });

  it('share boundary: 6 of 10 on one side passes, 5 of 9 does not', () => {
    const pass = evaluateShape([...Array(6).fill('short'), ...Array(4).fill('long')]);
    expect(pass.label).toBe('short');
    const fail = evaluateShape([...Array(5).fill('short'), ...Array(4).fill('long')]);
    expect(fail.passed).toBe(false);
    expect(fail.reason).toMatch(/no side dominates/);
  });

  it('tee axes: left/right only', () => {
    const s = evaluateShape(Array(9).fill('short_right'), { shortLong: false, leftRight: true });
    expect(s.label).toBe('right');
  });
});

// ---------------------------------------------------------------------------
// Whole narrowings on built facts
// ---------------------------------------------------------------------------

let seq = 0;
function hole(round: string, n: number, par: number, yardage: number | null, total = par): HoleContext {
  return { round_id: round, course_id: 'c1', hole_number: n, par, yardage, total_strokes: total, penalty_strokes: 0, putts: 2, gir: null };
}
function approach(round: string, n: number, yards: number, onGreen: boolean, dir: string | null = null): ShotFact {
  seq += 1;
  return {
    round_id: round,
    hole_number: n,
    shot_number: 2,
    shot_type: 'approach',
    club_type: 'non_driver',
    intent: 'unknown',
    distance_to_hole_before_feet: yards * 3,
    distance_to_hole_after_feet: onGreen ? 25 : 30,
    lie_before: 'fairway',
    lie_after: onGreen ? 'green' : 'rough',
    result: onGreen ? 'green' : 'rough',
    is_penalty: false,
    putt_made: null,
    miss_direction: dir,
    observed_at: `2026-07-0${(seq % 9) + 1}T00:00:00Z`,
  };
}

/** 4 rounds × holes: long par 4s (440 yd) miss short-right from 190 yd;
 *  par 3s (160 yd, 'mid') mostly hit; par 5 lay-ups from 230 yd. */
function fixture() {
  const holes: HoleContext[] = [];
  const facts: ShotFact[] = [];
  for (let r = 0; r < 4; r++) {
    const rid = `r${r}`;
    for (let h = 1; h <= 3; h++) {
      holes.push(hole(rid, h, 4, 440));
      facts.push(approach(rid, h, 190, h === 3, h === 3 ? null : 'short_right'));
    }
    for (let h = 4; h <= 7; h++) {
      holes.push(hole(rid, h, 3, 200));
      facts.push(approach(rid, h, 195, h !== 7, h === 7 ? 'long' : null));
    }
    holes.push(hole(rid, 8, 5, 560));
    facts.push(approach(rid, 8, 230, false, 'right'));
  }
  return { holes, facts };
}

describe('narrowApproach', () => {
  it('175+ yd → long par 4s → short-right, with counts, lay-ups left out', () => {
    const { holes, facts } = fixture();
    const n = narrowApproach(facts, holes, '175_plus_ft');
    // 4 rounds × (3 par-4 + 4 par-3) = 28 attempts; misses 8 + 4 = 12
    expect(n.attempts).toBe(28);
    expect(n.failures).toBe(12);
    expect(n.excluded.layup).toBe(4);
    expect(n.path).toEqual(['175+ yd', 'long par 4s', 'short-right']);
    expect(n.stoppedAt).toBeNull();
    expect(n.sentence).toContain('12 of 28 approaches from 175+ yd missed the green (4 rounds)');
    expect(n.sentence).toContain('8 of 12 misses came on long par 4s');
    expect(n.sentence).toContain('most misses on long par 4s finish short-right (8 of 8 short, 8 of 8 right');
    expect(n.sentence).toContain('4 par-5 shots from 175+ yd that did not find the green are left out as likely lay-ups');
    expect(n.sentence).toMatch(/^Observed, not a cause:/);
    expect(n.sentence).not.toMatch(CAUSAL);
  });

  it('stops at the population when the band is thin', () => {
    const { holes, facts } = fixture();
    const n = narrowApproach(facts.filter((f) => f.round_id === 'r0'), holes, '175_plus_ft');
    expect(n.path).toEqual([]);
    expect(n.stoppedAt).toBe('length');
    expect(n.sentence).toMatch(/^Not narrowed: 3 of 7 approaches from 175\+ yd missed the green \(1 round\): too few to narrow/);
  });

  it('par step fails → shape read over the whole band, stop reason stated', () => {
    const { holes } = fixture();
    // Same miss rate on par 3s and 4s (8 of 12 each), all short.
    const facts: ShotFact[] = [];
    for (let r = 0; r < 4; r++) {
      for (let h = 1; h <= 3; h++) facts.push(approach(`r${r}`, h, 190, h === 1, h === 1 ? null : 'short'));
      for (let h = 4; h <= 6; h++) facts.push(approach(`r${r}`, h, 195, h === 6, h === 6 ? null : 'short'));
    }
    const n = narrowApproach(facts, holes, '175_plus_ft');
    expect(n.slice).toBeNull();
    expect(n.stoppedAt).toBe('par');
    expect(n.path).toEqual(['175+ yd', 'short']);
    expect(n.sentence).toContain('Not narrowed further: no par or hole length holds 8+ misses at a clearly higher rate');
  });
});

describe('narrowTee', () => {
  it('reads left/right only, on par 4/5 tee shots', () => {
    const holes: HoleContext[] = [];
    const facts: ShotFact[] = [];
    for (let r = 0; r < 4; r++) {
      for (let h = 1; h <= 4; h++) {
        holes.push(hole(`t${r}`, h, 4, 400));
        const miss = h !== 4;
        facts.push({
          ...approach(`t${r}`, h, 400, false),
          shot_number: 1,
          shot_type: 'tee',
          lie_before: 'tee',
          lie_after: miss ? 'rough' : 'fairway',
          result: miss ? 'rough' : 'fairway',
          miss_direction: miss ? 'right' : null,
        });
      }
    }
    const n = narrowTee(facts, holes);
    expect(n.failures).toBe(12);
    expect(n.shape?.label).toBe('right');
    expect(n.sentence).toContain('12 of 16 tee shots on par 4s and 5s missed the fairway');
  });
});

describe('narrowParScoring', () => {
  it('par 3: long par 3s carry the over-par holes; tee-shot shape on those holes', () => {
    const holes: HoleContext[] = [];
    const facts: ShotFact[] = [];
    for (let r = 0; r < 5; r++) {
      holes.push(hole(`p${r}`, 1, 3, 205, 4));
      facts.push({ ...approach(`p${r}`, 1, 205, false, 'short_left'), shot_number: 1 });
      holes.push(hole(`p${r}`, 2, 3, 200, r % 2 === 0 ? 4 : 3));
      facts.push({ ...approach(`p${r}`, 2, 200, r % 2 !== 0, r % 2 === 0 ? 'short_left' : null), shot_number: 1 });
      holes.push(hole(`p${r}`, 3, 3, 140, 3));
      holes.push(hole(`p${r}`, 4, 3, 145, 3));
    }
    const n = narrowParScoring(facts, holes, 3);
    expect(n.failures).toBe(8);
    expect(n.slice?.label).toBe('long par 3s');
    expect(n.shape?.label).toBe('short-left');
    expect(n.path).toEqual(['par 3s', 'long par 3s', 'short-left']);
  });

  it('par 4/5 stop at the length step (no shape read)', () => {
    const holes = Array.from({ length: 12 }, (_, i) => hole(`q${i % 4}`, i, 4, i < 6 ? 450 : 360, i < 6 ? 5 : 4));
    const n = narrowParScoring([], holes, 4);
    expect(n.shape).toBeNull();
    expect(n.steps.map((s) => s.level)).toEqual(['length']);
  });
});
