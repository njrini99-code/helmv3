/**
 * Slice 5b insight angle — lag leave (`04` example 1, `03` §8 item 10).
 * Flag `coachhelm_insight_angles_v1`.
 *
 * WHAT: of the player's first putts from 30+ ft, the share that finished
 * inside 5 ft (holed counts as inside), against the POOLED share of their
 * teammates (5+ teammates with lag putts, 100+ pooled; the player never in
 * the pool). Leave = the second putt's own recorded start; a missed lag with
 * no recorded second-putt distance is left out and counted. One-sided pooled
 * two-proportion z ≥ 1.645, ≥ 20 lag putts over ≥ 3 rounds.
 *
 * Strokes (a ROUGH ESTIMATE, `estimated: true`, no projection): the leave
 * gap × lag putts per 18 × how much more often a lag left over 5 ft became a
 * 3-putt than one left inside (the player's own split when each side has 10+
 * lag putts, else the team's). It assumes the player would convert a better
 * leave at that rate, which the record cannot check. Below 0.3 strokes a
 * round there is no row (`02` §2), but the counted leave still feeds the
 * three-putt chain.
 *
 * Link to the three-putt chain (`04` example 1): the three-putt row carries
 * this family's counts as `detail.lag_leave` (its NEXT line: "Lag leave from
 * 30+ ft: now X of Y inside 5 ft (P%; team Q%)"), and this row names
 * `three_putt_chain` as its linked family.
 */
import type { ComposedContent, GeneratorAggregate, InsightCategory, MetricId } from '@/lib/coachhelm/v3/engine/types';
import {
  ANGLE_FAMILIES,
  ANGLE_MIN_Z,
  PEER_MIN_PLAYERS,
  angleReadFields,
  angleTest,
  familyDetail,
  newestFirstIds,
  pickExamples,
  primaryTeamId,
  round1,
  round2,
  roughEstimateStrokes,
  totalHoles,
  windowOf,
  type AngleData,
  type AngleEvidence,
  type AngleGapInput,
  type AngleReceipts,
  type AngleWindow,
  type ReceiptExample,
  type SplitHalfInput,
} from './angle-data';
import { AngleGenerator } from './angle-generator';
import { inBothVoices } from '@/lib/coachhelm/v3/engine/coach-voice';
import {
  LAG_FROM_FT,
  LAG_INSIDE_FT,
  TEAM_POOL_MIN_ATTEMPTS,
  extractPutts,
  poolTeammates,
  recordOf,
  type LagPutt,
  type TeamShotData,
} from './counted-shots';

export const LAG_MIN_PUTTS = ANGLE_FAMILIES.lag_leave.floor;
export const LAG_MIN_STROKES_PER_ROUND = 0.3;
/** Lag putts each side of the leave line before the player's own 3-putt split sizes the read. */
export const LAG_OWN_SPLIT_MIN = 10;

export interface LagCounts {
  inside: number;
  n: number;
  pct: number | null;
}

export interface LagTeam extends LagCounts {
  players: number;
  /** Unrounded share inside. */
  rate: number;
  three_putt_after_over: number | null;
  three_putt_after_inside: number | null;
}

/** The counts the three-putt chain carries as its counted path (`04` example 1). */
export interface LagLink extends LagCounts {
  from_ft: number;
  inside_ft: number;
  team: LagCounts & { players: number } | null;
  linked_family: 'lag_leave';
}

export interface LagLeaveResult {
  window: AngleWindow;
  rounds: number;
  round_ids: string[];
  rounds_with_lag: number;
  lag: LagCounts;
  rate: number;
  team: LagTeam | null;
  z: number | null;
  lag_per_18: number;
  /** 3-putt share after a leave over / inside 5 ft, and which split sized the read. */
  conversion: { over: number | null; inside: number | null; basis: 'own' | 'team' | null };
  strokes_per_round: number | null;
  split_half: SplitHalfInput | null;
  leave_missing: number;
  examples: ReceiptExample[];
  qualifies: boolean;
}

function counts(xs: readonly LagPutt[]): LagCounts {
  const inside = xs.filter((x) => x.inside).length;
  return { inside, n: xs.length, pct: xs.length ? round1((100 * inside) / xs.length) : null };
}

