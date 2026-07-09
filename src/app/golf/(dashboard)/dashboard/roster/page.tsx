import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, Users } from 'lucide-react';
import { fairwayScope } from '@/lib/redesign/flag';
import { Button, EmptyState, InlineNotice } from '@/components/fairway';
import { FairwayCoachRoster } from '@/components/fairway/pages/roster/FairwayCoachRoster';
import { FairwayPlayerRoster } from '@/components/fairway/pages/roster/FairwayPlayerRoster';
import { getTeamJoinRequests } from '@/app/golf/actions/teams';
import { loadCoachIntents } from '@/lib/coachhelm/v3/intent/loader';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
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
        <div className={fairwayScope('min-h-full bg-canvas')}>
          <div className="mx-auto flex min-h-full w-full max-w-md items-center justify-center px-4 py-16">
            <EmptyState
              icon={<AlertCircle strokeWidth={1.75} />}
              title="Profile Not Found"
              description="Unable to find your profile. Please complete onboarding or contact support."
              action={
                <Button asChild variant="primary">
                  <Link href="/golf/coach">Complete Onboarding</Link>
                </Button>
              }
            />
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
        <div className={fairwayScope('min-h-full bg-canvas')}>
          <div className="mx-auto flex min-h-full w-full max-w-md items-center justify-center px-4 py-16">
            <EmptyState
              icon={<Users strokeWidth={1.75} />}
              title="No Team Found"
              description="You haven't joined a team yet. Ask your coach for a join code."
            />
          </div>
        </div>
      );
    }

    // Player roster is its own page — renders the Fairway player roster
    // (FairwayPlayerRoster). (The redesign path used to redirect into the Team
    // Hub Teammates tab, which made the "Roster" nav item a dead bounce — fixed
    // 2026-06-18.)

    // Fetch team info and teammates for player view
    const { data: playerTeam } = await supabase
      .from('golf_teams')
      .select('name')
      .eq('id', teamMember.team_id)
      .maybeSingle();

    // F083: a player's teammate list is active members only — pending invites
    // and removed players must not show up as teammates.
    const { data: tmData } = await supabase
      .from('golf_team_members')
      .select(`
        player:golf_players!inner (
          id, first_name, last_name, avatar_url, handicap, graduation_year,
          user:users(last_seen)
        )
      `)
      .eq('team_id', teamMember.team_id)
      .eq('status', 'active')
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

    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <FairwayPlayerRoster players={teammates} teamName={playerTeam?.name || 'Team'} />
      </div>
    );
  }

  // Get team_id from organization (deterministic: handles orgs with >1 team)
  const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);

  if (!teamId) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <div className="mx-auto flex min-h-full w-full max-w-md items-center justify-center px-4 py-16">
          <EmptyState
            icon={<Users strokeWidth={1.75} />}
            title="No Team Assigned"
            description="You haven't created or joined a team yet. Create a team to start building your roster."
            action={
              <Button asChild variant="primary">
                <Link href="/golf/dashboard/team">Go to Team Settings</Link>
              </Button>
            }
          />
        </div>
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
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <div className="mx-auto w-full max-w-2xl px-5 py-10 md:px-8">
          <InlineNotice tone="danger" title="Team Not Found">
            <p>Unable to load team information. The team may have been deleted.</p>
            <p className="mt-1 text-body-sm text-text-tertiary">Team ID: {teamId}</p>
            <p className="text-body-sm text-text-tertiary">Error: {teamError.message}</p>
          </InlineNotice>
        </div>
      </div>
    );
  }

  // Get players via team_members join - players are connected to teams through golf_team_members
  // Also fetch user's last_seen for online status indicator
  // F083: the coach roster shows active + inactive members (the status badge is
  // a coach affordance), but NOT 'pending' (player hasn't accepted the invite
  // yet — those live in PendingJoinRequests) or 'removed' (off the roster). The
  // unfiltered query was surfacing both as full roster cards.
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
    .eq('team_id', teamId)
    .in('status', ['active', 'inactive']);

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
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <div className="mx-auto w-full max-w-2xl px-5 py-10 md:px-8">
          <InlineNotice tone="danger" title="Error Loading Roster">
            <p>Unable to load team roster. Please try refreshing the page.</p>
            <p className="mt-1 text-body-sm text-text-tertiary">Error: {playersError.message}</p>
          </InlineNotice>
        </div>
      </div>
    );
  }

  // Get rounds to calculate stats for each player
  // PERFORMANCE OPTIMIZATION: Fetch all rounds in ONE query instead of N queries
  const playersWithStats: PlayerWithStats[] = players && players.length > 0
    ? await (async () => {
        // Fetch ALL rounds for ALL players. Paginated: PostgREST caps each
        // response at 1000 rows, and a full roster's accumulated round history
        // exceeds that — the old unpaginated `.in(...)` silently truncated at
        // 1000, under-counting rounds_count and skewing avg_score on every
        // roster card. `.order('id')` gives stable page boundaries (P444).
        const playerIds = players.map(p => p.id);
        const { data: allRounds } = await fetchAllRowsResult((from, to) =>
          supabase
            .from('golf_rounds')
            .select('player_id, total_score, holes_played')
            .in('player_id', playerIds)
            .not('total_score', 'is', null)
            .order('id', { ascending: true })
            .range(from, to),
        );

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

  // Coach intent (CoachHelm v3): load every intent row this coach has
  // authored for their roster, keyed by player_id. The table is honestly
  // EMPTY until a coach sets intent — players with no row get `null` below,
  // which the IntentPill renders as its neutral "No intent" cold-start chip.
  // This is the coach view only; the player roster path returned earlier.
  const coachIntents = await loadCoachIntents(coach.id);

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
