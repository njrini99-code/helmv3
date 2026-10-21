/**
 * Per-family support settings (02-accuracy-standard §7, 04 §2), keyed by the
 * insight row's `insight_type` and `evidence.metric`.
 *
 * Each family says how its evidence is tested (the {@link GapInput} shape), the
 * unit its floor counts in, the floor for SAYING anything, the round floor,
 * the shrinkage κ, the highest ladder rung it can reach, whether the team
 * standing on the row is on the same basis as `your_value` (so it may be the
 * benchmark), and whether a better-than-benchmark result is a strength read.
 *
 * Floors (post-merge review, finding 4): the attempt, round and per-arm
 * floors are DERIVED from Slice 0b's shared table (`FAMILY_FLOORS` in
 * `engine/read-floor-table.ts`, 02 §7 and 04 §2), whatever
 * `coachhelm_reads_v1_copy` says, so the ladder can never hold a family to a
 * looser floor than the one the generators publish under. The only floor not
 * in that table is the per-side minimum of the within-player putt contrasts,
 * which is the proportion test's own (`MIN_PUTTS_PER_SIDE`, 02 §7 #7). Every
 * two-arm contrast also needs at least {@link MIN_ARM} in each arm.
 *
 * The six Slice 5a insight angles (Slice 1c) are matched by metric before any
 * insight-type match, and take their floors, κ and cap from the angle
 * registry (`ANGLE_FAMILIES`), never from `FAMILY_FLOORS` (see
 * {@link angleDef}).
 *
 * Pure data.
 */
import { FAMILY_FLOORS, MIN_ROUNDS_PER_READ } from '@/lib/coachhelm/v3/engine/read-floor-table';
import { MIN_PUTTS_PER_SIDE } from '@/lib/coachhelm/v3/stats/proportion-test';
import {
  ANGLE_FAMILIES,
  type AngleFamilyId,
  type AngleSampleUnit,
} from '@/lib/coachhelm/v3/generators/insight-angles/angle-data';
import type { LadderRung } from './ladder';
import { KAPPA } from './shrink';

export type FamilyShape = 'proportion' | 'two_proportion' | 'mean' | 'rate_per_round' | 'untestable';
export type CountUnit = 'attempts' | 'opportunities' | 'rounds' | 'shots' | AngleSampleUnit;

/** One arm of a two-arm contrast and its floor. */
export interface ArmFloor {
  /** The arm's name in reports (and its `evidence.detail` key unless `read` is given). */
  key: string;
  min: number;
  /** Reads the arm count from `evidence.detail` when it is not a flat key. */
  read?: (detail: Record<string, unknown>) => unknown;
}

export interface FamilyDef {
  family: string;
  shape: FamilyShape;
  /** Why a family is untestable today (no counts or spread on its evidence). */
  untestableReason?: string;
  nUnit: CountUnit;
  /** Floor for saying anything, in `nUnit` (the smaller side of a contrast). */
  floor: number;
  /** Countable-round floor (>= 3). */
  roundFloor: number;
  /** The `FAMILY_FLOORS` key the floors come from; null for families it does not list. */
  floorsKey: string | null;
  /**
   * Per-arm floors of a two-arm contrast, read from `evidence.detail[key]`
   * (each at least {@link MIN_ARM}). A missing arm count fails its floor.
   */
  arms?: ReadonlyArray<ArmFloor>;
  kappa: number;
  cap: LadderRung;
  /** The row's `standing.team_avg` measures the same quantity as `your_value`. */
  teamBenchmark: boolean;
  /**
   * The generator writes both leak and strength rows for this family and
   * picks the side from the same comparison the test judges (02 §6 mirror
   * test). The tested direction then follows the row's framing, and BH gets
   * the two-sided p (post-merge review, blocker 1). False: the family only
   * ever claims the weakness side (within-player contrasts, where the
   * generator names the side it suspects), so the direction is declared.
   */
  allowStrength: boolean;
  /**
   * Strokes a round per unit of gap, for families whose gap is itself in
   * strokes or in stroke-costing events. Used only when the row carries no
   * strokes estimate of its own.
   */
  strokesPerGapUnit?: number;
  /**
   * A Slice 5a insight angle (`ANGLE_FAMILIES`). The row carries its own test
   * input in `evidence.detail.gap_input` (the {@link GapInput} shape), so the
   * candidate reads that instead of re-deriving it.
   */
  angle?: AngleFamilyId;
  /**
   * The generator names the worse of the player's own two sides from the
   * same data the test judges (tee miss left vs right, approach miss short vs
   * long). The row only ever claims that side is worse, but the side itself
   * was picked from the data, so BH gets the two-sided p (1b, blocker 1).
   */
  sidePickedFromData?: boolean;
  /** Shrink a two-arm mean contrast by the harmonic n of its arms (1b finding 6). */
  shrinkByArms?: boolean;
}

