/**
 * ============================================================================
 * buildTeamBoardViewModel — pure adapter for the Team Stats Matrix Board
 * ----------------------------------------------------------------------------
 * Pure, unit-tested functions that turn the SAME raw payloads
 * `stats/team/page.tsx` already resolves (per-player aggregates, CoachHelm
 * intelligence, and the per-player standing map) into the shapes
 * `MatrixBoard`/`RankCell`/`RingGauge`/`Sparkline`/`SignalChip` expect. No
 * Supabase, no React — just data in, data out, so every branch here is
 * fixture-testable without mounting anything.
 *
 * `rankByValue` computes the five RankCell columns (Tee/App/Short/Putt/Scor)
 * from the roster's standing rows + scoring averages — the standing map
 * carries only a `team_pct` percentile, not an ordinal rank, so ranking the
 * whole roster per category happens HERE, once, and is reused for every row.
 * `signalToneFor` is the ONE hot/watch/quiet decision point (spec §5.2).
 * ========================================================================== */

import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { Unit } from '@/components/golf/coachhelm/v3/StandingBar/types';
import { classifyTrendDelta } from '@/lib/coachhelm/trend';
import { SCORE_TREND_THRESHOLD } from '@/lib/golf/scoring-trend';
import type { SignalTone } from '@/components/fairway/modules';

// ============================================================================
// SHARED FORMATTERS
// ============================================================================

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** Signed strokes-gained display, e.g. "+1.0" / "−0.3" / "E". Em-dash when null. */
export function fmtSg(value: number | null): string {
  const n = finite(value);
  if (n === null) return '—';
  const rounded = Math.round(n * 10) / 10;
  if (rounded === 0) return 'E';
  const sign = rounded > 0 ? '+' : '−';
  return `${sign}${Math.abs(rounded).toFixed(1)}`;
}

function fmtScoringAvg(value: number | null): string {
  const n = finite(value);
  return n === null ? '—' : n.toFixed(1);
}

function fmtScore(value: number | null): string {
  const n = finite(value);
  return n === null ? '—' : String(Math.round(n));
}

/** Render a raw metric value with its registry unit — percent/strokes/feet/yards/count. */
export function formatMetricValue(value: number, unit: Unit): string {
  switch (unit) {
    case 'percent':
      return `${Math.round(value)}%`;
    case 'strokes':
      return fmtSg(value);
    case 'feet':
      return `${value.toFixed(1)} ft`;
    case 'yards':
      return `${value.toFixed(1)} yd`;
    case 'count':
    default:
      return value.toFixed(1);
  }
}

// ============================================================================
// RANKING — the roster's shape per category (RankCell inputs)
// ============================================================================

export interface RankInfo {
  rank: number;
  of: number;
}

/**
 * Rank a roster by a metric value — 1 = best. Entries with a null/non-finite
 * value are excluded (no rank rather than a fabricated last place); `of` is
 * the count of players who DO carry a value for this metric, so a
 * cold-start category never inflates its own denominator.
 */
export function rankByValue(
  entries: ReadonlyArray<{ id: string; value: number | null }>,
  direction: 'higher_better' | 'lower_better',
): Map<string, RankInfo> {
  const usable = entries.filter(
    (e): e is { id: string; value: number } => e.value !== null && Number.isFinite(e.value),
  );
  const sorted = [...usable].sort((a, b) =>
    direction === 'higher_better' ? b.value - a.value : a.value - b.value,
  );
  const of = sorted.length;
  const out = new Map<string, RankInfo>();
  sorted.forEach((entry, i) => out.set(entry.id, { rank: i + 1, of }));
  return out;
}

/** Rounds-weighted mean (falls back to unweighted when no positive weights). Null on an empty/all-null series. */
export function weightedMean(entries: ReadonlyArray<{ value: number | null; weight: number }>): number | null {
  let weightedSum = 0;
  let totalWeight = 0;
  let plainSum = 0;
  let n = 0;
  for (const e of entries) {
    const v = finite(e.value);
    if (v === null) continue;
    n += 1;
    plainSum += v;
    if (e.weight > 0 && Number.isFinite(e.weight)) {
      weightedSum += v * e.weight;
      totalWeight += e.weight;
    }
  }
  if (totalWeight > 0) return weightedSum / totalWeight;
  return n > 0 ? plainSum / n : null;
}

