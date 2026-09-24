'use client';

/**
 * ============================================================================
 * Fairway · pages/dashboard · FairwayPlayerDashboard — player Home
 * ----------------------------------------------------------------------------
 * The PLAYER Home at /golf/dashboard. It takes the SAME data the legacy
 * PlayerDashboard took (PlayerDashboardData + PlayerDashboardPayload from
 * dashboard-data.ts) and fetches nothing of its own except the focus-area list
 * (and only when the route did not seed it).
 *
 * Field-sheet layout (W9, 2026-09-24; spec-dashboard-shell §3.1, DASH-01/02):
 *   masthead  → greeting h1 + the one primary action (New round), then ONE
 *               verdict sentence built only from real fields
 *   stage     → RoundStrip: one bar per recent round against the par line,
 *               and a single readout row (Avg · Best · Putts · GIR) under it
 *   ledger    → Today and Focus areas as hairline rows, side by side from md
 *   table     → Recent rounds, then "Your game" links
 *
 * Removed, and why:
 *   • 8 KPI tiles + the trend chart in a card: about four phone screens for
 *     numbers the strip and one readout row now carry.
 *   • The strokes-gained radar teaser and the CoachHelm insight teaser
 *     (owner decision OD-08: "Remove, and link to Game"). The radar was
 *     unreadable at phone size and the teaser truncated its values (NUM-38).
 *     "Your game" links to the Game profile instead.
 *   • The ellipsized tagline under the h1: the verdict replaces it.
 *   • The cold-start feature-preview grid: one first-round empty state.
 *
 * Kept on purpose (not approved for removal): the swipe calendar, the latest
 * notifications module, and a link to My Standing.
 *
 * Renders inside the `.fairway-ds` scope on `bg-canvas`.
 * ========================================================================== */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';

// Leaf-path imports, not the `@/components/fairway` barrel: this file is
// re-exported from that barrel, so importing it back is a cycle.
import { ViewHeader } from '@/components/fairway/view-header';
import { useLargeTitle } from '@/components/fairway/app-shell/LargeTitleContext';
import { Button } from '@/components/fairway/controls';
import { InlineNotice, EmptyState } from '@/components/fairway/feedback';
import { RoundStrip, type RoundStripPoint } from '@/components/fairway/modules/RoundStrip';
import { fairwayScope } from '@/lib/redesign/flag';
import { getGreeting, getTimeOfDay } from '@/lib/utils/time-of-day';
import { cleanCourseName } from '@/lib/golf/course-name';
import { surfaceHref } from '@/lib/golf/surface-registry';
import {
  formatMetric,
  formatMetricText,
  formatSample,
  type FormattedMetric,
} from '@/lib/golf/metrics/display-registry';
import { PlayerFocusAreas } from '@/components/golf/coachhelm/insights';
import type {
  PlayerDashboardPayload,
  StrokesGainedSnapshot,
  TodayEvent,
} from '@/app/golf/actions/dashboard-data';
import type { GolfPlayer, GolfTeam } from '@/lib/types/golf';
import type { PlayerHubSummaryData } from '@/app/golf/actions/player-hub-data';
import type { PlayerFocusArea } from '@/lib/coachhelm/insight-types';

import { SectionTitle, TodayCard, RecentRoundsList, GameLinks } from './player-dashboard-parts';
import { type DayScheduleEvent } from './DaySchedule';
import { DayScheduleSwipe } from './DayScheduleSwipe';
import { NotificationsLatestModule } from '@/components/fairway/notifications';

/* ─────────────────────────────────────────────────────────────────────────
 * Props — the legacy PlayerDashboard data shape.
 * ──────────────────────────────────────────────────────────────────────── */

export interface PlayerDashboardData {
  player: GolfPlayer;
  team: GolfTeam | null;
  stats: {
    roundsPlayed: number;
    scoringAverage: number | null;
    bestRound: number | null;
    handicap: number | null;
    recentTrend?: 'improving' | 'declining' | 'stable';
  };
  recentRounds: Array<{
    id: string;
    course_name: string;
    total_score: number;
    total_to_par: number;
    round_date: string;
  }>;
}