/** Smallest arm of any two-arm contrast (02 §7: 6 + 6 for the pressure split). */
export const MIN_ARM = 6;

type Floors = Pick<FamilyDef, 'floor' | 'roundFloor' | 'floorsKey' | 'arms'>;

function shared(key: string) {
  const f = FAMILY_FLOORS[key];
  if (!f || f.say_n === null) throw new Error(`support families: no shared floor for ${key}`);
  return f;
}

/** A one-sample family: the shared attempt floor, round floor and any arms. */
function floorsFrom(key: string): Floors {
  const f = shared(key);
  return {
    floor: f.say_n!,
    roundFloor: Math.max(MIN_ROUNDS_PER_READ, f.min_rounds),
    floorsKey: key,
    ...(f.arms ? { arms: f.arms.keys.map((k) => ({ key: k, min: Math.max(MIN_ARM, f.arms!.min_each) })) } : {}),
  };
}

/** A within-player contrast held to `perSide` on each side. */
function contrastFloors(key: string, sides: readonly [string, string], perSide: number): Floors {
  const f = shared(key);
  const min = Math.max(MIN_ARM, perSide);
  return {
    floor: min,
    roundFloor: Math.max(MIN_ROUNDS_PER_READ, f.min_rounds),
    floorsKey: key,
    arms: sides.map((k) => ({ key: k, min })),
  };
}

/** Tee strategy: driver shots to the family floor, non-driver to its arm floor. */
function teeFloors(): Floors {
  const f = shared('tee_strategy');
  const nonDriver = Math.max(MIN_ARM, f.arms?.min_each ?? f.say_n!);
  return {
    floor: nonDriver,
    roundFloor: Math.max(MIN_ROUNDS_PER_READ, f.min_rounds),
    floorsKey: 'tee_strategy',
    arms: [
      { key: 'driver_n', min: Math.max(MIN_ARM, f.say_n!) },
      { key: 'non_driver_n', min: nonDriver },
    ],
  };
}

type MatchedDef = FamilyDef & { match: (insightType: string, metric: string) => boolean };

function obj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * `detail.sides[detail[sideKey]].costed`: the costed misses on the side the
 * row names (`worse_side` or `better_side`) in the tee-miss and approach-miss
 * angles.
 */
function costedOnSide(sideKey: 'worse_side' | 'better_side') {
  return (detail: Record<string, unknown>): unknown => {
    const side = detail[sideKey];
    return typeof side === 'string' ? obj(obj(detail.sides)?.[side])?.costed : undefined;
  };
}

/**
 * A Slice 5a angle family, straight from {@link ANGLE_FAMILIES}: matched by
 * `evidence.metric` alone (two angles share insight type `tee`, and every
 * angle's insight type is shared with an older generator), floors, κ and cap
 * as the generator declares them. Angle rows read under `angle:<family>`
 * (`angle-generator.ts`), which `FAMILY_FLOORS` deliberately does not list,
 * so the floors come from the angle registry, not the 0b table. `floor` and
 * `n` count both sides of a contrast together (the `ANGLE_FAMILIES`
 * convention); each side is held to `per_side_floor` as an arm.
 */
function angleDef(id: AngleFamilyId, extra: Partial<FamilyDef> = {}): MatchedDef {
  const a = ANGLE_FAMILIES[id];
  return {
    family: id,
    angle: id,
    match: (_t, m) => m === a.metric,
    shape: a.gap_kind,
    nUnit: a.sample_unit,
    floor: a.floor,
    roundFloor: Math.max(MIN_ROUNDS_PER_READ, a.round_floor),
    floorsKey: `angle:${id}`,
    kappa: a.kappa.value,
    cap: a.cap,
    // The benchmark is the one the row's own gap input names.
    teamBenchmark: false,
    // Every angle writes a row only when the player is on the worse side
    // (z >= 1.645 that way), so the family claims the weak side alone.
    allowStrength: false,
    ...extra,
  };
}

