'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fromUntyped } from '@/lib/supabase/untyped';
import { CoachPhilosophy } from '@/lib/coachhelm/types';
import { PHILOSOPHY_DEFAULTS } from '@/lib/coachhelm/constants';
import { revalidateCoachingPhilosophyPaths } from '@/app/golf/actions/coaching-philosophy';

interface SaveCoachPhilosophyOptions {
    revalidate?: boolean;
}

// Database row type for golf_coach_philosophy
interface PhilosophyDbRow {
    id: string;
    coach_id: string;
    priority_ball_striking: number;
    priority_short_game: number;
    priority_putting: number;
    priority_course_management: number;
    priority_mental_game: number;
    alert_sensitivity: 'aggressive' | 'balanced' | 'conservative';
    decline_threshold: string | number;
    pressure_gap_threshold: string | number;
    bubble_zone_range: string | number;
    weight_historical: number;
    weight_recent_form: number;
    weight_tournament: number;
    weight_qualifying: number;
    weight_subjective: number;
    alert_scoring_decline: boolean;
    alert_stat_regression: boolean;
    alert_tournament_pressure: boolean;
    alert_plateau: boolean;
    alert_bubble_player: boolean;
    alert_surge_player: boolean;
    alert_streaks: boolean;
    alert_recurring_weakness: boolean;
    alert_closing_holes: boolean;
    alert_par_3_issues: boolean;
    show_strokes_gained: boolean;
    show_advanced_stats: boolean;
    insight_verbosity: string;
    created_at: string;
    updated_at: string;
}

