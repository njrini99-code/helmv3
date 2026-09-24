'use client';

/**
 * ============================================================================
 * PlayerCoachHelmHome — the Player CoachHelm composition root
 * ----------------------------------------------------------------------------
 * Receives every parallel-fetched read from `coachhelm/page.tsx` (dashboard,
 * insights, themes, trends, genome, causal relationships, goals, focus areas,
 * the counterfactual baseline) and renders the section tabs above ONE
 * full-width `StageRouter`. The home view is `PlayerHubFeed` (CoachHelm's own
 * read: what is changing, why, what to do); the five drill views are
 * `development` / `profile` / `standing` / `insights` / `deep-dive`.
 *
 * Layout (2026-09-24 overview rebuild): no spine. The old Spine rail repeated
 * the Stats page (SG track, priorities, a ledger) and its ledger read a 30-day
 * shot-analytics window that contradicted the stats-cache snapshot beside it
 * (audit NUM-22). The tabs are the only navigation (HUB-01).
 *
 * PRESERVED LOGIC (imported / reused, never rewritten): `rateInsightAsPlayer`
 * feedback round-trip, `getPlayerWhatIf` scenario simulation (inside
 * `DeepDiveDrill`), `createGoal` "make it a plan" (inside `InsightsDrill`'s
 * `ThemesPanel`), every focus-area write action (inside `DevelopmentDrill`).
 * ========================================================================== */

