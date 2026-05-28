'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { m, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { EmptyState as EmptyStatePrimitive } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/sonner';
import { rateInsightAsPlayer } from '@/app/golf/actions/player-feedback';
import {
  IconSparkles,
  IconChartRadar,
  IconInfo,
  IconRefresh,
  IconSettings,
  IconChevronDown,
  IconChevronUp,
} from '@/components/icons';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import {
  PerformancePrediction,
  FocusAreasGrid,
} from '@/components/golf/coachhelm/player';
import { CompositeRatingCard } from '@/components/golf/coachhelm/player/CompositeRatingCard';
import { TrendDashboard } from '@/components/golf/coachhelm/player/TrendDashboard';
import { ShotAnalysisCard } from '@/components/golf/coachhelm/player/ShotAnalysisCard';
import { WhatIfPanel } from '@/components/golf/coachhelm/player/WhatIfPanel';
import { ShotAnalyticsPanel } from '@/components/golf/coachhelm/analytics';
import { GolfTabBar } from '@/components/golf/GolfTabBar';
import {
  HeroInsightCard,
  InsightCard,
  type InsightAction,
} from '@/components/golf/coachhelm/insight-card';
import { HeroNarrativeCard } from '@/components/golf/coachhelm/v3/HeroNarrativeCard';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';
import {
  crossfadeVariants,
  crossfadeTransition,
  DURATION,
  EASE_TAP,
} from '@/lib/coachhelm/v3/motion';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { PlayerCoachHelmDashboardData } from '@/app/golf/actions/insights';
import type { PlayerShotAnalytics } from '@/app/golf/actions/shot-analytics';
import { Button, IconButton } from '@/components/ui/button';

async function loadCoachHelmActions() {
  const [{ getPlayerCoachHelmDashboard }, { getPlayerShotAnalytics }] = await Promise.all([
    import('@/app/golf/actions/insights'),
    import('@/app/golf/actions/shot-analytics'),
  ]);

  return { getPlayerCoachHelmDashboard, getPlayerShotAnalytics };
}

interface PlayerCoachHelmDashboardProps {
  data: PlayerCoachHelmDashboardData;
  playerId: string;
  initialShotAnalytics?: PlayerShotAnalytics | null;
  /** V3 optional data — degrades gracefully if not available */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profileData?: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trendData?: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shotData?: Record<string, any> | null;
  /** The single highest-impact evidence-backed insight — hero card. */
  topInsight?: EvidenceInsight | null;
  /** The rest of the evidence-backed feed — stacked below the hero. The
   *  component dedupes the hero id in case it appears in this list too. */
  secondaryInsights?: EvidenceInsight[];
}

/**
 * Returns gradient based on player state for background effect
 */
function getStateGradient(state: PlayerCoachHelmDashboardData['playerState']) {
  switch (state) {
    case 'improving':
      return 'from-primary-500/10 via-transparent to-transparent';
    case 'struggling':
      return 'from-amber-500/10 via-transparent to-transparent';
    default:
      return 'from-primary-500/10 via-transparent to-transparent';
  }
}

/**
 * Empty state component for when no data is available at all.
 * Uses the shared `<EmptyState>` primitive (variant="card", glass) but keeps
 * the bespoke copy and CTA — the canonical "no insights yet" voice.
 */
function EmptyState() {
  return (
    <EmptyStatePrimitive
      variant="card"
      glass
      icon={<IconInfo size={40} />}
      title="No Insights Available Yet"
      description="Complete a few rounds to unlock AI-powered insights about your game. CoachHelm analyzes your performance patterns to provide personalized recommendations."
      action={{
        label: 'Log Your First Round',
        href: '/golf/dashboard/rounds/new',
      }}
    />
  );
}

/**
 * Compact inline note shown when the evidence-backed insight feed is empty
 * but the rest of the dashboard has data. Kept low-weight so it doesn't fight
 * the surrounding cards for attention.
 */
