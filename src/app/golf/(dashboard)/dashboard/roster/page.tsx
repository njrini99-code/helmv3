import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { InvitePlayerButton } from '@/components/golf/roster/InvitePlayerButton';
import { PlayerStatusBadge } from '@/components/golf/roster/PlayerStatusBadge';
import { YearBadge } from '@/components/golf/roster/YearBadge';
import { PlayerActionsMenu } from '@/components/golf/roster/PlayerActionsMenu';
import { ShineEffect } from '@/components/ui/shine-effect';
import { Avatar } from '@/components/ui/avatar';
import type { GolfPlayer } from '@/lib/types/golf';
import { IconUsers, IconChartBar, IconMessage, IconChevronRight } from '@/components/icons';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Team Roster | Helm Golf',
  description: 'Manage your golf team roster, view player stats, and track team performance',
};

// Cache roster page for 5 minutes (roster doesn't change frequently)
export const revalidate = 300;

interface PlayerWithStats extends GolfPlayer {
  rounds_count?: number;
  avg_score?: number;
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

  // Get coach
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  if (coachError) {
    console.error('Error fetching coach:', coachError);
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto text-center">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Coach Profile Not Found</h2>
          <p className="text-slate-500 mb-4">
            Unable to load your coach profile. Please contact support if this persists.
          </p>
          <p className="text-xs text-slate-400">Error: {coachError.message}</p>
        </div>
      </div>
    );
  }

  if (!coach) {
    console.error('No coach record found for user:', user.id);
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto text-center">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Coach Profile Not Found</h2>
          <p className="text-slate-500">
            You don't have a coach profile set up. Please complete your onboarding.
          </p>
        </div>
      </div>
    );
  }

  if (!coach.team_id) {
    console.warn('Coach has no team_id:', coach.id);
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto text-center">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">No Team Assigned</h2>
          <p className="text-slate-500 mb-4">
            You haven't been assigned to a team yet. Please contact your administrator to assign you to a team.
          </p>
          <p className="text-xs text-slate-400">Coach ID: {coach.id}</p>
        </div>
      </div>
    );
  }

  // Get team details
  const { data: team, error: teamError } = await supabase
    .from('golf_teams')
    .select('name, invite_code')
    .eq('id', coach.team_id)
    .single();

  if (teamError) {
    console.error('Error fetching team:', teamError);
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto text-center">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Team Not Found</h2>
          <p className="text-slate-500 mb-4">
            Unable to load team information. The team may have been deleted.
          </p>
          <p className="text-xs text-slate-400">Team ID: {coach.team_id}</p>
          <p className="text-xs text-slate-400">Error: {teamError.message}</p>
        </div>
      </div>
    );
  }

  // Get players - this query should be scoped by RLS now
  const { data: players, error: playersError } = await supabase
    .from('golf_players')
    .select('*')
    .eq('team_id', coach.team_id)
    .order('last_name', { ascending: true });

  if (playersError) {
    console.error('Error fetching players:', playersError);
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto text-center">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Error Loading Roster</h2>
          <p className="text-slate-500 mb-4">
            Unable to load team roster. Please try refreshing the page.
          </p>
          <p className="text-xs text-slate-400">Error: {playersError.message}</p>
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
          };
        });
      })()
    : [];

  const teamName = team?.name || 'Team';
  const inviteCode = team?.invite_code || null;

  return (
    <div className="min-h-screen">
      {/* Header Section */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Team Roster</h1>
              <p className="text-slate-500 mt-0.5">
                {playersWithStats.length} {playersWithStats.length === 1 ? 'player' : 'players'} on {teamName}
              </p>
            </div>
            <InvitePlayerButton teamName={teamName} existingCode={inviteCode} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {playersWithStats.length === 0 ? (
          <div className="relative glass-standard rounded-2xl overflow-hidden p-16 text-center">
            <ShineEffect />
            <div className="relative w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <IconUsers size={28} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Players Yet</h3>
            <p className="text-slate-500 mb-6 max-w-sm mx-auto">
              Start building your team by inviting players to join your roster
            </p>
            <InvitePlayerButton teamName={teamName} existingCode={inviteCode} />
          </div>
        ) : (
          <div className="space-y-3">
            {playersWithStats.map((player, index) => (
              <div
                key={player.id}
                className="group relative glass-standard rounded-xl overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
                style={{
                  animation: 'fadeInUp 0.4s ease-out forwards',
                  animationDelay: `${index * 30}ms`,
                  opacity: 0,
                }}
              >
                <ShineEffect />
                <div className="relative flex items-center gap-4 p-4">
                  {/* Avatar */}
                  <div className="relative">
                    {player.avatar_url ? (
                      <div className={cn(
                        'w-12 h-12 rounded-xl overflow-hidden flex-shrink-0',
                        'ring-1 ring-black/5 shadow-sm'
                      )}>
                        <Image
                          src={player.avatar_url}
                          alt={`${player.first_name} ${player.last_name}`}
                          width={48}
                          height={48}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <Avatar
                        name={`${player.first_name} ${player.last_name}`}
                        size="lg"
                      />
                    )}
                    {/* Status dot color matches actual status */}
                    <div className={cn(
                      'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm',
                      player.status === 'active' && 'bg-emerald-500',
                      player.status === 'injured' && 'bg-rose-500',
                      player.status === 'redshirt' && 'bg-amber-500',
                      player.status === 'inactive' && 'bg-slate-400',
                      !player.status && 'bg-emerald-500',
                    )} />
                  </div>

                  {/* Player Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">
                        {player.first_name} {player.last_name}
                      </p>
                      <YearBadge year={player.year} />
                      <PlayerStatusBadge playerId={player.id} currentStatus={player.status} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {player.hometown && player.state && (
                        <span className="text-sm text-slate-500">
                          {player.hometown}, {player.state}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="hidden md:flex items-center gap-1">
                    <div className="flex flex-col items-center px-4 py-1 rounded-lg hover:bg-slate-50 transition-colors">
                      <p className="text-lg font-semibold text-slate-900 tabular-nums leading-none">
                        {player.rounds_count || 0}
                      </p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">Rounds</p>
                    </div>
                    <div className="w-px h-8 bg-slate-100" />
                    <div className="flex flex-col items-center px-4 py-1 rounded-lg hover:bg-slate-50 transition-colors">
                      <p className="text-lg font-semibold text-slate-900 tabular-nums leading-none">
                        {player.avg_score && player.avg_score > 0 ? player.avg_score.toFixed(1) : '—'}
                      </p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">Avg</p>
                    </div>
                    <div className="w-px h-8 bg-slate-100" />
                    <div className="flex flex-col items-center px-4 py-1 rounded-lg hover:bg-slate-50 transition-colors">
                      <p className={cn(
                        'text-lg font-semibold tabular-nums leading-none',
                        player.handicap !== null && player.handicap <= 0 ? 'text-emerald-600' : 'text-slate-900'
                      )}>
                        {formatHandicap(player.handicap)}
                      </p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">HCP</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5">
                    {/* Primary action always visible */}
                    <Link href={`/golf/dashboard/messages?player=${player.id}`}>
                      <button className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors" aria-label="Send Message">
                        <IconMessage size={16} className="text-slate-600" />
                      </button>
                    </Link>

                    {/* Secondary actions on hover */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link href={`/golf/dashboard/stats?player=${player.id}`}>
                        <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors" aria-label="View Stats">
                          <IconChartBar size={16} className="text-slate-500" />
                        </button>
                      </Link>
                      <Link href={`/golf/dashboard/roster/${player.id}`}>
                        <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors" aria-label="View Profile">
                          <IconChevronRight size={16} className="text-slate-400" />
                        </button>
                      </Link>
                      <PlayerActionsMenu
                        playerId={player.id}
                        playerName={`${player.first_name} ${player.last_name}`}
                      />
                    </div>
                  </div>
                </div>

                {/* Mobile Stats Row */}
                <div className="md:hidden flex items-center justify-around px-4 py-3 border-t border-slate-100 bg-slate-50/50 rounded-b-xl">
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Rounds</p>
                    <p className="font-semibold text-slate-900 text-sm">{player.rounds_count || 0}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Avg</p>
                    <p className="font-semibold text-slate-900 text-sm">
                      {player.avg_score && player.avg_score > 0 ? player.avg_score.toFixed(1) : '--'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">HCP</p>
                    <p className="font-semibold text-slate-900 text-sm">
                      {formatHandicap(player.handicap)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CSS Keyframes */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
