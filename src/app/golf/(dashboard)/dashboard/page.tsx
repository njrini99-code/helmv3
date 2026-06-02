import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import {
    getCachedCoachDashboardData,
    getCachedPlayerDashboardData,
    type DashboardDateRange,
    type CoachDashboardPayload,
    type PlayerDashboardPayload,
} from '@/app/golf/actions/dashboard-data';
import { CoachDashboard, type CoachDashboardData } from './components/CoachDashboard';
import { PlayerDashboard, type PlayerDashboardData } from './components/PlayerDashboard';
import type { GolfCoach, GolfTeam, GolfPlayer } from '@/lib/types/golf';
import type { CalendarEvent } from '@/lib/types/calendar';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { FairwayCoachDashboard } from '@/components/fairway/pages/dashboard/FairwayCoachDashboard';
import { FairwayPlayerDashboard } from '@/components/fairway/pages/dashboard/FairwayPlayerDashboard';
import { resolveCoachTeamId } from '@/lib/golf/resolve-team';

export const dynamic = 'force-dynamic';

const VALID_RANGES = new Set(['7d', '30d', '90d', 'season', 'all']);

/**
 * Thin flag fork (ADDITIVE): when the Fairway redesign is ON, render the
 * rebuilt coach dashboard inside the `.fairway-ds` scope on `bg-canvas`. When
 * OFF (default), render the existing CoachDashboard EXACTLY as today — this
 * helper returns the identical legacy element in that path so the live app is
 * byte-for-byte unchanged with the flag off.
 */
function renderCoachDashboard(props: {
    data: CoachDashboardData;
    enhancedData?: CoachDashboardPayload | null;
    dateRange: DashboardDateRange;
}) {
    if (isRedesignEnabled()) {
        return (
            <div className={fairwayScope('min-h-full')}>
                <FairwayCoachDashboard
                    data={props.data}
                    enhancedData={props.enhancedData ?? undefined}
                    dateRange={props.dateRange}
                />
            </div>
        );
    }
    return <CoachDashboard data={props.data} enhancedData={props.enhancedData} dateRange={props.dateRange} />;
}

/**
 * Thin flag fork (ADDITIVE) for the PLAYER dashboard. Flag ON → the rebuilt
 * Fairway player dashboard inside the `.fairway-ds` scope on `bg-canvas`. Flag
 * OFF (default) → the existing PlayerDashboard EXACTLY as today, so the live app
 * is byte-for-byte unchanged. Both branches receive the SAME data + payload.
 */
function renderPlayerDashboard(props: {
    data: PlayerDashboardData;
    enhancedData?: PlayerDashboardPayload | null;
}) {
    if (isRedesignEnabled()) {
        return (
            <div className={fairwayScope('min-h-full')}>
                <FairwayPlayerDashboard data={props.data} enhancedData={props.enhancedData ?? undefined} />
            </div>
        );
    }
    return <PlayerDashboard data={props.data} enhancedData={props.enhancedData} />;
}

export default async function GolfDashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ range?: string }>;
}) {
    const params = await searchParams;
    const dateRange: DashboardDateRange = VALID_RANGES.has(params.range ?? '') ? (params.range as DashboardDateRange) : 'all';

    // React.cache() dedupes getUser() + profile queries across render tree
    // Eliminates 4-6 redundant Supabase round-trips vs ad-hoc getUser()
    const session = await getGolfSessionProfile();

    if (!session) {
        redirect('/golf/login');
    }

    const { userId, coach, player } = session;

    // Supabase client only needed for team lookups (not auth)
    const supabase = await createClient();

    // ── Coach dashboard ──
    if (coach) {
        // Get team via organization (deterministic: handles orgs with >1 team)
        let teamId: string | undefined;
        if (coach.organization_id) {
            try {
                teamId = (await resolveCoachTeamId(supabase, coach.organization_id, coach.id)) ?? undefined;
            } catch {
                // Network failure — fall through to empty state
            }
        }

        if (teamId) {
            let payload;
            try {
                payload = await getCachedCoachDashboardData(coach.id, userId, teamId, dateRange);
            } catch {
                // Network/DB failure — render empty state so the page doesn't crash
                const emptyData: CoachDashboardData = {
                    coach: { id: coach.id, user_id: userId, organization_id: coach.organization_id || null, full_name: coach.full_name, avatar_url: coach.avatar_url || null, created_at: '' } as GolfCoach,
                    team: { id: teamId, name: '', season: null, join_code: null, created_at: '' } as unknown as GolfTeam,
                    stats: { rosterSize: 0, upcomingEvents: 0, activeQualifiers: 0, teamScoringAverage: null, previousAverage: null },
                    recentRounds: [],
                    topPlayers: [],
                    calendarEvents: [],
                    teamScoringTrend: undefined,
                };
                return renderCoachDashboard({ data: emptyData, dateRange });
            }

            const data: CoachDashboardData = {
                coach: {
                    id: coach.id,
                    user_id: userId,
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

            return renderCoachDashboard({ data, enhancedData: payload, dateRange });
        }

        // Coach without team — empty state
        const emptyData: CoachDashboardData = {
            coach: {
                id: coach.id,
                user_id: userId,
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

        return renderCoachDashboard({ data: emptyData, dateRange });
    }

    // ── Player dashboard ──
    if (player) {
        // Get team via membership
        let teamId: string | null = null;
        try {
            const { data: teamMember } = await supabase
                .from('golf_team_members')
                .select('team_id')
                .eq('player_id', player.id)
                .eq('status', 'active')
                .maybeSingle();
            teamId = teamMember?.team_id ?? null;
        } catch {
            // Network failure — proceed with null teamId
        }

        let payload;
        try {
            payload = await getCachedPlayerDashboardData(player.id, userId, teamId);
        } catch {
            // Network/DB failure — render empty state
            const emptyData: PlayerDashboardData = {
                player: { id: player.id, user_id: userId, first_name: player.first_name, last_name: player.last_name, avatar_url: player.avatar_url || null, handicap: null, created_at: '' } as GolfPlayer,
                team: teamId ? ({ id: teamId, name: '', season: null, join_code: null, created_at: '' } as unknown as GolfTeam) : null,
                stats: { roundsPlayed: 0, scoringAverage: null, bestRound: null, handicap: null },
                recentRounds: [],
            };
            return renderPlayerDashboard({ data: emptyData });
        }
        const nameParts = `${player.first_name} ${player.last_name}`.split(' ');

        const data: PlayerDashboardData = {
            player: {
                id: player.id,
                user_id: userId,
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

        return renderPlayerDashboard({ data, enhancedData: payload });
    }

    // No role found — redirect to onboarding
    redirect('/golf/signup');
}