// Map database snake_case to TypeScript camelCase
function dbToTs(row: PhilosophyDbRow): CoachPhilosophy {
    return {
        id: row.id,
        coachId: row.coach_id,
        priorityBallStriking: row.priority_ball_striking,
        priorityShortGame: row.priority_short_game,
        priorityPutting: row.priority_putting,
        priorityCourseManagement: row.priority_course_management,
        priorityMentalGame: row.priority_mental_game,
        alertSensitivity: row.alert_sensitivity,
        declineThreshold: typeof row.decline_threshold === 'string' ? parseFloat(row.decline_threshold) : row.decline_threshold,
        pressureGapThreshold: typeof row.pressure_gap_threshold === 'string' ? parseFloat(row.pressure_gap_threshold) : row.pressure_gap_threshold,
        bubbleZoneRange: typeof row.bubble_zone_range === 'string' ? parseFloat(row.bubble_zone_range) : row.bubble_zone_range,
        weightHistorical: row.weight_historical,
        weightRecentForm: row.weight_recent_form,
        weightTournament: row.weight_tournament,
        weightQualifying: row.weight_qualifying,
        weightSubjective: row.weight_subjective,
        alertScoringDecline: row.alert_scoring_decline,
        alertStatRegression: row.alert_stat_regression,
        alertTournamentPressure: row.alert_tournament_pressure,
        alertPlateau: row.alert_plateau,
        alertBubblePlayer: row.alert_bubble_player,
        alertSurgePlayer: row.alert_surge_player,
        alertStreaks: row.alert_streaks,
        alertRecurringWeakness: row.alert_recurring_weakness,
        alertClosingHoles: row.alert_closing_holes,
        alertPar3Issues: row.alert_par_3_issues,
        showStrokesGained: row.show_strokes_gained,
        showAdvancedStats: row.show_advanced_stats,
        // Map 'minimal'/'standard' to 'brief', keep 'detailed' as-is
        insightVerbosity: (row.insight_verbosity === 'detailed' ? 'detailed' : 'brief') as 'brief' | 'detailed',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

// Map TypeScript camelCase to database snake_case
function tsToDb(data: Partial<CoachPhilosophy>): Record<string, unknown> {
    const mapping: Record<string, string> = {
        priorityBallStriking: 'priority_ball_striking',
        priorityShortGame: 'priority_short_game',
        priorityPutting: 'priority_putting',
        priorityCourseManagement: 'priority_course_management',
        priorityMentalGame: 'priority_mental_game',
        alertSensitivity: 'alert_sensitivity',
        declineThreshold: 'decline_threshold',
        pressureGapThreshold: 'pressure_gap_threshold',
        bubbleZoneRange: 'bubble_zone_range',
        weightHistorical: 'weight_historical',
        weightRecentForm: 'weight_recent_form',
        weightTournament: 'weight_tournament',
        weightQualifying: 'weight_qualifying',
        weightSubjective: 'weight_subjective',
        alertScoringDecline: 'alert_scoring_decline',
        alertStatRegression: 'alert_stat_regression',
        alertTournamentPressure: 'alert_tournament_pressure',
        alertPlateau: 'alert_plateau',
        alertBubblePlayer: 'alert_bubble_player',
        alertSurgePlayer: 'alert_surge_player',
        alertStreaks: 'alert_streaks',
        alertRecurringWeakness: 'alert_recurring_weakness',
        alertClosingHoles: 'alert_closing_holes',
        alertPar3Issues: 'alert_par_3_issues',
        showStrokesGained: 'show_strokes_gained',
        showAdvancedStats: 'show_advanced_stats',
        insightVerbosity: 'insight_verbosity',
    };

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
        const dbKey = mapping[key];
        if (dbKey) result[dbKey] = value;
    }
    return result;
}

export function useCoachPhilosophy(coachId: string | null) {
    const [philosophy, setPhilosophy] = useState<CoachPhilosophy | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const supabaseRef = useRef(createClient());

    // Fetch on mount
    useEffect(() => {
        if (!coachId) {
            setLoading(false);
            return;
        }

        // Capture coachId for closure (TypeScript narrowing)
        const currentCoachId = coachId;

        async function fetchPhilosophy() {
            setLoading(true);
            setError(null);

            const { data, error: fetchError } = await supabaseRef.current
                .from('golf_coach_philosophy')
                .select('*')
                .eq('coach_id', currentCoachId)
                .maybeSingle();

            if (fetchError) {
                setError(fetchError.message);
                setLoading(false);
                return;
            }

            if (data) {
                setPhilosophy(dbToTs(data as unknown as PhilosophyDbRow));
            } else {
                // Create default record if none exists
                const { data: newData, error: createError } = await supabaseRef.current
                    .from('golf_coach_philosophy')
                    .insert({
                        coach_id: currentCoachId,
                        // Use defaults for initial creation (postgres defaults handle this largely, but explicit here for clarity)
                        priority_ball_striking: PHILOSOPHY_DEFAULTS.priorityBallStriking,
                        priority_short_game: PHILOSOPHY_DEFAULTS.priorityShortGame,
                        priority_putting: PHILOSOPHY_DEFAULTS.priorityPutting,
                        priority_course_management: PHILOSOPHY_DEFAULTS.priorityCourseManagement,
                        priority_mental_game: PHILOSOPHY_DEFAULTS.priorityMentalGame,
                    })
                    .select()
                    .single();

                if (createError) {
                    setError(createError.message);
                } else if (newData) {
                    setPhilosophy(dbToTs(newData as unknown as PhilosophyDbRow));
                }
            }

            setLoading(false);
        }

        fetchPhilosophy();
    }, [coachId]);

    // Save changes
    const save = useCallback(
        async (updates: Partial<CoachPhilosophy>, options: SaveCoachPhilosophyOptions = {}) => {
            if (!philosophy?.id) return false;

            setSaving(true);
            setError(null);

            const { data, error: updateError } = await fromUntyped(supabaseRef.current, 'golf_coach_philosophy')
                .update(tsToDb(updates))
                .eq('id', philosophy.id)
                .select()
                .single();

            if (updateError) {
                setError(updateError.message);
                setSaving(false);
                return false;
            }

            setPhilosophy(dbToTs(data as unknown as PhilosophyDbRow));
            if (options.revalidate) {
                await revalidateCoachingPhilosophyPaths();
            }
            setSaving(false);
            return true;
        },
        [philosophy?.id]
    );

    return { philosophy, loading, saving, error, save };
}