function threePuttShare(xs: readonly LagPutt[]): number | null {
  return xs.length ? xs.filter((x) => x.three_putt).length / xs.length : null;
}

/** Pooled teammates' lag putts; null below 5 teammates with lag putts or 100 pooled. */
export function lagPool(team: TeamShotData | null, playerId: string): (LagTeam & { putts: LagPutt[] }) | null {
  const per = poolTeammates(team, playerId).map((t) => extractPutts({ rounds: t.rounds, holes: t.holes, shots: t.shots, scale: null }).lag);
  const withLag = per.filter((xs) => xs.length > 0);
  const all = withLag.flat();
  if (withLag.length < PEER_MIN_PLAYERS || all.length < TEAM_POOL_MIN_ATTEMPTS) return null;
  const c = counts(all);
  return {
    ...c,
    players: withLag.length,
    rate: c.inside / c.n,
    three_putt_after_over: threePuttShare(all.filter((x) => !x.inside)),
    three_putt_after_inside: threePuttShare(all.filter((x) => x.inside)),
    putts: all,
  };
}

/** One-sided pooled two-proportion z for "the player's share is lower than the team's". */
export function lowerShareZ(k: number, n: number, K: number, N: number): number | null {
  if (n <= 0 || N <= 0) return null;
  const p = (k + K) / (n + N);
  const se = Math.sqrt(p * (1 - p) * (1 / n + 1 / N));
  if (!(se > 0)) return null;
  return (K / N - k / n) / se;
}

/** Pure compute. Null when the player has no lag putt with a known leave. */
export function computeLagLeave(data: AngleData, team: TeamShotData | null): LagLeaveResult | null {
  const own = extractPutts(recordOf(data));
  const lag = own.lag;
  if (lag.length === 0) return null;
  const pool = lagPool(team, data.playerId);
  const c = counts(lag);
  const rate = c.inside / c.n;
  const z = pool ? lowerShareZ(c.inside, c.n, pool.inside, pool.n) : null;
  const holes = totalHoles(data.rounds);
  const per18 = holes > 0 ? (lag.length * 18) / holes : 0;

  const over = lag.filter((x) => !x.inside);
  const inside = lag.filter((x) => x.inside);
  const ownSplit = over.length >= LAG_OWN_SPLIT_MIN && inside.length >= LAG_OWN_SPLIT_MIN;
  const convOver = ownSplit ? threePuttShare(over) : (pool?.three_putt_after_over ?? null);
  const convInside = ownSplit ? threePuttShare(inside) : (pool?.three_putt_after_inside ?? null);
  const conv = convOver !== null && convInside !== null ? Math.max(0, convOver - convInside) : null;
  const strokes = pool && conv !== null ? Math.max(0, pool.rate - rate) * per18 * conv : null;
  const roundsWith = new Set(lag.map((x) => x.round_id)).size;
  const def = ANGLE_FAMILIES.lag_leave;

  let split: SplitHalfInput | null = null;
  if (pool) {
    const order = [...data.rounds].sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1));
    const old = new Set(order.slice(0, Math.floor(order.length / 2)).map((r) => r.id));
    const a = lag.filter((x) => old.has(x.round_id));
    const b = lag.filter((x) => !old.has(x.round_id));
    if (a.length > 0 && b.length > 0) {
      const share = (xs: LagPutt[]) => xs.filter((x) => x.inside).length / xs.length;
      // Percentage points, positive = worse (the support pass's proportion gap unit).
      split = { gap_old: round2(100 * (pool.rate - share(a))), gap_new: round2(100 * (pool.rate - share(b))), n_old: a.length, n_new: b.length };
    }
  }

  const qualifies =
    pool !== null &&
    c.n >= def.floor &&
    data.rounds.length >= def.round_floor &&
    roundsWith >= def.round_floor &&
    pool.rate > 0 &&
    pool.rate < 1 &&
    z !== null &&
    z >= ANGLE_MIN_Z &&
    strokes !== null &&
    strokes >= LAG_MIN_STROKES_PER_ROUND;

  return {
    window: windowOf(data.rounds),
    rounds: data.rounds.length,
    round_ids: newestFirstIds(data.rounds),
    rounds_with_lag: roundsWith,
    lag: c,
    rate,
    team: pool ? { inside: pool.inside, n: pool.n, pct: pool.pct, players: pool.players, rate: pool.rate, three_putt_after_over: pool.three_putt_after_over, three_putt_after_inside: pool.three_putt_after_inside } : null,
    z: z === null ? null : round2(z),
    lag_per_18: per18,
    conversion: { over: convOver === null ? null : round2(convOver), inside: convInside === null ? null : round2(convInside), basis: conv === null ? null : ownSplit ? 'own' : 'team' },
    strokes_per_round: strokes,
    split_half: split,
    leave_missing: own.excluded.lag_leave_missing,
    examples: pickExamples(
      over.map((x) => ({
        round_id: x.round_id,
        hole_number: x.hole_number,
        hole_id: x.hole_id,
        date: x.date,
        note: `first putt ${round1(x.first_ft)} ft, left ${round1(x.leave_ft)} ft${x.three_putt ? ' (3-putt)' : ''}`,
      })),
    ),
    qualifies,
  };
}

