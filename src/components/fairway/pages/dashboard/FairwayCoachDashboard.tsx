'use client';

/**
 * ============================================================================
 * Fairway · pages/dashboard · FairwayCoachDashboard  (ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * The warm "Fairway" rebuild of the coach /golf/dashboard — a calm executive
 * command center. This is a PRESENTATION + LAYOUT + ORGANIZATION rebuild only:
 * it accepts the EXACT same props the existing `CoachDashboard` receives
 * (`data` / `enhancedData` / `dateRange` from `dashboard-data.ts`) and reuses
 * every value unchanged. No data fetching, no server actions, no mutations are
 * defined or altered here.
 *
 * Architecture reorganization vs the legacy CoachDashboard (per
 * dashboard-home.json coach entry):
 *   • ONE <h1> — a single ViewHeader (Fraunces greeting) replaces the stacked
 *     LargeTitleHeader + PageHeader plinth double-h1 (a11y mustFix).
 *   • Quick actions PROMOTED out of the page bottom into the ViewHeader action
 *     cluster (Add Player primary · Schedule / Qualifiers secondary — verb/view
 *     labels that match their list destinations) as ONE shared Button vocabulary
 *     — no `.pill-soft`-on-Button, no bespoke Links.
 *   • Date range is a quiet Segmented control in a calm toolbar band (preserves
 *     the ?range router.push contract — logic unchanged).
 *   • Team KPIs are one "Team performance" card of four hairline-divided
 *     cells (TeamKpiCell) that show honest insufficient-data when round
 *     coverage is low (never authoritative zeros, data-gap:medium).
 *   • Recent Rounds becomes a clean DataTable; Performance Trend + Team Pulse +
 *     Top Performers collapse into one calm "Team" region on matte Surfaces.
 *   • Coach-without-team becomes an OnboardingStep funnel, not a zeroed page.
 *
 * Rendered inside the `.fairway-ds` scope on `bg-canvas`. Every content card is
 * matte. Single h1; slow
 * cinematic motion via the primitives' own reveal (honors reduced motion).
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLargeTitle } from '@/components/fairway/app-shell/LargeTitleContext';
import Link from 'next/link';
import nextDynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { Row } from '@tanstack/react-table';
import {
  ViewHeader,
  Surface,
  Inset,
  DataTable,
  Segmented,
  Button,
  StatusPill,
  Avatar,
  AvatarGroup,
  InlineNotice,
  EmptyState,
  InsufficientData,
  OnboardingStep,
  OnboardingSteps,
  Skeleton,
  type ColumnDef,
  type TrendPoint,
} from '@/components/fairway';
import { TeamKpiCell, windowLabel } from './TeamKpiCell';
// The ONE series→delta→verdict reducer (AUDIT-0724 findings #2/#6/#7) — feeds
// BOTH a KPI cell's delta chip AND its Sparkline's `direction` prop from a
// single call, so the two can never classify the same series two different
// ways again. Direct-file import (not the barrel) mirrors how MetricCard
// imports its trend classifier.
import { computeSeriesTrend } from '@/components/fairway/charts/seriesTrend';
import {
  IconUsers,
  IconCalendar,
  IconFlag,
  IconChartBar,
  IconPlus,
  IconGolf,
  IconTarget,
  IconArrowRight,
  IconClock,
  IconMapPin,
} from '@/components/icons';
import { formatTimeInTz, getCurrentDecimalHourInTz } from '@/lib/utils/timezone';
import { getGreeting, timeOfDayForHour } from '@/lib/utils/time-of-day';
import {
  Flag as LucideFlag,
  Calendar as LucideCalendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FairwayJoinRequestAlert } from '@/components/fairway/pages/roster/FairwayJoinRequestAlert';
import { NotificationsLatestModule } from '@/components/fairway/notifications';
import type { UnifiedNotificationItem } from '@/app/golf/actions/unified-notifications-model';
import type { JoinRequestData } from '@/app/golf/actions/teams';
import type {
  CoachDashboardPayload,
  DashboardDateRange,
  TodayEvent,
} from '@/app/golf/actions/dashboard-data';
import type { CoachDashboardData } from '@/app/golf/(dashboard)/dashboard/components/coach-dashboard-types';
import { formatToPar } from '@/lib/golf/format-to-par';
import { formatMetricText } from '@/lib/golf/metrics/display-registry';
import { competitionRankLabels } from '@/lib/golf/tie-rank';

/** Round to 1 dp as a number (NumberFlow values), no string step. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** CHART-R1: integer ticks print as integers ("80", not "80.0"); others at 1 dp. */
function trendValue(v: number): string {
  return Number.isInteger(v) ? String(v) : formatMetricText('scoring_average', v);
}

// Fairway TrendChart, lazy + ssr:false (mirrors FairwayPlayerDashboard's
// Scoring Trend chart). recharts' ResponsiveContainer has no real size to
// measure during SSR and falls back to a 1px-wide render; on hydration the
// container is then re-measured and the chart re-renders at its real width.
// That resize forces the Area/Line's entrance reveal (a clip-path keyed off
// the computed on-screen points, so any recompute at a new width restarts it)
// back to its 0%-revealed start — the axes/gridlines aren't animated so they
// still draw, but the trend line itself never got a chance to finish drawing.
// Skipping SSR for this chart avoids that guaranteed first-load resize.
const TrendChart = nextDynamic(
  () => import('@/components/fairway').then((m) => ({ default: m.TrendChart })),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[240px] w-full rounded-card" />,
  },
);

/* ──────────────────────────────────────────────────────────────────────────
 * Props — identical contract to the legacy CoachDashboard
 * ────────────────────────────────────────────────────────────────────────── */

export interface FairwayCoachDashboardProps {
  data: CoachDashboardData;
  /** PERF-03: the Latest module's items, read on the server. */
  initialLatestNotifications?: UnifiedNotificationItem[];
  enhancedData?: CoachDashboardPayload | null;
  dateRange?: DashboardDateRange;
  /**
   * Pending team join requests, fetched server-side by the RSC page (same
   * `getTeamJoinRequests()` call the banner used to make itself on mount) and
   * passed down as a prop. Rendering from a prop the banner already has at
   * first paint means it never has to flip in after a client fetch — no
   * reflow of the content below it once the page hydrates. Omit to fall back
   * to FairwayJoinRequestAlert's own self-fetch (kept for any other caller).
   */
  joinRequests?: JoinRequestData[];
  /**
   * The time-of-day greeting phrase ("Good morning" / "Welcome back"),
   * resolved SERVER-side in the team's timezone by the RSC page.
   *
   * This used to be derived in a `useEffect` here, seeded with a time-neutral
   * "Welcome back". That meant the <h1> — the largest text on the page —
   * visibly rewrote itself on every single load, a beat after first paint.
   * The server already knows the team timezone (it is the same value that
   * arrives as `enhancedData.timezone`), so it can resolve the phrase once and
   * hand it over settled. Omit it and the effect fallback below still runs,
   * for any caller that has not wired the prop.
   */
  greeting?: string;
  /**
   * Today's date, pre-formatted in the team's timezone by the RSC page (e.g.
   * "Tuesday, July 28"). Server-formatted for the same reason as `greeting`:
   * an `Intl` call on the client would disagree with the server's markup for
   * anyone not sitting in the team's timezone.
   */
  todayLabel?: string;
}

