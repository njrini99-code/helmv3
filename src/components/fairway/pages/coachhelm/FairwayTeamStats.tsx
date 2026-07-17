'use client';

/**
 * ============================================================================
 * FairwayTeamStats — the flag-ON coach team-stats surface (Batch 1a)
 * ----------------------------------------------------------------------------
 * The data-rich Fairway replacement for the legacy /golf/dashboard/stats/team
 * TeamStatsTable. Built entirely from POPULATED columns (no fabrication),
 * behind `isRedesignEnabled()`. Coach-workflow order (playbook §3):
 *
 *   MASTHEAD  → ViewHeader "Team Stats" + the ONE primary CTA.
 *   HERO      → Team Strokes Gained tornado (rounds-weighted team mean of
 *               per-player standing sg_* rows, plotted around x=0 = PGA),
 *               with an SG-total Readout.
 *   LEAK MAPS → putt-make% + approach-proximity LeakMaps vs the PGA curve
 *               (the 10-15 ft putting cliff is the hero finding).
 *   PER-PLAYER→ one InstrumentPanel tile per roster player, each carrying a
 *               StandingStrip for that player's headline leak metric.
 *
 * HONEST-EMPTY everywhere a band/metric has no samples: insufficient-data chart
 * states, omitted team dots, and StandingStrip 'empty'/'cold-start' — never a
 * fabricated zero.
 *
 * Reuse: StrokesGainedTornado / LeakMap / StandingStrip (imported from the
 * Fairway barrel), InstrumentPanel / Readout / Button / ViewHeader primitives.
 * Consumes the SAME data the route already resolves + two thin reads
 * (getTeamLeakMaps, loadPlayerStandingMap) the route performs in its flag fork.
 * ADDITIVE — imported only by the gated branch of the route.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Download } from 'lucide-react';

import {
  ViewHeader,
  StrokesGainedTornado,
  type SGCategory,
  LeakMap,
  type LeakMapBucket,
  StandingStrip,
  InstrumentPanel,
  Readout,
  Button,
  Segmented,
  InlineNotice,
  fairwayToast,
  RuledLeaderStat,
} from '@/components/fairway';

import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import { classifyTrendDelta } from '@/lib/coachhelm/trend';
import { SCORE_TREND_THRESHOLD } from '@/lib/golf/scoring-trend';
import { surfaceName } from '@/lib/golf/surface-registry';

import type { TeamPlayerStats } from '@/app/golf/(dashboard)/dashboard/stats/team/page';
import type { TeamLeakMaps, LeakBucket } from '@/app/golf/actions/stats-leak-maps-types';

// ============================================================================
// PROPS
// ============================================================================

export interface FairwayTeamStatsPlayerIntelligence {
  composite: number | null;
  overall: number | null;
  topInsightTitle: string | null;
  topInsightPriority: string | null;
  insightCount: number;
}

export interface FairwayTeamStatsProps {
  teamName: string;
  /** Same `TeamPlayerStats[]` the legacy table receives. */
  players: TeamPlayerStats[];
  /** Same per-player intelligence map the legacy table receives (keyed by player id). */
  intelligenceByPlayer: Record<string, FairwayTeamStatsPlayerIntelligence>;
  /** True when the intelligence action FAILED (not merely empty) — surfaced as a retry-able notice rather than a cheerful empty. */
  intelligenceError?: boolean;
  /**
   * Teammates (incl. self) with a stats-cache row that fed the composite
   * z-score normalization. < 3 makes every composite statistically unstable,
   * so the per-tile composite is toned down + flagged "provisional" (P139).
   */
  intelligenceSampleSize?: number;
  /** Team-level leak maps (from `getTeamLeakMaps`); null when the load failed. */
  leakMaps: TeamLeakMaps | null;
  /** True when the leak-map action FAILED (not merely empty) — surfaced as a retry-able notice. */
  leakError?: boolean;
  /** Per-player standing snapshot (from `loadPlayerStandingMap`), keyed by player id. */
  standingByPlayer: Map<string, Map<MetricId, PlayerStanding>>;
}

// ============================================================================
// SG HERO — derive the team-mean tornado from per-player standing rows
// ============================================================================

/** SG categories that map to a tornado bar (Total is shown as a Readout, not a bar). */
const SG_CATEGORY_BARS: ReadonlyArray<{ metric: MetricId; label: string }> = [
  { metric: 'sg_ott', label: 'Off the Tee' },
  { metric: 'sg_approach', label: 'Approach' },
  { metric: 'sg_around_green', label: 'Around the Green' },
  { metric: 'sg_putting', label: 'Putting' },
];

/**
 * Rounds-weighted mean of `player_value` for a metric across every player that
 * carries the row: Σ(value × rounds) ÷ Σ rounds — a 2-round walk-on must not
 * weigh the same as a 40-round starter. `PlayerStanding` carries no round
 * count, so weights come from the roster's `rounds_played` (keyed by player
 * id). Falls back to the unweighted mean when no carrier has a positive round
 * count; returns null when no player has the metric (→ honest-empty, never a
 * fake 0). Exported for unit tests.
 */
export function teamMeanFor(
  metric: MetricId,
  standingByPlayer: Map<string, Map<MetricId, PlayerStanding>>,
  roundsByPlayer: ReadonlyMap<string, number>,
): number | null {
  let weightedSum = 0;
  let totalRounds = 0;
  let sum = 0;
  let n = 0;
  for (const [playerId, map] of standingByPlayer) {
    const row = map.get(metric);
    if (row && typeof row.player_value === 'number' && !Number.isNaN(row.player_value)) {
      sum += row.player_value;
      n += 1;
      const rounds = roundsByPlayer.get(playerId) ?? 0;
      if (rounds > 0 && !Number.isNaN(rounds)) {
        weightedSum += row.player_value * rounds;
        totalRounds += rounds;
      }
    }
  }
  if (totalRounds > 0) return weightedSum / totalRounds;
  return n > 0 ? sum / n : null;
}

