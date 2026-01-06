'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PageLoading } from '@/components/ui/loading';
import type { GolfCoach, GolfPlayer, GolfTeam } from '@/lib/types/golf';
import { CoachDashboard, type CoachDashboardData } from './components/CoachDashboard';
import { PlayerDashboard, type PlayerDashboardData } from './components/PlayerDashboard';

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
                    .select('id, user_id, team_id, full_name, avatar_url, created_at')
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (coach) {
                    if (!mounted) return;
                    setUserRole('coach');

                    const teamId = coach.team_id;
                    let team: GolfTeam | null = null;
                    let stats = {
                        rosterSize: 0,
                        upcomingEvents: 0,
                        activeQualifiers: 0,
                        teamScoringAverage: null as number | null,
                    };
                    let recentRounds: any[] = [];
                    let topPlayers: any[] = [];
                    let calendarEvents: any[] = [];
                    let teamScoringTrend: any[] = [];

                    if (teamId) {
                        // OPTIMIZATION: Fetch all initial data in parallel
                        const [
                            teamResult,
                            rosterCountResult,
                            eventsResult,
                            qualifiersCountResult,
                            playersResult
                        ] = await Promise.all([
                            supabase.from('golf_teams').select('id, name, season, invite_code, created_at').eq('id', teamId).single(),
                            supabase.from('golf_players').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
                            supabase
                                .from('golf_events')
                                .select('id, title, event_type, start_date, end_date, location, created_at, updated_at', { count: 'exact' })
                                .eq('team_id', teamId)
                                .gte('start_date', new Date().toISOString().split('T')[0])
                                .order('start_date', { ascending: true })
                                .limit(20),
                            supabase
                                .from('golf_qualifiers')
                                .select('id', { count: 'exact', head: true })
                                .eq('team_id', teamId)
                                .in('status', ['upcoming', 'in_progress']),
                            supabase.from('golf_players').select('id, first_name, last_name').eq('team_id', teamId)
                        ]);

                        team = teamResult.data as GolfTeam | null;
                        stats.rosterSize = rosterCountResult.count || 0;
                        stats.upcomingEvents = eventsResult.count || 0;
                        stats.activeQualifiers = qualifiersCountResult.count || 0;

                        calendarEvents = (eventsResult.data || []).map(event => ({
                            id: event.id,
                            title: event.title,
                            event_type: event.event_type,
                            start_time: event.start_date,
                            end_time: event.end_date || event.start_date,
                            location: event.location,
                            created_by_id: coach.user_id,
                            is_recurring: false,
                            created_at: event.created_at || new Date().toISOString(),
                            updated_at: event.updated_at || new Date().toISOString(),
                        }));

                        const players = playersResult.data;

                        if (players && players.length > 0) {
                            const playerIds = players.map(p => p.id);

                            // OPTIMIZATION: Fetch rounds in parallel (recent + all for stats)
                            const [recentRoundsResult, allRoundsResult] = await Promise.all([
                                supabase
                                    .from('golf_rounds')
                                    .select('id, course_name, total_score, total_to_par, round_date, player:golf_players(first_name, last_name)')
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
                                recentRounds = recentRoundsResult.data.map((r: any) => ({
                                    id: r.id,
                                    player_name: `${r.player?.first_name || ''} ${r.player?.last_name || ''}`.trim() || 'Unknown',
                                    course_name: r.course_name,
                                    total_score: r.total_score || 0,
                                    total_to_par: r.total_to_par || 0,
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

                                // Top Players
                                const playerAvgs: any[] = [];
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

                                // Trend
                                const roundsByMonth: Record<string, number[]> = {};
                                allRounds.forEach(round => {
                                    if (!round.round_date || round.total_score === null) return;
                                    const monthKey = new Date(round.round_date).toLocaleString('default', { month: 'short' });
                                    if (!roundsByMonth[monthKey]) roundsByMonth[monthKey] = [];
                                    roundsByMonth[monthKey].push(round.total_score);
                                });
                                teamScoringTrend = Object.entries(roundsByMonth).map(([month, scores]) => ({
                                    label: month,
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
                            calendarEvents,
                            teamScoringTrend: teamScoringTrend.length > 0 ? teamScoringTrend : undefined
                        });
                        setLoading(false);
                    }
                    return;
                }

                // OPTIMIZATION: Only select needed columns
                const { data: player } = await supabase
                    .from('golf_players')
                    .select('id, user_id, team_id, first_name, last_name, avatar_url, handicap, created_at')
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (player) {
                    if (!mounted) return;
                    setUserRole('player');

                    let team: GolfTeam | null = null;

                    // OPTIMIZATION: Fetch team and rounds in parallel
                    const [teamResult, roundsResult] = await Promise.all([
                        player.team_id
                            ? supabase.from('golf_teams').select('id, name, season, invite_code, created_at').eq('id', player.team_id).single()
                            : Promise.resolve({ data: null }),
                        supabase
                            .from('golf_rounds')
                            .select('id, course_name, total_score, total_to_par, round_date')
                            .eq('player_id', player.id)
                            .eq('status', 'completed')
                            .not('total_score', 'is', null)
                            .order('round_date', { ascending: false })
                    ]);

                    team = teamResult.data as GolfTeam | null;
                    const rounds = roundsResult.data;

                    const playerRounds = rounds || [];
                    const scores = playerRounds.map((r: any) => r.total_score);

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
                            recentRounds: playerRounds.slice(0, 5).map((r: any) => ({
                                id: r.id,
                                course_name: r.course_name,
                                total_score: r.total_score || 0,
                                total_to_par: r.total_to_par || 0,
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
                console.error('Dashboard loading error:', error);
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
