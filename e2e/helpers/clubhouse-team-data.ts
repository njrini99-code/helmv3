/**
 * Deterministic golf rounds for the Clubhouse perf seed (`seedClubhouseTeam` in clubhouse-local-seed.ts).
 *
 * Pure: no database, no clock, no randomness but the PRNG handed in, so the same seed gives the same scores, holes and shots, and a
 * before and an after measurement read the same figures. Every hole is simulated from its strokes, so the rows agree with each
 * other the way a real tracked round does: a hole's shots number exactly its score, its putting rows number exactly its putts, the
 * last putt is holed, and GIR is the golf_holes trigger's own formula (score minus putts reaches the green in par minus two).
 * Strokes gained is synthetic (the real figures come from the app's calculator at submit time); it is scaled from the score so
 * it is plausible and its legs add up to the total.
 */

/** mulberry32: a small seeded PRNG returning [0, 1). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Three par-72 layouts, so the team plays a few different courses. */
export const PAR_LAYOUTS: number[][] = [
  [4, 5, 3, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4],
  [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 5, 3, 4, 4, 4, 3, 5, 4],
  [5, 4, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5],
];

/** A course's yardages from its layout: par 3s 150 to 205, par 4s 350 to 440, par 5s 490 to 560. */
export function yardsFor(layout: number[], rng: () => number): number[] {
  return layout.map((par) => (par === 3 ? 150 + Math.round(rng() * 55) : par === 4 ? 350 + Math.round(rng() * 90) : 490 + Math.round(rng() * 70)));
}

export interface GenShot {
  shot_number: number;
  shot_type: 'tee' | 'approach' | 'around_green' | 'putting' | 'penalty';
  club_type: 'driver' | 'non_driver' | 'putter';
  lie_before: string;
  lie_after: string | null;
  distance_to_hole_before: number;
  distance_unit_before: 'yards' | 'feet';
  distance_to_hole_after: number | null;
  distance_unit_after: 'yards' | 'feet' | null;
  shot_distance: number | null;
  result: string | null;
  is_penalty: boolean;
  penalty_type: string | null;
  miss_direction: string | null;
  putt_distance_feet: number | null;
  putt_made: boolean | null;
}

export interface GenHole {
  hole_number: number;
  par: number;
  yardage: number;
  score: number;
  putts: number;
  fairway_hit: boolean | null;
  gir: boolean;
  up_and_down: boolean | null;
  sand_save: boolean | null;
  penalty_strokes: number;
  shots: GenShot[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const between = (rng: () => number, lo: number, hi: number) => lo + rng() * (hi - lo);
const pick = <T>(rng: () => number, xs: readonly T[]): T => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))]!;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Make rate of a first putt of `ft` feet for a player of `skill` (0 to 1). */
function puttMake(ft: number, skill: number): number {
  const base = ft <= 3 ? 0.96 : ft <= 5 ? 0.78 : ft <= 10 ? 0.45 : ft <= 15 ? 0.27 : ft <= 25 ? 0.12 : 0.05;
  return clamp(base + (skill - 0.5) * 0.08, 0.02, 0.99);
}

/** The GIR rule of the golf_holes_set_gir trigger. */
export function girOf(par: number, score: number, putts: number): boolean {
  return par >= 3 && score > 0 && score - putts > 0 && score - putts <= par - 2;
}

/**
 * One hole as a player of `skill` plays it. `pre` is the strokes before putting (a penalty stroke included); the green is reached
 * in regulation when `pre` is at most par minus two. Shots are written in order, one row per stroke.
 */
