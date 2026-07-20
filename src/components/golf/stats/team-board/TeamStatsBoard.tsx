'use client';

/**
 * ============================================================================
 * TeamStatsBoard — the roster-as-one-instrument Team Stats surface
 * (spec §5.2 / §3.3 Matrix Board; mockup `.board`)
 * ----------------------------------------------------------------------------
 * Replaces the per-player InstrumentPanel tile grid with ONE `MatrixBoard`:
 * a sticky KPI band, then a ranked row per player — five `RankCell`s
 * (green-ramp, darker = stronger), a composite `RingGauge`, a scoring-trend
 * `Sparkline`, and a `SignalChip`. A row click expands an inline detail band
 * in place (worst metric / SG putt / last round + triage links) — no
 * navigation for a coach's daily scan.
 *
 * Order (spec §5.2): masthead → roster board FIRST → team Strokes Gained +
 * leak maps BELOW (still real, still reused chart components, just demoted
 * from the page's opening hero). CSV export drops to an icon button in the
 * masthead. Cold-start renders the board with `quiet` chips immediately —
 * the tornado/leak-map charts never block it.
 *
 * Reuse: `MatrixBoard`/`RankCell`/`RingGauge`/`SignalChip` (module kit),
 * `Sparkline`/`StrokesGainedTornado`/`LeakMap`/`Readout`/`InstrumentPanel`/
 * `ViewHeader`/`InlineNotice`/`Button`/`IconButton` (Fairway primitives +
 * charts). All ranking/tone/formatting logic lives in
 * `buildTeamBoardViewModel` — this file only composes JSX.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';

import {
  ViewHeader,
  StrokesGainedTornado,
  type SGCategory,
  LeakMap,
  type LeakMapBucket,
  InstrumentPanel,
  Readout,
  Button,
  IconButton,
  InlineNotice,
  Sparkline,
  fairwayToast,
} from '@/components/fairway';
import { MatrixBoard, RankCell, RingGauge, SignalChip } from '@/components/fairway/modules';
import type { MatrixColumn, MatrixBoardRow as MatrixBoardRowData } from '@/components/fairway/modules';

import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { TeamPlayerStats } from '@/app/golf/(dashboard)/dashboard/stats/team/page';
import type { TeamLeakMaps, LeakBucket } from '@/app/golf/actions/stats-leak-maps-types';

import {
  buildTeamBoardViewModel,
  fmtSg,
  weightedMean,
  type TeamBoardPlayerInput,
  type TeamBoardRowViewModel,
} from './buildTeamBoardViewModel';

// ============================================================================
// PROPS — same shapes the route already resolves (page.tsx reuses its
// existing fetches verbatim; only two fields are appended to TeamPlayerStats
// — recent_scores / last_round_score — both derived from rounds the page
// already fetched, no new query).
// ============================================================================

export interface TeamStatsBoardPlayerIntelligence {
  composite: number | null;
  overall: number | null;
  topInsightTitle: string | null;
  topInsightPriority: string | null;
  insightCount: number;
}

export interface TeamStatsBoardProps {
  teamName: string;
  players: TeamPlayerStats[];
  intelligenceByPlayer: Record<string, TeamStatsBoardPlayerIntelligence>;
  intelligenceError?: boolean;
  intelligenceSampleSize?: number;
  leakMaps: TeamLeakMaps | null;
  leakError?: boolean;
  /**
   * True when the paginated `golf_rounds` fetch genuinely FAILED (rejected
   * page, PostgREST error) — distinct from a roster with no rounds yet.
   * Every per-player figure derived from `allRounds` (rounds played, scoring
   * average, trend, last round, sparkline) silently reads as cold-start zero
   * when this is unchecked, which previously masked a real backend failure.
   */
  roundsError?: boolean;
  standingByPlayer: Map<string, Map<MetricId, PlayerStanding>>;
  /** Rounds across the whole roster in the last 30 days (already-fetched `allRounds`, filtered by date). */
  teamRounds30d: number;
}

const SG_CATEGORY_BARS: ReadonlyArray<{ metric: MetricId; label: string }> = [
  { metric: 'sg_ott', label: 'Off the Tee' },
  { metric: 'sg_approach', label: 'Approach' },
  { metric: 'sg_around_green', label: 'Around the Green' },
  { metric: 'sg_putting', label: 'Putting' },
];

