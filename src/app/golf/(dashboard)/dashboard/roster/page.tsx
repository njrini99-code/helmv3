import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { InvitePlayerButton } from '@/components/golf/roster/InvitePlayerButton';
import { PlayerStatusBadge } from '@/components/golf/roster/PlayerStatusBadge';
import { YearBadge } from '@/components/golf/roster/YearBadge';
import { PlayerActionsMenu } from '@/components/golf/roster/PlayerActionsMenu';
import { PendingJoinRequests } from '@/components/golf/roster/PendingJoinRequests';
import { RosterPageClient } from '@/components/golf/roster/RosterPageClient';
import { MobileNavHeader } from '@/components/golf/layout/MobileNavHeader';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { IconUsers, IconChartBar, IconMessage, IconAlertCircle } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Team Roster | Helm Golf',
  description: 'Manage your golf team roster, view player stats, and track team performance',
};

// Cache roster page for 1 minute (balance between freshness and performance)
export const revalidate = 60;

interface PlayerWithStats {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  hometown: string | null;
  state: string | null;
  graduation_year: number | null;
  handicap: number | null;
  status: string | null;
  rounds_count?: number;
  avg_score?: number;
  last_seen?: string | null;
}

// Helper function to check if user is online (active within last 5 minutes)
function isUserOnline(lastSeen: string | null | undefined): boolean {
  if (!lastSeen) return false;
  const lastSeenDate = new Date(lastSeen);
  const now = new Date();
  const diffMinutes = (now.getTime() - lastSeenDate.getTime()) / (1000 * 60);
  return diffMinutes < 5;
}

// Helper function to format handicap display
function formatHandicap(handicap: number | null): string {
  if (handicap === null) return '—';
  if (handicap > 0) return `+${handicap.toFixed(1)}`;
  return handicap.toFixed(1);
}