import { useCallback, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { Surface, EmptyState, Button } from '@/components/fairway';
import { StageRouter } from '@/components/fairway/modules';
import type { StageView } from '@/components/fairway/modules';
import { isThemesEnabled } from '@/lib/redesign/flag';

import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { PlayerCoachHelmDashboardData } from '@/app/golf/actions/insights';
import type { PlayerFingerprint } from '@/app/golf/actions/player-fingerprint-types';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { CauseNode, ThemeNode } from '@/lib/coachhelm/v3/themes/types';
import type { FocusAreaCardData } from '@/components/fairway';
import type { FairwayGoalCardData } from '@/components/fairway/pages/coachhelm/FairwayGoalCard';
import type { GoalSuggestionView } from '@/components/fairway/pages/coachhelm/GoalsSection';
import type { CausalRelationshipRow } from '@/app/golf/actions/causal-relationships';
import type { AreaAutoFillStats } from '@/lib/coachhelm/focus-areas/catalog';

import { rateInsightAsPlayer } from '@/app/golf/actions/player-feedback';
import { createGoal } from '@/app/golf/actions/v3/goals';
import { computeTargetValue } from '@/lib/coachhelm/v3/goals/suggestion-writer';
import { isMetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { useToast } from '@/components/ui/sonner';

import { PlayerHubFeed } from './PlayerHubFeed';
import { DevelopmentDrill } from './DevelopmentDrill';
import { ProfileDrill, type GameProfileAxis, type GameProfileDimensionCell, type GameProfilePersonaEntry } from './ProfileDrill';
import { StandingDrill } from './StandingDrill';
import { InsightsDrill } from './InsightsDrill';
import { DeepDiveDrill } from './DeepDiveDrill';
import { PlayerCoachHelmNav, useCoachHelmSectionLabel } from './PlayerCoachHelmNav';

export interface PlayerCoachHelmHomeProps {
  data: PlayerCoachHelmDashboardData;
  playerId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profileData?: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trendData?: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shotData?: Record<string, any> | null;
  v3EmptyCodes?: { profile?: string | null; trend?: string | null; shots?: string | null };
  topInsight?: EvidenceInsight | null;
  secondaryInsights?: EvidenceInsight[];
  standingByMetric?: Record<string, PlayerStanding>;
  themes?: ThemeNode[];

  /** `development` drill — copied from `my-development/page.tsx`. */
  developmentActiveAreas: FocusAreaCardData[];
  developmentCompletedAreas: FocusAreaCardData[];
  developmentProposedAreas?: FocusAreaCardData[];
  developmentPlayerStats?: AreaAutoFillStats;
  developmentLoadError?: boolean;
  goals?: FairwayGoalCardData[];
  suggestions?: GoalSuggestionView[];
  causalRelationships?: CausalRelationshipRow[];
  achievedGoals?: FairwayGoalCardData[];
  /** A8 slice 3 — see `DevelopmentDrillProps.practiceLogEnabled`. Threaded
   *  straight through from the server page (`isFlagEnabled` is server-only). */
  practiceLogEnabled?: boolean;

  /** `profile` drill — copied from `my-game-profile/page.tsx`. */
  genomeAxes: GameProfileAxis[];
  genomeDimensions: GameProfileDimensionCell[];
  genomeStrengths: GameProfilePersonaEntry[];
  genomeWatchouts: GameProfilePersonaEntry[];
  genomeCourseProfile: string | null;
  genomeRoundsBasis: number | null;
  /** The player's OWN Game Fingerprint — same composition as the coach's
   *  Game Fingerprint page, fed to `ProfileDrill`'s "Game Fingerprint" tab.
   *  Null when the fetch failed or hasn't resolved a player-self access
   *  branch — `ProfileDrill` degrades to its prior Genome-only content. */
  fingerprint?: PlayerFingerprint | null;

  /** `standing` drill — copied from `my-standing/page.tsx`. */
  playerBaseline: number | null;
}

export function PlayerCoachHelmHome({
  data,
  playerId,
  profileData,
  trendData,
  shotData,
  v3EmptyCodes = {},
  topInsight = null,
  secondaryInsights = [],
  standingByMetric = {},
  themes = [],
  developmentActiveAreas,
  developmentCompletedAreas,
  developmentProposedAreas = [],
  developmentPlayerStats,
  developmentLoadError = false,
  goals = [],
  suggestions = [],
  causalRelationships = [],
  achievedGoals = [],
  practiceLogEnabled = false,
  genomeAxes,
  genomeDimensions,
  genomeStrengths,
  genomeWatchouts,
  genomeCourseProfile,
  genomeRoundsBasis,
  fingerprint = null,
  playerBaseline,
}: PlayerCoachHelmHomeProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast } = useToast();
  const [, startMakePlanTransition] = useTransition();
  const [makePlanPendingId, setMakePlanPendingId] = useState<string | null>(null);

  const secondaryDeduped = useMemo(
    () => secondaryInsights.filter((i) => !topInsight || i.id !== topInsight.id),
    [secondaryInsights, topInsight],
  );

  // Deep link from the dashboard's insight card: `?view=insights&insight=<id>`.
  const focusInsightId = searchParams.get('insight');
  const focusInsight = useMemo(
    () =>
      focusInsightId
        ? [topInsight, ...secondaryInsights].find((i) => i?.id === focusInsightId) ?? null
        : null,
    [focusInsightId, topInsight, secondaryInsights],
  );

  const hasAnyInsight = Boolean(topInsight) || secondaryDeduped.length > 0;
  const hasData =
    hasAnyInsight ||
    data.focusAreas.length > 0 ||
    data.prediction !== null ||
    data.recentRounds.length > 0 ||
    profileData != null ||
    trendData != null ||
    shotData != null ||
    developmentActiveAreas.length > 0 ||
    developmentProposedAreas.length > 0 ||
    // FIX 3: a player whose only CoachHelm artifact is completed focus areas
    // (every active/proposed area finished) previously fell through every
    // branch above and got the whole-page empty state, even though
    // `DevelopmentDrill` has a real "Completed" section to render for them.
    developmentCompletedAreas.length > 0 ||
    goals.length > 0 ||
    achievedGoals.length > 0;

  /* FIX 1: overflow of the top insight's prescribed drills (index 1+) —
   * the overview (`PlayerHubFeed`) shows only the first attached drill; the rest
   * surface inside `InsightsDrill` so every attached drill stays visible. */
  const topInsightDrills = useMemo(() => (topInsight?.drills ?? []).slice(1), [topInsight]);

  /* ── Feedback handler — PRESERVED rateInsightAsPlayer round-trip + toasts. ── */
  // DATA-14: one rating in flight per insight. A double tap on Helpful used
  // to send two writes and two toasts.
  const ratingInFlight = useRef(new Set<string>());
  const handleRate = useCallback(
    async (insightId: string, rating: 'helpful' | 'not_helpful' | 'acknowledged' | 'dismissed') => {
      if (ratingInFlight.current.has(insightId)) return;
      ratingInFlight.current.add(insightId);
      try {
        await rateInsightAsPlayer({ insightId, rating });
        addToast({
          type: 'success',
          title: rating === 'dismissed' ? 'Insight dismissed' : rating === 'acknowledged' ? 'Acknowledged' : 'Thanks for the feedback',
        });
        router.refresh();
      } catch (err) {
        addToast({
          type: 'error',
          title: 'Could not save feedback',
          description: err instanceof Error ? err.message : 'Please try again in a moment.',
        });
      } finally {
        ratingInFlight.current.delete(insightId);
      }
    },
    [addToast, router],
  );

  /* ── Theme "Make it a plan" — PRESERVED verbatim from FairwayPlayerCoachHelm. */
  const handleMakePlan = useCallback(
    (cause: CauseNode, _theme: ThemeNode) => {
      setMakePlanPendingId(cause.insight_id);
      startMakePlanTransition(async () => {
        try {
          if (!cause.metric || !isMetricId(cause.metric)) {
            addToast({ type: 'error', title: 'Could not add to your plan', description: 'This focus area is not yet a trackable metric.' });
            return;
          }
          const baseline =
            typeof cause.standingPlayerValue === 'number' && Number.isFinite(cause.standingPlayerValue)
              ? cause.standingPlayerValue
              : null;
          const canTarget = baseline !== null && typeof cause.standingPgaValue === 'number' && Number.isFinite(cause.standingPgaValue);
          const target = canTarget ? computeTargetValue({ playerValue: baseline, pgaValue: cause.standingPgaValue as number }) : null;

          const result = await createGoal({
            metric_id: cause.metric,
            title: cause.title,
            category: 'from_insight',
            ends_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
            baseline_value: baseline,
            target_value: target,
            target_source: target !== null ? 'midpoint' : null,
            shared_with_coach: true,
          });

          if (!result.ok) {
            addToast({ type: 'error', title: 'Could not add to your plan', description: result.error || 'Please try again in a moment.' });
            return;
          }
          addToast({ type: 'success', title: 'Added to your development plan' });
          router.refresh();
        } catch (err) {
          addToast({
            type: 'error',
            title: 'Could not add to your plan',
            description: err instanceof Error ? err.message : 'Please try again in a moment.',
          });
        } finally {
          setMakePlanPendingId(null);
        }
      });
    },
    [addToast, router],
  );

  /* The stage has no visible title, so the surface shipped with no <h1> and
     opened at <h2> (audit P-21). Visually-hidden heading, tracking the
     active section so the document outline is honest on every view. */
  const sectionLabel = useCoachHelmSectionLabel();
  const pageHeading = <h1 className="sr-only">CoachHelm: {sectionLabel}</h1>;

  if (!hasData) {
    return (
      <Surface padding="lg">
        {pageHeading}
        <EmptyState
          title="No insights yet"
          description="Log a few rounds and CoachHelm will surface the patterns that move your scores."
          action={
            <Button asChild variant="primary">
              <Link href="/golf/dashboard/rounds/new">Log your first round</Link>
            </Button>
          }
        />
      </Surface>
    );
  }

  const views: StageView[] = [
    {
      key: 'home',
      node: (
        <PlayerHubFeed
          topInsight={topInsight}
          secondaryInsights={secondaryDeduped}
          themes={themes}
          themesEnabled={isThemesEnabled()}
          trendData={trendData}
          patterns={data.focusAreas}
          prediction={data.prediction}
          recentRounds={data.recentRounds}
          roundsBasis={developmentPlayerStats?.rounds_played ?? null}
          lastUpdated={data.lastUpdated}
          planAreas={developmentActiveAreas}
          onRate={(id, rating) => void handleRate(id, rating)}
        />
      ),
    },
    {
      key: 'development',
      node: (
        <DevelopmentDrill
          activeAreas={developmentActiveAreas}
          completedAreas={developmentCompletedAreas}
          proposedAreas={developmentProposedAreas}
          playerId={playerId}
          playerStats={developmentPlayerStats}
          loadError={developmentLoadError}
          goals={goals}
          suggestions={suggestions}
          standingByMetric={standingByMetric}
          causalRelationships={causalRelationships}
          achievedGoals={achievedGoals}
          practiceLogEnabled={practiceLogEnabled}
        />
      ),
    },
    {
      key: 'profile',
      node: (
        <ProfileDrill
          axes={genomeAxes}
          dimensions={genomeDimensions}
          strengths={genomeStrengths}
          watchouts={genomeWatchouts}
          courseProfile={genomeCourseProfile}
          roundsBasis={genomeRoundsBasis}
          profileData={profileData}
          trendData={trendData}
          playerState={data.playerState}
          playerName={data.playerName}
          v3EmptyCodes={v3EmptyCodes}
          fingerprint={fingerprint}
        />
      ),
    },
    {
      key: 'standing',
      node: <StandingDrill standingByMetric={standingByMetric} playerBaseline={playerBaseline} />,
    },
    {
      key: 'insights',
      node: (
        <InsightsDrill
          key={focusInsight?.id ?? 'feed'}
          initialOpenInsight={focusInsight}
          insights={secondaryDeduped}
          standingByMetric={standingByMetric}
          themesEnabled={isThemesEnabled()}
          themes={themes}
          onRate={(id, rating) => void handleRate(id, rating)}
          onMakePlan={handleMakePlan}
          makePlanPendingId={makePlanPendingId}
          topInsightDrills={topInsightDrills}
        />
      ),
    },
    {
      key: 'deep-dive',
      node: <DeepDiveDrill playerId={playerId} shotData={shotData} profileData={profileData} />,
    },
  ];

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1120px] flex-col gap-6">
      {pageHeading}
      <PlayerCoachHelmNav />
      <div className="min-w-0">
        <StageRouter param="view" homeKey="home" views={views} />
      </div>
    </div>
  );
}
