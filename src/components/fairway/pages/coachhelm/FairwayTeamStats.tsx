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
import { ArrowRight } from 'lucide-react';

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
} from '@/components/fairway';

import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';

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
  /** Team-level leak maps (from `getTeamLeakMaps`); null when the load failed. */
  leakMaps: TeamLeakMaps | null;
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
  return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

// ── Scoring-trend classification (matches legacy TeamStatsTable) ──────────────
// scoring_trend is recent-avg minus prior-avg of normalized scores, so a
// NEGATIVE value = lower scores = improving. |trend| < 0.3 reads as steady.
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
  if (Math.abs(trend) < 0.3) {
    return { verdict: 'steady', label: 'Steady', cls: 'text-text-tertiary', arrow: '→', magnitude: null };
  }
  const magnitude = Math.abs(trend).toFixed(1);
  return trend < 0
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
// COMPONENT
// ============================================================================

export function FairwayTeamStats({
  teamName,
  players,
  intelligenceByPlayer,
  leakMaps,
  standingByPlayer,
}: FairwayTeamStatsProps) {
  // ── SG hero data (rounds-weighted team mean per category) ──────────────────
  // Standing rows carry no round count, so the weight lookup comes from the
  // same roster payload the rest of the page renders.
  const roundsByPlayer = React.useMemo(
    () => new Map(players.map((p) => [p.id, p.rounds_played])),
    [players],
  );

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
      <ViewHeader
        eyebrow="Team Stats"
        title="Team Stats"
        description={`${teamName} · ${players.length} player${players.length !== 1 ? 's' : ''}`}
        primaryAction={
          <Button asChild variant="primary" size="md">
            <Link href="/golf/dashboard/intelligence">Open team intelligence</Link>
          </Button>
        }
      />

      {/* ── HERO: Team Strokes Gained ─────────────────────────────────────────── */}
      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <StrokesGainedTornado
          overline="Strokes Gained"
          title="Team Strokes Gained"
          subtitle="vs PGA Tour baseline · season to date"
          takeaway={sgTakeaway}
          data={sgData}
          state={hasSg ? undefined : 'insufficient-data'}
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
            The sum of every category vs the PGA Tour baseline. Negative means
            the team is losing strokes to Tour over a round.
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
            <span className="font-fw-display text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
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
        <h2 className="mb-4 font-fw-display text-h3 font-medium tracking-[-0.005em] text-text-primary">
          Where the strokes leak
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <LeakMap
            overline="Putting"
            title="Putts Made by Distance"
            subtitle="Team make% vs PGA Tour"
            takeaway={puttTakeaway}
            data={puttBuckets}
            direction="higher_better"
            unit="percent"
            state={leakMaps ? undefined : 'insufficient-data'}
          />
          <LeakMap
            overline="Approach"
            title="Approach Proximity by Distance"
            subtitle="Avg proximity to hole vs PGA Tour"
            takeaway={approachTakeaway}
            data={approachBuckets}
            direction="lower_better"
            unit="feet"
            state={leakMaps ? undefined : 'insufficient-data'}
          />
        </div>
      </section>

      {/* ── PER-PLAYER TILES: pulse + standing ─────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="mb-4 font-fw-display text-h3 font-medium tracking-[-0.005em] text-text-primary">
          Players
        </h2>
        {players.length === 0 ? (
          <InstrumentPanel depth="base">
            <p className="font-fw-sans text-body-sm text-text-tertiary">
              No players on your roster yet.
            </p>
          </InstrumentPanel>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {players.map((player) => (
                <PlayerTile
                  key={player.id}
                  player={player}
                  intelligence={intelligenceByPlayer[player.id] ?? null}
                  standing={standingByPlayer.get(player.id)}
                />
              ))}
            </div>
            <TeamAverageFooter players={players} />
          </>
        )}
      </section>
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
      <span className="font-fw-display text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
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
      <span className="font-fw-display text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
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
      <span className="font-fw-display text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
        Trend
      </span>
    </div>
  );
}

function PlayerTile({
  player,
  intelligence,
  standing,
}: {
  player: TeamPlayerStats;
  intelligence: FairwayTeamStatsPlayerIntelligence | null;
  standing: Map<MetricId, PlayerStanding> | undefined;
}) {
  const fullName = `${player.first_name} ${player.last_name}`.trim() || 'Player';
  const headlineMetric = pickHeadlineMetric(standing);
  const headlineRow = headlineMetric ? standing?.get(headlineMetric) ?? null : null;
  const renderCfg = headlineMetric ? getMetricRenderConfig(headlineMetric) : null;

  return (
    <InstrumentPanel depth="raised" padding="md" as="article">
      {/* Header: name + grad year + composite */}
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-fw-display text-body-lg font-medium text-text-primary">
            <Link
              href={`/golf/dashboard/stats?player=${player.id}`}
              className="transition-colors hover:text-accent-600"
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
        <div className="shrink-0 text-right">
          <p className="font-fw-mono text-body-lg tabular-nums text-text-primary">
            {fmtComposite(intelligence?.composite ?? null)}
          </p>
          <p className="font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">
            Composite
          </p>
        </div>
      </div>

      {/* Per-player detail grid — the full legacy column set, honest dashes when
          a metric has no samples (never a fabricated 0 / 0%). */}
      <div className="mb-4 grid grid-cols-4 gap-x-3 gap-y-3 rounded-card bg-surface-sunken p-3">
        <MetricCell label="Rounds" value={`${player.rounds_played}`} />
        <MetricCell label="Avg" value={fmtNumber(player.scoring_average, 1)} />
        <MetricCell label="Best" value={fmtScore(player.best_round)} />
        <MetricCell label="HCP" value={fmtHandicap(player.handicap)} />
        <MetricCell label="FW%" value={fmtPct(player.fairway_pct)} />
        <MetricCell label="GIR%" value={fmtPct(player.gir_pct)} />
        <MetricCell label="Putts" value={fmtNumber(player.putts_per_round, 1)} />
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

      {/* Always-present drill-in → that player's full stats page. */}
      <Link
        href={`/golf/dashboard/stats?player=${player.id}`}
        className="mt-3 inline-flex items-center gap-1 font-fw-sans text-caption font-medium text-accent-600 transition-colors hover:text-accent-700"
      >
        View full stats
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
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
        <span className="font-fw-display text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
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
