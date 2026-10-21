/**
 * Read one written insight row's evidence into a support candidate: what to
 * test, against which benchmark, with which floors, and what its cause line
 * is. Everything here is read from fields the generators already write
 * (production field inventory 2026-10-20); a row whose evidence does not carry
 * counts or a spread is reported untestable with the reason, never guessed.
 *
 * Pure: JSON in, plain object out.
 */
import { isPlaceholderCause } from '@/lib/coachhelm/reads/placeholder-cause';
import type { InsightFraming } from '@/lib/coachhelm/v3/engine/root-cause';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { Direction, DirectionBasis, GapInput, Polarity } from './gap';
import { familyFor, type CountUnit, type FamilyDef } from './families';
import { LADDER_RUNGS, minRung, type LadderRung, type WhyState } from './ladder';

/** Observed-path floors (02 §6: raised from PR #2073's 3 and 25%). */
export const PATH_MIN_OCCURRENCES = 4;
export const PATH_MIN_SHARE = 0.3;
export const SEQUENCE_MIN_EVENTS = 10;
export const SEQUENCE_MIN_ROUNDS = 3;
/** Corroborated association (02 §6, PR #2073 `context-narrowing.ts`). */
export const CORROBORATION_MIN_LIFT = 1.25;
export const CORROBORATION_MIN_PER_ARM = 10;
/** Team pool floor (04 §2): fewer teammates than this and the team line is not a benchmark. */
export const TEAM_MIN_N = 4;

export type BenchmarkSource = 'team' | 'cohort' | 'tour' | 'target' | 'self';

/**
 * What the benchmark value is (post-merge review, finding 5):
 *   - `team_loo`: the team mean with this player left out, rebuilt from
 *     `standing.team_avg`, `team_n` and the player's own `standing.player_value`;
 *   - `team_incl_player`: `standing.team_avg` as stored (the player is in it),
 *     used only when the leave-one-out inputs are missing;
 *   - `cohort`, `row_comparison` (the row's own comparison line), `self` (the
 *     player's other side in a within-player contrast).
 */
export type BenchmarkBasis = 'team_loo' | 'team_incl_player' | 'cohort' | 'row_comparison' | 'self';

export interface CandidateBenchmark {
  source: BenchmarkSource;
  value: number;
  basis: BenchmarkBasis;
  /** Teammates behind a leave-one-out team value. */
  pool_n?: number;
}
export interface SupportCandidate {
  id: string;
  family: string;
  def: FamilyDef;
  gapInput: GapInput | null;
  untestableReason: string | null;
  n: number;
  nUnit: CountUnit;
  roundsN: number | null;
  /** Raw strokes a round from the row, magnitude; null when never estimated. */
  strokesRaw: number | null;
  benchmark: CandidateBenchmark | null;
  /**
   * Shrinkage prior: always the benchmark value, labelled with the benchmark's
   * own source (so a Tour benchmark is a `tour` prior, never "the team"), or
   * "no difference" for a within-player contrast.
   */
  prior: { source: BenchmarkSource | 'no_difference'; value: number } | null;
  /** The side the row's own words claim; null when the row claims nothing or is untestable. */
  direction: Direction | null;
  /** `data` when the generator picked that side from the same comparison (BH gets the two-sided p). */
  directionBasis: DirectionBasis | null;
  /** Per-arm counts of a two-arm contrast against their floors (finding 4). */
  arms: Array<{ key: string; have: number | null; need: number }>;
  why: WhyState;
  /** Family cap, lowered for a Tour-only benchmark or an estimated value. */
  cap: LadderRung;
  capReasons: string[];
  splitHalf: { gap_old: number; gap_new: number; n_old: number; n_new: number } | null;
  checkpointsHeld: number;
  /** The n a mean contrast shrinks by when it is not `n` (the arms' harmonic n). */
  shrinkN?: number;
}

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function mapComparisonSource(src: unknown): BenchmarkSource {
  switch (src) {
    case 'team_avg':
      return 'team';
    case 'cohort_avg':
    case 'd1_avg':
    case 'd2_avg':
    case 'd3_avg':
    case 'naia_avg':
    case 'juco_avg':
      return 'cohort';
    case 'absolute_target':
      return 'target';
    case 'your_baseline':
      return 'self';
    default:
      // pga_baseline, estimated_target (Tour-derived), anything unknown.
      return 'tour';
  }
}