function tourLabel(isWomens: boolean): string {
  return isWomens ? 'LPGA Tour' : 'PGA Tour';
}

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
    if (oriented >= 0) continue;
    const mag = Math.abs(Math.round(raw));
    if (!worst || mag > worst.mag) worst = { label: b.label, mag };
  }
  if (!worst) return undefined;
  const suffix = unit === 'percent' ? 'pp below Tour' : ' ft farther than Tour';
  return `${worst.label} is ${worst.mag}${suffix}.`;
}

/**
 * Combine the three independent fetch-failure flags into one honest sentence
 * for the masthead `InlineNotice` — extends the original intelligence/leak
 * two-flag ternary to a third (`roundsError`) without the branch count
 * doubling per flag.
 */
function statsLoadErrorMessage(roundsError: boolean, intelligenceError: boolean, leakError: boolean): string {
  const failed: string[] = [];
  if (roundsError) failed.push('Round scoring and per-player stats');
  if (intelligenceError) failed.push('team intelligence (composite ratings)');
  if (leakError) failed.push('strokes-gained leak maps');
  if (failed.length === 0) return '';
  if (failed.length === 1) return `${failed[0]} failed to load. Reload to try again.`;
  const [head, ...rest] = failed;
  const tail = rest.length === 1 ? rest[0] : `${rest.slice(0, -1).join(', ')}, and ${rest[rest.length - 1]}`;
  return `${head} and ${tail} failed to load. The figures below may be incomplete — reload to try again.`;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function buildBoardCsv(rows: TeamBoardRowViewModel[]): string {
  const header = [
    'Player', 'Rounds', 'Scoring Avg', 'Tee Rank', 'App Rank', 'Short Rank', 'Putt Rank', 'Scoring Rank', 'Composite', 'Signal',
  ];
  const fmtRank = (r: { rank: number; of: number } | null) => (r ? `${r.rank}/${r.of}` : '');
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.name,
        String(r.roundsPlayed),
        r.scoringAverage,
        fmtRank(r.ranks.tee),
        fmtRank(r.ranks.app),
        fmtRank(r.ranks.short),
        fmtRank(r.ranks.putt),
        fmtRank(r.ranks.scoring),
        r.composite === null ? '' : String(Math.round(r.composite)),
        r.signal.label,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n');
}

const COLUMNS: MatrixColumn[] = [
  { key: 'who', label: 'Player' },
  { key: 'tee', label: 'Tee', align: 'center' },
  { key: 'app', label: 'App', align: 'center' },
  { key: 'short', label: 'Short', align: 'center' },
  { key: 'putt', label: 'Putt', align: 'center' },
  { key: 'scor', label: 'Scor', align: 'center' },
  { key: 'composite', label: 'Composite' },
  { key: 'trend', label: 'Trend' },
  { key: 'signal', label: 'Signal' },
];

export function TeamStatsBoard({
  teamName,
  players,
  intelligenceByPlayer,
  intelligenceError = false,
  intelligenceSampleSize = 0,
  leakMaps,
  leakError = false,
  roundsError = false,
  standingByPlayer,
  teamRounds30d,
}: TeamStatsBoardProps) {
  const boardInput = React.useMemo(() => {
    const boardPlayers: TeamBoardPlayerInput[] = players.map((p) => ({
      id: p.id,
      name: `${p.first_name} ${p.last_name}`.trim() || 'Unnamed player',
      classYear: p.graduation_year ? `'${String(p.graduation_year).slice(-2)}` : null,
      roundsPlayed: p.rounds_played,
      scoringAverage: p.scoring_average,
      scoringTrend: p.scoring_trend,
      lastRoundScore: p.last_round_score ?? null,
      recentScores: p.recent_scores ?? [],
      composite: intelligenceByPlayer[p.id]?.composite ?? null,
      topInsightTitle: intelligenceByPlayer[p.id]?.topInsightTitle ?? null,
      topInsightPriority: intelligenceByPlayer[p.id]?.topInsightPriority ?? null,
    }));
    return { players: boardPlayers, standingByPlayer, intelligenceSampleSize, rounds30d: teamRounds30d };
  }, [players, intelligenceByPlayer, standingByPlayer, intelligenceSampleSize, teamRounds30d]);

  const vm = React.useMemo(() => buildTeamBoardViewModel(boardInput), [boardInput]);

  const handleExport = React.useCallback(() => {
    try {
      const csv = buildBoardCsv(vm.rows);
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
      fairwayToast.success('Team stats exported', {
        description: `${vm.rows.length} player${vm.rows.length !== 1 ? 's' : ''} · ${a.download}`,
      });
    } catch {
      fairwayToast.danger('Export failed', { description: 'Could not generate the CSV. Please try again.' });
    }
  }, [vm.rows, teamName]);

  const isWomens = React.useMemo(() => {
    for (const map of standingByPlayer.values()) {
      for (const row of map.values()) {
        if (row.is_womens) return true;
      }
    }
    return false;
  }, [standingByPlayer]);

  const sgData: SGCategory[] = React.useMemo(
    () =>
      SG_CATEGORY_BARS.map(({ metric, label }) => ({
        label,
        value: weightedMean(players.map((p) => ({ value: standingByPlayer.get(p.id)?.get(metric)?.player_value ?? null, weight: p.rounds_played }))),
      })).filter((d): d is { label: string; value: number } => d.value !== null),
    [players, standingByPlayer],
  );
  const hasSg = sgData.length > 0;

  const sgTakeaway = React.useMemo(() => {
    if (!hasSg) return undefined;
    let worst = sgData[0]!;
    for (const d of sgData) if (d.value < worst.value) worst = d;
    if (worst.value >= 0) return undefined;
    return `${worst.label} is the team's biggest leak, ${fmtSg(worst.value)} strokes vs Tour.`;
  }, [sgData, hasSg]);

  const puttBuckets = toLeakMapBuckets(leakMaps?.putting);
  const approachBuckets = toLeakMapBuckets(leakMaps?.approach);
  const puttTakeaway = leakMaps ? worstLeakTakeaway(leakMaps.putting, 'higher_better', 'percent') : undefined;
  const approachTakeaway = leakMaps ? worstLeakTakeaway(leakMaps.approach, 'lower_better', 'feet') : undefined;
  const leakRoundsIncluded = leakMaps?.roundsIncluded ?? 0;
  const hasPuttSamples = puttBuckets.some((b) => b.sampleN > 0);
  const hasApproachSamples = approachBuckets.some((b) => b.sampleN > 0);
  const leakColdStartMessage =
    'Leak maps appear once players log rounds with shot-level tracking (putts and approach distances). Have players enter rounds shot by shot to populate this.';

  const rows: MatrixBoardRowData[] = vm.rows.map((row) => ({
    id: row.id,
    ariaLabel: `${row.name}, expandable row`,
    cells: [
      <div key="who" className="min-w-0">
        <b className="block truncate font-fw-sans text-body-sm font-semibold text-text-primary">{row.name}</b>
        <span className="font-fw-sans text-caption text-text-tertiary">
          {row.classYear ? `${row.classYear} · ` : ''}
          {row.roundsPlayed} rds · {row.scoringAverage}
        </span>
      </div>,
      <RankOrDash key="tee" rank={row.ranks.tee} />,
      <RankOrDash key="app" rank={row.ranks.app} />,
      <RankOrDash key="short" rank={row.ranks.short} />,
      <RankOrDash key="putt" rank={row.ranks.putt} />,
      <RankOrDash key="scor" rank={row.ranks.scoring} />,
      row.composite !== null ? (
        <RingGauge key="composite" value={row.composite} />
      ) : (
        <span key="composite" className="font-fw-mono text-body-sm text-text-tertiary">
          —
        </span>
      ),
      <Sparkline
        key="trend"
        data={row.trendSeries}
        goodDirection="down"
        label={`${row.name} scoring trend`}
      />,
      <SignalChip key="signal" tone={row.signal.tone}>
        {row.signal.label}
      </SignalChip>,
    ],
    expand: <ExpandBand row={row} />,
  }));

  const kpis = [
    { label: 'Team scoring', value: vm.kpis.teamScoring },
    { label: 'Team SG', value: <TeamSgKpi display={vm.kpis.teamSg} /> },
    { label: 'Trajectory', value: <TrajectoryKpi trajectory={vm.kpis.trajectory} /> },
    { label: 'Rounds · 30d', value: vm.kpis.rounds30d },
  ];

  return (
    <div className="mx-auto w-full max-w-[1536px] px-4 py-6 md:px-6 md:py-8 pb-24">
      {/* ── MASTHEAD ────────────────────────────────────────────────────────── */}
      <ViewHeader
        eyebrow="Team Stats"
        title="Team Stats"
        description={`Every player on ${teamName}'s roster: ranked, tracked, and measured against Tour.`}
        secondaryActions={
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="md">
              <Link href="/golf/dashboard/intelligence">Open team intelligence</Link>
            </Button>
            <IconButton
              variant="secondary"
              size="md"
              aria-label="Export team stats as CSV"
              onClick={handleExport}
              disabled={vm.rows.length === 0}
            >
              <Download className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
        }
      />

      {roundsError || intelligenceError || leakError ? (
        <InlineNotice tone={roundsError ? 'danger' : 'warning'} title="Some stats couldn't load" className="mt-6">
          {statsLoadErrorMessage(roundsError, intelligenceError, leakError)}
        </InlineNotice>
      ) : null}

      {/* ── ROSTER BOARD — first, per spec §5.2 (roster before tornado/leak-map) ── */}
      <section className="mt-8">
        {vm.rows.length === 0 ? (
          <InstrumentPanel depth="base">
            <p className="font-fw-sans text-body-sm text-text-secondary">No players on your roster yet.</p>
          </InstrumentPanel>
        ) : (
          <MatrixBoard kpis={kpis} columns={COLUMNS} rows={rows} />
        )}
      </section>

      {/* ── TEAM STROKES GAINED — demoted below the board ──────────────────────── */}
      <section className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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
        />
        <InstrumentPanel depth="raised" tone="accent" eyebrow="Season to date" header="SG: Total" className="flex flex-col justify-center">
          {vm.kpis.teamSgRaw !== null ? (
            <Readout size="hero" label="Team SG · per round" display={fmtSg(vm.kpis.teamSgRaw)} unit="sg" />
          ) : (
            <Readout size="hero" label="Team SG · per round" state="awaiting" awaitingLabel="Awaiting standing" />
          )}
          <p className="mt-4 font-fw-sans text-caption text-text-tertiary">
            The sum of every category vs the {tourLabel(isWomens)} baseline. Negative means the team is losing strokes to
            Tour over a round.
          </p>
        </InstrumentPanel>
      </section>

      {/* ── LEAK MAPS — demoted below the board ─────────────────────────────────── */}
      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-fw-display text-h3 font-medium tracking-[-0.005em] text-text-primary">Where the strokes leak</h2>
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
          />
        </div>
      </section>
    </div>
  );
}

function RankOrDash({ rank }: { rank: { rank: number; of: number } | null }) {
  if (!rank) {
    return (
      <span className="mx-auto grid h-[26px] w-[34px] place-items-center font-fw-mono text-caption text-text-tertiary">
        —
      </span>
    );
  }
  return <RankCell rank={rank.rank} of={rank.of} />;
}

function TeamSgKpi({ display }: { display: string }) {
  return <span className="font-fw-mono text-h2 tracking-[-0.02em] tabular-nums text-text-primary">{display}</span>;
}

function TrajectoryKpi({ trajectory }: { trajectory: { improving: number; steady: number; declining: number } }) {
  return (
    <span className="inline-flex items-baseline gap-2.5 font-fw-mono text-h3 tabular-nums">
      <span className="text-accent-600">{trajectory.improving}▲</span>
      <span className="text-text-tertiary">{trajectory.steady}→</span>
      <span className="text-fw-warning-ink">{trajectory.declining}▼</span>
    </span>
  );
}

function ExpandBand({ row }: { row: TeamBoardRowViewModel }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <ExpandStat label={row.expand.worstMetricLabel ?? 'Worst metric'} value={row.expand.worstMetricValue ?? '—'} />
      <ExpandStat label="SG Putt" value={row.expand.sgPutt} />
      <ExpandStat label="Last round" value={row.expand.lastRound} />
      <div className="col-span-2 flex flex-col justify-center font-fw-sans text-caption text-text-secondary sm:col-span-1">
        <Link href={row.expand.links.fullStats} className="font-semibold text-accent-700 hover:underline">
          Full stats
        </Link>
        <Link href={row.expand.links.fingerprint} className="font-semibold text-accent-700 hover:underline">
          Fingerprint
        </Link>
        <Link href={row.expand.links.prescribe} className="font-semibold text-accent-700 hover:underline">
          Prescribe drill
        </Link>
      </div>
    </div>
  );
}

function ExpandStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-fw-display text-caption font-bold uppercase tracking-[0.09em] text-text-tertiary">{label}</div>
      <b className="block font-fw-mono text-body font-normal tabular-nums text-text-primary">{value}</b>
    </div>
  );
}