/** The lag counts the three-putt chain carries (its counted path and NEXT line); null without a lag putt. */
export function lagLinkOf(r: LagLeaveResult | null): LagLink | null {
  if (!r) return null;
  return {
    ...r.lag,
    from_ft: LAG_FROM_FT,
    inside_ft: LAG_INSIDE_FT,
    team: r.team ? { inside: r.team.inside, n: r.team.n, pct: r.team.pct, players: r.team.players } : null,
    linked_family: 'lag_leave',
  };
}

/** "Lag leave from 30+ ft: now 17 of 33 inside 5 ft (52%; team 68%)." */
export function lagLinkLine(l: LagLink): string {
  return `Lag leave from ${l.from_ft}+ ft: ${l.inside} of ${l.n} inside ${l.inside_ft} ft (${l.pct ?? 0}%${l.team ? `; team ${l.team.pct ?? 0}%` : ''}).`;
}

export interface LagLeaveAggregate extends GeneratorAggregate {
  result: LagLeaveResult;
}

export function toLagAggregate(r: LagLeaveResult | null): LagLeaveAggregate | null {
  if (!r || !r.qualifies) return null;
  return { result: r, sampleN: r.lag.n, playerValue: r.lag.pct ?? 0, windowRoundIds: r.round_ids };
}

export function lagGapInput(r: LagLeaveResult): AngleGapInput | null {
  if (!r.team || !(r.team.rate > 0 && r.team.rate < 1)) return null;
  return { kind: 'proportion', k: r.lag.inside, n: r.lag.n, benchmark: Math.round(r.team.rate * 10000) / 10000, polarity: 'higher_better' };
}

export const LAG_DEFINITION =
  `Lag leave = first putts from ${LAG_FROM_FT}+ ft that holed or left the second putt within ${LAG_INSIDE_FT} ft (its own recorded start) ÷ first putts from ${LAG_FROM_FT}+ ft with a known leave. ` +
  "Compared with the pooled lag putts of teammates with 3+ countable rounds (newest 40 each), 5+ teammates and 100+ lag putts. Strokes are a rough estimate: the leave gap × lag putts per 18 × the extra 3-putt share after a leave over 5 ft.";