/** Cause-line state for the ladder (see {@link WhyState}). */
export function whyStateOf(evidence: Obj): WhyState {
  const cause = obj(evidence.cause);
  if (cause) {
    if (cause.state === 'observed_sequence') {
      const occ = num(cause.occurrences) ?? 0;
      const den = num(cause.denominator) ?? 0;
      const rounds = num(cause.distinct_rounds) ?? 0;
      const meets =
        occ >= PATH_MIN_OCCURRENCES &&
        den >= SEQUENCE_MIN_EVENTS &&
        den > 0 &&
        occ / den >= PATH_MIN_SHARE &&
        rounds >= SEQUENCE_MIN_ROUNDS;
      return meets ? 'observed_sequence' : 'candidate';
    }
    if (cause.state === 'inferred_hypothesis') {
      if (cause.corroborated === true) return 'corroborated';
      const alts = Array.isArray(cause.alternatives) ? cause.alternatives : [];
      const corroborated = alts.some((a) => {
        const o = obj(a);
        if (!o) return false;
        // Slice 2 writes lift null when the rest never failed: an unbounded lift.
        const lift = o.lift === null ? Number.POSITIVE_INFINITY : num(o.lift) ?? 0;
        const lb = num(o.lower_bound);
        const na = num(obj(o.arm_a)?.n) ?? 0;
        const nb = num(obj(o.arm_b)?.n) ?? 0;
        return (
          lift >= CORROBORATION_MIN_LIFT &&
          na >= CORROBORATION_MIN_PER_ARM &&
          nb >= CORROBORATION_MIN_PER_ARM &&
          lb !== null &&
          lb > 0
        );
      });
      return corroborated ? 'corroborated' : 'candidate';
    }
    if (cause.state === 'not_traced') return 'not_traced';
  }
  const diagnosis = obj(evidence.diagnosis);
  const rootCause = diagnosis?.root_cause;
  if (typeof rootCause !== 'string' || rootCause.trim() === '' || isPlaceholderCause(rootCause)) {
    return 'not_traced';
  }
  return 'candidate';
}

function roundsOf(evidence: Obj, detail: Obj | null, def: FamilyDef, sampleN: number | null): number | null {
  const stamped = num(evidence.rounds_n);
  if (stamped !== null) return stamped;
  const played = num(detail?.rounds_played);
  if (played !== null) return played;
  const practice = num(detail?.practice_rounds);
  const competitive = num(detail?.competitive_rounds);
  if (practice !== null && competitive !== null) return practice + competitive;
  if (def.nUnit === 'rounds' && sampleN !== null) return sampleN;
  const src = Array.isArray(evidence.source_round_ids) ? evidence.source_round_ids.length : 0;
  return src > 0 ? src : null;
}

/** A row's own strokes estimate, magnitude; null when it was never estimated. */
function strokesOf(evidence: Obj): number | null {
  const s = num(evidence.strokes_impact);
  const method = evidence.strokes_impact_method;
  // 09-slice0-reality-check: a zero is a MEASURED zero only for sg_baseline;
  // elsewhere it means "not estimated".
  if (s === null) return null;
  if (s === 0 && method !== 'sg_baseline') return null;
  return Math.abs(s);
}

/**
 * The team mean without this player: `(team_avg · team_n − player) /
 * (team_n − 1)`. `standing.team_avg` averages every player on the team, this
 * one included, so testing a player against it pulls the benchmark toward
 * them and shrinks every gap (finding 5). Null when an input is missing.
 */
export function leaveOneOutMean(teamAvg: number, teamN: number, playerValue: number | null): number | null {
  if (playerValue === null || !(teamN >= 2) || !Number.isInteger(teamN)) return null;
  const loo = (teamAvg * teamN - playerValue) / (teamN - 1);
  return Number.isFinite(loo) ? loo : null;
}

