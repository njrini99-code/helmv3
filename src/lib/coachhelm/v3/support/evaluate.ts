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
 * BH runs across ALL candidates of the run, untestable ones counted at p = 1
 * (see `benjaminiHochberg`).
 *
 * Pure: rows in, plain objects out. The server half is `run-pass.ts`.
 */
import { buildCandidate, type BenchmarkSource, type SupportCandidate } from './candidate';
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
  q_adj?: number;
  tests_in_run: number;
  method?: GapResult['method'];
  test?: GapResult['test'];
  direction?: GapResult['direction'];
  n: number;
  n_unit: string;
  rounds_n: number | null;
  floor: number;
  round_floor: number;
  benchmark?: { source: BenchmarkSource; value: number } | null;
  clear?: boolean;
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

export interface WatchingEntry {
  family: string;
  unit: string;
  have_n: number;
  need_n: number;
  rounds_have: number | null;
  rounds_need: number;
}

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
      const value = shrinkToward(input.value, c.n, c.prior.value, kappa);
      const gap = input.polarity === 'lower_better' ? value - input.benchmark : input.benchmark - value;
      return { kappa, kept_share: round(keptShare(c.n, kappa)), prior_source: c.prior.source, prior_value: c.prior.value, value: round(value), gap: round(gap) };
    }
    case 'two_proportion': {
      // The contrast shrinks toward "no difference", by the smaller side's n.
      const share = keptShare(c.n, kappa);
      return { kappa, kept_share: round(share), prior_source: 'no_difference', prior_value: 0, value: round(g.gap * share), gap: round(g.gap * share) };
    }
  }
}

/** Raw strokes a round at stake in the read's direction; null when not estimable. */
function strokesFor(c: SupportCandidate, g: GapResult): number | null {
  if (c.strokesRaw !== null) return c.strokesRaw;
  if (c.def.strokesPerGapUnit !== undefined) return round(Math.abs(g.gap) * c.def.strokesPerGapUnit, 3);
  return null;
}

export function evaluatePlayerRun(rows: readonly SupportRow[]): PlayerRunEvaluation {
  const candidates = rows.map(buildCandidate);
  const gaps = candidates.map((c) =>
    c.gapInput ? computeGap(c.gapInput, { allowStrength: c.def.allowStrength }) : null,
  );
  const bh = benjaminiHochberg(gaps.map((g) => (g ? g.p_one_sided : null)), BH_Q);
  const m = bh.m;

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
  };

  const out: EvaluatedRow[] = candidates.map((c, i) => {
    const g = gaps[i] ?? null;
    const q = g ? bh.qAdj[i] ?? null : null;
    const strokes = g ? strokesFor(c, g) : null;

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
          q_adj: q === null ? undefined : round(q, 6),
          tests_in_run: m,
          method: g.method,
          test: g.test,
          direction: g.direction,
          n: c.n,
          n_unit: c.nUnit,
          rounds_n: c.roundsN,
          floor: c.def.floor,
          round_floor: c.def.roundFloor,
          benchmark: c.benchmark,
          clear: ladder.clear,
        }
      : {
          version: SUPPORT_VERSION,
          testable: false,
          untestable_reason: c.untestableReason ?? 'untestable',
          family: c.family,
          tests_in_run: m,
          n: c.n,
          n_unit: c.nUnit,
          rounds_n: c.roundsN,
          floor: c.def.floor,
          round_floor: c.def.roundFloor,
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
      if (g && (shortN || shortRounds)) {
        summary.watching.push({
          family: c.family,
          unit: c.nUnit,
          have_n: c.n,
          need_n: c.def.floor,
          rounds_have: c.roundsN,
          rounds_need: c.def.roundFloor,
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
