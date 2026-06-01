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
 *   HERO      → Team Strokes Gained tornado (team-mean of per-player standing
 *               sg_* rows, plotted around x=0 = PGA), with an SG-total Readout.
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
 * Mean of `player_value` for a metric across every player that carries the row.
 * Returns null when no player has the metric (→ honest-empty, never a fake 0).
 */
function teamMeanFor(
  metric: MetricId,
  standingByPlayer: Map<string, Map<MetricId, PlayerStanding>>,
): number | null {
  let sum = 0;
  let n = 0;
  for (const map of standingByPlayer.values()) {
    const row = map.get(metric);
    if (row && typeof row.player_value === 'number' && !Number.isNaN(row.player_value)) {
      sum += row.player_value;
      n += 1;
    }
  }
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
  // ── SG hero data (team-mean per category) ──────────────────────────────────
  const sgData: SGCategory[] = React.useMemo(() => {
    return SG_CATEGORY_BARS.map(({ metric, label }) => ({
      metric,
      label,
      value: teamMeanFor(metric, standingByPlayer),
    }))
      .filter((d): d is { metric: MetricId; label: string; value: number } => d.value !== null)
      .map(({ label, value }) => ({ label, value }));
  }, [standingByPlayer]);

  const sgTotalMean = React.useMemo(
    () => teamMeanFor('sg_total', standingByPlayer),
    [standingByPlayer],
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
        )}
      </section>
    </div>
  );
}

// ============================================================================
// PER-PLAYER TILE
// ============================================================================

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
            {fullName}
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

      {/* Scoring avg / rounds */}
      <div className="mb-4 flex items-baseline gap-4 font-fw-mono text-caption tabular-nums text-text-secondary">
        <span>
          {fmtNumber(player.scoring_average, 1)}
          <span className="ml-1 font-fw-sans text-text-tertiary">avg</span>
        </span>
        <span>
          {player.rounds_played}
          <span className="ml-1 font-fw-sans text-text-tertiary">
            round{player.rounds_played !== 1 ? 's' : ''}
          </span>
        </span>
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
    </InstrumentPanel>
  );
}
