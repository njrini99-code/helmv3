// =============================================================================
// src/lib/baseball/read-models/practice-effectiveness.ts
//
// Packet: practice-effectiveness (BaseballHelm CoachHelm Engine)
//
// The Practice Effectiveness read model — the staff-facing "is practice working?"
// feed for the dashboard, and the source for the Decision Room + Practice
// Intelligence integrations. Composes the persisted reviews into:
//
//   1. reviews     — every effectiveness review for the team, newest first, each
//                    carrying its honest direction + confidence tier + source
//                    refs + confounders (NEVER a fabricated "high").
//   2. focusRollup — per-focus-area aggregate: measured return, highest-return
//                    stations, and "no evidence of transfer" stations (V7
//                    dashboard charts), computed via the pure engine roll-up.
//   3. summary     — headline counts for the stat strip (measured / too-early /
//                    insufficient / not-tracked) so the surface is honest at a
//                    glance about how much it can actually say.
//
// STAFF ONLY: effectiveness reviews blend game/scrimmage/practice scopes and
// carry staff confounders, so this is a coaching surface. The read model resolves
// the viewer server-side and returns an authorized:false envelope (NOT an error,
// NOT partial data) when the current user is not staff with can_manage_practice.
// RLS backs every query; this is the in-process gate + honest envelope on top.
//
// 'server-only' + plain async functions (NOT 'use server') so server components
// and other read models (Decision Room) can import it.
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { hasBaseballCapability } from '@/lib/baseball/capabilities';
import { getBaseballMetricLabel } from '@/lib/coachhelm/baseball/metrics/registry';
import {
  rollupByFocusArea,
  type EffectivenessReview,
  type FocusAreaRollup,
} from '@/lib/coachhelm/baseball/effectiveness/engine';
import type {
  BaseballEffectivenessReviewRow,
  BaseballEffectivenessReviewWithContext,
  EffectivenessConfounder,
  EffectivenessRecommendedAction,
} from '@/lib/types/baseball-practice-effectiveness';
import type { BaseballInsightSourceRef } from '@/lib/types/baseball-coachhelm';

// -----------------------------------------------------------------------------
// View shapes (serializable; client components import these).
// -----------------------------------------------------------------------------

/** One review shaped for the UI (jsonb columns parsed to typed app shapes). */
export interface EffectivenessReviewView extends BaseballEffectivenessReviewWithContext {
  /** Parsed confounders (jsonb -> typed). */
  confoundersParsed: EffectivenessConfounder[];
  /** Parsed recommended action (jsonb -> typed) or null. */
  recommendedActionParsed: EffectivenessRecommendedAction | null;
  /** Parsed source refs (jsonb -> typed). */
  sourceRefsParsed: BaseballInsightSourceRef[];
  /** Human label for the measured metric (registry), or the focus area. */
  metricLabel: string;
}

/** A focus-area roll-up shaped for the dashboard charts. */
export interface EffectivenessFocusRollupView extends FocusAreaRollup {
  metricLabel: string;
}

export interface EffectivenessSummary {
  totalReviews: number;
  /** Reviews with a sample-backed association (correlated_not_proven). */
  measured: number;
  improved: number;
  worse: number;
  stable: number;
  tooEarly: number;
  insufficient: number;
  notTracked: number;
  /** Open (disposition='new') reviews. */
  open: number;
}

export type EffectivenessDashboardData =
  | { authorized: false }
  | {
      authorized: true;
      reviews: EffectivenessReviewView[];
      focusRollup: EffectivenessFocusRollupView[];
      summary: EffectivenessSummary;
    };

// -----------------------------------------------------------------------------
// jsonb parsing helpers (honest: malformed jsonb -> empty, never a throw).
// -----------------------------------------------------------------------------

function parseConfounders(raw: unknown): EffectivenessConfounder[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is EffectivenessConfounder =>
      !!c && typeof c === 'object' && typeof (c as { code?: unknown }).code === 'string',
  );
}

function parseAction(raw: unknown): EffectivenessRecommendedAction | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const a = raw as Partial<EffectivenessRecommendedAction>;
  if (typeof a.label !== 'string' || typeof a.type !== 'string') return null;
  return a as EffectivenessRecommendedAction;
}

function parseSourceRefs(raw: unknown): BaseballInsightSourceRef[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is BaseballInsightSourceRef =>
      !!r && typeof r === 'object' && typeof (r as { table?: unknown }).table === 'string',
  );
}

