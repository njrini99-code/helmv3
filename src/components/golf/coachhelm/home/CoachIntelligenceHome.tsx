'use client';

/**
 * ============================================================================
 * CoachIntelligenceHome — Coach Intelligence on the Spine & Stage chassis
 * (spec §5.4)
 * ----------------------------------------------------------------------------
 * The Task 9 composition root: receives the SAME parallel-fetched props
 * `FairwayBrief` received (`getTeamOverview`, `getTeamCategoryInsights`)
 * PLUS the additional reads `intelligence/page.tsx` now copies from the four
 * routes it absorbs (the active `?filter=` Signals preset, the Players
 * roster + focus areas, and the Effectiveness analytics four-fetch), runs
 * the raw payloads through `buildCoachHomeViewModel`'s pure helpers, and
 * renders `CoachSpine` beside a `StageRouter` whose home view is
 * `CoachHomeBento` and whose three drill views are `signals` / `players` /
 * `effectiveness`.
 *
 * Layout: `300px 1fr` grid, spine sticky at `top-20` — matches
 * `StatsSpineStage`/`PlayerCoachHelmHome`'s collapse-to-single-column
 * breakpoint (940px).
 * ========================================================================== */

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Surface, EmptyState, Button, InlineNotice } from '@/components/fairway';
import { StageRouter } from '@/components/fairway/modules';
import type { StageView } from '@/components/fairway/modules';
import type { RibbonPoint, PlayersGridViewProps } from '@/components/fairway';

import type { TeamOverviewResult, TeamCategoryInsightsResult } from '@/app/golf/actions/team-category-insights';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { ExtendedPattern } from '@/app/golf/actions/pattern-management';
import type { EffectivenessDrillProps } from './EffectivenessDrill';

import {
  buildCoachLedger,
  buildCompositeHero,
  buildDirectiveVerdict,
  buildFlaggedPlayerPriorities,
  buildSignalsSummary,
  buildTrajectoryCounts,
  buildTrajectorySentence,
  countDistinctAttentionPlayers,
  formatAnalyzedDate,
  rankCoachCategories,
  type SignalsFilterKey,
} from './buildCoachHomeViewModel';
import { CoachSpine } from './CoachSpine';
import { CoachHomeBento } from './CoachHomeBento';
import { SignalsDrill } from './SignalsDrill';
import { PlayersDrill } from './PlayersDrill';
import { EffectivenessDrill } from './EffectivenessDrill';

export interface CoachIntelligenceHomeProps {
  overview: TeamOverviewResult;
  categoryInsights: TeamCategoryInsightsResult;
  coachId: string;
  teamId: string;
  /** The FULL `getAlertCounts` payload — drives the bento's 3-segment
   *  critical/warning/info bar (spec §5.4). `null` on a load failure. */
  alertCounts: { critical: number; warning: number; info: number; total: number } | null;

  /** `signals` drill — copied from alerts/insights/patterns page.tsx, whichever the current `?filter=` needs. */
  signalsFilter: SignalsFilterKey;
  signalsInitialInsights: EvidenceInsight[];
  signalsInitialPatterns: ExtendedPattern[];
  signalsPlayerNames: Record<string, string>;
  signalsInitialSearchParams?: Record<string, string | undefined>;

  /** `players` drill — copied from development/page.tsx. */
  playersDrillProps: PlayersGridViewProps;

  /** `effectiveness` drill — copied from analytics/coachhelm/page.tsx. */
  effectivenessDrillProps: EffectivenessDrillProps;
}

