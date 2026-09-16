'use client';

/**
 * ============================================================================
 * TeamStatsBoard — team stats as a field sheet
 * (docs/design/fairway-facelift/screens/team-stats.v3.md + LANGUAGE.md)
 * ----------------------------------------------------------------------------
 * The question this page answers: where is this team leaking strokes against
 * Tour, and which players are carrying the leak. The leak first, the names
 * second.
 *
 * Composition:
 *   1. Masthead, bare on the canvas: team eyebrow with the actions, the title,
 *      the verdict sentence built from the payload, a facts line, then the
 *      three-flag load-failure notice.
 *   2. The stage, the ONE Surface: `CategoryField`, two registers sharing one
 *      column grid — the team's signed strokes gained per category above, the
 *      roster's ranks in the same five columns below — with the three team
 *      readouts in a right rail from xl.
 *   3. The ledger row, bare hairline columns: where it leaks, who leads each,
 *      fundamentals.
 *   4. The category-detail table, dense, where a row opens.
 *   5. The leak maps as a bare diptych — a different subject (distance bands,
 *      not players), so they keep their charts and lose their boxes.
 *
 * What this replaced, and why: a `ViewHeader`, a sticky four-cell `StatMatrix`
 * band, a bordered `MatrixBoard` bezel and a four-cell `Bento` of charts. Five
 * regions, four of them boxes, and the roster board came BEFORE the strokes-
 * gained chart, so a coach read nine rank columns before learning which column
 * mattered. Sharing one column grid between the team's bars and the players'
 * ranks removes that memory step entirely.
 *
 * HYDRATION: no clock is read in a render path and no breakpoint is read at
 * runtime. The header label switch and every responsive reflow are CSS; the
 * stage's default sort is derived from the data, so the server render and the
 * first client paint agree. Freshness timestamps arrive as props.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, MoreVertical } from 'lucide-react';

import { ViewHeader, LeakMap, InstrumentPanel, Menu, Button, IconButton, InlineNotice, Surface, fairwayToast } from '@/components/fairway';

import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { TeamPlayerStats } from '@/app/golf/(dashboard)/dashboard/stats/team/page';
import type { TeamLeakMaps } from '@/app/golf/actions/stats-leak-maps-types';
import { SectionHead, VerdictLine } from '@/components/fairway/pages/dashboard/coach-home-parts';

import { buildTeamBoardViewModel, fmtSg, type TeamBoardPlayerInput } from './buildTeamBoardViewModel';
import { formatTeamStatsFreshness, formatTeamStatsFreshnessHeadline, type TeamStatsFreshness } from './teamStatsFreshness';
import { CategoryField, type CategoryFieldPlayerRow, type CategoryFieldTeamCell } from './CategoryField';
import {
  CategoryDetailTable,
  FundamentalsList,
  LeadersList,
  LeakList,
  LedgerColumn,
  LedgerNote,
  ReadoutNumber,
  TeamReadouts,
  TrajectoryKpi,
  type TeamReadoutItem,
} from './team-stats-parts';
import {
  buildBoardCsv,
  buildTeamStatsVerdict,
  CATEGORY_COLUMNS,
  defaultSortKey,
  EN_DASH,
  fundamentalRows,
  hasAnySg,
  hasFundamentals as rosterHasFundamentals,
  hasTrajectorySignal as trajectoryHasSignal,
  isWomensRoster,
  leadersByCategory,
  leakOrder,
  SG_COLD_START_FULL,
  sgDomain,
  sortPlayerRows,
  STAGE_ROW_CAP,
  statsLoadErrorMessage,
  teamSgByCategory,
  teamSlug,
  toLeakMapBuckets,
  tourLabel,
  worstLeakTakeaway,
  type CategoryKey,
  type StageSortKey,
} from './team-stats-logic';

// ============================================================================
// PROPS — unchanged. Every field this page reads is already resolved by
// `stats/team/page.tsx` and passed in; the facelift added no query.
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

const OVERLINE = 'font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary';

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
  freshness,
}: TeamStatsBoardProps) {
  const router = useRouter();

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

  const sgWeights = React.useMemo(() => players.map((p) => ({ id: p.id, roundsPlayed: p.rounds_played })), [players]);
  const readings = React.useMemo(() => teamSgByCategory(sgWeights, standingByPlayer), [sgWeights, standingByPlayer]);
  const hasSg = hasAnySg(readings);
  const domain = React.useMemo(() => sgDomain(readings), [readings]);
  const tour = React.useMemo(() => tourLabel(isWomensRoster(standingByPlayer)), [standingByPlayer]);

  /* ── Stage sort. Client state, but its INITIAL value is derived from the
        data, so the server render and the first client paint agree and no
        breakpoint or clock is consulted anywhere in the path. ───────────── */
  const [sort, setSort] = React.useState<StageSortKey>(() => defaultSortKey(readings, vm.rows));
  const [stageVisible, setStageVisible] = React.useState(STAGE_ROW_CAP);
  const sortedRows = React.useMemo(() => sortPlayerRows(vm.rows, sort), [vm.rows, sort]);

  const handleExport = React.useCallback(() => {
    try {
      const csv = buildBoardCsv(vm.rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${teamSlug(teamName)}-team-stats.csv`;
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

  const verdict = React.useMemo(
    () =>
      buildTeamStatsVerdict({
        readings,
        rows: vm.rows,
        trajectory: vm.kpis.trajectory,
        tourLabel: tour,
        roundsError,
      }),
    [readings, vm.rows, vm.kpis.trajectory, tour, roundsError],
  );

  const hasTrajectory = trajectoryHasSignal(vm.kpis.trajectory);

  const readouts: TeamReadoutItem[] = [
    {
      key: 'sg',
      label: 'Team SG / rd',
      // The label carries the unit, so the value carries only the number.
      // `vm.kpis.teamSg` bakes in a "/ rd" suffix that printed the unit twice.
      value: <ReadoutNumber>{fmtSg(vm.kpis.teamSgRaw)}</ReadoutNumber>,
      note: `versus ${tour}`,
    },
    {
      key: 'trajectory',
      label: 'Trajectory',
      // A count of zero across all three buckets is not "0 climbing, 0 flat,
      // 0 sliding" — nobody has cleared the trend gate yet, which is a
      // different statement. The verdict above already explains the gate, so
      // this says only that there is no reading.
      value: hasTrajectory ? <TrajectoryKpi trajectory={vm.kpis.trajectory} /> : <span className="font-fw-mono text-h3 font-medium text-text-tertiary">Not yet</span>,
      note: hasTrajectory ? 'climbing · flat · sliding' : ' ',
    },
    { key: 'rounds', label: 'Rounds · 30d', value: <ReadoutNumber>{vm.kpis.rounds30d}</ReadoutNumber>, note: ' ' },
  ];

  /* ── Stage cells ─────────────────────────────────────────────────────── */
  // `hasSg === false` and `roundsError === true` are two different states that
  // would otherwise render identically: `vm.rows` does not go empty when a
  // fetch fails, only the values inside it do. The cold-start sentence asserts
  // a data-collection gap, so it is gated strictly on a cold start; a failure
  // dashes the cells and lets the notice above carry the explanation.
  const showColdStart = !hasSg && !roundsError;
  const teamCells: CategoryFieldTeamCell[] = [
    ...readings.map((r) => ({
      key: r.key,
      value: r.value,
      display: r.value === null ? EN_DASH : fmtSg(r.value),
      bar: true,
      label: r.value === null ? `${r.prose}: no reading yet` : `${r.prose}: ${fmtSg(r.value)} strokes a round versus ${tour}`,
    })),
    {
      key: 'scoring',
      // Scoring has no strokes-gained figure and no baseline to draw off, so
      // it states the team average as a plain number rather than inventing a
      // zero line to hang a bar on.
      value: vm.kpis.teamScoringRaw,
      display: vm.kpis.teamScoring,
      bar: false,
      label: `Team scoring average ${vm.kpis.teamScoring}`,
    },
  ];

  const playerRows: CategoryFieldPlayerRow[] = sortedRows.map((row) => ({
    id: row.id,
    name: row.name,
    meta: `${row.classYear ? `${row.classYear} · ` : ''}${row.roundsPlayed} rds · ${row.scoringAverage}`,
    href: `/golf/dashboard/roster/${row.id}`,
    ranks: CATEGORY_COLUMNS.map((c) => row.ranks[c.key]),
  }));

  /* ── Ledger ──────────────────────────────────────────────────────────── */
  const leakRows = React.useMemo(() => {
    const ranked = leakOrder(readings);
    const missing = readings.filter((r) => r.value === null);
    return [...ranked, ...missing];
  }, [readings]);
  const leaders = React.useMemo(() => leadersByCategory(vm.rows), [vm.rows]);
  const fundamentals = React.useMemo(() => fundamentalRows(vm.fundamentals), [vm.fundamentals]);
  const fundamentalsKnown = rosterHasFundamentals(vm.fundamentals);

  /* ── Coda ────────────────────────────────────────────────────────────── */
  const puttBuckets = toLeakMapBuckets(leakMaps?.putting);
  const approachBuckets = toLeakMapBuckets(leakMaps?.approach);
  const puttTakeaway = leakMaps ? worstLeakTakeaway(leakMaps.putting, 'higher_better', 'percent') : undefined;
  const approachTakeaway = leakMaps ? worstLeakTakeaway(leakMaps.approach, 'lower_better', 'feet') : undefined;
  const leakRoundsIncluded = leakMaps?.roundsIncluded ?? 0;
  const hasPuttSamples = puttBuckets.some((b) => b.sampleN > 0);
  const hasApproachSamples = approachBuckets.some((b) => b.sampleN > 0);
  const leakColdStartMessage =
    'Leak maps appear once players log rounds with shot-level tracking (putts and approach distances). Have players enter rounds shot by shot to populate this.';
  const roundsTracked = leakMaps && leakRoundsIncluded > 0 ? ` · ${leakRoundsIncluded} round${leakRoundsIncluded !== 1 ? 's' : ''} tracked` : '';

  const actions = (
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
            always wraps its own `children` in a fixed icon/content/shortcut
            span structure before handing off to Radix's `DropdownMenu.Item`,
            so an `asChild` Slot sees multiple sibling children instead of the
            single element it requires ("Primitive.div failed to slot onto its
            children", caught by TeamStatsBoard.freshness.test.tsx).
            `onSelect` + `router.push` is the same navigate-from-a-menu idiom
            FairwayPlayerActionsMenu already uses. */}
        <Menu.Item onSelect={() => router.push('/golf/dashboard/coachhelm/chat')}>Ask CoachHelm</Menu.Item>
        <Menu.Item onSelect={handleExport} disabled={vm.rows.length === 0}>
          Export as CSV
        </Menu.Item>
        {/* The full multi-source freshness sentence (raw UTC stats-cache/
            rank-snapshot/oldest-signal-insight timestamps) — a coach reads
            none of that at a glance, so the masthead only shows the ONE
            relative headline; this is the detail behind a Menu item. */}
        <Menu.Item onSelect={() => fairwayToast.info('Data freshness', { description: formatTeamStatsFreshness(freshness) })}>Freshness details</Menu.Item>
      </Menu>
    </div>
  );

  const primaryAction = (
    <Button asChild variant="primary" size="md">
      <Link href="/golf/dashboard/intelligence">Open team intelligence</Link>
    </Button>
  );

  const loadFailed = roundsError || intelligenceError || leakError;
  const notice = loadFailed ? (
    <InlineNotice tone={roundsError ? 'danger' : 'warning'} title="Some stats couldn't load" className="mt-6">
      {statsLoadErrorMessage(roundsError, intelligenceError, leakError)}
    </InlineNotice>
  ) : null;

  // ── The true zero state keeps the old masthead: there is no field to draw,
  //    no ledger to fill and no table to head. ──────────────────────────────
  if (vm.rows.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1536px] px-4 py-6 pb-24 md:px-6 md:py-8">
        <ViewHeader
          title="Team Stats"
          description={`Every player on ${teamName}, ranked against ${tour}.`}
          meta={<p className="max-w-[90ch] font-fw-sans text-caption leading-relaxed text-text-secondary">{formatTeamStatsFreshnessHeadline(freshness)}</p>}
          primaryAction={primaryAction}
          secondaryActions={actions}
        />
        {notice}
        <div className="mt-8">
          <InstrumentPanel depth="base">
            <p className="font-fw-sans text-body-sm text-text-secondary">No players on your roster yet.</p>
          </InstrumentPanel>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1536px] px-4 py-6 pb-24 md:px-6 md:py-8">
      {/* ── 1 · MASTHEAD, bare on the canvas ────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className={OVERLINE}>{teamName}</p>
        <div className="flex items-center gap-2">
          {actions}
          {primaryAction}
        </div>
      </div>
      <h1 className="mt-2 font-fw-display text-display font-semibold leading-[1.05] tracking-[-0.02em] text-text-primary">Team Stats.</h1>
      <div className="mt-3">
        <VerdictLine parts={verdict} />
      </div>
      <p className="mt-3 font-fw-mono text-caption tabular-nums text-text-tertiary">
        {vm.rows.length} {vm.rows.length === 1 ? 'player' : 'players'}
        {' · '}
        {formatTeamStatsFreshnessHeadline(freshness)}
      </p>

      {notice}

      {/* ── 2 · THE STAGE, the one Surface ──────────────────────────────── */}
      <Surface elevation="shadow" padding="none" className="mt-10 overflow-hidden">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_15rem] xl:divide-x xl:divide-border-subtle">
          <div className="min-w-0 p-4 md:p-6">
            <div className="min-w-0">
              <p className={OVERLINE}>
                The roster <span aria-hidden="true">·</span> versus {tour}
              </p>
              <h2 className="mt-1 font-fw-display text-h2 font-semibold text-text-primary">Category field</h2>
              <p className="mt-1 max-w-[62ch] font-fw-sans text-body-sm text-text-secondary">
                The team&rsquo;s strokes gained per category on top, the roster&rsquo;s ranks in the same five columns below.
                Bars drop amber below the Tour baseline and rise green above it; darker swatches are stronger. Choose a
                category header to sort the roster by it.
              </p>
            </div>
            <div className="mt-5">
              <CategoryField
                cols={CATEGORY_COLUMNS.map((c) => ({ key: c.key, headerWide: c.headerWide, headerShort: c.headerShort }))}
                teamName="Team"
                teamMeta="Season to date"
                teamCells={teamCells}
                teamNotice={showColdStart ? SG_COLD_START_FULL : undefined}
                domain={domain}
                playerRows={playerRows}
                sort={sort === 'name' ? null : sort}
                onSortChange={(key) => setSort(key as CategoryKey)}
                visibleRows={stageVisible}
                onShowAll={() => setStageVisible(playerRows.length)}
                ariaLabel="Category field by player"
              />
            </div>
          </div>
          {/* Below xl the readouts read first, the way the coach home orders
              them on a phone: the numbers are the glance, the field is what
              you scroll into. At xl they take the rail on the right. */}
          <div className="order-first border-b border-border-subtle p-4 md:p-6 xl:order-none xl:border-b-0">
            <TeamReadouts items={readouts} />
          </div>
        </div>
      </Surface>

      {/* ── 3 · THE LEDGER ROW, bare, hairline-divided ──────────────────── */}
      {/* Spans run even thirds at xl and take their 5/3/4 shape from 2xl, the
          same concession the coach home makes: at 1280 a 3-span column clips
          the names inside it, and rhythm loses to whole words. */}
      <div className="mt-12 grid grid-cols-1 gap-y-10 md:grid-cols-2 md:gap-x-8 xl:grid-cols-12 xl:gap-x-0 xl:gap-y-0 xl:divide-x xl:divide-border-subtle">
        <LedgerColumn title="Where it leaks" className="xl:col-span-4 xl:pr-8 2xl:col-span-5">
          {hasSg ? <LeakList readings={leakRows} domain={domain} tourLabel={tour} /> : <LedgerNote>{SG_COLD_START_FULL}</LedgerNote>}
        </LedgerColumn>

        <LedgerColumn title="Who leads each" className="xl:col-span-4 xl:px-8 2xl:col-span-3">
          {leaders.length === 0 ? (
            <LedgerNote>No category has a ranked player yet.</LedgerNote>
          ) : (
            <LeadersList leaders={leaders} />
          )}
        </LedgerColumn>

        <LedgerColumn title="Fundamentals" className="md:col-span-2 xl:col-span-4 xl:pl-8">
          <FundamentalsList rows={fundamentals} />
          <p className="mt-3 font-fw-sans text-caption text-text-tertiary">
            {fundamentalsKnown
              ? 'Pooled from every recorded opportunity, not averaged player percentages.'
              : 'Fairways, GIR, and scrambling appear once hole outcomes are recorded.'}
          </p>
        </LedgerColumn>
      </div>

      {/* ── 4 · THE TABLE — the values behind the stage's ranks ─────────── */}
      <section aria-label="Category detail" className="mt-12 flex flex-col gap-3">
        <SectionHead title="Category detail" count={vm.rows.length} />
        <CategoryDetailTable rows={sortedRows} />
      </section>

      {/* ── 5 · THE CODA — a different subject: distance bands, not players ─ */}
      <div className="mt-12 grid grid-cols-1 gap-y-10 xl:grid-cols-2 xl:gap-x-0 xl:gap-y-0 xl:divide-x xl:divide-border-subtle">
        <section className="flex min-w-0 flex-col gap-3 xl:pr-8">
          <SectionHead title="Putts made by distance" />
          {/* `ChartFrame` takes `takeaway` for the chart's spoken label only and
              never prints it, so the finding stayed invisible to a coach
              reading the page. State it in words above the plot. */}
          {puttTakeaway ? <p className="font-fw-sans text-body-sm text-text-secondary">{puttTakeaway}</p> : null}
          <LeakMap
            title="Putts made by distance"
            subtitle={`Team make% versus ${tour}${roundsTracked}`}
            takeaway={puttTakeaway}
            data={puttBuckets}
            direction="higher_better"
            unit="percent"
            state={leakMaps && hasPuttSamples ? undefined : 'insufficient-data'}
            stateMessage={leakMaps && hasPuttSamples ? undefined : leakColdStartMessage}
            className="border-0 bg-transparent p-0 [&>header>div>h3]:sr-only"
          />
        </section>
        <section className="flex min-w-0 flex-col gap-3 xl:pl-8">
          <SectionHead title="Approach proximity by distance" />
          {approachTakeaway ? <p className="font-fw-sans text-body-sm text-text-secondary">{approachTakeaway}</p> : null}
          <LeakMap
            title="Approach proximity by distance"
            subtitle={`Average proximity to hole versus ${tour}${roundsTracked}`}
            takeaway={approachTakeaway}
            data={approachBuckets}
            direction="lower_better"
            unit="feet"
            state={leakMaps && hasApproachSamples ? undefined : 'insufficient-data'}
            stateMessage={leakMaps && hasApproachSamples ? undefined : leakColdStartMessage}
            className="border-0 bg-transparent p-0 [&>header>div>h3]:sr-only"
          />
        </section>
      </div>
    </div>
  );
}
