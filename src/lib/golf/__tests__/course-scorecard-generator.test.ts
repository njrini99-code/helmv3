import { describe, it, expect } from 'vitest';
import {
  seededRng,
  buildParSequence,
  buildYardages,
  buildHandicaps,
  buildCourseSeed,
  PAR_COMPOSITIONS,
  type CourseFact,
} from '@/lib/golf/course-scorecard-generator';

describe('seededRng', () => {
  it('is deterministic for the same seed', () => {
    const a = seededRng('Pinehurst No. 2');
    const b = seededRng('Pinehurst No. 2');
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces a different sequence for a different seed', () => {
    const a = seededRng('Pinehurst No. 2');
    const b = seededRng('Bethpage Black');
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });
});

describe('buildParSequence', () => {
  it('sums to the course par and holds exactly 18 holes for every supported par', () => {
    for (const par of Object.keys(PAR_COMPOSITIONS).map(Number)) {
      const rng = seededRng(`par-${par}`);
      const pars = buildParSequence(par, rng);
      expect(pars).toHaveLength(18);
      expect(pars.reduce((a, b) => a + b, 0)).toBe(par);
      for (const p of pars) expect([3, 4, 5]).toContain(p);
    }
  });

  it('matches the PAR_COMPOSITIONS counts (right number of 3s/4s/5s, just shuffled)', () => {
    const rng = seededRng('composition-check');
    const pars = buildParSequence(72, rng);
    const comp = PAR_COMPOSITIONS[72]!;
    expect(pars.filter((p) => p === 3)).toHaveLength(comp.p3);
    expect(pars.filter((p) => p === 4)).toHaveLength(comp.p4);
    expect(pars.filter((p) => p === 5)).toHaveLength(comp.p5);
  });

  it('rejects an unsupported par', () => {
    expect(() => buildParSequence(69, seededRng('x'))).toThrow(/Unsupported par/);
  });
});

describe('buildYardages', () => {
  it('sums to EXACTLY the requested total, whatever the base range rounding leaves over', () => {
    const rng = seededRng('yardage-sum-check');
    const pars = buildParSequence(72, rng);
    for (const target of [6200, 6455, 7005, 7288, 7468]) {
      const yards = buildYardages(pars, target, seededRng(`t-${target}`));
      expect(yards).toHaveLength(18);
      expect(yards.reduce((a, b) => a + b, 0)).toBe(target);
    }
  });

  it('keeps every hole within a plausible yardage range for its par', () => {
    const rng = seededRng('rounding-check');
    const pars = buildParSequence(71, rng);
    const yards = buildYardages(pars, 6900, seededRng('rounding-check-2'));
    yards.forEach((y, i) => {
      const par = pars[i];
      if (par === 3) expect(y).toBeGreaterThanOrEqual(120);
      if (par === 5) expect(y).toBeLessThanOrEqual(650);
      expect(Number.isInteger(y)).toBe(true);
    });
  });
});

describe('buildHandicaps', () => {
  it('is a valid 1..18 stroke-index permutation', () => {
    const rng = seededRng('hcp-permutation');
    const pars = buildParSequence(72, rng);
    const yards = buildYardages(pars, 7150, seededRng('hcp-permutation-yds'));
    const hcp = buildHandicaps(pars, yards, seededRng('hcp-permutation-hcp'));
    expect(hcp).toHaveLength(18);
    expect(new Set(hcp)).toEqual(new Set(Array.from({ length: 18 }, (_, i) => i + 1)));
  });

  it('never hands stroke index 1 or 2 to a par 3', () => {
    // Run across many seeds — the realism nudge must hold every time, not
    // just by luck on one seed.
    for (let i = 0; i < 25; i++) {
      const seed = `hcp-par3-guard-${i}`;
      const rng = seededRng(seed);
      const pars = buildParSequence(72, rng);
      const yards = buildYardages(pars, 7100, seededRng(`${seed}-yds`));
      const hcp = buildHandicaps(pars, yards, seededRng(`${seed}-hcp`));
      const rank1Hole = hcp.indexOf(1);
      const rank2Hole = hcp.indexOf(2);
      expect(pars[rank1Hole]).not.toBe(3);
      expect(pars[rank2Hole]).not.toBe(3);
    }
  });
});

const BASE_FACT: CourseFact = {
  matchName: 'Pinehurst No. 2',
  location: 'Pinehurst, NC',
  par: 72,
  championshipYards: 7209,
  championshipRating: 75.4,
  championshipSlope: 137,
  sourceNote: 'test fixture',
};

describe('buildCourseSeed', () => {
  it('is idempotent — same fact in, byte-identical seed out, every time', () => {
    const a = buildCourseSeed(BASE_FACT);
    const b = buildCourseSeed(BASE_FACT);
    expect(a).toEqual(b);
  });

  it('produces 3 tees (Championship/Members/Forward), each with 18 holes summing to the course par', () => {
    const seed = buildCourseSeed(BASE_FACT);
    expect(seed.tees.map((t) => t.teeName)).toEqual(['Championship', 'Members', 'Forward']);
    for (const tee of seed.tees) {
      expect(tee.holes).toHaveLength(18);
      expect(tee.holes.reduce((a, h) => a + h.par, 0)).toBe(BASE_FACT.par);
      expect(tee.totalPar).toBe(BASE_FACT.par);
      // totalYards is always the actual sum of the tee's own hole yardages —
      // never allowed to drift from what's really stored per hole.
      expect(tee.holes.reduce((a, h) => a + h.yards, 0)).toBe(tee.totalYards);
    }
  });

  it('the Championship tee totals exactly the requested championship yardage', () => {
    const seed = buildCourseSeed(BASE_FACT);
    const champ = seed.tees.find((t) => t.teeName === 'Championship')!;
    expect(champ.totalYards).toBe(BASE_FACT.championshipYards);
  });

  it('Members and Forward tees are shorter than Championship (realistic tee progression)', () => {
    const seed = buildCourseSeed(BASE_FACT);
    const [champ, members, forward] = seed.tees;
    expect(members!.totalYards).toBeLessThan(champ!.totalYards);
    expect(forward!.totalYards).toBeLessThan(members!.totalYards);
    expect(members!.slopeRating).toBeLessThanOrEqual(champ!.slopeRating);
    expect(forward!.slopeRating).toBeLessThanOrEqual(members!.slopeRating);
  });

  it('never reuses one template — two different courses at the same par/yardage still get distinct routings', () => {
    const courseA: CourseFact = { ...BASE_FACT, matchName: 'Course Alpha' };
    const courseB: CourseFact = { ...BASE_FACT, matchName: 'Course Bravo' };
    const seedA = buildCourseSeed(courseA);
    const seedB = buildCourseSeed(courseB);
    const parsA = seedA.tees[0]!.holes.map((h) => h.par);
    const parsB = seedB.tees[0]!.holes.map((h) => h.par);
    const yardsA = seedA.tees[0]!.holes.map((h) => h.yards);
    const yardsB = seedB.tees[0]!.holes.map((h) => h.yards);
    const hcpA = seedA.tees[0]!.holes.map((h) => h.hcp);
    const hcpB = seedB.tees[0]!.holes.map((h) => h.hcp);
    // At least one of the three dimensions must differ hole-by-hole — proves
    // this isn't the same cloned scorecard under a different name.
    const identical = JSON.stringify(parsA) === JSON.stringify(parsB)
      && JSON.stringify(yardsA) === JSON.stringify(yardsB)
      && JSON.stringify(hcpA) === JSON.stringify(hcpB);
    expect(identical).toBe(false);
  });
});
