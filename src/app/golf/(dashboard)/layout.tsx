import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { GolfDashboardShell } from './GolfDashboardShell';
import { FairwayDashboardShell } from './FairwayDashboardShell';
import { resolveCoachTeamId } from '@/lib/golf/resolve-team';
import { isRedesignEnabled } from '@/lib/redesign/flag';
import type { GolfUserData } from '@/contexts/golf-user-context';

/**
 * Golf Dashboard Layout — SERVER COMPONENT
 *
 * Resolves auth, user role, and team data on the server during SSR.
 * This eliminates the client-side loading spinner and multi-stage
 * data-fetching waterfall that previously added 1.5–3s of latency.
 *
 * All interactive UI (sidebar, providers, nav) lives in GolfDashboardShell
 * which is a client component receiving the resolved userData as props.
 *
 * Auth strategy:
 * - Uses React.cache()-backed getGolfSessionProfile() so child pages that also
 *   call it get a full cache hit (0 extra DB queries for auth per page load).
 * - The onboarding retry path (rare post-signup edge case) falls back to direct
 *   Supabase queries so fresh data is fetched correctly.
 */
export default async function GolfDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Fast-path auth via React.cache() — deduplicates with all child pages
  //    that also call getGolfSessionProfile() in this render tree.
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  let { coach, player } = session;
  let declaredRole: 'coach' | 'player' | null = null;

  if (coach?.onboarding_completed || player?.onboarding_completed) {
    // Fast path (>99% of requests) — onboarded user, derive role from profiles.
    // Saves 1 users.role query; role is unambiguous from profile presence + onboarding state.
    declaredRole = coach?.onboarding_completed ? 'coach' : 'player';
  } else {
    // Slow path — post-onboarding eventual consistency edge case.
    // Re-fetch directly (bypassing React.cache) to get fresh data after the
    // brief propagation delay, then also query users.role for disambiguation.
    const supabase = await createClient();
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', session.userId)
      .maybeSingle();

    // Admin users don't have golf profiles — send them to the admin dashboard
    if (userData?.role === 'admin') {
      redirect('/golf/admin');
    }

    declaredRole = (userData?.role === 'coach' || userData?.role === 'player')
      ? userData.role
      : null;

    // Brief wait for eventual consistency after onboarding write
    await new Promise(resolve => setTimeout(resolve, 300));

    const [retryCoachResult, retryPlayerResult] = await Promise.all([
      supabase
        .from('golf_coaches')
        .select('id, user_id, full_name, avatar_url, organization_id, onboarding_completed')
        .eq('user_id', session.userId)
        .maybeSingle(),
      supabase
        .from('golf_players')
        .select('id, user_id, first_name, last_name, avatar_url, handicap, onboarding_completed')
        .eq('user_id', session.userId)
        .maybeSingle(),
    ]);

    if (retryCoachResult.data) coach = { ...coach, ...retryCoachResult.data } as typeof coach;
    if (retryPlayerResult.data) player = { ...player, ...retryPlayerResult.data } as typeof player;
  }

  // 2. Resolve final role
  const resolvedRole = coach && player
    ? (declaredRole || 'coach')
    : coach
      ? 'coach'
      : player
        ? 'player'
        : declaredRole;

  // 3. Build userData based on resolved role, or redirect to onboarding.
  //    Team data queries are unique to the layout (not in getGolfSessionProfile),
  //    so they still run here.
  let userData: GolfUserData;

  if (resolvedRole === 'coach') {
    if (!coach || !coach.onboarding_completed) {
      redirect('/golf/coach');
    }

    // Fetch coach's team via organization_id (deterministic: handles orgs with
    // >1 team), then load the chosen team's display name by id.
    let teamId: string | undefined;
    let teamName: string | undefined;
    if (coach.organization_id) {
      const supabase = await createClient();
      const resolvedTeamId = await resolveCoachTeamId(supabase, coach.organization_id, coach.id);
      if (resolvedTeamId) {
        const { data: team } = await supabase
          .from('golf_teams')
          .select('id, name')
          .eq('id', resolvedTeamId)
          .maybeSingle();
        teamId = team?.id;
        teamName = team?.name;
      }
    }

    userData = {
      role: 'coach',
      userId: session.userId,
      name: coach.full_name || 'Coach',
      teamName,
      avatarUrl: coach.avatar_url || undefined,
      coachId: coach.id,
      teamId,
      organizationId: coach.organization_id || undefined,
    };
  } else if (resolvedRole === 'player') {
    if (!player || !player.onboarding_completed) {
      redirect('/golf/player');
    }

    // Fetch player's team via team membership
    let teamId: string | undefined;
    let teamName: string | undefined;
    const supabase = await createClient();
    const { data: teamMember } = await supabase
      .from('golf_team_members')
      .select('team_id, golf_teams(id, name)')
      .eq('player_id', player.id)
      .eq('status', 'active')
      .maybeSingle();

    if (teamMember) {
      const teamData = teamMember.golf_teams as { id: string; name: string } | null;
      teamId = teamData?.id || teamMember.team_id;
      teamName = teamData?.name;
    }

    userData = {
      role: 'player',
      userId: session.userId,
      name: `${player.first_name} ${player.last_name}`,
      teamName,
      avatarUrl: player.avatar_url || undefined,
      playerId: player.id,
      teamId,
    };
  } else {
    // Unknown state — redirect to onboarding
    if (declaredRole === 'coach') {
      redirect('/golf/coach');
    } else if (declaredRole === 'player') {
      redirect('/golf/player');
    } else {
      redirect('/golf/signup');
    }
    // TypeScript: redirect() throws, but TS doesn't know that — this is unreachable
    return null;
  }

  // 4. Render the client shell with resolved data — no loading spinner needed.
  //    Flag ON → the premium Fairway shell (AppShell rail + glass top bar +
  //    hamburger drawer). Flag OFF → the legacy shell, byte-for-byte unchanged.
  const DashboardShell = isRedesignEnabled() ? FairwayDashboardShell : GolfDashboardShell;
  return (
    <DashboardShell userData={userData}>
      {children}
    </DashboardShell>
  );
}
