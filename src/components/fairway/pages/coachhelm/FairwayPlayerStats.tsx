'use client';

import Link from 'next/link';
import { EmptyState, Surface } from '@/components/fairway';
import { useGolfUser } from '@/contexts/golf-user-context';
import { FairwayStatsCockpit } from '@/components/fairway/pages/coachhelm/FairwayStatsCockpit';
import { StatsPageShell } from '@/components/fairway/pages/stats/StatsPageShell';
import { coachHelmRoutes } from '@/lib/coachhelm/fairway-routes';

export interface FairwayPlayerStatsProps {
  initialPlayerId?: string | null;
  /** Server-resolved display name — avoids masthead flash on coach drill-down. */
  initialPlayerName?: string | null;
}

export function FairwayPlayerStats({
  initialPlayerId = null,
  initialPlayerName = null,
}: FairwayPlayerStatsProps) {
  const golfUser = useGolfUser();

  const resolvedPlayerId = initialPlayerId || golfUser.playerId || null;
  const isCoachView = golfUser.role === 'coach';

  const playerName = isCoachView
    ? initialPlayerName
    : golfUser.name;

  const title = isCoachView
    ? playerName ?? 'Player'
    : 'Your stats';

  const description = isCoachView
    ? playerName
      ? `Where ${playerName} is gaining and leaking strokes — vs Tour and your team.`
      : 'Vs Tour and the team — strokes gained and fundamentals.'
    : 'Where you are gaining and leaking strokes — vs Tour and your team.';

  const backAction = isCoachView ? (
    <div className="flex flex-wrap items-center gap-4">
      <Link
        href={coachHelmRoutes.teamStats}
        className="rounded-fw-sm font-fw-sans text-label font-medium text-text-secondary outline-none transition-colors [transition-duration:180ms] hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
      >
        ← Team stats
      </Link>
      {resolvedPlayerId ? (
        <Link
          href={`/golf/dashboard/roster/${resolvedPlayerId}`}
          className="rounded-fw-sm font-fw-sans text-label font-medium text-text-tertiary outline-none transition-colors [transition-duration:180ms] hover:text-text-secondary focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
        >
          Roster profile
        </Link>
      ) : null}
    </div>
  ) : undefined;

  const body = !resolvedPlayerId ? (
    <Surface padding="lg">
      <EmptyState
        title="No player selected"
        description="Pick a player from the team leaderboard to see their personal stats."
        action={
          <Link
            href={coachHelmRoutes.teamStats}
            className="font-fw-sans text-label font-medium text-accent-600 hover:text-accent-700"
          >
            Back to team stats
          </Link>
        }
      />
    </Surface>
  ) : (
    <FairwayStatsCockpit playerId={resolvedPlayerId} isOwnStats={!isCoachView} />
  );

  return (
    <StatsPageShell title={title} description={description} actions={backAction}>
      {body}
    </StatsPageShell>
  );
}

export default FairwayPlayerStats;