/** Per-side floor of a two-arm angle, never below {@link MIN_ARM}. */
function angleArm(id: AngleFamilyId): number {
  return Math.max(MIN_ARM, ANGLE_FAMILIES[id].per_side_floor ?? MIN_ARM);
}

/** The six angle families (Slice 5a, #2229), ahead of every insight-type match. */
const ANGLE_DEFS: readonly MatchedDef[] = [
  angleDef('three_putt_chain'),
  angleDef('bad_day_floor'),
  angleDef('lie_rough_execution', {
    // Band-held fairway vs rough approaches (8+ each in every tested band).
    arms: [
      { key: 'rough_shots', min: angleArm('lie_rough_execution') },
      { key: 'fairway_shots', min: angleArm('lie_rough_execution') },
    ],
  }),
  angleDef('lie_fairway_exposure'),
  angleDef('tee_miss_cost', {
    arms: [
      { key: 'worse_side_costed', min: angleArm('tee_miss_cost'), read: costedOnSide('worse_side') },
      { key: 'better_side_costed', min: angleArm('tee_miss_cost'), read: costedOnSide('better_side') },
    ],
    sidePickedFromData: true,
    shrinkByArms: true,
  }),
  angleDef('approach_miss_compass', {
    arms: [
      { key: 'worse_side_costed', min: angleArm('approach_miss_compass'), read: costedOnSide('worse_side') },
      { key: 'better_side_costed', min: angleArm('approach_miss_compass'), read: costedOnSide('better_side') },
    ],
    sidePickedFromData: true,
    shrinkByArms: true,
  }),
];

