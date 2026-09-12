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
 * Composition (docs/design/fairway-facelift/screens/player-home.v2.md):
 *   • ONE ViewHeader (single h1 greeting) with a PERSISTENT "New round" primary
 *     action — the one primary on the screen.
 *   • The STAGE: the score trajectory as a Ribbon (every scored round the
 *     payload carries, the LAST round marked and named, the player's own
 *     scoring average as the dashed benchmark) under the verdict sentence.
 *     It answers the player's first question, "am I getting better"; the
 *     schedule and the task rows beside it (7/5 from `md`) answer "what is on
 *     today". No glass hero, no MetricCard grid, no card inside a card.
 *   • Form strip: ONE matte StatMatrix of the eight KPIs at every width, the
 *     four primary cells carrying the split-half delta hint and, from `md`,
 *     the five-point Sparkline forced to the same verdict.
 *   • Where your strokes go: the four SG zones as a diverging tornado (x = 0 is
 *     the field average), with the My Standing link as its action. Replaces
 *     the single-series radar teaser and the standing promo card.
 *   • Recent rounds, Latest, Focus areas (PlayerFocusAreas reused unchanged)
 *     and the CoachHelm signal follow as seam sections.
 *
 * Greeting: the server-known firstName renders on first paint (no blank-then-pop);
 * only the time-of-day word resolves client-side.
 *
 * Renders inside the `.fairway-ds` scope on `bg-canvas`. ADDITIVE + GATED — the
 * only edit to existing code is the flag fork in the route (Wire phase).
 * ========================================================================== */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, TrendingUp, Target, Activity, Trophy } from 'lucide-react';

// Imported from each module's own leaf path, not the top `@/components/fairway`
// barrel — this file is itself re-exported (via pages/dashboard/index.ts) from
// that barrel, so importing the barrel back here created an import cycle,
// flagged by npm run check:cycles.
import { ViewHeader } from '@/components/fairway/view-header';
import { Button } from '@/components/fairway/controls';
import { Surface, Inset } from '@/components/fairway/surfaces';
import { InstrumentPanel } from '@/components/fairway/instrument/InstrumentPanel';
import { StatMatrix } from '@/components/fairway/modules/StatMatrix';
import { cn } from '@/lib/utils';
import { InlineNotice, EmptyState } from '@/components/fairway/feedback';
import { Sparkline } from '@/components/fairway/charts/Sparkline';
import type { RibbonPoint } from '@/components/fairway/charts/Ribbon';
import type { GoodDirection } from '@/components/fairway/charts/TrendChip';
// The ONE series→delta→verdict reducer (AUDIT-0724 findings #2/#6/#7) — feeds
// BOTH a KPI card's delta chip AND its Sparkline's `direction` prop from a
// single call, so the two can never classify the same series two different
// ways again. Direct-file import (not the barrel) mirrors how MetricCard
// itself imports its trend classifier.
import { computeSeriesTrend, type SeriesTrend } from '@/components/fairway/charts/seriesTrend';
import { fairwayScope } from '@/lib/redesign/flag';
import { getGreeting, getTimeOfDay } from '@/lib/utils/time-of-day';
import { PlayerFocusAreas } from '@/components/golf/coachhelm/insights';
import { HubInsightSignalCard } from '@/components/golf/player-hub/HubInsightSignalCard';
import type { PlayerDashboardPayload, TodayEvent } from '@/app/golf/actions/dashboard-data';
import type { GolfPlayer, GolfTeam } from '@/lib/types/golf';
import type { PlayerHubSummaryData } from '@/app/golf/actions/player-hub-data';

import {
  SectionTitle,
  PlayerStage,
  SgFacetsPanel,
  TodayTasks,
  RecentRoundsList,
} from './player-dashboard-parts';
import { type DayScheduleEvent } from './DaySchedule';
import { DayScheduleSwipe } from './DayScheduleSwipe';
import { NotificationsLatestModule } from '@/components/fairway/notifications';

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
 * Cold start copy — the stage before there is a round. Payload-only, honest.
 * ──────────────────────────────────────────────────────────────────────── */
/** No 18-hole total sits below this; a lower "score" is a 9-hole card. */
const EIGHTEEN_HOLE_FLOOR = 50;

const COLD_START = {
  title: 'Log your first round to wake up your game profile',
  body: 'Strokes-gained, scoring averages, and your genome all start with one round. Three minutes, hole by hole.',
} as const;