export function simHole(rng: () => number, holeNumber: number, par: number, yardage: number, skill: number): GenHole {
  const gir = rng() < clamp(0.45 + 0.4 * skill, 0.3, 0.9);
  let penalty = 0;
  let pre: number;
  if (gir) pre = par - 2;
  else {
    penalty = rng() < clamp(0.07 - 0.05 * skill, 0.01, 0.1) ? 1 : 0;
    const roll = rng();
    pre = roll < 0.86 ? par - 1 : par;
    pre = Math.max(par - 1, pre) + penalty;
  }
  const fairway = par >= 4 ? rng() < clamp(0.45 + 0.35 * skill, 0.3, 0.85) : null;

  const shots: GenShot[] = [];
  const push = (s: Omit<GenShot, 'shot_number'>) => shots.push({ ...s, shot_number: shots.length + 1 });
  let remaining = yardage;
  let lie = 'tee';
  let sand = false;
  let greenFeet = 0;

  for (let stroke = 1; stroke <= pre; stroke++) {
    // A penalty is the tee shot into trouble, then its own row (the stroke), then play on from where the ball is.
    if (penalty && stroke === 2) {
      push({
        shot_type: 'penalty', club_type: 'non_driver', lie_before: 'penalty', lie_after: 'rough', distance_to_hole_before: Math.max(10, Math.round(remaining)),
        distance_unit_before: 'yards', distance_to_hole_after: Math.max(10, Math.round(remaining)), distance_unit_after: 'yards', shot_distance: 0,
        result: 'penalty', is_penalty: true, penalty_type: 'stroke', miss_direction: null, putt_distance_feet: null, putt_made: null,
      });
      lie = 'rough';
      continue;
    }
    const onGreenAfter = stroke === pre;
    const type: GenShot['shot_type'] = stroke === 1 ? 'tee' : remaining > 45 ? 'approach' : 'around_green';
    const driver = stroke === 1 && par >= 4;
    const before = Math.max(8, Math.round(remaining));
    let result: string;
    let lieAfter: string;
    let after: number;
    let unitAfter: 'yards' | 'feet' = 'yards';
    let miss: string | null = null;
    let isPen = false;
    let penType: string | null = null;
    if (onGreenAfter) {
      result = 'green';
      lieAfter = 'green';
      unitAfter = 'feet';
      // Proximity: approaches from further out finish further away; a chip finishes inside 15 feet.
      greenFeet = type === 'around_green' ? between(rng, 2.5, 11) : clamp(between(rng, 6, 18) + remaining * between(rng, 0.03, 0.1) + (1 - skill) * between(rng, 0, 22), 5, 60);
      after = r1(greenFeet);
    } else if (penalty && stroke === 1) {
      result = 'penalty';
      lieAfter = 'penalty';
      isPen = true;
      penType = pick(rng, ['water', 'out_of_bounds', 'lost']);
      after = before;
      miss = pick(rng, ['left', 'right']);
    } else if (stroke === 1 && par >= 4) {
      const drive = driver ? between(rng, 215, 290) : between(rng, 170, 230);
      after = Math.max(60, Math.round(before - drive));
      result = fairway ? 'fairway' : pick(rng, ['rough', 'rough', 'deep_rough', 'sand']);
      lieAfter = result === 'deep_rough' ? 'rough' : result;
      if (!fairway) miss = pick(rng, ['left', 'right']);
    } else if (stroke === 1) {
      // A par 3 tee shot that misses the green.
      after = Math.round(between(rng, 8, 35));
      result = pick(rng, ['rough', 'rough', 'sand']);
      lieAfter = result;
      miss = pick(rng, ['left', 'right', 'short', 'long']);
    } else {
      after = Math.round(Math.max(8, type === 'approach' ? remaining - between(rng, 60, Math.min(260, Math.max(65, remaining - 25))) : between(rng, 6, 20)));
      result = pick(rng, ['rough', 'fairway', 'sand', 'rough']);
      lieAfter = result;
      miss = pick(rng, ['left', 'right', 'short', 'long']);
    }
    if (lieAfter === 'sand') sand = true;
    push({
      shot_type: type,
      club_type: driver ? 'driver' : 'non_driver',
      lie_before: stroke === 1 ? 'tee' : lie,
      lie_after: lieAfter,
      distance_to_hole_before: before,
      distance_unit_before: 'yards',
      distance_to_hole_after: after,
      distance_unit_after: unitAfter,
      shot_distance: unitAfter === 'yards' ? Math.max(0, before - after) : before,
      result,
      is_penalty: isPen,
      penalty_type: penType,
      miss_direction: miss,
      putt_distance_feet: null,
      putt_made: null,
    });
    if (!onGreenAfter && !isPen) {
      remaining = after;
      lie = lieAfter;
    }
  }

  // Putting: the first putt's length decides one putt or more; a second putt is a tap-in most of the time.
  const first = greenFeet;
  const putts: GenShot[] = [];
  const addPutt = (feet: number, made: boolean) =>
    putts.push({
      shot_type: 'putting', club_type: 'putter', lie_before: 'green', lie_after: 'green', distance_to_hole_before: r1(feet),
      distance_unit_before: 'feet', distance_to_hole_after: made ? 0 : null, distance_unit_after: 'feet', shot_distance: null,
      result: made ? 'hole' : 'green', is_penalty: false, penalty_type: null, miss_direction: null, putt_distance_feet: r1(feet), putt_made: made, shot_number: 0,
    });
  if (rng() < puttMake(first, skill)) addPutt(first, true);
  else {
    addPutt(first, false);
    const second = clamp(first * 0.12 + between(rng, 0.8, 2.6), 1, 8);
    if (rng() < clamp(0.95 - second * 0.02 + (skill - 0.5) * 0.05, 0.8, 0.99)) addPutt(second, true);
    else {
      addPutt(second, false);
      addPutt(clamp(between(rng, 1, 3), 1, 3), true);
    }
  }
  for (const p of putts) shots.push({ ...p, shot_number: shots.length + 1 });
  const score = pre + putts.length;
  const holeGir = girOf(par, score, putts.length);
  return {
    hole_number: holeNumber,
    par,
    yardage,
    score,
    putts: putts.length,
    fairway_hit: fairway,
    gir: holeGir,
    up_and_down: holeGir ? null : score <= par,
    sand_save: sand && !holeGir ? score <= par : null,
    penalty_strokes: penalty,
    shots,
  };
}

