'use client';

/**
 * ============================================================================
 * TeamStatsBoard — the roster-as-one-instrument Team Stats surface
 * (fairway-facelift screens/team-stats.md — Archetype B board + C analysis)
 * ----------------------------------------------------------------------------
 * ONE primary action ("Open team intelligence"); Export + "Ask CoachHelm"
 * live in the header overflow `Menu` (Export also gets its own IconButton
 * from `sm:` up). A standalone header `StatMatrix` (Scoring · SG/rd ·
 * Trajectory · Rounds 30d) replaces the old 2×2 KPI band that used to live
 * inside `MatrixBoard` itself (`kpis={[]}` below disables that band) — it's
 * sticky on desktop so the coach keeps the team read while scrolling a long
 * roster. Below it, the player `MatrixBoard` is the dominant object: five
 * `RankCell`s (green-ramp, darker = stronger), a leading number + `Meter`
 * for the composite score, a scoring-trend `Sparkline`, and a `SignalChip`
 * per row; a row click expands
 * an inline detail band in place (worst metric / SG putt / last round +
 * triage links) — no navigation for a coach's daily scan.
 *
 * Below the board, ONE analysis `Bento` (tornado hero 2×2, fundamentals
 * rails 2×1, putts-by-distance 1×1, approach proximity 1×1) replaces the old
 * fundamentals/tornado/leak-map card stack — and the old "SG: Total" hero is
 * gone outright (it duplicated the header StatMatrix's SG cell). Every chart
 * keeps its own Recharts/visx body, title, and "View as table" toggle;
 * `BentoCell`'s own required `label` carries the short context tag
 * (`overline` used to) so a cell shows one heading, not two. Cold-start
 * renders the board immediately — the tornado/leak-map charts never block it.
 *
 * Reuse: `MatrixBoard`/`RankCell`/`SignalChip` (module kit),
 * `StatMatrix`/`Bento`/`BentoCell` (module kit), `Menu`/`InsufficientData`,
 * `Sparkline`/`StrokesGainedTornado`/`LeakMap`/`InstrumentPanel`/`Meter`/
 * `ViewHeader`/`InlineNotice`/`Button`/`IconButton` (Fairway primitives +
 * charts). All ranking/tone/formatting logic lives in
 * `buildTeamBoardViewModel` — this file only composes JSX.
 *
 * The composite column used to be a bare `RingGauge` (a 30px SVG ring —
 * a 16px arc on the actual capture) with no number visible beside it; a
 * coach scanning the board at 1440px could not read a composite score from
 * it. It's now a leading tabular number beside a `Meter size="sm"` linear
 * bar (facelift REVIEW.md "Team stats, desktop") — the column is hidden
 * below 940px by `MatrixBoard`'s own `HIDE_ON_MOBILE`, so this is a
 * desktop-only cell either way. Column headers ("Tee"/"App"/"Shrt"/"Putt"/
 * "Scor") likewise switch to full words ("Tee"/"Approach"/"Short game"/
 * "Putting"/"Scoring") at that SAME 940px point, via `useMediaQuery` — kept
 * in step with `MatrixBoard`'s own breakpoint rather than Tailwind's `md`
 * so the header text and the columns it labels change together.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, MoreVertical, TrendingUp, TrendingDown, Minus } from 'lucide-react';

import { ViewHeader, StrokesGainedTornado, type SGCategory, LeakMap, type LeakMapBucket, InstrumentPanel, InsufficientData, Menu, Button, IconButton, InlineNotice, Sparkline, Meter, fairwayToast } from '@/components/fairway';
import { MatrixBoard, RankCell, RailBars, SignalChip, Bento, BentoCell, StatMatrix } from '@/components/fairway/modules';
import type { MatrixColumn, MatrixBoardRow as MatrixBoardRowData, RailBarRow, StatMatrixItem } from '@/components/fairway/modules';
import { useMediaQuery } from '@/hooks/use-media-query';

import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { TeamPlayerStats } from '@/app/golf/(dashboard)/dashboard/stats/team/page';
import type { TeamLeakMaps, LeakBucket } from '@/app/golf/actions/stats-leak-maps-types';

import { buildTeamBoardViewModel, fmtSg, TREND_SIGNAL_MIN_ROUNDS, weightedMean, type TeamBoardPlayerInput, type TeamBoardRowViewModel } from './buildTeamBoardViewModel';
import { formatTeamStatsFreshness, formatTeamStatsFreshnessHeadline, type TeamStatsFreshness } from './teamStatsFreshness';

// ============================================================================
// PROPS — same shapes the route already resolves (page.tsx reuses its
// existing fetches verbatim. Raw make/attempt totals and the recent-score
// fields are all derived from rounds/holes the page already fetched, with no
// extra query.
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
  /** Explicit source timestamps for values that contribute to right-side signals. */
  freshness: TeamStatsFreshness;
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
function worstLeakTakeaway(buckets: LeakBucket[], direction: 'higher_better' | 'lower_better', unit: 'percent' | 'feet'): string | undefined {
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
  const header = ['Player', 'Rounds', 'Scoring Avg', 'Tee Rank', 'App Rank', 'Short Rank', 'Putt Rank', 'Scoring Rank', 'Composite', 'Signal'];
  const fmtRank = (r: { rank: number; of: number } | null) => (r ? `${r.rank}/${r.of}` : '');
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([r.name, String(r.roundsPlayed), r.scoringAverage, fmtRank(r.ranks.tee), fmtRank(r.ranks.app), fmtRank(r.ranks.short), fmtRank(r.ranks.putt), fmtRank(r.ranks.scoring), r.composite === null ? '' : String(Math.round(r.composite)), r.signal.label].map(csvCell).join(','));
  }
  return lines.join('\n');
}

