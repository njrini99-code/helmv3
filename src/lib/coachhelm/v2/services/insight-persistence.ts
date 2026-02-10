/**
 * Insight Persistence Service
 *
 * Handles persisting, dismissing, and managing insight lifecycle.
 * Integrates with existing database tables for tracking actions and outcomes.
 */

import { createClient } from '@/lib/supabase/client';
import type { ComposedInsight } from '../types';
import type { StatsInsight } from '../mining/stats-insight-generator';
import type { CorrelationInsight } from '../mining/correlation-engine';

/**
 * Insight action types
 */
export type InsightActionType =
  | 'dismissed'
  | 'acknowledged'
  | 'created_focus_area'
  | 'scheduled_practice'
  | 'added_to_dev_plan'
  | 'discussed_with_player'
  | 'adjusted_lineup'
  | 'modified_training'
  | 'marked_incorrect'
  | 'shared'
  | 'converted_to_task';

/**
 * Insight lifecycle state
 */
export type InsightLifecycleState = 'detected' | 'confirmed' | 'addressed' | 'resolved' | 'dismissed';

/**
 * Outcome status after taking action
 */
export type OutcomeStatus = 'pending' | 'improved' | 'no_change' | 'worsened' | 'inconclusive';

/**
 * Persisted insight record
 */
export interface PersistedInsight {
  id: string;
  playerId: string;
  teamId?: string;
  coachId?: string;

  // Content
  insightType: string;
  headline: string;
  body: string;
  recommendation?: string;
  confidence: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category?: string;

  // Impact
  strokeImpact?: number;

  // State
  lifecycleState: InsightLifecycleState;
  dismissed: boolean;
  dismissedAt?: string;
  dismissedBy?: string;
  dismissReason?: string;

  // Action tracking
  actionTaken: boolean;
  actionType?: InsightActionType;
  actionDate?: string;
  actionBy?: string;
  actionNotes?: string;

  // Outcome
  outcomeStatus?: OutcomeStatus;
  outcomeMeasuredAt?: string;
  outcomeNotes?: string;

  // Linked entities
  linkedFocusAreaId?: string;
  linkedTaskId?: string;

  // Metadata
  sourceType: 'system' | 'coach' | 'pattern' | 'round_review' | 'prediction' | 'stats' | 'correlation';
  sourceId?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

/**
 * Filter options for retrieving insights
 */
export interface InsightFilterOptions {
  playerId?: string;
  teamId?: string;
  coachId?: string;
  lifecycleStates?: InsightLifecycleState[];
  excludeDismissed?: boolean;
  priority?: ('low' | 'medium' | 'high' | 'urgent')[];
  categories?: string[];
  sourceTypes?: string[];
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Insight Persistence Service
 */
export class InsightPersistenceService {
  private supabase = createClient();