function EmptyInsightsState({ hasRounds }: { hasRounds: boolean }) {
  return (
    <Card variant="overlay" padding="sm" hover={false} className="rounded-lg shadow-glass-sm">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-warm-100 flex items-center justify-center flex-shrink-0">
          <IconSparkles size={16} className="text-warm-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-warm-900">
            No evidence-backed insights yet
          </p>
          <p className="text-xs text-warm-500 mt-0.5">
            {hasRounds
              ? 'Insights appear once patterns hold across multiple rounds.'
              : 'Log a few rounds and CoachHelm will surface the patterns that move your scores.'}
          </p>
        </div>
      </div>
    </Card>
  );
}

export function PlayerCoachHelmDashboard({
  data: initialData,
  playerId,
  initialShotAnalytics,
  profileData,
  trendData,
  shotData,
  topInsight = null,
  secondaryInsights = [],
}: PlayerCoachHelmDashboardProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [dashboardData, setDashboardData] = useState<PlayerCoachHelmDashboardData>(initialData);
  const [shotAnalytics, setShotAnalytics] = useState<PlayerShotAnalytics | null>(initialShotAnalytics ?? null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSection, setActiveSection] = useState<'insights' | 'analytics'>('insights');
  const [activeBottomTab, setActiveBottomTab] = useState<'shot-analysis' | 'what-if'>('shot-analysis');
  const sectionTabs = [
    { id: 'insights' as const, label: 'AI Insights', icon: <IconSparkles size={16} /> },
    { id: 'analytics' as const, label: 'Shot Analytics', icon: <IconChartRadar size={16} /> },
  ];
  const bottomTabs = [
    { id: 'shot-analysis' as const, label: 'Shot Analysis' },
    { id: 'what-if' as const, label: 'What If' },
  ];

  /**
   * Refresh dashboard data from server
   */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      const { getPlayerCoachHelmDashboard, getPlayerShotAnalytics } = await loadCoachHelmActions();
      const [dashboardResult, analyticsResult] = await Promise.all([
        getPlayerCoachHelmDashboard(playerId),
        getPlayerShotAnalytics(playerId, 30),
      ]);

      if (dashboardResult.success && dashboardResult.data) {
        setDashboardData(dashboardResult.data);
      }

      if (analyticsResult.success && analyticsResult.data) {
        setShotAnalytics(analyticsResult.data);
      }

      // Refresh the page data — server component re-runs the insight-delivery
      // fetchers and passes fresh top/secondary props in.
      router.refresh();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Refresh failed',
        description: err instanceof Error ? err.message : 'Please try again in a moment.',
      });
    } finally {
      setRefreshing(false);
    }
  }, [playerId, router, addToast]);

  /**
   * Unified handler wired into every `<InsightCard>` + `<HeroInsightCard>` on
   * this surface. Maps the primitive's action union onto the existing
   * `rateInsightAsPlayer` server action, with toast feedback.
   *
   * `open_details` is a no-op here — we're already on the insight-delivery
   * surface. Coach actions (`create_focus_area`) shouldn't fire on the player
   * dashboard either; we log the UI bug path defensively.
   */
  const handleInsightAction = useCallback(
    async (action: InsightAction, insightId: string) => {
      if (action === 'open_details' || action === 'view_drill') {
        // These are surface-local; the primitive handles them inline (drill
        // chip sheet). No server roundtrip required.
        return;
      }

      if (action === 'create_focus_area') {
        // Coach-only action shouldn't arrive here, but don't crash if it does.
        addToast({
          type: 'error',
          title: 'Unavailable',
          description: 'Focus areas are created from the coach dashboard.',
        });
        return;
      }

      const ratingMap: Record<
        Exclude<InsightAction, 'open_details' | 'view_drill' | 'create_focus_area'>,
        'helpful' | 'not_helpful' | 'acknowledged' | 'dismissed'
      > = {
        rate_helpful: 'helpful',
        rate_not_helpful: 'not_helpful',
        acknowledged: 'acknowledged',
        dismissed: 'dismissed',
      };
      const rating = ratingMap[action];

      const successCopy = getToastCopyForAction(action);

      try {
        await rateInsightAsPlayer({ insightId, rating });
        addToast({ type: 'success', ...successCopy });
        router.refresh();
      } catch (err) {
        addToast({
          type: 'error',
          title: 'Could not save feedback',
          description: err instanceof Error ? err.message : 'Please try again in a moment.',
        });
      }
    },
    [addToast, router],
  );

  // Dedupe — the top insight is also in the `getInsightsForPlayer` result;
  // drop it from the secondary list so we don't render the same card twice.
  // Cap the visible list at 3 to keep the surface uncluttered; surplus is
  // surfaced via a "View more" affordance below the feed.
  const secondaryDeduped = useMemo(
    () => secondaryInsights.filter((i) => !topInsight || i.id !== topInsight.id),
    [secondaryInsights, topInsight],
  );
  const secondaryFiltered = useMemo(
    () => secondaryDeduped.slice(0, 3),
    [secondaryDeduped],
  );
  const hiddenInsightCount = Math.max(0, secondaryDeduped.length - secondaryFiltered.length);

  const hasAnyInsight = Boolean(topInsight) || secondaryFiltered.length > 0;

  // Local UI state — "Deep dive" (Shot Analysis / What If) is collapsed by
  // default so the spine of the dashboard (hero insight + focus areas) gets
  // room to breathe. Players who want the heavier analysis expand on demand.
  const [deepDiveOpen, setDeepDiveOpen] = useState(false);

  // Dashboard-level data presence check. We now treat evidence-backed insights
  // + the legacy focus-area / prediction shape as interchangeable signals that
  // "some content exists" — so the dashboard doesn't collapse to the big
  // EmptyState when only the new insight feed is populated.
  const hasData =
    hasAnyInsight ||
    dashboardData.focusAreas.length > 0 ||
    dashboardData.prediction !== null ||
    dashboardData.recentRounds.length > 0 ||
    profileData != null ||
    trendData != null ||
    shotData != null;

  return (
    <div className="min-h-full">
      {/* Gradient background based on state */}
      <div className={cn(
        'absolute inset-0 bg-gradient-to-br pointer-events-none',
        getStateGradient(dashboardData.playerState)
      )} />

      {/* Header */}
      <LargeTitleHeader
        title="CoachHelm AI"
        subtitle="Your personal golf intelligence"
      >
        <IconButton variant="default"
          onClick={handleRefresh}
          disabled={refreshing}
          className={cn(
            'p-2 rounded-lg text-warm-500 hover:text-warm-700 hover:bg-cream-100/60 active:bg-cream-100/75 transition-all flex-shrink-0 disabled:opacity-60'
          )}
          title="Refresh insights"
          aria-label="Refresh insights"
        >
          <IconRefresh size={18} className={refreshing ? 'animate-spin' : undefined} />
        </IconButton>
        <Link
          href="/golf/dashboard/settings"
          className="p-2 rounded-lg text-warm-500 hover:text-warm-700 hover:bg-cream-100/60 active:bg-cream-100/75 transition-all flex-shrink-0"
          title="AI Settings"
          aria-label="AI Settings"
        >
          <IconSettings size={18} />
        </Link>
      </LargeTitleHeader>

      {/* Main Content */}
      <div className="relative max-w-[1536px] mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Editorial hero band — magazine-cover framing for the player's
            CoachHelm surface beneath the sticky LargeTitleHeader. The
            stone plinth roots the editorial copy on a sculpted-matte
            foundation so it reads architectural, not floating. */}
        {hasData && (
          <Reveal>
            <div className="surface-stone rounded-3xl p-6 md:p-10 mb-8">
              <PageHeader
                eyebrow="CoachHelm"
                eyebrowAccent="primary"
                title="Your edge this week."
                subtitle="The pattern that matters most, plus the supporting signal behind it."
              />
            </div>
          </Reveal>
        )}

        {/* Empty state */}
        {!hasData && <EmptyState />}

        {/* Dashboard content — animations simplified for mobile performance.
            Only the section switch animates; interior content renders instantly. */}
        {hasData && (
          <>
            {/* Section Toggle */}
            <div className="mb-6">
              <GolfTabBar
                tabs={sectionTabs}
                value={activeSection}
                onChange={setActiveSection}
                ariaLabel="CoachHelm sections"
              />
            </div>

            {/* Insights Section — reorganized into three tiers:
                1. Spine (above-the-fold): Hero insight + Focus Areas
                2. Secondary: Game strength, trends, supporting insights, prediction
                3. Detail (collapsed): Shot analysis / What-if deep dive */}
            <AnimatePresence mode="wait" initial={false}>
              {activeSection === 'insights' && (
                <m.div
                  key="insights"
                  variants={crossfadeVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  transition={crossfadeTransition}
                  className="space-y-6 md:space-y-8"
                >
                  {/* ───── W31: LLM hero narrative (Haiku) ─────
                      One paragraph above the hero card, grounded in the
                      same top insight. Falls back to insight.content if
                      LLM is budget-gated or errors. */}
                  {topInsight && (
                    <HeroNarrativeCard
                      playerId={playerId}
                      metricLabel={topInsight.evidence.metric_label}
                      yourValueDisplay={
                        topInsight.evidence.your_value_display ||
                        String(topInsight.evidence.your_value ?? '')
                      }
                      teamPct={
                        (topInsight.evidence as { standing?: { team_pct?: number | null } })
                          .standing?.team_pct ?? null
                      }
                      fallbackText={topInsight.content || topInsight.title}
                    />
                  )}

                  {/* ───── Spine — Hero insight + Focus Areas ───── */}
                  {/* On mobile this is the above-the-fold view: one hero
                      insight, then the player's actionable focus areas. */}
                  <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 md:gap-6">
                    <div className="lg:col-span-7 min-w-0">
                      {topInsight ? (
                        <HeroInsightCard
                          insight={topInsight}
                          audience="player"
                          onAction={handleInsightAction}
                        />
                      ) : (
                        <EmptyInsightsState
                          hasRounds={dashboardData.recentRounds.length > 0}
                        />
                      )}
                    </div>
                    <div className="lg:col-span-5 min-w-0">
                      <section id="focus-areas" className="scroll-mt-24">
                        <FocusAreasGrid focusAreas={dashboardData.focusAreas} />
                      </section>
                    </div>
                  </section>

                  {/* ───── Secondary — Supporting insights | Prediction ─────
                      Below the spine, a second tier surfaces the rest of the
                      insight feed alongside the prediction card. Capped at 3
                      insights with a "View all" affordance for surplus. */}
                  {(secondaryFiltered.length > 0 || dashboardData.prediction !== null) && (
                    <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 md:gap-6">
                      <div className="lg:col-span-7 space-y-3 min-w-0">
                        {secondaryFiltered.length > 0 && (
                          <>
                            <h3 className="text-eyebrow font-medium uppercase tracking-[0.12em] opacity-80 text-warm-500 px-1">
                              {topInsight ? 'More for you' : 'Your insights'}
                            </h3>
                            {secondaryFiltered.map((insight) => (
                              <InsightCard
                                key={insight.id}
                                insight={insight}
                                density="compact"
                                audience="player"
                                onAction={handleInsightAction}
                              />
                            ))}
                            {hiddenInsightCount > 0 && (
                              <Link
                                href="/golf/dashboard/my-development"
                                className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 px-1"
                              >
                                View {hiddenInsightCount} more insight{hiddenInsightCount === 1 ? '' : 's'}
                                <span aria-hidden="true">→</span>
                              </Link>
                            )}
                          </>
                        )}
                      </div>
                      <div className="lg:col-span-5 min-w-0">
                        <PerformancePrediction
                          prediction={dashboardData.prediction}
                          playerState={dashboardData.playerState}
                        />
                      </div>
                    </section>
                  )}

                  {/* ───── Tertiary — Game Strength + Trends ─────
                      Lower visual priority than the insight feed: these are
                      reference panels, not the primary signal of the day. */}
                  <section>
                    <h3 className="text-eyebrow font-medium uppercase tracking-[0.12em] opacity-80 text-warm-500 mb-3 px-1">
                      Performance overview
                    </h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6">
                      <CompositeRatingCard
                        profileData={profileData ?? undefined}
                        playerState={dashboardData.playerState}
                        playerName={dashboardData.playerName}
                      />
                      <TrendDashboard
                        trendData={trendData ?? undefined}
                        playerState={dashboardData.playerState}
                      />
                    </div>
                  </section>

                  {/* ───── Detail (collapsible) — Deep dive analysis ─────
                      Hidden by default. Shot analysis + what-if are dense,
                      heavy panels that distract from the spine when always
                      open. Players opt in via the disclosure button. */}
                  <section>
                    <Button variant="ghost"
                      type="button"
                      onClick={() => setDeepDiveOpen((v) => !v)}
                      aria-expanded={deepDiveOpen}
                      aria-controls="coachhelm-deep-dive"
                      className={cn(
                        'group w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl text-left',
                        'bg-cream-100/65 backdrop-blur-md ring-1 ring-warm-200/50',
                        'shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]',
                        'hover:bg-cream-100/80 hover:ring-warm-200/70 transition-all',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <IconChartRadar size={16} className="text-primary-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-warm-900">
                            Deep dive analysis
                          </p>
                          <p className="text-xs text-warm-500">
                            Shot patterns and what-if scenarios
                          </p>
                        </div>
                      </div>
                      {deepDiveOpen ? (
                        <IconChevronUp size={18} className="text-warm-500 flex-shrink-0" />
                      ) : (
                        <IconChevronDown size={18} className="text-warm-500 flex-shrink-0" />
                      )}
                    </Button>

                    <AnimatePresence initial={false}>
                      {deepDiveOpen && (
                        <m.div
                          id="coachhelm-deep-dive"
                          key="deep-dive"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: DURATION.short, ease: EASE_TAP }}
                          className="overflow-hidden"
                        >
                          <div className="pt-4 space-y-3">
                            <div className="flex items-center justify-end">
                              <GolfTabBar
                                tabs={bottomTabs}
                                value={activeBottomTab}
                                onChange={setActiveBottomTab}
                                ariaLabel="Analysis sections"
                                compact
                              />
                            </div>
                            <AnimatePresence mode="wait" initial={false}>
                              {activeBottomTab === 'shot-analysis' && (
                                <m.div
                                  key="shot-analysis"
                                  variants={crossfadeVariants}
                                  initial="hidden"
                                  animate="visible"
                                  exit="exit"
                                  transition={crossfadeTransition}
                                >
                                  <ShotAnalysisCard
                                    shotData={shotData ?? undefined}
                                    playerId={playerId}
                                  />
                                </m.div>
                              )}
                              {activeBottomTab === 'what-if' && (
                                <m.div
                                  key="what-if"
                                  variants={crossfadeVariants}
                                  initial="hidden"
                                  animate="visible"
                                  exit="exit"
                                  transition={crossfadeTransition}
                                >
                                  <WhatIfPanel
                                    playerId={playerId}
                                    profileData={profileData ?? undefined}
                                  />
                                </m.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </m.div>
                      )}
                    </AnimatePresence>
                  </section>
                </m.div>
              )}

              {/* Shot Analytics Section */}
              {activeSection === 'analytics' && (
                <m.div
                  key="analytics"
                  variants={crossfadeVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  transition={crossfadeTransition}
                >
                  <ShotAnalyticsPanel
                    playerId={playerId}
                    playerName={dashboardData.playerName}
                    initialData={shotAnalytics}
                    periodDays={30}
                  />
                </m.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Toast copy keyed by InsightAction. Extracted so the handler stays flat.
 */
function getToastCopyForAction(
  action: Exclude<InsightAction, 'open_details' | 'view_drill' | 'create_focus_area'>,
): { title: string; description: string } {
  switch (action) {
    case 'rate_helpful':
      return {
        title: 'Thanks for the feedback',
        description: 'CoachHelm will show you more like this.',
      };
    case 'rate_not_helpful':
      return {
        title: "Got it — we'll tune your insights",
        description: 'CoachHelm will show fewer insights like this.',
      };
    case 'acknowledged':
      return {
        title: 'Acknowledged',
        description: "We'll mark this insight as seen.",
      };
    case 'dismissed':
      return {
        title: 'Insight dismissed',
        description: 'Removed from your active insights.',
      };
  }
}
