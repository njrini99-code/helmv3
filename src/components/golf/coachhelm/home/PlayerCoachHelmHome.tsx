'use client';

/**
 * ============================================================================
 * PlayerCoachHelmHome — Player CoachHelm on the Spine & Stage chassis (spec §5.3)
 * ----------------------------------------------------------------------------
 * The Task 8 composition root: receives the SAME parallel-fetched props
 * `FairwayPlayerCoachHelm` received PLUS the additional reads `coachhelm/page.tsx`
 * now copies from the three `/my-*` route pages it absorbs (genome, causal
 * relationships, goals, the focus-area select, the counterfactual baseline),
 * runs the raw payloads through `buildPlayerHomeViewModel`'s pure helpers, and
 * renders `PlayerSpine` beside a `StageRouter` whose home view is
 * `PlayerHomeBento` and whose five drill views are `development` / `profile` /
 * `standing` / `insights` / `deep-dive`.
 *
 * Layout: `300px 1fr` grid, spine sticky at `top-20` — matches
 * `StatsSpineStage`'s collapse-to-single-column breakpoint (940px).
 *
 * PRESERVED LOGIC (imported / reused, never rewritten): `rateInsightAsPlayer`
 * feedback round-trip, `getPlayerWhatIf` scenario simulation (inside
 * `DeepDiveDrill`), `createGoal` "make it a plan" (inside `InsightsDrill`'s
 * `ThemesPanel`), every focus-area write action (inside `DevelopmentDrill`).
 * ========================================================================== */