export function TeamStatsBoard({ teamName, players, intelligenceByPlayer, intelligenceError = false, intelligenceSampleSize = 0, leakMaps, leakError = false, roundsError = false, standingByPlayer, teamRounds30d, freshness }: TeamStatsBoardProps) {
  const router = useRouter();

  // Full words from 940px up (MatrixBoard's own desktop threshold — the same
  // width Scor/Composite/Trend/Signal themselves appear at); abbreviated
  // below it, where Player/Tee/App/Shrt/Putt are already tight on a phone
  // (facelift REVIEW.md "Team stats, desktop" — phone abbreviations read
  // as noise once there's room for the real words).
  const isBoardWide = useMediaQuery('(min-width: 940px)');
  const columns: MatrixColumn[] = React.useMemo(
    () => [
      { key: 'who', label: 'Player' },
      { key: 'tee', label: 'Tee', align: 'center' },
      { key: 'app', label: isBoardWide ? 'Approach' : 'App', align: 'center' },
      { key: 'short', label: isBoardWide ? 'Short game' : 'Shrt', align: 'center' },
      { key: 'putt', label: isBoardWide ? 'Putting' : 'Putt', align: 'center' },
      { key: 'scor', label: isBoardWide ? 'Scoring' : 'Scor', align: 'center' },
      { key: 'composite', label: 'Composite' },
      { key: 'trend', label: 'Trend' },
      { key: 'signal', label: 'Signal' },
    ],
    [isBoardWide],
  );

  const boardInput = React.useMemo(() => {
    const boardPlayers: TeamBoardPlayerInput[] = players.map((p) => ({
      id: p.id,
      name: `${p.first_name} ${p.last_name}`.trim() || 'Unnamed player',
      classYear: p.graduation_year ? `'${String(p.graduation_year).slice(-2)}` : null,
      roundsPlayed: p.rounds_played,
      scoringAverage: p.scoring_average,
      roundsPlayed18: p.rounds_played_18,
      scoringAverage18: p.scoring_average_18,
      fairwayPct: p.fairway_pct,
      fairwayHits: p.fairway_hits,
      fairwayAttempts: p.fairway_attempts,
      girPct: p.gir_pct,
      girHits: p.gir_hits,
      girAttempts: p.gir_attempts,
      scramblingPct: p.scrambling_pct,
      scramblesMade: p.scrambles_made,
      scrambleAttempts: p.scramble_attempts,
      puttsPerRound: p.putts_per_round,
      totalPutts: p.total_putts,
      holesWithPutts: p.holes_with_putts,
      birdiesPerRound: p.birdies_per_round,
      totalBirdies: p.total_birdies,
      holesWithScore: p.holes_with_score,
      scoringTrend: p.scoring_trend,
      lastRoundScore: p.last_round_score ?? null,
      recentScores: p.recent_scores ?? [],
      composite: intelligenceByPlayer[p.id]?.composite ?? null,
      topInsightTitle: intelligenceByPlayer[p.id]?.topInsightTitle ?? null,
      topInsightPriority: intelligenceByPlayer[p.id]?.topInsightPriority ?? null,
    }));
    return {
      players: boardPlayers,
      standingByPlayer,
      intelligenceSampleSize,
      rounds30d: teamRounds30d,
    };
  }, [players, intelligenceByPlayer, standingByPlayer, intelligenceSampleSize, teamRounds30d]);

  const vm = React.useMemo(() => buildTeamBoardViewModel(boardInput), [boardInput]);

  const handleExport = React.useCallback(() => {
    try {
      const csv = buildBoardCsv(vm.rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const slug =
        teamName
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'team';
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
      fairwayToast.danger('Export failed', {
        description: 'Could not generate the CSV. Please try again.',
      });
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
        value: weightedMean(
          players.map((p) => ({
            value: standingByPlayer.get(p.id)?.get(metric)?.player_value ?? null,
            weight: p.rounds_played,
          })),
        ),
      })).filter((d): d is { label: string; value: number } => d.value !== null),
    [players, standingByPlayer],
  );
  const hasSg = sgData.length > 0;

  const fundamentalsRows: RailBarRow[] = React.useMemo(
    () => [
      {
        label: 'Fairways',
        pct: vm.fundamentals.fairwayPct ?? 0,
        value: fmtPct(vm.fundamentals.fairwayPct),
        dim: vm.fundamentals.fairwayPct === null,
      },
      {
        label: 'GIR',
        pct: vm.fundamentals.girPct ?? 0,
        value: fmtPct(vm.fundamentals.girPct),
        dim: vm.fundamentals.girPct === null,
      },
      {
        label: 'Scrambling',
        pct: vm.fundamentals.scramblingPct ?? 0,
        value: fmtPct(vm.fundamentals.scramblingPct),
        dim: vm.fundamentals.scramblingPct === null,
      },
    ],
    [vm.fundamentals],
  );
  const hasFundamentals = fundamentalsRows.some((row) => !row.dim);

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
  const leakColdStartMessage = 'Leak maps appear once players log rounds with shot-level tracking (putts and approach distances). Have players enter rounds shot by shot to populate this.';

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
        <div key="composite" className="flex w-full items-center gap-2">
          <span className="w-6 flex-shrink-0 text-right font-fw-sans text-body-sm font-semibold tabular-nums text-text-primary">
            {Math.round(row.composite)}
          </span>
          <Meter value={row.composite} min={0} max={100} size="sm" label={`${row.name} composite score`} className="min-w-0 flex-1" />
        </div>
      ) : (
        <span key="composite" className="font-fw-sans text-body-sm text-text-tertiary">
          —
        </span>
      ),
      <Sparkline key="trend" data={row.trendSeries} goodDirection="down" label={`${row.name} scoring trend`} />,
      <SignalChip key="signal" tone={row.signal.tone}>
        {row.signal.label}
      </SignalChip>,
    ],
    expand: <ExpandBand row={row} />,
  }));

  // Team-wide trend signal is the same per-player gate as the roster board's
  // own trajectory verdicts (`scoringTrendVerdict` only counts a player once
  // their `scoringTrend` delta is non-null, i.e. TREND_SIGNAL_MIN_ROUNDS+
  // rounds with 5 recent vs 3+ prior). Zero players clearing that gate would
  // otherwise render as an authoritative-looking "0▲ 0→ 0▼" — a fabricated
  // zero, not a real reading (DESIGN-SYSTEM §0 #8) — so the cell honestly
  // says "not yet" instead (spec STATES: <8 rounds → InsufficientData inline,
  // board still renders).
  const hasTrajectorySignal = vm.kpis.trajectory.improving + vm.kpis.trajectory.steady + vm.kpis.trajectory.declining > 0;

  const statItems: StatMatrixItem[] = [
    { label: 'Team scoring', value: vm.kpis.teamScoring },
    { label: 'Team SG', value: <TeamSgKpi display={vm.kpis.teamSg} /> },
    {
      label: 'Trajectory',
      value: hasTrajectorySignal ? (
        <TrajectoryKpi trajectory={vm.kpis.trajectory} />
      ) : (
        <InsufficientData
          compact
          icon={null}
          title="Trend pending"
          description={`Signals begin after ${TREND_SIGNAL_MIN_ROUNDS} rounds.`}
          className="flex-1 justify-center gap-1 border-0 bg-transparent p-0 text-center"
        />
      ),
    },
    { label: 'Rounds · 30d', value: vm.kpis.rounds30d },
  ];

  return (
    <div className="mx-auto w-full max-w-[1536px] px-4 py-6 md:px-6 md:py-8 pb-24">
      {/* ── MASTHEAD ────────────────────────────────────────────────────────── */}
      <ViewHeader
        // No eyebrow — it would just repeat the "Team Stats" title verbatim
        // (facelift REVIEW.md "Team stats, phone": drop the eyebrow when it
        // equals the title).
        title="Team Stats"
        description={`Every player on ${teamName}, ranked against Tour.`}
        meta={<p className="max-w-[90ch] font-fw-sans text-caption leading-relaxed text-text-secondary">{formatTeamStatsFreshnessHeadline(freshness)}</p>}
        primaryAction={
          <Button asChild variant="primary" size="md">
            <Link href="/golf/dashboard/intelligence">Open team intelligence</Link>
          </Button>
        }
        secondaryActions={
          <div className="flex items-center gap-2">
            <IconButton
              className="hidden sm:inline-flex"
              variant="secondary"
              size="md"
              aria-label="Export team stats as CSV"
              onClick={handleExport}
              disabled={vm.rows.length === 0}
            >
              <Download className="h-4 w-4" aria-hidden />
            </IconButton>
            <Menu
              trigger={
                <IconButton variant="secondary" size="md" aria-label="More actions">
                  <MoreVertical className="h-4 w-4" aria-hidden />
                </IconButton>
              }
            >
              {/* `Menu.Item asChild` can't wrap a bare `<Link>` here — MenuItem
                  always wraps its own `children` in a fixed icon/content/
                  shortcut span structure before handing off to Radix's
                  `DropdownMenu.Item`, so an `asChild` Slot sees multiple
                  sibling children instead of the single element it requires
                  ("Primitive.div failed to slot onto its children", caught by
                  TeamStatsBoard.freshness.test.tsx). `onSelect` + `router.push`
                  is the same navigate-from-a-menu idiom FairwayPlayerActionsMenu
                  already uses. */}
              <Menu.Item onSelect={() => router.push('/golf/dashboard/coachhelm/chat')}>Ask CoachHelm</Menu.Item>
              <Menu.Item onSelect={handleExport} disabled={vm.rows.length === 0}>
                Export as CSV
              </Menu.Item>
              {/* The full multi-source freshness sentence (raw UTC stats-cache/
                  rank-snapshot/oldest-signal-insight timestamps) — a coach
                  reads none of that at a glance, so the masthead only shows
                  the ONE relative headline above; this is the detail behind
                  a Menu item the brief calls for. */}
              <Menu.Item onSelect={() => fairwayToast.info('Data freshness', { description: formatTeamStatsFreshness(freshness) })}>Freshness details</Menu.Item>
            </Menu>
          </div>
        }
      />

      {roundsError || intelligenceError || leakError ? (
        <InlineNotice tone={roundsError ? 'danger' : 'warning'} title="Some stats couldn't load" className="mt-6">
          {statsLoadErrorMessage(roundsError, intelligenceError, leakError)}
        </InlineNotice>
      ) : null}

      {/* ── HEADER STAT MATRIX — the KPI band, now its own object above the
            board (spec CONTAINERS TO REMOVE #2) instead of living inside
            MatrixBoard's own kpi band (`kpis={[]}` below disables that). Sticky
            on desktop only (spec COMPOSITION "Floating: sticky board header on
            desktop") using the shell's own sticky-sub-header offset vars — the
            same idiom FairwayRoundsLibrary/FairwayCalendarHero use — so it never
            collides with the app-shell's own sticky glass top bar. ── */}
      <div className="mt-8 min-[940px]:sticky min-[940px]:top-[calc(var(--golf-mobile-header-offset)+var(--fw-hub-subnav-offset,0px))] min-[940px]:z-10 min-[940px]:border-b min-[940px]:border-border-subtle min-[940px]:bg-canvas min-[940px]:pb-4">
        <StatMatrix items={statItems} columns={4} />
      </div>

      {/* ── ROSTER BOARD (dominant object) — first, per spec §5.2 (roster before
            tornado/leak-map) ── */}
      <section className="mt-6">
        <p className="mb-3 font-fw-sans text-caption text-text-secondary">
          Trend signals begin after {TREND_SIGNAL_MIN_ROUNDS} completed rounds: five recent rounds compared with at least three prior rounds.
        </p>
        {vm.rows.length === 0 ? (
          <InstrumentPanel depth="base">
            <p className="font-fw-sans text-body-sm text-text-secondary">No players on your roster yet.</p>
          </InstrumentPanel>
        ) : (
          <MatrixBoard kpis={[]} columns={columns} rows={rows} />
        )}
      </section>

      {/* ── ANALYSIS BENTO — ONE object replacing the fundamentals/tornado/
            SG-total/leak-map card stack (spec CONTAINERS TO REMOVE #3, #4):
            tornado hero (2×2) → fundamentals rails (2×1) → putts-by-distance
            (1×1) → approach proximity (1×1). DOM order matches visual
            priority (the 2×2 goes first) per Bento's own grid-flow-dense
            contract. Every cell keeps its chart's own title (Section-title
            role) + "View as table" toggle — `BentoCell`'s own required
            `label` carries the short context tag that `overline` used to
            (moved here, not duplicated) so each cell shows ONE heading
            stack, not two. The "SG: Total" hero from the old capture is
            gone outright — it repeated the header StatMatrix's SG cell. ── */}
      <section className="mt-10">
        <Bento>
          <BentoCell label="Strokes Gained" span={2} rows={2}>
            <StrokesGainedTornado
              title="Team Strokes Gained"
              subtitle={`vs ${tourLabel(isWomens)} baseline · season to date`}
              takeaway={sgTakeaway}
              data={sgData}
              state={hasSg ? undefined : 'insufficient-data'}
              stateMessage={hasSg ? undefined : 'Strokes Gained appears once players log rounds with shot-level tracking. Add players to your roster and have them enter rounds shot by shot.'}
              className="border-0 bg-transparent p-0"
            />
          </BentoCell>

          <BentoCell
            label="Fundamentals"
            span={2}
            sentence="Pooled from every recorded opportunity — not averaged player percentages."
          >
            <div className="grid gap-6 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] sm:items-center">
              {hasFundamentals ? (
                <RailBars rows={fundamentalsRows} labelWidth={72} />
              ) : (
                <p className="font-fw-sans text-caption text-text-tertiary">Fairways, GIR, and scrambling appear once hole outcomes are recorded.</p>
              )}
              <StatMatrix
                variant="plain"
                size="sm"
                columns={3}
                items={[
                  { label: 'Score avg', value: vm.kpis.teamScoring },
                  { label: 'Putts / 18', value: fmtOneDecimal(vm.fundamentals.puttsPerRound) },
                  { label: 'Birdies / 18', value: fmtOneDecimal(vm.fundamentals.birdiesPerRound) },
                ]}
              />
            </div>
          </BentoCell>

          <BentoCell label="Putting" rows={1}>
            <LeakMap
              title="Putts Made by Distance"
              subtitle={`Team make% vs ${tourLabel(isWomens)}${leakMaps && leakRoundsIncluded > 0 ? ` · ${leakRoundsIncluded} round${leakRoundsIncluded !== 1 ? 's' : ''} tracked` : ''}`}
              takeaway={puttTakeaway}
              data={puttBuckets}
              direction="higher_better"
              unit="percent"
              state={leakMaps && hasPuttSamples ? undefined : 'insufficient-data'}
              stateMessage={leakMaps && hasPuttSamples ? undefined : leakColdStartMessage}
              className="border-0 bg-transparent p-0"
            />
          </BentoCell>

          <BentoCell label="Approach" rows={1}>
            <LeakMap
              title="Approach Proximity by Distance"
              subtitle={`Avg proximity to hole vs ${tourLabel(isWomens)}${leakMaps && leakRoundsIncluded > 0 ? ` · ${leakRoundsIncluded} round${leakRoundsIncluded !== 1 ? 's' : ''} tracked` : ''}`}
              takeaway={approachTakeaway}
              data={approachBuckets}
              direction="lower_better"
              unit="feet"
              state={leakMaps && hasApproachSamples ? undefined : 'insufficient-data'}
              stateMessage={leakMaps && hasApproachSamples ? undefined : leakColdStartMessage}
              className="border-0 bg-transparent p-0"
            />
          </BentoCell>
        </Bento>
      </section>
    </div>
  );
}

