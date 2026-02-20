'use client';

import { useEffect, useReducer, useState } from 'react';
import { useGolfUser } from '@/contexts/golf-user-context';
import type { GolfCoach, GolfPlayer, GolfTeam } from '@/lib/types/golf';
import type { CalendarEvent } from '@/lib/types/calendar';
import { CoachDashboard, type CoachDashboardData } from './components/CoachDashboard';
import { PlayerDashboard, type PlayerDashboardData } from './components/PlayerDashboard';
import {
    getCoachDashboardData,
    getPlayerDashboardData,
    type CoachDashboardPayload,
    type PlayerDashboardPayload,
} from '@/app/golf/actions/dashboard-data';

// Local types removed — data now comes from server action payloads
// (CoachDashboardPayload / PlayerDashboardPayload from dashboard-data.ts)

// ---------------------------------------------------------------------------
// State machine — discriminated union eliminates impossible states
// ---------------------------------------------------------------------------

type DashboardState =
    | { status: 'loading' }
    | { status: 'coach'; data: CoachDashboardData; enhanced: CoachDashboardPayload | null }
    | { status: 'player'; data: PlayerDashboardData; enhanced: PlayerDashboardPayload | null }
    | { status: 'error'; message: string }
    | { status: 'unavailable' };

type DashboardAction =
    | { type: 'COACH_LOADED'; data: CoachDashboardData }
    | { type: 'COACH_ENHANCED'; enhanced: CoachDashboardPayload }
    | { type: 'PLAYER_LOADED'; data: PlayerDashboardData }
    | { type: 'PLAYER_ENHANCED'; enhanced: PlayerDashboardPayload }
    | { type: 'ERROR'; message: string }
    | { type: 'RETRY' }
    | { type: 'UNAVAILABLE' };

