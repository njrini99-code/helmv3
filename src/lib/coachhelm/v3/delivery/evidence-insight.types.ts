/**
 * Canonical delivery shapes for evidence-backed CoachHelm insights.
 *
 * Imported by insight-delivery server actions, theme assembly, and UI
 * components. Keeps lib modules from importing src/app.
 */

import type {
  InsightCategory,
  InsightEvidence,
  InsightMovement,
} from '@/lib/coachhelm/v2/insights/types';

/** A pre-fetched drill chip attached to an insight. */
export interface InsightAttachedDrill {
  id: string;
  slug: string;
  title: string;
  duration_min: number;
  difficulty: string;
}

/** Player-side feedback on an insight row. */
export interface InsightPlayerFeedback {
  rating: 'helpful' | 'not_helpful' | 'dismissed' | 'acknowledged';
  created_at: string;
}

/**
 * Canonical shape consumed by `<InsightCard>`.
 * Downstream surfaces import this type directly — do NOT re-shape in feature code.
 */
export interface EvidenceInsight {
  id: string;
  player_id: string;
  category: InsightCategory | null;
  insight_type?: string | null;
  title: string;
  content: string;
  signature: string | null;
  evidence: InsightEvidence;
  metadata: (Record<string, unknown> & { movement?: InsightMovement }) | null;
  lifecycle_state: 'tentative' | 'detected' | 'matured' | 'addressed' | 'resolved' | 'archived';
  status: 'active' | 'acknowledged' | 'dismissed' | 'resolved';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  acknowledged_at: string | null;
  resolved_at: string | null;
  outcome_status?: 'improved' | 'no_change' | 'worsened' | null;
  outcome_measured_at?: string | null;
  created_at: string;
  updated_at: string;
  player_feedback?: InsightPlayerFeedback | null;
  drills?: InsightAttachedDrill[];
}

export interface GetInsightsForPlayerOptions {
  limit?: number;
  categories?: string[];
  minConfidence?: number;
  window_days?: number;
}

export interface GetInsightsForCoachOptions {
  limit?: number;
  categories?: string[];
  player_id?: string;
  priorities?: Array<'low' | 'medium' | 'high' | 'urgent'>;
}

export type CoachInsightsResult =
  | { ok: true; data: EvidenceInsight[]; total: number; capped: boolean }
  | { ok: false; error: string };
