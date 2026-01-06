/**
 * Behavior Learner
 *
 * Learns from coach and player interactions to personalize:
 * - Alert thresholds
 * - Content preferences
 * - Insight types
 * - Engagement patterns
 */

import { createClient } from '@/lib/supabase/server';
import type {
  LearnedBehavior,
  LearningEntityType,
  UserInteraction,
  LearnedPreferences,
  ContentPreferences,
} from '../types';

// Internal type for database row (table created via migration)
interface LearnedBehaviorRow {
  id: string;
  entity_id: string;
  entity_type: string;
  interactions: Record<string, number> | null;
  preferences: Record<string, unknown> | null;
  learned_thresholds: Record<string, number> | null;
  engagement_patterns: Array<{ hour: number; dayOfWeek: number; engagementRate: number }> | null;
  content_preferences: { verbosity: string; focusAreas: string[] } | null;
  last_interaction_at: string | null;
  interaction_count: number | null;
  engagement_score: number | null;
}

/**
 * Behavior Learner class for adaptive personalization
 */
export class BehaviorLearner {
  private entityId: string;
  private entityType: LearningEntityType;
  private behavior: LearnedBehavior | null = null;

  constructor(entityId: string, entityType: LearningEntityType) {
    this.entityId = entityId;
    this.entityType = entityType;
  }

  /**
   * Records an interaction and updates learned behavior
   */
  async learnFromInteraction(interaction: UserInteraction): Promise<void> {
    // Load current behavior
    await this.loadBehavior();

    // Update interaction counts
    this.updateInteractionCounts(interaction);

    // Update preferences based on interaction
    this.updatePreferences(interaction);

    // Update engagement patterns
    this.updateEngagementPatterns(interaction);

    // Save updated behavior
    await this.saveBehavior();
  }

  /**
   * Gets a personalized threshold for a metric
   */
  async getPersonalizedThreshold(
    metric: string,
    defaultThreshold: number
  ): Promise<number> {
    await this.loadBehavior();

    if (!this.behavior) {
      return defaultThreshold;
    }

    const learnedThreshold = this.behavior.learnedThresholds[metric];
    if (learnedThreshold === undefined) {
      return defaultThreshold;
    }

    // Blend learned threshold with default based on confidence
    const confidence = this.calculateThresholdConfidence(metric);
    return learnedThreshold * confidence + defaultThreshold * (1 - confidence);
  }

  /**
   * Gets learned content preferences
   */
  async getContentPreferences(): Promise<ContentPreferences> {
    await this.loadBehavior();

    if (!this.behavior) {
      return {
        verbosity: 'balanced',
        focusAreas: [],
      };
    }

    return this.behavior.contentPreferences;
  }

  /**
   * Gets learned preferences
   */
  async getLearnedPreferences(): Promise<LearnedPreferences> {
    await this.loadBehavior();

    if (!this.behavior) {
      return {
        preferredInsightTypes: [],
        preferredMetrics: [],
        alertFrequency: 'medium',
        detailLevel: 'balanced',
      };
    }

    return this.behavior.preferences;
  }

  /**
   * Loads current behavior from database
   */
  private async loadBehavior(): Promise<void> {
    if (this.behavior) return; // Already loaded

    const supabase = await createClient();

    // Type assertion for new table not in generated types
    const { data } = await (supabase
      .from('golf_learned_behavior' as 'users')
      .select('*')
      .eq('entity_id', this.entityId)
      .eq('entity_type', this.entityType)
      .maybeSingle() as unknown as Promise<{
      data: LearnedBehaviorRow | null;
      error: Error | null;
    }>);

    if (data) {
      this.behavior = {
        id: data.id,
        entityId: data.entity_id,
        entityType: data.entity_type as LearningEntityType,
        interactions: (data.interactions as LearnedBehavior['interactions']) ?? {
          views: 0,
          clicks: 0,
          dismissals: 0,
          actions: 0,
        },
        preferences: (data.preferences as unknown as LearnedPreferences) ?? {
          preferredInsightTypes: [],
          preferredMetrics: [],
          alertFrequency: 'medium',
          detailLevel: 'balanced',
        },
        learnedThresholds: data.learned_thresholds ?? {},
        engagementPatterns: data.engagement_patterns ?? [],
        contentPreferences: (data.content_preferences as unknown as ContentPreferences) ?? {
          verbosity: 'balanced',
          focusAreas: [],
        },
        lastInteractionAt: data.last_interaction_at ?? undefined,
        interactionCount: data.interaction_count ?? 0,
        engagementScore: data.engagement_score ?? undefined,
      };
    } else {
      // Initialize new behavior record
      this.behavior = {
        id: crypto.randomUUID(),
        entityId: this.entityId,
        entityType: this.entityType,
        interactions: { views: 0, clicks: 0, dismissals: 0, actions: 0 },
        preferences: {
          preferredInsightTypes: [],
          preferredMetrics: [],
          alertFrequency: 'medium',
          detailLevel: 'balanced',
        },
        learnedThresholds: {},
        engagementPatterns: [],
        contentPreferences: {
          verbosity: 'balanced',
          focusAreas: [],
        },
        interactionCount: 0,
      };
    }
  }

