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
import type { GapInput, Polarity } from './gap';
import { familyFor, type CountUnit, type FamilyDef } from './families';
import { minRung, type LadderRung, type WhyState } from './ladder';

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
  benchmark: { source: BenchmarkSource; value: number } | null;
  /** Shrinkage prior: the team (or cohort) line when it is comparable, else the benchmark. */
  prior: { source: BenchmarkSource | 'no_difference'; value: number } | null;
  why: WhyState;
  /** Family cap, lowered for a Tour-only benchmark or an estimated value. */
  cap: LadderRung;
  capReasons: string[];
  stabilityAgrees: boolean | null;
  splitHalf: { gap_old: number; gap_new: number; n_old: number; n_new: number } | null;
  checkpointsHeld: number;
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

function benchmarkFor(
  evidence: Obj,
  def: FamilyDef,
): { benchmark: SupportCandidate['benchmark']; prior: SupportCandidate['prior'] } {
  const standing = obj(evidence.standing);
  const teamAvg = num(standing?.team_avg);
  const teamN = num(standing?.team_n) ?? 0;
  const levelAvg = num(standing?.level_avg);
  const levelN = num(standing?.level_n) ?? 0;
  const own = num(evidence.comparison_value);
  if (def.teamBenchmark && teamAvg !== null && teamN >= TEAM_MIN_N) {
    return { benchmark: { source: 'team', value: teamAvg }, prior: { source: 'team', value: teamAvg } };
  }
  if (def.teamBenchmark && levelAvg !== null && levelN >= TEAM_MIN_N) {
    return { benchmark: { source: 'cohort', value: levelAvg }, prior: { source: 'cohort', value: levelAvg } };
  }
  if (own === null) return { benchmark: null, prior: null };
  const source = mapComparisonSource(evidence.comparison_source);
  return { benchmark: { source, value: own }, prior: { source, value: own } };
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

  switch (def.shape) {
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
      usedBenchmark = { source: 'self', value: (kB / nB) * 100 };
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
        polarity: polarityOf(evidence, 'lower_better'),
      };
      n = rounds;
      break;
    }
    case 'untestable':
      break;
  }

  if (gapInput && usedBenchmark?.source === 'tour') {
    // 02 §3: the words compare to the team; the Tour line is for the strokes
    // arithmetic and the audit view. A read whose only benchmark is the Tour
    // stays with the coach.
    const lowered = minRung(cap, 'working_hypothesis');
    if (lowered !== cap) capReasons.push('tour_benchmark_only');
    cap = lowered;
  }
  if (evidence.estimated === true) {
    // 04 §1.1: `estimated` must be false on every read at Observed or above.
    const lowered = minRung(cap, 'likely');
    if (lowered !== cap) capReasons.push('estimated_value');
    cap = lowered;
  }

  const splitHalf = readSplitHalf(evidence);
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
    why: whyStateOf(evidence),
    cap,
    capReasons,
    stabilityAgrees: null,
    splitHalf,
    checkpointsHeld: num(obj(evidence.stability)?.checkpoints_held) ?? 0,
  };
}