function RankOrDash({ rank }: { rank: { rank: number; of: number } | null }) {
  if (!rank) {
    return <span className="mx-auto grid h-[26px] w-[34px] place-items-center font-fw-mono text-caption text-text-tertiary">—</span>;
  }
  return <RankCell rank={rank.rank} of={rank.of} />;
}

// KPI display face matches StatMatrix's own `dd` (font-fw-sans + tabular-nums,
// StatMatrix.tsx:110) — the wide monospace these used before read as a
// terminal readout, not a scoreboard number (facelift REVIEW.md "Team
// stats, phone").
function TeamSgKpi({ display }: { display: string }) {
  return <span className="font-fw-sans text-h2 font-semibold tracking-[-0.02em] tabular-nums text-text-primary">{display}</span>;
}

function TrajectoryKpi({ trajectory }: { trajectory: { improving: number; steady: number; declining: number } }) {
  return (
    <span className="inline-flex items-baseline gap-2.5 font-fw-sans text-h3 font-semibold tabular-nums">
      <span className="inline-flex items-center gap-0.5 text-accent-600">
        {trajectory.improving}
        <TrendingUp className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className="inline-flex items-center gap-0.5 text-text-tertiary">
        {trajectory.steady}
        <Minus className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className="inline-flex items-center gap-0.5 text-fw-warning-ink">
        {trajectory.declining}
        <TrendingDown className="h-3.5 w-3.5" aria-hidden />
      </span>
    </span>
  );
}

