/**
 * Deterministic per-course scorecard generator — pure, no I/O (fully
 * unit-testable, same pattern as course-library.ts). Used by
 * scripts/seed-course-library-scorecards.ts (#913 part 1/3, DATA) to turn a
 * course's well-known top-line facts (par, championship yardage, rating,
 * slope) into a full 18-hole routing + 3 tee sets (Championship / Members /
 * Forward), WITHOUT ever reusing the same hole-by-hole layout across two
 * courses.
 *
 * Seeded on the course name (mulberry32 PRNG over a string hash) so the same
 * course always produces byte-identical output — the generator itself is
 * idempotent, independent of when/how often the caller re-runs it.
 */

export type TeeName = 'Championship' | 'Members' | 'Forward';

export interface CourseFact {
  /** Must match `golf_courses.name` for an existing row after normalization
   *  (golf_normalize_name). Never used to rename anything. */
  matchName: string;
  location: string; // display-only, for reporting
  par: number; // 70 | 71 | 72 (see PAR_COMPOSITIONS)
  championshipYards: number;
  championshipRating: number;
  championshipSlope: number;
  sourceNote: string;
}

export interface HoleRow {
  hole: number;
  par: number;
  yards: number;
  hcp: number;
}

export interface TeeSeed {
  teeName: TeeName;
  totalYards: number;
  totalPar: number;
  courseRating: number;
  slopeRating: number;
  holes: HoleRow[];
}

export interface CourseSeed extends CourseFact {
  tees: TeeSeed[];
}

/** Deterministic string-seeded PRNG (mulberry32, string-hashed seed). */
export function seededRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Real-world-typical par-3/par-4/par-5 counts for each supported course par. */
export const PAR_COMPOSITIONS: Record<number, { p3: number; p4: number; p5: number }> = {
  70: { p3: 4, p4: 12, p5: 2 }, // 12 + 48 + 10 = 70
  71: { p3: 4, p4: 11, p5: 3 }, // 12 + 44 + 15 = 71
  72: { p3: 4, p4: 10, p5: 4 }, // 12 + 40 + 20 = 72
};

/** Which of the 18 holes are par 3 / 4 / 5 — varied per course via `rng`.
 *  Returns an array of 18 par values, index 0 = hole 1 .. index 17 = hole 18. */
export function buildParSequence(par: number, rng: () => number): number[] {
  const comp = PAR_COMPOSITIONS[par];
  if (!comp) throw new Error(`Unsupported par ${par} (only 70/71/72 are wired)`);

  const splitCount = (n: number): [number, number] => {
    const half = Math.floor(n / 2);
    const extra = n - half * 2; // 0 or 1
    return rng() < 0.5 ? [half + extra, half] : [half, half + extra];
  };
  const [p3Front, p3Back] = splitCount(comp.p3);
  const [p5Front, p5Back] = splitCount(comp.p5);

  const parByHole = new Array<number>(19).fill(4); // 1-indexed; index 0 unused
  const assign = (holes: number[], p3n: number, p5n: number) => {
    // First p3n shuffled holes become par 3, next p5n become par 5, the rest
    // (already-initialized) stay par 4. p3n + p5n is always well under 9
    // (the nine's hole count) for every composition in PAR_COMPOSITIONS.
    const pool = shuffle(holes, rng);
    for (let i = 0; i < p3n; i++) parByHole[pool[i] as number] = 3;
    for (let i = 0; i < p5n; i++) parByHole[pool[p3n + i] as number] = 5;
  };
  assign([1, 2, 3, 4, 5, 6, 7, 8, 9], p3Front, p5Front);
  assign([10, 11, 12, 13, 14, 15, 16, 17, 18], p3Back, p5Back);
  return parByHole.slice(1); // 0-indexed holes 1..18
}

const YARD_RANGE: Record<number, [number, number]> = {
  3: [150, 235],
  4: [350, 480],
  5: [495, 590],
};

/** Per-hole yardages that SUM EXACTLY to `targetTotal` (any integer — real
 *  published totals are rarely multiples of 5), with the rounding remainder
 *  distributed 1 yard at a time across the longest holes. */