/**
 * Tour reference label for non-SG benchmark copy — "LPGA Tour" for women's
 * teams, "PGA Tour" otherwise. Mirrors StandingStrip's `pgaReferenceLabel`
 * gender split (the per-player strips on this same page already read "LPGA" for
 * women's rows) so the SG hero + leak-map subtitles agree with the data, which
 * is gender-routed (women's teams anchor to LPGA). Kept as a single helper so
 * the copy can't drift across the four caption sites.
 */
function tourLabel(isWomens: boolean): string {
  return isWomens ? 'LPGA Tour' : 'PGA Tour';
}

/** Signed SG formatter ("+1.0" / "−3.0") for takeaway + Readout copy. */
function fmtSg(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
  return `${sign}${Math.abs(rounded).toFixed(1)}`;
}

// ============================================================================
// LEAK MAP — map loader buckets → chart buckets
// ============================================================================

function toLeakMapBuckets(buckets: LeakBucket[] | undefined): LeakMapBucket[] {
  return (buckets ?? []).map((b) => ({
    label: b.label,
    teamValue: b.team_value,
    pgaValue: b.pga_value,
    sampleN: b.sample_n,
  }));
}

/** Worst wrong-side gap in a leak family → drives the chart takeaway honestly. */
function worstLeakTakeaway(
  buckets: LeakBucket[],
  direction: 'higher_better' | 'lower_better',
  unit: 'percent' | 'feet',
): string | undefined {
  let worst: { label: string; mag: number } | null = null;
  for (const b of buckets) {
    if (b.team_value === null || b.pga_value === null || b.sample_n === 0) continue;
    const raw = b.team_value - b.pga_value;
    const oriented = direction === 'higher_better' ? raw : -raw;
    if (oriented >= 0) continue; // on the GOOD side — not a leak
    const mag = Math.abs(Math.round(raw));
    if (!worst || mag > worst.mag) worst = { label: b.label, mag };
  }
  if (!worst) return undefined;
  const suffix = unit === 'percent' ? 'pp below Tour' : ' ft farther than Tour';
  return `${worst.label} is ${worst.mag}${suffix}.`;
}

// ============================================================================
// PER-PLAYER STANDING — pick the headline leak metric for a player
// ============================================================================

/** Prefer putting (the team's biggest leak), else first available SG category. */
const HEADLINE_METRIC_PRIORITY: ReadonlyArray<MetricId> = [
  'sg_putting',
  'sg_approach',
  'sg_ott',
  'sg_around_green',
  'sg_total',
];

function pickHeadlineMetric(
  map: Map<MetricId, PlayerStanding> | undefined,
): MetricId | null {
  if (!map) return null;
  for (const metric of HEADLINE_METRIC_PRIORITY) {
    if (map.has(metric)) return metric;
  }
  // Fall back to the first standing row of any kind.
  const first = map.keys().next();
  return first.done ? null : first.value;
}

function fmtNumber(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}

function fmtComposite(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  return `${Math.round(value)}/100`;
}

/** Percent to 1 decimal, em-dash when null/NaN (never a fabricated 0%). */
function fmtPct(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  return `${value.toFixed(1)}%`;
}

/** Whole-number score (best round), em-dash when null. */
function fmtScore(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  return `${Math.round(value)}`;
}

/** Handicap with golf-convention sign (+ for over-par index), em-dash when null. */
function fmtHandicap(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  // "+" denotes a PLUS handicap (better than scratch, stored negative).
  return value < 0 ? `+${Math.abs(value).toFixed(1)}` : value.toFixed(1);
}

// ── Scoring-trend classification ────────────────────────────────────────────
// scoring_trend is recent-avg minus prior-avg of normalized scores (computed
// by the canonical `computeScoringTrendFromRounds`, see stats/team/page.tsx),
// so a NEGATIVE value = lower scores = improving. Classification itself routes
// through the SAME `classifyTrendDelta` + `SCORE_TREND_THRESHOLD` the
// CoachHelm Players tab roster table uses (#914) — a given delta can't read
// "Declining" here and "Improving" there.
type TrendVerdict = 'improving' | 'declining' | 'steady';

interface TrendDisplay {
  verdict: TrendVerdict;
  label: string;
  cls: string;
  arrow: string;
  magnitude: string | null;
}

function classifyScoringTrend(trend: number | null): TrendDisplay | null {
  if (trend === null || Number.isNaN(trend)) return null;
  const canonical = classifyTrendDelta(trend, { lowerIsBetter: true, threshold: SCORE_TREND_THRESHOLD });
  if (canonical === 'stable') {
    return { verdict: 'steady', label: 'Steady', cls: 'text-text-tertiary', arrow: '→', magnitude: null };
  }
  const magnitude = Math.abs(trend).toFixed(1);
  return canonical === 'improving'
    ? { verdict: 'improving', label: 'Improving', cls: 'text-fw-success', arrow: '↘', magnitude }
    : { verdict: 'declining', label: 'Declining', cls: 'text-fw-warning', arrow: '↗', magnitude };
}

/**
 * Team average of a metric across players that carry it; null when no samples.
 *
 * Weighted by each player's `rounds_played` by default (Σ value × rounds ÷
 * Σ rounds) — the canonical team-average rule. `TeamPlayerStats` carries only
 * already-derived rates (no fairways_hit/fairways_total numerators), so
 * rounds-weighting is the closest available proxy for Σ made ÷ Σ opportunities
 * on FW%/GIR%, and is exact for per-round stats (scoring average, putts).
 * Pass `weigh` to override — e.g. handicap is a player attribute, not a
 * round-derived rate, so it stays an equal-weight mean. Falls back to the
 * unweighted mean when no carrier has positive weight. Exported for unit tests.
 */
export function teamAvg(
  players: TeamPlayerStats[],
  pick: (p: TeamPlayerStats) => number | null,
  weigh: (p: TeamPlayerStats) => number = (p) => p.rounds_played,
): number | null {
  let weightedSum = 0;
  let totalWeight = 0;
  let sum = 0;
  let n = 0;
  for (const p of players) {
    const v = pick(p);
    if (v !== null && !Number.isNaN(v)) {
      sum += v;
      n += 1;
      const w = weigh(p);
      if (w > 0 && !Number.isNaN(w)) {
        weightedSum += v * w;
        totalWeight += w;
      }
    }
  }
  if (totalWeight > 0) return weightedSum / totalWeight;
  return n > 0 ? sum / n : null;
}