function ExpandBand({ row }: { row: TeamBoardRowViewModel }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
      <ExpandStat label="Fairways" value={row.expand.fairways} />
      <ExpandStat label="GIR" value={row.expand.gir} />
      <ExpandStat label="Scrambling" value={row.expand.scrambling} />
      <ExpandStat label="Putts / 18" value={row.expand.puttsPerRound} />
      <ExpandStat label="Birdies / 18" value={row.expand.birdiesPerRound} />
      <ExpandStat label={row.expand.worstMetricLabel ?? 'Worst metric'} value={row.expand.worstMetricValue ?? '—'} />
      <ExpandStat label="SG Putt" value={row.expand.sgPutt} />
      <ExpandStat label="Last round" value={row.expand.lastRound} />
      <div className="col-span-full mt-1 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border-subtle pt-3 font-fw-sans text-caption text-text-secondary">
        <Link href={row.expand.links.fullStats} className="font-semibold text-accent-700 hover:underline">
          Full stats
        </Link>
        <Link href={row.expand.links.fingerprint} className="font-semibold text-accent-700 hover:underline">
          Fingerprint
        </Link>
        <Link href={row.expand.links.prescribe} className="font-semibold text-accent-700 hover:underline">
          Prescribe focus area
        </Link>
      </div>
    </div>
  );
}

function fmtPct(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`;
}

function fmtOneDecimal(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : value.toFixed(1);
}

function ExpandStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-fw-display text-caption font-bold uppercase tracking-[0.09em] text-text-tertiary">{label}</div>
      <b className="block font-fw-mono text-body font-semibold tabular-nums text-text-primary">{value}</b>
    </div>
  );
}