export function CoachIntelligenceHome({
  overview,
  categoryInsights,
  coachId,
  teamId,
  alertCounts,
  signalsFilter,
  signalsInitialInsights,
  signalsInitialPatterns,
  signalsPlayerNames,
  signalsInitialSearchParams,
  playersDrillProps,
  effectivenessDrillProps,
}: CoachIntelligenceHomeProps) {
  const router = useRouter();
  const ov = overview.success ? overview.data : undefined;
  const ci = categoryInsights.success ? categoryInsights.data : undefined;

  // getTeamOverview can fail transiently (P017, team-category-insights.ts) —
  // that is a DISTINCT state from a genuinely empty roster (which the action
  // reports as success:true, playerCount:0). Falling back to `playerCount:0`
  // here would misreport an established team as "no active players yet" on a
  // Supabase hiccup. Use the separately-fetched roster (playersDrillProps,
  // unaffected by the overview call) so an overview failure never fabricates
  // an empty-team onboarding screen for a real team.
  const overviewFailed = !overview.success;
  const overviewError = overview.success ? null : overview.error;
  const rosterPlayerCount = playersDrillProps.players.length;
  const playerCount = ov?.playerCount ?? (overviewFailed ? rosterPlayerCount : 0);
  const hasTeamStats = (ov?.statsRowCount ?? 0) > 0;
  const categories = useMemo(() => ci?.categories ?? [], [ci?.categories]);

  const categoryLabelById = useMemo(() => new Map(categories.map((c) => [c.id, c.label])), [categories]);

  const ranked = useMemo(
    () => (hasTeamStats ? rankCoachCategories(ov?.teamCategories, categories) : []),
    [hasTeamStats, ov?.teamCategories, categories],
  );
  const weakest = ranked[0] ?? null;

  const hero = useMemo(() => buildCompositeHero(ov?.teamComposite), [ov?.teamComposite]);
  const verdict = useMemo(() => buildDirectiveVerdict(weakest), [weakest]);
  const trajectoryCounts = useMemo(() => buildTrajectoryCounts(categories), [categories]);
  const trajectorySentence = useMemo(() => buildTrajectorySentence(trajectoryCounts), [trajectoryCounts]);
  const priorities = useMemo(
    () => buildFlaggedPlayerPriorities(categories, categoryLabelById),
    [categories, categoryLabelById],
  );
  const attentionCount = useMemo(() => countDistinctAttentionPlayers(categories), [categories]);
  const lastAnalyzed = useMemo(() => formatAnalyzedDate(ci?.lastAnalyzed ?? ''), [ci?.lastAnalyzed]);
  const ledger = useMemo(
    () => buildCoachLedger({ playerCount, attentionCount, lastAnalyzed }),
    [playerCount, attentionCount, lastAnalyzed],
  );

  const ribbonPoints: RibbonPoint[] = useMemo(
    () => (ov?.teamShotAnalysis.yardageCurve ?? []).map((b) => ({ x: `${b.rangeStart}-${b.rangeEnd}y`, y: b.avgSG })),
    [ov?.teamShotAnalysis.yardageCurve],
  );

  const signalsSummary = useMemo(() => buildSignalsSummary(alertCounts), [alertCounts]);
  const signalBadgeCount = alertCounts?.critical ?? null;

  const predictionAccuracy = effectivenessDrillProps.initialOverview?.predictionAccuracy ?? null;

  // Genuinely empty roster (overview loaded fine, playerCount really is 0) —
  // keep the existing onboarding gate. An overview FAILURE falls through
  // instead: it renders the shell below (spine + stage, using the roster
  // fallback above) with an honest error notice rather than this screen.
  if (!overviewFailed && playerCount === 0) {
    return (
      <Surface padding="lg">
        <EmptyState
          title="No active players yet"
          description="Invite players and log rounds — CoachHelm names what to work on as the stats cache builds."
          action={
            <Button asChild variant="primary">
              <Link href="/golf/dashboard/roster">Open Roster</Link>
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
        <CoachHomeBento
          weakest={weakest}
          ribbonPoints={ribbonPoints}
          playerCount={playerCount}
          attentionCount={attentionCount}
          signalsSummary={signalsSummary}
          predictionAccuracy={predictionAccuracy}
        />
      ),
    },
    {
      key: 'signals',
      node: (
        <SignalsDrill
          coachId={coachId}
          teamId={teamId}
          filter={signalsFilter}
          initialInsights={signalsInitialInsights}
          initialPatterns={signalsInitialPatterns}
          playerNames={signalsPlayerNames}
          signalCount={signalBadgeCount}
          initialSearchParams={signalsInitialSearchParams}
        />
      ),
    },
    { key: 'players', node: <PlayersDrill {...playersDrillProps} /> },
    { key: 'effectiveness', node: <EffectivenessDrill {...effectivenessDrillProps} /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      {overviewFailed && (
        // Honest error state instead of the silently-degraded "—" hero/verdict
        // this would otherwise render as. Roster fallback above already kept
        // the onboarding gate from firing, so Signals/Players/Effectiveness
        // stay reachable below — only the ranking-dependent hero/verdict/roster
        // heat are actually unavailable.
        <Surface padding="md">
          <InlineNotice
            tone="danger"
            title="Couldn't load team intelligence — retry"
            action={
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<RotateCw className="h-4 w-4" aria-hidden />}
                onClick={() => router.refresh()}
              >
                Try again
              </Button>
            }
          >
            {overviewError ?? 'We hit a snag loading the team overview. Signals, Players, and Effectiveness below are unaffected.'}
          </InlineNotice>
        </Surface>
      )}
      <div className={cn('flex flex-col gap-6 min-[940px]:grid min-[940px]:grid-cols-[300px_1fr] min-[940px]:items-start')}>
        <CoachSpine
          className="min-[940px]:sticky min-[940px]:top-20"
          hero={hero}
          verdict={verdict}
          trajectorySentence={trajectorySentence}
          priorities={priorities}
          ledger={ledger}
        />
        <StageRouter param="view" homeKey="home" views={views} />
      </div>
    </div>
  );
}
