import 'server-only';
import { UserX } from 'lucide-react';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { isUuid } from '@/lib/utils/uuid';
import { loadTeamStats } from '../data/stats-team';
import { loadPlayerProfile } from '../data/stats-player';
import { loadCoachPlayerScope } from '../data/coachhelm-player';
import { loadStatsReads, readsForScope, type ChStatsReads } from '../data/stats-reads';
import { parseFilter, type ChFilterQuery } from '../data/stats-filter';
import { StatsTeam } from '../screens/stats/StatsTeam';
import { StatsPlayer } from '../screens/stats/StatsPlayer';
import { EmptyState } from '../ui/States';
import { Button } from '../ui/Button';
import { resolveClubhouseTeam } from './team';
import { NoTeam } from '../ui/NoTeam';
import '../styles/stats.css';

/**
 * /golf/dashboard/stats in Clubhouse.
 *   coach  - team stats, or ?player=<id> for any player on their team
 *   player - always their own profile; ?player= is ignored, never trusted
 * The team is always the caller's own (resolveClubhouseTeam), never one named in the address.
 * `?tab=` opens a profile tab (overview, game, rounds, dev). The round filter (window, type, from, to, course, only, skip) is
 * read from `query` by `parseFilter`, which drops anything unusable; `window` alone is the older, narrower way in.
 */
export async function ClubhouseStatsRoute({ player, window, tab, query }: { player?: string; window?: string; tab?: string; query?: ChFilterQuery }) {
  const session = await getGolfSessionProfile();
  if (!session) return null;
  const team = await resolveClubhouseTeam(session);
  if (!team) return <StatsNoTeam coach={!!session.coach} />;
  const filter = parseFilter({ ...query, ...(window !== undefined ? { window } : {}) });
  const win = filter.window;

  if (team.role === 'player') {
    // Game detail's "CoachHelm sees…" reads beside the profile, for the session's own player id (never the address's).
    const [profile, reads] = await Promise.all([
      loadPlayerProfile({ viewer: 'player', teamId: team.teamId, playerId: team.playerId, window: win, filter }),
      loadStatsReads({ role: 'player', playerId: team.playerId }),
    ]);
    return profile ? <StatsPlayer data={profile} coachId={null} initialTab={tab} reads={reads} /> : <NotOnTeam coach={false} />;
  }

  if (player) {
    // An id that is not shaped like one is not on any team; it never reaches the database (which would answer 22P02).
    if (!isUuid(player)) return <NotOnTeam coach />;
    // The coach's reads wait for the scope check (this coach's own team, CoachHelm on for both). They start beside the profile
    // and stream in behind it (C2): the page paints from the profile, and each "CoachHelm sees" line lands when the reads do.
    // The promise never rejects: a failed scope check or read is `{ status: 'failed' }`.
    const reads: Promise<ChStatsReads> = loadCoachPlayerScope({ coachId: team.coachId, teamId: team.teamId, playerId: player })
      .then(readsForScope)
      .catch((): ChStatsReads => ({ status: 'failed' }));
    const profile = await loadPlayerProfile({ viewer: 'coach', teamId: team.teamId, playerId: player, window: win, filter });
    return profile ? <StatsPlayer data={profile} coachId={team.coachId} initialTab={tab} reads={reads} /> : <NotOnTeam coach />;
  }
  return <StatsTeam data={await loadTeamStats({ teamId: team.teamId, window: win, filter })} />;
}

export function StatsNoTeam({ coach }: { coach: boolean }) {
  return (
    <main className="ch-st">
      <NoTeam code="CH-4309" coach={coach} body={coach ? 'Stats fill in once your team is set up and players post rounds.' : 'Your stats show here once a coach adds you to a team roster.'} />
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
