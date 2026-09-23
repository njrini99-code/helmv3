import { scoreInsight, scoreInsightWithCalibration, type CoachWeights } from '@/lib/coachhelm/v3/ranking/score';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import type {
  InsightCategory,
  InsightEvidence,
  InsightMovement,
} from '@/lib/coachhelm/v2/insights/types';

export interface RankableEvidenceInsight {
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
}

/**
 * A2/A6 top-N audit — the minimal raw `golf_coach_insights` row shape any
 * reader needs to produce a {@link RankableEvidenceInsight}, independent of
 * the heavier `EvidenceInsight` (drills, sanitized content) that
 * `insight-delivery.ts`'s 'use server' actions assemble. Exported so a
 * reader outside that file (e.g. a chat tool) can route through the SAME
 * canonical rank -> collapse -> dedupe pipeline without duplicating it, or
 * depending on insight-delivery.ts's module-private mapper.
 */
export interface RawInsightRowForRanking {
  id: string | null;
  player_id: string | null;
  category: string | null;
  insight_type?: string | null;
  title: string | null;
  content: string | null;
  signature: string | null;
  evidence: unknown;
  metadata: unknown;
  lifecycle_state: string | null;
  status: string | null;
  priority: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Maps a raw row to the canonical ranker's input shape, applying the SAME
 * eligibility floor `insight-delivery.ts`'s `mapRowToEvidenceInsight` applies:
 * a row without a numeric `evidence.strokes_impact`/`confidence` or a string
 * `evidence.metric` is invisible to every ranked surface (the feed can't
 * score it either), so it must be invisible here too — otherwise a row the
 * feed would never show could still surface as a chat tool's "leading"
 * insight, breaking cross-surface agreement (A6).
 */
export function mapRowToRankable(row: RawInsightRowForRanking): RankableEvidenceInsight | null {
  if (!row?.id || !row.player_id || !row.title) return null;
  if (!row.evidence || typeof row.evidence !== 'object') return null;
  const evidence = row.evidence as InsightEvidence;
  if (typeof evidence.strokes_impact !== 'number') return null;
  if (typeof evidence.confidence !== 'number') return null;
  if (typeof evidence.metric !== 'string') return null;

  return {
    id: row.id,
    player_id: row.player_id,
    category: (row.category as InsightCategory | null) ?? null,
    insight_type: row.insight_type ?? null,
    title: row.title,
    content: row.content ?? '',
    signature: row.signature ?? null,
    evidence,
    metadata: (row.metadata ?? null) as RankableEvidenceInsight['metadata'],
    lifecycle_state:
      (row.lifecycle_state as RankableEvidenceInsight['lifecycle_state']) ?? 'detected',
    status: (row.status as RankableEvidenceInsight['status']) ?? 'active',
    priority: (row.priority as RankableEvidenceInsight['priority']) ?? 'medium',
    acknowledged_at: row.acknowledged_at ?? null,
    resolved_at: row.resolved_at ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
  };
}

/**
 * Normalize a metric id to a canonical *subject* key so cross-version aliases
 * collapse to one row in dedupe.
 */
function canonicalMetricSubject(metric: string | null | undefined): string {
  if (!metric) return '';
  const m = metric.toLowerCase();
  const v2Par = m.match(/^par_scoring_par(\d)$/);
  if (v2Par) return `scoring_par_${v2Par[1]}`;
  return m;
}

async function feedRankScore(
  insight: RankableEvidenceInsight,
  weights: CoachWeights = {},
  sb?: SupabaseClient<Database>,
  goals: Goal[] = [],
): Promise<number> {
  const rankableInsight = {
    insight_type: insight.insight_type ?? insight.category ?? 'unknown',
    strokes_impact: insight.evidence?.strokes_impact ?? 0,
    confidence: insight.evidence?.confidence ?? 0,
    metric: insight.evidence?.metric,
    category: insight.category ?? undefined,
    priority: insight.priority,
    sample_n: insight.evidence?.sample_n,
  };

  // Use calibrated scoring if database client is available
  if (sb) {
    return scoreInsightWithCalibration(rankableInsight, weights, sb, goals);
  }

  // Fall back to non-calibrated scoring
  return scoreInsight(rankableInsight, weights, goals);
}

/**
 * Sort a mapped insight list by the shared composite, newest-first on ties.
 * If a database client is provided, applies calibration to confidence values.
 */
export async function rankEvidenceInsightsScored<T extends RankableEvidenceInsight>(
  insights: T[],
  weights: CoachWeights = {},
  goals: Goal[] = [],
  sb?: SupabaseClient<Database>,
): Promise<Array<{ insight: T; score: number }>> {
  const scored = await Promise.all(
    insights.map(async (insight) => ({
      insight,
      score: await feedRankScore(insight, weights, sb, goals),
    }))
  );

  return scored
    .sort((a, b) => {
      const diff = b.score - a.score;
      if (diff !== 0) return diff;
      return (b.insight.created_at ?? '').localeCompare(a.insight.created_at ?? '');
    });
}

/**
 * Ranked insights, score discarded — the shape every caller of the ordering
 * wants. Delegates to `rankEvidenceInsightsScored` so there is exactly one
 * ranking implementation.
 */
export async function rankEvidenceInsights<T extends RankableEvidenceInsight>(
  insights: T[],
  weights: CoachWeights = {},
  goals: Goal[] = [],
  sb?: SupabaseClient<Database>,
): Promise<T[]> {
  const scored = await rankEvidenceInsightsScored(insights, weights, goals, sb);
  return scored.map((row) => row.insight);
}

/**
 * Cross-surface dedupe by `(player_id:category:metric-subject)`.
 */
export function dedupeBySubject<T extends RankableEvidenceInsight>(insights: T[]): T[] {
  const seenSignatures = new Set<string>();
  return insights.filter((insight) => {
    const subject = canonicalMetricSubject(insight.evidence?.metric) || insight.title;
    const sig = `${insight.player_id}:${insight.category}:${subject}`;
    if (seenSignatures.has(sig)) return false;
    seenSignatures.add(sig);
    return true;
  });
}

/**
 * Collapse the 3 separate par_scoring rows into one "Scoring by par type" card
 * per player.
 */
export function collapseParScoring<T extends RankableEvidenceInsight>(insights: T[]): T[] {
  const PAR_METRICS = new Set(['scoring_par_3', 'scoring_par_4', 'scoring_par_5']);
  const out: T[] = [];
  const byPlayer = new Map<string, T[]>();
  for (const ins of insights) {
    const m = ins.evidence?.metric ?? '';
    if (PAR_METRICS.has(m)) {
      const arr = byPlayer.get(ins.player_id) ?? [];
      arr.push(ins);
      byPlayer.set(ins.player_id, arr);
    } else {
      out.push(ins);
    }
  }
  for (const [, rows] of byPlayer) {
    const ordered = rows
      .slice()
      .sort((a, b) => parNum(a) - parNum(b));
    const survivor = ordered[0];
    if (!survivor) continue;
    const r1 = (x: unknown) =>
      typeof x === 'number' ? (Math.round(x * 10) / 10).toString() : '-';
    const lines = ordered.map((r) => {
      const par = parNum(r);
      const d = (r.evidence as InsightEvidence & { detail?: Record<string, unknown> })?.detail ?? {};
      const avg = r.evidence?.your_value;
      return (
        `Par ${par}: ${typeof avg === 'number' ? avg.toFixed(2) : '-'} ` +
        `(${r1(d.bogey_rate)}% bogey, ${r1(d.double_plus_rate)}% double+)`
      );
    });
    out.push({
      ...survivor,
      title: 'Scoring by par type',
      content: lines.join(' · '),
    });
  }
  return out;
}

function parNum(ins: RankableEvidenceInsight): number {
  const m = ins.evidence?.metric ?? '';
  const hit = m.match(/scoring_par_(\d)/);
  return hit ? Number(hit[1]) : 99;
}
