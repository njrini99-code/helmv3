/**
 * Behavior Learner
 *
 * Learns from coach and player interactions with the CoachHelm engine.
 *
 * DESIGN (2026-04-21 refactor): the live `golf_learned_behavior` table is an
 * event log — each row is one interaction. Previous versions of this class
 * treated it as a single per-entity object with counters + nested JSON state,
 * which a) never matched the live schema (silent DB failures) and b) had a
 * load-mutate-save race when two interactions arrived concurrently.
 *
 * The new shape:
 *   - `recordInteraction(event)` inserts one row. Race-free.
 *   - `learnFromInteraction(UserInteraction)` is preserved as a thin adapter
 *     so existing callers (player-feedback action, orchestrator) don't break.
 *   - `loadBehavior()` aggregates rows into a `BehaviorProfile` on read.
 *   - `getLearnedPreferences`, `getContentPreferences`, `getPersonalizedThreshold`
 *     derive their output from the aggregated profile.
 *
 * The live schema (verified 2026-04-21):
 *   id uuid, entity_id uuid, entity_type text, interaction_type text,
 *   target_type text, timestamp timestamptz, metadata jsonb, created_at timestamptz
 *
 * Note: there is NO `target_id` column. Callers that want to record a
 * target id must pass it inside `metadata.target_id`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import type {
  LearnedBehavior,
  LearningEntityType,
  UserInteraction,
  LearnedPreferences,
  ContentPreferences,
} from '../types';

/** A single recorded interaction event. */
export interface BehaviorEvent {
  interaction_type: string;
  target_type: string;
  target_id: string;
  metadata: Record<string, unknown>;
}

/** Aggregated view derived from the event log on read. */
export interface BehaviorProfile {
  totalInteractions: number;
  acknowledgmentRate: number;
  dismissalRate: number;
  lastInteractionAt: string | null;
  byInsightType: Record<string, { acks: number; dismisses: number }>;
}

interface EventRow {
  interaction_type: string;
  target_type: string;
  timestamp: string;
  metadata: Record<string, unknown> | null;
}

const ACK_TYPES = new Set([
  'insight_acknowledged',
  'acknowledged',
  'view',
  'click',
  'expand',
  'action',
  'share',
]);
const DISMISS_TYPES = new Set([
  'insight_dismissed',
  'dismissed',
  'dismiss',
  'collapse',
]);

/**
 * Behavior Learner class for adaptive personalization.
 */
export class BehaviorLearner {
  private supabase: SupabaseClient | null = null;
  private profileCache: BehaviorProfile | null = null;

  constructor(
    private entityId: string,
    private entityType: LearningEntityType,
  ) {}

  private async getClient(): Promise<SupabaseClient> {
    if (!this.supabase) {
      this.supabase = (await createClient()) as unknown as SupabaseClient;
    }
    return this.supabase;
  }

  /**
   * Record a single interaction event. Race-free: two concurrent calls produce
   * two rows.
   */
  async recordInteraction(event: BehaviorEvent): Promise<void> {
    const supabase = await this.getClient();
    const metadata = {
      ...event.metadata,
      // live table has no `target_id` column — carry it in metadata
      target_id: event.target_id,
    };

    const payload = {
      entity_type: this.entityType,
      entity_id: this.entityId,
      interaction_type: event.interaction_type,
      target_type: event.target_type,
      metadata,
      timestamp: new Date().toISOString(),
    };

    const fromFn = (supabase as unknown as {
      from: (table: string) => {
        insert: (row: typeof payload) => Promise<{ error: { message: string } | null }>;
      };
    }).from;

    const { error } = await fromFn
      .call(supabase, 'golf_learned_behavior')
      .insert(payload);

    // Invalidate the read cache so next loadBehavior() sees the new event.
    this.profileCache = null;

    if (error) {
      await logServerError('behavior-learner.recordInteraction failed', {
        action: 'behavior-learner.recordInteraction',
        featureArea: 'coachhelm.learning',
        source: 'background_job',
        metadata: {
          entityId: this.entityId,
          entityType: this.entityType,
          interactionType: event.interaction_type,
          dbError: error as unknown,
        },
      });
    }
  }

  /**
   * Legacy adapter — existing callers pass a `UserInteraction` object.
   * Translate to the event-log shape and insert. Preserves backward compat
   * with `player-feedback.ts` and `orchestrator.ts`.
   */
  async learnFromInteraction(interaction: UserInteraction): Promise<void> {
    await this.recordInteraction({
      interaction_type: interaction.interactionType,
      target_type: interaction.targetType ?? 'unknown',
      target_id: interaction.targetId ?? '',
      metadata: interaction.metadata ?? {},
    });
  }