const RANGE_OPTIONS: { value: DashboardDateRange; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'season', label: 'Season' },
  { value: 'all', label: 'All' },
];

/* ──────────────────────────────────────────────────────────────────────────
 * Recent-round row shape (from the existing data contract)
 * ────────────────────────────────────────────────────────────────────────── */

type RoundRow = CoachDashboardData['recentRounds'][number];

// formatToPar consolidated onto @/lib/golf/format-to-par (see
// src/test/schema/format-to-par-single-source.test.ts). Ten copies existed;
// four rendered the ASCII hyphen where the rest render U+2212, so the same
// score changed glyph between adjacent screens and broke tabular alignment.

/** Title-case a course name that may have been entered in all-lowercase.
 *  Preserves existing uppercase letters (e.g. "TPC", "GC", "No."),
 *  so it is safe to run on already-cased strings. */
function toTitleCase(name: string): string {
  const MINOR = new Set(['a', 'an', 'the', 'at', 'by', 'for', 'in', 'of', 'on', 'to', 'up', 'and', 'as', 'but', 'or', 'nor']);
  return name
    .trim()
    .split(' ')
    .map((word, i) => {
      if (!word) return word;
      // If the word is already mixed-case (has any uppercase), leave it alone
      if (word !== word.toLowerCase()) return word;
      if (i > 0 && MINOR.has(word.toLowerCase())) return word.toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function shortDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Pin to UTC: round_date is a date-only column, so format it the same on the
  // server and the client to avoid a hydration mismatch (React #418) and an
  // off-by-one day for clients west of UTC.
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * The Team performance card's footer caption: how many counted rounds the
 * figures cover, and what the delta chips measure. Said once for the card.
 *
 * The chips are an honest windowed delta + verdict over each metric's
 * sparkline series (oldest → newest).
 * `computeSeriesTrend()` (charts/seriesTrend.ts) is the SAME split-half-
 * average comparison `computeTrend()`/`computeTrendHigherIsBetter()` already
 * use server-side (dashboard-data.ts) to classify the qualitative trend
 * arrow — recent-half average vs. older-half average — not a raw
 * first-vs-last endpoint diff.
 *
 * AUDIT-0724 finding #2: this dashboard used to compute this locally (via a
 * duplicated `seriesDelta()`) and hand ONLY the numeric `.value` to the
 * MetricCard delta chip, while `<Sparkline>` classified the SAME raw series
 * on its own via endpoint diff — the GIR% card [61,78,72,50,61] rendered a
 * "flat" sparkline next to a red "declining" chip because the two widgets
 * were never told about each other's math. Now the ONE `computeSeriesTrend()`
 * call below feeds both: `.value` → the delta chip, `.direction` → the
 * Sparkline's `direction` prop (overriding its own internal classification),
 * so they can only ever agree.
 *
 * Requires ≥3 finite points (mirrors this page's own "Need 3+ rounds"
 * honesty gate) — fewer than that suppresses the chip entirely rather than
 * showing an unreliable 2-point comparison. This is the only numeric
 * movement the dashboard payload supports client-side — the payload's
 * `trend` field is a qualitative direction, not a magnitude.
 *
 * The chip is the movement across each player's own latest rounds, averaged
 * (buildPerPlayerSparkline), while the figure beside it covers the whole
 * window. This caption says so ONCE, instead of repeating "players' last 5
 * rounds" under every cell.
 */
function deltaWindowCaption(roundsLogged: number, points: number | null): string {
  const rounds = `${roundsLogged} counted ${roundsLogged === 1 ? 'round' : 'rounds'} in this window`;
  if (points == null) return rounds;
  return `${rounds} · Change across each player’s last ${points} ${points === 1 ? 'round' : 'rounds'}`;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function FairwayCoachDashboard({
  data,
  initialLatestNotifications,
  enhancedData,
  dateRange: initialRange = 'all',
  joinRequests,
  greeting: serverGreeting,
  todayLabel,
}: FairwayCoachDashboardProps) {
  const { coach, team, stats, recentRounds, topPlayers, teamScoringTrend } = data;
  /**
   * A read behind the team KPIs failed — the roster fetch or either round
   * fetch. Distinguishes "this team has no rounds" from "we could not read this
   * team's rounds", which otherwise render as the same screen. Mirrors the
   * existing `todayScheduleError` contract.
   */
  const teamStatsUnavailable = enhancedData?.teamStatsUnavailable ?? false;
  const router = useRouter();

  const [range, setRange] = useState<DashboardDateRange>(initialRange);

  // P012: keep the Segmented's selected segment in lock-step with the URL/data.
  // `?range` is a search param, so the route template (keyed by pathname) does
  // NOT remount on Back/Forward — the server re-fetches with the new
  // `initialRange` but local `range` would otherwise stay on the previously
  // clicked value, leaving the highlighted segment disagreeing with the data.
  // Re-seeding from the prop on every change resyncs the indicator.
  useEffect(() => {
    setRange(initialRange);
  }, [initialRange]);

  const firstName = coach.full_name?.split(' ')[0] || 'Coach';

  // Time-aware greeting (P008). The fixed "Good day" was subtly wrong all day.
  //
  // The phrase is resolved SERVER-side now (see the `greeting` prop) and used
  // verbatim, so the <h1> is correct in the team's timezone from the very first
  // painted byte. Previously this ran as a post-mount effect seeded with a
  // time-neutral "Welcome back", which meant the biggest text on the page
  // rewrote itself a beat after paint on every load — one of the "it renders,
  // then fidgets and starts again" symptoms, sitting on the one element the eye
  // is already fixed on.
  //
  // The effect below is now a FALLBACK ONLY: it runs when a caller has not
  // wired the prop, and is skipped entirely (no state write, no swap) when the
  // server has already settled the phrase.
  const tzForGreeting = enhancedData?.timezone;
  const [clientGreeting, setClientGreeting] = useState<string | null>(null);
  useEffect(() => {
    if (serverGreeting) return; // server resolved it — never rewrite the h1
    const tz = tzForGreeting || Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      const hour = getCurrentDecimalHourInTz(tz);
      // #950 — the old `< 12` morning / `< 17` afternoon / else evening
      // scheme called 1am "Good morning, {name}". timeOfDayForHour applies
      // the same sane 4-bucket scheme (incl. a "Welcome back" late-night
      // bucket) that src/lib/utils/time-of-day.ts and src/lib/entry/
      // greeting.ts already use.
      setClientGreeting(getGreeting(timeOfDayForHour(hour)));
    } catch {
      // Intl/timezone unavailable — keep the time-neutral welcome.
      setClientGreeting('Welcome back');
    }
  }, [serverGreeting, tzForGreeting]);

  const greeting = `${serverGreeting ?? clientGreeting ?? 'Welcome back'}, ${firstName}`;
  // The greeting is this page's large title (DASH-05): the nav bar shows it
  // once it scrolls away instead of the generic "Home".
  const { setRegisteredTitle } = useLargeTitle();
  useEffect(() => {
    setRegisteredTitle(greeting);
    return () => setRegisteredTitle(null);
  }, [greeting, setRegisteredTitle]);

  // PRESERVED LOGIC: range change keeps the force-dynamic ?range re-fetch
  // contract (router.push). Presentation is calm; the contract is unchanged.
  const handleRangeChange = useCallback(
    (next: string) => {
      const value = next as DashboardDateRange;
      setRange(value);
      router.push(value === 'all' ? '/golf/dashboard' : `/golf/dashboard?range=${value}`);
    },
    [router],
  );

  const hasTrend = !!teamScoringTrend && teamScoringTrend.length >= 2;
  // Memoized: TrendChart's Area/Line animate in on mount (isAnimationActive).
  // Recomputing a brand-new array/object graph on every render (this
  // component re-renders at least once post-mount, from the greeting effect
  // above) hands Recharts a new `data` identity each time, which can restart
  // the draw-on animation before it ever finishes. A stable reference lets it
  // draw once and stay drawn. (Hook lives above the coach-without-team early
  // return below — it must run on every render, team or not.)
  const trendPoints: TrendPoint[] = useMemo(
    () => (hasTrend ? teamScoringTrend!.map((p) => ({ x: p.label, y: p.value })) : []),
    [hasTrend, teamScoringTrend],
  );

  // ── COACH-WITHOUT-TEAM → onboarding funnel (not a zeroed dashboard) ──────
  if (!team) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-10 md:px-8 md:py-14">
        <ViewHeader
          eyebrow="Coach Dashboard"
          title={`Welcome, ${firstName}`}
          description="Create or join a team to unlock your roster, calendar, qualifiers and the CoachHelm intelligence layer."
        />
        <Surface elevation="border" padding="lg">
          <OnboardingSteps label="Get your team set up">
            <OnboardingStep
              index={1}
              status="active"
              title="Create or join a team"
              description="Set up your program so rounds, events and stats have a home."
              action={
                <Button variant="primary" size="sm" asChild>
                  <Link href="/golf/dashboard/team">Set up team</Link>
                </Button>
              }
            />
            <OnboardingStep
              index={2}
              status="upcoming"
              title="Invite your roster"
              description="Share a join code so players can log rounds."
            />
            <OnboardingStep
              index={3}
              status="upcoming"
              title="Log the first rounds"
              description="CoachHelm starts surfacing signals as activity builds."
              hasConnector={false}
            />
          </OnboardingSteps>
        </Surface>
      </div>
    );
  }

  // ── Honest KPI coverage gate (data-gap:medium) ───────────────────────────
  // Team aggregates are only trustworthy once a few players have rounds. Use
  // the real value when present; otherwise show insufficient-data, NEVER a
  // zero presented as a real team number.
  const roundsLogged = recentRounds.length;
  // Name → avatar for the Latest feed, from the players this page already has.
  const peopleAvatars: Record<string, string | null> = {};
  for (const r of recentRounds) {
    const key = r.player_name?.toLowerCase();
    if (key && !peopleAvatars[key]) peopleAvatars[key] = r.player_avatar_url ?? null;
  }
  const scoringAvg = enhancedData?.sparklines.scoringAvg.value ?? stats.teamScoringAverage;
  const girValue = enhancedData?.sparklines.girPct.value ?? null;
  const puttsValue = enhancedData?.sparklines.puttsPerRound.value ?? null;

  // KPI micro-trends (F045/F046): the payload already holds a per-metric series
  // (oldest → newest) + a qualitative direction. Render the series as a quiet
  // Sparkline and the honest split-half movement as the cell's delta chip.
  const scoringSeries = enhancedData?.sparklines.scoringAvg.sparkline ?? [];
  const girSeries = enhancedData?.sparklines.girPct.sparkline ?? [];
  const puttsSeries = enhancedData?.sparklines.puttsPerRound.sparkline ?? [];
  // goodDirection matches each metric's own <Sparkline goodDirection=...> a
  // few lines down (down for scoring/putts, up for GIR%) — same input, same
  // options, ONE function, so the chip and the sparkline it sits next to
  // can never disagree (AUDIT-0724 #2).
  const scoringDelta = computeSeriesTrend(scoringSeries, { goodDirection: 'down' });
  const girDelta = computeSeriesTrend(girSeries, { goodDirection: 'up' });
  const puttsDelta = computeSeriesTrend(puttsSeries, { goodDirection: 'down' });

  // Null-metric copy for the Team performance cells. A failed read is not
  // "not enough rounds": say which one it is (P009 honesty rule).
  const kpiEmpty = teamStatsUnavailable
    ? { message: 'Couldn’t load', footnote: 'Refresh to try again' }
    : { message: 'Need 3+ rounds', footnote: `${roundsLogged} of 3 rounds` };

  // The footer caption, said once for the whole card. The round count is only
  // meaningful when rounds exist and the read succeeded; the "change" half
  // names a round count only when every chip on the card used the same one.
  const deltaPoints = Array.from(
    new Set([scoringDelta, girDelta, puttsDelta].flatMap((d) => (d ? [d.points] : []))),
  );
  const kpiCaption =
    !teamStatsUnavailable && roundsLogged > 0
      ? deltaWindowCaption(roundsLogged, deltaPoints.length === 1 ? deltaPoints[0]! : null)
      : null;

  // Faces for the Roster cell: the players with counted rounds in this window,
  // most recently active first. `recentRounds` is every counted round in the
  // window (paginated server-side, not just the 8 the table shows), so this is
  // exactly "who has played", never presented as the whole roster.
  const playersWithRounds: Array<{ id: string; name: string; avatarUrl: string | null }> = [];
  const seenPlayers = new Set<string>();
  for (const r of recentRounds) {
    if (seenPlayers.has(r.player_id)) continue;
    seenPlayers.add(r.player_id);
    playersWithRounds.push({ id: r.player_id, name: r.player_name, avatarUrl: r.player_avatar_url });
  }
  const rosterFootnote =
    [
      playersWithRounds.length > 0 ? `${playersWithRounds.length} with rounds` : null,
      stats.activeQualifiers != null && stats.activeQualifiers > 0
        ? `${stats.activeQualifiers} active ${stats.activeQualifiers === 1 ? 'qualifier' : 'qualifiers'}`
        : null,
    ]
      .filter(Boolean)
      .join(' · ') || undefined;

  const trendFirst = trendPoints[0];
  const trendLast = trendPoints[trendPoints.length - 1];
  // Only surface a directional takeaway when the swing clears noise (>= 0.75
  // strokes). A sub-noise drift (e.g. 76.3 → 76.0) reads as flat, not a trend.
  const trendTakeaway =
    trendFirst && trendLast && Math.abs(trendLast.y - trendFirst.y) >= 0.75
      ? trendLast.y < trendFirst.y
        ? 'Trending lower — the team is scoring better over the window.'
        : 'Scoring average has drifted up over the window.'
      : undefined;

  // An unknown roster size (the count query failed) must not be treated as a
  // small roster — that would tell a coach with a full squad to go invite
  // players. Both notices stay hidden until we actually know the number.
  const rosterFull =
    !!team.join_code && team.join_code !== 'DEMO01' && stats.rosterSize != null && stats.rosterSize >= 20;

  // Recent-rounds DataTable columns
  const roundColumns: ColumnDef<RoundRow, unknown>[] = [
    {
      accessorKey: 'player_name',
      header: 'Player',
      // A real floor (not just min-w-0 below) — see the DataTable comment on
      // `meta.minWidth`: without it, this column's near-zero min-content (the
      // name truncates) let the auto-layout table starve it down to a couple
      // characters on a phone while the numeric Score/To Par/Date columns kept
      // their natural width (audit W1 — mobile name-trunc).
      meta: { noWrap: true, minWidth: 160 },
      cell: (ctx) => {
        const row = ctx.row.original;
        return (
          <span className="flex min-w-0 items-center gap-2.5">
            <Avatar decorative
              name={row.player_name}
              src={row.player_avatar_url}
              size="md"
              className="shrink-0"
            />
            <span className="min-w-0 flex-1 truncate font-semibold text-text-primary">
              {row.player_name}
            </span>
          </span>
        );
      },
    },
    {
      accessorKey: 'course_name',
      header: 'Course',
      meta: { noWrap: true, minWidth: 120 },
      cell: (ctx) => (
        <span className="block truncate text-text-secondary">
          {toTitleCase(ctx.getValue() as string)}
        </span>
      ),
    },
    {
      accessorKey: 'total_score',
      header: 'Score',
      meta: { align: 'right', numeric: true },
      cell: (ctx) => (
        <span className="font-fw-display text-h3 font-medium leading-none tabular-nums text-text-primary">
          {ctx.getValue() as number}
        </span>
      ),
    },
    {
      accessorKey: 'total_to_par',
      header: 'To Par',
      meta: { align: 'right', numeric: true },
      cell: (ctx) => {
        const toPar = ctx.getValue() as number;
        return (
          <StatusPill
            tone={toPar < 0 ? 'accent' : toPar > 0 ? 'warning' : 'neutral'}
            size="sm"
            dot={false}
            className="tabular-nums"
          >
            {formatToPar(toPar)}
          </StatusPill>
        );
      },
    },
    {
      accessorKey: 'round_date',
      header: 'Date',
      meta: { align: 'right', noWrap: true },
      cell: (ctx) => (
        <span className="text-text-secondary">{shortDate(ctx.getValue() as string)}</span>
      ),
    },
  ];

  // Recent-rounds MOBILE CARD (below `sm`) — audit W2: the raw <table> above
  // only shows Player+Course on a phone (Score/To Par/Date clip out of the
  // overflow-x-auto box with no scroll affordance — reads as broken). Below
  // `sm`, <DataTable mobileCard> renders this instead: player identity +
  // score PROMINENT, course + date secondary, to-par as a tone chip — the
  // same digest, recomposed as a native row instead of a squeezed table.
  // Plain function (not useCallback): it runs below the coach-without-team
  // early return above, so it can't be a hook (rules-of-hooks) — and
  // `roundColumns` right above it is already unmemoized for the same reason.
  function renderRoundMobileCard(row: Row<RoundRow>) {
    const r = row.original;
    const tone = r.total_to_par < 0 ? 'accent' : r.total_to_par > 0 ? 'warning' : 'neutral';
    return (
      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar decorative name={r.player_name} src={r.player_avatar_url} size="md" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-fw-sans text-body font-medium text-text-primary">
            {r.player_name}
          </p>
          <p className="mt-0.5 truncate font-fw-sans text-caption text-text-tertiary">
            {toTitleCase(r.course_name)} · {shortDate(r.round_date)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-fw-display text-h3 font-medium leading-none tabular-nums text-text-primary">
            {r.total_score}
          </span>
          <StatusPill tone={tone} size="sm" dot={false} className="tabular-nums">
            {formatToPar(r.total_to_par)}
          </StatusPill>
        </div>
      </div>
    );
  }

  // overflow-x-clip on the page root (not -hidden: clip doesn't create a
  // scroll container, so sticky children keep working) — hard guarantee that
  // no wide child (a table, an unbroken string, a wide chart) can ever
  // stretch the page past the viewport; the owner's phone showed every
  // full-width card running past the screen edge when one sibling went wide
  // (#957).
  //
  // Bottom clearance: pb-8/md:pb-28 is deliberately deeper than the matching
  // top rhythm (pt-8/md:pt-10). ChatDrawer's floating "Ask" button is `fixed
  // bottom-6 right-6` — a 56px circle occupying roughly the bottom 80px of
  // the viewport — on every /golf/dashboard route at md+ (below md it lives
  // in the bottom tab bar instead, see ChatDrawer.tsx). At 1440x900 this
  // page's content is often shorter than the viewport, so without headroom
  // here the FAB sits directly over whatever renders last (Recent Rounds /
  // the Team region) instead of merely floating past the end of a longer,
  // scrolled page. pb-28 (112px) clears that 80px zone with margin.
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 overflow-x-clip px-5 pt-8 pb-8 md:gap-10 md:px-8 md:pt-10 md:pb-28">
      {/* ── 1 · OPENER — the warm plinth (DESIGN-SYSTEM §4.1, ONE per page) ──
          Redesign notes, because most of this is a deletion:

          • EYEBROW was the literal string "Coach Dashboard" — a label the top
            bar already carries two inches above it. It now carries the DATE,
            formatted server-side in the team's timezone. A date earns the slot:
            it pairs with the time-of-day greeting directly under it, and it is
            the one piece of orientation a dashboard opener actually owes you.
          • DESCRIPTION was a `·`-joined dump of the team name and two counts.
            The name is the description now; the counts moved to `meta`, where
            they render as real chips with their own icons and tabular figures
            instead of running together as prose.
          • PLINTH: the opener sits on the warm `surface-tint` band rather than
            floating as one more flat text block on `bg-canvas`. This is what
            makes it read as the page's hero rather than as its <title>.
          • disableAnimation: the ViewHeader's default entrance is an
            opacity-0 → 1 / y-8 → 0 stagger. A shape-matched skeleton paints
            this exact silhouette immediately before it, so animating in from
            nothing means the text visibly drops 8px away from where the
            placeholder just sat. Settled content that was already placeheld
            must not re-enter — that IS the flicker. */}
      <ViewHeader
        plinth
        disableAnimation
        eyebrow={todayLabel ?? 'Coach Dashboard'}
        title={greeting}
        description={
          stats.rosterSize === 0
            ? 'Invite players to start tracking rounds, qualifiers and team performance.'
            : team.name
        }
        meta={
          stats.rosterSize === 0 ? undefined : (
            // Owner 2026-09-27: "rework the layout so it's not so hard to
            // read". The three counts are a stat row on the green band — big
            // tabular figures over plain labels — not caption-size chips.
            <dl className="mt-3 grid w-full max-w-xl grid-cols-3 divide-x divide-border-subtle">
              {[
                { value: stats.rosterSize, label: stats.rosterSize === 1 ? 'Player' : 'Players' },
                { value: stats.upcomingEvents, label: stats.upcomingEvents === 1 ? 'Upcoming event' : 'Upcoming events' },
                { value: stats.activeQualifiers, label: stats.activeQualifiers === 1 ? 'Active qualifier' : 'Active qualifiers' },
              ].map((stat) => (
                <div key={stat.label} className="flex flex-col-reverse gap-0.5 px-4 first:pl-0">
                  <dt className="whitespace-nowrap font-fw-sans text-body-sm text-text-secondary">{stat.label}</dt>
                  <dd className="font-fw-display text-h2 font-semibold tabular-nums text-text-primary">{stat.value}</dd>
                </div>
              ))}
            </dl>
          )
        }
        secondaryActions={
          <>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/golf/dashboard/calendar">
                <IconCalendar size={16} />
                <span>Schedule</span>
              </Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              {/* P013: label matches the destination — this links to the
                  qualifiers LIST, so the action reads as a view ("Qualifiers"),
                  not the ambiguous bare noun that implied a create flow. */}
              <Link href="/golf/dashboard/qualifiers">
                <IconFlag size={16} />
                <span>Qualifiers</span>
              </Link>
            </Button>
          </>
        }
        primaryAction={
          <Button variant="primary" asChild>
            <Link href="/golf/dashboard/roster">
              <IconPlus size={16} />
              <span>Add Player</span>
            </Link>
          </Button>
        }
      />

      {/* ── 2 · Scope band — the green rule AND the window control, one row ──
          The owner's "more green" ruling is preserved exactly: the masthead
          still sits on a real green rule, not a neutral divider. It is now the
          `border-t` of the row it was introducing rather than a free-floating
          `h-px` sibling, which removes one of the four stacked horizontal bands
          the opener used to spend before any content. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-accent-300 pt-5">
        <span className="font-fw-sans text-caption text-text-tertiary">
          Window
        </span>
        <Segmented
          value={range}
          onValueChange={handleRangeChange}
          options={RANGE_OPTIONS}
          aria-label="Performance window"
        />
      </div>

      {/* Roster join-request approvals — preserved logic (getTeamJoinRequests / roster.ts),
          rendered through the Fairway warning InlineNotice so the dashboard stays one
          calm matte surface (P003). `joinRequests` is fetched server-side by the RSC
          page and passed down (see FairwayCoachDashboardProps) so this renders from
          data already present at first paint instead of self-fetching on mount —
          the banner no longer flips in after hydration and reflows everything below
          the fold. Falls back to the component's own self-fetch when the prop is
          omitted (e.g. any other caller that hasn't wired it). */}
      <FairwayJoinRequestAlert requests={joinRequests} />

      {/* Latest notifications — compact digest of the unified feed (CoachHelm
          signals, event/RSVP lifecycle, task reminders…). Self-fetching client
          module; renders nothing when there's genuinely nothing new (the bell
          in the top bar stays the source of truth either way). "View all"
          opens that same bell panel via NotificationPanelContext. */}
      {/* Owner 2026-09-27: Latest is a tighter left column with Today beside
          it on wide screens, instead of two full-width bands. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
        <NotificationsLatestModule initialItems={initialLatestNotifications} people={peopleAvatars} />

        {/* ── 3 · TODAY — schedule timeline (matte, calm) ────────────────────── */}
        <TodayPanel
          events={enhancedData?.todayEvents ?? []}
          scheduleError={enhancedData?.todayScheduleError ?? false}
          timezone={enhancedData?.timezone}
        />
      </div>

      {/* ── 4 · TEAM PERFORMANCE — one contained card, four hairline cells ────
          Owner 2026-09-27: the four separate KPI tiles read as a template row.
          They are now ONE card with the deep green header (same plinth as
          Latest / Today / Recent Rounds): 2x2 on a phone, four across from lg,
          divided by 1px hairlines (the grid's gap shows the border colour
          through, so the dividers are right in both layouts). Every cell pins
          its sparkline to one shared baseline (TeamKpiCell), the delta chip
          sits inline beside its figure, and the "what does the change mean"
          caption is said ONCE in the footer instead of under every figure.
          Honesty is unchanged: a null metric reads "Need 3+ rounds" (or
          "Couldn't load" when the read behind it failed), never a zero. */}
      <div className="flex flex-col gap-4">
        <section
          aria-label="Team performance"
          className="flex flex-col overflow-hidden rounded-fw-lg border border-border-subtle bg-surface shadow-soft"
        >
          <div className="fw-plinth-green flex items-center justify-between gap-3 px-4 py-3">
            <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">Team performance</h2>
            <span className="shrink-0 font-fw-sans text-body-sm text-text-secondary">{windowLabel(range)}</span>
          </div>

          <div className="grid grid-cols-2 gap-px bg-border-subtle lg:grid-cols-4">
            <TeamKpiCell
              className="bg-surface"
              label="Scoring avg"
              icon={<IconChartBar size={16} />}
              value={scoringAvg != null ? round1(scoringAvg) : null}
              decimals={1}
              goodDirection="down"
              delta={scoringDelta != null ? { value: round1(scoringDelta.value) } : null}
              series={scoringSeries}
              seriesLabel="Scoring average"
              // AUDIT-0724 #2/#6: force the SAME verdict the delta chip renders
              // (computeSeriesTrend's split-half average) instead of letting
              // Sparkline classify its own endpoint diff. Undefined (n<3) falls
              // back to Sparkline's own read, with no chip beside it to disagree.
              direction={scoringDelta?.direction}
              emptyMessage={kpiEmpty.message}
              footnote={scoringAvg != null ? undefined : kpiEmpty.footnote}
            />
            <TeamKpiCell
              className="bg-surface"
              label="GIR"
              icon={<IconTarget size={16} />}
              value={girValue != null ? Math.round(girValue) : null}
              suffix="%"
              goodDirection="up"
              delta={girDelta != null ? { value: Math.round(girDelta.value), suffix: '%' } : null}
              series={girSeries}
              seriesLabel="Greens in regulation"
              // AUDIT-0724 #2, the reported case: [61,78,72,50,61] drew "flat"
              // (endpoint 61-61=0) beside a "declining" chip. Same verdict now.
              direction={girDelta?.direction}
              emptyMessage={kpiEmpty.message}
              footnote={girValue != null ? undefined : kpiEmpty.footnote}
            />
            <TeamKpiCell
              className="bg-surface"
              label="Putts per round"
              icon={<IconGolf size={16} />}
              value={puttsValue != null ? round1(puttsValue) : null}
              decimals={1}
              goodDirection="down"
              delta={puttsDelta != null ? { value: round1(puttsDelta.value) } : null}
              series={puttsSeries}
              seriesLabel="Putts per round"
              direction={puttsDelta?.direction}
              emptyMessage={kpiEmpty.message}
              footnote={puttsValue != null ? undefined : kpiEmpty.footnote}
            />
            {/* Roster is a real count, not a derived aggregate. null means the
                count query FAILED, which is not zero: a confident "0" told a
                coach with a full squad their program was empty. The faces are
                the players with counted rounds in this window (the only
                players this payload knows), and the footnote says exactly that. */}
            <TeamKpiCell
              className="bg-surface"
              label="Roster"
              icon={<IconUsers size={16} />}
              value={stats.rosterSize}
              emptyMessage="Couldn’t load"
              footnote={stats.rosterSize == null ? 'Refresh to try again' : rosterFootnote}
            >
              {stats.rosterSize != null && playersWithRounds.length > 0 ? (
                <AvatarGroup size="xs" max={5} ring="ring-surface" aria-hidden="true">
                  {playersWithRounds.map((p) => (
                    <Avatar key={p.id} decorative size="xs" name={p.name} src={p.avatarUrl} />
                  ))}
                </AvatarGroup>
              ) : null}
            </TeamKpiCell>
          </div>

          {kpiCaption ? (
            <p
              data-slot="team-performance-caption"
              className="border-t border-border-subtle bg-surface-sunken px-4 py-2 font-fw-sans text-caption text-text-tertiary"
            >
              {kpiCaption}
            </p>
          ) : null}
        </section>

        {/* Roster-cap notice as quiet matte status, not a heavy card */}
        {rosterFull ? (
          <InlineNotice tone="warning" title="Roster full">
            Your invite code is hidden because the roster has reached the 20-player limit.
          </InlineNotice>
        ) : null}
      </div>

      {/* ── 5 · RECENT ROUNDS — clean DataTable ────────────────────────────── */}
      {/* Owner 2026-09-27: one contained card with the deep green header,
          matching Latest. */}
      <section
        aria-label="Recent rounds"
        className="flex flex-col overflow-hidden rounded-fw-lg border border-border-subtle bg-surface shadow-soft"
      >
        <div className="fw-plinth-green flex items-center justify-between gap-3 px-4 py-3">
          <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">Recent Rounds</h2>
          <Link
            href="/golf/dashboard/rounds"
            className="inline-flex items-center gap-1 py-3 -my-3 font-fw-sans text-body-sm font-medium text-text-primary hover:text-accent-ink"
          >
            View all
            <IconArrowRight size={14} />
          </Link>
        </div>
        {recentRounds.length === 0 ? (
          // padding="sm" (not the Surface default "md"): EmptyState's own
          // "subtle" variant already brings ample internal padding
          // (px-6 py-10) — stacking that on top of a "md" Surface (p-6)
          // doubled up to a taller box than the honest-compact treatment
          // every other thin-data state on this page uses (Team Pulse / Top
          // Performers wrap InsufficientData `compact` in the same "md"
          // Surface). "sm" removes the doubled padding without touching the
          // shared EmptyState primitive.
          <div className="p-3">
            {/* `teamStatsUnavailable` says a read behind the round data FAILED.
                Without it, a lock wait or timeout rendered "No rounds logged
                yet" to a team with a full season on file — the empty state and
                the failure state were the same screen. The action has computed
                this flag since #1307; nothing consumed it until now. */}
            {teamStatsUnavailable ? (
              <EmptyState
                variant="subtle"
                icon={LucideFlag}
                title="Couldn’t load rounds"
                description="Something went wrong reading this team’s rounds. Refresh to try again. Nothing has been lost."
              />
            ) : (
              <EmptyState
                variant="subtle"
                icon={LucideFlag}
                title={range !== 'all' ? 'No rounds in this window' : 'No rounds logged yet'}
                description={
                  range !== 'all'
                    ? 'Try a wider window, or have players log rounds from their dashboard.'
                    : 'Players can submit rounds from their dashboard, they’ll appear here.'
                }
              />
            )}
          </div>
        ) : (
          <DataTable<RoundRow>
            data={recentRounds.slice(0, 8)}
            columns={roundColumns}
            mobileCard={renderRoundMobileCard}
            ariaLabel="Recent team rounds"
            className="rounded-none border-0 [&_tbody_tr:hover]:bg-surface-sunken/70 [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.06em] [&_th]:text-text-secondary [&_thead]:bg-surface-sunken"
            getRowId={(r) => r.id}
            density="comfortable"
            // This is a "latest 8" digest with a "View all" link — sorting only
            // the truncated slice would imply a team-wide ranking that isn't here
            // (P006). Lock the order; the full sortable view lives at /rounds.
            enableSorting={false}
            // Every row is the obvious next action: open that round's detail (the
            // route authorizes a coach for any team player's round) (P005).
            onRowClick={(r) => router.push(`/golf/dashboard/rounds/${r.id}`)}
          />
        )}
      </section>

      {/* ── 6 · TEAM region — Trend + Pulse + Top Performers (matte) ────────── */}
      {/* items-stretch (the grid default) + h-full on both columns: at 1440 the
          3-wide Trend column ended ~313px above the 2-wide stack beside it,
          leaving a dead quadrant at the bottom-left of the page (audit M5).
          Stretching makes both columns end together. */}
      <section aria-label="Team" className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-5">
        {/* Performance trend (reskin-preserve-logic: same teamScoringTrend) */}
        <div className="flex flex-col lg:col-span-3 [&>*]:h-full">
          {hasTrend ? (
            <TrendChart
              title="Performance Trend"
              overline="Team scoring average"
              data={trendPoints}
              valueFormatter={trendValue}
              takeaway={trendTakeaway}
            />
          ) : (
            <Surface elevation="border" padding="md" className="flex flex-col gap-3">
              <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">
                Performance Trend
              </h2>
              {/* Mirror the Recent Rounds pattern above: a narrow window is not
                  an empty roster. Telling a coach with 7 players and 90 rounds
                  to "invite players" because they filtered to 7 days reads as
                  the product not knowing its own state (audit 2026-07-24, H5). */}
              <InsufficientData
                title={
                  teamStatsUnavailable
                    ? 'Couldn’t load the trend'
                    : range !== 'all'
                      ? 'Not enough rounds in this window'
                      : 'Trend appears as rounds build'
                }
                description={
                  teamStatsUnavailable
                    ? 'Something went wrong reading this team’s rounds. Refresh to try again.'
                    : range !== 'all'
                      ? 'A trend needs rounds spread across a longer period. Try a wider window.'
                      : 'Trends need rounds across multiple months. Invite players and keep logging.'
                }
              />
              {/* handleRangeChange, not setRange — the range is also a URL
                  contract (force-dynamic ?range re-fetch); setting state alone
                  would leave the page showing stale data. */}
              <div>
                {range !== 'all' ? (
                  <Button variant="secondary" size="sm" onClick={() => handleRangeChange('all')}>
                    <span>Widen the window</span>
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" asChild>
                    <Link href="/golf/dashboard/roster">
                      <IconPlus size={16} />
                      <span>Invite Players</span>
                    </Link>
                  </Button>
                )}
              </div>
            </Surface>
          )}
        </div>

        {/* Team pulse + top performers stacked */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <TeamPulsePanel pulse={enhancedData?.teamPulse} />

          <Surface elevation="border" padding="md" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">
                Top Performers
              </h2>
              <Link
                href="/golf/dashboard/stats/team"
                className="inline-flex items-center gap-1 py-3 -my-3 font-fw-sans text-body-sm font-medium text-accent-700 hover:text-accent-ink"
              >
                Rankings
                <IconArrowRight size={14} />
              </Link>
            </div>
            {topPlayers.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {topPlayers.slice(0, 5).map((p, i, shown) => {
                  // NUMC-05: players equal at the printed precision share a
                  // position ("T2"), instead of being split by list order.
                  const position = competitionRankLabels(shown.map((x) => x.avg_score))[i]!;
                  return (
                  <li key={p.id}>
                    <Link
                      href={`/golf/dashboard/players/${p.id}/game?tab=scouting`}
                      prefetch={false}
                      className="block rounded-fw-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                    >
                      <Inset
                        padding="sm"
                        className="flex items-center justify-between gap-3 transition-colors hover:bg-surface-hover"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span
                            aria-label={position.tied ? `Tied for position ${position.rank}` : `Position ${position.rank}`}
                            className={cn(
                              'grid h-6 min-w-6 shrink-0 place-items-center rounded-full px-1 text-caption font-medium tabular-nums',
                              position.rank === 1
                                ? 'bg-accent-fill text-text-on-accent-fill'
                                : 'bg-surface text-text-secondary',
                            )}
                          >
                            {position.label}
                          </span>
                          <span className="truncate font-fw-sans text-body font-medium text-text-primary">
                            {p.name}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-baseline gap-2">
                          <span className="text-body font-medium tabular-nums text-text-primary">
                            {formatMetricText('scoring_average', p.avg_score)}
                          </span>
                          <span className="font-fw-sans text-caption text-text-tertiary">
                            {p.rounds} rd
                          </span>
                        </span>
                      </Inset>
                    </Link>
                  </li>
                  );
                })}
              </ul>
            ) : (
              <InsufficientData
                compact
                title={teamStatsUnavailable ? 'Couldn’t load performers' : 'No leaderboard yet'}
                description={
                  teamStatsUnavailable
                    ? 'Something went wrong reading this team’s rounds. Refresh to try again.'
                    : 'Player averages appear once rounds are logged.'
                }
              />
            )}
          </Surface>
        </div>
      </section>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Team pulse — quiet matte panel (replaces the heavy TeamPulseCard).
 * Honest: shows insufficient-data when there is no trend signal yet.
 * ────────────────────────────────────────────────────────────────────────── */

function TeamPulsePanel({ pulse }: { pulse?: CoachDashboardPayload['teamPulse'] }) {
  const improving = pulse?.improving ?? 0;
  const stable = pulse?.stable ?? 0;
  const declining = pulse?.declining ?? 0;
  const roundsThisWeek = pulse?.roundsThisWeek ?? 0;
  const tracked = improving + stable + declining;

  return (
    <Surface elevation="border" padding="md" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">Team Pulse</h2>
        {/* Suppressed when there is nothing to classify: the pill sat directly
            above "No movement to read yet" and the card contradicted itself
            (audit 2026-07-24, H6). The count still shows in the empty-state
            copy below, where it reads as context rather than a claim. */}
        {roundsThisWeek > 0 && tracked > 0 ? (
          <StatusPill tone="accent" dot>
            {roundsThisWeek} this week
          </StatusPill>
        ) : null}
      </div>

      {tracked === 0 ? (
        <InsufficientData
          compact
          title="No movement to read yet"
          description={
            roundsThisWeek > 0
              ? `${roundsThisWeek} round${roundsThisWeek === 1 ? '' : 's'} logged this week, not enough yet to classify movement. Pulse compares recent rounds against each player's baseline.`
              : 'Pulse compares recent rounds. It fills in as players log activity.'
          }
        />
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <Inset padding="sm" className="flex flex-col gap-1">
            <span className="text-h3 font-medium tabular-nums text-fw-success-ink">
              {improving}
            </span>
            <span className="font-fw-sans text-caption text-text-tertiary">Improving</span>
          </Inset>
          <Inset padding="sm" className="flex flex-col gap-1">
            <span className="text-h3 font-medium tabular-nums text-text-secondary">
              {stable}
            </span>
            <span className="font-fw-sans text-caption text-text-tertiary">Stable</span>
          </Inset>
          <Inset padding="sm" className="flex flex-col gap-1">
            <span className="text-h3 font-medium tabular-nums text-fw-warning-ink">
              {declining}
            </span>
            <span className="font-fw-sans text-caption text-text-tertiary">Declining</span>
          </Inset>
        </div>
      )}

      {pulse?.topMover && pulse.topMover.delta !== 0 ? (
        <Inset padding="sm" className="flex items-center justify-between gap-3">
          <span className="font-fw-sans text-body-sm text-text-secondary">
            Top mover · <span className="font-medium text-text-primary">{pulse.topMover.name}</span>
          </span>
          <span
            className={cn(
              'text-body-sm font-medium tabular-nums',
              // delta is a POSITIVE improvement magnitude (olderAvg - recentAvg),
              // so a positive delta means the player improved → success green.
              pulse.topMover.delta > 0 ? 'text-fw-success-ink' : 'text-fw-warning-ink',
            )}
          >
            {/* A score change: fewer strokes (improved) reads "−". */}
            {formatMetricText('scoring_average_vs_par', -pulse.topMover.delta)}
          </span>
        </Inset>
      ) : null}
    </Surface>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Today — schedule region (F104). A calm matte list of the day's events,
 * ported from the legacy TodayTimeline presentation in Fairway style. Reads
 * ONLY the already-computed `enhancedData.todayEvents`; no refetch. Time labels
 * are deferred to the client (resolved timezone) to avoid a hydration mismatch
 * between server and browser timezones (the legacy timeline does the same).
 * ────────────────────────────────────────────────────────────────────────── */

const EVENT_TONE: Record<string, 'accent' | 'warning' | 'neutral' | 'info'> = {
  practice: 'info',
  tournament: 'warning',
  qualifier: 'accent',
  meeting: 'neutral',
  travel: 'info',
  workout: 'warning',
  game: 'accent',
  scrimmage: 'accent',
  class: 'info',
  other: 'neutral',
};

const EVENT_LABEL: Record<string, string> = {
  practice: 'Practice',
  tournament: 'Tournament',
  qualifier: 'Qualifier',
  meeting: 'Meeting',
  travel: 'Travel',
  workout: 'Workout',
  game: 'Match',
  scrimmage: 'Scrimmage',
  class: 'Class',
  other: 'Event',
};

function TodayPanel({
  events,
  scheduleError = false,
  timezone,
}: {
  events: TodayEvent[];
  scheduleError?: boolean;
  timezone?: string;
}) {
  // Resolve the display timezone on the client (Intl may differ between server
  // and browser); render time labels only after mount to avoid React #418.
  const [tz, setTz] = useState<string | null>(null);
  useEffect(() => {
    setTz(timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, [timezone]);

  return (
    <section aria-label="Today's schedule" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">Today</h2>
          {!scheduleError && events.length > 0 ? (
            <span className="text-caption tabular-nums text-text-tertiary">
              {events.length}
            </span>
          ) : null}
        </div>
        <Link
          href="/golf/dashboard/calendar"
          className="inline-flex items-center gap-1 py-3 -my-3 font-fw-sans text-body-sm font-medium text-accent-700 hover:text-accent-ink"
        >
          Calendar
          <IconArrowRight size={14} />
        </Link>
      </div>
      {/* Section hairline — more-green ruling: a green rule under the section
          title, not a plain gray one. */}
      <div aria-hidden="true" className="h-px w-full bg-accent-300" />

      {scheduleError ? (
        // Degraded state — the schedule RPC failed. Surface a distinct, quiet
        // "couldn't load" notice so a failed fetch is never mistaken for a
        // genuinely empty day (P009 honesty rule).
        <InlineNotice
          tone="warning"
          title="Couldn’t load today’s schedule"
        >
          We hit a snag fetching today’s events. Refresh to try again, or open the
          calendar to see the full schedule.
        </InlineNotice>
      ) : events.length === 0 ? (
        // Right-sized for the COMMON case (audit #64): most days have nothing
        // on the books, so a clear schedule is the everyday state, not an
        // edge case — it no longer spends a full monolithic EmptyState card
        // (icon + title + description) on that. A single quiet InlineNotice
        // row says the same thing at the size the message actually needs.
        <InlineNotice tone="info" icon={LucideCalendar} title="Clear schedule today">
          A good window for practice or recovery.
        </InlineNotice>
      ) : (
        <Surface elevation="border" padding="sm">
          <ul className="flex flex-col gap-2">
            {events.map((event) => {
              const tone = EVENT_TONE[event.event_type] ?? 'neutral';
              const typeLabel = EVENT_LABEL[event.event_type] ?? 'Event';
              return (
                <li key={event.id}>
                  <Inset padding="sm" className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 truncate font-fw-sans text-body font-medium text-text-primary">
                        {event.title}
                      </span>
                      <StatusPill tone={tone} dot={false} size="sm">
                        {typeLabel}
                      </StatusPill>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-fw-sans text-caption text-text-tertiary">
                      <span className="inline-flex items-center gap-1 tabular-nums" suppressHydrationWarning>
                        <IconClock size={12} />
                        {tz ? (
                          <>
                            {formatTimeInTz(event.start_time, tz)}
                            {event.end_time ? ` – ${formatTimeInTz(event.end_time, tz)}` : ''}
                          </>
                        ) : null}
                      </span>
                      {event.location ? (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <IconMapPin size={12} />
                          <span className="truncate">{event.location}</span>
                        </span>
                      ) : null}
                      {event.rsvp_total !== undefined ? (
                        <span className="tabular-nums">
                          {event.rsvp_yes ?? 0}/{event.rsvp_total} confirmed
                        </span>
                      ) : null}
                    </div>
                  </Inset>
                </li>
              );
            })}
          </ul>
        </Surface>
      )}
    </section>
  );
}

