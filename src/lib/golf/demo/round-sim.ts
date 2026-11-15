/**
 * A shot-by-shot round simulator for the demo team. It plays each hole the
 * way the app records one (tee, approach, around the green, putts, penalty
 * rows as round entry writes them), so the database computes strokes gained,
 * GIR, putts and scrambling from these shots exactly as it does for a real
 * round. The hole rows and round totals are derived from the shots, so a
 * header can never disagree with its holes (DD-11).
 *
 * Pure: the only input is a seeded stream.
 */
import { clamp, type Rng } from './rng';
import type { DemoHole, Skill } from './story';

export type Lie = 'tee' | 'fairway' | 'rough' | 'sand' | 'green';

export interface SimShot {
  shot_number: number;
  shot_type: 'tee' | 'approach' | 'around_green' | 'putting' | 'penalty';
  club_type: 'driver' | 'non_driver' | 'putter';
  lie_before: Lie;
  distance_to_hole_before: number;
  distance_unit_before: 'yards' | 'feet';
  result: 'fairway' | 'rough' | 'sand' | 'green' | 'hole' | 'other' | 'penalty';
  lie_after: Lie | 'other' | 'penalty' | null;
  distance_to_hole_after: number;
  distance_unit_after: 'yards' | 'feet';
  shot_distance: number;
  is_penalty: boolean;
  penalty_type: 'water' | 'ob' | null;
  putt_made: boolean | null;
  putt_distance_feet: number | null;
  miss_direction: 'left' | 'right' | null;
}

export interface SimHole {
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
  shots: SimShot[];
}

export interface SimRound {
  holes: SimHole[];
  total: number;
  front: number;
  back: number;
  par: number;
  putts: number;
  fairwaysHit: number;
  fairways: number;
  gir: number;
  penalties: number;
}

/** Scratch make rates by putt length in feet (interpolated). */
const MAKE: ReadonlyArray<readonly [number, number]> = [
  [1, 0.995], [2, 0.985], [3, 0.95], [4, 0.87], [5, 0.77], [6, 0.67], [8, 0.51],
  [10, 0.41], [12, 0.33], [15, 0.24], [20, 0.155], [25, 0.105], [30, 0.075], [40, 0.045], [60, 0.025], [90, 0.012],
];

function interpolate(table: ReadonlyArray<readonly [number, number]>, x: number): number {
  if (x <= table[0]![0]) return table[0]![1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i]!;
    const [x0, y0] = table[i - 1]!;
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return table[table.length - 1]![1];
}

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** The skills a player brings to one round: their level plus the day's form. */
export interface DaySkill extends Skill {
  /** Extra chance of a blow-up hole today (boom-or-bust days). */
  wild: number;
}

const GREEN_RADIUS_FT = 40;

/** Feet from the hole after an approach from `yards` on `lie`. */
function approachProximity(rng: Rng, yards: number, lie: Lie, s: DaySkill): number {
  const lieFactor = lie === 'rough' ? 1.35 : lie === 'sand' ? 1.6 : 1;
  const median = (6.5 + 0.165 * yards) * lieFactor * Math.exp(-0.38 * s.approach);
  return median * Math.exp(rng.normal(0, 0.6));
}

/** Feet from the hole after a chip, pitch or bunker shot from `yards`. */
function shortGameProximity(rng: Rng, yards: number, lie: Lie, s: DaySkill): number {
  const lieFactor = lie === 'sand' ? 1.4 : lie === 'rough' ? 1.1 : 0.9;
  const median = (3.2 + 0.32 * yards) * lieFactor * Math.exp(-0.42 * s.shortGame);
  return median * Math.exp(rng.normal(0, 0.55));
}

function round1(x: number): number {
  return Math.max(1, Math.round(x));
}