interface FairwayPlayerDashboardProps {
  data: PlayerDashboardData;
  enhancedData?: PlayerDashboardPayload | null;
  /**
   * The former Hub's triage data. Its only remaining use here was the
   * CoachHelm insight teaser, removed by OD-08; the route still passes it and
   * it is accepted so the route contract does not change.
   */
  hubData?: PlayerHubSummaryData | null;
  /**
   * The time-of-day greeting phrase ("Good morning" / "Welcome back"), resolved
   * SERVER-side in the team's timezone, so the <h1> is settled at first paint.
   * Omit it and the effect fallback in the body runs off the browser clock.
   */
  greeting?: string;
  /**
   * PERF-03: the player's active focus areas, read on the server. When given,
   * the Focus list renders at first paint and skips its post-hydration
   * server action.
   */
  initialFocusAreas?: PlayerFocusArea[] | null;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Verdict — one sentence, built only from fields the payload really has.
 * ──────────────────────────────────────────────────────────────────────── */

const SG_AREAS: Array<{ id: string; key: keyof StrokesGainedSnapshot; prose: string }> = [
  { id: 'sg_ott', key: 'sg_off_tee', prose: 'off the tee' },
  { id: 'sg_approach', key: 'sg_approach', prose: 'on approach' },
  { id: 'sg_around_green', key: 'sg_around_green', prose: 'around the green' },
  { id: 'sg_putting', key: 'sg_putting', prose: 'putting' },
];

export interface HomeVerdictInput {
  roundsCounted: number;
  scoringAverage: number | null | undefined;
  trend?: 'improving' | 'declining' | 'stable';
  strokesGained?: StrokesGainedSnapshot | null;
}

/**
 * "12 rounds counted. Scoring average 76.4, scores trending down. Biggest
 * leak: putting (−0.83 strokes a round)." Each clause is dropped when its
 * field is missing; `null` when there is nothing true to say.
 */
export function buildHomeVerdict({
  roundsCounted,
  scoringAverage,
  trend,
  strokesGained,
}: HomeVerdictInput): string | null {
  if (roundsCounted <= 0) return null;
  const clauses: string[] = [`${formatSample(roundsCounted, ['round', 'rounds'])} counted.`];

  const avg = formatMetric('scoring_average', scoringAverage);
  if (!avg.missing) {
    const trendClause =
      trend === 'improving'
        ? ', scores trending down'
        : trend === 'declining'
          ? ', scores trending up'
          : trend === 'stable'
            ? ', holding steady'
            : '';
    clauses.push(`Scoring average ${avg.text}${trendClause}.`);
  }

  if (strokesGained) {
    const known = SG_AREAS.map((a) => ({ ...a, value: strokesGained[a.key] })).filter(
      (a): a is (typeof a) & { value: number } => typeof a.value === 'number' && Number.isFinite(a.value),
    );
    // Name a leak only with 3+ areas measured and a real negative.
    if (known.length >= 3) {
      const worst = known.reduce((a, b) => (b.value < a.value ? b : a));
      if (worst.value < 0) {
        clauses.push(
          `Biggest leak: ${worst.prose} (${formatMetricText(worst.id, worst.value)} strokes a round).`,
        );
      }
    }
  }
  return clauses.join(' ');
}

/* ─────────────────────────────────────────────────────────────────────────
 * Readout — one figure of the row under the stage. A value that cannot be
 * shown says why ("Needs 2 more rounds"), never a bare dash (STATE-03).
 * ──────────────────────────────────────────────────────────────────────── */

function Readout({ caption, metric }: { caption: string; metric: FormattedMetric }) {
  const note = metric.missing ? (metric.qualityNote ?? 'No data yet') : metric.qualityNote;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="font-fw-sans text-caption text-text-secondary">{caption}</dt>
      <dd className="m-0">
        <span className="sr-only">{metric.ariaLabel}</span>
        <span aria-hidden="true" className="block font-fw-sans text-h3 font-semibold text-text-primary tabular-nums">
          {metric.text}
        </span>
        {note ? (
          <span aria-hidden="true" className="block font-fw-sans text-caption text-text-secondary">
            {note}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Component
 * ──────────────────────────────────────────────────────────────────────── */

export function FairwayPlayerDashboard({
  data,
  enhancedData,
  greeting: serverGreeting,
  initialFocusAreas,
}: FairwayPlayerDashboardProps) {
  const { player, team, stats, recentRounds } = data;
  const firstName = player.first_name?.trim() || 'there';

  // The greeting is server-resolved (see `greeting`); this effect is only the
  // fallback for callers that do not pass it.
  const [clientTimeWord, setClientTimeWord] = useState<string | null>(null);
  useEffect(() => {
    if (serverGreeting) return;
    setClientTimeWord(getGreeting(getTimeOfDay()));
  }, [serverGreeting]);
  const timeWord = serverGreeting ?? clientTimeWord ?? 'Welcome back';
  // The greeting is this page's large title: register it so the nav bar
  // shows it (not "Home") once it scrolls away (DASH-05).
  const greeting = `${timeWord}, ${firstName}`;
  const { setRegisteredTitle } = useLargeTitle();
  useEffect(() => {
    setRegisteredTitle(greeting);
    return () => setRegisteredTitle(null);
  }, [greeting, setRegisteredTitle]);

  const hasRounds = stats.roundsPlayed > 0;
  const sparklines = enhancedData?.sparklines;
  const roundsCounted = enhancedData?.stats.scoringAverageRounds ?? stats.roundsPlayed;
  const scoringAverage = sparklines?.scoringAvg.value ?? stats.scoringAverage;
  const bestRound = enhancedData?.secondaryStats.bestRound ?? stats.bestRound;

  const verdict = useMemo(
    () =>
      buildHomeVerdict({
        roundsCounted,
        scoringAverage,
        trend: sparklines?.scoringAvg.trend ?? stats.recentTrend,
        strokesGained: enhancedData?.strokesGained,
      }),
    [roundsCounted, scoringAverage, sparklines?.scoringAvg.trend, stats.recentTrend, enhancedData?.strokesGained],
  );

  // The payload carries the latest rounds newest-first; the strip reads
  // oldest → newest.
  const stripPoints = useMemo<RoundStripPoint[]>(
    () =>
      [...recentRounds].reverse().map((r) => ({
        id: r.id,
        date: r.round_date,
        toPar: r.total_to_par,
        score: r.total_score,
        courseName: cleanCourseName(r.course_name) || null,
        href: `/golf/dashboard/rounds/${r.id}/review`,
      })),
    [recentRounds],
  );

  const readouts = useMemo(
    () => [
      { caption: 'Scoring avg', metric: formatMetric('scoring_average', scoringAverage, { sample: roundsCounted }) },
      { caption: 'Best round', metric: formatMetric('best_round', bestRound, { sample: roundsCounted }) },
      {
        caption: 'Putts / round',
        metric: formatMetric('putts_per_round', sparklines?.puttsPerRound.value, { sample: roundsCounted }),
      },
      { caption: 'GIR', metric: formatMetric('gir_pct', sparklines?.girPct.value, { sample: roundsCounted }) },
    ],
    [scoringAverage, bestRound, roundsCounted, sparklines?.puttsPerRound.value, sparklines?.girPct.value],
  );

  // DaySchedule feed: today's events + upcoming, deduped by id. Both arrays
  // come from the same `golf_events` read in dashboard-data.ts.
  const scheduleEvents = useMemo<DayScheduleEvent[]>(() => {
    const toScheduleEvent = (e: TodayEvent): DayScheduleEvent => ({
      id: e.id,
      title: e.title,
      event_type: e.event_type,
      start_time: e.start_time,
      end_time: e.end_time,
      location: e.location,
    });
    const merged = new Map<string, DayScheduleEvent>();
    for (const e of enhancedData?.todayEvents ?? []) merged.set(e.id, toScheduleEvent(e));
    for (const e of enhancedData?.upcomingEvents ?? []) {
      if (!merged.has(e.id)) merged.set(e.id, toScheduleEvent(e));
    }
    return Array.from(merged.values());
  }, [enhancedData?.todayEvents, enhancedData?.upcomingEvents]);

  const gameLinks = useMemo(
    () => [
      {
        href: surfaceHref('my-game-profile-tab'),
        title: 'Your game',
        detail: 'Strokes gained by area, strengths and leaks',
      },
      {
        href: surfaceHref('my-standing-tab'),
        title: 'My Standing',
        detail: 'Every metric against your team and the Tour',
      },
    ],
    [],
  );

  const newRoundCta = (
    <Button asChild variant="primary" leftIcon={<Plus className="h-4 w-4" />}>
      <Link href="/golf/dashboard/rounds/new">New round</Link>
    </Button>
  );

  const focusSection = (
    <section aria-labelledby="home-focus-title">
      <SectionTitle id="home-focus-title" action={{ label: 'My development', href: '/golf/dashboard/coachhelm?view=development' }}>
        Focus areas
      </SectionTitle>
      {/* No card around the list: each focus area is already its own card. */}
      <PlayerFocusAreas playerId={player.id} initialFocusAreas={initialFocusAreas} />
    </section>
  );

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      {/* overflow-x-clip (not hidden): no wide child can stretch the page past
          a phone viewport, and sticky still works (#957). */}
      <div className="mx-auto w-full max-w-[1200px] overflow-x-clip px-6 py-8 md:px-12 md:py-12">
        {/* The plinth and `disableAnimation` keep this masthead on the same
            pixels as the shared pre-role skeleton (FairwayDashboardSkeleton). */}
        <ViewHeader
          plinth
          disableAnimation
          eyebrow={team?.name ?? 'Your team'}
          title={greeting}
          primaryAction={hasRounds ? newRoundCta : undefined}
          className="mb-6 md:mb-8"
        />

        {!team ? (
          <div className="mb-8">
            <InlineNotice
              tone="info"
              title="Join your team"
              action={
                <Button asChild variant="secondary" size="sm">
                  <Link href="/golf/dashboard/settings">Enter code</Link>
                </Button>
              }
            >
              Drop in the invite code from your coach to unlock schedules,
              qualifiers, and CoachHelm insights.
            </InlineNotice>
          </div>
        ) : null}

        {/* The team's schedule does not depend on the player's round count,
            so it renders for every player, rounds or not. */}
        <DayScheduleSwipe
          events={scheduleEvents}
          timezone={enhancedData?.timezone}
          viewAllHref="/golf/dashboard/calendar"
        />

        {!hasRounds ? (
          <div className="flex flex-col gap-10">
            <EmptyState
              title="Log your first round"
              description="Strokes gained, your scoring average and your trends all start with one round. Three minutes, hole by hole."
              action={
                <Button asChild variant="primary" leftIcon={<Plus className="h-4 w-4" />}>
                  <Link href="/golf/dashboard/rounds/new">Submit your first round</Link>
                </Button>
              }
            />
            {focusSection}
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            {/* ── Stage: verdict, the round strip, one readout row ─────────── */}
            <section aria-labelledby="home-form-title" className="flex flex-col gap-4">
              {verdict ? (
                <p className="max-w-[60ch] font-fw-sans text-body-lg text-text-primary">{verdict}</p>
              ) : null}
              <SectionTitle id="home-form-title" action={{ label: 'All rounds', href: '/golf/dashboard/rounds' }}>
                {`Last ${stripPoints.length} round${stripPoints.length === 1 ? '' : 's'}`}
              </SectionTitle>
              <RoundStrip
                points={stripPoints}
                label={`Last ${stripPoints.length} rounds, score to par`}
                height={160}
              />
              <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border-subtle pt-4 sm:grid-cols-4">
                {readouts.map((r) => (
                  <Readout key={r.caption} caption={r.caption} metric={r.metric} />
                ))}
              </dl>
              <p className="font-fw-sans text-caption text-text-secondary">
                Averages cover {formatSample(roundsCounted, ['counted round', 'counted rounds'])}.{' '}
                <Link
                  href="/golf/dashboard/stats"
                  className="font-medium text-accent-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  All stats
                </Link>
              </p>
            </section>

            {/* ── Ledger: Today beside Focus areas ─────────────────────────── */}
            <div className="grid grid-cols-1 gap-10 md:grid-cols-12 md:gap-8">
              <div className="md:col-span-7">
                <TodayCard
                  events={enhancedData?.todayEvents ?? []}
                  actionItems={enhancedData?.actionItems ?? []}
                  timezone={enhancedData?.timezone}
                />
              </div>
              <div className="md:col-span-5">{focusSection}</div>
            </div>

            {/* Latest notifications: self-fetching, renders nothing when
                there is nothing new. */}
            <NotificationsLatestModule />

            {/* ── Table: recent rounds, then where the rest of the game lives ─ */}
            <section aria-labelledby="home-rounds-title">
              <SectionTitle id="home-rounds-title" action={{ label: 'View all', href: '/golf/dashboard/rounds' }}>
                Recent rounds
              </SectionTitle>
              <RecentRoundsList rounds={recentRounds} />
            </section>

            <section aria-labelledby="home-game-title">
              <SectionTitle id="home-game-title">Your game</SectionTitle>
              <GameLinks links={gameLinks} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