// ============================================================================
// FORMAT TOGGLE (P131) — 9 / 18 / all, wired to the route's already-fetched
// per-format columns. `all` returns the player untouched; '18'/'9' swap the
// three columns that HAVE format variants (rounds, scoring avg, best). Every
// other metric (FW%/GIR%/putts/handicap/trend) has no per-format split and is
// left intact — never fabricated for a format. Exported for unit tests.
// ============================================================================

export type HoleFormat = 'all' | '18' | '9';

export function applyFormat(p: TeamPlayerStats, format: HoleFormat): TeamPlayerStats {
  if (format === 'all') return p;
  if (format === '18') {
    return {
      ...p,
      rounds_played: p.rounds_played_18,
      scoring_average: p.scoring_average_18,
      best_round: p.best_round_18,
    };
  }
  return {
    ...p,
    rounds_played: p.rounds_played_9,
    scoring_average: p.scoring_average_9,
    best_round: p.best_round_9,
  };
}

/** Team-wide round counts per format → drives the toggle option labels. */
export function formatCounts(players: TeamPlayerStats[]): {
  all: number;
  h18: number;
  h9: number;
} {
  let all = 0;
  let h18 = 0;
  let h9 = 0;
  for (const p of players) {
    all += p.rounds_played;
    h18 += p.rounds_played_18;
    h9 += p.rounds_played_9;
  }
  return { all, h18, h9 };
}

// ============================================================================
// ROSTER RANKING (P132) — sort the tile grid by any displayed metric, mirroring
// the legacy TeamStatsTable SortKey set. Exported for unit tests.
// ============================================================================

export type RankKey =
  | 'scoring_average'
  | 'putts_per_round'
  | 'fairway_pct'
  | 'gir_pct'
  | 'composite'
  | 'scoring_trend'
  | 'name';

/**
 * Lower-is-better metrics sort ascending (best first); higher-is-better sort
 * descending (best first). scoring_trend is recent-minus-prior, so MORE
 * negative = improving = "best", i.e. ascending. Composite is 0-100 higher
 * better. Name is an A→Z alpha sort.
 */
const RANK_DIRECTION: Record<Exclude<RankKey, 'name'>, 'asc' | 'desc'> = {
  scoring_average: 'asc',
  putts_per_round: 'asc',
  fairway_pct: 'desc',
  gir_pct: 'desc',
  composite: 'desc',
  scoring_trend: 'asc',
};

export function rankPlayers(
  players: TeamPlayerStats[],
  key: RankKey,
  compositeFor: (playerId: string) => number | null,
): TeamPlayerStats[] {
  const sorted = [...players];
  if (key === 'name') {
    sorted.sort((a, b) =>
      `${a.last_name} ${a.first_name}`
        .toLowerCase()
        .localeCompare(`${b.last_name} ${b.first_name}`.toLowerCase()),
    );
    return sorted;
  }
  const pick = (p: TeamPlayerStats): number | null => {
    switch (key) {
      case 'scoring_average':
        return p.scoring_average;
      case 'putts_per_round':
        return p.putts_per_round;
      case 'fairway_pct':
        return p.fairway_pct;
      case 'gir_pct':
        return p.gir_pct;
      case 'scoring_trend':
        return p.scoring_trend;
      case 'composite':
        return compositeFor(p.id);
    }
  };
  const dir = RANK_DIRECTION[key];
  sorted.sort((a, b) => {
    const av = pick(a);
    const bv = pick(b);
    // Nulls always sink to the bottom regardless of direction (a player with no
    // reading for the ranked metric is never "best").
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return dir === 'asc' ? av - bv : bv - av;
  });
  return sorted;
}

// ============================================================================
// PER-METRIC TEAM LEADERS (W6 polish) — the green-tick treatment the owner
// asked for. For each column that has a real "best on the team" meaning
// (lower-is-better scoring/putts/best-round, higher-is-better FW%/GIR%), find
// the player(s) carrying the single best value. Requires >= 2 comparable
// values — a lone carrier isn't "leading" anyone. Ties all win (a genuine tie
// really is the best value on the team; never arbitrarily crown one).
// Exported for unit tests.
// ============================================================================

export type TeamLeaderMetric =
  | 'scoring_average'
  | 'putts_per_round'
  | 'fairway_pct'
  | 'gir_pct'
  | 'best_round';

const LEADER_METRICS: ReadonlyArray<{
  key: TeamLeaderMetric;
  pick: (p: TeamPlayerStats) => number | null;
  dir: 'asc' | 'desc';
}> = [
  { key: 'scoring_average', pick: (p) => p.scoring_average, dir: 'asc' },
  { key: 'putts_per_round', pick: (p) => p.putts_per_round, dir: 'asc' },
  { key: 'fairway_pct', pick: (p) => p.fairway_pct, dir: 'desc' },
  { key: 'gir_pct', pick: (p) => p.gir_pct, dir: 'desc' },
  { key: 'best_round', pick: (p) => p.best_round, dir: 'asc' },
];

export function computeMetricLeaders(
  players: TeamPlayerStats[],
): Record<TeamLeaderMetric, ReadonlySet<string>> {
  const result = {} as Record<TeamLeaderMetric, Set<string>>;
  for (const { key, pick, dir } of LEADER_METRICS) {
    const values = players
      .map((p) => ({ id: p.id, v: pick(p) }))
      .filter((x): x is { id: string; v: number } => x.v !== null && !Number.isNaN(x.v));
    const leaders = new Set<string>();
    if (values.length >= 2) {
      const best = dir === 'asc'
        ? Math.min(...values.map((x) => x.v))
        : Math.max(...values.map((x) => x.v));
      for (const x of values) if (x.v === best) leaders.add(x.id);
    }
    result[key] = leaders;
  }
  return result;
}

// ============================================================================
// CSV EXPORT (P141) — players × the displayed metric set + a team-average row.
// Pure string builder so it can be unit-tested without a DOM. Values are the
// honest formatted figures (em-dash → empty cell so the CSV never asserts 0).
// ============================================================================

