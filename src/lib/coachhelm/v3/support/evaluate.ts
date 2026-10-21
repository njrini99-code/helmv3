/**
 * The per-run support pass, pure half (02-accuracy-standard §2, §5, §6;
 * 07 §2 C "statistics → per-run BH → floors → stability → ladder").
 *
 * Input: every insight row the generators and composites wrote for ONE player
 * in ONE run. Output: per row, the evidence fields to merge (`support`,
 * `ladder`, `what_ladder`, `ladder_reasons`, `strokes_shrunk`, `shrink`,
 * `stability`), plus the run-log summary (candidates, supported, eligible,
 * suppressed by rule, rungs, per-family rungs, the Watching list).
 *
 * BH runs across ALL hypotheses the run formed, untestable ones counted at
 * p = 1 (see `benjaminiHochberg`). The m basis is fixed (post-merge review,
 * blocker 2): the rows the run wrote, plus the rows the philosophy gate
 * held back (evaluated from their in-memory evidence, never written), plus
 * the rows `upsertInsight` refused (sample_n below its floor, p = 1). So a
 * gated caller and an ungated one get the same m and the same q for the
 * same data. Each row's `support.m_basis` and the run log record the split.
 *
 * Pure: rows in, plain objects out. The server half is `run-pass.ts`.
 */
import { buildCandidate, type BenchmarkBasis, type BenchmarkSource, type CandidateOptions, type SupportCandidate } from './candidate';
import { computeGap, rangeExcludesZero, type GapResult } from './gap';
import { assignLadder, LADDER_RUNGS, type LadderRung } from './ladder';
import { BH_Q, benjaminiHochberg } from './multiplicity';
import { keptShare, shrinkToward, splitHalfStability } from './shrink';

export const SUPPORT_VERSION = 'support_v1';

export interface SupportRow {
  id: string;
  insight_type: string | null;
  evidence: unknown;
}

/** `evidence.support` (04 §1.1, plus the counts a reader needs to audit it). */
export interface SupportField {
  version: typeof SUPPORT_VERSION;
  testable: boolean;
  untestable_reason?: string;
  family: string;
  gap?: number;
  gap_unit?: GapResult['gap_unit'];
  range_lo?: number;
  range_hi?: number;
  p_one_sided?: number;
  /** The p fed to BH: two-sided when the row's side was picked from the data. */
  p_bh?: number;
  q_adj?: number;
  tests_in_run: number;
  /** How `tests_in_run` (BH's m) splits: written + gated out + refused. */
  m_basis: MBasis;
  method?: GapResult['method'];
  test?: GapResult['test'];
  direction?: GapResult['direction'];
  direction_basis?: GapResult['direction_basis'];
  /** Where the read's strokes come from: the row's own (Tour-cost) estimate, or the gap itself. */
  strokes_basis?: 'row' | 'gap';
  n: number;
  n_unit: string;
  rounds_n: number | null;
  floor: number;
  round_floor: number;
  benchmark?: { source: BenchmarkSource; value: number } | null;
  benchmark_basis?: BenchmarkBasis;
  /** The benchmark's own variance is in the range and p (a leave-one-out team value). */
  benchmark_variance?: boolean;
  clear?: boolean;
  /** When the pass that wrote this ran; a row a later run did not rewrite keeps its older stamp. */
  run_at?: string;
  /** The run-log row id of that pass. */
  run_id?: string;
}

export interface MBasis {
  m: number;
  m_recorded: number;
  m_gated: number;
  m_refused: number;
}

export interface EvaluateOptions {
  /**
   * Rows the philosophy gate held back this run: evaluated for BH from their
   * in-memory evidence, counted in m, never written or returned.
   */
  gated?: readonly SupportRow[];
  /** Rows `upsertInsight` refused this run: counted in m at p = 1. */
  refused?: number;
  runAt?: string;
  runId?: string;
  /** Slice 7a (`coachhelm_team_pool_v1`): test and shrink against a row's team pool line. */
  teamPool?: boolean;
}

