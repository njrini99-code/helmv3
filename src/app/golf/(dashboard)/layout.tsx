import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { GolfDashboardShell } from './GolfDashboardShell';
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
 */
export default async function GolfDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // 1. Authenticate — server-side, uses cookies (refreshed by middleware)
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/golf/login');
  }

  // 2. Fetch role + profiles in parallel
  const [userResult, coachResult, playerResult] = await Promise.all([
    supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('golf_coaches')
      .select('id, full_name, avatar_url, organization_id, onboarding_completed')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('golf_players')
      .select('id, first_name, last_name, avatar_url, onboarding_completed')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  let userRole = userResult.data?.role;
  let coach = coachResult.data;
  let player = playerResult.data;

  // Only retry if no completed profile was found (handles post-onboarding propagation).
  // For already-onboarded users (the vast majority of page loads), this never executes.
  if (!(coach && coach.onboarding_completed) && !(player && player.onboarding_completed)) {
    // Brief wait for eventual consistency after onboarding write
    await new Promise(resolve => setTimeout(resolve, 300));

    const [retryUserResult, retryCoachResult, retryPlayerResult] = await Promise.all([
      supabase.from('users').select('role').eq('id', user.id).maybeSingle(),
      supabase.from('golf_coaches')
        .select('id, full_name, avatar_url, organization_id, onboarding_completed')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase.from('golf_players')
        .select('id, first_name, last_name, avatar_url, onboarding_completed')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    userRole = retryUserResult.data?.role ?? userRole;
    coach = retryCoachResult.data ?? coach;
    player = retryPlayerResult.data ?? player;
  }

  // 3. Resolve role
  const declaredRole = (userRole === 'coach' || userRole === 'player') ? userRole : null;
  const resolvedRole = coach && player
    ? (declaredRole || 'coach')
    : coach
      ? 'coach'
      : player
        ? 'player'
        : declaredRole;

  // 4. Build userData based on resolved role, or redirect to onboarding
  let userData: GolfUserData;

  if (resolvedRole === 'coach') {
    if (!coach || !coach.onboarding_completed) {
      redirect('/golf/coach');
    }

    // Fetch coach's team via organization_id
    let teamId: string | undefined;
    let teamName: string | undefined;
    if (coach.organization_id) {
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id, name')
        .eq('organization_id', coach.organization_id)
        .maybeSingle();
      teamId = team?.id;
      teamName = team?.name;
    }

    userData = {
      role: 'coach',
      userId: user.id,
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
      userId: user.id,
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

  // 5. Render the client shell with resolved data — no loading spinner needed
  return (
    <GolfDashboardShell userData={userData}>
      {children}
    </GolfDashboardShell>
  );
}