export default async function GolfRosterPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  // Get coach — use maybeSingle() to avoid PGRST116 if user is not a coach
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coachError) {
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto text-center">
          <h2 className="text-lg font-semibold text-warm-900 mb-2">Coach Profile Not Found</h2>
          <p className="text-warm-500 mb-4">
            Unable to load your coach profile. Please contact support if this persists.
          </p>
          <p className="text-xs text-warm-400">Error: {coachError.message}</p>
        </div>
      </div>
    );
  }

  if (!coach) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <IconAlertCircle size={32} className="text-amber-500" />
          </div>
          <h2 className="text-xl font-semibold text-warm-900 mb-2">Coach Profile Not Found</h2>
          <p className="text-warm-500 mb-6">
            Unable to find your coach profile. Please complete onboarding or contact support.
          </p>
          <Link href="/golf/coach">
            <Button>Complete Onboarding</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Get team_id from organization
  let teamId: string | null = null;
  if (coach.organization_id) {
    const { data: orgTeam } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();
    teamId = orgTeam?.id || null;
  }

  if (!teamId) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <IconUsers size={32} className="text-amber-500" />
          </div>
          <h2 className="text-xl font-semibold text-warm-900 mb-2">No Team Assigned</h2>
          <p className="text-warm-500 mb-6">
            You haven't created or joined a team yet. Create a team to start building your roster.
          </p>
          <Link href="/golf/dashboard/team">
            <Button>Go to Team Settings</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Get team details
  const { data: team, error: teamError } = await supabase
    .from('golf_teams')
    .select('name, join_code')
    .eq('id', teamId)
    .single();

  if (teamError) {
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto text-center">
          <h2 className="text-lg font-semibold text-warm-900 mb-2">Team Not Found</h2>
          <p className="text-warm-500 mb-4">
            Unable to load team information. The team may have been deleted.
          </p>
          <p className="text-xs text-warm-400">Team ID: {teamId}</p>
          <p className="text-xs text-warm-400">Error: {teamError.message}</p>
        </div>
      </div>
    );
  }

  // Get players via team_members join - players are connected to teams through golf_team_members
  // Also fetch user's last_seen for online status indicator
  const { data: teamMembersData, error: playersError } = await supabase
    .from('golf_team_members')
    .select(`
      status,
      player:golf_players!inner (
        id,
        first_name,
        last_name,
        avatar_url,
        hometown,
        state,
        graduation_year,
        handicap,
        user:users (
          last_seen
        )
      )
    `)
    .eq('team_id', teamId);

  // Transform the data to flatten player info with status and last_seen
  const players = (teamMembersData || [])
    .filter(tm => tm.player && !('error' in tm.player))
    .map(tm => {
      const player = tm.player as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        avatar_url: string | null;
        hometown: string | null;
        state: string | null;
        graduation_year: number | null;
        handicap: number | null;
        user?: { last_seen: string | null } | null;
      };
      return {
        id: player.id,
        first_name: player.first_name,
        last_name: player.last_name,
        avatar_url: player.avatar_url,
        hometown: player.hometown,
        state: player.state,
        graduation_year: player.graduation_year,
        handicap: player.handicap,
        status: tm.status,
        last_seen: player.user?.last_seen || null,
      };
    })
    .sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));

  if (playersError) {
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto text-center">
          <h2 className="text-lg font-semibold text-warm-900 mb-2">Error Loading Roster</h2>
          <p className="text-warm-500 mb-4">
            Unable to load team roster. Please try refreshing the page.
          </p>
          <p className="text-xs text-warm-400">Error: {playersError.message}</p>
        </div>
      </div>
    );
  }

  // Get rounds to calculate stats for each player
  // PERFORMANCE OPTIMIZATION: Fetch all rounds in ONE query instead of N queries
  const playersWithStats: PlayerWithStats[] = players && players.length > 0
    ? await (async () => {
        // Fetch ALL rounds for ALL players in a single query
        const playerIds = players.map(p => p.id);
        const { data: allRounds } = await supabase
          .from('golf_rounds')
          .select('player_id, total_score')
          .in('player_id', playerIds)
          .not('total_score', 'is', null);

        // Group rounds by player_id in memory (fast!)
        const roundsByPlayer = (allRounds || []).reduce((acc, round) => {
          if (!acc[round.player_id]) acc[round.player_id] = [];
          acc[round.player_id]!.push(round);
          return acc;
        }, {} as Record<string, Array<{ player_id: string; total_score: number | null }>>);

        // Map players to include stats (no more database queries!)
        return players.map(player => {
          const rounds = roundsByPlayer[player.id] || [];
          const roundsCount = rounds.length;
          const avgScore = roundsCount > 0
            ? rounds.reduce((sum, r) => sum + (r.total_score || 0), 0) / roundsCount
            : 0;

          return {
            ...player,
            rounds_count: roundsCount,
            avg_score: avgScore,
            last_seen: player.last_seen,
          };
        });
      })()
    : [];

  const teamName = team?.name || 'Team';
  const inviteCode = team?.join_code || null;

  return (
    <RosterPageClient players={playersWithStats}>
    <AnimatedPage className="min-h-full bg-transparent">
      {/* Header Section */}
      <AnimatedItem>
      <MobileNavHeader
        title="Team Roster"
        subtitle={`${playersWithStats.length} ${playersWithStats.length === 1 ? 'player' : 'players'} on ${teamName}`}
      >
        <InvitePlayerButton teamName={teamName} existingCode={inviteCode} />
      </MobileNavHeader>
      </AnimatedItem>

      {/* Main Content */}
      <AnimatedItem>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Pending Join Requests */}
        <PendingJoinRequests />

        {playersWithStats.length === 0 ? (
          /* Enhanced Empty State */
          <div className="bg-white rounded-2xl border border-warm-200 p-12 md:p-16 text-center shadow-sm relative overflow-hidden">
            {/* Decorative background pattern */}
            <div className="absolute inset-0 opacity-[0.03]">
              <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <pattern id="roster-pattern" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                  <circle cx="20" cy="20" r="2" fill="currentColor" />
                </pattern>
                <rect fill="url(#roster-pattern)" width="100%" height="100%" />
              </svg>
            </div>
            <div className="relative z-10">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center mx-auto mb-6 shadow-sm">
                <IconUsers size={36} className="text-primary-500" />
              </div>
              <h3 className="text-2xl font-semibold text-warm-900 mb-3">Build Your Team</h3>
              <p className="text-warm-500 mb-4 max-w-md mx-auto leading-relaxed">
                Start building your team by inviting players to join your roster.
                Players will receive a code they can use to join.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
                <InvitePlayerButton teamName={teamName} existingCode={inviteCode} />
              </div>
              {inviteCode && (
                <p className="text-xs text-warm-400 mt-4">
                  Team code: <span className="font-mono font-medium text-warm-500">{inviteCode}</span>
                </p>
              )}
            </div>
          </div>
        ) : (
          /* Player Cards Grid - 1 column on mobile, 2 columns on desktop */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
            {playersWithStats.map((player) => (
              <div
                key={player.id}
                className="group bg-white rounded-2xl border border-warm-200 shadow-sm hover:shadow-md hover:border-warm-300 hover:-translate-y-0.5 transition-all duration-200"
              >
                {/* Card Header with Avatar and Name */}
                <div className="p-5 md:p-6">
                  <div className="flex items-start gap-4">
                    {/* Large Avatar - 72px mobile, 80px desktop */}
                    <div className="relative flex-shrink-0">
                      {player.avatar_url ? (
                        <div className="w-[72px] h-[72px] md:w-20 md:h-20 rounded-2xl overflow-hidden ring-1 ring-warm-200 shadow-sm">
                          <Image
                            src={player.avatar_url}
                            alt={`${player.first_name} ${player.last_name}`}
                            width={80}
                            height={80}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-[72px] h-[72px] md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-warm-100 to-warm-200 flex items-center justify-center ring-1 ring-warm-200">
                          <span className="text-2xl font-semibold text-warm-500">
                            {(player.first_name?.[0] || '')}{(player.last_name?.[0] || '')}
                          </span>
                        </div>
                      )}
                      {/* Online status indicator */}
                      <div className={cn(
                        'absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-[3px] border-white shadow-sm',
                        isUserOnline(player.last_seen) ? 'bg-primary-500' : 'bg-warm-300',
                      )} title={isUserOnline(player.last_seen) ? 'Online' : 'Offline'} />
                    </div>

                    {/* Player Info */}
                    <div className="flex-1 min-w-0 pt-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg md:text-xl font-semibold text-warm-900 truncate">
                          {player.first_name} {player.last_name}
                        </h3>
                        <YearBadge year={player.graduation_year} />
                      </div>

                      {player.hometown && player.state && (
                        <p className="text-sm text-warm-500 mt-1">
                          {player.hometown}, {player.state}
                        </p>
                      )}

                      <div className="mt-2">
                        <PlayerStatusBadge playerId={player.id} currentStatus={player.status} />
                      </div>
                    </div>

                    {/* Actions Menu */}
                    <div className="flex-shrink-0">
                      <PlayerActionsMenu
                        playerId={player.id}
                        playerName={`${player.first_name} ${player.last_name}`}
                        currentStatus={player.status}
                      />
                    </div>
                  </div>
                </div>

                {/* Stats Row */}
                <div className="px-5 md:px-6 pb-4 md:pb-5">
                  <div className="flex items-center justify-between bg-warm-50/80 rounded-xl p-4 md:p-5">
                    <div className="text-center flex-1">
                      <p className="text-2xl md:text-3xl font-bold text-warm-900 tabular-nums leading-none">
                        {player.rounds_count || 0}
                      </p>
                      <p className="text-xs text-warm-500 font-medium uppercase tracking-wide mt-1.5">Rounds</p>
                    </div>
                    <div className="w-px h-12 bg-warm-200/80" />
                    <div className="text-center flex-1">
                      <p className="text-2xl md:text-3xl font-bold text-warm-900 tabular-nums leading-none">
                        {player.avg_score && player.avg_score > 0 ? player.avg_score.toFixed(1) : '—'}
                      </p>
                      <p className="text-xs text-warm-500 font-medium uppercase tracking-wide mt-1.5">Avg Score</p>
                    </div>
                    <div className="w-px h-12 bg-warm-200/80" />
                    <div className="text-center flex-1">
                      <p className={cn(
                        'text-2xl md:text-3xl font-bold tabular-nums leading-none',
                        player.handicap !== null && player.handicap <= 0 ? 'text-primary-600' : 'text-warm-900'
                      )}>
                        {formatHandicap(player.handicap)}
                      </p>
                      <p className="text-xs text-warm-500 font-medium uppercase tracking-wide mt-1.5">Handicap</p>
                    </div>
                  </div>
                </div>

                {/* Action Buttons - min 44px touch targets */}
                <div className="px-5 md:px-6 pb-5 md:pb-6 flex items-center gap-3">
                  <Link href={`/golf/dashboard/stats?player=${player.id}`} className="flex-1">
                    <button className="w-full px-4 py-3 bg-warm-900 text-white text-sm font-medium rounded-xl hover:bg-warm-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                      <IconChartBar size={16} />
                      View Stats
                    </button>
                  </Link>
                  <Link href={`/golf/dashboard/messages?player=${player.id}`} className="flex-1">
                    <button className="w-full px-4 py-3 bg-white border border-warm-200 text-warm-700 text-sm font-medium rounded-xl hover:bg-warm-50 hover:border-warm-300 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                      <IconMessage size={16} />
                      Message
                    </button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </AnimatedItem>
    </AnimatedPage>
    </RosterPageClient>
  );
}