function csvCell(value: string): string {
  // Quote any cell that could break CSV parsing; escape embedded quotes.
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildTeamStatsCsv(
  players: TeamPlayerStats[],
  format: HoleFormat,
  compositeFor: (playerId: string) => number | null,
): string {
  const header = [
    'Player',
    'Class',
    'Rounds',
    'Scoring Avg',
    'Best',
    'Handicap',
    'FW%',
    'GIR%',
    'Putts',
    'Composite',
    'Trend',
  ];
  const blank = (s: string) => (s === '—' ? '' : s);
  const rows = players.map((raw) => {
    const p = applyFormat(raw, format);
    const composite = compositeFor(raw.id);
    const trend = classifyScoringTrend(raw.scoring_trend);
    return [
      `${raw.first_name} ${raw.last_name}`.trim(),
      raw.graduation_year ? `Class of ${raw.graduation_year}` : '',
      `${p.rounds_played}`,
      blank(fmtNumber(p.scoring_average, 1)),
      blank(fmtScore(p.best_round)),
      blank(fmtHandicap(raw.handicap)),
      blank(fmtPct(raw.fairway_pct)),
      blank(fmtPct(raw.gir_pct)),
      blank(fmtNumber(raw.putts_per_round, 1)),
      composite === null ? '' : `${Math.round(composite)}`,
      trend ? `${trend.label}${trend.magnitude ? ` ${trend.magnitude}` : ''}` : '',
    ];
  });

  // Team-average row mirrors the footer (rounds-weighted; handicap equal-weight).
  const formatted = players.map((p) => applyFormat(p, format));
  const avgScoring = teamAvg(formatted, (p) => p.scoring_average);
  const bests = formatted
    .map((p) => p.best_round)
    .filter((v): v is number => v !== null && !Number.isNaN(v));
  const bestOverall = bests.length > 0 ? Math.min(...bests) : null;
  const avgRow = [
    'Team average',
    '',
    `${formatted.reduce((acc, p) => acc + p.rounds_played, 0)}`,
    blank(fmtNumber(avgScoring, 1)),
    blank(fmtScore(bestOverall)),
    blank(fmtHandicap(teamAvg(players, (p) => p.handicap, () => 1))),
    blank(fmtPct(teamAvg(players, (p) => p.fairway_pct))),
    blank(fmtPct(teamAvg(players, (p) => p.gir_pct))),
    blank(fmtNumber(teamAvg(players, (p) => p.putts_per_round), 1)),
    '',
    '',
  ];

  return [header, ...rows, avgRow]
    .map((cols) => cols.map(csvCell).join(','))
    .join('\r\n');
}

// ============================================================================
// COMPONENT
// ============================================================================

export function FairwayTeamStats({
  teamName,
  players,
  intelligenceByPlayer,
  intelligenceError = false,
  intelligenceSampleSize = 0,
  leakMaps,
  leakError = false,
  standingByPlayer,
}: FairwayTeamStatsProps) {
  // ── Format toggle (P131) + roster ranking (P132) — client-side view state ──
  const [format, setFormat] = React.useState<HoleFormat>('all');
  const [rankKey, setRankKey] = React.useState<RankKey>('scoring_average');

  const counts = React.useMemo(() => formatCounts(players), [players]);

  // Composite lookup shared by the ranking comparator + CSV export.
  const compositeFor = React.useCallback(
    (playerId: string) => intelligenceByPlayer[playerId]?.composite ?? null,
    [intelligenceByPlayer],
  );

  // Apply the selected format, then rank. The tile grid + footer both consume
  // this single derived list so the toggle + sort stay in lockstep.
  const viewPlayers = React.useMemo(() => {
    const formatted = players.map((p) => applyFormat(p, format));
    return rankPlayers(formatted, rankKey, compositeFor);
  }, [players, format, rankKey, compositeFor]);

  // ── W6 polish: per-metric team leaders (green tick) ─────────────────────────
  // Computed off the CURRENTLY DISPLAYED (format-applied) figures so a green
  // tick always matches the number the coach is looking at, not a stale
  // all-format leader while a 9/18 filter is active.
  const metricLeaders = React.useMemo(() => computeMetricLeaders(viewPlayers), [viewPlayers]);

  // "Top Performer" (green leader treatment on the composite badge) — only
  // when the composite isn't provisional (needs 3+ teammates behind the
  // z-score, the SAME floor each tile already applies) and at least 2 players
  // have a real composite to compare (a solo carrier isn't "leading" anyone).
  const topComposite = React.useMemo(() => {
    if (intelligenceSampleSize < 3) return null;
    const composites = players
      .map((p) => intelligenceByPlayer[p.id]?.composite ?? null)
      .filter((v): v is number => v !== null);
    return composites.length >= 2 ? Math.max(...composites) : null;
  }, [players, intelligenceByPlayer, intelligenceSampleSize]);

  // ── CSV export (P141) — build from the current view + trigger a download. ──
  const handleExport = React.useCallback(() => {
    try {
      const csv = buildTeamStatsCsv(players, format, compositeFor);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const slug = teamName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'team';
      a.href = url;
      a.download = `${slug}-team-stats.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      fairwayToast.success('Team stats exported', { description: `${players.length} player${players.length !== 1 ? 's' : ''} · ${a.download}` });
    } catch {
      fairwayToast.danger('Export failed', { description: 'Could not generate the CSV. Please try again.' });
    }
  }, [players, format, compositeFor, teamName]);

  // ── SG hero data (rounds-weighted team mean per category) ──────────────────
  // Standing rows carry no round count, so the weight lookup comes from the
  // same roster payload the rest of the page renders.
  const roundsByPlayer = React.useMemo(
    () => new Map(players.map((p) => [p.id, p.rounds_played])),
    [players],
  );

  // ── Team gender → benchmark label ───────────────────────────────────────────
  // The benchmark data is gender-routed: a women's team anchors to LPGA (the
  // standing loader sets `is_womens` on every row of a women's-team player, and
  // getTeamLeakMaps loads tour='lpga' refs). Derive the team gender from those
  // SAME standing rows (rather than threading a separate prop) so the SG hero +
  // leak-map subtitles read "LPGA Tour" when — and only when — the numbers
  // underneath them came from the LPGA anchor. Any one women's row is decisive;
  // SG-only metrics still carry the flag, so this is robust even when a roster
  // has no non-SG standing rows.
  const isWomens = React.useMemo(() => {
    for (const map of standingByPlayer.values()) {
      for (const row of map.values()) {
        if (row.is_womens) return true;
      }
    }
    return false;
  }, [standingByPlayer]);

  const sgData: SGCategory[] = React.useMemo(() => {
    return SG_CATEGORY_BARS.map(({ metric, label }) => ({
      metric,
      label,
      value: teamMeanFor(metric, standingByPlayer, roundsByPlayer),
    }))
      .filter((d): d is { metric: MetricId; label: string; value: number } => d.value !== null)
      .map(({ label, value }) => ({ label, value }));
  }, [standingByPlayer, roundsByPlayer]);

  const sgTotalMean = React.useMemo(
    () => teamMeanFor('sg_total', standingByPlayer, roundsByPlayer),
    [standingByPlayer, roundsByPlayer],
  );

  const hasSg = sgData.length > 0;

  // Worst SG bar → hero takeaway naming the team's biggest leak.
  const sgTakeaway = React.useMemo(() => {
    if (!hasSg) return undefined;
    let worst = sgData[0]!;
    for (const d of sgData) if (d.value < worst.value) worst = d;
    if (worst.value >= 0) return undefined;
    return `${worst.label} is the team's biggest leak, ${fmtSg(worst.value)} strokes vs Tour.`;
  }, [sgData, hasSg]);

  // ── Leak-map data ───────────────────────────────────────────────────────────
  const puttBuckets = toLeakMapBuckets(leakMaps?.putting);
  const approachBuckets = toLeakMapBuckets(leakMaps?.approach);
  const puttTakeaway = leakMaps
    ? worstLeakTakeaway(leakMaps.putting, 'higher_better', 'percent')
    : undefined;
  const approachTakeaway = leakMaps
    ? worstLeakTakeaway(leakMaps.approach, 'lower_better', 'feet')
    : undefined;
  // P138 cold-start: leak maps need shot-level rounds, so a fresh/small team
  // hits the empty path as the COMMON case. Surface the real sample base
  // (rounds rolled in) and a specific message + next-step CTA rather than the
  // generic "not enough data" copy.
  const leakRoundsIncluded = leakMaps?.roundsIncluded ?? 0;
  const hasPuttSamples = puttBuckets.some((b) => b.sampleN > 0);
  const hasApproachSamples = approachBuckets.some((b) => b.sampleN > 0);
  const leakColdStartMessage =
    'Leak maps appear once players log rounds with shot-level tracking (putts and approach distances). Have players enter rounds shot by shot to populate this.';

  // ── Team-trajectory tally (per-player scoring_trend → improving/steady/declining) ──
  // Counts derived ONLY from the existing classifyScoringTrend helper. Players
  // with a null/NaN trend fall into `unknown` and never inflate a verdict bucket.
  const trajectory = React.useMemo(() => {
    let improving = 0;
    let steady = 0;
    let declining = 0;
    let unknown = 0;
    for (const p of players) {
      const t = classifyScoringTrend(p.scoring_trend);
      if (!t) {
        unknown += 1;
        continue;
      }
      if (t.verdict === 'improving') improving += 1;
      else if (t.verdict === 'declining') declining += 1;
      else steady += 1;
    }
    const analyzed = improving + steady + declining;
    return { improving, steady, declining, unknown, analyzed };
  }, [players]);

  const hasTrajectory = trajectory.analyzed > 0;

  return (
    <div className="mx-auto w-full max-w-[1536px] px-4 py-6 md:px-6 md:py-8 pb-24">
      {/* ── MASTHEAD ──────────────────────────────────────────────────────────── */}
      {/* P140: the ONE prominent action is now stats-native (export the sheet),
          with "Open team intelligence" demoted to a quieter secondary link so
          the squint-test primary serves the page's own job-to-be-done. */}
      <ViewHeader
        eyebrow="Team Stats"
        title="Team Stats"
        description={`${teamName} · ${players.length} player${players.length !== 1 ? 's' : ''}`}
        secondaryActions={
          <Button asChild variant="ghost" size="md">
            <Link href="/golf/dashboard/intelligence">Open team intelligence</Link>
          </Button>
        }
        primaryAction={
          <Button
            variant="primary"
            size="md"
            onClick={handleExport}
            disabled={players.length === 0}
            leftIcon={<Download className="h-4 w-4" aria-hidden />}
          >
            Export stats
          </Button>
        }
      />

      {/* ── HONESTY NOTICES: a FAILED load reads as "couldn't load", never as a
          cheerful empty (the empty charts/composites below assume success). ─── */}
      {intelligenceError || leakError ? (
        <InlineNotice
          tone="warning"
          title="Some stats couldn't load"
          className="mt-6"
        >
          {intelligenceError && leakError
            ? "Team intelligence and leak maps failed to load. The figures below may be incomplete — reload to try again."
            : intelligenceError
              ? "Team intelligence (composite ratings) failed to load. Reload to try again."
              : "Strokes-gained leak maps failed to load. Reload to try again."}
        </InlineNotice>
      ) : null}

      {/* ── HERO: Team Strokes Gained ─────────────────────────────────────────── */}
      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <StrokesGainedTornado
          overline="Strokes Gained"
          title="Team Strokes Gained"
          subtitle={`vs ${tourLabel(isWomens)} baseline · season to date`}
          takeaway={sgTakeaway}
          data={sgData}
          state={hasSg ? undefined : 'insufficient-data'}
          stateMessage={
            hasSg
              ? undefined
              : 'Strokes Gained appears once players log rounds with shot-level tracking. Add players to your roster and have them enter rounds shot by shot.'
          }
          actions={
            hasSg ? undefined : <ColdStartActions />
          }
        />
        <InstrumentPanel
          depth="raised"
          tone="accent"
          eyebrow="Season to date"
          header="SG: Total"
          className="flex flex-col justify-center"
        >
          {sgTotalMean !== null ? (
            <Readout
              size="hero"
              label="Team SG · per round"
              display={fmtSg(sgTotalMean)}
              unit="sg"
            />
          ) : (
            <Readout
              size="hero"
              label="Team SG · per round"
              state="awaiting"
              awaitingLabel="Awaiting standing"
            />
          )}
          <p className="mt-4 font-fw-sans text-caption text-text-tertiary">
            The sum of every category vs the {tourLabel(isWomens)} baseline. Negative
            means the team is losing strokes to Tour over a round.
          </p>
        </InstrumentPanel>
      </section>

      {/* ── TEAM TRAJECTORY: improving / steady / declining headcount ──────────── */}
      {hasTrajectory ? (
        <InstrumentPanel
          depth="base"
          padding="md"
          className="mt-8"
          as="section"
        >
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <span className="font-fw-display text-eyebrow uppercase tracking-[0.1em] text-text-secondary">
              Team trajectory
            </span>
            <span className="font-fw-sans text-caption text-text-tertiary">
              {trajectory.analyzed} player{trajectory.analyzed !== 1 ? 's' : ''} analyzed
            </span>
          </div>
          <div className="grid grid-cols-3 gap-x-3 gap-y-3">
            <TrajectoryCell
              count={trajectory.improving}
              label="Improving"
              arrow="↘"
              cls="text-fw-success"
            />
            <TrajectoryCell
              count={trajectory.steady}
              label="Steady"
              arrow="→"
              cls="text-text-tertiary"
            />
            <TrajectoryCell
              count={trajectory.declining}
              label="Declining"
              arrow="↗"
              cls="text-fw-warning"
            />
          </div>
          {trajectory.unknown > 0 ? (
            <p className="mt-3 font-fw-sans text-caption text-text-tertiary">
              {trajectory.unknown} player{trajectory.unknown !== 1 ? 's' : ''} awaiting trend data.
            </p>
          ) : null}
        </InstrumentPanel>
      ) : null}

      {/* ── LEAK MAPS: what to work on ─────────────────────────────────────────── */}
      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-fw-display text-h3 font-medium tracking-[-0.005em] text-text-primary">
            Where the strokes leak
          </h2>
          {leakMaps && leakRoundsIncluded > 0 ? (
            <span className="font-fw-sans text-caption text-text-secondary">
              {leakRoundsIncluded} round{leakRoundsIncluded !== 1 ? 's' : ''} with shot tracking
            </span>
          ) : null}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <LeakMap
            overline="Putting"
            title="Putts Made by Distance"
            subtitle={`Team make% vs ${tourLabel(isWomens)}`}
            takeaway={puttTakeaway}
            data={puttBuckets}
            direction="higher_better"
            unit="percent"
            state={leakMaps && hasPuttSamples ? undefined : 'insufficient-data'}
            stateMessage={leakMaps && hasPuttSamples ? undefined : leakColdStartMessage}
            actions={leakMaps && hasPuttSamples ? undefined : <ColdStartActions />}
          />
          <LeakMap
            overline="Approach"
            title="Approach Proximity by Distance"
            subtitle={`Avg proximity to hole vs ${tourLabel(isWomens)}`}
            takeaway={approachTakeaway}
            data={approachBuckets}
            direction="lower_better"
            unit="feet"
            state={leakMaps && hasApproachSamples ? undefined : 'insufficient-data'}
            stateMessage={leakMaps && hasApproachSamples ? undefined : leakColdStartMessage}
            actions={leakMaps && hasApproachSamples ? undefined : <ColdStartActions />}
          />
        </div>
      </section>

      {/* ── PER-PLAYER TILES: pulse + standing ─────────────────────────────────── */}
      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <h2 className="font-fw-display text-h3 font-medium tracking-[-0.005em] text-text-primary">
            Players
          </h2>
          {players.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              {/* P131: format toggle wired to the route's _9 / _18 columns. */}
              <div className="flex items-center gap-2">
                <span
                  id="fw-team-format-label"
                  className="font-fw-display text-eyebrow uppercase tracking-[0.1em] text-text-secondary"
                >
                  Format
                </span>
                <Segmented<HoleFormat>
                  size="sm"
                  aria-label="Round format"
                  value={format}
                  onValueChange={setFormat}
                  options={[
                    { value: 'all', label: `All${counts.all > 0 ? ` (${counts.all})` : ''}` },
                    { value: '18', label: `18${counts.h18 > 0 ? ` (${counts.h18})` : ''}` },
                    { value: '9', label: `9${counts.h9 > 0 ? ` (${counts.h9})` : ''}` },
                  ]}
                />
              </div>
              {/* P132: roster ranking — reorder the tile grid by any metric. */}
              <div className="flex items-center gap-2">
                <span
                  id="fw-team-rank-label"
                  className="font-fw-display text-eyebrow uppercase tracking-[0.1em] text-text-secondary"
                >
                  Rank by
                </span>
                <Segmented<RankKey>
                  size="sm"
                  aria-label="Rank roster by"
                  value={rankKey}
                  onValueChange={setRankKey}
                  options={[
                    { value: 'scoring_average', label: 'Scoring' },
                    { value: 'putts_per_round', label: 'Putts' },
                    { value: 'fairway_pct', label: 'FW%' },
                    { value: 'gir_pct', label: 'GIR%' },
                    { value: 'composite', label: 'Composite' },
                    { value: 'scoring_trend', label: 'Trend' },
                    { value: 'name', label: 'Name' },
                  ]}
                />
              </div>
            </div>
          ) : null}
        </div>
        {players.length === 0 ? (
          <InstrumentPanel depth="base">
            <p className="font-fw-sans text-body-sm text-text-secondary">
              No players on your roster yet.
            </p>
          </InstrumentPanel>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {viewPlayers.map((player) => (
                <PlayerTile
                  key={player.id}
                  player={player}
                  intelligence={intelligenceByPlayer[player.id] ?? null}
                  standing={standingByPlayer.get(player.id)}
                  sampleSize={intelligenceSampleSize}
                  leaders={metricLeaders}
                  topComposite={topComposite}
                />
              ))}
            </div>
            <TeamAverageFooter players={viewPlayers} />
          </>
        )}
      </section>
    </div>
  );
}

// ============================================================================
// COLD-START ACTIONS (P138) — next-step CTAs for empty SG / leak-map charts.
// A coach's actionable next step is the roster (add players); the player-side
// round entry is reachable from each player's hub, so we point at the roster
// as the single highest-leverage step and keep intelligence as a quiet link.
// ============================================================================

function ColdStartActions() {
  return (
    <div className="flex items-center gap-1.5">
      <Button asChild variant="secondary" size="sm">
        <Link href="/golf/dashboard/roster">Add players</Link>
      </Button>
    </div>
  );
}

// ============================================================================
// PER-PLAYER TILE
// ============================================================================

/** One labeled micro-stat (value + uppercase caption). Em-dash when null. */
function MetricCell({ label, value }: { label: string; value: string }) {
  // A missing reading renders as an em-dash — tone it to text-tertiary so it
  // never reads with the same authority as a real value (matches TrendCell's
  // dash treatment and the honest-dash intent of the formatters).
  const isMissing = value === '—';
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={`font-fw-mono text-body-sm tabular-nums ${
          isMissing ? 'text-text-tertiary' : 'text-text-primary'
        }`}
      >
        {value}
      </span>
      <span className="font-fw-display text-eyebrow uppercase tracking-[0.1em] text-text-secondary">
        {label}
      </span>
    </div>
  );
}

