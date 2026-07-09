import type { CalendarEvent } from '@/lib/types/calendar';

/**
 * Coach dashboard payload shape — extracted from the (now-deleted) legacy
 * CoachDashboard.tsx component when Wave W1 (2026-07-09) made
 * FairwayCoachDashboard the only dashboard tree. FairwayCoachDashboard imports
 * this type directly; kept as a standalone module so it doesn't drag in the
 * legacy component's JSX/imports.
 */
export interface DashboardStats {
    rosterSize: number;
    upcomingEvents: number;
    activeQualifiers: number;
    teamScoringAverage: number | null;
    previousAverage?: number | null;
}

export interface CoachDashboardData {
    coach: import('@/lib/types/golf').GolfCoach;
    team: import('@/lib/types/golf').GolfTeam | null;
    stats: DashboardStats;
    recentRounds: Array<{
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
    }>;
    topPlayers: Array<{
        id: string;
        name: string;
        avg_score: number;
        rounds: number;
    }>;
    calendarEvents: CalendarEvent[];
    teamScoringTrend?: Array<{
        label: string;
        value: number;
    }>;
}