/** Map a persisted review ROW back into the pure-engine review shape for roll-up. */
function rowToEngineReview(row: BaseballEffectivenessReviewRow): EffectivenessReview {
  return {
    teamId: row.team_id,
    practiceId: row.practice_id,
    objectiveId: row.objective_id,
    focusArea: row.focus_area,
    metricId: row.metric_id,
    playerIds: row.player_ids ?? [],
    linkedSignalIds: row.linked_signal_ids ?? [],
    metricBefore: row.metric_before,
    metricAfter: row.metric_after,
    sampleBefore: row.sample_before,
    sampleAfter: row.sample_after,
    windowBeforeDays: row.window_before_days,
    windowAfterDays: row.window_after_days,
    direction: row.direction,
    afterScope: row.after_scope,
    confidence: row.confidence,
    confidenceTier: row.confidence_tier,
    confounders: parseConfounders(row.confounders),
    conclusion: row.conclusion,
    recommendedNextAction:
      parseAction(row.recommended_next_action) ?? {
        label: 'Keep monitoring',
        follow_up: 'keep_monitoring',
        type: 'note',
        owner_role: 'coach',
      },
    sourceRefs: parseSourceRefs(row.source_refs),
    dedupeKey: row.dedupe_key ?? '',
    generatedBy: row.generated_by ?? '',
  };
}

// -----------------------------------------------------------------------------
// The read.
// -----------------------------------------------------------------------------

export async function getPracticeEffectivenessData(): Promise<EffectivenessDashboardData> {
  const context = await getActiveBaseballContext();
  if (!context) return { authorized: false };

  // Staff gate: effectiveness is coaching intelligence. A player (or a coach
  // without can_manage_practice) gets the honest unauthorized envelope.
  const allowed = await hasBaseballCapability(context.activeTeamId, 'can_manage_practice');
  if (!allowed) return { authorized: false };

  const supabase = await createClient();
  const teamId = context.activeTeamId;

  const { data, error } = await fromUntyped(supabase, 'baseball_practice_effectiveness_reviews')
    .select(
      `
      *,
      practice:baseball_practices(id, title, status)
    `,
    )
    .eq('team_id', teamId)
    .neq('disposition', 'dismissed')
    .order('generated_at', { ascending: false })
    .limit(500);

  if (error) {
    // Honest empty (authorized but no data) rather than leaking the DB error.
    return { authorized: true, reviews: [], focusRollup: [], summary: emptySummary() };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (data ?? []) as any[];

  const reviews: EffectivenessReviewView[] = raw.map((r) => {
    const row = r as BaseballEffectivenessReviewRow & {
      practice?: { id: string; title: string | null; status: string | null } | null;
    };
    const metricLabel = row.metric_id ? getBaseballMetricLabel(row.metric_id) : row.focus_area;
    return {
      ...row,
      practice_title: row.practice?.title ?? null,
      practice_status: row.practice?.status ?? null,
      confoundersParsed: parseConfounders(row.confounders),
      recommendedActionParsed: parseAction(row.recommended_next_action),
      sourceRefsParsed: parseSourceRefs(row.source_refs),
      metricLabel,
    };
  });

  const engineReviews = reviews.map((v) => rowToEngineReview(v));
  const focusRollup: EffectivenessFocusRollupView[] = rollupByFocusArea(engineReviews).map((f) => ({
    ...f,
    metricLabel: f.metricId ? getBaseballMetricLabel(f.metricId) : f.focusArea,
  }));

  const summary: EffectivenessSummary = {
    totalReviews: reviews.length,
    measured: reviews.filter((r) => r.confidence_tier === 'correlated_not_proven').length,
    improved: reviews.filter((r) => r.direction === 'improved').length,
    worse: reviews.filter((r) => r.direction === 'worse').length,
    stable: reviews.filter((r) => r.direction === 'stable').length,
    tooEarly: reviews.filter((r) => r.direction === 'too_early').length,
    insufficient: reviews.filter((r) => r.direction === 'insufficient_sample').length,
    notTracked: reviews.filter((r) => r.direction === 'not_tracked').length,
    open: reviews.filter((r) => r.disposition === 'new').length,
  };

  return { authorized: true, reviews, focusRollup, summary };
}

function emptySummary(): EffectivenessSummary {
  return {
    totalReviews: 0,
    measured: 0,
    improved: 0,
    worse: 0,
    stable: 0,
    tooEarly: 0,
    insufficient: 0,
    notTracked: 0,
    open: 0,
  };
}