export type RoundShape = 'full' | 'nine' | 'total';

export interface GenRound {
  shape: RoundShape;
  holes_played: number;
  total_score: number;
  front_nine: number | null;
  back_nine: number | null;
  score_to_par: number;
  total_putts: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  total_fairways_hit: number | null;
  total_fairways: number | null;
  total_penalties: number | null;
  strokes_gained_total: number | null;
  strokes_gained_tee: number | null;
  strokes_gained_approach: number | null;
  strokes_gained_around_green: number | null;
  strokes_gained_putting: number | null;
  holes: GenHole[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * One round. `form` is how this round went against the player's level (added to `skill`); `withShots` keeps the shot rows and the
 * strokes gained (a round with no shots has neither, as in production); a `total` round is posted as a score and nothing else.
 */
export function genRound(rng: () => number, input: { shape: RoundShape; skill: number; form: number; withShots: boolean; layout: number[]; yards: number[] }): GenRound {
  const { shape, layout, yards } = input;
  const skill = clamp(input.skill + input.form, 0.05, 0.98);
  const count = shape === 'nine' ? 9 : 18;
  const parTotal = layout.slice(0, count).reduce((a, b) => a + b, 0);
  const holes = layout.slice(0, count).map((par, i) => simHole(rng, i + 1, par, yards[i]!, skill));
  const total = holes.reduce((a, h) => a + h.score, 0);

  if (shape === 'total') {
    return {
      shape, holes_played: 18, total_score: total, front_nine: null, back_nine: null, score_to_par: total - parTotal, total_putts: null, total_gir: null,
      total_gir_possible: null, total_fairways_hit: null, total_fairways: null, total_penalties: null, strokes_gained_total: null, strokes_gained_tee: null,
      strokes_gained_approach: null, strokes_gained_around_green: null, strokes_gained_putting: null, holes: [],
    };
  }

  const front = holes.filter((h) => h.hole_number <= 9).reduce((a, h) => a + h.score, 0);
  const back = holes.filter((h) => h.hole_number > 9).reduce((a, h) => a + h.score, 0);
  // Strokes gained against a 74.5-per-18 Tour-like baseline, scaled to the holes played; legs add up to the total.
  const noise = [between(rng, -1, 1), between(rng, -0.08, 0.08), between(rng, -0.08, 0.08), between(rng, -0.08, 0.08)];
  let sgTotal: number | null = null;
  let legs: number[] | null = null;
  if (input.withShots) {
    const per18 = (74.5 - (total * 18) / count) * 0.9 + noise[0]!;
    sgTotal = round2(clamp((per18 * count) / 18, -12, 12));
    const w = [0.26, 0.38, 0.14].map((x, i) => x + noise[i + 1]!);
    const tee = round2(sgTotal * w[0]!);
    const approach = round2(sgTotal * w[1]!);
    const around = round2(sgTotal * w[2]!);
    legs = [tee, approach, around, round2(sgTotal - tee - approach - around)];
  }
  return {
    shape,
    holes_played: count,
    total_score: total,
    front_nine: front,
    back_nine: count === 18 ? back : null,
    score_to_par: total - parTotal,
    total_putts: holes.reduce((a, h) => a + h.putts, 0),
    total_gir: holes.filter((h) => h.gir).length,
    total_gir_possible: count,
    total_fairways_hit: holes.filter((h) => h.fairway_hit === true).length,
    total_fairways: holes.filter((h) => h.fairway_hit != null).length,
    total_penalties: holes.reduce((a, h) => a + h.penalty_strokes, 0),
    strokes_gained_total: sgTotal,
    strokes_gained_tee: legs?.[0] ?? null,
    strokes_gained_approach: legs?.[1] ?? null,
    strokes_gained_around_green: legs?.[2] ?? null,
    strokes_gained_putting: legs?.[3] ?? null,
    holes: input.withShots ? holes : holes.map((h) => ({ ...h, shots: [] })),
  };
}