export function composeLagLeave(agg: LagLeaveAggregate): ComposedContent & { category: InsightCategory } {
  const r = agg.result;
  const team = r.team as LagTeam;
  const strokes = roughEstimateStrokes(r.strokes_per_round ?? 0, 1);
  const teamLabel = `Teammates' pooled lag putts (${team.n} from ${team.players} players)`;
  const receipts: AngleReceipts = {
    window: r.window,
    definition: LAG_DEFINITION,
    samples: { rounds: r.rounds, rounds_with_lag_putts: r.rounds_with_lag, lag_putts: r.lag.n, team_lag_putts: team.n, teammates: team.players },
    exclusions: { lag_putts_without_second_putt_distance: r.leave_missing },
    examples: r.examples,
  };
  const evidence: AngleEvidence = {
    ...angleReadFields('lag_leave', r.round_ids, { source: 'team_pool', label: teamLabel, value: team.pct ?? 0, n: team.n }),
    ...(r.split_half ? { stability: { split_half: r.split_half } } : {}),
    metric: ANGLE_FAMILIES.lag_leave.metric,
    metric_label: `Lag putts from ${LAG_FROM_FT}+ ft left inside ${LAG_INSIDE_FT} ft`,
    unit: 'percent',
    polarity: 'higher_better',
    your_value: r.lag.pct ?? 0,
    your_value_display: `${r.lag.inside} of ${r.lag.n} (${r.lag.pct ?? 0}%)`,
    comparison_value: team.pct ?? 0,
    comparison_label: teamLabel,
    comparison_source: 'team_avg',
    sample_n: r.lag.n,
    window_days: r.window.window_days,
    window_start: r.window.window_start,
    window_end: r.window.window_end,
    strokes_impact: strokes,
    strokes_impact_method: 'rough_estimate',
    estimated: true,
    confidence: 0,
    confidence_factors: { sample_adequacy: Math.min(r.lag.n / 40, 1), recency: 1, variance: 0.5 },
    detail: {
      ...familyDetail('lag_leave'),
      gap_input: lagGapInput(r),
      test: angleTest(r.z),
      angle: 'lag_leave',
      linked_family: 'three_putt_chain',
      chain: ['putting'],
      receipts,
      lag: r.lag,
      team: { inside: team.inside, n: team.n, pct: team.pct, players: team.players },
      lag_per_18: round2(r.lag_per_18),
      conversion: r.conversion,
      strokes_per_round: r.strokes_per_round === null ? null : round2(r.strokes_per_round),
      from_ft: LAG_FROM_FT,
      inside_ft: LAG_INSIDE_FT,
      rounds: r.rounds,
    },
    diagnosis: {
      symptom: `${r.lag.inside} of ${r.lag.n} lag putts from ${LAG_FROM_FT}+ ft finished inside ${LAG_INSIDE_FT} ft (${r.lag.pct}%) vs ${team.pct}% for the team`,
      root_cause: 'The record counts where the lag putts stopped, not why (pace or line).',
      causality_level: 'inferred_hypothesis',
      drivers: [
        { metric: ANGLE_FAMILIES.lag_leave.metric, label: `Lag putts left inside ${LAG_INSIDE_FT} ft`, value: r.lag.pct ?? 0, unit: 'percent', sample_n: r.lag.n, source: 'golf_shots (putting)' },
      ],
      recommended_action: `Lag ladder from 30, 40 and 50 ft, scored on putts finishing inside ${LAG_INSIDE_FT} ft; aim for the team's ${team.pct}% over the next 40 lag putts.`,
      confidence_reason: '',
    },
  };
  return {
    category: 'putting',
    ...inBothVoices((v) => ({
      title: `Lag putts from ${LAG_FROM_FT}+ ft are leaving long second putts`,
      content:
        `${r.lag.inside} of ${v.players} ${r.lag.n} first putts from ${LAG_FROM_FT}+ ft finished inside ${LAG_INSIDE_FT} ft (${r.lag.pct}%); ${v.your} teammates' pooled lag putts did ${team.pct}%. ` +
        `As a rough estimate (it assumes a closer leave converts the way ${r.conversion.basis === 'own' ? v.pick('yours do', 'theirs do') : "the team's do"}), that is about ${strokes.toFixed(1)} strokes a round in extra 3-putts.` +
        (r.leave_missing ? ` ${r.leave_missing} lag putts with no recorded second-putt distance are left out.` : ''),
    })),
    priority: strokes >= 0.5 ? 'medium' : 'low',
    signature: 'lag_leave:30ft',
    evidence,
  };
}

export class LagLeaveGenerator extends AngleGenerator<LagLeaveAggregate> {
  readonly name = 'LagLeaveGenerator';
  readonly metricId: MetricId = 'sg_putting';
  readonly insightType = 'putting';
  readonly category: InsightCategory = 'putting';
  readonly minSampleN = LAG_MIN_PUTTS;
  protected override readonly requiresStanding = false;

  protected override signatureScope(): string {
    return 'lag_leave:';
  }

  async aggregate(): Promise<LagLeaveAggregate | null> {
    const data = await this.loaders.data();
    const teamId = primaryTeamId(data.rounds);
    const team = teamId ? await this.loaders.teamShots(teamId) : null;
    return toLagAggregate(computeLagLeave(data, team));
  }

  composeContent(agg: LagLeaveAggregate): ComposedContent {
    const { category: _category, ...composed } = composeLagLeave(agg);
    return composed;
  }
}