/**
 * Team-trajectory cell — a headcount toned to its verdict, mirroring MetricCell's
 * value-over-caption layout. Arrow + color match the per-player TrendCell exactly
 * (improving ↘ / fw-success, steady → / tertiary, declining ↗ / fw-warning).
 */
function TrajectoryCell({
  count,
  label,
  arrow,
  cls,
}: {
  count: number;
  label: string;
  arrow: string;
  cls: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`inline-flex items-center gap-1 font-fw-mono text-body-lg tabular-nums ${cls}`}>
        <span aria-hidden>{arrow}</span>
        {count}
      </span>
      <span className="font-fw-display text-eyebrow uppercase tracking-[0.1em] text-text-secondary">
        {label}
      </span>
    </div>
  );
}

/** Scoring-trend chip — arrow + verdict, colored by improving/declining/steady. */
function TrendCell({ trend }: { trend: number | null }) {
  const t = classifyScoringTrend(trend);
  return (
    <div className="flex flex-col gap-0.5">
      {t ? (
        <span className={`inline-flex items-center gap-1 font-fw-sans text-body-sm font-medium ${t.cls}`}>
          <span aria-hidden>{t.arrow}</span>
          {t.label}
          {t.magnitude ? (
            <span className="font-fw-mono tabular-nums">{t.magnitude}</span>
          ) : null}
        </span>
      ) : (
        <span className="font-fw-mono text-body-sm tabular-nums text-text-tertiary">—</span>
      )}
      <span className="font-fw-display text-eyebrow uppercase tracking-[0.1em] text-text-secondary">
        Trend
      </span>
    </div>
  );
}

