import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { FairwayDashboardShell } from './FairwayDashboardShell';
import { resolveCoachActiveTeamId, getCoachTeamSwitchContext } from '@/lib/golf/resolve-team';
import { getActiveTeamCookie } from '@/app/golf/actions/team-switcher';
import { resolveAdminPostLoginPath } from '@/lib/golf/admin-redirect';
import { ThemeApplier } from '@/components/golf/theme/ThemeApplier';
import type { GolfUserData } from '@/contexts/golf-user-context';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

/**
 * Golf Dashboard Layout — SERVER COMPONENT
 *
 * Resolves auth, user role, and team data on the server during SSR.
 * This eliminates the client-side loading spinner and multi-stage
 * data-fetching waterfall that previously added 1.5–3s of latency.
 *
 * All interactive UI (sidebar, providers, nav) lives in FairwayDashboardShell
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
      redirect(resolveAdminPostLoginPath(true));
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

    // Fetch coach's active team with cookie-awareness:
    //   1. Read the golf_active_team cookie (if set).
    //   2. Validate it via golf_team_coach_staff before trusting it.
    //   3. Fall back to the coach's staffed team, then the org resolver.
    // Also fetch the switch context (teams + head-coach gate) so the
    // TeamSwitcher renders only for multi-team head coaches (program heads).
    let teamId: string | undefined;
    let teamName: string | undefined;
    const supabase = await createClient();

    // Parallel fetch: active team id + switch context (teams + canSwitch gate).
    const cookieTeamId = await getActiveTeamCookie();
    const [resolvedTeamId, switchContext] = await Promise.all([
      resolveCoachActiveTeamId(supabase, coach.organization_id, coach.id, cookieTeamId),
      getCoachTeamSwitchContext(supabase, coach.id, coach.organization_id),
    ]);
    const coachTeams = switchContext.teams;

    if (resolvedTeamId) {
      // Find name from coachTeams list first (already fetched); avoids a third query.
      const teamFromList = coachTeams.find((t) => t.id === resolvedTeamId);
      if (teamFromList) {
        teamId = teamFromList.id;
        teamName = teamFromList.name;
      } else {
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
      coachTeams,
      canSwitchTeams: switchContext.canSwitch,
    };
  } else if (resolvedRole === 'player') {
    if (!player || !player.onboarding_completed) {
      redirect('/golf/player');
    }

    // Fetch player's team via team membership
    let teamId: string | undefined;
    let teamName: string | undefined;
    const supabase = await createClient();
    // The `error` is READ — logged, not thrown.
    //
    // Same swallow the calendar page had: only `data` was destructured, so a
    // failed read was indistinguishable from "this player is on no team", and
    // the shell rendered the not-on-a-team affordance to a rostered player with
    // nothing recorded anywhere. Deliberately NOT a throw: this layout wraps
    // EVERY dashboard route, so throwing here would turn a transient blip into
    // a whole-product outage. Logging makes the failure visible without that
    // blast radius; the calendar page, which can fail alone, does throw.
    const { data: teamMember, error: teamMemberError } = await supabase
      .from('golf_team_members')
      .select('team_id, golf_teams(id, name)')
      .eq('player_id', player.id)
      .eq('status', 'active')
      .maybeSingle();

    if (teamMemberError) {
      void logServerError(
        `[golf dashboard layout] player team read failed: ${describeError(teamMemberError)}`,
        { action: 'golf.dashboardLayout.resolvePlayerTeam', featureArea: 'teams' },
      );
    }

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
  //    Fairway is now the only dashboard shell (AppShell rail + glass top bar +
  //    hamburger drawer) — the legacy GolfDashboardShell fork was removed.
  return (
    <>
      <FairwayDashboardShell userData={userData}>
        {/* Keeps the root-head theme boot hydrated + OS-followed at runtime,
            including when the dashboard is entered by soft navigation. */}
        <ThemeApplier />
        {children}
      </FairwayDashboardShell>
    </>
  );
}