// ============================================================================
// SIGNAL — the one hot/watch/quiet decision point
// ============================================================================

/** Minimum completed rounds before `computeScoringTrendFromRounds` can emit a real signal (5-round recent + 3-round minimum previous window). */
export const TREND_SIGNAL_MIN_ROUNDS = 8;

export type ScoringTrendVerdict = 'improving' | 'declining' | 'stable';

/** Classify a player's scoring_trend delta through the canonical shared threshold. Null delta = no signal yet (cold-start), NOT "stable". */
export function scoringTrendVerdict(delta: number | null): ScoringTrendVerdict | null {
  if (delta === null || !Number.isFinite(delta)) return null;
  return classifyTrendDelta(delta, { lowerIsBetter: true, threshold: SCORE_TREND_THRESHOLD });
}

export interface SignalToneInput {
  isTopPerformer: boolean;
  trend: ScoringTrendVerdict | null;
  topInsightPriority: string | null;
}

/**
 * hot = top-performer OR improving trend. watch = declining trend OR a
 * high/critical top-insight priority (a slump CoachHelm has already flagged).
 * quiet = everything else (steady, or awaiting enough rounds for a trend).
 */
export function signalToneFor(input: SignalToneInput): SignalTone {
  if (input.isTopPerformer || input.trend === 'improving') return 'hot';
  if (
    input.trend === 'declining' ||
    input.topInsightPriority === 'high' ||
    input.topInsightPriority === 'critical'
  ) {
    return 'watch';
  }
  return 'quiet';
}

const CATEGORY_PRIORITY: ReadonlyArray<{ key: 'putt' | 'app' | 'tee' | 'short'; label: string }> = [
  { key: 'putt', label: 'Putting' },
  { key: 'app', label: 'Approach' },
  { key: 'tee', label: 'Off the tee' },
  { key: 'short', label: 'Short game' },
];

/**
 * The roster-relative worst SG category for a player's ranks — drives the
 * "<Category> slump" watch label. Each category's `of` denominator only
 * counts players who carry a standing value for THAT metric (rankByValue's
 * contract, above), so raw rank numbers aren't comparable across categories
 * — rank 5 of 6 is worse than rank 5 of 12. Compare the rank/of percentile
 * instead. Ties favor putting (the most common early leak), via
 * `CATEGORY_PRIORITY`'s iteration order + a strict `>` (first-seen wins).
 */
export function worstCategoryLabel(ranks: {
  tee: RankInfo | null;
  app: RankInfo | null;
  short: RankInfo | null;
  putt: RankInfo | null;
}): string | null {
  let worst: { label: string; pct: number } | null = null;
  for (const { key, label } of CATEGORY_PRIORITY) {
    const r = ranks[key];
    if (!r) continue;
    const pct = r.rank / r.of;
    if (!worst || pct > worst.pct) worst = { label, pct };
  }
  return worst?.label ?? null;
}

// ============================================================================
// EXPAND BAND — worst standing metric for a player
// ============================================================================

/** The player's lowest-team-percentile standing row — the "worst metric" the inline expand band names. Ties break on metric id for determinism. */
export function worstStandingMetric(
  map: Map<MetricId, PlayerStanding> | undefined,
): { metric: MetricId; standing: PlayerStanding } | null {
  if (!map) return null;
  let worst: { metric: MetricId; standing: PlayerStanding } | null = null;
  for (const [metric, standing] of map) {
    if (standing.team_pct === null) continue;
    const worstPct = worst?.standing.team_pct;
    if (worst === null || standing.team_pct < (worstPct as number) || (standing.team_pct === worstPct && metric < worst.metric)) {
      worst = { metric, standing };
    }
  }
  return worst;
}

// ============================================================================
// VIEW MODEL
// ============================================================================

export interface TeamBoardPlayerInput {
  id: string;
  name: string;
  classYear: string | null;
  roundsPlayed: number;
  scoringAverage: number | null;
  /**
   * Strictly-18-hole round count / average — the SAME `rounds_played_18` /
   * `scoring_average_18` the dashboard's "Team Scoring Avg" pools (excludes
   * 9-hole and partial rounds, unlike `roundsPlayed`/`scoringAverage`
   * above). Used ONLY for the board's round-weighted "Team scoring" KPI so
   * it matches dashboard-data.ts exactly; the row's own displayed average
   * and rank still use the all-format `scoringAverage`/`roundsPlayed`.
   */
  roundsPlayed18: number;
  scoringAverage18: number | null;
  /** recent-minus-prior normalized-score delta; null = not enough rounds for a signal yet (never a fabricated 0). */
  scoringTrend: number | null;
  lastRoundScore: number | null;
  /** Oldest → newest normalized scores, for the Sparkline. May be empty (honest em-dash). */
  recentScores: number[];
  composite: number | null;
  topInsightTitle: string | null;
  topInsightPriority: string | null;
}

