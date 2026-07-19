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
 *   • NEW CoachHelm signal strip is the ONE glass-hero (InsightCard variant=hero)
 *     + a What's New / Open CoachHelm entry — fixing "AI absent from home". It is
 *     sourced ONLY from counts that exist (see coach-signal.ts); it NEVER renders
 *     an authoritative effectiveness/prediction-accuracy figure (data-gap:high).
 *   • Team KPIs are matte MetricCards that show honest insufficient-data when
 *     round coverage is low (never authoritative zeros, data-gap:medium).
 *   • Recent Rounds becomes a clean DataTable; Performance Trend + Team Pulse +
 *     Top Performers collapse into one calm "Team" region on matte Surfaces.
 *   • Coach-without-team becomes an OnboardingStep funnel, not a zeroed page.
 *
 * Rendered inside the `.fairway-ds` scope on `bg-canvas`. Exactly ONE glass
 * surface (the hero strip); every content card is matte. Single h1; slow
 * cinematic motion via the primitives' own reveal (honors reduced motion).
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import nextDynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { Row } from '@tanstack/react-table';
import {
  ViewHeader,
  Surface,
  Inset,
  MetricCard,
  InsightCard,
  DataTable,
  Segmented,
  Button,
  StatusPill,
  Avatar,
  InlineNotice,
  EmptyState,
  InsufficientData,
  OnboardingStep,
  OnboardingSteps,
  Skeleton,
  Sparkline,
  type ColumnDef,
  type TrendPoint,
} from '@/components/fairway';
import {
  IconUsers,
  IconCalendar,
  IconFlag,
  IconChartBar,
  IconPlus,
  IconCopy,
  IconCheck,
  IconGolf,
  IconTarget,
  IconSparkles,
  IconArrowRight,
  IconClock,
  IconMapPin,
  IconBell,
  IconClipboardList,
  IconAlertCircle,
} from '@/components/icons';
import { formatTimeInTz, getCurrentDecimalHourInTz } from '@/lib/utils/timezone';
import { getGreeting, timeOfDayForHour } from '@/lib/utils/time-of-day';
import {
  Users as LucideUsers,
  Flag as LucideFlag,
  Calendar as LucideCalendar,
  CheckCircle2 as LucideCheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FairwayJoinRequestAlert } from '@/components/fairway/pages/roster/FairwayJoinRequestAlert';
import type { JoinRequestData } from '@/app/golf/actions/teams';
import type {
  CoachDashboardPayload,
  DashboardDateRange,
  TodayEvent,
  ActionItem,
} from '@/app/golf/actions/dashboard-data';
import type { CoachDashboardData } from '@/app/golf/(dashboard)/dashboard/components/coach-dashboard-types';
import { deriveCoachSignal } from './coach-signal';
import { buildCoachAttentionCounts, splitActionItems } from './attention-queue';

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

