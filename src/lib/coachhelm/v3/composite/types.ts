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
      /** College/division cohort baseline (null until the cohort RPC lands). */
      level_avg?: number | null;
      level_n?: number;
      level_pct?: number | null;
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
 * Per-player context pre-loaded ONCE by the synthesis runner and
 * passed to every rule's detect(). Carries the raw-data sources that
 * not all rules need to read — hole-sequence rows (for closing-hole
 * fatigue, doubles-after-bogey, front-9 starter) and shot rows
 * filtered by lie (for flyer-lie + short-side scrambling chain).
 *
 * Loaders return empty arrays on failure so rules can safely no-op.
 * Insights-only rules ignore ctx entirely.
 */
export interface CompositeContext {
  hole_scores: HoleScore[];
  short_game_shots: ShortGameShot[];
  flyer_lie_shots: ApproachShotWithLie[];
}

/** One row per (round, hole) the player completed in the window. */
export interface HoleScore {
  round_id: string;
  hole_number: number;
  par: number;
  score: number;
}

/** Pitch/chip from rough or bunker close to the green. */
export interface ShortGameShot {
  round_id: string;
  hole_number: number | null;
  lie_before: string;
  distance_to_hole_before: number; // yards
  distance_to_hole_after: number;
}

/** Approach shot from a flyer-prone lie (light rough). */
export interface ApproachShotWithLie {
  round_id: string;
  hole_number: number | null;
  lie_before: string;
  distance_to_hole_before: number; // yards
  distance_to_hole_after: number;
}

/**
 * Rule interface. Each rule file exports one of these as default.
 * Priority controls conflict resolution: 'urgent' wins over 'high'.
 *
 * detect() optionally receives a CompositeContext — rules that only
 * compose existing insights can ignore it (defaults to empty arrays).
 */
export interface CompositeRule {
  id: string;
  name: string;
  priority: 'high' | 'urgent';
  /** Maps to a valid InsightCategory persisted on the upserted row. */
  category: InsightCategory;
  detect: (insights: EvidenceInsight[], ctx?: CompositeContext) => CompositeMatch | null;
  compose: (match: CompositeMatch) => CompositeContent;
}
