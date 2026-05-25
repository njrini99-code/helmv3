/**
 * v3 composite-insight types (W28).
 *
 * Master plan Part IX: synthesis pass after Tier-1 generators detects
 * cross-insight patterns (12 rule library in Part IX.2; 10 implementable
 * after the 3-bucket club model correction).
 *
 * Each rule is a pure-function pair: detect() inspects the player's
 * recent Tier-1 insights and returns a match (or null); compose()
 * synthesizes the composite content from the match. The runner upserts
 * a new golf_coach_insights row keyed on a v3:composite: signature.
 */

import type { InsightCategory, InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

/**
 * Tier-1 insight as the composite layer sees it. Loaded from
 * golf_coach_insights and projected for rule consumption.
 */
export interface EvidenceInsight {
  id: string;
  insight_type: string;
  category: string;
  signature: string;
  player_id: string;
  evidence: InsightEvidence & {
    standing?: {
      metric_id: string;
      player_value: number;
      team_avg: number | null;
      team_n: number;
      team_pct: number | null;
      pga_value: number;
      pga_delta: number | null;
      computed_at: string;
    } | null;
  };
  engine_version: 'v2' | 'v3' | string;
  created_at: string;
}

/**
 * Output of `detect()`. Carries the source insight ids + arbitrary
 * rule-specific signals the compose step will format into prose.
 */
export interface CompositeMatch {
  source_insight_ids: string[];
  /** Rule-specific signals — title fields, magnitudes, helpful context. */
  signals: Record<string, unknown>;
}

/**
 * Output of `compose()`. Mirrors the Tier-1 ComposedContent shape so
 * the same upsert path can persist it.
 */
export interface CompositeContent {
  title: string;
  content: string;
  /** Generator-specific signature stable part. Runner prefixes "v3:composite:<rule_id>:" */
  signature: string;
  evidence: InsightEvidence;
}

/**
 * Rule interface. Each rule file exports one of these as default.
 * Priority controls conflict resolution: 'urgent' wins over 'high'.
 */
export interface CompositeRule {
  id: string;
  name: string;
  priority: 'high' | 'urgent';
  /** Maps to a valid InsightCategory persisted on the upserted row. */
  category: InsightCategory;
  detect: (insights: EvidenceInsight[]) => CompositeMatch | null;
  compose: (match: CompositeMatch) => CompositeContent;
}