  /**
   * Persist a composed insight to the database
   * Note: Uses actual database columns (title, content, status) not assumed names
   */
  async persistInsight(
    insight: ComposedInsight | StatsInsight | CorrelationInsight,
    options: {
      playerId: string;
      teamId?: string;
      coachId?: string;
      sourceType?: PersistedInsight['sourceType'];
      expiresInDays?: number;
    }
  ): Promise<PersistedInsight | null> {
    const { playerId, teamId, coachId, sourceType = 'system' } = options;

    // Normalize insight to common format
    const normalized = this.normalizeInsight(insight);

    // Check for existing similar insight to avoid duplicates
    const existing = await this.findSimilarInsight(playerId, normalized.headline);
    if (existing) {
      // Update existing instead of creating duplicate
      return this.updateInsight(existing.id, {
        body: normalized.body,
        confidence: normalized.confidence,
        updatedAt: new Date().toISOString(),
      });
    }

    // Store additional data in metadata JSONB field since actual schema is different
    const metadata = {
      recommendation: normalized.recommendation,
      confidence: normalized.confidence,
      category: normalized.category,
      strokes_impact: normalized.strokeImpact,
      source_type: sourceType,
    };

    const { data, error } = await this.supabase
      .from('golf_coach_insights')
      .insert({
        player_id: playerId,
        team_id: teamId,
        coach_id: coachId,
        insight_type: normalized.category || 'performance',
        title: normalized.headline,
        content: normalized.body,
        priority: normalized.priority,
        status: 'active',
        dismissed: false,
        metadata,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to persist insight:', error);
      return null;
    }

    return this.mapDatabaseRecord(data);
  }

  /**
   * Persist multiple insights in batch
   */
  async persistInsights(
    insights: Array<ComposedInsight | StatsInsight | CorrelationInsight>,
    options: {
      playerId: string;
      teamId?: string;
      coachId?: string;
      sourceType?: PersistedInsight['sourceType'];
    }
  ): Promise<PersistedInsight[]> {
    const results: PersistedInsight[] = [];

    for (const insight of insights) {
      const persisted = await this.persistInsight(insight, options);
      if (persisted) {
        results.push(persisted);
      }
    }

    return results;
  }

  /**
   * Dismiss an insight
   */
  async dismissInsight(
    insightId: string,
     
    _userId: string,
     
    _reason?: string
  ): Promise<PersistedInsight | null> {
    const { data, error } = await this.supabase
      .from('golf_coach_insights')
      .update({
        dismissed: true,
        dismissed_at: new Date().toISOString(),
        status: 'dismissed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', insightId)
      .select()
      .single();

    if (error) {
      console.error('Failed to dismiss insight:', error);
      return null;
    }

    return this.mapDatabaseRecord(data);
  }

  /**
   * Acknowledge an insight (mark as seen)
   */
  async acknowledgeInsight(
    insightId: string,
     
    _userId: string
  ): Promise<PersistedInsight | null> {
    const { data, error } = await this.supabase
      .from('golf_coach_insights')
      .update({
        acknowledged_at: new Date().toISOString(),
        status: 'acknowledged',
        updated_at: new Date().toISOString(),
      })
      .eq('id', insightId)
      .select()
      .single();

    if (error) {
      console.error('Failed to acknowledge insight:', error);
      return null;
    }

    return this.mapDatabaseRecord(data);
  }

  /**
   * Take action on an insight
   */
  async takeAction(
    insightId: string,
    _userId: string,
    actionType: InsightActionType,
     
    _options?: {
      notes?: string;
      linkedFocusAreaId?: string;
      linkedTaskId?: string;
      linkedEventId?: string;
    }
  ): Promise<PersistedInsight | null> {
    const updates: Record<string, unknown> = {
      action_taken: true,
      action_type: actionType,
      action_date: new Date().toISOString(),
      status: actionType === 'dismissed' ? 'dismissed' : 'addressed',
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.supabase
      .from('golf_coach_insights')
      .update(updates)
      .eq('id', insightId)
      .select()
      .single();

    if (error) {
      console.error('Failed to take action on insight:', error);
      return null;
    }

    return this.mapDatabaseRecord(data);
  }

  /**
   * Mark insight as resolved
   */
  async resolveInsight(
    insightId: string,
    _userId: string,
    resolution?: {
      notes?: string;
      outcomeStatus?: OutcomeStatus;
      metricBefore?: number;
      metricAfter?: number;
      metricName?: string;
    }
  ): Promise<PersistedInsight | null> {
    // Store resolution data in metadata since actual schema may differ
    const metadata: Record<string, unknown> = {
      resolved_at: new Date().toISOString(),
    };

    if (resolution?.outcomeStatus) {
      metadata.outcome_status = resolution.outcomeStatus;
    }
    if (resolution?.notes) {
      metadata.outcome_notes = resolution.notes;
    }
    if (resolution?.metricName) {
      metadata.outcome_metric_name = resolution.metricName;
      metadata.outcome_metric_before = resolution.metricBefore;
      metadata.outcome_metric_after = resolution.metricAfter;
    }

    const { data, error } = await this.supabase
      .from('golf_coach_insights')
      .update({
        status: 'resolved',
        updated_at: new Date().toISOString(),
        metadata: metadata as unknown as Record<string, never>,
      })
      .eq('id', insightId)
      .select()
      .single();

    if (error) {
      console.error('Failed to resolve insight:', error);
      return null;
    }

    return this.mapDatabaseRecord(data);
  }

  /**
   * Get insights with filtering
   */
  async getInsights(filters: InsightFilterOptions): Promise<PersistedInsight[]> {
    let query = this.supabase
      .from('golf_coach_insights')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters.playerId) {
      query = query.eq('player_id', filters.playerId);
    }
    if (filters.teamId) {
      query = query.eq('team_id', filters.teamId);
    }
    if (filters.coachId) {
      query = query.eq('coach_id', filters.coachId);
    }
    if (filters.excludeDismissed) {
      query = query.eq('dismissed', false);
    }
    if (filters.lifecycleStates && filters.lifecycleStates.length > 0) {
      query = query.in('status', filters.lifecycleStates);
    }
    if (filters.priority && filters.priority.length > 0) {
      query = query.in('priority', filters.priority);
    }
    if (filters.fromDate) {
      query = query.gte('created_at', filters.fromDate.toISOString());
    }
    if (filters.toDate) {
      query = query.lte('created_at', filters.toDate.toISOString());
    }
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.range(filters.offset, (filters.offset + (filters.limit || 50)) - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to get insights:', error);
      return [];
    }

    return (data || []).map((record) => this.mapDatabaseRecord(record));
  }

  /**
   * Get active insights for a player (not dismissed, not expired)
   */
  async getActiveInsights(playerId: string): Promise<PersistedInsight[]> {
    return this.getInsights({
      playerId,
      excludeDismissed: true,
      lifecycleStates: ['detected', 'confirmed', 'addressed'],
    });
  }

  /**
   * Get insights needing attention (high priority, not acted upon)
   */
  async getInsightsNeedingAttention(
    teamId: string,
    limit: number = 10
  ): Promise<PersistedInsight[]> {
    const { data, error } = await this.supabase
      .from('golf_coach_insights')
      .select('*')
      .eq('team_id', teamId)
      .eq('dismissed', false)
      .is('acknowledged_at', null)
      .in('priority', ['high', 'urgent'])
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to get insights needing attention:', error);
      return [];
    }

    return (data || []).map((record) => this.mapDatabaseRecord(record));
  }

  /**
   * Find similar existing insight to avoid duplicates
   */
  private async findSimilarInsight(
    playerId: string,
    headline: string
  ): Promise<PersistedInsight | null> {
    // Look for insights with similar title in last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data, error } = await this.supabase
      .from('golf_coach_insights')
      .select('*')
      .eq('player_id', playerId)
      .eq('dismissed', false)
      .gte('created_at', sevenDaysAgo.toISOString())
      .ilike('title', `%${headline.substring(0, 30)}%`)
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapDatabaseRecord(data);
  }

  /**
   * Update an existing insight
   */
  private async updateInsight(
    insightId: string,
    updates: Partial<PersistedInsight>
  ): Promise<PersistedInsight | null> {
    const dbUpdates: Record<string, unknown> = {};

    if (updates.body) dbUpdates.content = updates.body;
    if (updates.confidence !== undefined) {
      // Store confidence in metadata
      dbUpdates.metadata = { confidence: updates.confidence };
    }
    if (updates.priority) dbUpdates.priority = updates.priority;
    if (updates.updatedAt) dbUpdates.updated_at = updates.updatedAt;

    const { data, error } = await this.supabase
      .from('golf_coach_insights')
      .update(dbUpdates)
      .eq('id', insightId)
      .select()
      .single();

    if (error) {
      console.error('Failed to update insight:', error);
      return null;
    }

    return this.mapDatabaseRecord(data);
  }

  /**
   * Normalize various insight types to common format
   */
  private normalizeInsight(
    insight: ComposedInsight | StatsInsight | CorrelationInsight
  ): {
    headline: string;
    body: string;
    recommendation?: string;
    confidence: number;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    category?: string;
    strokeImpact?: number;
  } {
    // Check if it's a StatsInsight
    if ('evidenceMetrics' in insight) {
      const statsInsight = insight as StatsInsight;
      return {
        headline: statsInsight.headline,
        body: statsInsight.body,
        recommendation: statsInsight.recommendation,
        confidence: statsInsight.confidence,
        priority: statsInsight.priority === 'critical' ? 'urgent' : statsInsight.priority,
        category: statsInsight.category,
        strokeImpact: statsInsight.strokeImpact,
      };
    }

    // Check if it's a CorrelationInsight
    if ('correlations' in insight) {
      const corrInsight = insight as CorrelationInsight;
      return {
        headline: corrInsight.title,
        body: corrInsight.description,
        recommendation: corrInsight.recommendation,
        confidence: corrInsight.confidence,
        priority: corrInsight.priority === 'critical' ? 'urgent' : corrInsight.priority,
        strokeImpact: corrInsight.strokeImpact,
      };
    }

    // It's a ComposedInsight
    const composedInsight = insight as ComposedInsight;
    return {
      headline: composedInsight.headline,
      body: composedInsight.body,
      recommendation: composedInsight.callToAction,
      confidence: composedInsight.confidence,
      priority: composedInsight.tone === 'urgent' ? 'urgent' : 'medium',
    };
  }

  /**
   * Map database record to PersistedInsight type
   * Uses actual database column names (title, content, status)
   */
  private mapDatabaseRecord(record: Record<string, unknown>): PersistedInsight {
    // Extract metadata if available
    const metadata = (record.metadata as Record<string, unknown>) || {};

    return {
      id: record.id as string,
      playerId: record.player_id as string,
      teamId: record.team_id as string | undefined,
      coachId: record.coach_id as string | undefined,
      insightType: record.insight_type as string,
      // Map title -> headline, content -> body for interface consistency
      headline: (record.title as string) || '',
      body: (record.content as string) || '',
      recommendation: (metadata.recommendation as string) || undefined,
      confidence: (metadata.confidence as number) || 0.7,
      priority: (record.priority as 'low' | 'medium' | 'high' | 'urgent') || 'medium',
      category: (metadata.category as string) || undefined,
      strokeImpact: (metadata.strokes_impact as number) || undefined,
      // Map status -> lifecycleState
      lifecycleState: this.mapStatusToLifecycleState(record.status as string),
      dismissed: (record.dismissed as boolean) || false,
      dismissedAt: record.dismissed_at as string | undefined,
      dismissedBy: (metadata.dismissed_by as string) || undefined,
      dismissReason: (metadata.dismiss_reason as string) || undefined,
      actionTaken: !!(record.acknowledged_at || record.action_taken),
      actionType: (record.action_type as InsightActionType) || undefined,
      actionDate: (record.action_date as string) || undefined,
      actionBy: (metadata.action_by as string) || undefined,
      outcomeStatus: (metadata.outcome_status as OutcomeStatus) || undefined,
      outcomeMeasuredAt: (metadata.outcome_measured_at as string) || undefined,
      outcomeNotes: (metadata.outcome_notes as string) || undefined,
      linkedFocusAreaId: (metadata.linked_focus_area_id as string) || undefined,
      linkedTaskId: (metadata.linked_task_id as string) || undefined,
      sourceType: ((metadata.source_type as PersistedInsight['sourceType']) || 'system'),
      sourceId: (metadata.source_id as string) || undefined,
      createdAt: (record.created_at as string) || new Date().toISOString(),
      updatedAt: (record.updated_at as string) || new Date().toISOString(),
      expiresAt: (metadata.expires_at as string) || undefined,
    };
  }

  /**
   * Map database status to lifecycle state
   */
  private mapStatusToLifecycleState(status: string): InsightLifecycleState {
    const mapping: Record<string, InsightLifecycleState> = {
      'active': 'detected',
      'acknowledged': 'confirmed',
      'in_progress': 'addressed',
      'addressed': 'addressed',
      'resolved': 'resolved',
      'dismissed': 'dismissed',
    };
    return mapping[status] || 'detected';
  }
}

// Export singleton instance
export const insightPersistence = new InsightPersistenceService();
