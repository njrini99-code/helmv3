'use client';

/**
 * ============================================================================
 * CoachIntelligenceHome — coach `/dashboard/intelligence`, on the Triage Desk
 * chassis
 * ----------------------------------------------------------------------------
 * The composition root the page mounts. Runs the SAME empty-roster /
 * overview-failure gate the earlier Spine & Stage build established (an
 * overview FAILURE renders an honest retry notice; a genuinely empty roster
 * keeps the onboarding gate — the two must never be conflated), then hands
 * everything else straight to `TriageDesk`, the ONE new command-desk surface
 * that replaces the old Spine + Bento entirely (Triage Desk spec).
 * ========================================================================== */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RotateCw } from 'lucide-react';
import { Surface, EmptyState, Button, InlineNotice } from '@/components/fairway';
import type { PlayersGridViewProps, FairwayEffectivenessProps } from '@/components/fairway';
import type { TeamOverviewResult, TeamCategoryInsightsResult } from '@/app/golf/actions/team-category-insights';
import type { SignalGroup } from '@/lib/coachhelm/signal-grouping';
import { TriageDesk } from '@/components/golf/coachhelm/triage/TriageDesk';

export interface CoachIntelligenceHomeProps {
  overview: TeamOverviewResult;
  /** "Where the team is bleeding strokes" band data (categories[] +
   *  teamHealth) — a DISTINCT, richer fetch from `overview` above. Threaded
   *  straight through to `TriageDesk`; this component doesn't read it (the
   *  empty-roster gate still keys off `overview`/`playersDrillProps`, same
   *  as before). */
  categoryInsights: TeamCategoryInsightsResult;
  coachId: string;

  /** Triage Desk — the frozen `getSignalGroups` contract's full payload. */
  groups: SignalGroup[];
  scannedAt: string | null;
  groupsError: string | null;

  /** `players` view — copied from development/page.tsx, mounted UNCHANGED. */
  playersDrillProps: PlayersGridViewProps;

  /** `effectiveness` view — copied from analytics/coachhelm/page.tsx, mounted UNCHANGED. */
  effectivenessDrillProps: FairwayEffectivenessProps;
}

export function CoachIntelligenceHome({
  overview,
  categoryInsights,
  coachId,
  groups,
  scannedAt,
  groupsError,
  playersDrillProps,
  effectivenessDrillProps,
}: CoachIntelligenceHomeProps) {
  const router = useRouter();

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
  const ov = overview.success ? overview.data : undefined;
  const playerCount = ov?.playerCount ?? (overviewFailed ? rosterPlayerCount : 0);

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

  return (
    <div className="flex flex-col gap-6">
      {overviewFailed && (
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
      <TriageDesk
        coachId={coachId}
        groups={groups}
        scannedAt={scannedAt}
        groupsError={groupsError}
        categoryInsights={categoryInsights}
        teamShotAnalysis={ov?.teamShotAnalysis}
        playersDrillProps={playersDrillProps}
        effectivenessDrillProps={effectivenessDrillProps}
      />
    </div>
  );
}