function benchmarkFor(
  evidence: Obj,
  def: FamilyDef,
): { benchmark: CandidateBenchmark | null; prior: SupportCandidate['prior'] } {
  const standing = obj(evidence.standing);
  const teamAvg = num(standing?.team_avg);
  const teamN = num(standing?.team_n) ?? 0;
  const levelAvg = num(standing?.level_avg);
  const levelN = num(standing?.level_n) ?? 0;
  const own = num(evidence.comparison_value);
  if (def.teamBenchmark && teamAvg !== null && teamN >= TEAM_MIN_N) {
    const loo = leaveOneOutMean(teamAvg, teamN, num(standing?.player_value));
    const benchmark: CandidateBenchmark =
      loo !== null
        ? { source: 'team', value: loo, basis: 'team_loo', pool_n: teamN - 1 }
        : { source: 'team', value: teamAvg, basis: 'team_incl_player' };
    return { benchmark, prior: { source: 'team', value: benchmark.value } };
  }
  if (def.teamBenchmark && levelAvg !== null && levelN >= TEAM_MIN_N) {
    return { benchmark: { source: 'cohort', value: levelAvg, basis: 'cohort' }, prior: { source: 'cohort', value: levelAvg } };
  }
  if (own === null) return { benchmark: null, prior: null };
  const source = mapComparisonSource(evidence.comparison_source);
  return { benchmark: { source, value: own, basis: 'row_comparison' }, prior: { source, value: own } };
}

/**
 * The side the row claims (blocker 1 and finding 3). Generators that declare
 * their own framing do it from fields this reader can see again:
 *   - putt_bias "balanced" (no directional bias, `putt-bias.ts`): the only
 *     branch that writes `detail.testable_cells`; neutral;
 *   - tee_strategy: only the "laggy" pattern carries a strokes estimate
 *     (`laggyDiagnosticStrokesImpact`, > 0 whenever laggy fires); "sharp" and
 *     "inconclusive" make no cost claim, neutral;
 *   - pressure_gap: at or under 0 a strength, up to 0.5 neutral, else a leak;
 *   - opening hole: at or under 0 a strength, up to 0.1 neutral, else a leak.
 * Everything else resolves as the engine does (`resolveInsightFraming` in
 * `engine/root-cause.ts`, mirrored in {@link valueFraming} so this module stays
 * free of that file's server-only imports).
 */
export function framingOf(evidence: Obj, def: FamilyDef): InsightFraming {
  const detail = obj(evidence.detail);
  const value = num(evidence.your_value);
  switch (def.family) {
    case 'putt_break':
      return detail && detail.testable_cells !== undefined ? 'neutral' : 'leak';
    case 'tee_strategy': {
      const s = num(evidence.strokes_impact);
      return s !== null && s > 0 ? 'leak' : 'neutral';
    }
    case 'pressure_gap':
      if (value === null) return 'leak';
      return value <= 0 ? 'strength' : value <= 0.5 ? 'neutral' : 'leak';
    case 'opening_hole':
      if (value === null) return 'leak';
      return value <= 0 ? 'strength' : value <= 0.1 ? 'neutral' : 'leak';
    default:
      return valueFraming(evidence);
  }
}

/**
 * `resolveInsightFraming` with no declared framing: your_value against
 * comparison_value in the trusted direction (the row's polarity, else the
 * registry's when its unit matches); untrustworthy → leak.
 */
function valueFraming(evidence: Obj): InsightFraming {
  let direction: Polarity | null =
    evidence.polarity === 'higher_better' || evidence.polarity === 'lower_better' ? evidence.polarity : null;
  if (!direction && typeof evidence.metric === 'string') {
    const cfg = getMetricRenderConfig(evidence.metric);
    if (cfg && cfg.unit === evidence.unit) direction = cfg.direction;
  }
  if (!direction) return 'leak';
  const you = Number(evidence.your_value);
  const ref = Number(evidence.comparison_value);
  if (!Number.isFinite(you) || !Number.isFinite(ref)) return 'leak';
  const worse = direction === 'higher_better' ? you < ref : you > ref;
  return worse ? 'leak' : 'strength';
}

function polarityOf(evidence: Obj, fallback: Polarity): Polarity {
  return evidence.polarity === 'higher_better' || evidence.polarity === 'lower_better'
    ? evidence.polarity
    : fallback;
}