function formatToPar(toPar: number): string {
  if (toPar === 0) return 'E';
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

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

/** Honest first→last delta over a sparkline series (oldest → newest), or null
 *  when there are fewer than two finite points to compare. This is the only
 *  numeric movement the dashboard payload supports — the payload's `trend` is a
 *  qualitative direction, not a magnitude — so the MetricCard delta chip is
 *  sourced from the series the same way the Sparkline classifies its color. */
function seriesDelta(series: number[] | undefined): number | null {
  if (!series) return null;
  const finite = series.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return null;
  const first = finite[0] as number;
  const last = finite[finite.length - 1] as number;
  return last - first;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function FairwayCoachDashboard({
  data,
  enhancedData,
  dateRange: initialRange = 'all',
  joinRequests,
}: FairwayCoachDashboardProps) {
  const { coach, team, stats, recentRounds, topPlayers, teamScoringTrend } = data;
  const router = useRouter();

  const [range, setRange] = useState<DashboardDateRange>(initialRange);
  const [copied, setCopied] = useState(false);

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
  // Resolve the hour in the team timezone (falling back to the browser's) on the
  // CLIENT after mount — computing it during SSR would either pin to the server
  // clock (wrong for the coach) or risk a hydration mismatch. Until then we show
  // a time-neutral "Welcome back" that is never incorrect.
  const tzForGreeting = enhancedData?.timezone;
  const [greeting, setGreeting] = useState(`Welcome back, ${firstName}`);
  useEffect(() => {
    const tz = tzForGreeting || Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      const hour = getCurrentDecimalHourInTz(tz);
      // #950 — the old `< 12` morning / `< 17` afternoon / else evening
      // scheme called 1am "Good morning, {name}". timeOfDayForHour applies
      // the same sane 4-bucket scheme (incl. a "Welcome back" late-night
      // bucket) that src/lib/utils/time-of-day.ts and src/lib/entry/
      // greeting.ts already use.
      setGreeting(`${getGreeting(timeOfDayForHour(hour))}, ${firstName}`);
    } catch {
      // Intl/timezone unavailable — keep the time-neutral welcome.
      setGreeting(`Welcome back, ${firstName}`);
    }
  }, [tzForGreeting, firstName]);

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

  // PRESERVED LOGIC: invite-code copy-to-clipboard handler (same behavior as
  // the legacy InviteCodeCard).
  const handleCopy = useCallback(async () => {
    const code = team?.join_code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [team?.join_code]);

  // ONE canonical "needs you" count (attention-queue.ts): actionable tasks +
  // pending roster approvals, announcements excluded. The hero, the approvals
  // banner and the Action Items panel all now speak from this same total
  // instead of each telling a different story. Approvals come from the same
  // pending join-requests already fetched for the banner (no extra query);
  // getTeamJoinRequests() returns pending-only, but we filter defensively so a
  // self-fetched fallback can't over-count.
  const attention = useMemo(
    () =>
      buildCoachAttentionCounts(
        enhancedData?.actionItems ?? [],
        (joinRequests ?? []).filter((r) => r.status === 'pending').length,
      ),
    [enhancedData?.actionItems, joinRequests],
  );

  const signal = useMemo(
    () => deriveCoachSignal(enhancedData, stats.rosterSize, attention),
    [enhancedData, stats.rosterSize, attention],
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
  const scoringAvg = enhancedData?.sparklines.scoringAvg.value ?? stats.teamScoringAverage;
  const girValue = enhancedData?.sparklines.girPct.value ?? null;
  const puttsValue = enhancedData?.sparklines.puttsPerRound.value ?? null;

  // KPI micro-trends (F045/F046): the payload already holds a per-metric series
  // (oldest → newest) + a qualitative direction. Render the series as a quiet
  // Sparkline and the honest first→last movement as the MetricCard delta chip.
  const scoringSeries = enhancedData?.sparklines.scoringAvg.sparkline ?? [];
  const girSeries = enhancedData?.sparklines.girPct.sparkline ?? [];
  const puttsSeries = enhancedData?.sparklines.puttsPerRound.sparkline ?? [];
  const scoringDelta = seriesDelta(scoringSeries);
  const girDelta = seriesDelta(girSeries);
  const puttsDelta = seriesDelta(puttsSeries);

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

  const showInviteNotice =
    !!team.join_code && team.join_code !== 'DEMO01' && stats.rosterSize < 20;
  const rosterFull = !!team.join_code && team.join_code !== 'DEMO01' && stats.rosterSize >= 20;

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
            <Avatar
              name={row.player_name}
              src={row.player_avatar_url}
              size="sm"
              className="shrink-0"
            />
            <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
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
    },
    {
      accessorKey: 'total_to_par',
      header: 'To Par',
      meta: { align: 'right', numeric: true },
      cell: (ctx) => formatToPar(ctx.getValue() as number),
    },
    {
      accessorKey: 'round_date',
      header: 'Date',
      meta: { align: 'right', noWrap: true },
      cell: (ctx) => (
        <span className="text-text-tertiary">{shortDate(ctx.getValue() as string)}</span>
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
        <Avatar name={r.player_name} src={r.player_avatar_url} size="md" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-fw-sans text-body font-medium text-text-primary">
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
          <StatusPill tone={tone} size="sm" dot={false} className="font-fw-mono tabular-nums">
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
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 overflow-x-clip px-5 py-8 md:gap-10 md:px-8 md:py-10">
      {/* ── 1 · MASTHEAD — single h1 + promoted action cluster ─────────────── */}
      <ViewHeader
        eyebrow="Coach Dashboard"
        title={greeting}
        description={
          stats.rosterSize === 0
            ? 'Invite players to start tracking rounds, qualifiers and team performance.'
            : `${team.name} · ${stats.rosterSize} ${stats.rosterSize === 1 ? 'player' : 'players'} on the roster${
                stats.upcomingEvents > 0
                  ? ` · ${stats.upcomingEvents} upcoming ${stats.upcomingEvents === 1 ? 'event' : 'events'}`
                  : ''
              }`
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

      {/* Masthead hairline — the owner's "more green" ruling: the loud graphite
          masthead sits on a real green rule, not a neutral divider. */}
      <div aria-hidden="true" className="h-px w-full bg-accent-300" />

      {/* ── 2 · Quiet toolbar band: date-range scope (calm, not glass) ─────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">
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

      {/* ── 3 · THE ONE GLASS HERO — CoachHelm signal strip ────────────────── */}
      <InsightCard
        variant="hero"
        priority={signal.priority}
        overline={signal.overline}
        title={signal.title}
        icon={<IconSparkles size={20} />}
        empty={signal.insufficient}
        emptyMessage={signal.body}
        actions={
          <>
            {/* One filled-green primary per view (masthead's "Add Player" owns
                it) — this hero card's own CTA is demoted to secondary so it
                doesn't compete with the page-level primary action. */}
            <Button variant="secondary" size="sm" asChild>
              <Link href="/golf/dashboard/intelligence">
                <span>Open CoachHelm</span>
                <IconArrowRight size={16} />
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/golf/dashboard/whats-new">What&apos;s New</Link>
            </Button>
          </>
        }
      >
        {signal.body}
      </InsightCard>

      {/* ── 3.5 · TODAY — schedule timeline (matte, calm) ──────────────────── */}
      <TodayPanel
        events={enhancedData?.todayEvents ?? []}
        scheduleError={enhancedData?.todayScheduleError ?? false}
        timezone={enhancedData?.timezone}
      />

      {/* ── 4 · TEAM KPIs — matte MetricCards, honest insufficient-data ────── */}
      <section aria-label="Team performance" className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {scoringAvg != null ? (
            <MetricCard
              label="Scoring Avg"
              value={Number(scoringAvg.toFixed(1))}
              decimals={1}
              icon={<IconChartBar size={18} />}
              goodDirection="down"
              delta={
                scoringDelta != null
                  ? { value: Number(scoringDelta.toFixed(1)), label: 'last 5 rounds' }
                  : undefined
              }
              sparkline={
                scoringSeries.length >= 2 ? (
                  <Sparkline data={scoringSeries} goodDirection="down" label="Scoring average" />
                ) : undefined
              }
              footnote={`${roundsLogged} ${roundsLogged === 1 ? 'round' : 'rounds'} in window`}
            />
          ) : (
            // Keep ONE tile silhouette across the KPI row (P010): the null metric
            // recedes inside a MetricCard `empty` shell, not a different Surface shape.
            <MetricCard
              label="Scoring Avg"
              value={0}
              icon={<IconChartBar size={18} />}
              empty
              emptyMessage="Need 3+ rounds"
              footnote={`${roundsLogged} of 3 rounds`}
            />
          )}

          {girValue != null ? (
            <MetricCard
              label="GIR %"
              value={Number(girValue.toFixed(0))}
              suffix="%"
              icon={<IconTarget size={18} />}
              goodDirection="up"
              delta={
                girDelta != null
                  ? { value: Number(girDelta.toFixed(0)), suffix: '%', label: 'last 5 rounds' }
                  : undefined
              }
              sparkline={
                girSeries.length >= 2 ? (
                  <Sparkline data={girSeries} goodDirection="up" label="Greens in regulation" />
                ) : undefined
              }
            />
          ) : (
            // Same MetricCard `empty` silhouette as the other null KPIs (P010) —
            // one tile vocabulary across the row, never a different Surface shape.
            <MetricCard
              label="GIR %"
              value={0}
              icon={<IconTarget size={18} />}
              empty
              emptyMessage="Need 3+ rounds"
              footnote={`${roundsLogged} of 3 rounds`}
            />
          )}

          {puttsValue != null ? (
            <MetricCard
              label="Putts / Rd"
              value={Number(puttsValue.toFixed(1))}
              decimals={1}
              icon={<IconGolf size={18} />}
              goodDirection="down"
              delta={
                puttsDelta != null
                  ? { value: Number(puttsDelta.toFixed(1)), label: 'last 5 rounds' }
                  : undefined
              }
              sparkline={
                puttsSeries.length >= 2 ? (
                  <Sparkline data={puttsSeries} goodDirection="down" label="Putts per round" />
                ) : undefined
              }
            />
          ) : (
            // Same MetricCard `empty` silhouette as the other null KPIs (P010).
            <MetricCard
              label="Putts / Rd"
              value={0}
              icon={<IconGolf size={18} />}
              empty
              emptyMessage="Need 3+ rounds"
              footnote={`${roundsLogged} of 3 rounds`}
            />
          )}

          {/* Roster is a real count (not a derived aggregate) — always honest. */}
          <MetricCard
            label="Roster"
            value={stats.rosterSize}
            icon={<IconUsers size={18} />}
            footnote={
              stats.activeQualifiers > 0
                ? `${stats.activeQualifiers} active ${stats.activeQualifiers === 1 ? 'qualifier' : 'qualifiers'}`
                : undefined
            }
          />
        </div>

        {/* Invite + roster-cap notices as quiet matte status, not heavy cards */}
        {showInviteNotice ? (
          <InlineNotice
            tone="info"
            icon={LucideUsers}
            title="Share your invite code"
            action={
              <Button variant="secondary" size="sm" onClick={handleCopy}>
                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                <span className="font-fw-mono tracking-[0.18em]">
                  {copied ? 'Copied' : team.join_code}
                </span>
              </Button>
            }
          >
            Players join from the welcome screen with this code.
          </InlineNotice>
        ) : null}
        {rosterFull ? (
          <InlineNotice tone="warning" title="Roster full">
            Your invite code is hidden because the roster has reached the 20-player limit.
          </InlineNotice>
        ) : null}
      </section>

      {/* ── 5 · RECENT ROUNDS — clean DataTable ────────────────────────────── */}
      <section aria-label="Recent rounds" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">Recent Rounds</h2>
          <Link
            href="/golf/dashboard/rounds"
            className="inline-flex items-center gap-1 font-fw-sans text-body-sm font-medium text-accent-700 hover:text-accent-600"
          >
            View all
            <IconArrowRight size={14} />
          </Link>
        </div>
        {/* Section hairline — more-green ruling. */}
        <div aria-hidden="true" className="h-px w-full bg-accent-300" />
        {recentRounds.length === 0 ? (
          <Surface elevation="border" padding="md">
            <EmptyState
              variant="subtle"
              icon={LucideFlag}
              title={range !== 'all' ? 'No rounds in this window' : 'No rounds logged yet'}
              description={
                range !== 'all'
                  ? 'Try a wider window, or have players log rounds from their dashboard.'
                  : 'Players can submit rounds from their dashboard — they’ll appear here.'
              }
            />
          </Surface>
        ) : (
          <DataTable<RoundRow>
            data={recentRounds.slice(0, 8)}
            columns={roundColumns}
            mobileCard={renderRoundMobileCard}
            ariaLabel="Recent team rounds"
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

      {/* ── 5.5 · ACTION ITEMS — tasks / updates / deadlines waiting ────────── */}
      <ActionItemsPanel items={enhancedData?.actionItems ?? []} />

      {/* ── 6 · TEAM region — Trend + Pulse + Top Performers (matte) ────────── */}
      <section aria-label="Team" className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Performance trend (reskin-preserve-logic: same teamScoringTrend) */}
        <div className="lg:col-span-3">
          {hasTrend ? (
            <TrendChart
              title="Performance Trend"
              overline="Team scoring average"
              data={trendPoints}
              valueFormatter={(v) => v.toFixed(1)}
              takeaway={trendTakeaway}
            />
          ) : (
            <Surface elevation="border" padding="md" className="flex flex-col gap-3">
              <h3 className="font-fw-sans text-h3 font-semibold text-text-primary">
                Performance Trend
              </h3>
              <InsufficientData
                title="Trend appears as rounds build"
                description="Trends need rounds across multiple months. Invite players and keep logging."
              />
              <div>
                <Button variant="secondary" size="sm" asChild>
                  <Link href="/golf/dashboard/roster">
                    <IconPlus size={16} />
                    <span>Invite Players</span>
                  </Link>
                </Button>
              </div>
            </Surface>
          )}
        </div>

        {/* Team pulse + top performers stacked */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <TeamPulsePanel pulse={enhancedData?.teamPulse} />

          <Surface elevation="border" padding="md" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-fw-sans text-h3 font-semibold text-text-primary">
                Top Performers
              </h3>
              <Link
                href="/golf/dashboard/stats/team"
                className="inline-flex items-center gap-1 font-fw-sans text-body-sm font-medium text-accent-700 hover:text-accent-600"
              >
                Rankings
                <IconArrowRight size={14} />
              </Link>
            </div>
            {topPlayers.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {topPlayers.slice(0, 5).map((p, i) => (
                  <li key={p.id}>
                    <Link
                      href={`/golf/dashboard/players/${p.id}/game?tab=scouting`}
                      prefetch={false}
                      className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                    >
                      <Inset
                        padding="sm"
                        className="flex items-center justify-between gap-3 transition-colors hover:bg-surface-hover"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span
                            className={cn(
                              'grid h-6 w-6 shrink-0 place-items-center rounded-full font-fw-mono text-caption font-medium tabular-nums',
                              i === 0
                                ? 'bg-accent-500 text-text-on-accent'
                                : 'bg-surface text-text-tertiary',
                            )}
                          >
                            {i + 1}
                          </span>
                          <span className="truncate font-fw-sans text-body font-medium text-text-primary">
                            {p.name}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-baseline gap-2">
                          <span className="font-fw-mono text-body font-medium tabular-nums text-text-primary">
                            {p.avg_score.toFixed(1)}
                          </span>
                          <span className="font-fw-sans text-caption text-text-tertiary">
                            {p.rounds} rd
                          </span>
                        </span>
                      </Inset>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <InsufficientData
                compact
                title="No leaderboard yet"
                description="Player averages appear once rounds are logged."
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
        <h3 className="font-fw-sans text-h3 font-semibold text-text-primary">Team Pulse</h3>
        {roundsThisWeek > 0 ? (
          <StatusPill tone="accent" dot>
            {roundsThisWeek} this week
          </StatusPill>
        ) : null}
      </div>

      {tracked === 0 ? (
        <InsufficientData
          compact
          title="No movement to read yet"
          description="Pulse compares recent rounds. It fills in as players log activity."
        />
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <Inset padding="sm" className="flex flex-col gap-1">
            <span className="font-fw-mono text-h3 font-medium tabular-nums text-fw-success">
              {improving}
            </span>
            <span className="font-fw-sans text-caption text-text-tertiary">Improving</span>
          </Inset>
          <Inset padding="sm" className="flex flex-col gap-1">
            <span className="font-fw-mono text-h3 font-medium tabular-nums text-text-secondary">
              {stable}
            </span>
            <span className="font-fw-sans text-caption text-text-tertiary">Stable</span>
          </Inset>
          <Inset padding="sm" className="flex flex-col gap-1">
            <span className="font-fw-mono text-h3 font-medium tabular-nums text-fw-warning">
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
              'font-fw-mono text-body-sm font-medium tabular-nums',
              // delta is a POSITIVE improvement magnitude (olderAvg - recentAvg),
              // so a positive delta means the player improved → success green.
              pulse.topMover.delta > 0 ? 'text-fw-success' : 'text-fw-warning',
            )}
          >
            {pulse.topMover.delta > 0 ? '−' : '+'}
            {Math.abs(pulse.topMover.delta).toFixed(1)}
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
            <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
              {events.length}
            </span>
          ) : null}
        </div>
        <Link
          href="/golf/dashboard/calendar"
          className="inline-flex items-center gap-1 font-fw-sans text-body-sm font-medium text-accent-700 hover:text-accent-600"
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
        <Surface elevation="border" padding="md">
          <EmptyState
            variant="subtle"
            icon={LucideCalendar}
            title="Clear schedule today"
            description="No events on the books — a good window for practice or recovery."
          />
        </Surface>
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

/* ──────────────────────────────────────────────────────────────────────────
 * Action Items — tasks / updates / deadlines waiting (F104). Ported from the
 * legacy ActionItemsCard in Fairway style. Reads ONLY the already-computed
 * `enhancedData.actionItems`; no refetch. Relative dates are deferred to the
 * client to avoid a hydration mismatch (server vs browser clock).
 * ────────────────────────────────────────────────────────────────────────── */

function actionItemHref(item: ActionItem): string {
  // P443: reference the SPECIFIC item, not just its containing list. The id is
  // carried as `?highlight=<id>` so the destination list can scroll-to / open
  // that item; the link never lands on the unfiltered list or a no-op self-link.
  const id = encodeURIComponent(item.id);
  if (item.type === 'task' || item.type === 'deadline') {
    return `/golf/dashboard/tasks?highlight=${id}`;
  }
  if (item.type === 'announcement') {
    return `/golf/dashboard/announcements?highlight=${id}`;
  }
  // Defensive fallback for any future item type — the tasks list is the most
  // relevant landing, never the old `/dashboard` self-link no-op.
  return '/golf/dashboard/tasks';
}

function formatRelativeDate(dateStr: string, now: Date): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays < 0) {
    const future = Math.abs(diffDays);
    if (future === 1) return 'Tomorrow';
    if (future < 7) return `In ${future}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** One action row — reused by the actionable-task list and the announcements
 *  strip below it. `now` is the client clock (null until mounted) so relative
 *  dates stay hydration-safe. */
function ActionItemRow({ item, now }: { item: ActionItem; now: Date | null }) {
  const isUrgent = item.priority === 'high' || item.priority === 'urgent';
  return (
    <li key={item.id} className="min-w-0">
      <Link
        href={actionItemHref(item)}
        className="block min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        {/* `overflow-hidden` is the hard backstop for the title's `truncate`
            below — without it, a long single-line title can bleed past this
            row's own rounded edge instead of ellipsizing at it (#957). */}
        <Inset
          padding="sm"
          className="flex min-w-0 items-start gap-3 overflow-hidden transition-colors hover:bg-surface-hover"
        >
          <span className="mt-0.5 shrink-0">
            {item.overdue ? (
              <IconAlertCircle size={16} className="text-fw-danger" />
            ) : item.type === 'announcement' ? (
              <IconBell size={16} className="text-text-tertiary" />
            ) : isUrgent ? (
              <IconAlertCircle size={16} className="text-fw-warning" />
            ) : (
              <IconClipboardList size={16} className="text-text-tertiary" />
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span
              className={cn(
                'truncate font-fw-sans text-body font-medium',
                item.overdue ? 'text-fw-danger' : 'text-text-primary',
              )}
            >
              {item.title}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <span
                className="font-fw-sans text-caption text-text-tertiary"
                suppressHydrationWarning
              >
                {now ? formatRelativeDate(item.date, now) : ''}
              </span>
              {item.overdue ? (
                <StatusPill tone="danger" dot={false} size="sm">
                  Overdue
                </StatusPill>
              ) : isUrgent ? (
                <StatusPill tone="warning" dot={false} size="sm">
                  {item.priority === 'urgent' ? 'Urgent' : 'High'}
                </StatusPill>
              ) : null}
            </span>
          </span>
        </Inset>
      </Link>
    </li>
  );
}

/** Exported for a deterministic render test (W1 count-coherence audit) — the
 *  header count badge must always describe exactly what's rendered below it.
 *
 *  Attention model (audit "five surfaces, one story"): this panel is the
 *  ACTIONABLE backlog only — tasks and deadlines. Its header badge counts
 *  exactly those, matching the hero's "needs you" total (which adds pending
 *  approvals, surfaced in their own banner above). Announcements are NOT
 *  actionable — they have no accept/resolve step — so they render as a clearly
 *  separated, uncounted "Announcements" strip and never inflate the backlog. */
export function ActionItemsPanel({ items }: { items: ActionItem[] }) {
  // Defer relative-date computation to the client to avoid a hydration mismatch.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
  }, []);

  const { actionable, announcements } = splitActionItems(items);
  const isEmpty = actionable.length === 0 && announcements.length === 0;

  return (
    <section aria-label="Action items" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">Action Items</h2>
          {actionable.length > 0 ? (
            <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
              {actionable.length}
            </span>
          ) : null}
        </div>
        <Link
          href="/golf/dashboard/tasks"
          className="inline-flex items-center gap-1 font-fw-sans text-body-sm font-medium text-accent-700 hover:text-accent-600"
        >
          Tasks
          <IconArrowRight size={14} />
        </Link>
      </div>
      {/* Section hairline — more-green ruling. */}
      <div aria-hidden="true" className="h-px w-full bg-accent-300" />

      {isEmpty ? (
        <Surface elevation="border" padding="md">
          <EmptyState
            variant="subtle"
            icon={LucideCheckCircle}
            title="All caught up"
            description="No tasks, updates or deadlines waiting right now."
          />
        </Surface>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Actionable tasks / deadlines — the backlog the header badge counts.
              Render the FULL list (W1 count-coherence fix: no slice(0, 6) that
              disagreed with its own header). The upstream builder already caps
              this list, so it stays a finite, calm digest. */}
          {actionable.length > 0 ? (
            <Surface elevation="border" padding="sm">
              <ul className="flex flex-col gap-2">
                {actionable.map((item) => (
                  <ActionItemRow key={item.id} item={item} now={now} />
                ))}
              </ul>
            </Surface>
          ) : (
            <Surface elevation="border" padding="md">
              <EmptyState
                variant="subtle"
                icon={LucideCheckCircle}
                title="No tasks or deadlines waiting"
                description="You're clear on tasks. Team announcements are below."
              />
            </Surface>
          )}

          {/* Announcements — informational, NOT part of the "needs you" count.
              Clearly labelled and separately counted so they never masquerade
              as backlog the coach has to clear. */}
          {announcements.length > 0 ? (
            <section aria-label="Announcements" className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <h3 className="font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">
                  Announcements
                </h3>
                <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
                  {announcements.length}
                </span>
              </div>
              <Surface elevation="border" padding="sm">
                <ul className="flex flex-col gap-2">
                  {announcements.map((item) => (
                    <ActionItemRow key={item.id} item={item} now={now} />
                  ))}
                </ul>
              </Surface>
            </section>
          ) : null}
        </div>
      )}
    </section>
  );
}
