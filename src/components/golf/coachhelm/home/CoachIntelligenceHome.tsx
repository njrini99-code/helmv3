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
 * everything else straight to `TriageDesk`, the ONE cockpit + Signals
 * workspace surface (Fairway Premium Facelift) that replaces the old
 * Spine + Bento AND the standalone `CommandOpening` "welcome" opening —
 * that opening's identity line, pulse readouts, one urgent signal, and
 * "Ask CoachHelm" CTA are now the `TriageDesk`'s own `Spine`.
 *
 * `CommandOpening.tsx` itself is left in place (its `relativeDays` export is
 * still unit-tested directly), simply no longer imported/rendered here.
 * ========================================================================== */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProgramPulse } from '@/lib/coachhelm/v3/chat/program-pulse';
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

  /**
   * The chat context. Null when it could not be resolved — the Triage Desk
   * still renders (only its Spine identity line falls back to a neutral
   * "Your team" label), because Signals/Players/Effectiveness are not
   * allowed to depend on CoachHelm being reachable.
   */
  command: {
    teamName: string;
    coachFirstName: string | null;
    players: { id: string; name: string }[];
    pulse: ProgramPulse;
  } | null;

  /** Server-seeded ISO timestamp (`page.tsx`'s one-time render-time
   *  `new Date().toISOString()`) — threaded to `TriageDesk` to format its
   *  Spine date + relative "last scan" caption without reading the ambient
   *  clock during a client re-render. */
  now: string;
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
  command,
  now,
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
    <div className="flex flex-col gap-8">
      {overviewFailed && (
        <Surface padding="md">
          <InlineNotice
            tone="danger"
            title="Couldn't load team intelligence"
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
        teamName={command?.teamName ?? 'Your team'}
        now={now}
        playersDrillProps={playersDrillProps}
        effectivenessDrillProps={effectivenessDrillProps}
      />
    </div>
  );
}