/* ─────────────────────────────────────────────────────────────────────────
 * KPI helpers — turn a SparklineStatCard into StatMatrix cells honestly.
 * A `null` value → "—" (insufficient-data), never a fake 0.
 * ──────────────────────────────────────────────────────────────────────── */

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

  // Fallback series for the stage: the five recent rounds (newest first in
  // the payload), oldest → newest for the trace.
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

  // The stage plots the payload's own per-round scoring series (every scored
  // round it carries, oldest → newest) and falls back to the five recent
  // rounds when that series is absent or shorter. Neither series carries
  // holes_played, so a 9-hole total (a 38) would draw a fake collapse on an
  // 18-hole trace; totals below the 18-hole floor are left off, the same
  // rounds the scoring average already normalizes away.
  const stagePoints = useMemo<RibbonPoint[]>(() => {
    const eighteenHole = (pt: RibbonPoint) => pt.y >= EIGHTEEN_HOLE_FLOOR;
    const longer = (enhancedData?.scoringTrend ?? [])
      .filter((pt) => Number.isFinite(pt.value))
      .map((pt) => ({ x: pt.label, y: pt.value }))
      .filter(eighteenHole);
    const fallback = trendPoints.filter(eighteenHole);
    return longer.length >= fallback.length ? longer : fallback;
  }, [enhancedData?.scoringTrend, trendPoints]);
  const lastRound = recentRounds[0] ?? null;

  const sparklines = enhancedData?.sparklines;
  const secondary = enhancedData?.secondaryStats;

  // The five-point series behind each primary cell's delta hint and `md`+
  // Sparkline (the same enhancedData.sparklines.* the coach KPI row uses).
  const scoringSeries = sparklines?.scoringAvg.sparkline ?? [];
  const girSeries = sparklines?.girPct.sparkline ?? [];
  const puttsSeries = sparklines?.puttsPerRound.sparkline ?? [];
  const handicapSeries = sparklines?.handicap.sparkline ?? [];
  // goodDirection matches each metric's own Sparkline (down for scoring/putts/
  // handicap, up for GIR%) — same input, same options, ONE function, so the
  // hint and the sparkline it sits next to can never disagree (AUDIT-0724 #6).
  // `scoringDelta` also feeds the stage's verdict sentence.
  const scoringDelta = computeSeriesTrend(scoringSeries, { goodDirection: 'down' });
  const girDelta = computeSeriesTrend(girSeries, { goodDirection: 'up' });
  const puttsDelta = computeSeriesTrend(puttsSeries, { goodDirection: 'down' });
  const handicapDelta = computeSeriesTrend(handicapSeries, { goodDirection: 'down' });

  // The form strip: eight numbers as ONE StatMatrix at every width. A null
  // metric is "—", never a fake 0; the hint is the split-half delta, toned by
  // its verdict.
  const kpiValue = (v: number | null | undefined, decimals: number, suffix = '') =>
    v == null ? '—' : `${Number(v).toFixed(decimals)}${suffix}`;
  // The cell hint: the split-half delta in words, and from `md` the five-point
  // Sparkline beside it, forced to the SAME verdict (AUDIT-0724 #6: one
  // computeSeriesTrend call decides both the chip color and the line color).
  const kpiHint = (
    t: SeriesTrend | null,
    decimals: number,
    suffix: string,
    series: ReadonlyArray<number>,
    goodDirection: GoodDirection,
    label: string,
  ) =>
    t ? (
      <span className="flex items-center gap-2">
        <span
          className={cn(
            'tabular-nums',
            t.direction === 'improving'
              ? 'text-fw-success-ink'
              : t.direction === 'declining'
                ? 'text-fw-warning-ink'
                : 'text-text-tertiary',
          )}
        >
          {t.value > 0 ? '+' : ''}
          {t.value.toFixed(decimals)}
          {suffix} · {seriesDeltaLabel(t.points)}
        </span>
        {series.length >= 2 ? (
          <Sparkline
            className="hidden md:block"
            data={series}
            goodDirection={goodDirection}
            direction={t.direction}
            width={56}
            height={18}
            label={label}
          />
        ) : null}
      </span>
    ) : undefined;
  const scoringValue = sparklines?.scoringAvg.value ?? stats.scoringAverage ?? null;
  const handicapValue = sparklines?.handicap.value ?? stats.handicap ?? null;
  const bestRoundValue = secondary?.bestRound ?? stats.bestRound ?? null;
  const kpiItems = [
    { label: 'Scoring avg', value: kpiValue(scoringValue, 1), hint: kpiHint(scoringDelta, 1, '', scoringSeries, 'down', 'Scoring average'), tone: scoringValue == null ? 'muted' : 'neutral' },
    { label: 'GIR', value: kpiValue(sparklines?.girPct.value, 0, '%'), hint: kpiHint(girDelta, 0, '%', girSeries, 'up', 'Greens in regulation'), tone: sparklines?.girPct.value == null ? 'muted' : 'neutral' },
    { label: 'Putts / round', value: kpiValue(sparklines?.puttsPerRound.value, 1), hint: kpiHint(puttsDelta, 1, '', puttsSeries, 'down', 'Putts per round'), tone: sparklines?.puttsPerRound.value == null ? 'muted' : 'neutral' },
    { label: 'Handicap', value: kpiValue(handicapValue, 1), hint: kpiHint(handicapDelta, 1, '', handicapSeries, 'down', 'Handicap'), tone: handicapValue == null ? 'muted' : 'neutral' },
    { label: 'FIR', value: kpiValue(secondary?.firPct, 0, '%'), tone: secondary?.firPct == null ? 'muted' : 'neutral' },
    { label: 'Scrambling', value: kpiValue(secondary?.scramblingPct, 0, '%'), tone: secondary?.scramblingPct == null ? 'muted' : 'neutral' },
    { label: 'Birdies / round', value: kpiValue(secondary?.birdiesPerRound, 1), tone: secondary?.birdiesPerRound == null ? 'muted' : 'neutral' },
    { label: 'Best round', value: kpiValue(bestRoundValue, 0), tone: bestRoundValue == null ? 'muted' : 'neutral' },
  ] as const;

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

  // `asChild` passes children through untouched (Button cannot inject its icon
  // spans into an arbitrary child), so the glyph sits inside the Link.
  const newRoundCta = (
    <Button asChild variant="primary">
      <Link href="/golf/dashboard/rounds/new">
        <Plus className="h-4 w-4 shrink-0" aria-hidden />
        New round
      </Link>
    </Button>
  );

  // The TEAM's schedule is not gated on the player's own round count (a
  // brand-new player still needs to know where to be), so it renders in both
  // branches: the top slot on cold start, the right column of the stage grid
  // otherwise.
  const schedule = (
    <DayScheduleSwipe
      events={scheduleEvents}
      timezone={enhancedData?.timezone}
      viewAllHref="/golf/dashboard/calendar"
    />
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
          description="Your game at a glance."
          primaryAction={stats.roundsPlayed === 0 ? undefined : newRoundCta}
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

        {!hasRounds ? (
          /* ════════════════════════════════════════════════════════════════
             COLD START (0 rounds) — the schedule, then the first-round prompt
             as a matte panel with the ONE action (the ViewHeader hides
             "New round" until a round exists), then what unlocks.
             ════════════════════════════════════════════════════════════════ */
          <div className="flex flex-col gap-8">
            {schedule}

            <InstrumentPanel as="section" aria-label="Your game" eyebrow="Your game" header={COLD_START.title}>
              <p className="max-w-prose font-fw-sans text-body text-text-secondary">{COLD_START.body}</p>
              <div className="mt-5">
                <Button asChild variant="primary">
                  <Link href="/golf/dashboard/rounds/new">
                    <Plus className="h-4 w-4 shrink-0" aria-hidden />
                    Submit your first round
                  </Link>
                </Button>
              </div>
            </InstrumentPanel>

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
             NORMAL STATE (player-home.v2.md)
             ════════════════════════════════════════════════════════════════ */
          <div className="flex flex-col gap-10">
            {/* ── The stage + today: the score trajectory (last round marked,
                own average dashed) answers "am I getting better"; the schedule
                and the task rows answer "what is on today". 7/5 from `md`,
                one column below it; the same DOM at every width. ─────────── */}
            <section className="grid grid-cols-1 gap-8 md:grid-cols-12">
              <div className="min-w-0 md:col-span-7">
                <SectionTitle action={{ label: 'All stats', href: '/golf/dashboard/stats' }}>
                  Scoring trend
                </SectionTitle>
                <PlayerStage
                  points={stagePoints}
                  lastRound={lastRound}
                  scoringAverage={scoringValue}
                  trend={scoringDelta}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-6 md:col-span-5">
                {schedule}
                <TodayTasks actionItems={enhancedData?.actionItems ?? []} />
              </div>
            </section>

            {/* ── Form strip: ONE matte StatMatrix at every width (2×4 on the
                phone, 4 across from `sm`), delta hints plus a `md`+ Sparkline
                in the four primary cells. The eight MetricCards are gone. ── */}
            <StatMatrix variant="matte" columns={4} items={kpiItems} aria-label="Your form" />

            {/* ── Where your strokes go + recent rounds ───────────────────── */}
            <section className="grid grid-cols-1 gap-8 md:grid-cols-2">
              <SgFacetsPanel strokesGained={enhancedData?.strokesGained} />
              <div className="min-w-0">
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
                        <Button asChild variant="primary">
                          <Link href="/golf/dashboard/rounds/new">
                            <Plus className="h-4 w-4 shrink-0" aria-hidden />
                            Submit a round
                          </Link>
                        </Button>
                      }
                    />
                  </Surface>
                )}
              </div>
            </section>

            {/* Latest notifications — compact digest of the unified feed
                (CoachHelm signals, event/RSVP lifecycle, task reminders…).
                Self-fetching client module; renders nothing when there's
                genuinely nothing new. "View all" opens the same bell panel
                mounted in the top bar via NotificationPanelContext. */}
            <NotificationsLatestModule />

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