/** Play one hole. */
export function playHole(rng: Rng, hole: DemoHole, holeNumber: number, s: DaySkill): SimHole {
  const shots: SimShot[] = [];
  let lie: Lie = 'tee';
  let yards = hole.yards;
  let feet = 0; // set once on the green
  let n = 0;
  let penalties = 0;
  let fairwayHit: boolean | null = hole.par === 3 ? null : false;
  let playedFromSand = false;
  const push = (shot: Omit<SimShot, 'shot_number'>) => {
    n += 1;
    shots.push({ shot_number: n, ...shot });
  };

  // Tee shot on a par 4 or par 5.
  if (hole.par !== 3) {
    let teeAgain = true;
    while (teeAgain) {
      teeAgain = false;
      const useDriver = hole.yards - s.drive > 90 || hole.par === 5;
      const carry = useDriver ? s.drive + rng.normal(0, 13) : hole.yards - 125 + rng.normal(0, 10);
      const penaltyP = clamp(s.penaltyRate + s.wild * 0.04, 0, 0.35);
      if (rng.chance(penaltyP)) {
        const kind: 'water' | 'ob' = rng.chance(0.55) ? 'water' : 'ob';
        const miss = rng.chance(0.5) ? 'left' : 'right';
        if (kind === 'ob') {
          // Stroke and distance: the ball is gone; the next shot is from the tee again.
          push({ shot_type: 'tee', club_type: useDriver ? 'driver' : 'non_driver', lie_before: 'tee', distance_to_hole_before: yards, distance_unit_before: 'yards', result: 'other', lie_after: 'tee', distance_to_hole_after: yards, distance_unit_after: 'yards', shot_distance: 0, is_penalty: false, penalty_type: null, putt_made: null, putt_distance_feet: null, miss_direction: miss });
          push({ shot_type: 'penalty', club_type: 'non_driver', lie_before: 'tee', distance_to_hole_before: yards, distance_unit_before: 'yards', result: 'penalty', lie_after: 'tee', distance_to_hole_after: yards, distance_unit_after: 'yards', shot_distance: 0, is_penalty: true, penalty_type: 'ob', putt_made: null, putt_distance_feet: null, miss_direction: null });
          penalties += 1;
          teeAgain = n < 6; // a second OB is possible; a third is not
          continue;
        }
        // Penalty area: drop beside it, about where the ball crossed.
        const drop = Math.max(60, Math.round(yards - carry * 0.85));
        push({ shot_type: 'tee', club_type: useDriver ? 'driver' : 'non_driver', lie_before: 'tee', distance_to_hole_before: yards, distance_unit_before: 'yards', result: 'penalty', lie_after: 'penalty', distance_to_hole_after: drop, distance_unit_after: 'yards', shot_distance: Math.round(carry * 0.85), is_penalty: false, penalty_type: null, putt_made: null, putt_distance_feet: null, miss_direction: miss });
        push({ shot_type: 'penalty', club_type: 'non_driver', lie_before: 'rough', distance_to_hole_before: drop, distance_unit_before: 'yards', result: 'penalty', lie_after: 'rough', distance_to_hole_after: drop, distance_unit_after: 'yards', shot_distance: 0, is_penalty: true, penalty_type: 'water', putt_made: null, putt_distance_feet: null, miss_direction: null });
        penalties += 1;
        lie = 'rough';
        yards = drop;
        break;
      }
      const hitFairway = rng.chance(clamp(s.fairway, 0.2, 0.9));
      const after: Lie = hitFairway ? 'fairway' : rng.chance(0.85) ? 'rough' : 'sand';
      const remaining = Math.max(25, Math.round(yards - carry + (hitFairway ? 0 : 6)));
      push({ shot_type: 'tee', club_type: useDriver ? 'driver' : 'non_driver', lie_before: 'tee', distance_to_hole_before: yards, distance_unit_before: 'yards', result: after, lie_after: after, distance_to_hole_after: remaining, distance_unit_after: 'yards', shot_distance: Math.round(yards - remaining), is_penalty: false, penalty_type: null, putt_made: null, putt_distance_feet: null, miss_direction: hitFairway ? null : rng.chance(0.5) ? 'left' : 'right' });
      if (hitFairway) fairwayHit = true;
      lie = after;
      yards = remaining;
    }
  }

  // To the green: approaches, a layup on a long par 5, then the short game.
  let guard = 0;
  while (lie !== 'green' && guard++ < 8) {
    const fromTee = lie === 'tee';
    if (yards > 50 || fromTee) {
      const layup = hole.par === 5 && n <= 1 + penalties && (yards > 255 || (lie !== 'fairway' && yards > 215));
      if (layup) {
        const target = rng.int(80, 115);
        const after: Lie = rng.chance(0.8) ? 'fairway' : 'rough';
        push({ shot_type: 'approach', club_type: 'non_driver', lie_before: lie, distance_to_hole_before: yards, distance_unit_before: 'yards', result: after, lie_after: after, distance_to_hole_after: target, distance_unit_after: 'yards', shot_distance: yards - target, is_penalty: false, penalty_type: null, putt_made: null, putt_distance_feet: null, miss_direction: null });
        lie = after;
        yards = target;
        continue;
      }
      if (lie === 'sand') playedFromSand = true;
      const prox = approachProximity(rng, yards, lie, s);
      if (prox <= GREEN_RADIUS_FT) {
        feet = round1(prox);
        push({ shot_type: hole.par === 3 && fromTee ? 'approach' : 'approach', club_type: 'non_driver', lie_before: lie, distance_to_hole_before: yards, distance_unit_before: 'yards', result: 'green', lie_after: 'green', distance_to_hole_after: feet, distance_unit_after: 'feet', shot_distance: yards, is_penalty: false, penalty_type: null, putt_made: null, putt_distance_feet: null, miss_direction: null });
        lie = 'green';
      } else {
        const off = clamp(Math.round((prox - GREEN_RADIUS_FT) / 3 + 4 + rng.next() * 6), 3, 45);
        const after: Lie = rng.chance(0.26) ? 'sand' : 'rough';
        push({ shot_type: 'approach', club_type: 'non_driver', lie_before: lie, distance_to_hole_before: yards, distance_unit_before: 'yards', result: after, lie_after: after, distance_to_hole_after: off, distance_unit_after: 'yards', shot_distance: Math.max(0, yards - off), is_penalty: false, penalty_type: null, putt_made: null, putt_distance_feet: null, miss_direction: rng.chance(0.5) ? 'left' : 'right' });
        lie = after;
        yards = off;
      }
      continue;
    }
    // Around the green.
    if (lie === 'sand') playedFromSand = true;
    const duff = rng.chance(clamp(0.035 * Math.exp(-0.6 * s.shortGame) + s.wild * 0.02, 0, 0.2));
    if (duff) {
      const left = clamp(Math.round(yards * 0.5 + 2), 3, 30);
      push({ shot_type: 'around_green', club_type: 'non_driver', lie_before: lie, distance_to_hole_before: yards, distance_unit_before: 'yards', result: 'rough', lie_after: 'rough', distance_to_hole_after: left, distance_unit_after: 'yards', shot_distance: Math.max(1, yards - left), is_penalty: false, penalty_type: null, putt_made: null, putt_distance_feet: null, miss_direction: null });
      lie = 'rough';
      yards = left;
      continue;
    }
    const prox = shortGameProximity(rng, yards, lie, s);
    if (prox < 0.9) {
      push({ shot_type: 'around_green', club_type: 'non_driver', lie_before: lie, distance_to_hole_before: yards, distance_unit_before: 'yards', result: 'hole', lie_after: null, distance_to_hole_after: 0, distance_unit_after: 'feet', shot_distance: yards, is_penalty: false, penalty_type: null, putt_made: null, putt_distance_feet: null, miss_direction: null });
      return finish(hole, holeNumber, shots, penalties, fairwayHit, null, playedFromSand);
    }
    feet = round1(prox);
    push({ shot_type: 'around_green', club_type: 'non_driver', lie_before: lie, distance_to_hole_before: yards, distance_unit_before: 'yards', result: 'green', lie_after: 'green', distance_to_hole_after: feet, distance_unit_after: 'feet', shot_distance: yards, is_penalty: false, penalty_type: null, putt_made: null, putt_distance_feet: null, miss_direction: null });
    lie = 'green';
  }

  // Putting.
  let putts = 0;
  while (putts < 5) {
    putts += 1;
    const pMake = putts >= 4 ? 1 : sigmoid(logit(clamp(interpolate(MAKE, feet), 0.005, 0.997)) + 0.5 * s.putting - 0.1);
    if (rng.chance(pMake)) {
      push({ shot_type: 'putting', club_type: 'putter', lie_before: 'green', distance_to_hole_before: feet, distance_unit_before: 'feet', result: 'hole', lie_after: null, distance_to_hole_after: 0, distance_unit_after: 'feet', shot_distance: 0, is_penalty: false, penalty_type: null, putt_made: true, putt_distance_feet: feet, miss_direction: null });
      break;
    }
    const leaveMedian = feet <= 8 ? 1.7 : 1.5 + 0.08 * feet;
    const leave = round1(leaveMedian * Math.exp(rng.normal(0, 0.45) - 0.2 * s.putting));
    const next = Math.min(leave, Math.max(1, feet - 1));
    push({ shot_type: 'putting', club_type: 'putter', lie_before: 'green', distance_to_hole_before: feet, distance_unit_before: 'feet', result: 'green', lie_after: 'green', distance_to_hole_after: next, distance_unit_after: 'feet', shot_distance: 0, is_penalty: false, penalty_type: null, putt_made: false, putt_distance_feet: feet, miss_direction: null });
    feet = next;
  }
  return finish(hole, holeNumber, shots, penalties, fairwayHit, playedFromSand);
}

