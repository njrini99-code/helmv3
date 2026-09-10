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
 * FACELIFT PASS v2 (docs/design/fairway-facelift/screens/home.v2.md,
 * synthesized 2026-09-10 from the facelift design panel — supersedes the v1
 * coach-home.md 7/5-grid pass this file previously implemented). The v1 pass
 * fixed the twelve-card soup into a 7/5 grid, but the owner's complaint was
 * specific and still open: "so basic, just cards down, where is the
 * architecture." v2's fix is not more cards, it is a designed cockpit — a
 * stage that answers "what's on today, and does the team need me right now",
 * four distinct visual instruments carrying the page (never two identical
 * card shapes side by side), and a sticky toolbar giving the page structure
 * across a scroll instead of every fact living inside whichever card happens
 * to hold it:
 *
 *   • Stage — ViewHeader (unchanged) + a one-sentence verdict line built once
 *     in the parent from data already in `enhancedData` (no client-only
 *     timezone logic, so no hydration risk): events on today's schedule,
 *     the improving/declining pulse split, open CoachHelm signals.
 *   • Toolbar — sticky, bare frame: a signals `StatusPill` (the ONE fact
 *     promoted here) plus the performance-window control, demoted from the
 *     old "Team performance" card header into a page-level control that
 *     survives the scroll (Segmented on desktop, a Menu on phone, both in
 *     the DOM, CSS-gated).
 *   • Operations row (7/5) — Today (bare seam rows, an `AgendaStrip` hour
 *     rail on top — Today's own dominant-object status finally gets a real
 *     instrument instead of a plain list) beside "Who needs attention" (a
 *     MatrixBoard, which already paints its own ruled-grid card — the old
 *     outer Surface around it was a genuine nested-card violation, now
 *     removed). A rounded-list shape beside a bare ruled-grid shape — never
 *     two identical cards.
 *   • Instrument band — Team performance, promoted to its OWN full-width row
 *     below the operations row (this is the direct structural fix for two
 *     open REVIEW.md defects on this exact screen: the half-width Team
 *     performance card ran a StatMatrix box AND a chart box nested inside
 *     one outer card, and the shared grid row stretched short Today to match
 *     its height, leaving a ~340px hole). It is now one `InstrumentCluster`
 *     cockpit: a focal `InstrumentPanel tone="accent"` bezel (the page's ONE
 *     green panel) holding a `Readout` + a benchmarked `TrendChart`, a
 *     flanking rail of two neutral GIR/Putts panels, and a tertiary foot row
 *     of micro-readouts.
 *   • Ledger row (8/4) — Recent rounds (still the row's one boxed Surface,
 *     `TickerStrip` now colored by sign rather than one bar highlighted
 *     among nine identical dim ones) beside Activity (`NotificationsLatestModule`
 *     `frame="bare"`, matching Today's and Who-needs-attention's bare
 *     treatment — a rounded card beside a bare list, the ledger row's own
 *     shape contrast).
 *
 * DEVIATION from `docs/design/fairway-facelift/screens/coach-home.md`'s
 * original composition diagram (Today | Team pulse in row 1, Who-needs-
 * attention in row 2): home.v2.md deliberately re-pairs Today with Who-needs-
 * attention in row 1 and promotes Team performance to its own full-width
 * band. That IS the fix for the two REVIEW.md defects above — a half-width
 * chart card cannot be both compact and legible, a full-width band can be
 * both — and it is home.v2.md's explicit, documented decision, not a v1
 * carryover.
 *
 * DEVIATION (unchanged from v1, still applies): the screen spec's "Who needs
 * attention" board calls for a trend glyph + strokes-gained column per
 * player; the payload has no per-player decline list or SG figure, only the
 * best-5-by-average `topPlayers` array, so fabricating those columns would
 * mean inventing data. This keeps the honest ranking semantics and folds the
 * real aggregate pulse counts (improving/stable/declining) into the board's
 * KPI band instead.
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import nextDynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  ViewHeader,
  Surface,
  Inset,
  Segmented,
  Button,
  IconButton,
  Menu,
  StatusPill,
  Avatar,
  InlineNotice,
  EmptyState,
  InsufficientData,
  OnboardingStep,
  OnboardingSteps,
  Skeleton,
  Toolbar,
  InstrumentCluster,
  InstrumentPanel,
  Readout,
  type TrendPoint,
} from '@/components/fairway';
import {
  MatrixBoard,
  TickerStrip,
  AgendaStrip,
  type MatrixColumn,
  type MatrixBoardRow,
  type TickerItem,
  type AgendaStripEvent,
} from '@/components/fairway/modules';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
// The ONE series→delta→verdict reducer (AUDIT-0724 findings #2/#6/#7) — feeds
// the cockpit's Readout deltas from a single call, so a delta can never
// disagree with the qualitative direction the server-side payload already
// computed. Direct-file import (not the barrel) mirrors how MetricCard
// itself imports its trend classifier.
import { computeSeriesTrend } from '@/components/fairway/charts/seriesTrend';
import {
  IconUsers,
  IconCalendar,
  IconFlag,
  IconPlus,
  IconCopy,
  IconCheck,
  IconArrowRight,
  IconClock,
  IconMapPin,
  IconMoreHorizontal,
} from '@/components/icons';
import { formatTimeInTz, getCurrentDecimalHourInTz } from '@/lib/utils/timezone';
import { getGreeting, timeOfDayForHour } from '@/lib/utils/time-of-day';
import { Users as LucideUsers, Flag as LucideFlag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FairwayJoinRequestAlert } from '@/components/fairway/pages/roster/FairwayJoinRequestAlert';
import { NotificationsLatestModule } from '@/components/fairway/notifications';
import type { JoinRequestData } from '@/app/golf/actions/teams';
import type {
  CoachDashboardPayload,
  DashboardDateRange,
  TodayEvent,
} from '@/app/golf/actions/dashboard-data';
import type { CoachDashboardData } from '@/app/golf/(dashboard)/dashboard/components/coach-dashboard-types';
// `DaySchedule` (the standalone card component) is no longer rendered here —
// its "Schedule" card was merged into Today (see file doc). Its two pure
// grouping helpers are still the canonical "day key" / "day label" logic, so
// they're reused directly rather than re-derived. NOTE: this leaves the
// `DaySchedule` component itself with no remaining caller in the app
// (FairwayPlayerDashboard only imports the `DayScheduleEvent` type, never the
// component) — flagged as a dead-code candidate in the PR notes rather than
// deleted unilaterally, since it's a generically useful, fully-tested
// primitive that another screen may still want.
import { type DayScheduleEvent, dayKeyInTz, dayLabel } from './DaySchedule';
import { formatToPar } from '@/lib/golf/format-to-par';

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
 * Honest windowed delta + verdict over a metric's series (oldest → newest).
 * `computeSeriesTrend()` (charts/seriesTrend.ts) is the SAME split-half-
 * average comparison `computeTrend()`/`computeTrendHigherIsBetter()` already
 * use server-side (dashboard-data.ts) to classify the qualitative trend
 * arrow — recent-half average vs. older-half average — not a raw
 * first-vs-last endpoint diff.
 *
 * Requires ≥3 finite points (mirrors this page's own "Need 3+ rounds"
 * honesty gate) — fewer than that suppresses the hint entirely rather than
 * showing an unreliable 2-point comparison.
 */
