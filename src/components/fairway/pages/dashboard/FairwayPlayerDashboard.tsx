'use client';

/**
 * ============================================================================
 * Fairway · pages/dashboard · FairwayPlayerDashboard
 * ----------------------------------------------------------------------------
 * The redesigned PLAYER dashboard (route /golf/dashboard, player role) in the
 * warm "Fairway" design system. This is a PRESENTATION + LAYOUT rebuild — it
 * imports and consumes the SAME data the legacy PlayerDashboard takes
 * (PlayerDashboardData + PlayerDashboardPayload from dashboard-data.ts). It does
 * NOT fetch, mutate, or reshape any business data.
 *
 * Reorganization vs the old layout (per dashboard-home.json + _flow-dashboard-home):
 *   • ONE ViewHeader (single h1 greeting) with a PERSISTENT "New Round" primary
 *     action — replaces the late-popping LargeTitleHeader, the bespoke inline
 *     Link CTAs, and the duplicate below-the-fold "Submit New Round" button.
 *   • ONE glass-hero (InsightCard variant="hero") = the game-trend signal strip,
 *     derived from the payload's strokesGained / sparklines / stats. Everything
 *     else is matte Surface / MetricCard. (DESIGN-SYSTEM §4.3: one glass per view.)
 *   • KPI tiles → shared MetricCard with HONEST insufficient-data (no fake zeros).
 *   • Discoverability fix: a genome teaser deep-links to My Game Profile and a
 *     "where you stack up" card links to My Standing (both were URL-only).
 *   • Dashboard-vs-Hub split: the old TodayTimeline + ActionItemsCard collapse
 *     into ONE quiet "Today" card that links INTO the Hub (the canonical action
 *     surface) instead of reproducing it. PlayerFocusAreas (client fetch by
 *     playerId) is reused unchanged and shows its own honest EmptyState.
 *   • Scoring Trend → Fairway TrendChart (cream/green --viz tokens), keeping the
 *     2+ round gate; lazy-loaded ssr:false to preserve the legacy load contract.
 *
 * Greeting: the server-known firstName renders on first paint (no blank-then-pop);
 * only the time-of-day word resolves client-side.
 *
 * Renders inside the `.fairway-ds` scope on `bg-canvas`. ADDITIVE + GATED — the
 * only edit to existing code is the flag fork in the route (Wire phase).
 * ========================================================================== */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import nextDynamic from 'next/dynamic';
import { Plus, TrendingUp, Target, Activity, Trophy, Flag } from 'lucide-react';

import {
  ViewHeader,
  Button,
  MetricCard,
  InsightCard,
  Surface,
  Inset,
  InlineNotice,
  EmptyState,
  Skeleton,
  Sparkline,
} from '@/components/fairway';
// The ONE series→delta→verdict reducer (AUDIT-0724 findings #2/#6/#7) — feeds
// BOTH a KPI card's delta chip AND its Sparkline's `direction` prop from a
// single call, so the two can never classify the same series two different
// ways again. Direct-file import (not the barrel) mirrors how MetricCard
// itself imports its trend classifier.
import { computeSeriesTrend } from '@/components/fairway/charts/seriesTrend';
import { fairwayScope } from '@/lib/redesign/flag';
import { getGreeting, getTimeOfDay } from '@/lib/utils/time-of-day';
import { PlayerFocusAreas } from '@/components/golf/coachhelm/insights';
import { HubInsightSignalCard } from '@/components/golf/player-hub/HubInsightSignalCard';
import type {
  PlayerDashboardPayload,
  SparklineStatCard,
  TodayEvent,
} from '@/app/golf/actions/dashboard-data';
import type { GolfPlayer, GolfTeam } from '@/lib/types/golf';
import type { PlayerHubSummaryData } from '@/app/golf/actions/player-hub-data';

import {
  SectionTitle,
  TodayCard,
  GenomeFingerprintTeaser,
  RecentRoundsList,
  StandingCard,
} from './player-dashboard-parts';
import { type DayScheduleEvent } from './DaySchedule';
import { DayScheduleSwipe } from './DayScheduleSwipe';
import { NotificationsLatestModule } from '@/components/fairway/notifications';

