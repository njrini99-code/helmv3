'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useGolfUser } from '@/contexts/golf-user-context';
import type { GolfCoach, GolfPlayer, GolfTeam } from '@/lib/types/golf';
import type { CalendarEvent } from '@/lib/types/calendar';
import { CoachDashboard, type CoachDashboardData } from './components/CoachDashboard';
import { PlayerDashboard, type PlayerDashboardData } from './components/PlayerDashboard';

// Local types for dashboard data
interface RecentRound {
    id: string;
    player_id: string;
    player_name: string;
    player_avatar_url: string | null;
    course_name: string;
    total_score: number;
    total_to_par: number;
    round_date: string;
    round_type: string | null;
    total_putts: number | null;
    total_fairways_hit: number | null;
    total_fairways: number | null;
    total_gir: number | null;
    total_gir_possible: number | null;
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
    player_id: string;
    course_name: string | null;
    total_score: number | null;
    score_to_par: number | null;
    round_date: string;
    round_type: string | null;
    total_putts: number | null;
    total_fairways_hit: number | null;
    total_fairways: number | null;
    total_gir: number | null;
    total_gir_possible: number | null;
    player?: { first_name: string | null; last_name: string | null; avatar_url: string | null } | null;
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
    const golfUser = useGolfUser();
    const supabase = useMemo(() => supabaseClient, []); // Reuse client instance
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [coachData, setCoachData] = useState<CoachDashboardData | null>(null);
    const [playerData, setPlayerData] = useState<PlayerDashboardData | null>(null);

    // PERF: Destructure primitive values for stable useEffect dependencies
    // instead of depending on the entire golfUser object reference
    const { role, userId, coachId, playerId, teamId, organizationId, name: userName, avatarUrl: userAvatar } = golfUser;

    useEffect(() => {
        let mounted = true;

        async function loadDashboard() {
            try {

                if (role === 'coach' && coachId) {
                    if (!mounted) return;

                    // Use destructured primitives from above
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
                            created_by_id: userId,
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
                                    .select('id, player_id, course_name, total_score, score_to_par, round_date, round_type, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible, player:golf_players(first_name, last_name, avatar_url)')
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
                                    player_id: r.player_id,
                                    player_name: `${r.player?.first_name || ''} ${r.player?.last_name || ''}`.trim() || 'Unknown',
                                    player_avatar_url: r.player?.avatar_url || null,
                                    course_name: r.course_name || 'Unknown Course',
                                    total_score: r.total_score || 0,
                                    total_to_par: r.score_to_par || 0,
                                    round_date: r.round_date,
                                    round_type: r.round_type || null,
                                    total_putts: r.total_putts,
                                    total_fairways_hit: r.total_fairways_hit,
                                    total_fairways: r.total_fairways,
                                    total_gir: r.total_gir,
                                    total_gir_possible: r.total_gir_possible,
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
                            coach: { id: coachId, user_id: userId, organization_id: organizationId || null, full_name: userName, avatar_url: userAvatar || null, created_at: '' } as GolfCoach,
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

                if (role === 'player' && playerId) {
                    if (!mounted) return;

                    let team: GolfTeam | null = null;

                    // OPTIMIZATION: Fetch team and rounds in parallel using teamId from context
                    const [teamResult, roundsResult, playerDetailResult] = await Promise.all([
                        teamId
                            ? supabase.from('golf_teams').select('id, name, season, join_code, created_at').eq('id', teamId).single()
                            : Promise.resolve({ data: null }),
                        supabase
                            .from('golf_rounds')
                            .select('id, course_name, total_score, score_to_par, round_date')
                            .eq('player_id', playerId)
                            .eq('status', 'completed')
                            .not('total_score', 'is', null)
                            .order('round_date', { ascending: false })
                            .limit(50), // Sufficient for stats + display; prevents unbounded query
                        // Fetch handicap (the only field not in layout context)
                        supabase
                            .from('golf_players')
                            .select('handicap')
                            .eq('id', playerId)
                            .single()
                    ]);

                    team = teamResult.data as GolfTeam | null;
                    const rounds = roundsResult.data as PlayerRound[] | null;
                    const playerHandicap = playerDetailResult.data?.handicap ?? null;

                    const playerRounds = rounds || [];
                    const scores = playerRounds.map((r) => r.total_score).filter((s): s is number => s !== null);

                    const stats = {
                        roundsPlayed: playerRounds.length,
                        scoringAverage: scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : null,
                        bestRound: scores.length > 0 ? Math.min(...scores) : null,
                        handicap: playerHandicap,
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
                        const nameParts = userName.split(' ');
                        setPlayerData({
                            player: { id: playerId, user_id: userId, first_name: nameParts[0] || '', last_name: nameParts.slice(1).join(' ') || '', avatar_url: userAvatar || null, handicap: playerHandicap, created_at: '' } as GolfPlayer,
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

            } catch (err) {
                if (mounted) {
                    setError(err instanceof Error ? err.message : 'Failed to load dashboard');
                    setLoading(false);
                }
            }
        }

        loadDashboard();

        return () => {
            mounted = false;
        };
        // PERF: Depend on stable primitive values, not the golfUser object reference
    }, [supabase, role, userId, coachId, playerId, teamId, organizationId, userName, userAvatar]);

    if (loading) {
        return (
            <div className="min-h-full bg-transparent">
                <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
                    {/* Header skeleton */}
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="h-7 w-48 bg-slate-200/60 rounded-lg animate-pulse" />
                            <div className="h-4 w-32 bg-slate-200/40 rounded-md animate-pulse mt-2" />
                        </div>
                        <div className="h-9 w-24 bg-slate-200/50 rounded-lg animate-pulse" />
                    </div>
                    {/* Stats grid skeleton */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/20 p-4 md:p-6">
                                <div className="h-3 w-20 bg-slate-200/50 rounded animate-pulse mb-3" />
                                <div className="h-8 w-16 bg-slate-200/60 rounded-lg animate-pulse" />
                            </div>
                        ))}
                    </div>
                    {/* Content skeleton */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-4">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/20 p-5">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="h-10 w-10 bg-slate-200/50 rounded-full animate-pulse" />
                                        <div>
                                            <div className="h-4 w-32 bg-slate-200/50 rounded animate-pulse" />
                                            <div className="h-3 w-24 bg-slate-200/40 rounded animate-pulse mt-1.5" />
                                        </div>
                                    </div>
                                    <div className="h-3 w-full bg-slate-200/30 rounded animate-pulse" />
                                </div>
                            ))}
                        </div>
                        <div className="space-y-4">
                            <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/20 p-5 h-48 animate-pulse" />
                            <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/20 p-5 h-36 animate-pulse" />
                        </div>
                    </div>
                </div>
            </div>
        );
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

    if (role === 'coach' && coachData) {
        return <CoachDashboard data={coachData} />;
    }

    if (role === 'player' && playerData) {
        return <PlayerDashboard data={playerData} />;
    }

    return null;
}
