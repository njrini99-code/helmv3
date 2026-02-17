'use server';

/**
 * Insight Evidence Server Actions
 *
 * Fetches relevant rounds and evidence data for CoachHelm insight drill-downs.
 */

import { createClient } from '@/lib/supabase/server';
import type { PatternCondition, InsightTone } from '@/lib/coachhelm/v2/types';

interface EvidenceMetadata {
  patternId?: string;
  patternConditions?: PatternCondition[];
  insightTone?: InsightTone;
  confidence?: number;
}

// Exported for use in components
export interface EvidenceRound {
  id: string;
  course_name: string | null;
  round_date: string;
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_gir: number | null;
  total_fairways_hit: number | null;
  round_type: string | null;
}

interface GetEvidenceResult {
  success: boolean;
  rounds?: EvidenceRound[];
  error?: string;
}

/**
 * Fetches rounds that support the given insight/pattern
 */
export async function getInsightEvidenceSources(
  playerId: string,
  metadata: EvidenceMetadata
): Promise<GetEvidenceResult> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Base query for player rounds
    let query = supabase
      .from('golf_rounds')
      .select(`
        id,
        course_name,
        round_date,
        total_score,
        score_to_par,
        total_putts,
        total_gir,
        total_fairways_hit,
        round_type
      `)
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false });

    // Apply pattern-based filtering if conditions are provided
    if (metadata.patternConditions && metadata.patternConditions.length > 0) {
      // Apply condition-based filters
      for (const condition of metadata.patternConditions) {
        // Map common condition fields to actual database columns
        const fieldMap: Record<string, string> = {
          score_to_par: 'score_to_par',
          total_score: 'total_score',
          putts: 'total_putts',
          total_putts: 'total_putts',
          greens_in_regulation: 'total_gir',
          total_gir: 'total_gir',
          fairways_hit: 'total_fairways_hit',
          total_fairways_hit: 'total_fairways_hit',
          round_type: 'round_type',
        };

        const dbField = fieldMap[condition.field];
        if (!dbField) continue; // Skip unmapped fields

        switch (condition.operator) {
          case 'eq':
            query = query.eq(dbField, condition.value);
            break;
          case 'neq':
            query = query.neq(dbField, condition.value);
            break;
          case 'gt':
            query = query.gt(dbField, condition.value);
            break;
          case 'gte':
            query = query.gte(dbField, condition.value);
            break;
          case 'lt':
            query = query.lt(dbField, condition.value);
            break;
          case 'lte':
            query = query.lte(dbField, condition.value);
            break;
          case 'in':
            if (Array.isArray(condition.value)) {
              query = query.in(dbField, condition.value as string[]);
            }
            break;
        }
      }
    } else {
      // No specific conditions - use tone-based heuristics
      switch (metadata.insightTone) {
        case 'cautionary':
        case 'urgent':
          // Focus on worse performing rounds
          query = query.gte('score_to_par', 3);
          break;
        case 'encouraging':
        case 'celebratory':
          // Focus on better performing rounds
          query = query.lte('score_to_par', 2);
          break;
        // 'neutral' - no additional filtering
      }
    }

    // Limit results
    query = query.limit(10);

    const { data: rounds, error } = await query;

    if (error) {
      console.error('Error fetching evidence rounds:', error);
      return {
        success: false,
        error: 'Failed to fetch evidence data',
      };
    }

    return {
      success: true,
      rounds: (rounds || []) as EvidenceRound[],
    };
  } catch (error) {
    console.error('Unexpected error in getInsightEvidenceSources:', error);
    return {
      success: false,
      error: 'An unexpected error occurred',
    };
  }
}

/**
 * Get rounds that match a specific pattern's conditions
 */
export async function getPatternMatchingRounds(
  playerId: string,
  patternId: string,
  limit: number = 10
): Promise<GetEvidenceResult> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // First, get the pattern to understand its conditions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pattern } = await (supabase as any)
      .from('golf_patterns_v2')
      .select('conditions')
      .eq('id', patternId)
      .single();

    if (!pattern) {
      // Pattern not found - return recent rounds as fallback
      const { data: rounds, error } = await supabase
        .from('golf_rounds')
        .select(`
          id,
          course_name,
          round_date,
          total_score,
          score_to_par,
          total_putts,
          total_gir,
          total_fairways_hit,
          round_type
        `)
        .eq('player_id', playerId)
        .eq('status', 'completed')
        .not('total_score', 'is', null)
        .order('round_date', { ascending: false })
        .limit(limit);

      if (error) {
        return { success: false, error: 'Failed to fetch rounds' };
      }

      return { success: true, rounds: (rounds || []) as EvidenceRound[] };
    }

    // Use the pattern conditions to filter
    return getInsightEvidenceSources(playerId, {
      patternId,
      patternConditions: pattern.conditions,
    });
  } catch (error) {
    console.error('Error in getPatternMatchingRounds:', error);
    return {
      success: false,
      error: 'An unexpected error occurred',
    };
  }
}

/**
 * Get rounds from a specific date range for trend analysis
 */
export async function getTrendEvidenceRounds(
  playerId: string,
  startDate: string,
  endDate: string
): Promise<GetEvidenceResult> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const { data: rounds, error } = await supabase
      .from('golf_rounds')
      .select(`
        id,
        course_name,
        round_date,
        total_score,
        score_to_par,
        total_putts,
        total_gir,
        total_fairways_hit,
        round_type
      `)
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .not('total_score', 'is', null)
      .gte('round_date', startDate)
      .lte('round_date', endDate)
      .order('round_date', { ascending: true });

    if (error) {
      console.error('Error fetching trend evidence:', error);
      return {
        success: false,
        error: 'Failed to fetch trend data',
      };
    }

    return {
      success: true,
      rounds: (rounds || []) as EvidenceRound[],
    };
  } catch (error) {
    console.error('Unexpected error in getTrendEvidenceRounds:', error);
    return {
      success: false,
      error: 'An unexpected error occurred',
    };
  }
}

/**
 * Get tournament vs practice round comparison data
 */
export async function getComparisonRounds(
  playerId: string,
  limit: number = 5
): Promise<{
  success: boolean;
  tournamentRounds?: EvidenceRound[];
  practiceRounds?: EvidenceRound[];
  error?: string;
}> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Get tournament rounds
    const { data: tournamentRounds, error: tournamentError } = await supabase
      .from('golf_rounds')
      .select(`
        id,
        course_name,
        round_date,
        total_score,
        score_to_par,
        total_putts,
        total_gir,
        total_fairways_hit,
        round_type
      `)
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .eq('round_type', 'tournament')
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false })
      .limit(limit);

    if (tournamentError) {
      return { success: false, error: 'Failed to fetch tournament rounds' };
    }

    // Get practice rounds
    const { data: practiceRounds, error: practiceError } = await supabase
      .from('golf_rounds')
      .select(`
        id,
        course_name,
        round_date,
        total_score,
        score_to_par,
        total_putts,
        total_gir,
        total_fairways_hit,
        round_type
      `)
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .or('round_type.is.null,round_type.eq.practice')
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false })
      .limit(limit);

    if (practiceError) {
      return { success: false, error: 'Failed to fetch practice rounds' };
    }

    return {
      success: true,
      tournamentRounds: (tournamentRounds || []) as EvidenceRound[],
      practiceRounds: (practiceRounds || []) as EvidenceRound[],
    };
  } catch (error) {
    console.error('Unexpected error in getComparisonRounds:', error);
    return {
      success: false,
      error: 'An unexpected error occurred',
    };
  }
}