// Fairway TrendChart, lazy + ssr:false — preserves the legacy load contract
// (the recharts bundle stays out of the server render path / first paint).
const TrendChart = nextDynamic(
  () => import('@/components/fairway').then((m) => ({ default: m.TrendChart })),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[240px] w-full rounded-card" />,
  },
);

/* ─────────────────────────────────────────────────────────────────────────
 * Props — IDENTICAL data shape to the legacy PlayerDashboard.
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
   * WAVE W2 (2026-07-09): the former standalone Hub's triage data (tasks /
   * RSVP events / announcements / trips + top CoachHelm signal). Only
   * `topInsight` still renders on this page (via HubInsightSignalCard,
   * above the DaySchedule card) — the full tasks/RSVP/trips triage surface
   * that used to render here moved out in favor of DaySchedule; it still
   * lives at Team Hub and Calendar. Absent (undefined) for a teamless
   * player, exactly like the Hub was skipped for teamless players before.
   */
  hubData?: PlayerHubSummaryData | null;
  /**
   * The time-of-day greeting phrase ("Good morning" / "Welcome back"), resolved
   * SERVER-side in the team's timezone by the RSC page, so the <h1> is settled
   * at first paint instead of being rewritten after mount. Omit it and the
   * effect fallback in the body still runs off the browser clock.
   */
  greeting?: string;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Hero signal derivation — honest, payload-only.
 * ----------------------------------------------------------------------------
 * The plan: ONE glass hero = "game-trend headline + the single most important
 * signal." We derive it from data the payload ALREADY contains. No CoachHelm
 * fetch is added here (the Dashboard's job is overview; the Hub owns the
 * CoachHelm signal card). When nothing is trustworthy, the hero says so.
 * ──────────────────────────────────────────────────────────────────────── */

interface HeroSignal {
  overline: string;
  title: string;
  body: string;
  priority: 'medium' | 'low' | 'info';
  empty: boolean;
}