export interface SupportEvidencePatch {
  support: SupportField;
  ladder: LadderRung;
  what_ladder: LadderRung;
  ladder_reasons: string[];
  strokes_shrunk: number | null;
  shrink: { kappa: number; kept_share: number; prior_source: string; prior_value: number; value: number; gap: number } | null;
  stability?: { split_half: ReturnType<typeof splitHalfStability>; checkpoints_held: number };
}

export type WatchingEntry = {
  family: string;
  unit: string;
  have_n: number;
  need_n: number;
  rounds_have: number | null;
  rounds_need: number;
  /** Arms of a two-arm contrast still short of their floor (a missing count is null). */
  arms?: Array<{ key: string; have: number | null; need: number }>;
};

export interface RunSummary {
  candidates: number;
  testable: number;
  supported: number;
  /** Candidates at Working hypothesis or above: eligible for a surface before delivery caps. */
  eligible: number;
  /** First reason each Not-enough-yet candidate fails, counted. */
  suppressed: Record<string, number>;
  rungs: Record<LadderRung, number>;
  families: Record<string, Partial<Record<LadderRung, number>>>;
  watching: WatchingEntry[];
  tests_in_run: number;
  m_recorded: number;
  m_gated: number;
  m_refused: number;
}

export interface EvaluatedRow {
  id: string;
  family: string;
  patch: SupportEvidencePatch;
}

export interface PlayerRunEvaluation {
  rows: EvaluatedRow[];
  summary: RunSummary;
}

