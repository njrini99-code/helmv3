import 'server-only';
import { UserX, Users } from 'lucide-react';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { isUuid } from '@/lib/utils/uuid';
import { loadTeamStats } from '../data/stats-team';
import { loadPlayerProfile } from '../data/stats-player';
import { parseWindow } from '../data/stats-common';
import { StatsTeam } from '../screens/stats/StatsTeam';
import { StatsPlayer } from '../screens/stats/StatsPlayer';
import { EmptyState } from '../ui/States';
import { Button } from '../ui/Button';
import { resolveClubhouseTeam } from './team';
import '../styles/stats.css';

/**
 * /golf/dashboard/stats in Clubhouse.
 *   coach  - team stats, or ?player=<id> for any player on their team
 *   player - always their own profile; ?player= is ignored, never trusted
 * The team is always the caller's own (resolveClubhouseTeam), never one named in the address.
 * `?tab=` opens a profile tab (overview, game, rounds, dev).
 */
export async function ClubhouseStatsRoute({ player, window, tab }: { player?: string; window?: string; tab?: string }) {
  const session = await getGolfSessionProfile();
  if (!session) return null;
  const team = await resolveClubhouseTeam(session);
  if (!team) return <StatsNoTeam coach={!!session.coach} />;
  const win = parseWindow(window);

  if (team.role === 'player') {
    const profile = await loadPlayerProfile({ viewer: 'player', teamId: team.teamId, playerId: team.playerId, window: win });
    return profile ? <StatsPlayer data={profile} coachId={null} initialTab={tab} /> : <NotOnTeam coach={false} />;
  }

  if (player) {
    // An id that is not shaped like one is not on any team; it never reaches the database (which would answer 22P02).
    if (!isUuid(player)) return <NotOnTeam coach />;
    const profile = await loadPlayerProfile({ viewer: 'coach', teamId: team.teamId, playerId: player, window: win });
    return profile ? <StatsPlayer data={profile} coachId={team.coachId} initialTab={tab} /> : <NotOnTeam coach />;
  }
  return <StatsTeam data={await loadTeamStats({ teamId: team.teamId, window: win })} />;
}

export function StatsNoTeam({ coach }: { coach: boolean }) {
  return (
    <main className="ch-st">
      <EmptyState
        size="page"
        code="CH-4309"
        icon={Users}
        title="You aren't on a team yet"
        body={coach ? 'Stats fill in once your team is set up and players post rounds.' : 'Your stats show here once a coach adds you to a team roster.'}
      />
    </main>
  );
}

export function NotOnTeam({ coach }: { coach: boolean }) {
  return (
    <main className="ch-st">
      <EmptyState
        size="page"
        code={coach ? 'CH-5306' : 'CH-5307'}
        icon={UserX}
        title={coach ? 'That player isn’t on your team' : 'Your stats aren’t available'}
        body={coach ? 'They may have been removed, or the link is from another team.' : 'You aren’t on an active team roster right now.'}
        action={
          coach ? (
            <Button size="sm" href="/golf/dashboard/stats">
              Back to team stats
            </Button>
          ) : undefined
        }
      />
    </main>
  );
}