function finish(hole: DemoHole, holeNumber: number, shots: SimShot[], penalties: number, fairwayHit: boolean | null, playedFromSand: boolean): SimHole {
  const score = shots.length;
  const putts = shots.filter((x) => x.shot_type === 'putting').length;
  // Green in regulation, by the database's own rule (golf_holes_set_gir_fn):
  // the strokes that were not putts leave at least two for par.
  const toGreen = score - putts;
  const gir = hole.par >= 3 && score > 0 && toGreen > 0 && toGreen <= hole.par - 2;
  const upAndDown = gir ? null : score <= hole.par;
  return {
    hole_number: holeNumber,
    par: hole.par,
    yardage: hole.yards,
    score,
    putts,
    fairway_hit: fairwayHit,
    gir,
    up_and_down: upAndDown,
    sand_save: playedFromSand && !gir ? score <= hole.par : null,
    penalty_strokes: penalties,
    shots,
  };
}

/** Play 18 holes. */
export function playRound(rng: Rng, holes: readonly DemoHole[], s: DaySkill): SimRound {
  const played = holes.map((h, i) => playHole(rng, h, i + 1, s));
  const sum = (f: (h: SimHole) => number) => played.reduce((t, h) => t + f(h), 0);
  return {
    holes: played,
    total: sum((h) => h.score),
    front: played.slice(0, 9).reduce((t, h) => t + h.score, 0),
    back: played.slice(9).reduce((t, h) => t + h.score, 0),
    par: sum((h) => h.par),
    putts: sum((h) => h.putts),
    fairwaysHit: played.filter((h) => h.fairway_hit === true).length,
    fairways: played.filter((h) => h.fairway_hit !== null).length,
    gir: played.filter((h) => h.gir).length,
    penalties: sum((h) => h.penalty_strokes),
  };
}

/** A player's skill on a given day: level, season shifts, then the day's form. */
export function daySkill(rng: Rng, base: Skill, shifted: Partial<Skill>, wildBias = 0): DaySkill {
  const form = rng.normal(0, base.volatility);
  const s: Skill = {
    ...base,
    approach: base.approach + (shifted.approach ?? 0) + form * 0.9 + rng.normal(0, base.volatility * 0.4),
    shortGame: base.shortGame + (shifted.shortGame ?? 0) + form * 0.6 + rng.normal(0, base.volatility * 0.4),
    putting: base.putting + (shifted.putting ?? 0) + form * 0.7 + rng.normal(0, base.volatility * 0.5),
    fairway: clamp(base.fairway + (shifted.fairway ?? 0) + form * 0.05, 0.2, 0.9),
    penaltyRate: clamp(base.penaltyRate + (shifted.penaltyRate ?? 0), 0, 0.3),
  };
  return { ...s, wild: Math.max(0, -form * 1.5 + wildBias) };
}
