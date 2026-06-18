import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
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
import { RosterIntentControl } from '@/components/golf/roster/RosterIntentControl';
import { PlayerRosterView } from '@/components/golf/roster/PlayerRosterView';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { FairwayCoachRoster } from '@/components/fairway/pages/roster/FairwayCoachRoster';
import { FairwayPlayerRoster } from '@/components/fairway/pages/roster/FairwayPlayerRoster';
import { getTeamJoinRequests } from '@/app/golf/actions/teams';
import { loadCoachIntents } from '@/lib/coachhelm/v3/intent/loader';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { IconUsers, IconAlertCircle } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { ContainerGrid } from '@/components/ui/containers';
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

// `formatHandicap` was removed in the 2026-05-28 IA trim — the roster card
// now exposes only Avg Score inline; handicap surfaces on the player detail
// page. Re-add here if a future card revision restores the metric.

export default async function GolfRosterPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach, player } = session;
  const supabase = await createClient();

  if (!coach) {
    // Not a coach — check player path

    if (!player) {
      return (
        <div className="min-h-full flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <IconAlertCircle size={32} className="text-amber-500" />
            </div>
            <h2 className="text-h3 font-medium text-warm-900 tracking-[-0.015em] mb-2">Profile Not Found</h2>
            <p className="text-warm-500 mb-6">
              Unable to find your profile. Please complete onboarding or contact support.
            </p>
            <Link href="/golf/coach">
              <Button>Complete Onboarding</Button>
            </Link>
          </div>
        </div>
      );
    }

    const { data: teamMember } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', player.id)
      .maybeSingle();

    if (!teamMember?.team_id) {
      return (
        <div className="min-h-full flex items-center justify-center">
          <EmptyState
            icon={<IconUsers size={36} />}
            title="No Team Found"
            description="You haven't joined a team yet. Ask your coach for a join code."
          />
        </div>
      );
    }

    // Player roster is its own page. The redesign renders the Fairway player
    // roster (FairwayPlayerRoster); flag-off keeps the legacy PlayerRosterView.
    // (Previously the redesign path redirected into the Team Hub Teammates tab,
    // which made the "Roster" nav item a dead bounce — fixed 2026-06-18.)

    // Fetch team info and teammates for player view
    const { data: playerTeam } = await supabase
      .from('golf_teams')
      .select('name')
      .eq('id', teamMember.team_id)
      .maybeSingle();

    const { data: tmData } = await supabase
      .from('golf_team_members')
      .select(`
        player:golf_players!inner (
          id, first_name, last_name, avatar_url, handicap, graduation_year,
          user:users(last_seen)
        )
      `)
      .eq('team_id', teamMember.team_id)
      .neq('player_id', player.id);

    const teammates = (tmData || [])
      .filter(tm => tm.player && !('error' in tm.player))
      .map(tm => {
        const p = tm.player as {
          id: string;
          first_name: string | null;
          last_name: string | null;
          avatar_url: string | null;
          handicap: number | null;
          graduation_year: number | null;
          user?: { last_seen: string | null } | null;
        };
        return {
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          avatar_url: p.avatar_url,
          handicap: p.handicap,
          graduation_year: p.graduation_year,
          last_seen: p.user?.last_seen || null,
        };
      })
      .sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));

    if (isRedesignEnabled()) {
      return (
        <div className={fairwayScope('min-h-full bg-canvas')}>
          <FairwayPlayerRoster players={teammates} teamName={playerTeam?.name || 'Team'} />
        </div>
      );
    }

    return <PlayerRosterView players={teammates} teamName={playerTeam?.name || 'Team'} />;
  }

  // Get team_id from organization (deterministic: handles orgs with >1 team)
  const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);

  if (!teamId) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <EmptyState
          icon={<IconUsers size={36} />}
          title="No Team Assigned"
          description="You haven't created or joined a team yet. Create a team to start building your roster."
          action={{ label: 'Go to Team Settings', href: '/golf/dashboard/team' }}
        />
      </div>
    );
  }

  // Get team details
  const { data: team, error: teamError } = await supabase
    .from('golf_teams')
    .select('name, join_code')
    .eq('id', teamId)
    .maybeSingle();

  if (teamError) {
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto text-center">
          <h2 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em] mb-2">Team Not Found</h2>
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
          <h2 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em] mb-2">Error Loading Roster</h2>
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
          .select('player_id, total_score, holes_played')
          .in('player_id', playerIds)
          .not('total_score', 'is', null);

        // Group rounds by player_id in memory (fast!)
        const roundsByPlayer = (allRounds || []).reduce((acc, round) => {
          if (!acc[round.player_id]) acc[round.player_id] = [];
          acc[round.player_id]!.push(round);
          return acc;
        }, {} as Record<string, Array<{ player_id: string; total_score: number | null; holes_played: number | null }>>);

        // Map players to include stats — normalize to 18-hole equivalent
        return players.map(player => {
          const rounds = roundsByPlayer[player.id] || [];
          const roundsCount = rounds.length;
          // Compute per-hole average then express as 18-hole equivalent
          let totalStrokes = 0;
          let totalHoles = 0;
          for (const r of rounds) {
            if (r.total_score) {
              const hp = r.holes_played ?? 18;
              totalStrokes += r.total_score;
              totalHoles += hp;
            }
          }
          const avgScore = totalHoles > 0
            ? (totalStrokes / totalHoles) * 18
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
  const activeCount = playersWithStats.filter(
    (p) => p.status === 'active' || p.status === null,
  ).length;

  // Coach intent (CoachHelm v3): load every intent row this coach has
  // authored for their roster, keyed by player_id. The table is honestly
  // EMPTY until a coach sets intent — players with no row get `null` below,
  // which the IntentPill renders as its neutral "No intent" cold-start chip.
  // This is the coach view only; the player roster path returned earlier.
  const coachIntents = await loadCoachIntents(coach.id);

  if (isRedesignEnabled()) {
    const jrRes = await getTeamJoinRequests();
    const joinRequests = jrRes.success && jrRes.data ? jrRes.data : [];
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <FairwayCoachRoster
          players={playersWithStats}
          teamName={teamName}
          inviteCode={inviteCode}
          intents={Object.fromEntries(coachIntents)}
          joinRequests={joinRequests}
        />
      </div>
    );
  }

  return (
    <RosterPageClient players={playersWithStats}>
    <AnimatedPage className="min-h-full bg-transparent">
      {/* Header Section */}
      <AnimatedItem>
      <LargeTitleHeader
        title="Team Roster"
        subtitle={`${playersWithStats.length} ${playersWithStats.length === 1 ? 'player' : 'players'} on ${teamName}`}
      >
        <InvitePlayerButton teamName={teamName} existingCode={inviteCode} />
      </LargeTitleHeader>
      </AnimatedItem>

      {/* Main Content */}
      <AnimatedItem>
      <ContainerGrid wide className="py-6 md:py-8">
        {/* Editorial hero plinth — magazine-cover framing for the
            roster, sitting beneath the sticky LargeTitleHeader. */}
        <Reveal>
          <div className="surface-stone rounded-3xl p-6 md:p-10 mb-6">
            <PageHeader
              eyebrow="Roster"
              eyebrowAccent="primary"
              title="Your players."
              subtitle={
                playersWithStats.length === 0
                  ? `Build your roster on ${teamName} by inviting players to join.`
                  : `${playersWithStats.length} ${playersWithStats.length === 1 ? 'player' : 'players'}${
                      activeCount !== playersWithStats.length ? ` · ${activeCount} active` : ''
                    } on ${teamName}.`
              }
            />
          </div>
        </Reveal>

        {/* Pending Join Requests */}
        <PendingJoinRequests />

        {playersWithStats.length === 0 ? (
          /* Enhanced Empty State */
          <div className="surface-matte rounded-3xl p-12 md:p-16 text-center shadow-sm relative overflow-hidden">
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
              <div className="w-20 h-20 rounded-2xl bg-primary-50/70 flex items-center justify-center mx-auto mb-6 shadow-sm">
                <IconUsers size={36} className="text-primary-500" />
              </div>
              <h3 className="text-2xl font-medium text-warm-900 mb-3">Build Your Team</h3>
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
          <Reveal staggerIndex={1} className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
            {playersWithStats.map((player) => (
              <div
                key={player.id}
                className="group surface-matte rounded-3xl hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200"
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
                        <div className="w-[72px] h-[72px] md:w-20 md:h-20 rounded-2xl bg-warm-100/65 flex items-center justify-center">
                          <span className="text-2xl font-medium text-warm-500">
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
                        <h3 className="text-lg md:text-h3 font-medium text-warm-900 tracking-[-0.015em] truncate">
                          {player.first_name} {player.last_name}
                        </h3>
                        <YearBadge year={player.graduation_year} />
                      </div>

                      {player.hometown && player.state && (
                        <p className="text-sm text-warm-500 mt-1">
                          {player.hometown}, {player.state}
                        </p>
                      )}

                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <PlayerStatusBadge playerId={player.id} currentStatus={player.status} />
                        {/* Coach intent (CoachHelm v3) — click opens the
                            IntentDrawer to author narrative posture + alert
                            sensitivity. Coach view only; the player roster
                            view (PlayerRosterView) never renders this. */}
                        <RosterIntentControl
                          playerId={player.id}
                          playerName={`${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || 'Player'}
                          current={coachIntents.get(player.id) ?? null}
                        />
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

                {/* Anchor stat — Avg Score is the single number a coach scans
                    when planning today's lineup. Rounds count + handicap moved
                    to the player detail page (one click away). IA audit
                    2026-05-28 collapsed the 3-stat row to reduce per-card
                    visual weight from 6 numbers + 3 buttons to 1 + 1 + menu. */}
                <div className="px-5 md:px-6 pb-4 md:pb-5">
                  <div className="flex items-baseline justify-between gap-3 bg-warm-50/80 rounded-xl px-5 py-4">
                    <p className="text-xs text-warm-500 font-medium uppercase tracking-wide">
                      Avg Score
                    </p>
                    <p className={cn(
                      'text-h1 md:text-h1 font-light tracking-[-0.025em] tabular-nums leading-none',
                      player.avg_score && player.avg_score > 0
                        ? 'text-warm-900'
                        : 'text-warm-400'
                    )}>
                      {player.avg_score && player.avg_score > 0
                        ? player.avg_score.toFixed(1)
                        : '—'}
                    </p>
                  </div>
                </div>

                {/* Primary CTA — single action; secondary actions (Stats,
                    Message) live inside the PlayerActionsMenu kebab in the
                    card header. IA audit 2026-05-28: a 20-player roster
                    previously rendered 60 buttons. */}
                <div className="px-5 md:px-6 pb-5 md:pb-6">
                  <Link
                    href={`/golf/dashboard/players/${player.id}`}
                    className="flex w-full items-center justify-center gap-2 px-4 py-3 min-h-[48px] bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-700 active:scale-[0.98] transition-all"
                  >
                    <IconUsers size={16} />
                    View Player
                  </Link>
                </div>
              </div>
            ))}
          </Reveal>
        )}
      </ContainerGrid>
      </AnimatedItem>
    </AnimatedPage>
    </RosterPageClient>
  );
}
