import { redirect } from 'next/navigation';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getGolfDashboardRole } from '@/lib/auth/get-golf-dashboard-role';
import { resolveCoachActiveTeamIdForRequest } from '@/lib/golf/dashboard-request-cache';
import { loadCoachHome } from '@/clubhouse/data/home';
import { loadLiveRounds, loadPlayerLive } from '@/clubhouse/data/live-rounds';
import { CoachHome, CoachHomeNoTeam } from '@/clubhouse/screens/home/CoachHome';
import { loadPlayerHome } from '@/clubhouse/data/player-home';
import { PlayerHome, PlayerHomeNoTeam } from '@/clubhouse/screens/home/PlayerHome';
import { resolveClubhouseTeam } from '@/clubhouse/routes/team';
import { marksHint } from '@/clubhouse/lib/phone-hint';
import { parseSpan } from '@/clubhouse/data/span';

export const dynamic = 'force-dynamic';

export default async function GolfDashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ range?: string }>;
}) {
    const params = await searchParams;
    // Home's switch (This season, All time); its default is the season.
    const span = parseSpan(params.range);

    // React.cache() dedupes getUser() + profile queries across the render tree.
    const session = await getGolfSessionProfile();
    if (!session) redirect('/golf/login');

    const { userId, coach, player } = session;

    // Home follows the dashboard layout's role (getGolfDashboardRole): an unfinished coach profile beside an onboarded
    // player one is a player here.
    const role = await getGolfDashboardRole();

    // ── Coach Home ──
    if (coach && role !== 'player') {
        // Request-scoped: the dashboard layout already resolved this exact team for this request
        // (dashboard-request-cache.ts). A real outage throws to the route error.tsx (P002/P426); a coach with no team
        // resolves to undefined without throwing.
        let teamId: string | undefined;
        if (coach.organization_id) {
            teamId = (await resolveCoachActiveTeamIdForRequest(coach.organization_id, coach.id)) ?? undefined;
        }
        if (!teamId) return <CoachHomeNoTeam />;
        // Who is on the course rides beside Home's own reads and never fails them (loadLiveRounds catches its own).
        // The marks hint feeds Home's loader only: the live read starts beside it rather than after it (F-0032).
        const [home, live] = await Promise.all([
            marksHint().then((marks) => loadCoachHome({ teamId, coachName: coach.full_name || 'Coach', userId, coachId: coach.id, marks, span })),
            loadLiveRounds({ teamId, viewer: { role: 'coach', playerId: null } }),
        ]);
        return <CoachHome data={home} live={live} />;
    }

    // ── Player Home ──
    if (player) {
        const team = await resolveClubhouseTeam(session);
        if (!team || team.role !== 'player') return <PlayerHomeNoTeam />;
        const [home, live] = await Promise.all([
            marksHint().then((marks) => loadPlayerHome({ teamId: team.teamId, playerId: team.playerId, firstName: player.first_name?.trim() || 'there', marks, span })),
            loadPlayerLive({ teamId: team.teamId, playerId: team.playerId }),
        ]);
        return <PlayerHome data={home} live={live} playerId={team.playerId} />;
    }

    // No role found — redirect to onboarding
    redirect('/golf/signup');
}
