'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PageLoading } from '@/components/ui/loading';
import type { GolfCoach, GolfPlayer, GolfTeam } from '@/lib/types/golf';
import type { CalendarEvent } from '@/lib/types/calendar';
import { CoachDashboard, type CoachDashboardData } from './components/CoachDashboard';
import { PlayerDashboard, type PlayerDashboardData } from './components/PlayerDashboard';

// Local types for dashboard data
interface RecentRound {
    id: string;
    player_name: string;
    course_name: string;
    total_score: number;
    total_to_par: number;
    round_date: string;
}

interface TopPlayer {
    id: string;
    name: string;
    avg_score: number;
    rounds: number;
}

// Import the proper EventType to match calendar types
type DashboardEventType = 'game' | 'practice' | 'scrimmage' | 'recruiting_visit' | 'camp' | 'tournament' | 'meeting' | 'workout' | 'class' | 'blocked_time' | 'qualifier' | 'travel' | 'other';

interface DashboardCalendarEvent {
    id: string;
    title: string;
    event_type: DashboardEventType;
    start_time: string;
    end_time: string;
    location: string | null;
    created_by_id: string;
    is_recurring: boolean;
    created_at: string;
    updated_at: string;
}

interface ScoringTrend {
    label: string;
    value: number;
}

interface RoundWithPlayer {
    id: string;
    course_name: string | null;
    total_score: number | null;
    score_to_par: number | null;
    round_date: string;
    player?: { first_name: string | null; last_name: string | null } | null;
}


interface PlayerRound {
    id: string;
    course_name: string;
    total_score: number | null;
    score_to_par: number | null;
    round_date: string;
}

// Cache client instance to avoid recreating
const supabaseClient = createClient();