const DEFS: readonly MatchedDef[] = [
  ...ANGLE_DEFS,
  {
    family: 'putt_distance',
    match: (t, m) => t === 'putt_distance' || m.startsWith('putts_made_'),
    shape: 'proportion',
    nUnit: 'attempts',
    ...floorsFrom('putt_distance'),
    kappa: KAPPA.attempts,
    cap: 'seen_repeatedly',
    teamBenchmark: true,
    allowStrength: true,
  },
  {
    family: 'approach_green_hit',
    match: (t, m) => t === 'approach_miss' || m.startsWith('approach_proximity_'),
    shape: 'proportion',
    nUnit: 'attempts',
    ...floorsFrom('approach_miss'),
    kappa: KAPPA.attempts,
    cap: 'seen_repeatedly',
    // The row's standing is on-green PROXIMITY (feet), not the green-hit
    // percent the card leads with (production 2026-10-20: mean |player_value −
    // your_value| = 35 on 156 rows), so it cannot be the benchmark.
    teamBenchmark: false,
    allowStrength: true,
  },
  {
    family: 'sand_save',
    match: (t, m) => t === 'scrambling' || m.startsWith('scrambling_pct_'),
    shape: 'proportion',
    nUnit: 'opportunities',
    ...floorsFrom('scrambling'),
    kappa: KAPPA.attempts,
    cap: 'observed',
    teamBenchmark: true,
    allowStrength: true,
  },
  {
    family: 'penalty_rate',
    match: (_t, m) => m === 'penalty_rate_per_round',
    shape: 'rate_per_round',
    nUnit: 'rounds',
    ...floorsFrom('course_management'),
    kappa: KAPPA.per_round_rate,
    cap: 'observed',
    teamBenchmark: true,
    allowStrength: true,
    // A penalty adds one stroke by rule; a lower bound on its cost.
    strokesPerGapUnit: 1,
  },
  {
    family: 'big_number',
    match: (_t, m) => m === 'big_number_rate',
    shape: 'untestable',
    untestableReason: 'no_hole_count',
    nUnit: 'rounds',
    ...floorsFrom('course_management'),
    kappa: KAPPA.per_round_rate,
    cap: 'observed',
    teamBenchmark: true,
    allowStrength: true,
  },
  {
    family: 'par_scoring',
    match: (t, m) => t === 'par_scoring' || m.startsWith('scoring_par_'),
    shape: 'untestable',
    untestableReason: 'no_per_round_spread',
    nUnit: 'rounds',
    ...floorsFrom('par_scoring'),
    kappa: KAPPA.par_scoring_rounds,
    cap: 'likely',
    teamBenchmark: true,
    allowStrength: true,
  },
  {
    family: 'pressure_gap',
    match: (t, m) => t === 'pressure_gap' || m === 'practice_tournament_delta',
    shape: 'mean',
    nUnit: 'rounds',
    // 12 rounds, of which 6 practice + 6 tournament (02 §7 #14).
    ...floorsFrom('pressure_gap'),
    kappa: KAPPA.per_round_rate,
    cap: 'likely',
    teamBenchmark: true,
    // Strength at or under 0, leak past half a stroke (pressure-gap.ts).
    allowStrength: true,
    // The delta is strokes a round.
    strokesPerGapUnit: 1,
  },
  {
    family: 'opening_hole',
    match: (t, m) => t === 'warmup_hole' || m === 'opening_hole_delta',
    shape: 'mean',
    nUnit: 'rounds',
    ...floorsFrom('warmup_hole'),
    kappa: KAPPA.par_scoring_rounds,
    cap: 'likely',
    teamBenchmark: true,
    // Strength at or under 0, leak past the 0.1 Tour tax (warmup-hole.ts).
    allowStrength: true,
    // One opening hole a round: strokes per hole = strokes a round.
    strokesPerGapUnit: 1,
  },
  {
    family: 'putt_slope',
    match: (_t, m) => m === 'putt_slope_downhill_penalty_pct',
    shape: 'two_proportion',
    nUnit: 'attempts',
    // `stats/proportion-test.ts` default per side (02 §7 #7); the family's
    // 20 putts in all (FAMILY_FLOORS.putt_bias) is implied by 15 + 15.
    ...contrastFloors('putt_bias', ['downhill_n', 'level_n'], MIN_PUTTS_PER_SIDE),
    kappa: KAPPA.attempts,
    cap: 'seen_repeatedly',
    teamBenchmark: false,
    allowStrength: false,
  },
  {
    family: 'putt_break',
    match: (t, m) => t === 'putt_bias' || m.startsWith('putt_miss_bias_'),
    shape: 'two_proportion',
    nUnit: 'attempts',
    ...contrastFloors('putt_bias', ['ltr_n', 'rtl_n'], MIN_PUTTS_PER_SIDE),
    kappa: KAPPA.attempts,
    cap: 'seen_repeatedly',
    teamBenchmark: false,
    allowStrength: false,
  },
  {
    family: 'tee_strategy',
    match: (t) => t === 'tee_strategy',
    shape: 'two_proportion',
    nUnit: 'attempts',
    // 20 driver tee shots (the family's `sample_n` floor) and 12 non-driver
    // (its arm floor), 02 §7 #19; the smaller side is held to 12.
    ...teeFloors(),
    kappa: KAPPA.attempts,
    cap: 'likely',
    teamBenchmark: false,
    allowStrength: false,
  },
  {
    family: 'composite',
    match: (t) => t === 'composite',
    shape: 'untestable',
    untestableReason: 'composite_no_counts',
    nUnit: 'attempts',
    floor: 20,
    roundFloor: MIN_ROUNDS_PER_READ,
    floorsKey: null,
    kappa: KAPPA.attempts,
    cap: 'working_hypothesis',
    teamBenchmark: false,
    allowStrength: false,
  },
];

const UNKNOWN: FamilyDef = {
  family: 'unknown',
  shape: 'untestable',
  untestableReason: 'unknown_family',
  nUnit: 'attempts',
  floor: 20,
  roundFloor: MIN_ROUNDS_PER_READ,
  floorsKey: null,
  kappa: KAPPA.attempts,
  cap: 'working_hypothesis',
  teamBenchmark: false,
  allowStrength: false,
};

/** The family settings for a row; `unknown` (untestable) when nothing matches. */
export function familyFor(insightType: string | null | undefined, metric: string | null | undefined): FamilyDef {
  const t = insightType ?? '';
  const m = metric ?? '';
  // Metric-specific families first: the angles (they share insight types with
  // older generators), then slope rows (written as insight_type 'putt_bias').
  const byMetric = DEFS.find((d) => (d.angle !== undefined || d.family === 'putt_slope') && d.match(t, m));
  if (byMetric) return byMetric;
  return DEFS.find((d) => d.match(t, m)) ?? UNKNOWN;
}

/** Every family id, for reports. */
export const FAMILY_IDS: readonly string[] = [...DEFS.map((d) => d.family), UNKNOWN.family];