export interface TeamBoardInput {
  players: TeamBoardPlayerInput[];
  standingByPlayer: Map<string, Map<MetricId, PlayerStanding>>;
  /** Teammates with a stats-cache row that fed the composite z-score — <3 makes "top performer" statistically unstable. */
  intelligenceSampleSize: number;
  rounds30d: number;
}

export interface TeamBoardRowViewModel {
  id: string;
  name: string;
  classYear: string | null;
  roundsPlayed: number;
  scoringAverage: string;
  ranks: {
    tee: RankInfo | null;
    app: RankInfo | null;
    short: RankInfo | null;
    putt: RankInfo | null;
    scoring: RankInfo | null;
  };
  composite: number | null;
  trendSeries: number[];
  signal: { tone: SignalTone; label: string };
  expand: {
    worstMetricLabel: string | null;
    worstMetricValue: string | null;
    sgPutt: string;
    lastRound: string;
    links: { fullStats: string; fingerprint: string; prescribe: string };
  };
}

export interface TeamBoardViewModel {
  kpis: {
    teamScoring: string;
    teamSg: string;
    teamSgRaw: number | null;
    trajectory: { improving: number; steady: number; declining: number };
    rounds30d: number;
  };
  rows: TeamBoardRowViewModel[];
}

/** SG category → RankCell column, in the mockup's Tee/App/Short/Putt order (all higher-is-better). */
const RANK_CATEGORY_METRICS: ReadonlyArray<{ key: 'tee' | 'app' | 'short' | 'putt'; metric: MetricId }> = [
  { key: 'tee', metric: 'sg_ott' },
  { key: 'app', metric: 'sg_approach' },
  { key: 'short', metric: 'sg_around_green' },
  { key: 'putt', metric: 'sg_putting' },
];

/**
 * Turn the roster's raw + standing data into `MatrixBoard` row data. Pure —
 * the caller (`TeamStatsBoard`) maps this into `RankCell`/`RingGauge`/
 * `Sparkline`/`SignalChip` JSX; nothing here touches React.
 */