function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
    switch (action.type) {
        case 'COACH_LOADED':
            return { status: 'coach', data: action.data, enhanced: null };
        case 'COACH_ENHANCED':
            if (state.status === 'coach') {
                return { ...state, enhanced: action.enhanced };
            }
            return state;
        case 'PLAYER_LOADED':
            return { status: 'player', data: action.data, enhanced: null };
        case 'PLAYER_ENHANCED':
            if (state.status === 'player') {
                return { ...state, enhanced: action.enhanced };
            }
            return state;
        case 'ERROR':
            return { status: 'error', message: action.message };
        case 'RETRY':
            return { status: 'loading' };
        case 'UNAVAILABLE':
            return { status: 'unavailable' };
    }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GolfDashboardPage() {
    const golfUser = useGolfUser();
    const [state, dispatch] = useReducer(dashboardReducer, { status: 'loading' });
    // retryCount is orthogonal — only used to re-trigger the effect
    const [retryCount, setRetryCount] = useState(0);

    // PERF: Destructure primitive values for stable useEffect dependencies
    // instead of depending on the entire golfUser object reference
    const { role, userId, coachId, playerId, teamId, organizationId, name: userName, avatarUrl: userAvatar } = golfUser;

    useEffect(() => {
        let mounted = true;

        async function loadDashboard() {
            try {
                if (role === 'coach' && coachId) {
                    if (!mounted) return;

                    if (teamId) {
                        // Single server action call — no duplicate client-side queries.
                        // The server action fetches team info, roster, events, qualifiers,
                        // rounds, sparklines, action items, today events, and team pulse
                        // all in one optimized call with parallel DB queries.
                        const payload = await getCoachDashboardData(coachId, userId, teamId);

                        if (mounted) {
                            // Build CoachDashboardData from the payload for the base view
                            dispatch({
                                type: 'COACH_LOADED',
                                data: {
                                    coach: { id: coachId, user_id: userId, organization_id: organizationId || null, full_name: userName, avatar_url: userAvatar || null, created_at: '' } as GolfCoach,
                                    team: payload.teamName ? { id: teamId, name: payload.teamName, season: null, join_code: payload.joinCode, created_at: '' } as GolfTeam : null,
                                    stats: payload.stats,
                                    recentRounds: payload.recentRounds,
                                    topPlayers: payload.topPlayers,
                                    calendarEvents: payload.calendarEvents as CalendarEvent[],
                                    teamScoringTrend: payload.teamScoringTrend.length > 0 ? payload.teamScoringTrend : undefined,
                                },
                            });
                            // Enhanced data is already in the payload — dispatch immediately
                            dispatch({ type: 'COACH_ENHANCED', enhanced: payload });
                        }
                    } else {
                        // No team — show empty coach dashboard
                        if (mounted) {
                            dispatch({
                                type: 'COACH_LOADED',
                                data: {
                                    coach: { id: coachId, user_id: userId, organization_id: organizationId || null, full_name: userName, avatar_url: userAvatar || null, created_at: '' } as GolfCoach,
                                    team: null,
                                    stats: { rosterSize: 0, upcomingEvents: 0, activeQualifiers: 0, teamScoringAverage: null, previousAverage: null },
                                    recentRounds: [],
                                    topPlayers: [],
                                    calendarEvents: [],
                                    teamScoringTrend: undefined,
                                },
                            });
                        }
                    }
                    return;
                }

                if (role === 'player' && playerId) {
                    if (!mounted) return;

                    // Single server action call — no duplicate client-side queries.
                    const payload = await getPlayerDashboardData(playerId, userId, teamId || null);

                    if (mounted) {
                        const nameParts = userName.split(' ');
                        dispatch({
                            type: 'PLAYER_LOADED',
                            data: {
                                player: { id: playerId, user_id: userId, first_name: nameParts[0] || '', last_name: nameParts.slice(1).join(' ') || '', avatar_url: userAvatar || null, handicap: payload.stats.handicap, created_at: '' } as GolfPlayer,
                                team: payload.teamName ? { id: teamId || '', name: payload.teamName, season: null, join_code: null, created_at: '' } as unknown as GolfTeam : null,
                                stats: payload.stats,
                                recentRounds: payload.recentRounds,
                            },
                        });
                        // Enhanced data is already in the payload — dispatch immediately
                        dispatch({ type: 'PLAYER_ENHANCED', enhanced: payload });
                    }
                    return;
                }

                // Fallthrough: role/ID mismatch — stop loading
                if (mounted) {
                    dispatch({ type: 'UNAVAILABLE' });
                }
            } catch (err) {
                if (mounted) {
                    dispatch({ type: 'ERROR', message: err instanceof Error ? err.message : 'Failed to load dashboard' });
                }
            }
        }

        loadDashboard();

        return () => {
            mounted = false;
        };
        // PERF: Depend on stable primitive values, not the golfUser object reference
        // Note: userName/userAvatar intentionally excluded — they are only used for display
        // in the constructed data objects, not for queries. Including them would cause
        // unnecessary refetches on profile updates.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role, userId, coachId, playerId, teamId, organizationId, retryCount]);

    switch (state.status) {
        case 'loading':
            return (
                <div className="min-h-full bg-transparent">
                    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
                        {/* Header skeleton */}
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="h-7 w-48 bg-warm-200/60 rounded-lg animate-pulse" />
                                <div className="h-4 w-32 bg-warm-200/40 rounded-md animate-pulse mt-2" />
                            </div>
                            <div className="h-9 w-24 bg-warm-200/50 rounded-lg animate-pulse" />
                        </div>
                        {/* Stats grid skeleton */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/20 p-4 md:p-6">
                                    <div className="h-3 w-20 bg-warm-200/50 rounded animate-pulse mb-3" />
                                    <div className="h-8 w-16 bg-warm-200/60 rounded-lg animate-pulse" />
                                </div>
                            ))}
                        </div>
                        {/* Content skeleton */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 space-y-4">
                                {[...Array(3)].map((_, i) => (
                                    <div key={i} className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/20 p-5">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="h-10 w-10 bg-warm-200/50 rounded-full animate-pulse" />
                                            <div>
                                                <div className="h-4 w-32 bg-warm-200/50 rounded animate-pulse" />
                                                <div className="h-3 w-24 bg-warm-200/40 rounded animate-pulse mt-1.5" />
                                            </div>
                                        </div>
                                        <div className="h-3 w-full bg-warm-200/30 rounded animate-pulse" />
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

        case 'error':
            return (
                <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
                    <div className="text-center">
                        <h2 className="text-xl font-semibold text-warm-900 mb-2">Error Loading Dashboard</h2>
                        <p className="text-warm-600 mb-4">{state.message}</p>
                        <button
                            onClick={() => {
                                dispatch({ type: 'RETRY' });
                                setRetryCount(c => c + 1);
                            }}
                            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            );

        case 'coach':
            return <CoachDashboard data={state.data} enhancedData={state.enhanced} />;

        case 'player':
            return <PlayerDashboard data={state.data} enhancedData={state.enhanced} />;

        case 'unavailable':
            return (
                <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
                    <div className="text-center">
                        <h2 className="text-xl font-semibold text-warm-900 mb-2">Dashboard Unavailable</h2>
                        <p className="text-warm-600 mb-4">Unable to load your dashboard. Please check your account setup.</p>
                        <a
                            href="/golf"
                            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors inline-block"
                        >
                            Go to Golf Home
                        </a>
                    </div>
                </div>
            );
    }
}