export default function GolfDashboardPage() {
    const router = useRouter();
    const supabase = useMemo(() => supabaseClient, []); // Reuse client instance
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<'coach' | 'player' | null>(null);
    const [coachData, setCoachData] = useState<CoachDashboardData | null>(null);
    const [playerData, setPlayerData] = useState<PlayerDashboardData | null>(null);

    useEffect(() => {
        let mounted = true;

        async function loadDashboard() {
            try {
                const { data: { user } } = await supabase.auth.getUser();

                if (!user) {
                    if (mounted) router.push('/golf/login');
                    return;
                }

                // OPTIMIZATION: Only select needed columns
                const { data: coach } = await supabase
                    .from('golf_coaches')
                    .select('id, user_id, organization_id, full_name, avatar_url, created_at')
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (coach) {
                    if (!mounted) return;
                    setUserRole('coach');

                    // Get team via organization_id (golf_coaches doesn't have team_id directly)
                    let teamId: string | null = null;
                    if (coach.organization_id) {
                        const { data: orgTeam } = await supabase
                            .from('golf_teams')
                            .select('id')
                            .eq('organization_id', coach.organization_id)
                            .maybeSingle();
                        teamId = orgTeam?.id || null;
                    }
                    let team: GolfTeam | null = null;
                    const stats = {
                        rosterSize: 0,
                        upcomingEvents: 0,
                        activeQualifiers: 0,
                        teamScoringAverage: null as number | null,
                        previousAverage: null as number | null,
                    };
                    let recentRounds: RecentRound[] = [];
                    let topPlayers: TopPlayer[] = [];
                    let calendarEvents: DashboardCalendarEvent[] = [];
                    let teamScoringTrend: ScoringTrend[] = [];

                    if (teamId) {
                        // OPTIMIZATION: Fetch all initial data in parallel
                        const [
                            teamResult,
                            rosterCountResult,
                            eventsResult,
                            qualifiersCountResult,
                            playersResult
                        ] = await Promise.all([
                            supabase.from('golf_teams').select('id, name, season, join_code, created_at').eq('id', teamId).single(),
                            supabase.from('golf_team_members').select('id', { count: 'exact', head: true }).eq('team_id', teamId).eq('status', 'active'),
                            supabase
                                .from('golf_events')
                                .select('id, title, event_type, start_time, end_time, location, created_at, updated_at', { count: 'exact' })
                                .eq('team_id', teamId)
                                .gte('start_time', new Date().toISOString())
                                .order('start_time', { ascending: true })
                                .limit(20),
                            supabase
                                .from('golf_qualifiers')
                                .select('id', { count: 'exact', head: true })
                                .eq('team_id', teamId)
                                .in('status', ['upcoming', 'in_progress']),
                            supabase.from('golf_team_members')
                                .select('player:golf_players(id, first_name, last_name)')
                                .eq('team_id', teamId)
                                .eq('status', 'active')
                        ]);

                        team = teamResult.data as GolfTeam | null;
                        stats.rosterSize = rosterCountResult.count || 0;
                        stats.upcomingEvents = eventsResult.count || 0;
                        stats.activeQualifiers = qualifiersCountResult.count || 0;

                        calendarEvents = (eventsResult.data || []).map(event => ({
                            id: event.id,
                            title: event.title,
                            event_type: event.event_type as DashboardEventType,
                            start_time: event.start_time,
                            end_time: event.end_time || event.start_time,
                            location: event.location,
                            created_by_id: coach.user_id,
                            is_recurring: false,
                            created_at: event.created_at || new Date().toISOString(),
                            updated_at: event.updated_at || new Date().toISOString(),
                        }));

                        // Extract players from team_members join result
                        const teamMembersData = playersResult.data as Array<{ player: { id: string; first_name: string | null; last_name: string | null } | null }> | null;
                        const players = teamMembersData?.map(tm => tm.player).filter((p): p is NonNullable<typeof p> => p !== null) || [];

                        if (players && players.length > 0) {
                            const playerIds = players.map(p => p.id);

                            // OPTIMIZATION: Fetch rounds in parallel (recent + all for stats)
                            const [recentRoundsResult, allRoundsResult] = await Promise.all([
                                supabase
                                    .from('golf_rounds')
                                    .select('id, course_name, total_score, score_to_par, round_date, player:golf_players(first_name, last_name)')
                                    .in('player_id', playerIds)
                                    .eq('status', 'completed')
                                    .not('total_score', 'is', null)
                                    .order('round_date', { ascending: false })
                                    .limit(6),
                                // OPTIMIZATION: Limit stats calculation to last 100 rounds (sufficient for averages)
                                supabase
                                    .from('golf_rounds')
                                    .select('player_id, total_score, round_date')
                                    .in('player_id', playerIds)
                                    .eq('status', 'completed')
                                    .not('total_score', 'is', null)
                                    .order('round_date', { ascending: false })
                                    .limit(100) // Only last 100 rounds for stats (faster query)
                            ]);

                            if (recentRoundsResult.data) {
                                recentRounds = (recentRoundsResult.data as RoundWithPlayer[]).map((r) => ({
                                    id: r.id,
                                    player_name: `${r.player?.first_name || ''} ${r.player?.last_name || ''}`.trim() || 'Unknown',
                                    course_name: r.course_name || 'Unknown Course',
                                    total_score: r.total_score || 0,
                                    total_to_par: r.score_to_par || 0,
                                    round_date: r.round_date,
                                }));
                            }

                            const allRounds = allRoundsResult.data;

                            if (allRounds) {
                                // Calculate averages
                                const scores = allRounds.map(r => r.total_score).filter((s): s is number => s !== null);
                                if (scores.length > 0) {
                                    stats.teamScoringAverage = scores.reduce((a, b) => a + b, 0) / scores.length;
                                }

                                // Calculate previous average for trend arrow
                                // Split rounds into recent half vs older half for trend comparison
                                if (scores.length >= 10) {
                                    const midpoint = Math.floor(scores.length / 2);
                                    const olderScores = scores.slice(midpoint);
                                    stats.previousAverage = olderScores.reduce((a, b) => a + b, 0) / olderScores.length;
                                }

                                // Top Players
                                const playerAvgs: TopPlayer[] = [];
                                players.forEach(p => {
                                    const pRounds = allRounds.filter(r => r.player_id === p.id);
                                    if (pRounds.length > 0) {
                                        const pScores = pRounds.map(r => r.total_score).filter((s): s is number => s !== null);
                                        const avg = pScores.length > 0 ? pScores.reduce((a, b) => a + b, 0) / pScores.length : 0;
                                        playerAvgs.push({
                                            id: p.id,
                                            name: `${p.first_name} ${p.last_name}`,
                                            avg_score: avg,
                                            rounds: pScores.length
                                        });
                                    }
                                });
                                topPlayers = playerAvgs.sort((a, b) => a.avg_score - b.avg_score).slice(0, 5);

                                // Trend — group by YYYY-MM for chronological ordering
                                const roundsByYearMonth: Record<string, { label: string; scores: number[] }> = {};
                                allRounds.forEach(round => {
                                    if (!round.round_date || round.total_score === null) return;
                                    const d = new Date(round.round_date);
                                    const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                                    const label = d.toLocaleString('default', { month: 'short' });
                                    if (!roundsByYearMonth[sortKey]) roundsByYearMonth[sortKey] = { label, scores: [] };
                                    roundsByYearMonth[sortKey].scores.push(round.total_score);
                                });
                                teamScoringTrend = Object.entries(roundsByYearMonth)
                                    .sort(([a], [b]) => a.localeCompare(b))
                                    .map(([, { label, scores }]) => ({
                                        label,
                                        value: Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1))
                                    }));
                            }
                        }
                    }

                    if (mounted) {
                        setCoachData({
                            coach: coach as GolfCoach,
                            team,
                            stats,
                            recentRounds,
                            topPlayers,
                            calendarEvents: calendarEvents as CalendarEvent[],
                            teamScoringTrend: teamScoringTrend.length > 0 ? teamScoringTrend : undefined
                        });
                        setLoading(false);
                    }
                    return;
                }

                // OPTIMIZATION: Only select needed columns
                const { data: player } = await supabase
                    .from('golf_players')
                    .select('id, user_id, first_name, last_name, avatar_url, handicap, created_at')
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (player) {
                    if (!mounted) return;
                    setUserRole('player');

                    let team: GolfTeam | null = null;

                    // First get the player's team membership
                    const { data: teamMembership } = await supabase
                        .from('golf_team_members')
                        .select('team_id')
                        .eq('player_id', player.id)
                        .eq('status', 'active')
                        .maybeSingle();

                    const playerTeamId = teamMembership?.team_id;

                    // OPTIMIZATION: Fetch team and rounds in parallel
                    const [teamResult, roundsResult] = await Promise.all([
                        playerTeamId
                            ? supabase.from('golf_teams').select('id, name, season, join_code, created_at').eq('id', playerTeamId).single()
                            : Promise.resolve({ data: null }),
                        supabase
                            .from('golf_rounds')
                            .select('id, course_name, total_score, score_to_par, round_date')
                            .eq('player_id', player.id)
                            .eq('status', 'completed')
                            .not('total_score', 'is', null)
                            .order('round_date', { ascending: false })
                            .limit(50) // Sufficient for stats + display; prevents unbounded query
                    ]);

                    team = teamResult.data as GolfTeam | null;
                    const rounds = roundsResult.data as PlayerRound[] | null;

                    const playerRounds = rounds || [];
                    const scores = playerRounds.map((r) => r.total_score).filter((s): s is number => s !== null);

                    const stats = {
                        roundsPlayed: playerRounds.length,
                        scoringAverage: scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : null,
                        bestRound: scores.length > 0 ? Math.min(...scores) : null,
                        handicap: player.handicap,
                        recentTrend: undefined as 'up' | 'down' | 'stable' | undefined
                    };

                    if (scores.length >= 6) {
                        const recent5 = scores.slice(0, 5).reduce((a: number, b: number) => a + b, 0) / 5;
                        const prev5 = scores.slice(5, 10).reduce((a: number, b: number) => a + b, 0) / Math.min(5, scores.length - 5);
                        if (recent5 < prev5 - 0.5) stats.recentTrend = 'down';
                        else if (recent5 > prev5 + 0.5) stats.recentTrend = 'up';
                        else stats.recentTrend = 'stable';
                    }

                    if (mounted) {
                        setPlayerData({
                            player: player as GolfPlayer,
                            team,
                            stats,
                            recentRounds: playerRounds.slice(0, 5).map((r) => ({
                                id: r.id,
                                course_name: r.course_name,
                                total_score: r.total_score || 0,
                                total_to_par: r.score_to_par || 0,
                                round_date: r.round_date,
                            }))
                        });
                        setLoading(false);
                    }
                    return;
                }

                // Not valid user - redirect to signup
                if (mounted) {
                    setLoading(false);
                    router.push('/golf/signup');
                }

            } catch (error) {
                if (mounted) {
                    setError(error instanceof Error ? error.message : 'Failed to load dashboard');
                    setLoading(false);
                }
            }
        }

        loadDashboard();

        return () => {
            mounted = false;
        };
    }, [supabase, router]);

    if (loading) {
        return <PageLoading />;
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
                <div className="text-center">
                    <h2 className="text-xl font-semibold text-slate-900 mb-2">Error Loading Dashboard</h2>
                    <p className="text-slate-600 mb-4">{error}</p>
                    <button
                        onClick={() => {
                            setError(null);
                            setLoading(true);
                            window.location.reload();
                        }}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (userRole === 'coach' && coachData) {
        return <CoachDashboard data={coachData} />;
    }

    if (userRole === 'player' && playerData) {
        return <PlayerDashboard data={playerData} />;
    }

    return <PageLoading />;
}