function round(n: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function emptyRungs(): Record<LadderRung, number> {
  return Object.fromEntries(LADDER_RUNGS.map((r) => [r, 0])) as Record<LadderRung, number>;
}

/** Shrunk estimate and gap for a tested candidate (02 §4: display raw, rank shrunk). */
function shrinkFor(c: SupportCandidate, g: GapResult): SupportEvidencePatch['shrink'] {
  const input = c.gapInput;
  if (!input || !c.prior) return null;
  const kappa = c.def.kappa;
  switch (input.kind) {
    case 'proportion': {
      const y = (input.k / input.n) * 100;
      const value = shrinkToward(y, input.n, c.prior.value, kappa);
      const b = input.benchmark * 100;
      const gap = input.polarity === 'higher_better' ? b - value : value - b;
      return { kappa, kept_share: round(keptShare(input.n, kappa)), prior_source: c.prior.source, prior_value: c.prior.value, value: round(value), gap: round(gap) };
    }
    case 'rate_per_round': {
      const y = input.events / input.rounds;
      const value = shrinkToward(y, input.rounds, c.prior.value, kappa);
      const gap = input.polarity === 'lower_better' ? value - input.benchmark : input.benchmark - value;
      return { kappa, kept_share: round(keptShare(input.rounds, kappa)), prior_source: c.prior.source, prior_value: c.prior.value, value: round(value), gap: round(gap) };
    }
    case 'mean': {
      // A two-arm angle contrast shrinks by its arms' harmonic n (`shrinkN`).
      const nS = c.shrinkN ?? c.n;
      const value = shrinkToward(input.value, nS, c.prior.value, kappa);
      const gap = input.polarity === 'lower_better' ? value - input.benchmark : input.benchmark - value;
      return { kappa, kept_share: round(keptShare(nS, kappa)), prior_source: c.prior.source, prior_value: c.prior.value, value: round(value), gap: round(gap) };
    }
    case 'two_proportion': {
      // The contrast shrinks toward "no difference" by the harmonic n of its
      // two sides, 2·nA·nB / (nA + nB) (finding 6): the n of a difference of
      // two proportions, where the smaller side alone undercounts it.
      const share = keptShare(harmonicN(input.nA, input.nB), kappa);
      return { kappa, kept_share: round(share), prior_source: 'no_difference', prior_value: 0, value: round(g.gap * share), gap: round(g.gap * share) };
    }
  }
}

/** Effective n of a two-sample contrast. */
export function harmonicN(nA: number, nB: number): number {
  return nA > 0 && nB > 0 ? (2 * nA * nB) / (nA + nB) : 0;
}

/** Raw strokes a round at stake in the read's direction, and where they come from; null when not estimable. */
function strokesFor(c: SupportCandidate, g: GapResult): { value: number; basis: 'row' | 'gap' } | null {
  if (c.strokesRaw !== null) return { value: c.strokesRaw, basis: 'row' };
  if (c.def.strokesPerGapUnit !== undefined) return { value: round(Math.abs(g.gap) * c.def.strokesPerGapUnit, 3), basis: 'gap' };
  return null;
}

function gapFor(c: SupportCandidate): GapResult | null {
  if (!c.gapInput) return null;
  return computeGap(c.gapInput, {
    allowStrength: c.def.allowStrength,
    ...(c.direction ? { direction: c.direction, basis: c.directionBasis ?? 'declared' } : {}),
  });
}

export function evaluatePlayerRun(rows: readonly SupportRow[], opts: EvaluateOptions = {}): PlayerRunEvaluation {
  const candidateOptions: CandidateOptions = { teamPool: opts.teamPool === true };
  const candidates = rows.map((r) => buildCandidate(r, candidateOptions));
  const gaps = candidates.map(gapFor);
  const gatedGaps = (opts.gated ?? []).map((r) => gapFor(buildCandidate(r, candidateOptions)));
  const refused = Math.max(0, Math.floor(opts.refused ?? 0));
  const pValues: Array<number | null> = [
    ...gaps.map((g) => (g ? g.p_bh : null)),
    ...gatedGaps.map((g) => (g ? g.p_bh : null)),
    ...Array.from({ length: refused }, () => null),
  ];
  const bh = benjaminiHochberg(pValues, BH_Q);
  const m = bh.m;
  const mBasis: MBasis = { m, m_recorded: candidates.length, m_gated: gatedGaps.length, m_refused: refused };
  const stamp = {
    ...(opts.runAt ? { run_at: opts.runAt } : {}),
    ...(opts.runId ? { run_id: opts.runId } : {}),
  };

  const summary: RunSummary = {
    candidates: m,
    testable: 0,
    supported: 0,
    eligible: 0,
    suppressed: {},
    rungs: emptyRungs(),
    families: {},
    watching: [],
    tests_in_run: m,
    m_recorded: mBasis.m_recorded,
    m_gated: mBasis.m_gated,
    m_refused: mBasis.m_refused,
  };

  const out: EvaluatedRow[] = candidates.map((c, i) => {
    const g = gaps[i] ?? null;
    const q = g ? bh.qAdj[i] ?? null : null;
    const strokesAt = g ? strokesFor(c, g) : null;
    const strokes = strokesAt?.value ?? null;

    let stability: SupportEvidencePatch['stability'];
    let stabilityAgrees: boolean | null = null;
    if (g && c.splitHalf) {
      const sign = g.direction === 'weakness' ? 1 : -1;
      const sh = splitHalfStability({
        gapOld: sign * c.splitHalf.gap_old,
        gapNew: sign * c.splitHalf.gap_new,
        gapFull: sign * g.gap,
        nOld: c.splitHalf.n_old,
        nNew: c.splitHalf.n_new,
      });
      stabilityAgrees = sh.agrees;
      stability = { split_half: { ...sh, gap_old: c.splitHalf.gap_old, gap_new: c.splitHalf.gap_new }, checkpoints_held: c.checkpointsHeld };
    }

    const ladder = assignLadder({
      q,
      rangeExcludesZero: g ? rangeExcludesZero(g) : false,
      n: c.n,
      floor: c.def.floor,
      roundsN: c.roundsN,
      roundFloor: c.def.roundFloor,
      arms: c.arms,
      strokes,
      why: c.why,
      stabilityAgrees,
      checkpointsHeld: c.checkpointsHeld,
      cap: c.cap,
    });
    const reasons = [...ladder.reasons];
    if (ladder.ladder !== 'not_enough_yet') {
      for (const r of c.capReasons) if (!reasons.includes(r)) reasons.push(r);
    }
    if (!g && c.untestableReason) reasons.splice(reasons.indexOf('untestable') + 1, 0, `untestable:${c.untestableReason}`);

    const shrink = g ? shrinkFor(c, g) : null;
    const strokesShrunk =
      g && strokes !== null && shrink && g.gap !== 0
        ? round(strokes * Math.min(1, Math.max(0, shrink.gap / g.gap)), 3)
        : null;

    const support: SupportField = g
      ? {
          version: SUPPORT_VERSION,
          testable: true,
          family: c.family,
          gap: g.gap,
          gap_unit: g.gap_unit,
          range_lo: g.range_lo,
          range_hi: g.range_hi,
          p_one_sided: round(g.p_one_sided, 6),
          p_bh: round(g.p_bh, 6),
          q_adj: q === null ? undefined : round(q, 6),
          tests_in_run: m,
          m_basis: mBasis,
          method: g.method,
          test: g.test,
          direction: g.direction,
          direction_basis: g.direction_basis,
          ...(strokesAt ? { strokes_basis: strokesAt.basis } : {}),
          n: c.n,
          n_unit: c.nUnit,
          rounds_n: c.roundsN,
          floor: c.def.floor,
          round_floor: c.def.roundFloor,
          benchmark: c.benchmark ? { source: c.benchmark.source, value: round(c.benchmark.value) } : null,
          ...(c.benchmark ? { benchmark_basis: c.benchmark.basis } : {}),
          benchmark_variance: g.benchmark_variance,
          clear: ladder.clear,
          ...stamp,
        }
      : {
          version: SUPPORT_VERSION,
          testable: false,
          untestable_reason: c.untestableReason ?? 'untestable',
          family: c.family,
          tests_in_run: m,
          m_basis: mBasis,
          n: c.n,
          n_unit: c.nUnit,
          rounds_n: c.roundsN,
          floor: c.def.floor,
          round_floor: c.def.roundFloor,
          ...stamp,
        };

    // Summary.
    if (g) summary.testable += 1;
    if (g && q !== null && q <= BH_Q) summary.supported += 1;
    if (ladder.ladder !== 'not_enough_yet') summary.eligible += 1;
    summary.rungs[ladder.ladder] += 1;
    const fam = (summary.families[c.family] ??= {});
    fam[ladder.ladder] = (fam[ladder.ladder] ?? 0) + 1;
    if (ladder.ladder === 'not_enough_yet') {
      const first = reasons.find((r) => r.startsWith('untestable:')) ?? reasons[0] ?? 'unknown';
      summary.suppressed[first] = (summary.suppressed[first] ?? 0) + 1;
      const shortN = c.n < c.def.floor;
      const shortRounds = c.roundsN !== null && c.roundsN < c.def.roundFloor;
      const shortArms = c.arms.filter((a) => !(a.have !== null && a.have >= a.need));
      if (g && (shortN || shortRounds || shortArms.length > 0)) {
        summary.watching.push({
          family: c.family,
          unit: c.nUnit,
          have_n: c.n,
          need_n: c.def.floor,
          rounds_have: c.roundsN,
          rounds_need: c.def.roundFloor,
          ...(shortArms.length > 0 ? { arms: shortArms.map((a) => ({ key: a.key, have: a.have, need: a.need })) } : {}),
        });
      }
    }

    const patch: SupportEvidencePatch = {
      support,
      ladder: ladder.ladder,
      what_ladder: ladder.what_ladder,
      ladder_reasons: reasons,
      strokes_shrunk: strokesShrunk,
      shrink,
      ...(stability ? { stability } : {}),
    };
    return { id: c.id, family: c.family, patch };
  });

  return { rows: out, summary };
}
