import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
    getCachedCoachDashboardData,
    getCachedPlayerDashboardData,
} from '@/app/golf/actions/dashboard-data';
import { CoachDashboard, type CoachDashboardData } from './components/CoachDashboard';
import { PlayerDashboard, type PlayerDashboardData } from './components/PlayerDashboard';
import type { GolfCoach, GolfTeam, GolfPlayer } from '@/lib/types/golf';
import type { CalendarEvent } from '@/lib/types/calendar';

export const dynamic = 'force-dynamic';

export default async function GolfDashboardPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/golf/login');
    }

    // Parallel role check — same queries as layout, very fast
    const [coachResult, playerResult] = await Promise.all([
        supabase
            .from('golf_coaches')
            .select('id, full_name, avatar_url, organization_id')
            .eq('user_id', user.id)
            .maybeSingle(),
        supabase
            .from('golf_players')
            .select('id, first_name, last_name, avatar_url')
            .eq('user_id', user.id)
            .maybeSingle(),
    ]);

    const coach = coachResult.data;
    const player = playerResult.data;

    // ── Coach dashboard ──
    if (coach) {
        // Get team via organization
        let teamId: string | undefined;
        if (coach.organization_id) {
            const { data: team } = await supabase
                .from('golf_teams')
                .select('id')
                .eq('organization_id', coach.organization_id)
                .maybeSingle();
            teamId = team?.id;
        }

        if (teamId) {
            const payload = await getCachedCoachDashboardData(coach.id, user.id, teamId);

            const data: CoachDashboardData = {
                coach: {
                    id: coach.id,
                    user_id: user.id,
                    organization_id: coach.organization_id || null,
                    full_name: coach.full_name,
                    avatar_url: coach.avatar_url || null,
                    created_at: '',
                } as GolfCoach,
                team: payload.teamName
                    ? ({ id: teamId, name: payload.teamName, season: null, join_code: payload.joinCode, created_at: '' } as GolfTeam)
                    : null,
                stats: payload.stats,
                recentRounds: payload.recentRounds,
                topPlayers: payload.topPlayers,
                calendarEvents: payload.calendarEvents as CalendarEvent[],
                teamScoringTrend: payload.teamScoringTrend.length > 0 ? payload.teamScoringTrend : undefined,
            };

            return <CoachDashboard data={data} enhancedData={payload} />;
        }

        // Coach without team — empty state
        const emptyData: CoachDashboardData = {
            coach: {
                id: coach.id,
                user_id: user.id,
                organization_id: coach.organization_id || null,
                full_name: coach.full_name,
                avatar_url: coach.avatar_url || null,
                created_at: '',
            } as GolfCoach,
            team: null,
            stats: { rosterSize: 0, upcomingEvents: 0, activeQualifiers: 0, teamScoringAverage: null, previousAverage: null },
            recentRounds: [],
            topPlayers: [],
            calendarEvents: [],
            teamScoringTrend: undefined,
        };

        return <CoachDashboard data={emptyData} />;
    }

    // ── Player dashboard ──
    if (player) {
        // Get team via membership
        let teamId: string | null = null;
        const { data: teamMember } = await supabase
            .from('golf_team_members')
            .select('team_id')
            .eq('player_id', player.id)
            .eq('status', 'active')
            .maybeSingle();
        teamId = teamMember?.team_id ?? null;

        const payload = await getCachedPlayerDashboardData(player.id, user.id, teamId);
        const nameParts = `${player.first_name} ${player.last_name}`.split(' ');

        const data: PlayerDashboardData = {
            player: {
                id: player.id,
                user_id: user.id,
                first_name: nameParts[0] || '',
                last_name: nameParts.slice(1).join(' ') || '',
                avatar_url: player.avatar_url || null,
                handicap: payload.stats.handicap,
                created_at: '',
            } as GolfPlayer,
            team: payload.teamName
                ? ({ id: teamId || '', name: payload.teamName, season: null, join_code: null, created_at: '' } as unknown as GolfTeam)
                : null,
            stats: payload.stats,
            recentRounds: payload.recentRounds,
        };

        return <PlayerDashboard data={data} enhancedData={payload} />;
    }

    // No role found — redirect to onboarding
    redirect('/golf/signup');
}