export function buildYardages(pars: readonly number[], targetTotal: number, rng: () => number): number[] {
  const base = pars.map((p) => {
    const [lo, hi] = YARD_RANGE[p] as [number, number];
    return lo + rng() * (hi - lo);
  });
  const baseSum = base.reduce((a, b) => a + b, 0);
  const scale = targetTotal / baseSum;
  const scaled = base.map((v) => Math.round(v * scale));

  let diff = targetTotal - scaled.reduce((a, b) => a + b, 0);
  const order = scaled
    .map((_, idx) => idx)
    .sort((a, b) => (scaled[b] as number) - (scaled[a] as number));
  let i = 0;
  while (diff !== 0 && i < order.length * 8) {
    const idx = order[i % order.length] as number;
    const step = diff > 0 ? 1 : -1;
    scaled[idx] = (scaled[idx] as number) + step;
    diff -= step;
    i++;
  }
  return scaled;
}

/** Stroke index (1 = hardest .. 18 = easiest), varied per course via `rng`. */
export function buildHandicaps(pars: readonly number[], yards: readonly number[], rng: () => number): number[] {
  const scores = pars.map((par, i) => {
    let s = yards[i] as number;
    if (par === 4) s += 300;
    else if (par === 5) s -= 150;
    else s -= 250; // par 3s generally play relatively easier for their length
    s += (rng() - 0.5) * 80; // jitter so equal-par holes don't tie mechanically
    return s;
  });
  const order = scores.map((_, i) => i).sort((a, b) => (scores[b] as number) - (scores[a] as number));
  const hcp = new Array<number>(18).fill(0);
  order.forEach((holeIdx, rank) => { hcp[holeIdx] = rank + 1; });

  // Realism nudge: a par 3 essentially never carries stroke index 1 or 2 on a
  // real card — swap it with the easiest-ranked non-par-3 hole if it does.
  for (const targetRank of [1, 2]) {
    const holeIdx = hcp.indexOf(targetRank);
    if (holeIdx === -1 || pars[holeIdx] !== 3) continue;
    let swapIdx = -1;
    let swapRank = Infinity;
    for (let i = 0; i < hcp.length; i++) {
      if (i === holeIdx || pars[i] === 3) continue;
      if ((hcp[i] as number) < swapRank) { swapRank = hcp[i] as number; swapIdx = i; }
    }
    if (swapIdx !== -1) {
      hcp[holeIdx] = swapRank;
      hcp[swapIdx] = targetRank;
    }
  }
  return hcp;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round5 = (n: number): number => Math.round(n / 5) * 5;

/** Turn a course's top-line facts into a full 18-hole routing + 3 tee sets. */
export function buildCourseSeed(fact: CourseFact): CourseSeed {
  const rng = seededRng(fact.matchName);
  const pars = buildParSequence(fact.par, rng);
  const champYards = buildYardages(pars, fact.championshipYards, rng);
  const hcp = buildHandicaps(pars, champYards, rng);

  const membersFactor = 0.9 + (rng() - 0.5) * 0.04; // 0.88–0.92
  const forwardFactor = 0.76 + (rng() - 0.5) * 0.06; // 0.73–0.79
  const membersYards = buildYardages(pars, round5(fact.championshipYards * membersFactor), rng);
  const forwardYards = buildYardages(pars, round5(fact.championshipYards * forwardFactor), rng);

  const membersRating = round1(fact.championshipRating - (1.5 + rng() * 1.0));
  const membersSlope = Math.max(95, Math.round(fact.championshipSlope - (6 + rng() * 6)));
  const forwardRating = round1(fact.championshipRating - (5 + rng() * 2));
  const forwardSlope = Math.max(90, Math.round(fact.championshipSlope - (16 + rng() * 8)));

  const teeFrom = (
    teeName: TeeName,
    yards: number[],
    courseRating: number,
    slopeRating: number,
  ): TeeSeed => {
    const holes: HoleRow[] = pars.map((par, i) => ({
      hole: i + 1, par, yards: yards[i] as number, hcp: hcp[i] as number,
    }));
    return {
      teeName,
      totalYards: holes.reduce((a, h) => a + h.yards, 0),
      totalPar: fact.par,
      courseRating,
      slopeRating,
      holes,
    };
  };

  return {
    ...fact,
    tees: [
      teeFrom('Championship', champYards, fact.championshipRating, fact.championshipSlope),
      teeFrom('Members', membersYards, membersRating, membersSlope),
      teeFrom('Forward', forwardYards, forwardRating, forwardSlope),
    ],
  };
}