function deriveHeroSignal(
  firstName: string,
  stats: PlayerDashboardData['stats'],
  payload: PlayerDashboardPayload | null | undefined,
): HeroSignal {
  // Honest empties first.
  if (stats.roundsPlayed === 0) {
    return {
      overline: 'Your game',
      title: 'Log your first round to wake up your game profile',
      body: 'Strokes-gained, scoring averages, and your genome all start with one round. Three minutes, hole by hole.',
      priority: 'info',
      empty: true,
    };
  }

  const sg = payload?.strokesGained;
  const scoring = payload?.sparklines.scoringAvg;

  // Prefer a strokes-gained read when there's a populated SG vector.
  const sgEntries: Array<{ label: string; value: number }> = sg
    ? (
        [
          { label: 'off the tee', value: sg.sg_off_tee },
          { label: 'on approach', value: sg.sg_approach },
          { label: 'around the green', value: sg.sg_around_green },
          { label: 'on the greens', value: sg.sg_putting },
        ].filter((e) => e.value != null) as Array<{ label: string; value: number }>
      )
    : [];

  if (sgEntries.length >= 3) {
    const best = sgEntries.reduce((a, b) => (b.value > a.value ? b : a));
    const worst = sgEntries.reduce((a, b) => (b.value < a.value ? b : a));
    const trendWord =
      scoring?.trend === 'improving'
        ? 'Your scoring is trending down — good.'
        : scoring?.trend === 'declining'
          ? 'Your scoring has ticked up lately.'
          : 'Your scoring has held steady.';
    return {
      overline: 'Your game',
      title: `You're gaining most ${best.label}`,
      body: `${trendWord} Your biggest leak right now is ${worst.label} — that's where the next strokes are. Open My Standing to see the full picture.`,
      priority: 'medium',
      empty: false,
    };
  }

  // Fall back to a scoring-average read when SG is sparse but rounds exist.
  if (scoring?.value != null) {
    const trendWord =
      scoring.trend === 'improving'
        ? 'and trending in the right direction'
        : scoring.trend === 'declining'
          ? 'with a little ground to make back'
          : 'and holding steady';
    return {
      overline: 'Your game',
      title: `Scoring around ${Number(scoring.value).toFixed(1)} ${trendWord}`,
      body: `Across your last rounds, ${firstName}. Log a few more and your strokes-gained genome fills in so we can pinpoint the next strokes.`,
      priority: 'low',
      empty: false,
    };
  }

  // Rounds exist but stats-cache is still sparse — be honest, not zero.
  return {
    overline: 'Your game',
    title: 'Your stats are still warming up',
    body: 'A few more rounds and your strokes-gained breakdown, trends, and standing will fill in. They build off the rounds you log.',
    priority: 'info',
    empty: true,
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * KPI helpers — turn a SparklineStatCard into MetricCard props honestly.
 * A `null` value → MetricCard `empty` (insufficient-data), never a fake 0.
 * ──────────────────────────────────────────────────────────────────────── */

function metricEmpty(card: SparklineStatCard | undefined, value: number | null): boolean {
  if (value == null) return true;
  if (card && (card.sparkline?.length ?? 0) === 0 && value == null) return true;
  return false;
}

/**
 * Honest windowed delta + verdict over a sparkline series (oldest → newest).
 * `computeSeriesTrend()` (charts/seriesTrend.ts) is the SAME split-half-
 * average comparison `computeTrend()`/`computeTrendHigherIsBetter()` already
 * use server-side (dashboard-data.ts) to classify the qualitative trend
 * arrow — recent-half average vs. older-half average — not a raw
 * first-vs-last endpoint diff.
 *
 * AUDIT-0724 finding #6: this dashboard used to compute this locally (via a
 * duplicated `seriesDelta()`, a same-shape copy of FairwayCoachDashboard.tsx's
 * own local copy — "kept in lockstep by convention" per the old comment here)
 * and hand ONLY the numeric `.value` to the MetricCard delta chip, while
 * `<Sparkline>` classified the SAME raw series on its own via endpoint diff —
 * the Putts/Rd card [32,38,32,33,35] rendered an amber "declining" sparkline
 * next to a green "improving" chip because the two widgets' math wasn't just
 * different, it flipped sign. Now the ONE `computeSeriesTrend()` call below
 * feeds both: `.value` → the delta chip, `.direction` → the Sparkline's
 * `direction` prop (overriding its own internal classification), so they
 * can only ever agree.
 *
 * Requires ≥3 finite points (mirrors the "Need 3+ rounds" honesty gate used
 * elsewhere on this page) — fewer than that suppresses the chip entirely
 * rather than showing an unreliable 2-point comparison.
 */
function seriesDeltaLabel(points: number): string {
  return `last ${points} round${points === 1 ? '' : 's'}`;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Component
 * ──────────────────────────────────────────────────────────────────────── */

export function FairwayPlayerDashboard({
  data,
  enhancedData,
  hubData,
  greeting: serverGreeting,
}: FairwayPlayerDashboardProps) {
  const { player, team, stats, recentRounds } = data;
  const firstName = player.first_name?.trim() || 'there';

  // Greeting: name is server-known and renders immediately (no late pop). The
  // time-of-day word is now server-known too — see the `greeting` prop. It used
  // to resolve in this effect from a "Welcome back" seed on the stated grounds
  // of avoiding an SSR tz mismatch, but the payload carries the team timezone,
  // so the server can settle the phrase without guessing at the client's clock.
  // The effect below is a FALLBACK for callers that don't pass the prop; when
  // the server has resolved it, nothing here writes state and the <h1> never
  // rewrites itself after paint.
  const [clientTimeWord, setClientTimeWord] = useState<string | null>(null);
  useEffect(() => {
    if (serverGreeting) return;
    setClientTimeWord(getGreeting(getTimeOfDay()));
  }, [serverGreeting]);
  const timeWord = serverGreeting ?? clientTimeWord ?? 'Welcome back';

  const hasRounds = stats.roundsPlayed > 0;

  const hero = useMemo(
    () => deriveHeroSignal(firstName, stats, enhancedData),
    [firstName, stats, enhancedData],
  );

  // Scoring-trend points for the Fairway TrendChart (oldest → newest), gated 2+.
  const trendPoints = useMemo(() => {
    return [...recentRounds]
      .reverse()
      .filter((r) => r.total_score != null && Number.isFinite(r.total_score))
      .map((r) => ({
        x: new Date(r.round_date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        }),
        y: r.total_score,
      }));
  }, [recentRounds]);

  const sparklines = enhancedData?.sparklines;
  const secondary = enhancedData?.secondaryStats;

  // KPI sparkline parity with the coach dashboard (FairwayCoachDashboard.tsx
  // Team KPI row): the same enhancedData.sparklines.* series was already
  // being fetched for this page but never wired into the player MetricCards
  // — they rendered as plain numbers with no inline trend. Same series →
  // same Sparkline + delta-chip pattern the coach row uses.
  const scoringSeries = sparklines?.scoringAvg.sparkline ?? [];
  const girSeries = sparklines?.girPct.sparkline ?? [];
  const puttsSeries = sparklines?.puttsPerRound.sparkline ?? [];
  const handicapSeries = sparklines?.handicap.sparkline ?? [];
  // goodDirection matches each metric's own <Sparkline goodDirection=...>
  // below (down for scoring/putts/handicap, up for GIR%) — same input, same
  // options, ONE function, so the chip and the sparkline it sits next to
  // can never disagree (AUDIT-0724 #6).
  const scoringDelta = computeSeriesTrend(scoringSeries, { goodDirection: 'down' });
  const girDelta = computeSeriesTrend(girSeries, { goodDirection: 'up' });
  const puttsDelta = computeSeriesTrend(puttsSeries, { goodDirection: 'down' });
  const handicapDelta = computeSeriesTrend(handicapSeries, { goodDirection: 'down' });

  // DaySchedule feed (WAVE — action-items → schedule): merge today's events
  // with the upcoming-beyond-today events (dashboard-data.ts additive field),
  // deduped by id and sorted ascending. Both arrays already come from the
  // SAME `golf_events` table via dashboard-data.ts — no new fetch here, just
  // a client-side merge of two payload fields that were fetched together.
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

  const newRoundCta = (
    <Button asChild variant="primary" leftIcon={<Plus className="h-4 w-4" />}>
      <Link href="/golf/dashboard/rounds/new">New round</Link>
    </Button>
  );

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      {/* overflow-x-clip: same backstop as the coach dashboard root (clip, not
          hidden — no scroll container, sticky keeps working) so no wide child
          can stretch every full-width card past the phone's viewport (#957). */}
      <div className="mx-auto w-full max-w-[1200px] overflow-x-clip px-6 py-8 md:px-12 md:py-12">
        {/* ── ViewHeader: single h1, persistent New Round action ───────────── */}
        {/* Same warm plinth as the coach opener. The two dashboards share ONE
            pre-role skeleton (FairwayDashboardSkeleton — role isn't known until
            the page resolves), so their mastheads have to agree on geometry or
            whichever one differs inherits a jump when the skeleton hands over.
            `disableAnimation` for the same reason: the placeholder already sat
            on these pixels, so a y-8 entrance would move settled text. */}
        <ViewHeader
          plinth
          disableAnimation
          eyebrow={team?.name ?? 'Your team'}
          title={`${timeWord}, ${firstName}`}
          description="Your game at a glance — trend, standing, and what's next."
          primaryAction={newRoundCta}
          className="mb-8 md:mb-10"
        />

        {/* ── Teamless advisory (matte InlineNotice → Join, not a saturated tile) */}
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

        {/* ════════════════════════════════════════════════════════════════
            COLD START (0 rounds) — one OnboardingStep-style hero, no duplicate
            CTAs. The persistent header CTA still applies.
           ════════════════════════════════════════════════════════════════ */}
        {!hasRounds ? (
          <div className="flex flex-col gap-8">
            <InsightCard
              variant="hero"
              priority="info"
              overline={hero.overline}
              title={hero.title}
              icon={<Flag aria-hidden className="h-full w-full" strokeWidth={2} />}
              actions={
                <Button asChild variant="primary" leftIcon={<Plus className="h-4 w-4" />}>
                  <Link href="/golf/dashboard/rounds/new">Submit your first round</Link>
                </Button>
              }
            >
              {hero.body}
            </InsightCard>

            {/* Feature-preview tiles — calm matte Insets, honest "coming once you log" */}
            <Surface padding="lg">
              <Surface.Header
                title="What unlocks with your first round"
                subtitle="Everything below builds off the rounds you log"
              />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  { icon: <TrendingUp className="h-4 w-4" />, label: 'Scoring average' },
                  { icon: <Trophy className="h-4 w-4" />, label: 'Best round' },
                  { icon: <Activity className="h-4 w-4" />, label: 'Performance trends' },
                  { icon: <Target className="h-4 w-4" />, label: 'Strokes-gained genome' },
                ].map((f) => (
                  <Inset key={f.label} padding="md" className="flex flex-col items-center gap-3 text-center">
                    <span className="grid h-10 w-10 place-items-center rounded-fw-md bg-accent-50 text-accent-700">
                      {f.icon}
                    </span>
                    <span className="font-fw-sans text-body-sm font-medium text-text-secondary">
                      {f.label}
                    </span>
                  </Inset>
                ))}
              </div>
            </Surface>

            {/* Focus areas — reused client component (own loading/empty/error).
                Same "My development" link-out as the normal-state block below
                (conn-golf-player Finding 2 — this was the one place missing it). */}
            <section>
              <SectionTitle action={{ label: 'My development', href: '/golf/dashboard/my-development' }}>
                My focus areas
              </SectionTitle>
              <Surface padding="md">
                <PlayerFocusAreas playerId={player.id} />
              </Surface>
            </section>
          </div>
        ) : (
          /* ════════════════════════════════════════════════════════════════
             NORMAL STATE
            ════════════════════════════════════════════════════════════════ */
          <div className="flex flex-col gap-10">
            {/* ── Top slot: swipeable day calendar (founder call 2026-07-24 —
                replaced the "You're gaining most …" game-trend hero; the
                standing story lives at My Standing). Same today+upcoming feed
                the bottom schedule card used before it moved up here. */}
            <DayScheduleSwipe
              events={scheduleEvents}
              timezone={enhancedData?.timezone}
              viewAllHref="/golf/dashboard/calendar"
            />

            {/* ── KPI row: matte MetricCards (honest insufficient-data) + standing */}
            <section>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MetricCard
                  // labelLines={2}: these labels truncated at <=390 ("Scoring avg" lost
                  // 21px, "Putts / round" 35px, and at 320 they rendered "SCO...").
                  // MetricCard reserves min-h-8 so the row stays aligned.
                  labelLines={2}
                  label="Scoring avg"
                  value={Number(sparklines?.scoringAvg.value ?? stats.scoringAverage ?? 0)}
                  decimals={1}
                  goodDirection="down"
                  icon={<TrendingUp />}
                  empty={metricEmpty(sparklines?.scoringAvg, sparklines?.scoringAvg.value ?? stats.scoringAverage ?? null)}
                  emptyMessage="—"
                  delta={
                    scoringDelta != null
                      ? { value: Number(scoringDelta.value.toFixed(1)), label: seriesDeltaLabel(scoringDelta.points) }
                      : undefined
                  }
                  sparkline={
                    scoringSeries.length >= 2 ? (
                      <Sparkline
                        data={scoringSeries}
                        goodDirection="down"
                        label="Scoring average"
                        // AUDIT-0724 #6: force the SAME verdict the delta chip
                        // above renders (computeSeriesTrend's split-half
                        // average) instead of Sparkline's own endpoint diff.
                        direction={scoringDelta?.direction}
                      />
                    ) : undefined
                  }
                />
                <MetricCard
                  // labelLines={2}: these labels truncated at <=390 ("Scoring avg" lost
                  // 21px, "Putts / round" 35px, and at 320 they rendered "SCO...").
                  // MetricCard reserves min-h-8 so the row stays aligned.
                  labelLines={2}
                  label="GIR"
                  value={Number(sparklines?.girPct.value ?? 0)}
                  decimals={0}
                  suffix="%"
                  goodDirection="up"
                  icon={<Target />}
                  empty={metricEmpty(sparklines?.girPct, sparklines?.girPct.value ?? null)}
                  emptyMessage="—"
                  delta={
                    girDelta != null
                      ? { value: Number(girDelta.value.toFixed(0)), suffix: '%', label: seriesDeltaLabel(girDelta.points) }
                      : undefined
                  }
                  sparkline={
                    girSeries.length >= 2 ? (
                      <Sparkline
                        data={girSeries}
                        goodDirection="up"
                        label="Greens in regulation"
                        direction={girDelta?.direction}
                      />
                    ) : undefined
                  }
                />
                <MetricCard
                  // labelLines={2}: these labels truncated at <=390 ("Scoring avg" lost
                  // 21px, "Putts / round" 35px, and at 320 they rendered "SCO...").
                  // MetricCard reserves min-h-8 so the row stays aligned.
                  labelLines={2}
                  label="Putts / round"
                  value={Number(sparklines?.puttsPerRound.value ?? 0)}
                  decimals={1}
                  goodDirection="down"
                  icon={<Activity />}
                  empty={metricEmpty(sparklines?.puttsPerRound, sparklines?.puttsPerRound.value ?? null)}
                  emptyMessage="—"
                  delta={
                    puttsDelta != null
                      ? { value: Number(puttsDelta.value.toFixed(1)), label: seriesDeltaLabel(puttsDelta.points) }
                      : undefined
                  }
                  sparkline={
                    puttsSeries.length >= 2 ? (
                      <Sparkline
                        data={puttsSeries}
                        goodDirection="down"
                        label="Putts per round"
                        // AUDIT-0724 #6 — the exact reported case: series
                        // [32,38,32,33,35] used to draw amber "declining"
                        // here (endpoint diff 35-32=+3) beside a green
                        // "improving" chip fed by the split-half average.
                        // Forcing the chip's own computeSeriesTrend()
                        // verdict here makes them agree.
                        direction={puttsDelta?.direction}
                      />
                    ) : undefined
                  }
                />
                <MetricCard
                  // labelLines={2}: these labels truncated at <=390 ("Scoring avg" lost
                  // 21px, "Putts / round" 35px, and at 320 they rendered "SCO...").
                  // MetricCard reserves min-h-8 so the row stays aligned.
                  labelLines={2}
                  label="Handicap"
                  value={Number(
                    sparklines?.handicap.value ??
                      (stats.handicap != null ? Number(Number(stats.handicap).toFixed(1)) : 0),
                  )}
                  decimals={1}
                  goodDirection="down"
                  icon={<Trophy />}
                  empty={metricEmpty(
                    sparklines?.handicap,
                    sparklines?.handicap.value ?? stats.handicap ?? null,
                  )}
                  emptyMessage="—"
                  delta={
                    handicapDelta != null
                      ? { value: Number(handicapDelta.value.toFixed(1)), label: seriesDeltaLabel(handicapDelta.points) }
                      : undefined
                  }
                  sparkline={
                    handicapSeries.length >= 2 ? (
                      <Sparkline
                        data={handicapSeries}
                        goodDirection="down"
                        label="Handicap"
                        direction={handicapDelta?.direction}
                      />
                    ) : undefined
                  }
                />
              </div>

              {/* Collapsed secondary stats under the primary row */}
              {secondary ? (
                <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <MetricCard
                    labelLines={2}
                    label="FIR"
                    value={Number(secondary.firPct ?? 0)}
                    suffix="%"
                    empty={secondary.firPct == null}
                    emptyMessage="—"
                  />
                  <MetricCard
                    labelLines={2}
                    label="Scrambling"
                    value={Number(secondary.scramblingPct ?? 0)}
                    suffix="%"
                    empty={secondary.scramblingPct == null}
                    emptyMessage="—"
                  />
                  <MetricCard
                    labelLines={2}
                    label="Birdies / round"
                    value={Number(secondary.birdiesPerRound ?? 0)}
                    decimals={1}
                    empty={secondary.birdiesPerRound == null}
                    emptyMessage="—"
                  />
                  <MetricCard
                    labelLines={2}
                    label="Best round"
                    value={Number(secondary.bestRound ?? stats.bestRound ?? 0)}
                    empty={(secondary.bestRound ?? stats.bestRound) == null}
                    emptyMessage="—"
                  />
                </div>
              ) : null}
            </section>

            {/* ── Trend + genome + standing ─────────────────────────────────── */}
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Scoring trend — Fairway ChartCard, 2+ round gate preserved */}
              <div className="lg:col-span-2">
                <SectionTitle action={{ label: 'All stats', href: '/golf/dashboard/stats' }}>
                  Scoring trend
                </SectionTitle>
                <Surface padding="md">
                  {/* title omitted (audit #169): the SectionTitle above already
                      renders "Scoring trend" as the page-level heading — passing
                      the SAME text into ChartFrame's own `truncate`-d h3 gave the
                      card a second, redundant "Scoring trend" that then clipped
                      to "Scoring tre…" once the header row's ViewToggle button
                      squeezed it. Same null-title pattern already used by
                      GenomeFingerprintTeaser below for the identical reason. */}
                  <TrendChart
                    title={null}
                    data={trendPoints}
                    state={trendPoints.length >= 2 ? 'ready' : 'insufficient-data'}
                    height={240}
                    takeaway="Lower is better — your scores over your most recent rounds."
                    valueFormatter={(v) => String(Math.round(v))}
                  />
                </Surface>
              </div>

              {/* Standing teaser */}
              <div className="flex flex-col gap-6">
                <StandingCard ready={hasRounds} />
              </div>
            </section>

            {/* ── Genome teaser + Today ─────────────────────────────────────── */}
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <GenomeFingerprintTeaser
                strokesGained={
                  enhancedData?.strokesGained ?? {
                    sg_total: null,
                    sg_off_tee: null,
                    sg_approach: null,
                    sg_around_green: null,
                    sg_putting: null,
                  }
                }
              />
              <TodayCard
                events={enhancedData?.todayEvents ?? []}
                actionItems={enhancedData?.actionItems ?? []}
                timezone={enhancedData?.timezone}
              />
            </section>

            {/* Latest notifications — compact digest of the unified feed
                (CoachHelm signals, event/RSVP lifecycle, task reminders…).
                Self-fetching client module; renders nothing when there's
                genuinely nothing new. "View all" opens the same bell panel
                mounted in the top bar via NotificationPanelContext. */}
            <NotificationsLatestModule />

            {/* ── Recent rounds ─────────────────────────────────────────────── */}
            <section>
              <SectionTitle action={{ label: 'View all', href: '/golf/dashboard/rounds' }}>
                Recent rounds
              </SectionTitle>
              {recentRounds.length > 0 ? (
                <RecentRoundsList rounds={recentRounds} />
              ) : (
                <Surface padding="md">
                  <EmptyState
                    variant="subtle"
                    title="No rounds yet"
                    description="Your logged rounds will show up here."
                    action={
                      <Button asChild variant="primary" leftIcon={<Plus className="h-4 w-4" />}>
                        <Link href="/golf/dashboard/rounds/new">Submit a round</Link>
                      </Button>
                    }
                  />
                </Surface>
              )}
            </section>

            {/* ── Focus areas (reused client component, honest EmptyState) ───── */}
            <section>
              <SectionTitle action={{ label: 'My development', href: '/golf/dashboard/my-development' }}>
                Focus areas
              </SectionTitle>
              <Surface padding="md">
                <PlayerFocusAreas playerId={player.id} />
              </Surface>
            </section>
          </div>
        )}

        {/* ── CoachHelm signal — secondary matte signal, never a second glass
            hero. (The schedule card that used to sit below it moved to the
            top slot as DayScheduleSwipe, 2026-07-24.) */}
        {team && hubData ? (
          <div className="mt-10 flex flex-col gap-6">
            <HubInsightSignalCard insight={hubData.topInsight} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