  /**
   * Load and aggregate all interaction events for this entity into a
   * `BehaviorProfile`. Cached per-instance; invalidated on `recordInteraction`.
   */
  async loadBehavior(): Promise<BehaviorProfile> {
    if (this.profileCache) return this.profileCache;

    const supabase = await this.getClient();
    const emptyProfile: BehaviorProfile = {
      totalInteractions: 0,
      acknowledgmentRate: 0,
      dismissalRate: 0,
      lastInteractionAt: null,
      byInsightType: {},
    };

    const fromFn = (supabase as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => {
              order: (
                col: string,
                opts: { ascending: boolean },
              ) => Promise<{ data: EventRow[] | null; error: { message: string } | null }>;
            };
          };
        };
      };
    }).from;

    const { data, error } = await fromFn
      .call(supabase, 'golf_learned_behavior')
      .select('interaction_type, target_type, timestamp, metadata')
      .eq('entity_type', this.entityType)
      .eq('entity_id', this.entityId)
      .order('timestamp', { ascending: false });

    if (error || !data) {
      if (error) {
        await logServerError('behavior-learner.loadBehavior failed', {
          action: 'behavior-learner.loadBehavior',
          featureArea: 'coachhelm.learning',
          source: 'background_job',
          metadata: {
            entityId: this.entityId,
            entityType: this.entityType,
            dbError: error as unknown,
          },
        });
      }
      this.profileCache = emptyProfile;
      return emptyProfile;
    }

    const profile = this.aggregate(data);
    this.profileCache = profile;
    return profile;
  }

  private aggregate(rows: EventRow[]): BehaviorProfile {
    const total = rows.length;
    let acks = 0;
    let dismisses = 0;
    const byInsightType: Record<string, { acks: number; dismisses: number }> = {};

    for (const row of rows) {
      const meta = row.metadata ?? {};
      const type = (meta as { insight_type?: unknown }).insight_type;
      const typeKey = typeof type === 'string' ? type : 'unknown';
      byInsightType[typeKey] ??= { acks: 0, dismisses: 0 };

      if (ACK_TYPES.has(row.interaction_type)) {
        acks++;
        byInsightType[typeKey].acks++;
      } else if (DISMISS_TYPES.has(row.interaction_type)) {
        dismisses++;
        byInsightType[typeKey].dismisses++;
      }
    }

    return {
      totalInteractions: total,
      acknowledgmentRate: total > 0 ? acks / total : 0,
      dismissalRate: total > 0 ? dismisses / total : 0,
      lastInteractionAt: rows[0]?.timestamp ?? null,
      byInsightType,
    };
  }

  /**
   * Legacy API: a coarse learned-preferences object. Derived from the event
   * profile — no writes happen inside the getter.
   */
  async getLearnedPreferences(): Promise<LearnedPreferences> {
    const profile = await this.loadBehavior();
    const preferred = Object.entries(profile.byInsightType)
      .filter(([, counts]) => counts.acks > counts.dismisses)
      .map(([type]) => type);

    const alertFrequency: LearnedPreferences['alertFrequency'] =
      profile.dismissalRate > 0.5 ? 'low' : profile.acknowledgmentRate > 0.5 ? 'high' : 'medium';

    return {
      preferredInsightTypes: preferred,
      preferredMetrics: [],
      alertFrequency,
      detailLevel: 'balanced',
    };
  }

  /**
   * Legacy API: learned content preferences. Derived from the event profile.
   */
  async getContentPreferences(): Promise<ContentPreferences> {
    const profile = await this.loadBehavior();
    const verbosity: ContentPreferences['verbosity'] =
      profile.totalInteractions > 50 ? 'detailed' : 'balanced';
    return {
      verbosity,
      focusAreas: Object.keys(profile.byInsightType).filter(
        (t) => (profile.byInsightType[t]?.acks ?? 0) > 0,
      ),
    };
  }

  /**
   * Legacy API: a default threshold is returned unchanged for now; the
   * event-log model does not yet store learned numeric thresholds. Callers
   * requiring feedback-driven thresholds should use the dedicated
   * `CoachPhilosophy` table instead.
   */
  async getPersonalizedThreshold(
    _metric: string,
    defaultThreshold: number,
  ): Promise<number> {
    return defaultThreshold;
  }

  /**
   * Legacy API: we no longer materialize a single `LearnedBehavior` row, but
   * older callers sometimes inspect the shape. Keep the method returning a
   * zeroed object-shape derived from the aggregate to avoid silent breakage.
   */
  async loadLearnedBehavior(): Promise<LearnedBehavior> {
    const profile = await this.loadBehavior();
    return {
      id: '',
      entityId: this.entityId,
      entityType: this.entityType,
      interactions: {
        views: 0,
        clicks: 0,
        dismissals: Math.round(profile.dismissalRate * profile.totalInteractions),
        actions: Math.round(profile.acknowledgmentRate * profile.totalInteractions),
      },
      preferences: await this.getLearnedPreferences(),
      learnedThresholds: {},
      engagementPatterns: [],
      contentPreferences: await this.getContentPreferences(),
      lastInteractionAt: profile.lastInteractionAt ?? undefined,
      interactionCount: profile.totalInteractions,
      engagementScore: profile.acknowledgmentRate,
    };
  }
}