export function buildTeamBoardViewModel(input: TeamBoardInput): TeamBoardViewModel {
  const { players, standingByPlayer, intelligenceSampleSize, rounds30d } = input;

  const categoryRanks: Record<'tee' | 'app' | 'short' | 'putt', Map<string, RankInfo>> = {
    tee: new Map(),
    app: new Map(),
    short: new Map(),
    putt: new Map(),
  };
  for (const { key, metric } of RANK_CATEGORY_METRICS) {
    categoryRanks[key] = rankByValue(
      players.map((p) => ({ id: p.id, value: standingByPlayer.get(p.id)?.get(metric)?.player_value ?? null })),
      'higher_better',
    );
  }
  const scoringRanks = rankByValue(
    players.map((p) => ({ id: p.id, value: p.scoringAverage })),
    'lower_better',
  );

  // "Top performer" crown — same floor the roster-tile monolith uses: needs a
  // non-provisional sample size AND at least 2 comparable composites (a solo
  // carrier isn't "leading" anyone).
  const composites = players.map((p) => p.composite).filter((v): v is number => v !== null);
  const topComposite = intelligenceSampleSize >= 3 && composites.length >= 2 ? Math.max(...composites) : null;

  // "Most improved" — the single largest-magnitude improving delta on the roster.
  let mostImprovedId: string | null = null;
  let mostImprovedMag = 0;
  for (const p of players) {
    if (scoringTrendVerdict(p.scoringTrend) === 'improving' && p.scoringTrend !== null) {
      const mag = Math.abs(p.scoringTrend);
      if (mag > mostImprovedMag) {
        mostImprovedMag = mag;
        mostImprovedId = p.id;
      }
    }
  }

  const rows: TeamBoardRowViewModel[] = players.map((p) => {
    const standing = standingByPlayer.get(p.id);
    const ranks = {
      tee: categoryRanks.tee.get(p.id) ?? null,
      app: categoryRanks.app.get(p.id) ?? null,
      short: categoryRanks.short.get(p.id) ?? null,
      putt: categoryRanks.putt.get(p.id) ?? null,
      scoring: scoringRanks.get(p.id) ?? null,
    };

    const isTopPerformer = p.composite !== null && topComposite !== null && p.composite === topComposite;
    const trend = scoringTrendVerdict(p.scoringTrend);
    const tone = signalToneFor({ isTopPerformer, trend, topInsightPriority: p.topInsightPriority });

    let label: string;
    if (tone === 'hot') {
      label = isTopPerformer ? 'Top performer' : p.id === mostImprovedId ? '▲ Most improved' : 'Improving';
    } else if (tone === 'watch') {
      const worstCategory = worstCategoryLabel(ranks);
      label = worstCategory ? `${worstCategory} slump` : (p.topInsightTitle ?? 'Needs attention');
    } else if (p.roundsPlayed < TREND_SIGNAL_MIN_ROUNDS) {
      label = `${TREND_SIGNAL_MIN_ROUNDS - p.roundsPlayed} rds to trend`;
    } else {
      label = 'Steady';
    }

    const worst = worstStandingMetric(standing);
    const worstCfg = worst ? getMetricRenderConfig(worst.metric) : null;

    return {
      id: p.id,
      name: p.name,
      classYear: p.classYear,
      roundsPlayed: p.roundsPlayed,
      scoringAverage: fmtScoringAvg(p.scoringAverage),
      ranks,
      composite: p.composite,
      trendSeries: p.recentScores,
      signal: { tone, label },
      expand: {
        worstMetricLabel: worst && worstCfg ? worstCfg.display_label : null,
        worstMetricValue: worst && worstCfg ? formatMetricValue(worst.standing.player_value, worstCfg.unit) : null,
        sgPutt: fmtSg(standing?.get('sg_putting')?.player_value ?? null),
        lastRound: fmtScore(p.lastRoundScore),
        links: {
          fullStats: `/golf/dashboard/stats?player=${p.id}`,
          fingerprint: `/golf/dashboard/players/${p.id}/game`,
          prescribe: `/golf/dashboard/development?player=${p.id}`,
        },
      },
    };
  });

  // Round-weighted, matching the coach dashboard's "Team Scoring Avg"
  // (dashboard-data.ts pools every 18-hole round score across the roster
  // and divides by the total 18-hole round count — 9-hole/partial rounds
  // are excluded there). MUST use `scoringAverage18`/`roundsPlayed18`, not
  // the all-format `scoringAverage`/`roundsPlayed`: a player with mixed
  // 9-hole and 18-hole rounds has `scoringAverage` == `scoringAverage18`
  // (18-first) but `roundsPlayed` counts the 9-hole rounds too, which
  // over-weights that player's 18-hole figure against the dashboard's true
  // pooled denominator. Weighting the 18-only pair recovers the pooled
  // figure exactly, since `scoringAverage18` is itself a mean over
  // `roundsPlayed18` rounds. A player with zero 18-hole rounds has a null
  // `scoringAverage18`, so `weightedMean` naturally excludes them (matching
  // the dashboard, which only ever sums 18-hole scores).
  const teamScoringRaw = weightedMean(
    players.map((p) => ({ value: p.scoringAverage18, weight: p.roundsPlayed18 })),
  );
  const teamScoring = teamScoringRaw === null ? '—' : teamScoringRaw.toFixed(1);

  const teamSgRaw = weightedMean(
    players.map((p) => ({ value: standingByPlayer.get(p.id)?.get('sg_total')?.player_value ?? null, weight: p.roundsPlayed })),
  );

  let improving = 0;
  let steady = 0;
  let declining = 0;
  for (const p of players) {
    const verdict = scoringTrendVerdict(p.scoringTrend);
    if (verdict === 'improving') improving += 1;
    else if (verdict === 'declining') declining += 1;
    else if (verdict === 'stable') steady += 1;
  }

  return {
    kpis: {
      teamScoring,
      teamSg: teamSgRaw === null ? '—' : `${fmtSg(teamSgRaw)} / rd`,
      teamSgRaw,
      trajectory: { improving, steady, declining },
      rounds30d,
    },
    rows,
  };
}
