/**
 * Pattern Storage Service
 *
 * Handles persistence of mined patterns to the database:
 * - Saving new patterns (with deduplication)
 * - Updating pattern lifecycle states
 * - Retrieving pattern history
 * - Pattern archival and cleanup
 */

import { createClient } from '@/lib/supabase/server';
import type { MinedPattern, PatternTrend } from './types';

// ============================================================================
// TYPES
// ============================================================================

export type PatternLifecycleState =
  | 'detected'
  | 'confirmed'
  | 'addressed'
  | 'resolved'
  | 'dismissed';

export type PatternSeverity = 'low' | 'medium' | 'high' | 'critical';

interface PatternDbRow {
  id: string;
  player_id: string;
  pattern_type: string;
  conditions: unknown;
  outcome: unknown;
  support: number;
  confidence: number;
  lift: number;
  conviction: number;
  stroke_impact: number;
  actionability: number;
  sample_size: number;
  first_detected: string;
  last_occurrence: string;
  occurrence_count: number;
  trend: string;
  is_active: boolean;
  lifecycle_state?: string;
  severity?: string;
  coach_notes?: string;
  validated_at?: string;
  validated_by?: string;
  addressed_at?: string;
  resolved_at?: string;
  dismissed_at?: string;
  dismissed_reason?: string;
  metadata?: {
    description?: string;
    recommendation?: string;
  };
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Calculate severity from stroke impact */
function calculateSeverity(strokeImpact: number): PatternSeverity {
  const absImpact = Math.abs(strokeImpact);
  if (absImpact >= 2.5) return 'critical';
  if (absImpact >= 1.5) return 'high';
  if (absImpact >= 0.8) return 'medium';
  return 'low';
}

/** Transform DB row to MinedPattern */
function dbRowToPattern(row: PatternDbRow): MinedPattern & {
  lifecycleState: PatternLifecycleState;
  severity: PatternSeverity;
} {
  return {
    id: row.id,
    playerId: row.player_id,
    patternType: row.pattern_type as MinedPattern['patternType'],
    conditions: row.conditions as MinedPattern['conditions'],
    outcome: row.outcome as MinedPattern['outcome'],
    support: row.support,
    confidence: row.confidence,
    lift: row.lift,
    conviction: row.conviction,
    strokeImpact: row.stroke_impact,
    actionability: row.actionability,
    sampleSize: row.sample_size,
    firstDetected: row.first_detected,
    lastOccurrence: row.last_occurrence,
    occurrenceCount: row.occurrence_count,
    trend: row.trend as PatternTrend,
    isActive: row.is_active,
    description: row.metadata?.description,
    recommendation: row.metadata?.recommendation,
    lifecycleState: (row.lifecycle_state as PatternLifecycleState) || 'detected',
    severity: (row.severity as PatternSeverity) || calculateSeverity(row.stroke_impact),
  };
}

/** Check if two patterns are similar enough to be considered the same */
function areSimilarPatterns(a: MinedPattern, b: MinedPattern): boolean {
  if (a.patternType !== b.patternType) return false;
  if (a.conditions.length !== b.conditions.length) return false;

  // Check if all conditions match
  for (const condA of a.conditions) {
    const hasMatch = b.conditions.some(
      condB =>
        condA.field === condB.field &&
        condA.operator === condB.operator &&
        JSON.stringify(condA.value) === JSON.stringify(condB.value)
    );
    if (!hasMatch) return false;
  }

  return true;
}

// ============================================================================
// PATTERN STORAGE CLASS
// ============================================================================

export class PatternStorage {
  /**
   * Save patterns for a player, handling deduplication and updates
   */
  async savePatterns(playerId: string, patterns: MinedPattern[]): Promise<{
    saved: number;
    updated: number;
    errors: string[];
  }> {
    const supabase = await createClient();
    const results = { saved: 0, updated: 0, errors: [] as string[] };

    if (patterns.length === 0) return results;

    try {
      // Get existing patterns for this player
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patternsTable = supabase.from('golf_patterns_v2' as any) as any;

      const { data: existingPatterns } = await patternsTable
        .select('*')
        .eq('player_id', playerId)
        .eq('is_active', true);

      const existingTyped = (existingPatterns || []) as PatternDbRow[];

      for (const pattern of patterns) {
        // Check for existing similar pattern
        const existingPattern = existingTyped.find(ep => {
          const transformed = dbRowToPattern(ep);
          return areSimilarPatterns(pattern, transformed);
        });

        if (existingPattern) {
          // Update existing pattern
          const { error } = await patternsTable
            .update({
              support: pattern.support,
              confidence: pattern.confidence,
              lift: pattern.lift,
              conviction: pattern.conviction,
              stroke_impact: pattern.strokeImpact,
              actionability: pattern.actionability,
              sample_size: pattern.sampleSize,
              last_occurrence: pattern.lastOccurrence,
              occurrence_count: pattern.occurrenceCount,
              trend: this.calculateTrend(existingPattern, pattern),
              metadata: {
                description: pattern.description,
                recommendation: pattern.recommendation,
              },
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingPattern.id);

          if (error) {
            results.errors.push(`Failed to update pattern ${existingPattern.id}: ${error.message}`);
          } else {
            results.updated++;
          }
        } else {
          // Insert new pattern
          const { error } = await patternsTable.insert({
            id: pattern.id,
            player_id: pattern.playerId,
            pattern_type: pattern.patternType,
            conditions: pattern.conditions,
            outcome: pattern.outcome,
            support: pattern.support,
            confidence: pattern.confidence,
            lift: pattern.lift,
            conviction: pattern.conviction,
            stroke_impact: pattern.strokeImpact,
            actionability: pattern.actionability,
            sample_size: pattern.sampleSize,
            first_detected: pattern.firstDetected,
            last_occurrence: pattern.lastOccurrence,
            occurrence_count: pattern.occurrenceCount,
            trend: 'new',
            is_active: pattern.isActive,
            lifecycle_state: 'detected',
            severity: calculateSeverity(pattern.strokeImpact),
            metadata: {
              description: pattern.description,
              recommendation: pattern.recommendation,
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

          if (error) {
            // Handle duplicate key error gracefully
            if (error.code === '23505') {
              results.updated++;
            } else {
              results.errors.push(`Failed to save pattern: ${error.message}`);
            }
          } else {
            results.saved++;
          }
        }
      }

      return results;
    } catch (error) {
      console.error('[PatternStorage] Error saving patterns:', error);
      results.errors.push('Unexpected error saving patterns');
      return results;
    }
  }

  /**
   * Calculate trend by comparing old and new patterns
   */
  private calculateTrend(old: PatternDbRow, updated: MinedPattern): PatternTrend {
    const impactDiff = updated.strokeImpact - old.stroke_impact;
    const confidenceDiff = updated.confidence - old.confidence;

    // Pattern is strengthening if impact or confidence increased significantly
    if (Math.abs(impactDiff) > 0.2 || Math.abs(confidenceDiff) > 0.1) {
      // For negative patterns (costing strokes), strengthening means worse
      if (updated.strokeImpact > 0) {
        return impactDiff > 0 ? 'strengthening' : 'weakening';
      } else {
        return impactDiff < 0 ? 'strengthening' : 'weakening';
      }
    }

    return 'stable';
  }

  /**
   * Update pattern lifecycle state
   */
  async updatePatternLifecycle(
    patternId: string,
    state: PatternLifecycleState,
    metadata?: {
      notes?: string;
      validatedBy?: string;
      reason?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patternsTable = supabase.from('golf_patterns_v2' as any) as any;

      const updateData: Record<string, unknown> = {
        lifecycle_state: state,
        updated_at: new Date().toISOString(),
      };

      // Add state-specific timestamps
      switch (state) {
        case 'confirmed':
          updateData.validated_at = new Date().toISOString();
          if (metadata?.validatedBy) {
            updateData.validated_by = metadata.validatedBy;
          }
          break;
        case 'addressed':
          updateData.addressed_at = new Date().toISOString();
          break;
        case 'resolved':
          updateData.resolved_at = new Date().toISOString();
          updateData.is_active = false;
          break;
        case 'dismissed':
          updateData.dismissed_at = new Date().toISOString();
          updateData.is_active = false;
          if (metadata?.reason) {
            updateData.dismissed_reason = metadata.reason;
          }
          break;
      }

      if (metadata?.notes) {
        updateData.coach_notes = metadata.notes;
      }

      const { error } = await patternsTable
        .update(updateData)
        .eq('id', patternId);

      if (error) {
        console.error('[PatternStorage] Error updating lifecycle:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('[PatternStorage] Unexpected error:', error);
      return { success: false, error: 'Unexpected error' };
    }
  }

  /**
   * Get pattern history for a player
   */
  async getPatternHistory(
    playerId: string,
    options?: {
      includeInactive?: boolean;
      includeDismissed?: boolean;
      limit?: number;
    }
  ): Promise<Array<MinedPattern & { lifecycleState: PatternLifecycleState; severity: PatternSeverity }>> {
    const supabase = await createClient();

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase.from('golf_patterns_v2' as any) as any)
        .select('*')
        .eq('player_id', playerId);

      if (!options?.includeInactive) {
        query = query.eq('is_active', true);
      }

      if (!options?.includeDismissed) {
        query = query.neq('lifecycle_state', 'dismissed');
      }

      query = query.order('first_detected', { ascending: false });

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[PatternStorage] Error getting history:', error);
        return [];
      }

      return (data || []).map((row: PatternDbRow) => dbRowToPattern(row));
    } catch (error) {
      console.error('[PatternStorage] Unexpected error:', error);
      return [];
    }
  }

  /**
   * Archive old patterns (mark as inactive if too old)
   */
  async archiveStalePatterns(
    playerId: string,
    maxAgeDays: number = 90
  ): Promise<{ archived: number }> {
    const supabase = await createClient();

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patternsTable = supabase.from('golf_patterns_v2' as any) as any;

      const { data, error } = await patternsTable
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('player_id', playerId)
        .eq('is_active', true)
        .lt('last_occurrence', cutoffDate.toISOString())
        .select('id');

      if (error) {
        console.error('[PatternStorage] Error archiving patterns:', error);
        return { archived: 0 };
      }

      return { archived: data?.length || 0 };
    } catch (error) {
      console.error('[PatternStorage] Unexpected error:', error);
      return { archived: 0 };
    }
  }

  /**
   * Get patterns grouped by lifecycle state
   */
  async getPatternsByLifecycle(
    playerId: string
  ): Promise<Record<PatternLifecycleState, Array<MinedPattern & { lifecycleState: PatternLifecycleState; severity: PatternSeverity }>>> {
    const patterns = await this.getPatternHistory(playerId, {
      includeInactive: true,
      includeDismissed: true,
    });

    const grouped: Record<PatternLifecycleState, Array<MinedPattern & { lifecycleState: PatternLifecycleState; severity: PatternSeverity }>> = {
      detected: [],
      confirmed: [],
      addressed: [],
      resolved: [],
      dismissed: [],
    };

    for (const pattern of patterns) {
      grouped[pattern.lifecycleState].push(pattern);
    }

    return grouped;
  }

  /**
   * Get pattern occurrence timeline
   */
  async getPatternTimeline(
    patternId: string
  ): Promise<{
    pattern: (MinedPattern & { lifecycleState: PatternLifecycleState; severity: PatternSeverity }) | null;
    timeline: Array<{
      date: string;
      event: string;
      details?: string;
    }>;
  }> {
    const supabase = await createClient();

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patternsTable = supabase.from('golf_patterns_v2' as any) as any;

      const { data, error } = await patternsTable
        .select('*')
        .eq('id', patternId)
        .single();

      if (error || !data) {
        return { pattern: null, timeline: [] };
      }

      const pattern = dbRowToPattern(data as PatternDbRow);
      const rawData = data as PatternDbRow;

      // Build timeline from pattern data
      const timeline: Array<{ date: string; event: string; details?: string }> = [];

      // First detected
      timeline.push({
        date: pattern.firstDetected,
        event: 'Pattern Detected',
        details: `AI identified this pattern with ${Math.round(pattern.confidence * 100)}% confidence`,
      });

      // Validated
      if (rawData.validated_at) {
        timeline.push({
          date: rawData.validated_at,
          event: 'Coach Validated',
          details: rawData.coach_notes || undefined,
        });
      }

      // Addressed
      if (rawData.addressed_at) {
        timeline.push({
          date: rawData.addressed_at,
          event: 'Working on It',
          details: 'Coach marked as actively being addressed',
        });
      }

      // Resolved
      if (rawData.resolved_at) {
        timeline.push({
          date: rawData.resolved_at,
          event: 'Resolved',
          details: rawData.coach_notes || 'Issue has been addressed',
        });
      }

      // Dismissed
      if (rawData.dismissed_at) {
        timeline.push({
          date: rawData.dismissed_at,
          event: 'Dismissed',
          details: rawData.dismissed_reason || 'Pattern was dismissed by coach',
        });
      }

      // Sort timeline by date
      timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      return { pattern, timeline };
    } catch (error) {
      console.error('[PatternStorage] Unexpected error:', error);
      return { pattern: null, timeline: [] };
    }
  }
}

// Export singleton instance
export const patternStorage = new PatternStorage();