  /**
   * Updates interaction counts
   */
  private updateInteractionCounts(interaction: UserInteraction): void {
    if (!this.behavior) return;

    switch (interaction.interactionType) {
      case 'view':
        this.behavior.interactions.views++;
        break;
      case 'click':
      case 'expand':
        this.behavior.interactions.clicks++;
        break;
      case 'dismiss':
      case 'collapse':
        this.behavior.interactions.dismissals++;
        break;
      case 'action':
      case 'share':
        this.behavior.interactions.actions++;
        break;
    }

    this.behavior.interactionCount++;
    this.behavior.lastInteractionAt = interaction.timestamp;

    // Update engagement score
    this.behavior.engagementScore = this.calculateEngagementScore();
  }

  /**
   * Updates preferences based on interaction
   */
  private updatePreferences(interaction: UserInteraction): void {
    if (!this.behavior) return;

    const { targetType, interactionType, metadata } = interaction;

    // If they clicked/expanded on a specific insight type, they like it
    if (
      (interactionType === 'click' || interactionType === 'expand') &&
      targetType
    ) {
      if (!this.behavior.preferences.preferredInsightTypes.includes(targetType)) {
        this.behavior.preferences.preferredInsightTypes.push(targetType);
      }
    }

    // If they dismissed something, they might not like it
    if (interactionType === 'dismiss' && targetType) {
      const index = this.behavior.preferences.preferredInsightTypes.indexOf(targetType);
      if (index > -1) {
        this.behavior.preferences.preferredInsightTypes.splice(index, 1);
      }
    }

    // Learn verbosity preference
    if (interactionType === 'expand') {
      // They want more detail
      if (this.behavior.contentPreferences.verbosity === 'brief') {
        this.behavior.contentPreferences.verbosity = 'balanced';
      } else if (this.behavior.contentPreferences.verbosity === 'balanced') {
        this.behavior.contentPreferences.verbosity = 'detailed';
      }
    }

    // Learn focus areas from what they engage with
    if (metadata?.focusArea && typeof metadata.focusArea === 'string') {
      if (!this.behavior.contentPreferences.focusAreas.includes(metadata.focusArea)) {
        this.behavior.contentPreferences.focusAreas.push(metadata.focusArea);
      }
    }

    // Learn thresholds from feedback
    if (interactionType === 'feedback' && metadata?.metric && metadata?.adjustedValue) {
      this.behavior.learnedThresholds[metadata.metric as string] =
        metadata.adjustedValue as number;
    }
  }

  /**
   * Updates engagement patterns (when user is most active)
   */
  private updateEngagementPatterns(interaction: UserInteraction): void {
    if (!this.behavior) return;

    const interactionDate = new Date(interaction.timestamp);
    const hour = interactionDate.getHours();
    const dayOfWeek = interactionDate.getDay();

    // Find or create pattern for this time slot
    let pattern = this.behavior.engagementPatterns.find(
      (p) => p.hour === hour && p.dayOfWeek === dayOfWeek
    );

    if (!pattern) {
      pattern = { hour, dayOfWeek, engagementRate: 0 };
      this.behavior.engagementPatterns.push(pattern);
    }

    // Increase engagement rate for this slot
    pattern.engagementRate = Math.min(1, pattern.engagementRate + 0.1);

    // Decay other patterns slightly
    for (const p of this.behavior.engagementPatterns) {
      if (p !== pattern) {
        p.engagementRate = Math.max(0, p.engagementRate - 0.01);
      }
    }
  }

  /**
   * Calculates engagement score (0-1)
   */
  private calculateEngagementScore(): number {
    if (!this.behavior) return 0;

    const { views, clicks, dismissals, actions } = this.behavior.interactions;
    const total = views + clicks + dismissals + actions;

    if (total === 0) return 0;

    // Score based on positive vs negative interactions
    const positiveWeight = (clicks + actions * 2) / total;
    const negativeWeight = dismissals / total;

    return Math.max(0, Math.min(1, positiveWeight - negativeWeight * 0.5 + 0.3));
  }

  /**
   * Calculates confidence in a learned threshold
   */
  private calculateThresholdConfidence(metric: string): number {
    if (!this.behavior) return 0;

    // More interactions = more confidence
    const interactionConfidence = Math.min(
      1,
      this.behavior.interactionCount / 50
    );

    // Check if we have specific feedback for this metric
    const hasDirectFeedback = this.behavior.learnedThresholds[metric] !== undefined;

    return hasDirectFeedback ? 0.8 : interactionConfidence * 0.5;
  }

  /**
   * Saves behavior to database
   */
  private async saveBehavior(): Promise<void> {
    if (!this.behavior) return;

    const supabase = await createClient();

    // Type assertion for new table not in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = supabase.from('golf_learned_behavior' as any) as any;
    await table.upsert({
      id: this.behavior.id,
      entity_id: this.behavior.entityId,
      entity_type: this.behavior.entityType,
      interactions: this.behavior.interactions,
      preferences: this.behavior.preferences,
      learned_thresholds: this.behavior.learnedThresholds,
      engagement_patterns: this.behavior.engagementPatterns,
      content_preferences: this.behavior.contentPreferences,
      last_interaction_at: this.behavior.lastInteractionAt,
      interaction_count: this.behavior.interactionCount,
      engagement_score: this.behavior.engagementScore,
      updated_at: new Date().toISOString(),
    });
  }
}