function readSplitHalf(evidence: Obj): SupportCandidate['splitHalf'] {
  const sh = obj(obj(evidence.stability)?.split_half);
  if (!sh) return null;
  const gapOld = num(sh.gap_old);
  const gapNew = num(sh.gap_new);
  const nOld = num(sh.n_old);
  const nNew = num(sh.n_new);
  if (gapOld === null || gapNew === null || nOld === null || nNew === null) return null;
  return { gap_old: gapOld, gap_new: gapNew, n_old: nOld, n_new: nNew };
}

/** Harmonic n of two arms, the effective n of a contrast (1b finding 6). */
function harmonicOf(a: number, b: number): number {
  return a > 0 && b > 0 ? (2 * a * b) / (a + b) : 0;
}

function polarityValue(v: unknown): Polarity | null {
  return v === 'higher_better' || v === 'lower_better' ? v : null;
}

/**
 * The test input a Slice 5a angle row wrote (`detail.gap_input`, the
 * {@link GapInput} shape: `angle-data.ts` `AngleGapInput`), checked field by
 * field. Null when it is missing, of another kind than the family's, or not
 * finite.
 */
export function angleGapInput(
  detail: Obj | null,
  def: FamilyDef,
): Extract<GapInput, { kind: 'proportion' | 'mean' }> | null {
  const gi = obj(detail?.gap_input);
  if (!gi || gi.kind !== def.shape) return null;
  const polarity = polarityValue(gi.polarity);
  if (!polarity) return null;
  if (gi.kind === 'proportion') {
    const k = num(gi.k);
    const n = num(gi.n);
    const b = num(gi.benchmark);
    if (k === null || n === null || b === null || !(n > 0) || k < 0 || k > n || !(b > 0 && b < 1)) return null;
    return { kind: 'proportion', k, n, benchmark: b, polarity };
  }
  if (gi.kind === 'mean') {
    const value = num(gi.value);
    const se = num(gi.se);
    const df = num(gi.df);
    const b = num(gi.benchmark);
    if (value === null || se === null || b === null || !(se > 0)) return null;
    return { kind: 'mean', value, se, df: df !== null && df >= 1 ? df : Infinity, benchmark: b, polarity };
  }
  return null;
}

