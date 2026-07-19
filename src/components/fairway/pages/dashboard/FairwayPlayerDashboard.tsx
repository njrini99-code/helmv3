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
} from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';
import { getGreeting, getTimeOfDay } from '@/lib/utils/time-of-day';
import { PlayerFocusAreas } from '@/components/golf/coachhelm/insights';
import { HubInsightSignalCard } from '@/components/golf/player-hub/HubInsightSignalCard';
import type {
  PlayerDashboardPayload,
  SparklineStatCard,
} from '@/app/golf/actions/dashboard-data';
import type { GolfPlayer, GolfTeam } from '@/lib/types/golf';
import type { PlayerHubSummaryData } from '@/app/golf/actions/player-hub-data';

import {
  SectionTitle,
  TodayCard,
  GenomeFingerprintTeaser,
  RecentRoundsList,
  StandingCard,
  type ActionCenterSummary,
} from './player-dashboard-parts';
import { PlayerActionCenter } from './PlayerActionCenter';

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
   * RSVP events / announcements / trips + top CoachHelm signal), merged onto
   * this page as the "Action center" section — see PlayerActionCenter. Absent
   * (undefined) for a teamless player, exactly like the Hub was skipped for
   * teamless players before.
   */
  hubData?: PlayerHubSummaryData | null;
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

/* ─────────────────────────────────────────────────────────────────────────
 * Component
 * ──────────────────────────────────────────────────────────────────────── */

export function FairwayPlayerDashboard({ data, enhancedData, hubData }: FairwayPlayerDashboardProps) {
  const { player, team, stats, recentRounds } = data;
  const firstName = player.first_name?.trim() || 'there';

  // Greeting: name is server-known and renders immediately (no late pop). Only
  // the time-of-day word resolves on the client to avoid an SSR tz mismatch.
  const [timeWord, setTimeWord] = useState('Welcome back');
  useEffect(() => {
    setTimeWord(getGreeting(getTimeOfDay()));
  }, []);

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

  // CONSOLIDATION (review): TodayCard's "what's next" preview and the Action
  // center section below it must read from ONE source, not two independent
  // feeds. When this player has a Hub feed (hubData present), derive the
  // Action center's own visibility + count from that SAME hubData and hand it
  // to TodayCard — the preview and the full section can then never disagree,
  // and TodayCard's "See details" CTA can gate on the exact condition that
  // decides whether `#action-center` exists on the page. Teamless players
  // have no hubData — TodayCard falls back to its original events/actionItems
  // preview.
  //
  // NOTE: this mirrors PlayerActionCenter's own `hasAnything` gate
  // (pending tasks + un-RSVP'd future events + upcoming trips + announcements
  // / load-error) verbatim. PlayerActionCenter.tsx is out of this packet's
  // file scope, so the predicate is kept here rather than imported; if that
  // component's gate ever changes, this must be updated to match.
  const actionCenterSummary = useMemo<ActionCenterSummary | null>(() => {
    if (!hubData) return null;
    const now = new Date();
    const pendingTaskCount = hubData.tasks.filter((t) => t.status !== 'completed').length;
    const pendingEventCount = hubData.events.filter(
      (e) => (!e.rsvp_status || e.rsvp_status === 'pending') && new Date(e.start_time) >= now,
    ).length;
    const upcomingTripCount = hubData.trips.filter(
      (t) => new Date(t.departure_date) >= now,
    ).length;
    const count = pendingTaskCount + pendingEventCount + upcomingTripCount;
    const visible = count > 0 || hubData.announcements.length > 0 || hubData.announcementsLoadError;
    return { visible, count };
  }, [hubData]);

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
        <ViewHeader
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
            {/* ── ONE glass hero: the game-trend signal strip ───────────────── */}
            <InsightCard
              variant="hero"
              priority={hero.priority}
              overline={hero.overline}
              title={hero.title}
              empty={hero.empty}
              actions={
                !hero.empty ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/golf/dashboard/my-standing">See where you stack up</Link>
                  </Button>
                ) : undefined
              }
            >
              {hero.body}
            </InsightCard>

            {/* ── KPI row: matte MetricCards (honest insufficient-data) + standing */}
            <section>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MetricCard
                  label="Scoring avg"
                  value={Number(sparklines?.scoringAvg.value ?? stats.scoringAverage ?? 0)}
                  decimals={1}
                  goodDirection="down"
                  icon={<TrendingUp />}
                  empty={metricEmpty(sparklines?.scoringAvg, sparklines?.scoringAvg.value ?? stats.scoringAverage ?? null)}
                  emptyMessage="—"
                />
                <MetricCard
                  label="GIR"
                  value={Number(sparklines?.girPct.value ?? 0)}
                  decimals={0}
                  suffix="%"
                  icon={<Target />}
                  empty={metricEmpty(sparklines?.girPct, sparklines?.girPct.value ?? null)}
                  emptyMessage="—"
                />
                <MetricCard
                  label="Putts / round"
                  value={Number(sparklines?.puttsPerRound.value ?? 0)}
                  decimals={1}
                  goodDirection="down"
                  icon={<Activity />}
                  empty={metricEmpty(sparklines?.puttsPerRound, sparklines?.puttsPerRound.value ?? null)}
                  emptyMessage="—"
                />
                <MetricCard
                  label="Handicap"
                  value={Number(
                    sparklines?.handicap.value ??
                      (stats.handicap != null ? Number(Number(stats.handicap).toFixed(1)) : 0),
                  )}
                  decimals={1}
                  icon={<Trophy />}
                  empty={metricEmpty(
                    sparklines?.handicap,
                    sparklines?.handicap.value ?? stats.handicap ?? null,
                  )}
                  emptyMessage="—"
                />
              </div>

              {/* Collapsed secondary stats under the primary row */}
              {secondary ? (
                <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <MetricCard
                    label="FIR"
                    value={Number(secondary.firPct ?? 0)}
                    suffix="%"
                    empty={secondary.firPct == null}
                    emptyMessage="—"
                  />
                  <MetricCard
                    label="Scrambling"
                    value={Number(secondary.scramblingPct ?? 0)}
                    suffix="%"
                    empty={secondary.scramblingPct == null}
                    emptyMessage="—"
                  />
                  <MetricCard
                    label="Birdies / round"
                    value={Number(secondary.birdiesPerRound ?? 0)}
                    decimals={1}
                    empty={secondary.birdiesPerRound == null}
                    emptyMessage="—"
                  />
                  <MetricCard
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
                hubSummary={actionCenterSummary}
              />
            </section>

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

        {/* ── Action center (WAVE W2: merged from the former standalone Hub) ──
            Renders nothing when there's genuinely nothing to triage (honest-
            empty — see PlayerActionCenter). The CoachHelm signal card sits
            above it as a secondary matte signal, exactly as it did on the
            Hub — never a second glass hero. */}
        {hubData ? (
          <div className="mt-10 flex flex-col gap-6">
            <HubInsightSignalCard insight={hubData.topInsight} />
            <PlayerActionCenter
              trips={hubData.trips}
              tasks={hubData.tasks}
              events={hubData.events}
              announcements={hubData.announcements}
              announcementsLoadError={hubData.announcementsLoadError}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default FairwayPlayerDashboard;