function PlayerTile({
  player,
  intelligence,
  standing,
  sampleSize,
  leaders,
  topComposite,
}: {
  player: TeamPlayerStats;
  intelligence: FairwayTeamStatsPlayerIntelligence | null;
  standing: Map<MetricId, PlayerStanding> | undefined;
  /** Normalization population behind the composite; < 3 ⇒ statistically unstable. */
  sampleSize: number;
  /** W6 polish: per-metric team-leader ids (green tick treatment). */
  leaders: Record<TeamLeaderMetric, ReadonlySet<string>>;
  /** W6 polish: the team's single highest composite, or null when no "Top Performer" can be crowned. */
  topComposite: number | null;
}) {
  const fullName = `${player.first_name} ${player.last_name}`.trim() || 'Player';
  const headlineMetric = pickHeadlineMetric(standing);
  const headlineRow = headlineMetric ? standing?.get(headlineMetric) ?? null : null;
  const renderCfg = headlineMetric ? getMetricRenderConfig(headlineMetric) : null;
  // P139 — composite honesty: a z-score over < 3 teammates is too unstable to
  // present with full authority. Tone the figure down + flag it "provisional"
  // (only when there IS a composite to qualify — a missing one is just a dash).
  const composite = intelligence?.composite ?? null;
  const compositeProvisional = composite !== null && sampleSize < 3;
  // W6 polish: the team's single highest (non-provisional) composite gets the
  // green "Top Performer" leader treatment instead of the plain "Composite" label.
  const isTopPerformer =
    !compositeProvisional && composite !== null && topComposite !== null && composite === topComposite;

  return (
    <InstrumentPanel depth="raised" padding="md" as="article">
      {/* Header: name + grad year + composite */}
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-fw-display text-body-lg font-medium text-text-primary">
            <Link
              href={`/golf/dashboard/stats?player=${player.id}`}
              className="transition-colors hover:text-accent-700"
            >
              {fullName}
            </Link>
          </h3>
          {player.graduation_year ? (
            <p className="font-fw-sans text-caption text-text-tertiary">
              Class of {player.graduation_year}
            </p>
          ) : null}
        </div>
        <div
          className="shrink-0 text-right"
          title={
            compositeProvisional
              ? `Provisional — normalized over only ${sampleSize} player${sampleSize !== 1 ? 's' : ''} (needs 3+ for a stable rating).`
              : isTopPerformer
                ? 'Highest composite on the team.'
                : undefined
          }
        >
          {isTopPerformer ? (
            // W6 polish: the team's single highest composite gets the green
            // ruled leader treatment instead of the plain "Composite" label.
            // `items-end` matches the outer `text-right` corner alignment —
            // the atom's flex-column rows don't inherit text-align.
            <RuledLeaderStat
              label="Top Performer"
              value={fmtComposite(composite)}
              size="lg"
              leader
              className="items-end"
            />
          ) : (
            <>
              <p
                className={`font-fw-mono text-body-lg tabular-nums ${
                  compositeProvisional ? 'text-text-tertiary' : 'text-text-primary'
                }`}
              >
                {fmtComposite(composite)}
              </p>
              <p className="font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-secondary">
                {compositeProvisional ? 'Composite · provisional' : 'Composite'}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Per-player detail grid — the full legacy column set, honest dashes when
          a metric has no samples (never a fabricated 0 / 0%). P137: 2-up on the
          narrowest phones, 4-up from ~380px so the 11px labels never crowd.
          W6 polish: the 5 competitive columns (Avg/Best/FW%/GIR%/Putts) carry
          the green-ruled leader treatment when this player leads the team on
          that column; Rounds/HCP/Trend are unchanged (no team "best" to lead). */}
      <div className="mb-4 grid grid-cols-2 [@media(min-width:380px)]:grid-cols-4 gap-x-3 gap-y-3 rounded-card bg-surface-sunken p-3">
        <MetricCell label="Rounds" value={`${player.rounds_played}`} />
        <RuledLeaderStat
          label="Avg"
          value={fmtNumber(player.scoring_average, 1)}
          size="compact"
          leader={leaders.scoring_average.has(player.id)}
        />
        <RuledLeaderStat
          label="Best"
          value={fmtScore(player.best_round)}
          size="compact"
          leader={leaders.best_round.has(player.id)}
        />
        <MetricCell label="HCP" value={fmtHandicap(player.handicap)} />
        <RuledLeaderStat
          label="FW%"
          value={fmtPct(player.fairway_pct)}
          size="compact"
          leader={leaders.fairway_pct.has(player.id)}
        />
        <RuledLeaderStat
          label="GIR%"
          value={fmtPct(player.gir_pct)}
          size="compact"
          leader={leaders.gir_pct.has(player.id)}
        />
        <RuledLeaderStat
          label="Putts"
          value={fmtNumber(player.putts_per_round, 1)}
          size="compact"
          leader={leaders.putts_per_round.has(player.id)}
        />
        <TrendCell trend={player.scoring_trend} />
      </div>

      {/* Headline standing strip */}
      {headlineRow && renderCfg && headlineMetric ? (
        <StandingStrip
          metric_id={headlineMetric}
          metric_label={renderCfg.display_label}
          player_value={headlineRow.player_value}
          team_avg={headlineRow.team_avg}
          team_n={headlineRow.team_n}
          team_pct={headlineRow.team_pct}
          pga_value={headlineRow.pga_value}
          is_womens={headlineRow.is_womens}
          direction={renderCfg.direction}
          unit={renderCfg.unit}
          scale={renderCfg.default_scale}
          size="card"
        />
      ) : (
        <StandingStrip
          metric_id="sg_total"
          metric_label="Strokes Gained"
          player_value={0}
          team_avg={null}
          pga_value={0}
          direction="higher_better"
          unit="strokes"
          scale={{ min: -2, max: 2 }}
          size="card"
          state="empty"
        />
      )}

      {/* Top insight footnote → that player's stats */}
      {intelligence?.topInsightTitle ? (
        <Link
          href={`/golf/dashboard/stats?player=${player.id}`}
          className="mt-3 block truncate font-fw-sans text-caption text-text-tertiary transition-colors hover:text-text-secondary"
          title={intelligence.topInsightTitle}
        >
          {intelligence.topInsightTitle}
        </Link>
      ) : null}

      {/* Always-present drill-in links → that player's full stats page, plus
          (golf-ia-plan.json step 10, additive) the canonical per-player
          Game Fingerprint hub. P136: accent text link sits at accent-700
          (5.69:1 on surface) at REST — not the failing accent-600 — and
          carries an underline so color is not the only contrast cue. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link
          href={`/golf/dashboard/stats?player=${player.id}`}
          className="inline-flex items-center gap-1 font-fw-sans text-caption font-medium text-accent-700 underline underline-offset-2 transition-colors hover:text-accent-800"
        >
          View full stats
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
        <Link
          href={`/golf/dashboard/players/${player.id}/game`}
          className="inline-flex items-center gap-1 font-fw-sans text-caption font-medium text-accent-700 underline underline-offset-2 transition-colors hover:text-accent-800"
        >
          {surfaceName('player-game')}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </InstrumentPanel>
  );
}

// ============================================================================
// TEAM-AVERAGE FOOTER — mirrors the legacy table's summary row, enriched to the
// full metric set. Every figure is an honest rounds-weighted mean over players
// that carry the metric (em-dash when none do — never a fabricated 0).
// ============================================================================

function TeamAverageFooter({ players }: { players: TeamPlayerStats[] }) {
  const avgScoring = teamAvg(players, (p) => p.scoring_average);
  const bestOverall = (() => {
    const bests = players
      .map((p) => p.best_round)
      .filter((v): v is number => v !== null && !Number.isNaN(v));
    return bests.length > 0 ? Math.min(...bests) : null;
  })();
  // Handicap is a per-player attribute (not derived from the rounds in this
  // window), so every player weighs equally.
  const avgHandicap = teamAvg(players, (p) => p.handicap, () => 1);
  const avgFw = teamAvg(players, (p) => p.fairway_pct);
  const avgGir = teamAvg(players, (p) => p.gir_pct);
  const avgPutts = teamAvg(players, (p) => p.putts_per_round);

  return (
    <InstrumentPanel depth="base" padding="md" className="mt-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="font-fw-display text-eyebrow uppercase tracking-[0.1em] text-text-secondary">
          Team average
        </span>
        <span className="font-fw-sans text-caption text-text-tertiary">
          {players.length} player{players.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-3 sm:grid-cols-6">
        <MetricCell label="Avg" value={fmtNumber(avgScoring, 1)} />
        <MetricCell label="Best" value={fmtScore(bestOverall)} />
        <MetricCell label="HCP" value={fmtHandicap(avgHandicap)} />
        <MetricCell label="FW%" value={fmtPct(avgFw)} />
        <MetricCell label="GIR%" value={fmtPct(avgGir)} />
        <MetricCell label="Putts" value={fmtNumber(avgPutts, 1)} />
      </div>
    </InstrumentPanel>
  );
}