export function buildCandidate(row: { id: string; insight_type: string | null; evidence: unknown }): SupportCandidate {
  const evidence = obj(row.evidence) ?? {};
  const detail = obj(evidence.detail);
  const metric = typeof evidence.metric === 'string' ? evidence.metric : '';
  const def = familyFor(row.insight_type, metric);
  const sampleN = num(evidence.sample_n);
  const yourValue = num(evidence.your_value);
  const capReasons: string[] = [];
  let cap = def.cap;

  let gapInput: GapInput | null = null;
  let untestableReason: string | null = def.shape === 'untestable' ? def.untestableReason ?? 'untestable' : null;
  let n = sampleN ?? 0;
  const { benchmark, prior: benchPrior } = benchmarkFor(evidence, def);
  let prior = benchPrior;
  let usedBenchmark = benchmark;
  // A leave-one-out team value is itself an estimate from the teammates'
  // samples. The row does not carry their counts, so each teammate is taken
  // to have a sample the size of this player's (documented default, finding 5).
  const pool = usedBenchmark?.basis === 'team_loo' ? usedBenchmark.pool_n ?? 0 : 0;

  switch (def.angle ? 'angle' : def.shape) {
    case 'proportion': {
      let k: number | null = null;
      let total: number | null;
      if (def.family === 'approach_green_hit') {
        total = num(detail?.attempts) ?? sampleN;
        k = num(detail?.green_hit_n);
        const pct = num(detail?.green_hit_pct) ?? yourValue;
        if (k === null && pct !== null && total !== null) k = Math.round((pct / 100) * total);
      } else if (def.family === 'sand_save') {
        total = num(detail?.save_n) ?? sampleN;
        k = num(detail?.saves_made);
        if (k === null && yourValue !== null && total !== null) k = Math.round((yourValue / 100) * total);
      } else {
        total = num(detail?.band_attempts) ?? sampleN;
        if (yourValue !== null && total !== null) k = Math.round((yourValue / 100) * total);
      }
      if (k === null || total === null || !(total > 0) || !usedBenchmark) {
        untestableReason = 'missing_counts';
        break;
      }
      n = total;
      gapInput = {
        kind: 'proportion',
        k,
        n: total,
        benchmark: usedBenchmark.value / 100,
        ...(pool > 0 ? { benchmarkN: total * pool } : {}),
        polarity: polarityOf(evidence, 'higher_better'),
      };
      if (!(usedBenchmark.value > 0 && usedBenchmark.value < 100)) {
        gapInput = null;
        untestableReason = 'degenerate_benchmark';
      }
      break;
    }
    case 'two_proportion': {
      let kA: number | null = null;
      let nA: number | null = null;
      let kB: number | null = null;
      let nB: number | null = null;
      if (def.family === 'putt_slope') {
        nA = num(detail?.downhill_n);
        nB = num(detail?.level_n);
        const pA = num(detail?.downhill_pct);
        const pB = num(detail?.level_pct);
        if (nA !== null && pA !== null) kA = Math.round((pA / 100) * nA);
        if (nB !== null && pB !== null) kB = Math.round((pB / 100) * nB);
      } else if (def.family === 'tee_strategy') {
        nA = num(detail?.driver_n);
        nB = num(detail?.non_driver_n);
        kA = num(detail?.driver_fairway_hits);
        kB = num(detail?.non_driver_fairway_hits);
      } else if (def.family === 'putt_break') {
        // Only the thin branch stores per-side counts (ltr = your_value side).
        nA = num(detail?.ltr_n);
        nB = num(detail?.rtl_n);
        const pB = num(evidence.comparison_value);
        if (nA !== null && yourValue !== null) kA = Math.round((yourValue / 100) * nA);
        if (nB !== null && pB !== null) kB = Math.round((pB / 100) * nB);
      }
      if (kA === null || nA === null || kB === null || nB === null || !(nA > 0) || !(nB > 0)) {
        untestableReason = 'no_side_counts';
        break;
      }
      n = Math.min(nA, nB);
      gapInput = { kind: 'two_proportion', kA, nA, kB, nB, polarity: 'higher_better' };
      usedBenchmark = { source: 'self', value: (kB / nB) * 100, basis: 'self' };
      prior = { source: 'no_difference', value: 0 };
      break;
    }
    case 'mean': {
      let se: number | null = null;
      let df = Infinity;
      if (def.family === 'pressure_gap') {
        se = num(detail?.gap_se);
        const p = num(detail?.practice_rounds);
        const c = num(detail?.competitive_rounds);
        // Conservative Welch bound: df >= min(n1, n2) − 1.
        if (p !== null && c !== null) df = Math.max(1, Math.min(p, c) - 1);
      } else if (def.family === 'opening_hole') {
        const lo = num(detail?.delta_ci_low);
        const hi = num(detail?.delta_ci_high);
        // `meanInterval` is a normal 95% interval: se = half-width / 1.96.
        if (lo !== null && hi !== null && hi > lo) se = (hi - lo) / (2 * 1.959963984540054);
        if (sampleN !== null) df = Math.max(1, sampleN - 1);
      }
      if (se === null || !(se > 0) || yourValue === null || !usedBenchmark) {
        untestableReason = 'no_standard_error';
        break;
      }
      gapInput = {
        kind: 'mean',
        value: yourValue,
        se,
        df,
        benchmark: usedBenchmark.value,
        ...(pool > 0 ? { benchmarkSe: se / Math.sqrt(pool) } : {}),
        polarity: polarityOf(evidence, 'lower_better'),
      };
      break;
    }
    case 'rate_per_round': {
      const rounds = sampleN;
      if (yourValue === null || rounds === null || !(rounds > 0) || !usedBenchmark || !(usedBenchmark.value > 0)) {
        untestableReason = 'missing_counts';
        break;
      }
      gapInput = {
        kind: 'rate_per_round',
        events: Math.round(yourValue * rounds),
        rounds,
        benchmark: usedBenchmark.value,
        ...(pool > 0 ? { benchmarkRounds: rounds * pool } : {}),
        polarity: polarityOf(evidence, 'lower_better'),
      };
      n = rounds;
      break;
    }
    case 'untestable':
      break;
    case 'angle': {
      // A Slice 5a angle wrote its own test input; read it rather than
      // re-deriving it. The benchmark is the one that input names, labelled
      // by the row's comparison source (team median, Tour, or the player's own
      // other side).
      const angleInput = angleGapInput(detail, def);
      gapInput = angleInput;
      if (!angleInput) {
        untestableReason = 'no_gap_input';
      } else {
        if (sampleN === null && angleInput.kind === 'proportion') n = angleInput.n;
        const source = mapComparisonSource(evidence.comparison_source);
        const value = angleInput.kind === 'proportion' ? angleInput.benchmark * 100 : angleInput.benchmark;
        usedBenchmark = { source, value, basis: source === 'self' ? 'self' : 'row_comparison' };
        prior = { source, value };
      }
      break;
    }
  }

  // A row that claims nothing (a neutral verdict, or a strength row in a
  // family that only ever claims the weak side) is not a hypothesis: it is
  // never tested as a weakness (finding 3).
  const framing = framingOf(evidence, def);
  let direction: Direction | null = null;
  if (gapInput) {
    if (framing === 'neutral' || (framing === 'strength' && !def.allowStrength)) {
      gapInput = null;
      untestableReason = 'no_claim';
    } else {
      direction = framing === 'strength' ? 'strength' : 'weakness';
    }
  }

  if (gapInput && usedBenchmark?.source === 'tour') {
    // 02 §3: the words compare to the team; the Tour line is for the strokes
    // arithmetic and the audit view. A read whose only benchmark is the Tour
    // stays with the coach.
    const lowered = minRung(cap, 'working_hypothesis');
    if (lowered !== cap) capReasons.push('tour_benchmark_only');
    cap = lowered;
  }
  if (def.angle && gapInput) {
    // 1b / 02 §7: a rough-estimate saving never reads above Likely, and an
    // angle row's own stamped cap (`detail.ladder_cap`) is never exceeded.
    if (detail?.impact_kind === 'rough_estimate') {
      const lowered = minRung(cap, 'likely');
      if (lowered !== cap) capReasons.push('rough_estimate');
      cap = lowered;
    }
    const stamped = detail?.ladder_cap;
    if (typeof stamped === 'string' && (LADDER_RUNGS as readonly string[]).includes(stamped)) {
      const lowered = minRung(cap, stamped as LadderRung);
      if (lowered !== cap) capReasons.push('row_ladder_cap');
      cap = lowered;
    }
  }
  if (evidence.estimated === true) {
    // 04 §1.1: `estimated` must be false on every read at Observed or above.
    const lowered = minRung(cap, 'likely');
    if (lowered !== cap) capReasons.push('estimated_value');
    cap = lowered;
  }

  const splitHalf = readSplitHalf(evidence);
  const arms = (def.arms ?? []).map((a) => ({
    key: a.key,
    have: detail ? num(a.read ? a.read(detail) : detail[a.key]) : null,
    need: a.min,
  }));
  // A two-arm mean contrast shrinks toward "no difference" by its arms'
  // harmonic n, as two-proportion contrasts do (finding 6).
  const armA = arms[0]?.have ?? null;
  const armB = arms[1]?.have ?? null;
  const shrinkN = gapInput && def.shrinkByArms && armA !== null && armB !== null ? harmonicOf(armA, armB) : undefined;
  if (gapInput && def.nFromArms) n = armA !== null && armB !== null ? armA + armB : 0;
  return {
    id: row.id,
    family: def.family,
    def,
    gapInput,
    untestableReason: gapInput ? null : untestableReason ?? 'untestable',
    n,
    nUnit: def.nUnit,
    roundsN: roundsOf(evidence, detail, def, sampleN),
    strokesRaw: strokesOf(evidence),
    benchmark: gapInput ? usedBenchmark : null,
    prior: gapInput ? prior : null,
    direction,
    directionBasis: direction === null ? null : def.allowStrength || def.sidePickedFromData ? 'data' : 'declared',
    arms,
    why: whyStateOf(evidence),
    cap,
    capReasons,
    splitHalf,
    checkpointsHeld: num(obj(evidence.stability)?.checkpoints_held) ?? 0,
    ...(shrinkN !== undefined && shrinkN > 0 ? { shrinkN } : {}),
  };
}