function seriesDeltaLabel(points: number): string {
  return `last ${points} round${points === 1 ? '' : 's'}`;
}

/**
 * Minutes-from-midnight for an ISO instant, resolved in `tz` — the AgendaStrip
 * hour rail's own coordinate space. `hourCycle: 'h23'` (not `hour12: false`)
 * deliberately avoids the Intl "hour 24 at midnight" quirk some locales emit;
 * the `% 1440` below is a second, cheap guard against that same edge case.
 */
function minutesOfDayInTz(iso: string, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(new Date(iso));
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return (hour * 60 + minute) % 1440;
  } catch {
    return 0;
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * One fact in the opener's `meta` row — a leading icon and a count.
 *
 * The ViewHeader `meta` slot already sets the row's voice (caption size,
 * `text-text-tertiary`, wrap + gap), so this adds only the icon pairing and
 * `tabular-nums`. The figures sit next to each other and change between loads;
 * proportional digits would make them shuffle sideways as the numbers move.
 */
function MetaFact({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <span className="text-text-tertiary/70">{icon}</span>
      {children}
    </span>
  );
}

export function FairwayCoachDashboard({
  data,
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
  // The one new wire this pass adds (home.v2.md §2/§3) — reachable with no
  // new provider, since `NotificationBadgeProvider` already wraps this route
  // tree (`FairwayDashboardShell.tsx`); this file simply hadn't imported the
  // hook yet. Feeds the verdict line's signals clause and the toolbar's
  // signals chip from the SAME value, so the two can never disagree.
  const badges = useNotificationBadges();

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

  // Verdict line (home.v2.md §2) — one sentence answering "what's on today,
  // and does the team need me right now", built once here from data already
  // in `enhancedData`/`badges`. Count only, no per-event time formatting, so
  // this needs no client-resolved timezone (unlike `TodayPanel`'s own `tz`
  // state) and carries no hydration risk. Honest: the pulse clause is
  // omitted (not rendered as "0 improving, 0 sliding") when nothing has been
  // classified yet, and the signals clause is omitted at zero — never a
  // claim the data can't support.
  const verdictLine = useMemo(() => {
    const eventCount = enhancedData?.todayEvents.length ?? 0;
    const sentences: string[] = [
      eventCount > 0
        ? `${eventCount} ${eventCount === 1 ? 'event' : 'events'} on today's schedule.`
        : "Nothing on today's schedule.",
    ];

    const pulse = enhancedData?.teamPulse;
    const tracked = pulse ? pulse.improving + pulse.stable + pulse.declining : 0;
    if (pulse && tracked > 0) {
      sentences.push(
        `${pulse.improving} ${pulse.improving === 1 ? 'player' : 'players'} improving, ${pulse.declining} sliding.`,
      );
    }

    if (badges.coachhelm > 0) {
      sentences.push(`${badges.coachhelm} ${badges.coachhelm === 1 ? 'signal' : 'signals'} waiting on you.`);
    }

    return sentences.join(' ');
  }, [enhancedData?.todayEvents.length, enhancedData?.teamPulse, badges.coachhelm]);

  const rangeLabel = RANGE_OPTIONS.find((o) => o.value === range)?.label ?? '';

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

  // DaySchedule feed: merge the RPC-sourced `todayEvents` (full day, incl.
  // RSVP tallies — used for the Today panel's featured/quiet-row rendering)
  // with `calendarEvents` (future, start_time >= now) from the SAME
  // `golf_events` table, deduped by id, so the merged panel below can derive
  // its own "next 3 days" grouping without a second fetch. Both are already
  // fetched by dashboard-data.ts. (Hook lives above the coach-without-team
  // early return below — it must run on every render, team or not.)
  const scheduleEvents: DayScheduleEvent[] = useMemo(() => {
    const toScheduleEvent = (e: { id: string; title: string; event_type: string; start_time: string; end_time?: string | null; location: string | null }): DayScheduleEvent => ({
      id: e.id,
      title: e.title,
      event_type: e.event_type,
      start_time: e.start_time,
      end_time: e.end_time,
      location: e.location,
    });
    const merged = new Map<string, DayScheduleEvent>();
    for (const e of enhancedData?.todayEvents ?? []) merged.set(e.id, toScheduleEvent(e));
    for (const e of enhancedData?.calendarEvents ?? []) {
      if (!merged.has(e.id)) merged.set(e.id, toScheduleEvent(e));
    }
    return Array.from(merged.values());
  }, [enhancedData?.todayEvents, enhancedData?.calendarEvents]);

  // Recent-rounds TickerStrip (home.v2.md §6): the last 10 scored rounds,
  // oldest → newest, min–max normalized on `total_to_par` WITHIN this
  // window — same convention as FairwayRoundsLibrary's desktop chronology
  // strip, so a coach who has seen one strip reads the other identically.
  // `recentRounds` arrives newest-first (dashboard-data.ts orders
  // `round_date desc`); this reverses the latest-10 slice into chronological
  // order for the strip. Each bar's `tone` is the SAME to-par sign
  // `formatToPar`/the row list's own `StatusPill` below already color by
  // (under par → good/green, over → warning, even → neutral) — the strip
  // reads as a form line by sign, replacing the old "one bar highlighted,
  // nine identical dim ones" wash (REVIEW.md coach-home/desktop). (Hook
  // lives above the coach-without-team early return below.)
  const tickerItems: TickerItem[] = useMemo(() => {
    const windowRounds = recentRounds.slice(0, 10).slice().reverse();
    if (windowRounds.length < 2) return [];
    const toPars = windowRounds.map((r) => r.total_to_par ?? 0);
    const min = Math.min(...toPars);
    const max = Math.max(...toPars);
    const spread = Math.max(1, max - min);
    return windowRounds.map((r) => {
      const tp = r.total_to_par ?? 0;
      return {
        label: String(r.total_score ?? '—'),
        // best (lowest to-par) → 100%, worst (highest to-par) → 40%.
        heightPct: 100 - ((tp - min) / spread) * 60,
        tone: tp < 0 ? 'good' : tp > 0 ? 'over' : 'even',
      };
    });
  }, [recentRounds]);

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

  // Metric micro-trends (F045/F046): the payload already holds a per-metric
  // series (oldest → newest). The StatMatrix hint renders the honest
  // split-half delta computed here — ONE function, ONE series, so the hint
  // can never contradict the qualitative direction the server already shipped
  // (AUDIT-0724 #2).
  const scoringSeries = enhancedData?.sparklines.scoringAvg.sparkline ?? [];
  const girSeries = enhancedData?.sparklines.girPct.sparkline ?? [];
  const puttsSeries = enhancedData?.sparklines.puttsPerRound.sparkline ?? [];
  const scoringDelta = computeSeriesTrend(scoringSeries, { goodDirection: 'down' });
  const girDelta = computeSeriesTrend(girSeries, { goodDirection: 'up' });
  const puttsDelta = computeSeriesTrend(puttsSeries, { goodDirection: 'down' });

  // Cockpit benchmark line (home.v2.md §5) — `TrendChart` already supports a
  // dashed `benchmark` reference line; `stats.previousAverage` is already
  // fetched by dashboard-data.ts and, before this pass, unused anywhere in
  // this file. Falling back to the current average when there's no prior
  // period avoids a benchmark line drawn exactly on top of the series (which
  // reads as a bug, not a baseline). Only passed to TrendChart when finite —
  // never a fabricated reference.
  const benchmarkValue = enhancedData?.stats.previousAverage ?? enhancedData?.stats.teamScoringAverage ?? null;

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
  //
  // DEVIATION (coach-home.md STATES/Tertiary): threshold changed from the
  // legacy `< 20` to the spec's `< 3` — the invite block is now a compact row
  // for a brand-new team, not a standing notice for anything short of a full
  // roster.
  const showInviteNotice =
    !!team.join_code && team.join_code !== 'DEMO01' && stats.rosterSize != null && stats.rosterSize < 3;
  const rosterFull =
    !!team.join_code && team.join_code !== 'DEMO01' && stats.rosterSize != null && stats.rosterSize >= 20;
  const canInvite = !!team.join_code && team.join_code !== 'DEMO01';

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
  // here the FAB sits directly over whatever renders last (Recent Rounds)
  // instead of merely floating past the end of a longer, scrolled page.
  // pb-28 (112px) clears that 80px zone with margin.
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 overflow-x-clip px-5 pt-8 pb-8 md:gap-10 md:px-8 md:pt-10 md:pb-28">
      {/* ── 1 · OPENER — the warm plinth (DESIGN-SYSTEM §4.1, ONE per page) ──
          • EYEBROW carries the DATE, formatted server-side in the team's
            timezone — it pairs with the time-of-day greeting directly under
            it.
          • PRIMARY ACTION is "New event" (coach-home.md): the single most
            common thing a coach does from this page's action cluster is put
            something on the calendar, so it gets the one pill CTA. It links
            to the calendar route — see the RISKS note below the component:
            the calendar has no URL-addressable "open the composer" deep
            link, so this opens the page rather than the composer itself.
          • Add Player / Qualifiers / Invite — all promoted actions the old
            hero rendered as loose buttons/cards — now live in ONE overflow
            Menu beside the primary action, per coach-home.md's "Menu:
            Add player, Qualifiers, Invite".
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
            <>
              <MetaFact icon={<IconUsers size={14} aria-hidden />}>
                {stats.rosterSize} {stats.rosterSize === 1 ? 'player' : 'players'}
              </MetaFact>
              <MetaFact icon={<IconCalendar size={14} aria-hidden />}>
                {stats.upcomingEvents} upcoming{' '}
                {stats.upcomingEvents === 1 ? 'event' : 'events'}
              </MetaFact>
              <MetaFact icon={<IconFlag size={14} aria-hidden />}>
                {stats.activeQualifiers} active{' '}
                {stats.activeQualifiers === 1 ? 'qualifier' : 'qualifiers'}
              </MetaFact>
            </>
          )
        }
        secondaryActions={
          <Menu
            ariaLabel="Dashboard actions"
            align="end"
            trigger={
              <IconButton variant="secondary" size="md" aria-label="More actions">
                <IconMoreHorizontal size={18} />
              </IconButton>
            }
          >
            <Menu.Item icon={<IconPlus size={16} />} onSelect={() => router.push('/golf/dashboard/roster')}>
              Add player
            </Menu.Item>
            <Menu.Item icon={<IconFlag size={16} />} onSelect={() => router.push('/golf/dashboard/qualifiers')}>
              Qualifiers
            </Menu.Item>
            {canInvite ? (
              <>
                <Menu.Separator />
                <Menu.Item
                  icon={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  onSelect={(e) => {
                    e.preventDefault();
                    void handleCopy();
                  }}
                >
                  {copied ? 'Copied' : 'Invite players'}
                </Menu.Item>
              </>
            ) : null}
          </Menu>
        }
        primaryAction={
          <Button variant="primary" asChild>
            <Link href="/golf/dashboard/calendar">
              <IconPlus size={16} />
              <span>New event</span>
            </Link>
          </Button>
        }
      />

      {/* Roster join-request approvals — preserved logic (getTeamJoinRequests / roster.ts),
          rendered through the Fairway warning InlineNotice so the dashboard stays one
          calm matte surface (P003). `joinRequests` is fetched server-side by the RSC
          page and passed down (see FairwayCoachDashboardProps) so this renders from
          data already present at first paint instead of self-fetching on mount —
          the banner no longer flips in after hydration and reflows everything below
          the fold. Falls back to the component's own self-fetch when the prop is
          omitted (e.g. any other caller that hasn't wired it). */}
      <FairwayJoinRequestAlert requests={joinRequests} />

      {/* ── 2 · STAGE — the verdict line (home.v2.md §2), plain text, never a
          numeral standing alone (that would read as the banned hero-metric
          template). Built once above from data already in `enhancedData` /
          `badges` — no client-only timezone logic here, so no hydration
          risk. */}
      <p className="line-clamp-2 font-fw-display text-h3 text-text-primary md:text-h2">
        {verdictLine}
      </p>

      {/* ── 3 · TOOLBAR (sticky, bare) — home.v2.md §3. The signals chip is
          deliberately the ONLY fact promoted here; players/events/qualifiers
          stay in the masthead above, not duplicated. `stickyTop` uses the
          SAME top-bar-clearing calc `FairwayCoachRoster.tsx` already relies
          on, so this pins at a proven-safe offset rather than a new one. The
          Segmented (desktop) and the Menu (phone) both stay in the DOM —
          CSS decides which paints, so there is no client-only breakpoint
          branch and nothing here can disagree between server and client.

          Wrapped in its own `<div>` (no gap/margin of its own): `Toolbar`
          renders a two-element Fragment when `sticky` (a zero-height
          intersection sentinel ahead of the row itself) — as a DIRECT child
          of this page's `gap-8`/`gap-10` flex column, the sentinel and the
          row would each land as their OWN flex item and each earn a full
          flex gap, opening a ~80px blank band between the verdict line and
          the toolbar's controls that has nothing in it. One wrapper div
          absorbs the Fragment so the flex column only ever sees a single
          item here — the same wrapping `FairwayCalendarHero.tsx` already
          uses around its own sticky `Toolbar`. */}
      <div>
        <Toolbar
          sticky
          stickyTop="calc(var(--golf-mobile-header-offset) + var(--fw-hub-subnav-offset, 0px))"
          aria-label="Dashboard toolbar"
          leading={
            badges.coachhelm > 0 ? (
              <Link href="/golf/dashboard/intelligence">
                <StatusPill tone="warning" dot>
                  {badges.coachhelm} {badges.coachhelm === 1 ? 'signal' : 'signals'}
                </StatusPill>
              </Link>
            ) : undefined
          }
          viewToggle={
            <>
              <div className="hidden md:flex">
                <Segmented
                  value={range}
                  onValueChange={handleRangeChange}
                  options={RANGE_OPTIONS}
                  aria-label="Performance window"
                  size="sm"
                />
              </div>
              <div className="flex md:hidden">
                <Menu
                  ariaLabel="Performance window"
                  align="end"
                  trigger={
                    <Button variant="secondary" size="sm">
                      <span>Window · {rangeLabel}</span>
                    </Button>
                  }
                >
                  {RANGE_OPTIONS.map((option) => (
                    <Menu.Item key={option.value} onSelect={() => handleRangeChange(option.value)}>
                      {option.label}
                    </Menu.Item>
                  ))}
                </Menu>
              </div>
            </>
          }
        />
      </div>

      {/* ── 4 · OPERATIONS ROW (7/5) — Today | Who needs attention. A rounded
          seam-row shape beside a bare ruled-grid shape — never two identical
          cards. `lg:items-start` (no row-stretch): with Team performance now
          living in its own full-width band below, neither column is forced
          tall by a chart anymore. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-7">
          <TodayPanel
            todayEvents={enhancedData?.todayEvents ?? []}
            scheduleEvents={scheduleEvents}
            scheduleError={enhancedData?.todayScheduleError ?? false}
            timezone={enhancedData?.timezone}
          />
        </div>

        <div className="flex flex-col gap-4 lg:col-span-5">
          <WhoNeedsAttentionBoard
            pulse={enhancedData?.teamPulse}
            topPlayers={topPlayers}
            teamStatsUnavailable={teamStatsUnavailable}
          />
          {/* Invite + roster-cap notices — quiet matte status rows directly
              under the board (unchanged position/content, home.v2.md §4). */}
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
        </div>
      </div>

      {/* ── 5 · INSTRUMENT BAND — Team performance, full width (home.v2.md
          §5). The one genuinely new visual moment: a real cockpit
          (InstrumentCluster) replaces the old half-width StatMatrix-plus-
          chart-in-one-card, which is the direct structural fix for the
          nested-card and "340px hole" defects REVIEW.md flagged on this
          exact screen. */}
      <TeamPerformanceCluster
        rangeLabel={rangeLabel}
        scoringAvg={scoringAvg}
        scoringDelta={scoringDelta}
        roundsLogged={roundsLogged}
        girValue={girValue}
        girDelta={girDelta}
        puttsValue={puttsValue}
        puttsDelta={puttsDelta}
        hasTrend={hasTrend}
        trendPoints={trendPoints}
        trendTakeaway={trendTakeaway}
        teamStatsUnavailable={teamStatsUnavailable}
        range={range}
        onWidenWindow={() => handleRangeChange('all')}
        benchmarkValue={benchmarkValue}
        signalsCount={badges.coachhelm}
        roundsThisWeek={enhancedData?.teamPulse.roundsThisWeek ?? null}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        <section aria-label="Recent rounds" className="flex flex-col gap-3 lg:col-span-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">Recent Rounds</h2>
            <Link
              href="/golf/dashboard/rounds"
              className="inline-flex items-center gap-1 py-3 -my-3 font-fw-sans text-body-sm font-medium text-accent-700 hover:text-accent-600"
            >
              View all
              <IconArrowRight size={14} />
            </Link>
          </div>
          {/* Section hairline — more-green ruling. */}
          <div aria-hidden="true" className="h-px w-full bg-accent-300" />
          {recentRounds.length === 0 ? (
            <Surface elevation="border" padding="sm">
              {/* `teamStatsUnavailable` says a read behind the round data FAILED.
                  Without it, a lock wait or timeout rendered "No rounds logged
                  yet" to a team with a full season on file — the empty state and
                  the failure state were the same screen. */}
              {teamStatsUnavailable ? (
                <EmptyState
                  variant="subtle"
                  icon={LucideFlag}
                  title="Couldn’t load rounds"
                  description="Something went wrong reading this team’s rounds. Refresh to try again — nothing has been lost."
                />
              ) : (
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
              )}
            </Surface>
          ) : (
            <Surface elevation="border" padding="sm" className="flex flex-col gap-4">
              {tickerItems.length >= 2 ? (
                <div className="hidden md:block">
                  <TickerStrip items={tickerItems} />
                </div>
              ) : null}
              <ul className="flex flex-col">
                {recentRounds.slice(0, 10).map((r) => (
                  <li key={r.id}>
                    {/* Every row is the obvious next action: open that round's
                        detail (the route authorizes a coach for any team
                        player's round) (P005). */}
                    <Link
                      href={`/golf/dashboard/rounds/${r.id}`}
                      className="flex items-center gap-3 rounded-fw-sm border-t border-border-subtle px-1 py-2.5 transition-colors duration-150 first:border-t-0 hover:bg-surface-hover"
                    >
                      <Avatar decorative
                        name={r.player_name}
                        src={r.player_avatar_url}
                        size="sm"
                        className="shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
                          {r.player_name}
                        </p>
                        <p className="truncate font-fw-sans text-caption text-text-tertiary">
                          {toTitleCase(r.course_name)} · {shortDate(r.round_date)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-baseline gap-2">
                        <span className="font-fw-mono text-body font-medium tabular-nums text-text-primary">
                          {r.total_score}
                        </span>
                        <StatusPill
                          tone={r.total_to_par < 0 ? 'accent' : r.total_to_par > 0 ? 'warning' : 'neutral'}
                          size="sm"
                          dot={false}
                          className="font-fw-mono tabular-nums"
                        >
                          {formatToPar(r.total_to_par)}
                        </StatusPill>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Surface>
          )}
        </section>

        {/* Activity — `frame="bare"` (home.v2.md §6): the module's own
            bordered Surface is skipped so this reads as a bare seam-row
            list, the same treatment Today and Who-needs-attention already
            use. This is what makes the ledger row read as two different
            objects (a rounded card, a bare list), not two identical cards.
            Self-fetching, honest-empty (renders nothing while loading or
            when genuinely empty), unchanged. */}
        <div className="lg:col-span-4">
          <NotificationsLatestModule frame="bare" />
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Who needs attention — a MatrixBoard whose KPI band is the aggregate pulse
 * counts (improving/stable/declining, honest even at zero) and whose ranked
 * rows are the top-5 scoring average leaderboard. Renamed from "Team pulse"
 * (home.v2.md §4): `docs/design/fairway-facelift/screens/coach-home.md`'s
 * own composition diagram already named this section "Who needs attention";
 * the shipped code had drifted to "Team pulse". This is a correction, not a
 * new invention.
 *
 * DEVIATION (unchanged from the original pass): the screen spec calls for a
 * board with a trend glyph + strokes-gained column, the 5 players most in
 * need of a look. `dashboard-data.ts` computes that judgment per player
 * (`computeScoringTrendFromRounds`) but only ever folds it into the three
 * aggregate counters below — there is no per-player decline list, and no
 * strokes-gained figure anywhere in this payload. Coding that column would
 * mean inventing data client-side (or duplicating a different classifier
 * over `recentRounds`, a cross-player latest-N slice with no real per-player
 * baseline window, which would silently disagree with the canonical trend
 * classifier every other surface uses). So the board renders the one
 * honestly-rankable list the payload provides (`topPlayers`, best-5 by
 * scoring average) and gives the real pulse counts a home in the KPI band
 * MatrixBoard is already built for, instead of fabricating a fourth/fifth
 * column.
 * ────────────────────────────────────────────────────────────────────────── */

function WhoNeedsAttentionBoard({
  pulse,
  topPlayers,
  teamStatsUnavailable,
}: {
  pulse?: CoachDashboardPayload['teamPulse'];
  topPlayers: CoachDashboardData['topPlayers'];
  teamStatsUnavailable: boolean;
}) {
  const improving = pulse?.improving ?? 0;
  const stable = pulse?.stable ?? 0;
  const declining = pulse?.declining ?? 0;
  const roundsThisWeek = pulse?.roundsThisWeek ?? 0;
  const tracked = improving + stable + declining;
  const ranked = topPlayers.slice(0, 5);

  const columns: MatrixColumn[] = [
    { key: 'player', label: 'Player' },
    { key: 'avg', label: 'Avg', align: 'center' },
    { key: 'rounds', label: 'Rounds', align: 'center' },
  ];

  const rows: MatrixBoardRow[] = ranked.map((p, i) => ({
    id: p.id,
    ariaLabel: `${p.name}, average ${p.avg_score.toFixed(1)} over ${p.rounds} ${p.rounds === 1 ? 'round' : 'rounds'}`,
    cells: [
      <span key="player" className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn(
            'grid h-6 w-6 shrink-0 place-items-center rounded-full font-fw-mono text-caption font-medium tabular-nums',
            i === 0 ? 'bg-accent-650 text-text-on-accent' : 'bg-surface-sunken text-text-tertiary',
          )}
        >
          {i + 1}
        </span>
        <span className="truncate font-fw-sans text-body-sm font-medium text-text-primary">{p.name}</span>
      </span>,
      <span key="avg" className="font-fw-mono text-body-sm font-medium tabular-nums text-text-primary">
        {p.avg_score.toFixed(1)}
      </span>,
      <span key="rounds" className="font-fw-sans text-caption tabular-nums text-text-tertiary">
        {p.rounds} rd
      </span>,
    ],
    expand: (
      <Link
        href={`/golf/dashboard/players/${p.id}/game?tab=scouting`}
        prefetch={false}
        className="inline-flex items-center gap-1 font-fw-sans text-body-sm font-medium text-accent-700 hover:text-accent-600"
      >
        Open profile
        <IconArrowRight size={14} />
      </Link>
    ),
  }));

  return (
    <section aria-label="Who needs attention" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">Who needs attention</h2>
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
      {/* Section hairline — same bare-seam-section grammar Today and Recent
          rounds use (home.v2.md §4: "heading + hairline + the board's own
          ruled-grid card"). `MatrixBoard` paints its own full card chrome
          below, so this section carries NO outer Surface — the old wrapper
          was a genuine nested-card violation. */}
      <div aria-hidden="true" className="h-px w-full bg-accent-300" />

      {tracked === 0 ? (
        <InsufficientData
          compact
          title="No movement to read yet"
          description={
            roundsThisWeek > 0
              ? `${roundsThisWeek} round${roundsThisWeek === 1 ? '' : 's'} logged this week — not enough yet to classify movement. Pulse compares recent rounds against each player's baseline.`
              : 'Pulse compares recent rounds. It fills in as players log activity.'
          }
        />
      ) : null}

      {ranked.length > 0 ? (
        <MatrixBoard
          kpis={tracked > 0 ? [
            { label: 'Improving', value: improving },
            { label: 'Stable', value: stable },
            { label: 'Declining', value: declining },
          ] : []}
          columns={columns}
          rows={rows}
        />
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
              pulse.topMover.delta > 0 ? 'text-fw-success-ink' : 'text-fw-warning-ink',
            )}
          >
            {pulse.topMover.delta > 0 ? '−' : '+'}
            {Math.abs(pulse.topMover.delta).toFixed(1)}
          </span>
        </Inset>
      ) : null}

      <div className="flex justify-end">
        <Link
          href="/golf/dashboard/stats/team"
          className="inline-flex items-center gap-1 py-1 font-fw-sans text-body-sm font-medium text-accent-700 hover:text-accent-600"
        >
          Rankings
          <IconArrowRight size={14} />
        </Link>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Team performance — the cockpit (home.v2.md §5). Extracted into its own
 * function, same convention `WhoNeedsAttentionBoard` already uses, since it
 * is now a full-width row of its own rather than inline half-width markup.
 * `InstrumentCluster`/`InstrumentPanel`/`Readout` are registry archetype C
 * (analytical instrument); this page is archetype A (intelligence overview).
 * Deliberate cross-archetype use — the same kind of documented deviation
 * `WhoNeedsAttentionBoard` above already carries for its own MatrixBoard
 * reading.
 * ────────────────────────────────────────────────────────────────────────── */

function TeamPerformanceCluster({
  rangeLabel,
  scoringAvg,
  scoringDelta,
  roundsLogged,
  girValue,
  girDelta,
  puttsValue,
  puttsDelta,
  hasTrend,
  trendPoints,
  trendTakeaway,
  teamStatsUnavailable,
  range,
  onWidenWindow,
  benchmarkValue,
  signalsCount,
  roundsThisWeek,
}: {
  rangeLabel: string;
  scoringAvg: number | null;
  scoringDelta: ReturnType<typeof computeSeriesTrend>;
  roundsLogged: number;
  girValue: number | null;
  girDelta: ReturnType<typeof computeSeriesTrend>;
  puttsValue: number | null;
  puttsDelta: ReturnType<typeof computeSeriesTrend>;
  hasTrend: boolean;
  trendPoints: TrendPoint[];
  trendTakeaway?: string;
  teamStatsUnavailable: boolean;
  range: DashboardDateRange;
  onWidenWindow: () => void;
  benchmarkValue: number | null;
  signalsCount: number;
  /** Nullable — null means the count query failed. Omit the tertiary
   *  readout entirely rather than render a fabricated 0. */
  roundsThisWeek: number | null;
}) {
  const tertiary: React.ReactNode[] = [
    <Readout key="rounds" size="sm" label="Rounds logged" value={roundsLogged} />,
    <Link key="signals" href="/golf/dashboard/intelligence" className="block">
      <Readout size="sm" label="Signals" value={signalsCount} />
    </Link>,
  ];
  if (roundsThisWeek != null) {
    tertiary.push(<Readout key="week" size="sm" label="Rounds this week" value={roundsThisWeek} />);
  }

  return (
    <section aria-label="Team performance">
      <InstrumentCluster
        balance="focal"
        primary={
          <InstrumentPanel tone="accent" depth="raised" eyebrow={`TEAM SCORING · ${rangeLabel}`}>
            <Readout
              size="lg"
              value={scoringAvg ?? undefined}
              format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
              state={scoringAvg == null ? 'awaiting' : 'live'}
              delta={
                scoringDelta
                  ? { value: scoringDelta.value, caption: seriesDeltaLabel(scoringDelta.points) }
                  : undefined
              }
            />
            {hasTrend ? (
              <div className="mt-5">
                <TrendChart
                  title="Performance Trend"
                  overline="Team scoring average"
                  data={trendPoints}
                  valueFormatter={(v) => v.toFixed(1)}
                  takeaway={trendTakeaway}
                  benchmark={
                    benchmarkValue != null && Number.isFinite(benchmarkValue)
                      ? { value: benchmarkValue, label: 'Prior period' }
                      : undefined
                  }
                />
              </div>
            ) : (
              // a narrow window is not an empty roster — telling a coach with
              // 7 players and 90 rounds to "invite players" because they
              // filtered to 7 days reads as the product not knowing its own
              // state (audit 2026-07-24, H5).
              <div className="mt-5 flex flex-col gap-3">
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
                <div>
                  {range !== 'all' ? (
                    <Button variant="secondary" size="sm" onClick={onWidenWindow}>
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
              </div>
            )}
          </InstrumentPanel>
        }
        secondary={[
          <InstrumentPanel key="gir" depth="base" eyebrow={`GIR · ${rangeLabel}`}>
            <Readout
              size="md"
              value={girValue ?? undefined}
              unit="%"
              state={girValue == null ? 'awaiting' : 'live'}
              delta={girDelta ? { value: girDelta.value, caption: seriesDeltaLabel(girDelta.points) } : undefined}
            />
          </InstrumentPanel>,
          <InstrumentPanel key="putts" depth="base" eyebrow={`Putts/rd · ${rangeLabel}`}>
            <Readout
              size="md"
              value={puttsValue ?? undefined}
              state={puttsValue == null ? 'awaiting' : 'live'}
              delta={
                puttsDelta ? { value: puttsDelta.value, caption: seriesDeltaLabel(puttsDelta.points) } : undefined
              }
            />
          </InstrumentPanel>,
        ]}
        tertiary={tertiary}
        tertiaryColumns={3}
      />
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Today — the dominant object (SCREEN §"Dominant object"). One matte Surface
 * holds the day's current/next event large, any remaining today events and
 * the next 3 days as quiet seam rows under a hairline. A genuinely empty
 * near-term schedule (nothing today AND nothing in the next 3 days) is one
 * quiet text line — never a notice card.
 *
 * Reads ONLY already-computed props (`enhancedData.todayEvents`, the merged
 * `scheduleEvents`); no refetch. Time labels/day grouping are deferred to the
 * client (resolved timezone) to avoid a hydration mismatch between server and
 * browser timezones — same pattern the legacy TodayPanel/DaySchedule used.
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

/** Fields both `TodayEvent` and `DayScheduleEvent` carry — the common shape
 *  the two row renderers below need, so one component serves either source. */
interface ScheduleRowData {
  id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time?: string | null;
  location?: string | null;
  rsvp_yes?: number;
  rsvp_total?: number;
}

/** The single "now/next" event, rendered large (SCREEN "Dominant object"). */
function FeaturedEventRow({ event, tz }: { event: ScheduleRowData; tz: string | null }) {
  const tone = EVENT_TONE[event.event_type] ?? 'neutral';
  const typeLabel = EVENT_LABEL[event.event_type] ?? 'Event';
  return (
    <Inset padding="md" className="flex flex-col gap-2 shadow-[inset_3px_0_0_var(--fw-color-accent-500)]">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 truncate font-fw-sans text-h3 font-semibold text-text-primary">
          {event.title}
        </span>
        <StatusPill tone={tone} dot={false}>
          {typeLabel}
        </StatusPill>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-fw-sans text-body-sm text-text-secondary">
        <span className="inline-flex items-center gap-1.5 font-fw-mono tabular-nums" suppressHydrationWarning>
          <IconClock size={14} />
          {tz ? (
            <>
              {formatTimeInTz(event.start_time, tz)}
              {event.end_time ? ` – ${formatTimeInTz(event.end_time, tz)}` : ''}
            </>
          ) : null}
        </span>
        {event.location ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <IconMapPin size={14} />
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
  );
}

/** A compact seam row — used for both "later today" and "next 3 days". */
function QuietEventRow({ event, tz }: { event: ScheduleRowData; tz: string | null }) {
  const tone = EVENT_TONE[event.event_type] ?? 'neutral';
  const typeLabel = EVENT_LABEL[event.event_type] ?? 'Event';
  return (
    <div className="flex min-w-0 items-start gap-3 border-t border-border-subtle px-0.5 py-2 first:border-t-0">
      <span
        className="w-14 shrink-0 pt-0.5 font-fw-mono text-caption tabular-nums text-text-tertiary"
        suppressHydrationWarning
      >
        {tz ? formatTimeInTz(event.start_time, tz) : ''}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <span className="min-w-0 truncate font-fw-sans text-body-sm font-medium text-text-primary">
            {event.title}
          </span>
          <StatusPill tone={tone} dot={false} size="sm" className="shrink-0">
            {typeLabel}
          </StatusPill>
        </div>
        {event.location ? (
          <span className="mt-0.5 flex min-w-0 items-center gap-1 font-fw-sans text-caption text-text-tertiary">
            <IconMapPin size={12} />
            <span className="truncate">{event.location}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

interface NextDayGroup {
  key: string;
  label: string;
  events: DayScheduleEvent[];
}

/** Group `events` (today inclusive) into the earliest `limit` day-buckets
 *  AFTER today, using the exact same `dayKeyInTz`/`dayLabel` helpers
 *  DaySchedule's own grouping is built on — so "Tomorrow" / a dated label
 *  here can never disagree with what that primitive would have shown. */
function useNextDayGroups(events: DayScheduleEvent[], tz: string | null, limit: number): NextDayGroup[] {
  return useMemo(() => {
    if (!tz) return [];
    const todayKey = dayKeyInTz(new Date().toISOString(), tz);
    const groups = new Map<string, DayScheduleEvent[]>();
    for (const e of events) {
      const key = dayKeyInTz(e.start_time, tz);
      if (key === todayKey) continue;
      const bucket = groups.get(key);
      if (bucket) bucket.push(e);
      else groups.set(key, [e]);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, limit)
      .map(([key, evs]) => ({
        key,
        label: dayLabel(key, todayKey),
        events: evs.slice().sort((a, b) => a.start_time.localeCompare(b.start_time)),
      }));
  }, [events, tz, limit]);
}

function TodayPanel({
  todayEvents,
  scheduleEvents,
  scheduleError = false,
  timezone,
}: {
  todayEvents: TodayEvent[];
  scheduleEvents: DayScheduleEvent[];
  scheduleError?: boolean;
  timezone?: string;
}) {
  // Resolve the display timezone on the client (Intl may differ between server
  // and browser); render time labels only after mount to avoid React #418.
  const [tz, setTz] = useState<string | null>(null);
  useEffect(() => {
    setTz(timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, [timezone]);

  const sortedToday = useMemo(
    () => todayEvents.slice().sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [todayEvents],
  );
  const featured = sortedToday[0];
  const restToday = sortedToday.slice(1);
  const nextDayGroups = useNextDayGroups(scheduleEvents, tz, 3);

  const todayIsClear = sortedToday.length === 0;
  const nothingAtAll = todayIsClear && nextDayGroups.length === 0;

  // AgendaStrip feed (home.v2.md §4) — mount-gated on `tz` exactly like the
  // row labels below (`formatTimeInTz`/`getCurrentDecimalHourInTz`), so
  // server and client never disagree. Same `EVENT_TONE` map every row below
  // already uses — no new tone vocabulary.
  const agendaEvents: AgendaStripEvent[] = useMemo(() => {
    if (!tz) return [];
    return sortedToday.map((event) => {
      const startMinutes = minutesOfDayInTz(event.start_time, tz);
      const endMinutes = event.end_time ? minutesOfDayInTz(event.end_time, tz) : startMinutes;
      return {
        id: event.id,
        label: event.title,
        startMinutes,
        endMinutes: endMinutes >= startMinutes ? endMinutes : startMinutes,
        tone: EVENT_TONE[event.event_type] ?? 'neutral',
      };
    });
  }, [sortedToday, tz]);
  const nowMinutes = tz ? Math.round(getCurrentDecimalHourInTz(tz) * 60) : null;

  return (
    <section aria-label="Today's schedule" className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">Today</h2>
          {!scheduleError && sortedToday.length > 0 ? (
            <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
              {sortedToday.length}
            </span>
          ) : null}
        </div>
        <Link
          href="/golf/dashboard/calendar"
          className="inline-flex items-center gap-1 py-3 -my-3 font-fw-sans text-body-sm font-medium text-accent-700 hover:text-accent-600"
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
        <InlineNotice tone="warning" title="Couldn’t load today’s schedule">
          We hit a snag fetching today’s events. Refresh to try again, or open the
          calendar to see the full schedule.
        </InlineNotice>
      ) : nothingAtAll ? (
        // Right-sized for the COMMON case (audit #64): most days have nothing
        // on the books. coach-home.md: a quiet inline line, never a notice
        // card — no icon, no border, no fill.
        <p className="px-0.5 py-1 font-fw-sans text-body-sm text-text-tertiary">
          Clear schedule today — a good window for practice or recovery.
        </p>
      ) : (
        // BARE seam section end to end (home.v2.md §4 — the Surface wrapper
        // is removed): a genuinely clear day above renders as one quiet
        // line at this same `px-0.5` inset, so "Clear schedule today." below
        // shares that inset too rather than sitting at a boxed card's own
        // indent (REVIEW.md phone row 1 — two left edges in one card).
        <div className="flex flex-1 flex-col gap-3">
          {sortedToday.length > 0 ? (
            <AgendaStrip events={agendaEvents} nowMinutes={nowMinutes} hourLabels={6} />
          ) : null}
          {todayIsClear ? (
            <p className="px-0.5 py-1 font-fw-sans text-body-sm text-text-tertiary">
              Clear schedule today.
            </p>
          ) : (
            <>
              {/* Provably defined here: this branch only renders when
                  `!todayIsClear`, i.e. `sortedToday.length > 0`. */}
              <FeaturedEventRow event={featured!} tz={tz} />
              {restToday.map((event) => (
                <QuietEventRow key={event.id} event={event} tz={tz} />
              ))}
            </>
          )}
          {nextDayGroups.length > 0 ? (
            <div className={cn('flex flex-col gap-2', !todayIsClear && 'mt-2 border-t border-border-subtle pt-2')}>
              <span className="px-0.5 font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">
                Next 3 days
              </span>
              {nextDayGroups.map((group) => (
                <div key={group.key} className="flex flex-col">
                  <span className="px-0.5 py-1 font-fw-sans text-caption font-medium text-text-secondary">
                    {group.label}
                  </span>
                  {group.events.map((event) => (
                    <QuietEventRow key={event.id} event={event} tz={tz} />
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