import { useCallback, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';
import { Surface, EmptyState, Button } from '@/components/fairway';
import { StageRouter } from '@/components/fairway/modules';
import type { StageView } from '@/components/fairway/modules';
import { isThemesEnabled } from '@/lib/redesign/flag';

import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { PlayerCoachHelmDashboardData } from '@/app/golf/actions/insights';
import type { PlayerShotAnalytics } from '@/app/golf/actions/shot-analytics';
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

import {
  buildFocusAreaPriorities,
  buildPlayerLedger,
  buildPlayerStandingTrack,
  buildPredictionVerdict,
  formatPredictionHero,
} from './buildPlayerHomeViewModel';
import { PlayerSpine } from './PlayerSpine';
import { PlayerHomeBento } from './PlayerHomeBento';
import { DevelopmentDrill } from './DevelopmentDrill';
import { ProfileDrill, type GameProfileAxis, type GameProfileDimensionCell, type GameProfilePersonaEntry } from './ProfileDrill';
import { StandingDrill } from './StandingDrill';
import { InsightsDrill } from './InsightsDrill';
import { DeepDiveDrill } from './DeepDiveDrill';

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** Short trend headline for the bento's "Trend" cell — the same loosely-typed
 *  `trendData.trends.signal` string `FairwayTrendBrain` reads internally. */
function trendSummaryFrom(trendData: Record<string, unknown> | null | undefined): string | null {
  const trends = (trendData as { trends?: { signal?: unknown } } | null | undefined)?.trends;
  const signal = trends?.signal;
  if (typeof signal !== 'string' || signal.length === 0) return null;
  const normalized = signal.replace(/[_-]+/g, ' ').trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export interface PlayerCoachHelmHomeProps {
  data: PlayerCoachHelmDashboardData;
  playerId: string;
  initialShotAnalytics?: PlayerShotAnalytics | null;
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

  /** `profile` drill — copied from `my-game-profile/page.tsx`. */
  genomeAxes: GameProfileAxis[];
  genomeDimensions: GameProfileDimensionCell[];
  genomeStrengths: GameProfilePersonaEntry[];
  genomeWatchouts: GameProfilePersonaEntry[];
  genomeCourseProfile: string | null;
  genomeRoundsBasis: number | null;

  /** `standing` drill — copied from `my-standing/page.tsx`. */
  playerBaseline: number | null;
}

export function PlayerCoachHelmHome({
  data,
  playerId,
  initialShotAnalytics,
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
  genomeAxes,
  genomeDimensions,
  genomeStrengths,
  genomeWatchouts,
  genomeCourseProfile,
  genomeRoundsBasis,
  playerBaseline,
}: PlayerCoachHelmHomeProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [, startMakePlanTransition] = useTransition();
  const [makePlanPendingId, setMakePlanPendingId] = useState<string | null>(null);

  const shot = initialShotAnalytics ?? null;

  const secondaryDeduped = useMemo(
    () => secondaryInsights.filter((i) => !topInsight || i.id !== topInsight.id),
    [secondaryInsights, topInsight],
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
   * `PlayerHomeBento` renders only the first attached drill; the rest
   * surface inside `InsightsDrill` so every attached drill stays visible. */
  const topInsightDrills = useMemo(() => (topInsight?.drills ?? []).slice(1), [topInsight]);

  /* ── Feedback handler — PRESERVED rateInsightAsPlayer round-trip + toasts. ── */
  const handleRate = useCallback(
    async (insightId: string, rating: 'helpful' | 'not_helpful' | 'acknowledged' | 'dismissed') => {
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

  const sgTotal = finite(standingByMetric['sg_total']?.player_value ?? null);
  const sgTeamAvg = finite(standingByMetric['sg_total']?.team_avg ?? null);
  const track = useMemo(() => buildPlayerStandingTrack(sgTotal, sgTeamAvg), [sgTotal, sgTeamAvg]);

  const priorities = useMemo(
    () => buildFocusAreaPriorities(data.focusAreas.map((a) => ({ area: a.area, strokesGained: a.strokesGained, value: a.value, unit: a.unit }))),
    [data.focusAreas],
  );

  const ledger = useMemo(
    () =>
      buildPlayerLedger({
        roundsAnalyzed: shot?.roundsAnalyzed,
        fairwayPct: shot?.teeStats.fairwayPct,
        girPct: shot?.approachStats.girPct,
        puttsPerRound: shot?.puttingStats.avgPuttsPerRound,
      }),
    [shot],
  );

  const hero = useMemo(
    () => formatPredictionHero(data.prediction?.predictedValue, data.prediction?.metric),
    [data.prediction],
  );
  const verdict = useMemo(
    () =>
      buildPredictionVerdict(
        data.prediction?.predictedValue,
        data.prediction?.calibratedConfidence ?? data.prediction?.confidence,
        priorities[0]?.title ?? null,
      ),
    [data.prediction, priorities],
  );

  const trendSummary = useMemo(() => trendSummaryFrom(trendData), [trendData]);

  if (!hasData) {
    return (
      <Surface padding="lg">
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
        <PlayerHomeBento
          topInsight={topInsight}
          activeFocusAreaCount={data.focusAreas.length}
          topFocusAreaLabel={priorities[0]?.title ?? null}
          genomeAxes={genomeAxes}
          standingByMetric={standingByMetric}
          trendSummary={trendSummary}
          themes={themes}
          insightCount={(topInsight ? 1 : 0) + secondaryDeduped.length}
          performanceSnapshot={{
            scoringAverage: finite(developmentPlayerStats?.avg_score),
            fairwayPct: finite(developmentPlayerStats?.fairway_pct),
            girPct: finite(developmentPlayerStats?.gir_pct),
            scramblingPct: finite(developmentPlayerStats?.scrambling_pct),
            puttsPerRound: finite(developmentPlayerStats?.avg_putts),
          }}
          onRateTopInsight={(rating) => topInsight && void handleRate(topInsight.id, rating)}
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
    <div className={cn('flex flex-col gap-6 min-[940px]:grid min-[940px]:grid-cols-[300px_1fr] min-[940px]:items-start')}>
      <PlayerSpine
        className="min-[940px]:sticky min-[940px]:top-20"
        hero={hero}
        verdict={verdict}
        track={track}
        priorities={priorities}
        ledger={ledger}
      />
      <StageRouter param="view" homeKey="home" views={views} />
    </div>
  );
}
